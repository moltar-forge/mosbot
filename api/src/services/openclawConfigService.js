const logger = require('../utils/logger');
const pool = require('../db/pool');
const { gatewayWsRpc } = require('./openclawGatewayClient');
const { recordActivityLogEventSafe } = require('./activityLogService');

function createHttpError(status, message, code, details) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function restoreRedactedPlaceholders({ submittedRaw, currentRaw, userId }) {
  if (!submittedRaw.includes('__OPENCLAW_REDACTED__') || !currentRaw) {
    return submittedRaw;
  }

  try {
    const PLACEHOLDER = '__OPENCLAW_REDACTED__';
    const valuePattern = /:\s*"((?:[^"\\]|\\.)*)"/g;

    const currentValues = [];
    let vm;
    while ((vm = valuePattern.exec(currentRaw)) !== null) {
      currentValues.push(vm[1]);
    }

    const submittedValues = [];
    const submittedPattern = /:\s*"((?:[^"\\]|\\.)*)"/g;
    let sm;
    while ((sm = submittedPattern.exec(submittedRaw)) !== null) {
      submittedValues.push({ value: sm[1] });
    }

    let redactedCount = 0;
    for (let i = 0; i < submittedValues.length; i++) {
      if (submittedValues[i].value === PLACEHOLDER && currentValues[i] !== undefined) {
        redactedCount++;
      }
    }

    if (redactedCount === 0) {
      return submittedRaw;
    }

    let result = submittedRaw;
    let searchFrom = 0;
    for (let i = 0; i < submittedValues.length; i++) {
      if (submittedValues[i].value === PLACEHOLDER && currentValues[i] !== undefined) {
        const pos = result.indexOf(`"${PLACEHOLDER}"`, searchFrom);
        if (pos !== -1) {
          result = result.slice(0, pos) + `"${currentValues[i]}"` + result.slice(pos + PLACEHOLDER.length + 2);
          searchFrom = pos + currentValues[i].length + 2;
        }
      }
    }

    logger.info('Restored redacted placeholders in OpenClaw config before apply', {
      userId,
      restoredCount: redactedCount,
    });

    return result;
  } catch (error) {
    logger.warn('Failed to restore redacted placeholders (non-fatal)', {
      error: error.message,
      userId,
    });
    return submittedRaw;
  }
}

async function getConfig() {
  const result = await gatewayWsRpc('config.get', {});
  return {
    raw: result.raw || result.config || '',
    hash: result.hash || null,
  };
}

async function applyConfig({ userId, userRole, raw, baseHash, note }) {
  if (!raw || typeof raw !== 'string' || raw.trim().length === 0) {
    throw createHttpError(400, 'raw config content is required');
  }
  if (!baseHash || typeof baseHash !== 'string') {
    throw createHttpError(400, 'baseHash is required to prevent concurrent edit conflicts');
  }

  logger.info('Applying OpenClaw config via Gateway RPC', {
    userId,
    userRole,
    note: note || null,
  });

  let currentConfig;
  try {
    currentConfig = await gatewayWsRpc('config.get', {});
  } catch (err) {
    logger.error('Failed to fetch current config before apply', {
      error: err.message,
    });
    throw err;
  }

  const currentHash = currentConfig.hash || null;
  const currentRaw = currentConfig.raw || currentConfig.config || '';

  if (currentHash && baseHash !== currentHash) {
    const conflict = createHttpError(
      409,
      'Config has been modified since you loaded it. Reload the latest version and re-apply your changes.',
      'CONFIG_CONFLICT',
    );
    conflict.data = { raw: currentRaw, hash: currentHash };
    throw conflict;
  }

  const rawToApply = restoreRedactedPlaceholders({ submittedRaw: raw, currentRaw, userId });

  let backupId = null;
  try {
    const insertResult = await pool.query(
      `INSERT INTO openclaw_config_history (actor_user_id, base_hash, note, raw_config, source)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [userId, currentHash || baseHash || null, note || null, currentRaw, 'config_editor'],
    );
    backupId = insertResult.rows?.[0]?.id || null;
    logger.info('OpenClaw config backup snapshot created (DB)', { backupId, userId });
  } catch (backupErr) {
    if (backupErr.code === '42P01') {
      logger.info('Config history table not available yet; skipping backup snapshot', { userId });
    } else {
      logger.warn('Failed to write OpenClaw config backup snapshot (non-fatal)', {
        error: backupErr.message,
        userId,
      });
    }
  }

  let applyResult;
  try {
    applyResult = await gatewayWsRpc('config.apply', {
      raw: rawToApply,
      baseHash: currentHash || baseHash,
      note: note || `Updated via MosBot Dashboard by user ${userId}`,
      restartDelayMs: 2000,
    });
  } catch (applyErr) {
    const isServiceError =
      applyErr.code === 'SERVICE_NOT_CONFIGURED' ||
      applyErr.code === 'SERVICE_UNAVAILABLE' ||
      applyErr.code === 'SERVICE_TIMEOUT' ||
      applyErr.code === 'DEVICE_AUTH_NOT_CONFIGURED' ||
      applyErr.status === 503;

    if (isServiceError) {
      logger.error('OpenClaw gateway unavailable during config.apply', {
        userId,
        error: applyErr.message,
        code: applyErr.code,
      });
      throw applyErr;
    }

    throw createHttpError(400, applyErr.message || 'Config validation failed', 'CONFIG_VALIDATION_FAILED', applyErr.rpcDetails || null);
  }

  try {
    const { reconcileAgentsFromOpenClaw } = require('./agentReconciliationService');
    await reconcileAgentsFromOpenClaw({ trigger: 'config_apply', actorUserId: userId });
  } catch (reconcileError) {
    logger.warn('Agent reconcile after config.apply failed (non-fatal)', {
      userId,
      error: reconcileError.message,
    });
  }

  recordActivityLogEventSafe({
    event_type: 'openclaw_config_updated',
    source: 'workspace',
    title: note ? `OpenClaw config updated: ${note}` : 'OpenClaw config updated',
    description: `User updated openclaw.json via Config Editor${note ? `. Note: ${note}` : ''}`,
    severity: 'warning',
    actor_user_id: userId,
    workspace_path: '/openclaw.json',
    meta: {
      backupId,
      baseHash,
      newHash: applyResult?.hash || null,
      note: note || null,
    },
  });

  if (backupId && applyResult?.hash) {
    try {
      await pool.query('UPDATE openclaw_config_history SET new_hash = $1 WHERE id = $2', [
        applyResult.hash,
        backupId,
      ]);
    } catch (updateErr) {
      logger.warn('Failed to update config history snapshot with new hash', {
        backupId,
        error: updateErr.message,
      });
    }
  }

  return {
    applied: true,
    hash: applyResult?.hash || null,
    backupId,
    backupPath: backupId ? `db:${backupId}` : null,
  };
}

async function listBackups() {
  const result = await pool.query(
    `SELECT id, created_at, note, actor_user_id, base_hash, new_hash,
            octet_length(raw_config) AS size_bytes
     FROM openclaw_config_history
     ORDER BY created_at DESC
     LIMIT 200`,
  );

  return result.rows.map((row) => {
    const createdIso = row.created_at ? new Date(row.created_at).toISOString() : null;
    const safeTimestamp = createdIso ? createdIso.replace(/[:.]/g, '-') : String(row.id);

    return {
      id: row.id,
      path: `db:${row.id}`,
      name: `openclaw-${safeTimestamp}.json5`,
      size: Number(row.size_bytes || 0),
      modified: createdIso,
      created: createdIso,
      note: row.note || null,
      actorUserId: row.actor_user_id || null,
      baseHash: row.base_hash || null,
      newHash: row.new_hash || null,
    };
  });
}

async function readBackup(inputPath) {
  if (!inputPath) {
    throw createHttpError(400, 'path parameter is required');
  }

  const idCandidate = String(inputPath).startsWith('db:')
    ? String(inputPath).slice(3)
    : String(inputPath);

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(idCandidate)) {
    throw createHttpError(
      400,
      'Invalid backup id. Expected db:<uuid> or <uuid>.',
      'INVALID_BACKUP_ID',
    );
  }

  const result = await pool.query(
    `SELECT id, raw_config, created_at, note, actor_user_id, base_hash, new_hash
     FROM openclaw_config_history
     WHERE id = $1
     LIMIT 1`,
    [idCandidate],
  );

  if (result.rows.length === 0) {
    throw createHttpError(404, 'Backup not found', 'BACKUP_NOT_FOUND');
  }

  const row = result.rows[0];
  return {
    path: `db:${row.id}`,
    content: row.raw_config || '',
    encoding: 'utf8',
    created: row.created_at,
    note: row.note || null,
    actorUserId: row.actor_user_id || null,
    baseHash: row.base_hash || null,
    newHash: row.new_hash || null,
  };
}

module.exports = {
  getConfig,
  applyConfig,
  listBackups,
  readBackup,
  createHttpError,
};
