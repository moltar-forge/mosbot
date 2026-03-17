const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs/promises');
const pool = require('../db/pool');
const { requireAdmin, requireManageUsers } = require('./auth');
const {
  makeOpenClawRequest,
  ensureWorkspaceLink,
  deleteWorkspaceLink,
} = require('../services/openclawWorkspaceClient');
const { recordActivityLogEventSafe } = require('../services/activityLogService');
const { parseOpenClawConfig } = require('../utils/configParser');
const { getJwtSecret } = require('../utils/jwt');
const { registerOpenClawWorkspaceRoutes } = require('./openclaw.workspace');
const { registerOpenClawSessionRoutes } = require('./openclaw.sessions');
const { registerOpenClawCronRoutes } = require('./openclaw.cron');
const { registerOpenClawUsageRoutes } = require('./openclaw.usage');
const { registerOpenClawConfigRoutes } = require('./openclaw.config');
const {
  ensureDocsLinkIfMissing,
  ensureProjectLinkIfMissing,
} = require('../services/docsLinkReconciliationService');
const { gatewayWsRpc, invokeTool } = require('../services/openclawGatewayClient');
const { assertIntegrationReady } = require('../services/openclawIntegrationService');

const BUILTIN_OPENCLAW_REMAP_PREFIXES = [
  '/home/node/.openclaw/workspace',
  '~/.openclaw/workspace',
  '/home/node/.openclaw',
  '~/.openclaw',
];
const MAIN_WORKSPACE_REMAP_PREFIXES = new Set([
  '/home/node/.openclaw/workspace',
  '/~/.openclaw/workspace',
]);
const AGENT_ID_INPUT_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const PROJECT_LINK_HEALTH_DEFAULT_LIMIT = 200;
const PROJECT_LINK_HEALTH_MAX_LIMIT = 500;

// Auth middleware - require valid JWT
const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: { message: 'Authorization required', status: 401 },
    });
  }

  const token = authHeader.substring(7);

  let jwtSecret;
  try {
    jwtSecret = getJwtSecret();
  } catch (_err) {
    return res.status(500).json({ error: { message: 'Server configuration error', status: 500 } });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (_err) {
    return res.status(401).json({
      error: { message: 'Invalid or expired token', status: 401 },
    });
  }
};

const requireIntegrationReady = async (req, res, next) => {
  try {
    await assertIntegrationReady();
    next();
  } catch (error) {
    if (error?.code === 'OPENCLAW_PAIRING_REQUIRED') {
      return res.status(error.status || 503).json({
        error: {
          message: error.message,
          status: error.status || 503,
          code: error.code,
          details: error.details,
        },
      });
    }
    return next(error);
  }
};

const requireIntegrationReadyForPrivilegedUser = (req, res, next) => {
  if (!req.user || !['admin', 'owner'].includes(req.user.role)) {
    return next();
  }

  return requireIntegrationReady(req, res, next);
};

function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

function generateApiKey() {
  const random = crypto.randomBytes(24).toString('base64url');
  return `mba_${random}`;
}

const AGENT_ID_REGEX = /^[a-z0-9_-]+$/;
const PROJECT_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidAgentId(agentId) {
  return typeof agentId === 'string' && AGENT_ID_REGEX.test(agentId);
}

function isValidProjectId(projectId) {
  return typeof projectId === 'string' && PROJECT_ID_REGEX.test(projectId);
}

async function getOrCreateSingleAgentApiKey({ agentId, createdByUserId, label }) {
  const activeKeys = await pool.query(
    `SELECT id
     FROM agent_api_keys
     WHERE agent_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC, id DESC`,
    [agentId],
  );

  const activeRows = activeKeys.rows || [];
  const warnings = [];

  if (activeRows.length > 0) {
    if (activeRows.length > 1) {
      const staleIds = activeRows.slice(1).map((row) => row.id).filter(Boolean);
      if (staleIds.length > 0) {
        await pool.query(
          `UPDATE agent_api_keys
           SET revoked_at = NOW()
           WHERE id = ANY($1::uuid[])`,
          [staleIds],
        );
        warnings.push('revoked duplicate active API keys and kept the most recent key');
      }
    }

    return {
      created: false,
      keyId: activeRows[0]?.id || null,
      apiKey: null,
      warnings,
    };
  }

  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12);

  let insertResult;
  try {
    insertResult = await pool.query(
      `INSERT INTO agent_api_keys (agent_id, key_hash, key_prefix, label, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [agentId, keyHash, keyPrefix, label, createdByUserId],
    );
  } catch (insertError) {
    // Concurrency safety: when active-key uniqueness is enforced by DB,
    // another request may have inserted the active key between our read and insert.
    if (insertError.code === '23505') {
      const refreshed = await pool.query(
        `SELECT id
         FROM agent_api_keys
         WHERE agent_id = $1 AND revoked_at IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
        [agentId],
      );
      const keyId = refreshed.rows?.[0]?.id || null;
      if (keyId) {
        return {
          created: false,
          keyId,
          apiKey: null,
          warnings: ['detected concurrent API key provisioning; reusing existing active key'],
        };
      }
    }
    throw insertError;
  }

  return {
    created: true,
    keyId: insertResult.rows?.[0]?.id || null,
    apiKey: rawKey,
    warnings,
  };
}

async function deleteAgentApiKeyById(keyId) {
  if (!keyId) return;
  await pool.query('DELETE FROM agent_api_keys WHERE id = $1', [keyId]);
}

async function revokeAgentApiKeysById(keyIds) {
  if (!Array.isArray(keyIds) || keyIds.length === 0) return;
  const uniqueIds = [...new Set(keyIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;
  await pool.query(
    `UPDATE agent_api_keys
     SET revoked_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [uniqueIds],
  );
}

async function cleanupProvisionedApiKeyArtifacts({
  createdApiKeyId,
  workspaceRoot,
  envWasWritten,
  agentId,
  flow,
}) {
  if (!createdApiKeyId) return;

  try {
    await deleteAgentApiKeyById(createdApiKeyId);
  } catch (cleanupError) {
    logger.warn(`Failed to cleanup ${flow} API key after provisioning failure`, {
      agentId,
      keyId: createdApiKeyId,
      error: cleanupError.message,
    });
  }

  if (!envWasWritten) return;

  try {
    await makeOpenClawRequest('DELETE', `/files?path=${encodeURIComponent(`${workspaceRoot}/mosbot.env`)}`);
  } catch (envCleanupError) {
    logger.warn(`Failed to cleanup ${flow} mosbot.env after provisioning failure`, {
      agentId,
      workspaceRoot,
      error: envCleanupError.message,
    });
  }
}

async function upsertWorkspaceFile(path, content, encoding = 'utf8') {
  try {
    return await makeOpenClawRequest('PUT', '/files', { path, content, encoding });
  } catch (error) {
    if (error?.status === 404) {
      return makeOpenClawRequest('POST', '/files', { path, content, encoding });
    }
    throw error;
  }
}

async function workspaceFileExists(filePath) {
  const normalizedFilePath = normalizeAndValidateWorkspacePath(filePath);
  const parentPath = path.posix.dirname(normalizedFilePath);
  const fileName = path.posix.basename(normalizedFilePath);

  try {
    const listing = await makeOpenClawRequest('GET', `/files?path=${encodeURIComponent(parentPath)}`);
    const files = Array.isArray(listing?.files) ? listing.files : [];
    const existsInListing = files.some((entry) => {
      if (!entry) return false;
      if (entry.name === fileName) return true;
      if (typeof entry.path === 'string') {
        try {
          return normalizeAndValidateWorkspacePath(entry.path) === normalizedFilePath;
        } catch (_normalizeErr) {
          return false;
        }
      }
      return false;
    });

    if (existsInListing) {
      return true;
    }
  } catch (error) {
    if (error?.status === 404) {
      return false;
    }

    // Fall back to content read for compatibility with older workspace service behavior.
    if (error?.status && ![400, 405, 422].includes(error.status)) {
      throw error;
    }
  }

  try {
    await makeOpenClawRequest('GET', `/files/content?path=${encodeURIComponent(normalizedFilePath)}`);
    return true;
  } catch (error) {
    if (error?.status === 404) {
      return false;
    }
    throw error;
  }
}

async function rotateSingleAgentApiKey({ agentId, createdByUserId, label }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const activeKeys = await client.query(
      `SELECT id
       FROM agent_api_keys
       WHERE agent_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC, id DESC`,
      [agentId],
    );

    const activeRows = activeKeys.rows || [];
    const activeIds = activeRows.map((row) => row.id).filter(Boolean);
    const warnings = [];

    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12);

    const insertResult = await client.query(
      `INSERT INTO agent_api_keys (agent_id, key_hash, key_prefix, label, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [agentId, keyHash, keyPrefix, label, createdByUserId],
    );

    await client.query('COMMIT');

    if (activeIds.length > 0) {
      warnings.push(
        'created replacement API key to restore missing mosbot.env; revoking previous keys after provisioning',
      );
    }

    return {
      created: true,
      keyId: insertResult.rows?.[0]?.id || null,
      apiKey: rawKey,
      warnings,
      previousActiveKeyIds: activeIds,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('Failed to rollback agent API key rotation transaction', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}

function getMosbotApiBaseUrl(_req) {
  const explicit = process.env.MOSBOT_API_URL || null;
  if (explicit) return explicit.replace(/\/$/, '');

  // Safe server-side fallback when explicit MOSBOT_API_URL is not configured.
  // Never derive from request headers (host/x-forwarded-*) to avoid host-header poisoning.
  const corsOrigin = config.corsOrigin || null;
  if (corsOrigin) {
    return `${String(corsOrigin).replace(/\/$/, '')}/api/v1`;
  }

  throw new Error('MOSBOT_API_URL (or CORS_ORIGIN fallback) is not configured');
}

function buildAgentToolkitFiles(workspaceRoot) {
  const mosbotAuthScript = `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="\${MOSBOT_ENV_FILE:-\${PWD}/mosbot.env}"
CACHE_FILE="\${MOSBOT_TOKEN_CACHE:-\${HOME}/.mosbot-token}"

if [[ ! -f "\${ENV_FILE}" ]]; then
  echo "mosbot-auth: env file not found at \${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "\${ENV_FILE}"
set +a

if [[ -z "\${MOSBOT_API_URL:-}" ]]; then
  echo "mosbot-auth: MOSBOT_API_URL missing in \${ENV_FILE}" >&2
  exit 1
fi

if [[ -z "\${MOSBOT_API_KEY:-}" ]]; then
  echo "mosbot-auth: MOSBOT_API_KEY missing in \${ENV_FILE}" >&2
  exit 1
fi

printf '%s\n' "\${MOSBOT_API_KEY}" > "\${CACHE_FILE}"
chmod 600 "\${CACHE_FILE}" 2>/dev/null || true
printf '%s\n' "\${MOSBOT_API_KEY}"
`;

  const mosbotTaskScript = `#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="\${MOSBOT_ENV_FILE:-\${PWD}/mosbot.env}"

if [[ ! -f "\${ENV_FILE}" ]]; then
  echo "mosbot-task: env file not found at \${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "\${ENV_FILE}"
set +a

if [[ -z "\${MOSBOT_API_URL:-}" ]]; then
  echo "mosbot-task: MOSBOT_API_URL missing in \${ENV_FILE}" >&2
  exit 1
fi

TOKEN="$(bash "\${SCRIPT_DIR}/mosbot-auth")"
AUTH_HEADER="Authorization: Bearer \${TOKEN}"

usage() {
  cat <<'USAGE'
Usage: mosbot-task <command> [args]

Commands:
  list [--status "TO DO"]
  create "Title" [--summary "..."] [--status "PLANNING"] [--priority "Medium"] [--type "task"] [--tags "tag1,tag2"]
  update <task-id> [--status "IN PROGRESS"] [--priority "High"] [--title "..."] [--summary "..."]
  comment <task-id> "comment text"
  get <task-id>
USAGE
}

cmd="\${1:-}"
if [[ -z "\${cmd}" ]]; then
  usage
  exit 1
fi
shift || true

case "\${cmd}" in
  list)
    status=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --status) status="$2"; shift 2 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
      esac
    done

    if [[ -n "\${status}" ]]; then
      curl -sG "\${MOSBOT_API_URL}/tasks" \
        -H "\${AUTH_HEADER}" \
        --data-urlencode "status=\${status}"
    else
      curl -s "\${MOSBOT_API_URL}/tasks" -H "\${AUTH_HEADER}"
    fi
    ;;

  create)
    title="\${1:-}"
    if [[ -z "\${title}" ]]; then
      echo "create requires a title" >&2
      exit 1
    fi
    shift || true

    summary=""
    status="PLANNING"
    priority=""
    type="task"
    tags=""

    while [[ $# -gt 0 ]]; do
      case "$1" in
        --summary) summary="$2"; shift 2 ;;
        --status) status="$2"; shift 2 ;;
        --priority) priority="$2"; shift 2 ;;
        --type) type="$2"; shift 2 ;;
        --tags) tags="$2"; shift 2 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
      esac
    done

    payload=$(python3 -c 'import json,sys; title,summary,status,priority,typ,tags=sys.argv[1:]; p={"title":title,"status":status,"type":typ};if summary: p["summary"]=summary;if priority: p["priority"]=priority;if tags: p["tags"]=[t.strip() for t in tags.split(",") if t.strip()];print(json.dumps(p))' "\${title}" "\${summary}" "\${status}" "\${priority}" "\${type}" "\${tags}")

    curl -s -X POST "\${MOSBOT_API_URL}/tasks" \
      -H "\${AUTH_HEADER}" \
      -H "Content-Type: application/json" \
      -d "\${payload}"
    ;;

  update)
    task_id="\${1:-}"
    if [[ -z "\${task_id}" ]]; then
      echo "update requires a task id" >&2
      exit 1
    fi
    shift || true

    payload="{}"
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --status) payload=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); d["status"]=sys.argv[2]; print(json.dumps(d))' "\${payload}" "$2"); shift 2 ;;
        --priority) payload=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); d["priority"]=sys.argv[2]; print(json.dumps(d))' "\${payload}" "$2"); shift 2 ;;
        --title) payload=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); d["title"]=sys.argv[2]; print(json.dumps(d))' "\${payload}" "$2"); shift 2 ;;
        --summary) payload=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); d["summary"]=sys.argv[2]; print(json.dumps(d))' "\${payload}" "$2"); shift 2 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
      esac
    done

    curl -s -X PATCH "\${MOSBOT_API_URL}/tasks/\${task_id}" \
      -H "\${AUTH_HEADER}" \
      -H "Content-Type: application/json" \
      -d "\${payload}"
    ;;

  comment)
    task_id="\${1:-}"
    shift || true
    body="\${*:-}"
    if [[ -z "\${task_id}" || -z "\${body}" ]]; then
      echo "comment requires: <task-id> <body>" >&2
      exit 1
    fi

    body_json=$(python3 -c 'import json,sys; print(json.dumps({"body":sys.argv[1]}))' "\${body}")
    curl -s -X POST "\${MOSBOT_API_URL}/tasks/\${task_id}/comments" \
      -H "\${AUTH_HEADER}" \
      -H "Content-Type: application/json" \
      -d "\${body_json}"
    ;;

  get)
    task_id="\${1:-}"
    if [[ -z "\${task_id}" ]]; then
      echo "get requires a task id" >&2
      exit 1
    fi
    curl -s "\${MOSBOT_API_URL}/tasks/\${task_id}" -H "\${AUTH_HEADER}"
    ;;

  *)
    usage
    exit 1
    ;;
esac
`;

  const integrationDoc = `# MosBot Toolkit (Workspace Local)

This toolkit is generated into each agent workspace at \`./tools\`.

## Files

- \`./tools/mosbot-auth\` - emits a usable API token (currently API key pass-through)
- \`./tools/mosbot-task\` - task board helper CLI
- \`./tools/INTEGRATION.md\` - this guide

## Agent setup expectations

1. Ensure \`mosbot.env\` exists in your workspace root.
2. Export \`MOSBOT_ENV_FILE\` if your env file is in a non-default path.
3. Use helper scripts directly (provisioned with executable permissions):

\`\`\`bash
./tools/mosbot-task list --status "TO DO"
./tools/mosbot-task create "Example task" --priority "Medium"
./tools/mosbot-task update <task-id> --status "IN PROGRESS"
./tools/mosbot-task comment <task-id> "Progress note"
\`\`\`
`;

  const toolsDoc = `# TOOLS.md

Local workspace notes for this agent.

## MosBot Toolkit

- \`./tools/mosbot-auth\`: Reads \`mosbot.env\` and returns a usable bearer token.
- \`./tools/mosbot-task\`: Minimal task board CLI wrapper around \`/api/v1/tasks\` endpoints.
- Scripts are provisioned with \`+x\`, so run directly: \`./tools/mosbot-task ...\`.

Default env file path: \`$PWD/mosbot.env\`.
Override with: \`export MOSBOT_ENV_FILE=/path/to/mosbot.env\`.
`;

  return [
    { path: `${workspaceRoot}/tools/mosbot-auth`, content: mosbotAuthScript },
    { path: `${workspaceRoot}/tools/mosbot-task`, content: mosbotTaskScript },
    { path: `${workspaceRoot}/tools/INTEGRATION.md`, content: integrationDoc },
    { path: `${workspaceRoot}/TOOLS.md`, content: toolsDoc },
  ];
}

async function ensureToolkitExecutableBits(workspaceRoot) {
  const executablePaths = [`${workspaceRoot}/tools/mosbot-auth`, `${workspaceRoot}/tools/mosbot-task`];

  for (const scriptPath of executablePaths) {
    try {
      await fs.chmod(scriptPath, 0o755);
    } catch (error) {
      logger.warn('Failed to set executable bit on toolkit script', {
        path: scriptPath,
        error: error.message,
      });
    }
  }
}

async function writeAgentToolkit(workspaceRoot) {
  const files = buildAgentToolkitFiles(workspaceRoot);
  for (const file of files) {
    await upsertWorkspaceFile(file.path, file.content);
  }

  await ensureToolkitExecutableBits(workspaceRoot);
}

function buildAgentBootstrapContent(agentData = {}) {
  const flow = agentData.flow === 're-bootstrap' ? 're-bootstrap' : 'create';
  const introLine =
    flow === 're-bootstrap'
      ? 'You are an existing agent workspace running a re-bootstrap. Complete the checklist below before taking new work.'
      : 'You are a newly created agent workspace. Complete the setup below before taking work.';
  const profileHeading =
    flow === 're-bootstrap' ? 'Agent profile (re-bootstrap snapshot)' : 'Agent profile (create snapshot)';

  const profile = {
    id: agentData.id || '',
    displayName: agentData.displayName || '',
    title: agentData.title || '',
    description: agentData.description || '',
    reportsTo: agentData.reportsTo || '',
    identityName: agentData.identityName || '',
    identityTheme: agentData.identityTheme || '',
    identityEmoji: agentData.identityEmoji || '',
    modelPrimary: agentData.modelPrimary || '',
    modelFallback1: agentData.modelFallback1 || '',
    modelFallback2: agentData.modelFallback2 || '',
    heartbeatEnabled: agentData.heartbeatEnabled === true,
    heartbeatEvery: agentData.heartbeatEvery || '',
    heartbeatModel: agentData.heartbeatModel || '',
  };

  const projectOnboarding = {
    hasAssignedProject: agentData?.projectOnboarding?.hasAssignedProject === true,
    checkedAt: agentData?.projectOnboarding?.checkedAt || null,
    projects: Array.isArray(agentData?.projectOnboarding?.projects)
      ? agentData.projectOnboarding.projects
      : [],
    missingContracts: Array.isArray(agentData?.projectOnboarding?.missingContracts)
      ? agentData.projectOnboarding.missingContracts
      : [],
    unknownContracts: Array.isArray(agentData?.projectOnboarding?.unknownContracts)
      ? agentData.projectOnboarding.unknownContracts
      : [],
    warnings: Array.isArray(agentData?.projectOnboarding?.warnings)
      ? agentData.projectOnboarding.warnings
      : [],
  };

  const projectScopeSection = projectOnboarding.hasAssignedProject
    ? `\n## Project scope snapshot\n\n\`\`\`json\n${JSON.stringify(projectOnboarding, null, 2)}\n\`\`\`\n\nRead assigned project contracts before taking work. If a contract is marked \`missing\` or \`unknown\`, call it out in your first task update and continue with conservative defaults.\n`
    : '';

  const projectChecklistStep = projectOnboarding.hasAssignedProject
    ? '5. Review assigned project context from **Project scope snapshot** and read each available contract before taking work.\n'
    : '';

  const queueStepNumber = projectOnboarding.hasAssignedProject ? 6 : 5;
  const statusStepNumber = projectOnboarding.hasAssignedProject ? 7 : 6;
  const deleteStepNumber = projectOnboarding.hasAssignedProject ? 8 : 7;

  return `# BOOTSTRAP.md

${introLine}

## ${profileHeading}

\`\`\`json
${JSON.stringify(profile, null, 2)}
\`\`\`
${projectScopeSection}
## First-run mission

1. Read \`./tools/INTEGRATION.md\` and \`./TOOLS.md\`.
2. Ensure these root files exist and are meaningful for this agent:
   - \`AGENTS.md\`
   - \`SOUL.md\`
   - \`IDENTITY.md\`
   - \`USER.md\`
   - \`TOOLS.md\` (already seeded; extend with local notes)
3. If any file is missing or generic, create/update it using the profile above:
   - \`IDENTITY.md\`: who you are (name/title/emoji/theme/role)
   - \`SOUL.md\`: behavior, tone, boundaries, work style
   - \`USER.md\`: who you're helping and how to work with them
   - \`AGENTS.md\`: operating rules, workspace conventions, safety reminders
4. Confirm \`mosbot.env\` exists in workspace root.
${projectChecklistStep}${queueStepNumber}. Pull your queue:
   - \`bash ./tools/mosbot-task list --status "TO DO"\`
${statusStepNumber}. If at least one task exists, post a brief status comment on your first task: setup complete + assumptions.
   - If no task exists, explicitly note that and continue.
${deleteStepNumber}. Delete this \`BOOTSTRAP.md\` after setup is complete (even when no tasks exist).

## Guardrails

- Do not invent role details not present in the profile.
- If profile fields are empty, keep defaults conservative and document assumptions.
- Prefer concise, operational docs over long prose.
`;
}

function buildAgentMosbotEnv({ req, agentId, apiKey }) {
  const apiUrl = getMosbotApiBaseUrl(req);
  return [
    `MOSBOT_API_URL=${apiUrl}`,
    `MOSBOT_AGENT_ID=${agentId}`,
    `MOSBOT_API_KEY=${apiKey}`,
    'MOSBOT_ENV_VERSION=1',
  ].join('\n') + '\n';
}

const BOOTSTRAP_AUTO_RUN_MESSAGE = `Read BOOTSTRAP.md from workspace root and execute it now.
Complete every setup task listed in the file.
If no queue task exists, note that and continue.
Delete BOOTSTRAP.md when setup is complete.
Reply with: DONE plus a concise list of files created/updated.`;

async function runBootstrapForNewAgent(agentId) {
  const sessionKey = agentId === 'main' ? 'main' : `agent:${agentId}:main`;

  // Attempt 1: sessions_send (synchronous reply path when available)
  try {
    const result = await invokeTool(
      'sessions_send',
      {
        sessionKey,
        message: BOOTSTRAP_AUTO_RUN_MESSAGE,
        timeoutSeconds: 180,
      },
      {
        // Invoke from operator context; target session is provided in args.sessionKey.
        sessionKey: 'main',
      },
    );

    if (result) {
      if (result.status === 'error') {
        const err = new Error(result.error || 'sessions_send returned error');
        err.code = 'BOOTSTRAP_TRIGGER_ERROR';
        throw err;
      }

      if (result.status === 'timeout') {
        const err = new Error(`sessions_send timed out after ${result.timeoutSeconds || 180}s`);
        err.code = 'BOOTSTRAP_TRIGGER_TIMEOUT';
        throw err;
      }

      return {
        ...result,
        transport: 'sessions_send',
      };
    }
  } catch (sessionsSendError) {
    logger.warn('sessions_send unavailable for bootstrap trigger, falling back to chat.send', {
      agentId,
      sessionKey,
      error: sessionsSendError.message,
      code: sessionsSendError.code,
    });
  }

  // Attempt 2: chat.send via WS RPC (asynchronous fire-and-forget trigger)
  const idempotencyKey = `bootstrap-${agentId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const sendResult = await gatewayWsRpc('chat.send', {
    idempotencyKey,
    sessionKey,
    message: BOOTSTRAP_AUTO_RUN_MESSAGE,
  });

  if (!sendResult) {
    const err = new Error('chat.send returned no result');
    err.code = 'BOOTSTRAP_TRIGGER_UNAVAILABLE';
    throw err;
  }

  if (sendResult.status === 'error') {
    const err = new Error(sendResult.error || 'chat.send returned error');
    err.code = 'BOOTSTRAP_TRIGGER_ERROR';
    throw err;
  }

  return {
    ...sendResult,
    transport: 'chat.send',
  };
}

function normalizeAgentIdForPath(agentId) {
  return String(agentId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-');
}

function normalizeProjectSlug(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^[^a-z0-9]+/, '');
}

function normalizeProjectRootPath(inputPath, slug) {
  const normalizedSlug = normalizeProjectSlug(slug);
  const normalized = normalizeAndValidateWorkspacePath(inputPath || `/projects/${normalizedSlug}`);
  const expected = `/projects/${normalizedSlug}`;

  if (normalized !== expected) {
    const err = new Error('Project rootPath must be exactly /projects/<slug>');
    err.status = 400;
    err.code = 'INVALID_PROJECT_ROOT_PATH';
    throw err;
  }

  return normalized;
}

function normalizeProjectContractPath(inputPath, rootPath) {
  const normalized = normalizeAndValidateWorkspacePath(inputPath || `${rootPath}/agent-contract.md`);
  if (!normalized.startsWith(`${rootPath}/`)) {
    const err = new Error('Project contractPath must be under project rootPath');
    err.status = 400;
    err.code = 'INVALID_PROJECT_CONTRACT_PATH';
    throw err;
  }

  return normalized;
}

async function ensureProjectLink(agentId, projectRootPath) {
  return ensureWorkspaceLink('project', agentId, { targetPath: projectRootPath });
}

async function deleteProjectLink(agentId, projectRootPath) {
  return deleteWorkspaceLink('project', agentId, { targetPath: projectRootPath });
}

async function getAssignedProjectsForAgent(agentId) {
  const result = await pool.query(
    `SELECT p.id, p.slug, p.name, p.root_path, p.contract_path
       FROM agent_project_assignments apa
       JOIN projects p ON p.id = apa.project_id
      WHERE apa.agent_id = $1
        AND p.status = 'active'
      ORDER BY p.slug ASC`,
    [agentId],
  );
  return result.rows || [];
}

async function getAssignedProjectRootPaths(agentId) {
  if (!agentId) return [];
  try {
    const result = await pool.query(
      `SELECT p.root_path
         FROM agent_project_assignments apa
         JOIN projects p ON p.id = apa.project_id
        WHERE apa.agent_id = $1
          AND p.status = 'active'
          AND p.root_path IS NOT NULL
        ORDER BY p.root_path ASC`,
      [agentId],
    );
    return [...new Set((result.rows || []).map((row) => row.root_path).filter(Boolean))];
  } catch (error) {
    if (error.code === '42P01') {
      return [];
    }
    throw error;
  }
}

async function mapWithConcurrency(items, limit, worker) {
  const normalizedLimit = Math.max(1, Number(limit) || 1);
  const queue = [...items];
  const results = [];

  const runners = Array.from({ length: Math.min(normalizedLimit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;
      const result = await worker(item);
      results.push(result);
    }
  });

  await Promise.all(runners);
  return results;
}

async function loadActiveProjectsWithAssignments(projectIdFilter = null) {
  const rowsResult = await pool.query(
    `SELECT p.id, p.slug, p.name, p.root_path, apa.agent_id
       FROM projects p
       LEFT JOIN agent_project_assignments apa ON apa.project_id = p.id
      WHERE p.status = 'active'
        AND ($1::uuid IS NULL OR p.id = $1)
      ORDER BY p.slug ASC, apa.agent_id ASC`,
    [projectIdFilter || null],
  );

  const projectMap = new Map();
  for (const row of rowsResult.rows || []) {
    if (!projectMap.has(row.id)) {
      projectMap.set(row.id, {
        projectId: row.id,
        slug: row.slug,
        name: row.name,
        rootPath: row.root_path,
        assignedAgents: new Set(),
      });
    }
    if (row.agent_id) {
      projectMap.get(row.id).assignedAgents.add(row.agent_id);
    }
  }

  return [...projectMap.values()];
}

function expandProjectAgentTargets(projects, agentIdFilter = '') {
  const targets = [];
  for (const project of projects) {
    const agentIds = new Set(['main', ...project.assignedAgents]);
    for (const agentId of agentIds) {
      if (agentIdFilter && agentId !== agentIdFilter) continue;
      targets.push({
        projectId: project.projectId,
        slug: project.slug,
        rootPath: project.rootPath,
        agentId,
      });
    }
  }
  return targets;
}

function parseProjectLinkHealthLimit(rawLimit) {
  if (rawLimit === undefined || rawLimit === null || rawLimit === '') {
    return { value: PROJECT_LINK_HEALTH_DEFAULT_LIMIT };
  }

  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > PROJECT_LINK_HEALTH_MAX_LIMIT) {
    return {
      error: {
        message: `limit must be an integer between 1 and ${PROJECT_LINK_HEALTH_MAX_LIMIT}`,
        status: 400,
        code: 'INVALID_LIMIT',
      },
    };
  }

  return { value: parsed };
}

function createDefaultProjectOnboarding() {
  return {
    hasAssignedProject: false,
    checkedAt: new Date().toISOString(),
    projects: [],
    missingContracts: [],
    unknownContracts: [],
    warnings: [],
  };
}

function normalizeWorkspaceDirPath(inputPath) {
  const normalized = normalizeAndValidateWorkspacePath(inputPath);
  if (normalized === '/') return normalized;
  return normalized.replace(/\/+$/, '');
}

async function buildAgentProjectOnboardingContext(agentId) {
  const assignedProjects = await getAssignedProjectsForAgent(agentId);
  if (!Array.isArray(assignedProjects) || assignedProjects.length === 0) {
    return createDefaultProjectOnboarding();
  }

  const projectResults = [];

  for (const project of assignedProjects) {
    const rootPathRaw = project?.root_path || null;
    const contractPathRaw = project?.contract_path || null;
    const projectRef = project?.slug || project?.id || 'unknown';

    let normalizedRootPath = null;
    if (rootPathRaw) {
      try {
        normalizedRootPath = normalizeWorkspaceDirPath(rootPathRaw);
      } catch (_normalizeRootError) {
        projectResults.push({
          project: {
            id: project?.id || null,
            slug: project?.slug || null,
            name: project?.name || null,
            rootPath: rootPathRaw,
            contractPath: contractPathRaw,
            contractStatus: 'unknown',
          },
          warnings: [`project ${projectRef} has invalid root path (${rootPathRaw})`],
        });
        continue;
      }
    }

    const projectBase = {
      id: project?.id || null,
      slug: project?.slug || null,
      name: project?.name || null,
      rootPath: normalizedRootPath || rootPathRaw,
    };

    if (!contractPathRaw) {
      projectResults.push({
        project: {
          ...projectBase,
          contractPath: null,
          contractStatus: 'missing',
        },
        warnings: [`project ${projectRef} has no contract path configured`],
      });
      continue;
    }

    let contractPath = null;
    try {
      contractPath = normalizeAndValidateWorkspacePath(contractPathRaw);
    } catch (_normalizeError) {
      projectResults.push({
        project: {
          ...projectBase,
          contractPath: contractPathRaw,
          contractStatus: 'unknown',
        },
        warnings: [`project ${projectRef} has invalid contract path (${contractPathRaw})`],
      });
      continue;
    }

    if (normalizedRootPath) {
      if (contractPath !== normalizedRootPath && !contractPath.startsWith(`${normalizedRootPath}/`)) {
        projectResults.push({
          project: {
            ...projectBase,
            contractPath,
            contractStatus: 'unknown',
          },
          warnings: [`project ${projectRef} contract path is outside project root: ${contractPath}`],
        });
        continue;
      }
    }

    try {
      const exists = await workspaceFileExists(contractPath);
      projectResults.push({
        project: {
          ...projectBase,
          contractPath,
          contractStatus: exists ? 'present' : 'missing',
        },
        warnings: exists ? [] : [`project contract missing: ${contractPath}`],
      });
    } catch (error) {
      logger.warn('Project contract check failed during onboarding context build', {
        agentId,
        projectRef,
        contractPath,
        error: error?.message,
        code: error?.code,
        status: error?.status,
      });
      projectResults.push({
        project: {
          ...projectBase,
          contractPath,
          contractStatus: 'unknown',
        },
        warnings: [`project contract check failed (${projectRef})`],
      });
    }
  }

  const projects = projectResults.map((result) => result.project);
  const warnings = projectResults.flatMap((result) => result.warnings || []);

  return {
    hasAssignedProject: projects.length > 0,
    checkedAt: new Date().toISOString(),
    projects,
    missingContracts: projects
      .filter((project) => project.contractStatus === 'missing')
      .map((project) => ({
        id: project.id,
        slug: project.slug,
        contractPath: project.contractPath,
        contractStatus: project.contractStatus,
      })),
    unknownContracts: projects
      .filter((project) => project.contractStatus === 'unknown')
      .map((project) => ({
        id: project.id,
        slug: project.slug,
        contractPath: project.contractPath,
        contractStatus: project.contractStatus,
      })),
    warnings,
  };
}

function normalizeAndValidateWorkspacePath(inputPath) {
  const raw = typeof inputPath === 'string' && inputPath.trim() ? inputPath.trim() : '/';
  const asPosix = raw.replace(/\\/g, '/');

  // Force absolute-within-workspace paths ("/" is workspace root)
  const prefixed = asPosix.startsWith('/') ? asPosix : `/${asPosix}`;
  const normalized = path.posix.normalize(prefixed);

  // Reject traversal attempts (fail closed)
  if (normalized === '/..' || normalized.startsWith('/../') || normalized.includes('/../')) {
    const err = new Error('Invalid path');
    err.status = 400;
    err.code = 'INVALID_PATH';
    throw err;
  }

  return normalized;
}

function getOpenClawPathRemapPrefixes() {
  const extraPrefixes = String(config.openclaw.pathRemapPrefixes || '')
    .split(',')
    .map((prefix) => prefix.trim())
    .filter(Boolean);

  const combined = [...BUILTIN_OPENCLAW_REMAP_PREFIXES, ...extraPrefixes]
    .map((prefix) => normalizeAndValidateWorkspacePath(prefix))
    .map((prefix) => (prefix === '/' ? prefix : prefix.replace(/\/+$/, '')))
    .filter(Boolean);

  // Most specific prefix wins to avoid accidental partial remaps.
  return [...new Set(combined)].sort((a, b) => b.length - a.length);
}

function remapWorkspacePathPrefixes(workspacePath) {
  const prefixes = getOpenClawPathRemapPrefixes();

  for (const prefix of prefixes) {
    const isMainWorkspacePrefix = MAIN_WORKSPACE_REMAP_PREFIXES.has(prefix);

    if (workspacePath === prefix) {
      if (isMainWorkspacePrefix) {
        return '/workspace';
      }
      return '/';
    }

    if (workspacePath.startsWith(`${prefix}/`)) {
      const remapped = workspacePath.substring(prefix.length);
      if (isMainWorkspacePrefix) {
        return normalizeAndValidateWorkspacePath(`/workspace${remapped}`);
      }
      return normalizeAndValidateWorkspacePath(remapped);
    }
  }

  // Cross-platform fallback: map any absolute ~/.openclaw/workspace* path to virtual workspace paths.
  // Example:
  // - /Users/<user>/.openclaw/workspace            -> /workspace
  // - /Users/<user>/.openclaw/workspace-coding     -> /workspace-coding
  // - /Users/<user>/.openclaw/workspace-coding/foo -> /workspace-coding/foo
  const workspaceMarker = '/.openclaw/workspace';
  const markerIndex = workspacePath.indexOf(workspaceMarker);
  if (markerIndex !== -1) {
    const suffix = workspacePath.substring(markerIndex + workspaceMarker.length);
    if (!suffix) return '/workspace';

    if (suffix.startsWith('-')) {
      return normalizeAndValidateWorkspacePath(`/workspace${suffix}`);
    }

    if (suffix.startsWith('/')) {
      return normalizeAndValidateWorkspacePath(`/workspace${suffix}`);
    }
  }

  return workspacePath;
}

function normalizeRemapAndValidateWorkspacePath(inputPath) {
  const normalizedPath = normalizeAndValidateWorkspacePath(inputPath);
  return remapWorkspacePathPrefixes(normalizedPath);
}

function resolveAgentWorkspacePath(agent) {
  if (typeof agent?.workspace === 'string' && agent.workspace.trim()) {
    try {
      return normalizeRemapAndValidateWorkspacePath(agent.workspace.trim());
    } catch (error) {
      logger.warn('Could not normalize configured agent workspace path', {
        agentId: agent.id || null,
        workspace: agent.workspace,
        error: error.message,
      });
      return agent.workspace.trim();
    }
  }

  if (agent?.default === true || agent?.id === 'main') {
    return '/workspace';
  }

  const agentId = typeof agent?.id === 'string' && agent.id.trim() ? agent.id.trim() : 'agent';
  return `/workspace-${agentId}`;
}

function buildImplicitMainAgent(overrides = {}) {
  return {
    id: 'main',
    name: 'main',
    label: 'main',
    title: null,
    description: 'Default OpenClaw agent workspace',
    icon: '🦞',
    workspace: '/workspace',
    isDefault: true,
    ...overrides,
  };
}

function buildImplicitMainLeadership(overrides = {}) {
  return {
    id: 'main',
    title: 'main',
    label: 'agent:main:main',
    displayName: 'main',
    description: 'Default OpenClaw agent',
    emoji: '🦞',
    status: 'active',
    reportsTo: null,
    model: null,
    ...overrides,
  };
}

let lastAgentReconcileAtMs = 0;
let agentReconcileInFlight = null;

async function reconcileAgentsIfStale({ trigger = 'read', minIntervalMs = 60_000 } = {}) {
  const now = Date.now();
  if (now - lastAgentReconcileAtMs < minIntervalMs) {
    return;
  }

  if (agentReconcileInFlight) {
    await agentReconcileInFlight;
    return;
  }

  agentReconcileInFlight = (async () => {
    try {
      const { reconcileAgentsFromOpenClaw } = require('../services/agentReconciliationService');
      await reconcileAgentsFromOpenClaw({ trigger });
      lastAgentReconcileAtMs = Date.now();
    } finally {
      agentReconcileInFlight = null;
    }
  })();

  await agentReconcileInFlight;
}

/**
 * Validate that a workspace path is allowed for access
 * @param {string} workspacePath - Normalized workspace path
 * @returns {boolean} - True if path is allowed
 */
function isAllowedWorkspacePath(workspacePath) {
  // Allow canonical main workspace virtual path
  if (workspacePath === '/workspace' || workspacePath.startsWith('/workspace/')) return true;

  // Allow system config files
  if (workspacePath === '/openclaw.json') return true;

  // Allow docs and projects directories (moved from /shared/docs and /shared/projects)
  if (workspacePath.startsWith('/docs/') || workspacePath === '/docs') return true;
  if (workspacePath.startsWith('/projects/') || workspacePath === '/projects') return true;
  // Allow other shared directories
  if (workspacePath.startsWith('/shared/scripts/') || workspacePath === '/shared/scripts')
    return true;

  // Allow skills directory (moved from /shared/skills to /skills)
  if (workspacePath.startsWith('/skills/') || workspacePath === '/skills') return true;

  // Allow archive paths (canonical + legacy aliases)
  if (workspacePath === '/_archived_workspace' || workspacePath.startsWith('/_archived_workspace/'))
    return true;
  if (workspacePath === '/_archive' || workspacePath.startsWith('/_archive/')) return true;
  if (
    workspacePath === '/_archived_workspace_main' ||
    workspacePath.startsWith('/_archived_workspace_main/')
  )
    return true;

  // Allow agent workspaces
  if (workspacePath.startsWith('/workspace-') || /^\/workspace-[a-z]+(\/|$)/.test(workspacePath))
    return true;

  return false;
}

function isAllowedAgentWorkspaceProvisionPath(workspacePath) {
  if (workspacePath === '/workspace' || workspacePath.startsWith('/workspace/')) return true;
  if (/^\/workspace-[a-z0-9_-]+(\/.*)?$/.test(workspacePath)) return true;
  return false;
}

registerOpenClawWorkspaceRoutes({
  router,
  requireAuth,
  requireAdmin,
  makeOpenClawRequest,
  normalizeRemapAndValidateWorkspacePath,
  isAllowedWorkspacePath,
  getAssignedProjectRootPaths,
});

// Wizard-first pairing gate: lock OpenClaw-dependent routes until integration is ready.
// Keep auth first so unauthenticated requests still return 401/403 semantics.
router.use(
  ['/projects', '/sessions', '/cron-jobs', '/usage'],
  requireAuth,
  requireIntegrationReadyForPrivilegedUser,
);

// GET /api/v1/openclaw/projects
// List project registry and assignment counts (admin/owner/agent read)
router.get('/projects', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.slug, p.name, p.description, p.root_path, p.contract_path, p.status,
              p.created_at, p.updated_at,
              COUNT(apa.agent_id)::int AS assigned_agents,
              COALESCE(
                ARRAY_AGG(apa.agent_id ORDER BY apa.agent_id) FILTER (WHERE apa.agent_id IS NOT NULL),
                ARRAY[]::text[]
              ) AS assigned_agent_ids
         FROM projects p
         LEFT JOIN agent_project_assignments apa ON apa.project_id = p.id
        GROUP BY p.id
        ORDER BY p.slug ASC`,
    );

    res.json({ data: result.rows || [] });
  } catch (error) {
    if (error.code === '42P01') {
      return res.json({ data: [] });
    }
    next(error);
  }
});

// GET /api/v1/openclaw/projects/link-health
// Inspect current project-link states for main + assigned agents.
router.get('/projects/link-health', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const projectIdFilter = req.query.projectId ? String(req.query.projectId).trim() : '';
    const agentIdFilter = req.query.agentId ? String(req.query.agentId).trim() : '';
    const parsedLimit = parseProjectLinkHealthLimit(req.query.limit);

    if (parsedLimit.error) {
      return res.status(400).json({ error: parsedLimit.error });
    }

    const limit = parsedLimit.value;

    if (projectIdFilter && !isValidProjectId(projectIdFilter)) {
      return res.status(400).json({
        error: { message: 'Invalid projectId format', status: 400, code: 'INVALID_PROJECT_ID' },
      });
    }

    if (agentIdFilter && !AGENT_ID_INPUT_PATTERN.test(agentIdFilter)) {
      return res.status(400).json({
        error: { message: 'Invalid agentId format', status: 400, code: 'INVALID_AGENT_ID' },
      });
    }

    let projects;
    try {
      projects = await loadActiveProjectsWithAssignments(projectIdFilter || null);
    } catch (error) {
      if (error.code === '42P01') {
        return res.json({ data: [] });
      }
      throw error;
    }

    const tasks = expandProjectAgentTargets(projects, agentIdFilter);
    const limitedTasks = tasks.slice(0, limit);
    const checks = await mapWithConcurrency(limitedTasks, 5, async (task) => {
      try {
        const linkState = await makeOpenClawRequest(
          'GET',
          `/links/project/${encodeURIComponent(task.agentId)}?targetPath=${encodeURIComponent(task.rootPath)}`,
        );
        return {
          projectId: task.projectId,
          slug: task.slug,
          rootPath: task.rootPath,
          agentId: task.agentId,
          state: linkState?.state || 'unknown',
          conflict: linkState?.conflict || null,
        };
      } catch (linkError) {
        return {
          projectId: task.projectId,
          slug: task.slug,
          rootPath: task.rootPath,
          agentId: task.agentId,
          state: 'error',
          errorCode: linkError?.code || null,
          status: linkError?.status || null,
        };
      }
    });

    checks.sort((a, b) => {
      const slugCmp = String(a.slug || '').localeCompare(String(b.slug || ''));
      if (slugCmp !== 0) return slugCmp;
      return String(a.agentId || '').localeCompare(String(b.agentId || ''));
    });

    res.json({ data: checks });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/openclaw/projects/link-health/repair
// Reconcile project links for main + assigned agents.
router.post('/projects/link-health/repair', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const projectIdFilter = body.projectId ? String(body.projectId).trim() : '';
    const agentIdFilter = body.agentId ? String(body.agentId).trim() : '';
    const parsedLimit = parseProjectLinkHealthLimit(body.limit);

    if (parsedLimit.error) {
      return res.status(400).json({ error: parsedLimit.error });
    }

    const limit = parsedLimit.value;

    if (projectIdFilter && !isValidProjectId(projectIdFilter)) {
      return res.status(400).json({
        error: { message: 'Invalid projectId format', status: 400, code: 'INVALID_PROJECT_ID' },
      });
    }

    if (agentIdFilter && !AGENT_ID_INPUT_PATTERN.test(agentIdFilter)) {
      return res.status(400).json({
        error: { message: 'Invalid agentId format', status: 400, code: 'INVALID_AGENT_ID' },
      });
    }

    let projects;
    try {
      projects = await loadActiveProjectsWithAssignments(projectIdFilter || null);
    } catch (error) {
      if (error.code === '42P01') {
        return res.json({
          data: {
            attempted: 0,
            repaired: 0,
            unchanged: 0,
            conflicts: 0,
            failed: 0,
            skipped: 0,
            unknown: 0,
            results: [],
          },
        });
      }
      throw error;
    }

    const tasks = expandProjectAgentTargets(projects, agentIdFilter);
    const limitedTasks = tasks.slice(0, limit);
    const results = await mapWithConcurrency(limitedTasks, 5, async (task) => {
      const reconcile = await ensureProjectLinkIfMissing(task.agentId, task.rootPath);
      const action = reconcile?.action || 'unknown';
      return {
        projectId: task.projectId,
        slug: task.slug,
        rootPath: task.rootPath,
        agentId: task.agentId,
        action,
        state: reconcile?.state || null,
        ...(action === 'error'
          ? {
              errorCode: reconcile?.errorCode || 'RECONCILE_FAILED',
              message: 'project link reconciliation failed',
            }
          : {}),
      };
    });

    results.sort((a, b) => {
      const slugCmp = String(a.slug || '').localeCompare(String(b.slug || ''));
      if (slugCmp !== 0) return slugCmp;
      return String(a.agentId || '').localeCompare(String(b.agentId || ''));
    });

    const summary = {
      attempted: results.length,
      repaired: results.filter((item) => item.action === 'repaired' || item.action === 'created').length,
      unchanged: results.filter((item) => item.action === 'unchanged').length,
      conflicts: results.filter((item) => item.action === 'conflict').length,
      failed: results.filter((item) => item.action === 'error').length,
      skipped: results.filter((item) => item.action === 'skipped').length,
      unknown: results.filter((item) => item.action === 'unknown').length,
    };

    res.json({ data: { ...summary, results } });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/openclaw/projects
// Create project registry entry (admin/owner only)
router.post('/projects', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const slug = normalizeProjectSlug(body.slug || body.name);

    if (!slug) {
      return res.status(400).json({
        error: { message: 'slug (or name) is required', status: 400, code: 'PROJECT_SLUG_REQUIRED' },
      });
    }

    const name = String(body.name || slug).trim();
    if (!name) {
      return res.status(400).json({
        error: { message: 'name must not be empty', status: 400, code: 'PROJECT_NAME_REQUIRED' },
      });
    }
    const rootPath = normalizeProjectRootPath(body.rootPath, slug);
    const contractPath = normalizeProjectContractPath(body.contractPath, rootPath);

    const result = await pool.query(
      `INSERT INTO projects (slug, name, description, root_path, contract_path, status, created_by_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, slug, name, description, root_path, contract_path, status, created_at, updated_at`,
      [
        slug,
        name,
        body.description || '',
        rootPath,
        contractPath,
        body.status === 'archived' ? 'archived' : 'active',
        req.user.id,
      ],
    );

    // Only active projects should be scaffolded and linked into workspaces.
    if (result.rows[0]?.status === 'active') {
      try {
        await upsertWorkspaceFile(`${rootPath}/.keep`, '');
        const defaultContract = `# Agent Contract — ${name}\n\n- Branch naming: feat/cc-<scope> | fix/cc-<scope>\n- Handoff must include: changed files, tests+results, risks, assumptions\n- Done: local tests pass; regenerate API types/contracts when touched\n`;
        await upsertWorkspaceFile(contractPath, defaultContract);

        // Main should always have links to all project roots.
        await ensureProjectLink('main', rootPath);
      } catch (workspaceErr) {
        logger.warn('Project root scaffold failed (non-fatal)', {
          slug,
          error: workspaceErr.message,
        });
      }
    }

    res.status(201).json({ data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: { message: 'Project slug already exists', status: 409, code: 'PROJECT_EXISTS' },
      });
    }
    next(error);
  }
});

// PUT /api/v1/openclaw/projects/:projectId
// Update project metadata (admin/owner only)
router.put('/projects/:projectId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const body = req.body || {};

    if (!isValidProjectId(projectId)) {
      return res.status(400).json({
        error: { message: 'Invalid projectId format', status: 400, code: 'INVALID_PROJECT_ID' },
      });
    }

    const currentResult = await pool.query('SELECT * FROM projects WHERE id = $1', [projectId]);
    const current = currentResult.rows[0];
    if (!current) {
      return res.status(404).json({
        error: { message: 'Project not found', status: 404, code: 'PROJECT_NOT_FOUND' },
      });
    }

    const slug = body.slug ? normalizeProjectSlug(body.slug) : current.slug;
    const name = body.name ? String(body.name).trim() : current.name;
    if (body.name !== undefined && !name) {
      return res.status(400).json({
        error: { message: 'name must not be empty', status: 400, code: 'PROJECT_NAME_REQUIRED' },
      });
    }
    const rootPath = normalizeProjectRootPath(body.rootPath || current.root_path, slug);
    const contractPath = body.contractPath
      ? normalizeProjectContractPath(body.contractPath, rootPath)
      : body.rootPath || body.slug
        ? normalizeProjectContractPath(null, rootPath)
        : current.contract_path;

    const result = await pool.query(
      `UPDATE projects
          SET slug = $2,
              name = $3,
              description = $4,
              root_path = $5,
              contract_path = $6,
              status = $7,
              updated_at = NOW()
        WHERE id = $1
      RETURNING id, slug, name, description, root_path, contract_path, status, created_at, updated_at`,
      [
        projectId,
        slug,
        name,
        body.description ?? current.description,
        rootPath,
        contractPath,
        body.status === 'archived' ? 'archived' : body.status === 'active' ? 'active' : current.status,
      ],
    );

    const oldRootPath = current.root_path;
    const projectRootChanged = oldRootPath !== rootPath;
    const oldStatus = current.status;
    const newStatus = result.rows[0]?.status || current.status;
    const archivedNow = newStatus === 'archived';
    const justArchived = oldStatus !== 'archived' && archivedNow;
    const needsAgentAssignments = projectRootChanged || justArchived;

    let assignedAgentIds = [];
    if (needsAgentAssignments) {
      let assignmentRows = { rows: [] };
      try {
        assignmentRows = await pool.query(
          'SELECT agent_id FROM agent_project_assignments WHERE project_id = $1',
          [projectId],
        );
      } catch (assignmentErr) {
        logger.warn('Failed to load project assignments after project root update (non-fatal)', {
          projectId,
          error: assignmentErr.message,
        });
      }

      assignedAgentIds = (assignmentRows.rows || [])
        .map((row) => row.agent_id)
        .filter(Boolean);
    }

    if (justArchived) {
      const pathsToCleanup = [...new Set([oldRootPath, rootPath].filter(Boolean))];
      const agentsToCleanup = ['main', ...assignedAgentIds];

      for (const cleanupPath of pathsToCleanup) {
        for (const targetAgentId of agentsToCleanup) {
          try {
            await deleteProjectLink(targetAgentId, cleanupPath);
          } catch (cleanupErr) {
            logger.warn('Failed to remove project link while archiving project (non-fatal)', {
              projectId,
              targetAgentId,
              cleanupPath,
              error: cleanupErr.message,
            });
          }
        }
      }
    } else if (projectRootChanged) {
      const agentsToReconcile = ['main', ...assignedAgentIds];

      for (const targetAgentId of agentsToReconcile) {
        try {
          await deleteProjectLink(targetAgentId, oldRootPath);
        } catch (cleanupErr) {
          logger.warn('Failed to remove old project link after project root update (non-fatal)', {
            projectId,
            targetAgentId,
            oldRootPath,
            error: cleanupErr.message,
          });
        }
      }

      for (const targetAgentId of agentsToReconcile) {
        try {
          await ensureProjectLink(targetAgentId, rootPath);
        } catch (linkErr) {
          logger.warn('Failed to ensure new project link after project root update (non-fatal)', {
            projectId,
            targetAgentId,
            rootPath,
            error: linkErr.message,
          });
        }
      }
    } else {
      try {
        await ensureProjectLink('main', rootPath);
      } catch (linkErr) {
        logger.warn('Failed to ensure main project link after project update (non-fatal)', {
          projectId,
          rootPath,
          error: linkErr.message,
        });
      }
    }

    res.json({ data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: { message: 'Project slug already exists', status: 409, code: 'PROJECT_EXISTS' },
      });
    }
    next(error);
  }
});

// DELETE /api/v1/openclaw/projects/:projectId
// Delete project registry entry and cleanup project links
router.delete('/projects/:projectId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { projectId } = req.params;

    if (!isValidProjectId(projectId)) {
      return res.status(400).json({
        error: { message: 'Invalid projectId format', status: 400, code: 'INVALID_PROJECT_ID' },
      });
    }

    const projectResult = await pool.query(
      'SELECT id, slug, root_path FROM projects WHERE id = $1',
      [projectId],
    );
    const project = projectResult.rows[0];
    if (!project) {
      return res.status(404).json({
        error: { message: 'Project not found', status: 404, code: 'PROJECT_NOT_FOUND' },
      });
    }

    const assignmentRows = await pool.query(
      'SELECT agent_id FROM agent_project_assignments WHERE project_id = $1',
      [project.id],
    );

    const warnings = [];

    // Remove per-agent project links (best effort)
    for (const row of assignmentRows.rows || []) {
      try {
        await deleteProjectLink(row.agent_id, project.root_path);
      } catch (linkErr) {
        warnings.push(`agent ${row.agent_id} link cleanup failed: ${linkErr.message}`);
      }
    }

    // Remove main project link too (best effort)
    try {
      await deleteProjectLink('main', project.root_path);
    } catch (mainLinkErr) {
      warnings.push(`main link cleanup failed: ${mainLinkErr.message}`);
    }

    await pool.query('DELETE FROM projects WHERE id = $1', [project.id]);

    res.json({
      data: {
        id: project.id,
        slug: project.slug,
        removedAssignments: (assignmentRows.rows || []).length,
        warnings,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/openclaw/projects/:projectId/assign-agent
// Assign one agent to a project and ensure workspace /projects/<slug> symlink
router.post('/projects/:projectId/assign-agent', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { agentId, role } = req.body || {};

    if (!isValidProjectId(projectId)) {
      return res.status(400).json({
        error: { message: 'Invalid projectId format', status: 400, code: 'INVALID_PROJECT_ID' },
      });
    }

    if (!agentId) {
      return res.status(400).json({
        error: { message: 'agentId is required', status: 400, code: 'AGENT_ID_REQUIRED' },
      });
    }

    const normalizedAgentId = String(agentId).trim();
    if (!AGENT_ID_INPUT_PATTERN.test(normalizedAgentId)) {
      return res.status(400).json({
        error: { message: 'Invalid agentId format', status: 400, code: 'INVALID_AGENT_ID' },
      });
    }

    const agentResult = await pool.query('SELECT agent_id FROM agents WHERE agent_id = $1', [
      normalizedAgentId,
    ]);
    if (!agentResult.rows[0]) {
      return res.status(404).json({
        error: { message: 'Agent not found', status: 404, code: 'AGENT_NOT_FOUND' },
      });
    }

    const projectResult = await pool.query(
      'SELECT id, slug, name, root_path, contract_path, status FROM projects WHERE id = $1',
      [projectId],
    );
    const project = projectResult.rows[0];
    if (!project) {
      return res.status(404).json({
        error: { message: 'Project not found', status: 404, code: 'PROJECT_NOT_FOUND' },
      });
    }

    if (project.status !== 'active') {
      return res.status(400).json({
        error: {
          message: 'Cannot assign agent to a non-active project',
          status: 400,
          code: 'PROJECT_NOT_ACTIVE',
        },
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO agent_project_assignments (agent_id, project_id, role, assigned_by_user_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (agent_id, project_id)
         DO UPDATE SET role = EXCLUDED.role,
                       assigned_by_user_id = EXCLUDED.assigned_by_user_id,
                       updated_at = NOW()`,
        [normalizedAgentId, project.id, role || 'contributor', req.user.id],
      );

      await client.query('COMMIT');
    } catch (assignError) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.error('Failed to rollback assign-agent transaction', {
          agentId: normalizedAgentId,
          projectId: project.id,
          error: rollbackErr.message,
        });
      }
      throw assignError;
    } finally {
      client.release();
    }

    try {
      await ensureProjectLinkIfMissing('main', project.root_path);
      await ensureProjectLink(normalizedAgentId, project.root_path);
    } catch (linkErr) {
      // Compensate committed assignment if link setup fails after transaction commit.
      let cleanupFailed = false;
      try {
        await pool.query('DELETE FROM agent_project_assignments WHERE agent_id = $1 AND project_id = $2', [
          normalizedAgentId,
          project.id,
        ]);
      } catch (cleanupErr) {
        cleanupFailed = true;
        logger.error('Failed to cleanup assignment after project link setup failure', {
          agentId: normalizedAgentId,
          projectId: project.id,
          error: cleanupErr.message,
        });
      }

      const status =
        linkErr && typeof linkErr.status === 'number' && linkErr.status >= 400 && linkErr.status <= 599
          ? linkErr.status
          : 500;

      return res.status(status).json({
        error: {
          message: cleanupFailed
            ? `Failed to assign agent to project due to link setup failure, and cleanup also failed: ${linkErr.message}`
            : `Failed to assign agent to project due to link setup failure: ${linkErr.message}`,
          status,
          code: 'PROJECT_LINK_FAILED',
        },
      });
    }

    res.json({
      data: {
        agentId: normalizedAgentId,
        project: {
          id: project.id,
          slug: project.slug,
          name: project.name,
          rootPath: project.root_path,
          contractPath: project.contract_path,
        },
        message: 'Agent assigned to project',
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/openclaw/projects/:projectId/assign-agent/:agentId
// Unassign agent and remove /projects/<slug> symlink for the assignment
router.delete(
  '/projects/:projectId/assign-agent/:agentId',
  requireAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const { projectId, agentId } = req.params;
      const normalizedAgentId = String(agentId || '').trim();

      if (!isValidProjectId(projectId)) {
        return res.status(400).json({
          error: { message: 'Invalid projectId format', status: 400, code: 'INVALID_PROJECT_ID' },
        });
      }
      if (!normalizedAgentId) {
        return res.status(400).json({
          error: { message: 'agentId is required', status: 400, code: 'AGENT_ID_REQUIRED' },
        });
      }
      if (!AGENT_ID_INPUT_PATTERN.test(normalizedAgentId)) {
        return res.status(400).json({
          error: { message: 'Invalid agentId format', status: 400, code: 'INVALID_AGENT_ID' },
        });
      }

      const projectResult = await pool.query(
        'SELECT id, root_path FROM projects WHERE id = $1',
        [projectId],
      );
      const project = projectResult.rows[0];
      if (!project) {
        return res.status(404).json({
          error: { message: 'Project not found', status: 404, code: 'PROJECT_NOT_FOUND' },
        });
      }

      try {
        await deleteProjectLink(normalizedAgentId, project.root_path);
      } catch (linkErr) {
        logger.error('Failed to delete project link before unassign', {
          projectId,
          agentId: normalizedAgentId,
          error: linkErr.message,
        });

        return res.status(500).json({
          error: {
            message: `Failed to remove project link before unassigning agent: ${linkErr.message}`,
            status: 500,
            code: 'PROJECT_LINK_DELETE_FAILED',
          },
        });
      }

      await pool.query('DELETE FROM agent_project_assignments WHERE agent_id = $1 AND project_id = $2', [
        normalizedAgentId,
        project.id,
      ]);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/v1/openclaw/agents
// Get configured agents from OpenClaw config file (auto-discovery)
router.get('/agents', requireAuth, async (req, res, next) => {
  try {
    logger.info('Fetching OpenClaw agents configuration', {
      userId: req.user.id,
    });

    // Keep DB registry close to runtime config even when config is changed outside MosBot.
    try {
      await reconcileAgentsIfStale({ trigger: 'agents_read' });
    } catch (reconcileErr) {
      logger.warn('Agent reconcile on /agents failed (non-fatal)', {
        userId: req.user.id,
        error: reconcileErr.message,
      });
    }

    // Read the OpenClaw config file directly from the workspace service
    // This reads from the running OpenClaw instance at /openclaw.json
    // (copy of config in the workspace directory)
    try {
      const data = await makeOpenClawRequest('GET', '/files/content?path=/openclaw.json');
      const config = parseOpenClawConfig(data.content);

      // Extract agents list and defaults from config
      const agentsList = config?.agents?.list || [];
      const agentsDefaults = config?.agents?.defaults || {};
      const filteredAgents = agentsList;

      // Transform to include workspace path info and full config fields (model, identity, heartbeat).
      // Resolve model: agent-specific config takes priority, then agents.defaults.
      // This ensures agents not in agents.list (e.g. main) still get correct values.
      let agents = filteredAgents.map((agent) => ({
        id: agent.id,
        name: agent.identity?.name || agent.name || agent.id,
        label: agent.identity?.name || agent.name || agent.id,
        title: agent.identity?.title || null,
        description: agent.identity?.theme || `${agent.identity?.name || agent.id} workspace`,
        icon: agent.identity?.emoji || agentsDefaults.identity?.emoji || '🤖',
        workspace: resolveAgentWorkspacePath(agent),
        isDefault: agent.default === true,
        // Full config fields for the edit modal — agent-specific overrides defaults
        model: agent.model?.primary ? agent.model : (agentsDefaults.model || null),
        identity: agent.identity || null,
        heartbeat: agent.heartbeat || null,
      }));

      // OpenClaw always has an implicit "main" agent session, even when it is not explicitly
      // listed in openclaw.json agents.list. Ensure dashboards always see a main entry.
      // Populate main's config from agents.defaults since it has no agents.list entry.
      if (!agents.some((a) => a.id === 'main')) {
        const mainWorkspace = agentsDefaults.workspace
          ? resolveAgentWorkspacePath({ workspace: agentsDefaults.workspace, default: true })
          : '/workspace';
        agents.push(buildImplicitMainAgent({
          isDefault: agents.length === 0,
          icon: agentsDefaults.identity?.emoji || '🦞',
          workspace: mainWorkspace,
          model: agentsDefaults.model || null,
          identity: agentsDefaults.identity || null,
          heartbeat: null,
        }));
      }

      // Enrich agent names + icon/emoji from the canonical agents table metadata.
      try {
        const pool = require('../db/pool');
        const agentIds = agents.map((a) => a.id);
        const agentResult = await pool.query(
          "SELECT agent_id, name, meta->>'emoji' AS emoji FROM agents WHERE agent_id = ANY($1)",
          [agentIds],
        );

        const nameMap = new Map(agentResult.rows.map((r) => [r.agent_id, r.name]).filter(([, v]) => v));
        const emojiMap = new Map(agentResult.rows.map((r) => [r.agent_id, r.emoji]).filter(([, v]) => v));

        agents = agents.map((agent) => {
          const agentName = nameMap.get(agent.id);
          const emoji = emojiMap.get(agent.id);
          return {
            ...agent,
            ...(agentName ? { name: agentName, label: agentName } : {}),
            ...(emoji ? { icon: emoji } : {}),
          };
        });
      } catch (dbErr) {
        logger.warn('Could not enrich agents with DB metadata', {
          error: dbErr.message,
        });
      }

      // Sort so default agent comes first
      agents.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return 0;
      });

      res.json({ data: agents });
    } catch (readError) {
      // If config file can't be read, return empty list
      logger.warn('Could not read OpenClaw config from workspace service', {
        error: readError.message,
        status: readError.status,
      });

      res.json({ data: [] });
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/openclaw/agents/config
// Get agent hierarchy/config from DB metadata + OpenClaw runtime source-of-truth.
router.get('/agents/config', requireAuth, async (req, res, next) => {
  try {
    logger.info('Fetching agents configuration', { userId: req.user.id });

    // Reconcile on read (throttled) to keep DB and runtime config aligned when
    // config changes happen outside MosBot (e.g., OpenClaw UI/CLI edits).
    try {
      await reconcileAgentsIfStale({ trigger: 'agents_config_read' });
    } catch (reconcileErr) {
      logger.warn('Agent reconcile on /agents/config failed (non-fatal)', {
        userId: req.user.id,
        error: reconcileErr.message,
      });
    }

    let openclawConfig = {};
    try {
      const configData = await makeOpenClawRequest('GET', '/files/content?path=/openclaw.json');
      openclawConfig = parseOpenClawConfig(configData.content);
    } catch (readError) {
      logger.warn('Could not read openclaw.json while fetching agents config', {
        error: readError.message,
      });
    }

    const agentsList = openclawConfig?.agents?.list || [];
    const agentsDefaults = openclawConfig?.agents?.defaults || {};

    // Routing default precedence (OpenClaw): explicit default -> first list entry -> main
    const explicitDefault = agentsList.find((a) => a?.default === true)?.id || null;
    const resolvedDefaultId = explicitDefault || agentsList[0]?.id || 'main';

    const discoveredMap = new Map();
    for (const agent of agentsList) {
      discoveredMap.set(agent.id, {
        id: agent.id,
        title: agent.identity?.name || agent.id,
        label: `agent:${agent.id}:main`,
        displayName: agent.identity?.name || agent.id,
        description: agent.identity?.theme || '',
        emoji: agent.identity?.emoji || null,
        status: 'active',
        reportsTo: null,
        isDefault: agent.id === resolvedDefaultId,
        model: agent.model?.primary || agentsDefaults.model?.primary || null,
      });
    }

    if (!discoveredMap.has('main')) {
      discoveredMap.set('main', buildImplicitMainLeadership({
        emoji: agentsDefaults.identity?.emoji || '🦞',
        model: agentsDefaults.model?.primary || null,
        isDefault: resolvedDefaultId === 'main',
      }));
    }

    let dbRows = [];
    try {
      const dbResult = await pool.query(
        `SELECT agent_id, name, title, status, reports_to, meta, active
         FROM agents`,
      );
      dbRows = dbResult.rows || [];
    } catch (dbErr) {
      if (dbErr.code !== '42P01') {
        logger.warn('Failed to read agents table for agents/config', { error: dbErr.message });
      }
    }

    const dbByAgentId = new Map(dbRows.map((r) => [r.agent_id, r]));

    let projectsByAgentId = new Map();
    try {
      const projectRows = await pool.query(
        `SELECT apa.agent_id, p.id AS project_id, p.slug, p.name, p.root_path, p.contract_path
           FROM agent_project_assignments apa
           JOIN projects p ON p.id = apa.project_id
          WHERE p.status = 'active'
          ORDER BY p.slug ASC`,
      );
      for (const row of projectRows.rows || []) {
        if (!projectsByAgentId.has(row.agent_id)) {
          projectsByAgentId.set(row.agent_id, []);
        }
        projectsByAgentId.get(row.agent_id).push({
          id: row.project_id,
          slug: row.slug,
          name: row.name,
          rootPath: row.root_path,
          contractPath: row.contract_path,
        });
      }
    } catch (projectErr) {
      if (projectErr.code !== '42P01') {
        logger.warn('Failed to read project assignments for agents/config', {
          error: projectErr.message,
        });
      }
    }

    const leadership = [];
    for (const [agentId, discovered] of discoveredMap.entries()) {
      const row = dbByAgentId.get(agentId);
      const meta = row?.meta || {};
      leadership.push({
        id: agentId,
        title: row?.title || discovered.title,
        label: meta.label || discovered.label,
        displayName: row?.name || discovered.displayName,
        description: meta.description || discovered.description || '',
        emoji: meta.emoji || discovered.emoji || null,
        status: row?.status || discovered.status,
        reportsTo: row?.reports_to || null,
        isDefault: Boolean(discovered.isDefault),
        model: discovered.model || null,
        projects: projectsByAgentId.get(agentId) || [],
      });
    }

    // Include DB-only active agents not present in discovered OpenClaw list
    // (e.g., metadata rows that still need visibility in management UI).
    for (const row of dbRows) {
      if (!row?.agent_id || discoveredMap.has(row.agent_id)) continue;
      if (row.active === false || row.status === 'deprecated') continue;
      const meta = row.meta || {};
      leadership.push({
        id: row.agent_id,
        title: row.title || row.name || row.agent_id,
        label: meta.label || `agent:${row.agent_id}:main`,
        displayName: row.name || row.agent_id,
        description: meta.description || '',
        emoji: meta.emoji || null,
        status: row.status || 'active',
        reportsTo: row.reports_to || null,
        isDefault: false,
        model: null,
        projects: projectsByAgentId.get(row.agent_id) || [],
      });
    }

    leadership.sort((a, b) => (a.id === 'main' ? -1 : b.id === 'main' ? 1 : 0));

    res.json({
      data: {
        version: 1,
        leadership,
        departments: [],
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/openclaw/agents/config/:agentId
// Update an existing agent's config in DB metadata + openclaw runtime config (admin/owner only)
router.put('/agents/config/:agentId', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { agentId } = req.params;
    const agentData = req.body || {};

    if (req.user.role === 'agent') {
      return res.status(403).json({
        error: {
          message: 'System configuration files can only be modified by admin or owner roles',
          status: 403,
          code: 'INSUFFICIENT_PERMISSIONS',
        },
      });
    }

    if (!agentData.displayName) {
      return res.status(400).json({
        error: { message: 'displayName is required', status: 400 },
      });
    }

    if (agentData.status && agentData.status !== 'active') {
      return res.status(400).json({
        error: {
          message: 'Only status="active" is currently supported (lifecycle statuses are temporarily disabled)',
          status: 400,
          code: 'STATUS_TEMPORARILY_UNSUPPORTED',
        },
      });
    }

    const openclawData = await makeOpenClawRequest('GET', '/files/content?path=/openclaw.json');
    const openclawConfig = parseOpenClawConfig(openclawData.content);

    const openclawAgentsList = openclawConfig.agents?.list || [];
    const existsInOpenClaw = agentId === 'main' || openclawAgentsList.some((a) => a.id === agentId);
    if (!existsInOpenClaw) {
      return res.status(404).json({
        error: {
          message: `Agent "${agentId}" not found in OpenClaw config`,
          status: 404,
          code: 'AGENT_NOT_FOUND',
        },
      });
    }

    const dbStatus = 'active';
    const dbActive = true;

    // Upsert DB metadata (replaces agents DB metadata writes)
    await pool.query(
      `INSERT INTO agents (agent_id, name, title, status, reports_to, meta, active)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (agent_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         title = EXCLUDED.title,
         status = EXCLUDED.status,
         reports_to = EXCLUDED.reports_to,
         meta = COALESCE(agents.meta, '{}'::jsonb) || EXCLUDED.meta,
         active = EXCLUDED.active,
         updated_at = NOW()`,
      [
        agentId,
        agentData.displayName,
        agentData.title || agentData.identityName || agentId,
        dbStatus,
        agentData.reportsTo || null,
        JSON.stringify({
          label: agentData.label || `agent:${agentId}:main`,
          description: agentData.description || '',
          emoji: agentData.identityEmoji || null,
        }),
        dbActive,
      ],
    );

    // Update openclaw runtime config (only when there is an explicit agent entry to mutate)
    {
      const agentIndex = openclawAgentsList.findIndex((a) => a.id === agentId);
      let configDirty = false;

      if (agentIndex >= 0) {
        const existing = openclawAgentsList[agentIndex];
        configDirty = true;

        if (agentData.identityName || agentData.identityTheme || agentData.identityEmoji) {
          existing.identity = {
            ...(existing.identity || {}),
            ...(agentData.identityName && { name: agentData.identityName }),
            ...(agentData.identityTheme !== undefined && { theme: agentData.identityTheme }),
            ...(agentData.identityEmoji && { emoji: agentData.identityEmoji }),
          };
        }

        if (agentData.modelPrimary) {
          existing.model = {
            ...(existing.model || {}),
            primary: agentData.modelPrimary,
          };
          const fallbacks = [agentData.modelFallback1, agentData.modelFallback2].filter(Boolean);
          existing.model.fallbacks = fallbacks.length > 0 ? fallbacks : undefined;
        }

        if (agentData.heartbeatEnabled === true) {
          existing.heartbeat = {
            ...(existing.heartbeat || {}),
            every: agentData.heartbeatEvery || existing.heartbeat?.every || '60m',
            session: existing.heartbeat?.session || 'main',
            target: existing.heartbeat?.target || 'last',
            ackMaxChars: existing.heartbeat?.ackMaxChars || 200,
          };
          if (agentData.heartbeatModel) existing.heartbeat.model = agentData.heartbeatModel;
        } else if (agentData.heartbeatEnabled === false) {
          delete existing.heartbeat;
        }
      }

      if (configDirty) {
        // Apply via gateway config.apply
        const openclawContent = JSON.stringify(openclawConfig, null, 2) + '\n';
        const currentConfig = await gatewayWsRpc('config.get', {});
        await gatewayWsRpc('config.apply', {
          raw: openclawContent,
          baseHash: currentConfig?.hash || null,
          note: `Agent updated via MosBot (${agentId}) by ${req.user.id}`,
          restartDelayMs: 2000,
        });

        await ensureDocsLinkIfMissing(agentId);

        // Keep DB agent registry aligned immediately after runtime config mutation.
        try {
          const { reconcileAgentsFromOpenClaw } = require('../services/agentReconciliationService');
          await reconcileAgentsFromOpenClaw({
            trigger: 'agent_update',
            actorUserId: req.user.id,
          });
        } catch (reconcileError) {
          logger.warn('Agent reconcile after update failed (non-fatal)', {
            agentId,
            error: reconcileError.message,
          });
        }
      }
    }

    recordActivityLogEventSafe({
      event_type: 'agent_updated',
      source: 'agents',
      title: `Agent updated: ${agentId}`,
      description: `Agent config updated for "${agentId}"`,
      severity: 'info',
      actor_user_id: req.user.id,
      agent_id: agentId,
      meta: { agentData },
    });

    res.json({
      data: {
        agentId,
        message: 'Agent updated successfully',
        updatedFiles: ['/openclaw.json', 'database'],
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/openclaw/agents/config
// Create a new agent in DB metadata + openclaw runtime config (admin/owner only)
router.post('/agents/config', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const agentData = req.body || {};

    if (req.user.role === 'agent') {
      return res.status(403).json({
        error: {
          message: 'System configuration files can only be modified by admin or owner roles',
          status: 403,
          code: 'INSUFFICIENT_PERMISSIONS',
        },
      });
    }

    if (!agentData.id || !agentData.displayName) {
      return res.status(400).json({
        error: { message: 'id and displayName are required', status: 400 },
      });
    }

    if (!isValidAgentId(agentData.id)) {
      return res.status(400).json({
        error: {
          message:
            'id must be a valid slug (lowercase letters, numbers, hyphens, underscores)',
          status: 400,
          code: 'INVALID_AGENT_ID',
        },
      });
    }

    if (agentData.status && agentData.status !== 'active') {
      return res.status(400).json({
        error: {
          message: 'Only status="active" is currently supported (lifecycle statuses are temporarily disabled)',
          status: 400,
          code: 'STATUS_TEMPORARILY_UNSUPPORTED',
        },
      });
    }

    const openclawData = await makeOpenClawRequest('GET', '/files/content?path=/openclaw.json');
    const openclawConfig = parseOpenClawConfig(openclawData.content);
    if (!openclawConfig.agents) openclawConfig.agents = {};
    if (!Array.isArray(openclawConfig.agents.list)) openclawConfig.agents.list = [];

    if (openclawConfig.agents.list.some((a) => a.id === agentData.id)) {
      return res.status(409).json({
        error: {
          message: `Agent "${agentData.id}" already exists in OpenClaw config`,
          status: 409,
          code: 'AGENT_EXISTS',
        },
      });
    }

    const dbStatus = 'active';
    const dbActive = true;
    const existingAgentRow = await pool.query('SELECT 1 FROM agents WHERE agent_id = $1 LIMIT 1', [
      agentData.id,
    ]);
    const dbAgentExistedBeforeCreate = (existingAgentRow.rowCount || 0) > 0;
    const cleanupDbAgentRowIfCreated = async (reason) => {
      if (dbAgentExistedBeforeCreate) return;

      try {
        await pool.query('DELETE FROM agents WHERE agent_id = $1', [agentData.id]);
      } catch (dbCleanupError) {
        logger.warn('Failed to cleanup agent DB row after create bootstrap failure', {
          agentId: agentData.id,
          reason,
          error: dbCleanupError.message,
        });
      }
    };

    // Ensure DB agent row exists before API key bootstrap (FK on agent_api_keys.agent_id).
    await pool.query(
      `INSERT INTO agents (agent_id, name, title, status, reports_to, meta, active)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (agent_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         title = EXCLUDED.title,
         status = EXCLUDED.status,
         reports_to = EXCLUDED.reports_to,
         meta = COALESCE(agents.meta, '{}'::jsonb) || EXCLUDED.meta,
         active = EXCLUDED.active,
         updated_at = NOW()`,
      [
        agentData.id,
        agentData.displayName,
        agentData.title || agentData.identityName || agentData.id,
        dbStatus,
        agentData.reportsTo || null,
        JSON.stringify({
          label: agentData.label || `agent:${agentData.id}:main`,
          description: agentData.description || '',
          emoji: agentData.identityEmoji || null,
        }),
        dbActive,
      ],
    );

    // Prepare workspace + toolkit + bootstrap BEFORE mutating OpenClaw agent config.
    // This avoids creating an agent runtime entry without a prepared workspace.
    const setupWarnings = [];

    const safeAgentId = normalizeAgentIdForPath(agentData.id);
    const workspaceRoot = safeAgentId === 'main' ? '/workspace' : `/workspace-${safeAgentId}`;
    req._agentWorkspaceRoot = workspaceRoot;
    req._agentCreateApiKeyProvisioned = false;
    let createdApiKeyId = null;
    let updatedMosbotEnv = false;

    try {
      await writeAgentToolkit(workspaceRoot);
    } catch (workspaceError) {
      await cleanupDbAgentRowIfCreated('toolkit_write_failed');
      logger.error('Workspace bootstrap failed before agent creation', {
        agentId: agentData.id,
        error: workspaceError.message,
      });

      return res.status(500).json({
        error: {
          message: `workspace bootstrap failed before agent creation: ${workspaceError.message}`,
          status: 500,
          code: 'WORKSPACE_BOOTSTRAP_FAILED',
        },
      });
    }

    try {
      const apiKeyResult = await getOrCreateSingleAgentApiKey({
        agentId: agentData.id,
        createdByUserId: req.user.id,
        label: 'bootstrap',
      });

      if (Array.isArray(apiKeyResult?.warnings) && apiKeyResult.warnings.length > 0) {
        setupWarnings.push(...apiKeyResult.warnings);
      }

      if (apiKeyResult?.created && apiKeyResult?.apiKey) {
        createdApiKeyId = apiKeyResult.keyId || null;

        try {
          await upsertWorkspaceFile(
            `${workspaceRoot}/mosbot.env`,
            buildAgentMosbotEnv({ req, agentId: agentData.id, apiKey: apiKeyResult.apiKey }),
          );
          req._agentCreateApiKeyProvisioned = true;
          updatedMosbotEnv = true;
        } catch (envWriteError) {
          await cleanupProvisionedApiKeyArtifacts({
            createdApiKeyId,
            workspaceRoot,
            envWasWritten: updatedMosbotEnv,
            agentId: agentData.id,
            flow: 'bootstrap',
          });
          await cleanupDbAgentRowIfCreated('mosbot_env_write_failed');
          req._agentCreateApiKeyProvisioned = false;

          return res.status(500).json({
            error: {
              message: `workspace bootstrap failed before agent creation: ${envWriteError.message}`,
              status: 500,
              code: 'WORKSPACE_BOOTSTRAP_FAILED',
            },
          });
        }
      }
    } catch (apiKeyError) {
      if (apiKeyError.code === '42P01') {
        setupWarnings.push('agent_api_keys table not found; skipped API key bootstrap');
      } else {
        setupWarnings.push(`agent API key bootstrap failed: ${apiKeyError.message}`);
      }
      logger.warn('Failed to ensure bootstrap API key', {
        agentId: agentData.id,
        error: apiKeyError.message,
        code: apiKeyError.code,
      });
    }

    let projectOnboarding = createDefaultProjectOnboarding();

    try {
      projectOnboarding = await buildAgentProjectOnboardingContext(agentData.id);
    } catch (projectContextError) {
      if (projectContextError?.code === '42P01') {
        setupWarnings.push('project onboarding tables not found; skipped project onboarding context');
      } else {
        setupWarnings.push('project onboarding context failed; see server logs for details');
      }
      logger.warn('Failed to build project onboarding context for bootstrap', {
        agentId: agentData.id,
        error: projectContextError?.message,
        code: projectContextError?.code,
      });
    }

    try {
      await upsertWorkspaceFile(
        `${workspaceRoot}/BOOTSTRAP.md`,
        buildAgentBootstrapContent({ ...agentData, projectOnboarding }),
      );
    } catch (workspaceError) {
      await cleanupProvisionedApiKeyArtifacts({
        createdApiKeyId,
        workspaceRoot,
        envWasWritten: updatedMosbotEnv,
        agentId: agentData.id,
        flow: 'bootstrap',
      });
      await cleanupDbAgentRowIfCreated('bootstrap_file_write_failed');
      req._agentCreateApiKeyProvisioned = false;
      logger.error('Workspace bootstrap failed before agent creation', {
        agentId: agentData.id,
        error: workspaceError.message,
      });

      return res.status(500).json({
        error: {
          message: `workspace bootstrap failed before agent creation: ${workspaceError.message}`,
          status: 500,
          code: 'WORKSPACE_BOOTSTRAP_FAILED',
        },
      });
    }

    {
      const fallbacks = [agentData.modelFallback1, agentData.modelFallback2].filter(Boolean);
      const newAgent = {
        id: agentData.id,
        // Intentionally omit `workspace` to let OpenClaw derive it from CONFIG_ROOT
        // (workspace-<agentId>) and avoid hard-coding absolute host paths.
        identity: {
          name: agentData.identityName || agentData.displayName,
          theme: agentData.identityTheme || agentData.description || '',
          emoji: agentData.identityEmoji || '🤖',
        },
        model: {
          primary: agentData.modelPrimary || 'openrouter/anthropic/claude-sonnet-4.5',
          fallbacks: fallbacks.length > 0 ? fallbacks : undefined,
        },
      };

      if (agentData.heartbeatEnabled) {
        newAgent.heartbeat = {
          every: agentData.heartbeatEvery || '60m',
          session: 'main',
          target: 'last',
          ackMaxChars: 200,
        };
        if (agentData.heartbeatModel) newAgent.heartbeat.model = agentData.heartbeatModel;
      }

      // Guard against default-agent hijack:
      // OpenClaw fallback routing is: agents.list[].default -> first list entry -> main.
      // If list is currently empty (or has no explicit default) and main is not listed,
      // adding a non-main agent would accidentally make it the default. Ensure explicit main default.
      const hasExplicitDefault = openclawConfig.agents.list.some((a) => a?.default === true);
      const hasMainEntry = openclawConfig.agents.list.some((a) => a?.id === 'main');
      if (!hasExplicitDefault && !hasMainEntry && agentData.id !== 'main') {
        openclawConfig.agents.list.unshift({ id: 'main', default: true });
      }

      if (agentData.id === 'main') {
        newAgent.default = true;
      }

      openclawConfig.agents.list.push(newAgent);

      const openclawContent = JSON.stringify(openclawConfig, null, 2) + '\n';
      let configApplied = false;
      try {
        const currentConfig = await gatewayWsRpc('config.get', {});
        await gatewayWsRpc('config.apply', {
          raw: openclawContent,
          baseHash: currentConfig?.hash || null,
          note: `Agent created via MosBot (${agentData.id}) by ${req.user.id}`,
          restartDelayMs: 2000,
        });
        configApplied = true;
      } catch (configApplyError) {
        await cleanupProvisionedApiKeyArtifacts({
          createdApiKeyId,
          workspaceRoot,
          envWasWritten: updatedMosbotEnv,
          agentId: agentData.id,
          flow: 'bootstrap',
        });
        req._agentCreateApiKeyProvisioned = false;

        await cleanupDbAgentRowIfCreated('config_apply_failed');

        logger.warn('Cleaned up bootstrap credentials after config.apply failure', {
          agentId: agentData.id,
          configApplied,
          error: configApplyError.message,
        });
        throw configApplyError;
      }

      await ensureDocsLinkIfMissing(agentData.id);

      // If agent is already project-assigned, ensure /projects/<slug> links exist.
      try {
        const assignedProjects = await getAssignedProjectsForAgent(agentData.id);
        for (const assignedProject of assignedProjects) {
          if (assignedProject?.root_path) {
            await ensureProjectLink(agentData.id, assignedProject.root_path);
          }
        }
      } catch (projectLinkErr) {
        setupWarnings.push(`project link ensure failed: ${projectLinkErr.message}`);
        logger.warn('Failed to ensure project link on agent create (non-fatal)', {
          agentId: agentData.id,
          error: projectLinkErr.message,
        });
      }

      // Keep DB agent registry aligned immediately after runtime config mutation.
      try {
        const { reconcileAgentsFromOpenClaw } = require('../services/agentReconciliationService');
        await reconcileAgentsFromOpenClaw({
          trigger: 'agent_create',
          actorUserId: req.user.id,
        });
      } catch (reconcileError) {
        logger.warn('Agent reconcile after create failed (non-fatal)', {
          agentId: agentData.id,
          error: reconcileError.message,
        });
      }

      // Workspace + bootstrap files were prepared before config.apply.
      // Trigger bootstrap execution immediately after agent creation so
      // first-run setup is deterministic from the MosBot flow.
      // NOTE: backend does NOT remove BOOTSTRAP.md; only the agent should remove it.
      try {
        const bootstrapResult = await runBootstrapForNewAgent(agentData.id);
        logger.info('Triggered bootstrap run for new agent', {
          agentId: agentData.id,
          status: bootstrapResult?.status || 'ok',
          runId: bootstrapResult?.runId || null,
        });
      } catch (bootstrapRunError) {
        setupWarnings.push(`bootstrap execution trigger failed: ${bootstrapRunError.message}`);
        logger.warn('Failed to trigger bootstrap run for new agent', {
          agentId: agentData.id,
          error: bootstrapRunError.message,
          code: bootstrapRunError.code,
        });
      }

      req._agentCreateWarnings = setupWarnings;
    }

    recordActivityLogEventSafe({
      event_type: 'agent_created',
      source: 'agents',
      title: `Agent created: ${agentData.id}`,
      description: `Agent "${agentData.displayName}" (${agentData.id}) created`,
      severity: 'info',
      actor_user_id: req.user.id,
      agent_id: agentData.id,
      meta: { agentData, projectOnboarding },
    });

    const workspaceRootForResponse = req._agentWorkspaceRoot || '/workspace-<agent>';
    const updatedFiles = [
      '/openclaw.json',
      'database',
      `${workspaceRootForResponse}/tools/*`,
      `${workspaceRootForResponse}/TOOLS.md`,
      `${workspaceRootForResponse}/BOOTSTRAP.md`,
    ];
    if (req._agentCreateApiKeyProvisioned) {
      updatedFiles.push(`${workspaceRootForResponse}/mosbot.env`);
    }

    res.status(201).json({
      data: {
        agentId: agentData.id,
        message: 'Agent created successfully',
        created: true,
        updatedFiles,
        warnings: req._agentCreateWarnings || [],
        projectOnboarding,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/openclaw/agents/config/:agentId/rebootstrap
// Re-seed toolkit/bootstrap and trigger bootstrap execution for existing agent
router.post(
  '/agents/config/:agentId/rebootstrap',
  requireAuth,
  requireManageUsers,
  async (req, res, next) => {
  try {
    const agentId = req.params.agentId;

    if (!agentId) {
      return res.status(400).json({
        error: { message: 'agentId is required', status: 400 },
      });
    }

    if (!isValidAgentId(agentId)) {
      return res.status(400).json({
        error: {
          message:
            'agentId must be a valid slug (lowercase letters, numbers, hyphens, underscores)',
          status: 400,
          code: 'INVALID_AGENT_ID',
        },
      });
    }

    const openclawData = await makeOpenClawRequest('GET', '/files/content?path=/openclaw.json');
    const openclawConfig = parseOpenClawConfig(openclawData.content);
    const agentsList = Array.isArray(openclawConfig?.agents?.list) ? openclawConfig.agents.list : [];
    const agentsDefaults = openclawConfig?.agents?.defaults || {};

    let runtimeAgent = agentsList.find((a) => a?.id === agentId);
    if (!runtimeAgent && agentId === 'main') {
      runtimeAgent = {
        id: 'main',
        default: true,
        workspace: agentsDefaults.workspace || '/workspace',
        identity: agentsDefaults.identity || {},
        model: agentsDefaults.model || {},
      };
    }
    if (!runtimeAgent) {
      return res.status(404).json({
        error: {
          message: `Agent "${agentId}" not found in OpenClaw config`,
          status: 404,
          code: 'AGENT_NOT_FOUND',
        },
      });
    }

    const dbStatus = 'active';
    const dbActive = true;
    const runtimeIdentity = runtimeAgent?.identity || {};
    const hasExplicitIdentityEmoji = Object.prototype.hasOwnProperty.call(runtimeIdentity, 'emoji');

    const agentData = {
      id: agentId,
      displayName: runtimeIdentity?.name || agentId,
      title: runtimeIdentity?.name || agentId,
      description: runtimeIdentity?.theme || '',
      identityName: runtimeIdentity?.name || agentId,
      identityTheme: runtimeIdentity?.theme || '',
      identityEmoji: hasExplicitIdentityEmoji ? runtimeIdentity?.emoji : undefined,
      modelPrimary: runtimeAgent?.model?.primary || null,
      modelFallback1: runtimeAgent?.model?.fallbacks?.[0] || null,
      modelFallback2: runtimeAgent?.model?.fallbacks?.[1] || null,
    };

    const agentMeta = {
      label: `agent:${agentData.id}:main`,
      description: agentData.description || '',
    };
    if (hasExplicitIdentityEmoji) {
      agentMeta.emoji = agentData.identityEmoji;
    }

    let workspaceRoot;
    try {
      workspaceRoot = normalizeRemapAndValidateWorkspacePath(resolveAgentWorkspacePath(runtimeAgent));
    } catch (workspacePathError) {
      return res.status(400).json({
        error: {
          message: `invalid workspace path for agent "${agentId}": ${workspacePathError.message}`,
          status: 400,
          code: 'INVALID_WORKSPACE_PATH',
        },
      });
    }
    if (!isAllowedAgentWorkspaceProvisionPath(workspaceRoot)) {
      return res.status(400).json({
        error: {
          message: `invalid workspace path for agent "${agentId}": must be under /workspace or /workspace-<agent>`,
          status: 400,
          code: 'INVALID_WORKSPACE_PATH',
        },
      });
    }
    if (
      agentId !== 'main' &&
      (workspaceRoot === '/workspace' || workspaceRoot.startsWith('/workspace/'))
    ) {
      return res.status(400).json({
        error: {
          message: `invalid workspace path for agent "${agentId}": non-main agents must use an agent-specific workspace root`,
          status: 400,
          code: 'INVALID_WORKSPACE_PATH',
        },
      });
    }

    // Ensure DB row exists (agent_api_keys FK depends on this).
    await pool.query(
      `INSERT INTO agents (agent_id, name, title, status, reports_to, meta, active)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (agent_id)
       DO UPDATE SET
         -- Preserve curated DB values; only backfill missing runtime-derived fields.
         name = COALESCE(NULLIF(agents.name, ''), EXCLUDED.name),
         title = COALESCE(NULLIF(agents.title, ''), EXCLUDED.title),
         status = COALESCE(NULLIF(agents.status, ''), EXCLUDED.status),
         -- Merge with DB values winning on key collisions to avoid clobbering custom metadata.
         meta = COALESCE(EXCLUDED.meta, '{}'::jsonb) || COALESCE(agents.meta, '{}'::jsonb),
         active = COALESCE(agents.active, EXCLUDED.active),
         updated_at = NOW()`,
      [
        agentData.id,
        agentData.displayName,
        agentData.title,
        dbStatus,
        null,
        JSON.stringify(agentMeta),
        dbActive,
      ],
    );

    const setupWarnings = [];
    let updatedMosbotEnv = false;
    let createdApiKeyId = null;
    let rotatedFromKeyIds = [];
    const mosbotEnvPath = `${workspaceRoot}/mosbot.env`;

    try {
      await writeAgentToolkit(workspaceRoot);
    } catch (workspaceError) {
      return res.status(500).json({
        error: {
          message: `workspace re-bootstrap failed: ${workspaceError.message}`,
          status: 500,
          code: 'WORKSPACE_REBOOTSTRAP_FAILED',
        },
      });
    }

    try {
      const apiKeyResult = await getOrCreateSingleAgentApiKey({
        agentId: agentData.id,
        createdByUserId: req.user.id,
        label: 'rebootstrap',
      });

      if (Array.isArray(apiKeyResult?.warnings) && apiKeyResult.warnings.length > 0) {
        setupWarnings.push(...apiKeyResult.warnings);
      }

      if (apiKeyResult?.created && apiKeyResult?.apiKey) {
        createdApiKeyId = apiKeyResult.keyId || null;
        try {
          await upsertWorkspaceFile(
            mosbotEnvPath,
            buildAgentMosbotEnv({ req, agentId: agentData.id, apiKey: apiKeyResult.apiKey }),
          );
          updatedMosbotEnv = true;
        } catch (envWriteError) {
          await cleanupProvisionedApiKeyArtifacts({
            createdApiKeyId,
            workspaceRoot,
            envWasWritten: updatedMosbotEnv,
            agentId: agentData.id,
            flow: 're-bootstrap',
          });
          updatedMosbotEnv = false;

          return res.status(500).json({
            error: {
              message: `workspace re-bootstrap failed: ${envWriteError.message}`,
              status: 500,
              code: 'WORKSPACE_REBOOTSTRAP_FAILED',
            },
          });
        }
      } else {
        let envExists = false;
        try {
          envExists = await workspaceFileExists(mosbotEnvPath);
        } catch (envCheckError) {
          return res.status(500).json({
            error: {
              message: `workspace re-bootstrap failed: ${envCheckError.message}`,
              status: 500,
              code: 'WORKSPACE_REBOOTSTRAP_FAILED',
            },
          });
        }

        if (!envExists) {
          setupWarnings.push('mosbot.env missing; rotated active API key to restore credentials');
          const rotatedApiKeyResult = await rotateSingleAgentApiKey({
            agentId: agentData.id,
            createdByUserId: req.user.id,
            label: 'rebootstrap-recovery',
          });
          if (
            Array.isArray(rotatedApiKeyResult?.warnings) &&
            rotatedApiKeyResult.warnings.length > 0
          ) {
            setupWarnings.push(...rotatedApiKeyResult.warnings);
          }

          createdApiKeyId = rotatedApiKeyResult.keyId || null;
          rotatedFromKeyIds = Array.isArray(rotatedApiKeyResult?.previousActiveKeyIds)
            ? rotatedApiKeyResult.previousActiveKeyIds
            : [];
          try {
            await upsertWorkspaceFile(
              mosbotEnvPath,
              buildAgentMosbotEnv({
                req,
                agentId: agentData.id,
                apiKey: rotatedApiKeyResult.apiKey,
              }),
            );
            updatedMosbotEnv = true;
          } catch (envWriteError) {
            await cleanupProvisionedApiKeyArtifacts({
              createdApiKeyId,
              workspaceRoot,
              envWasWritten: updatedMosbotEnv,
              agentId: agentData.id,
              flow: 're-bootstrap',
            });
            updatedMosbotEnv = false;
            return res.status(500).json({
              error: {
                message: `workspace re-bootstrap failed: ${envWriteError.message}`,
                status: 500,
                code: 'WORKSPACE_REBOOTSTRAP_FAILED',
              },
            });
          }
        }
      }
    } catch (apiKeyError) {
      if (apiKeyError.code === '42P01') {
        setupWarnings.push('agent_api_keys table not found; skipped API key bootstrap');
      } else {
        setupWarnings.push(`agent API key bootstrap failed: ${apiKeyError.message}`);
      }
      logger.warn('Failed to ensure re-bootstrap API key', {
        agentId: agentData.id,
        error: apiKeyError.message,
        code: apiKeyError.code,
      });
    }

    let projectOnboarding = createDefaultProjectOnboarding();

    try {
      projectOnboarding = await buildAgentProjectOnboardingContext(agentData.id);
    } catch (projectContextError) {
      if (projectContextError?.code === '42P01') {
        setupWarnings.push('project onboarding tables not found; skipped project onboarding context');
      } else {
        setupWarnings.push('project onboarding context failed; see server logs for details');
      }
      logger.warn('Failed to build project onboarding context for re-bootstrap', {
        agentId: agentData.id,
        error: projectContextError?.message,
        code: projectContextError?.code,
      });
    }

    try {
      await upsertWorkspaceFile(
        `${workspaceRoot}/BOOTSTRAP.md`,
        buildAgentBootstrapContent({ ...agentData, flow: 're-bootstrap', projectOnboarding }),
      );
    } catch (workspaceError) {
      await cleanupProvisionedApiKeyArtifacts({
        createdApiKeyId,
        workspaceRoot,
        envWasWritten: updatedMosbotEnv,
        agentId: agentData.id,
        flow: 're-bootstrap',
      });
      updatedMosbotEnv = false;
      return res.status(500).json({
        error: {
          message: `workspace re-bootstrap failed: ${workspaceError.message}`,
          status: 500,
          code: 'WORKSPACE_REBOOTSTRAP_FAILED',
        },
      });
    }

    try {
      const assignedProjects = await getAssignedProjectsForAgent(agentData.id);
      for (const assignedProject of assignedProjects) {
        if (assignedProject?.root_path) {
          await ensureProjectLink(agentData.id, assignedProject.root_path);
        }
      }
    } catch (projectLinkErr) {
      setupWarnings.push(`project link ensure failed: ${projectLinkErr.message}`);
      logger.warn('Failed to ensure project link on re-bootstrap (non-fatal)', {
        agentId: agentData.id,
        error: projectLinkErr.message,
      });
    }

    try {
      const bootstrapResult = await runBootstrapForNewAgent(agentData.id);
      logger.info('Triggered re-bootstrap run for agent', {
        agentId: agentData.id,
        status: bootstrapResult?.status || 'ok',
        runId: bootstrapResult?.runId || null,
      });
    } catch (bootstrapRunError) {
      setupWarnings.push(`bootstrap execution trigger failed: ${bootstrapRunError.message}`);
      logger.warn('Failed to trigger re-bootstrap run for agent', {
        agentId: agentData.id,
        error: bootstrapRunError.message,
        code: bootstrapRunError.code,
      });
    }

    if (rotatedFromKeyIds.length > 0) {
      try {
        await revokeAgentApiKeysById(rotatedFromKeyIds);
      } catch (revokeError) {
        setupWarnings.push('failed to revoke previous API keys after rotation');
        logger.warn('Failed to revoke previous API keys after re-bootstrap rotation', {
          agentId: agentData.id,
          keyIds: rotatedFromKeyIds,
          error: revokeError.message,
        });
      }
    }

    const updatedFiles = [
      `${workspaceRoot}/tools/*`,
      `${workspaceRoot}/TOOLS.md`,
      `${workspaceRoot}/BOOTSTRAP.md`,
      ...(updatedMosbotEnv ? [`${workspaceRoot}/mosbot.env`] : []),
    ];

    recordActivityLogEventSafe({
      event_type: 'agent_rebootstrapped',
      source: 'agents',
      title: `Agent re-bootstrapped: ${agentData.id}`,
      description: `Agent re-bootstrap triggered for "${agentData.id}"`,
      severity: 'info',
      actor_user_id: req.user.id,
      agent_id: agentData.id,
      meta: {
        workspaceRoot,
        updatedFiles,
        warnings: setupWarnings,
        projectOnboarding,
      },
    });

    res.json({
      data: {
        agentId: agentData.id,
        message: 'Agent re-bootstrap triggered',
        updatedFiles,
        warnings: setupWarnings,
        projectOnboarding,
      },
    });
  } catch (error) {
    next(error);
  }
});

registerOpenClawSessionRoutes({
  router,
  requireAuth,
  requireAdmin,
});

registerOpenClawCronRoutes({
  router,
  requireAuth,
  requireAdmin,
});

registerOpenClawUsageRoutes({
  router,
  requireAuth,
  requireAdmin,
  pool,
  logger,
});

registerOpenClawConfigRoutes({
  router,
  requireAuth,
});

module.exports = router;
