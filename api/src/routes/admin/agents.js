const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../../db/pool');
const logger = require('../../utils/logger');
const { authenticateToken, requireManageUsers } = require('../auth');
const { reconcileAgentsFromOpenClaw } = require('../../services/agentReconciliationService');
const { makeOpenClawRequest } = require('../../services/openclawWorkspaceClient');
const { gatewayWsRpc, sessionsListAllViaWs } = require('../../services/openclawGatewayClient');
const { parseOpenClawConfig } = require('../../utils/configParser');
const { recordActivityLogEventSafe } = require('../../services/activityLogService');

router.use(authenticateToken);
router.use(requireManageUsers);

const AGENT_ID_REGEX = /^[a-z0-9_-]+$/;
const ACTIVE_SESSION_WINDOW_MS = 30 * 60 * 1000;

function parseBooleanParam(value) {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function extractSessionsArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.sessions)) return payload.sessions;
  if (Array.isArray(payload.rows)) return payload.rows;
  if (payload.details && Array.isArray(payload.details.sessions)) return payload.details.sessions;
  return [];
}

function getSessionAgentId(session) {
  const key = String(session?.key || session?.sessionKey || '').trim();
  if (!key) return null;

  if (key === 'main') return 'main';

  const parts = key.split(':');
  if (parts.length >= 2 && parts[0] === 'agent') {
    return parts[1] || null;
  }

  return null;
}

function toUpdatedAtMs(value) {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function isActiveSession(session, nowMs = Date.now()) {
  const status = String(session?.status || '').toLowerCase();
  if (status === 'running' || status === 'active') return true;

  const updatedAtMs = toUpdatedAtMs(
    session?.updatedAt ?? session?.updated_at ?? session?.lastActivity ?? session?.last_activity,
  );

  // If timestamp is missing/invalid, fail closed to avoid accidental destructive deletes.
  if (!updatedAtMs) return true;

  return nowMs - updatedAtMs <= ACTIVE_SESSION_WINDOW_MS;
}

// POST /api/v1/admin/agents/sync
// Reconcile DB agents table with openclaw.json source-of-truth
router.post('/sync', async (req, res, next) => {
  try {
    const result = await reconcileAgentsFromOpenClaw({
      trigger: 'manual',
      actorUserId: req.user.id,
    });

    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function generateApiKey() {
  const random = crypto.randomBytes(24).toString('base64url');
  return `mba_${random}`;
}

// GET /api/v1/admin/agents
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.agent_id, a.name, a.title, a.status, a.reports_to, a.department, a.active,
              a.created_at, a.updated_at,
              COUNT(k.id) FILTER (WHERE k.revoked_at IS NULL) AS active_key_count
       FROM agents a
       LEFT JOIN agent_api_keys k ON k.agent_id = a.agent_id
       GROUP BY a.id
       ORDER BY a.created_at DESC`,
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/agents
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const {
      agentId,
      name,
      title = null,
      status = 'active',
      reportsTo = null,
      department = null,
      meta = null,
    } = body;

    if (!agentId || !name) {
      return res.status(400).json({
        error: { message: 'agentId and name are required', status: 400 },
      });
    }

    if (!AGENT_ID_REGEX.test(agentId)) {
      return res.status(400).json({
        error: {
          message: 'agentId must be a valid slug (lowercase, alphanumeric, hyphens, underscores)',
          status: 400,
        },
      });
    }

    const validStatuses = new Set(['scaffolded', 'active', 'deprecated']);
    if (!validStatuses.has(status)) {
      return res.status(400).json({
        error: { message: 'status must be one of: scaffolded, active, deprecated', status: 400 },
      });
    }

    if (reportsTo && !AGENT_ID_REGEX.test(reportsTo)) {
      return res.status(400).json({
        error: { message: 'reportsTo must be a valid agentId slug', status: 400 },
      });
    }

    if (reportsTo && reportsTo === agentId) {
      return res.status(400).json({
        error: { message: 'reportsTo cannot reference the same agent', status: 400 },
      });
    }

    const result = await pool.query(
      `INSERT INTO agents (agent_id, name, title, status, reports_to, department, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, agent_id, name, title, status, reports_to, department, meta, active, created_at, updated_at`,
      [agentId, name, title, status, reportsTo, department, meta],
    );

    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: { message: 'agentId already exists', status: 409, code: 'AGENT_EXISTS' },
      });
    }

    if (error.code === '23503') {
      return res.status(400).json({
        error: {
          message: 'reportsTo must reference an existing agent_id',
          status: 400,
          code: 'INVALID_REPORTS_TO',
        },
      });
    }

    if (error.code === '23514') {
      return res.status(400).json({
        error: { message: 'Invalid agent field value', status: 400, code: 'INVALID_AGENT_INPUT' },
      });
    }

    next(error);
  }
});

// DELETE /api/v1/admin/agents/:agentId
router.delete('/:agentId', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { agentId } = req.params;
    const force = parseBooleanParam(req.query.force ?? req.body?.force);

    if (!AGENT_ID_REGEX.test(agentId)) {
      return res.status(400).json({
        error: {
          message: 'agentId must be a valid slug (lowercase, alphanumeric, hyphens, underscores)',
          status: 400,
          code: 'INVALID_AGENT_ID',
        },
      });
    }

    if (force === null) {
      return res.status(400).json({
        error: {
          message: 'force must be a boolean value',
          status: 400,
          code: 'INVALID_FORCE_PARAM',
        },
      });
    }

    if (agentId === 'main') {
      return res.status(400).json({
        error: {
          message: 'The main agent cannot be deleted',
          status: 400,
          code: 'MAIN_AGENT_PROTECTED',
        },
      });
    }

    const configData = await makeOpenClawRequest('GET', '/files/content?path=/openclaw.json');
    const openclawConfig = parseOpenClawConfig(configData.content);
    if (!openclawConfig.agents) openclawConfig.agents = {};
    const runtimeAgents = Array.isArray(openclawConfig.agents.list) ? openclawConfig.agents.list : [];
    const runtimeAgentIndex = runtimeAgents.findIndex((agent) => agent?.id === agentId);

    const sessionsPayload = await sessionsListAllViaWs({
      includeGlobal: true,
      includeUnknown: true,
      activeMinutes: 0,
      limit: 0,
      messageLimit: 0,
    });
    const sessions = extractSessionsArray(sessionsPayload);
    const matchingSessions = sessions.filter((session) => getSessionAgentId(session) === agentId);
    const activeSessions = matchingSessions.filter((session) => isActiveSession(session));

    if (activeSessions.length > 0 && !force) {
      return res.status(409).json({
        error: {
          message: `Agent "${agentId}" has active sessions. Retry with force=true to proceed.`,
          status: 409,
          code: 'ACTIVE_SESSIONS_EXIST',
        },
        data: {
          activeSessionsCount: activeSessions.length,
          staleSessionsCount: Math.max(0, matchingSessions.length - activeSessions.length),
          sessionKeys: activeSessions.slice(0, 10).map((s) => s.key || s.sessionKey || s.id).filter(Boolean),
        },
      });
    }

    let runtimeRemoved = false;
    if (runtimeAgentIndex >= 0) {
      const nextAgents = runtimeAgents.filter((agent) => agent?.id !== agentId);
      const hasDefault = nextAgents.some((agent) => agent?.default === true);

      if (nextAgents.length > 0 && !hasDefault) {
        nextAgents[0] = { ...nextAgents[0], default: true };
      }

      openclawConfig.agents.list = nextAgents;
      const openclawContent = JSON.stringify(openclawConfig, null, 2) + '\n';
      await gatewayWsRpc('config.apply', {
        raw: openclawContent,
        note: `Delete agent ${agentId} from runtime config`,
      });
      runtimeRemoved = true;
    }

    await client.query('BEGIN');

    const existingAgent = await client.query(
      'SELECT agent_id, status, active FROM agents WHERE agent_id = $1 LIMIT 1 FOR UPDATE',
      [agentId],
    );

    const clearedReportsToResult = await client.query(
      `UPDATE agents
       SET reports_to = NULL
       WHERE reports_to = $1`,
      [agentId],
    );

    const revokedKeysResult = await client.query(
      `UPDATE agent_api_keys
       SET revoked_at = NOW()
       WHERE agent_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [agentId],
    );

    let removedAssignmentsResult = { rows: [] };
    try {
      removedAssignmentsResult = await client.query(
        `DELETE FROM agent_project_assignments
         WHERE agent_id = $1
         RETURNING project_id`,
        [agentId],
      );
    } catch (assignmentError) {
      if (assignmentError.code !== '42P01') {
        throw assignmentError;
      }
    }

    const softDeleteResult = await client.query(
      `UPDATE agents
       SET status = 'deprecated', active = FALSE, reports_to = NULL
       WHERE agent_id = $1
       RETURNING agent_id, status, active`,
      [agentId],
    );

    await client.query('COMMIT');

    const dbAgentFound = existingAgent.rows.length > 0;
    const revokedKeys = revokedKeysResult.rows.length;
    const removedAssignments = removedAssignmentsResult.rows.length;
    const reportsToCleared = clearedReportsToResult.rowCount || 0;
    const dbSoftDeleted = softDeleteResult.rows.length > 0;

    const alreadyDeleted =
      !runtimeRemoved &&
      !dbAgentFound &&
      revokedKeys === 0 &&
      removedAssignments === 0 &&
      reportsToCleared === 0;

    try {
      await reconcileAgentsFromOpenClaw({
        trigger: 'agent_delete',
        actorUserId: req.user.id,
      });
    } catch (reconcileError) {
      logger.warn('Agent reconcile after delete failed (non-fatal)', {
        agentId,
        error: reconcileError.message,
      });
    }

    recordActivityLogEventSafe({
      event_type: 'agent_deleted',
      source: 'org',
      title: `Agent deleted: ${agentId}`,
      description: `Agent "${agentId}" deleted by ${req.user.role}`,
      severity: 'info',
      actor_user_id: req.user.id,
      agent_id: agentId,
      meta: {
        force,
        alreadyDeleted,
        runtimeRemoved,
        dbSoftDeleted,
        revokedKeys,
        removedAssignments,
        reportsToCleared,
        activeSessionsCount: activeSessions.length,
        staleSessionsCount: Math.max(0, matchingSessions.length - activeSessions.length),
      },
    });

    res.json({
      data: {
        agentId,
        deleted: !alreadyDeleted,
        alreadyDeleted,
        runtimeRemoved,
        dbSoftDeleted,
        revokedKeys,
        removedAssignments,
        reportsToCleared,
        activeSessionsCount: activeSessions.length,
        staleSessionsCount: Math.max(0, matchingSessions.length - activeSessions.length),
      },
    });
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // noop
    }
    next(error);
  } finally {
    client.release();
  }
});

// GET /api/v1/admin/agents/:agentId/keys
router.get('/:agentId/keys', async (req, res, next) => {
  try {
    const { agentId } = req.params;

    const result = await pool.query(
      `SELECT id, agent_id, key_prefix, label, last_used, created_at, revoked_at
       FROM agent_api_keys
       WHERE agent_id = $1
       ORDER BY created_at DESC`,
      [agentId],
    );

    res.json({ data: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/agents/:agentId/keys
// Creates a new API key and returns the plaintext key once.
router.post('/:agentId/keys', async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const { label = null } = req.body || {};

    const agentExists = await pool.query('SELECT agent_id FROM agents WHERE agent_id = $1 LIMIT 1', [agentId]);
    if (agentExists.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Agent not found', status: 404, code: 'AGENT_NOT_FOUND' },
      });
    }

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12);

    const result = await pool.query(
      `INSERT INTO agent_api_keys (agent_id, key_hash, key_prefix, label, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, agent_id, key_prefix, label, created_at`,
      [agentId, keyHash, keyPrefix, label, req.user.id],
    );

    res.status(201).json({
      data: {
        ...result.rows[0],
        apiKey: rawKey,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/admin/agents/:agentId/keys/:keyId/revoke
router.post('/:agentId/keys/:keyId/revoke', async (req, res, next) => {
  try {
    const { agentId, keyId } = req.params;

    const result = await pool.query(
      `UPDATE agent_api_keys
       SET revoked_at = NOW()
       WHERE id = $1 AND agent_id = $2 AND revoked_at IS NULL
       RETURNING id, agent_id, key_prefix, label, last_used, created_at, revoked_at`,
      [keyId, agentId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { message: 'Active key not found', status: 404, code: 'KEY_NOT_FOUND' },
      });
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
