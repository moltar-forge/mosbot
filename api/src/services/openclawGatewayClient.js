const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

// Helper to sleep for a given number of milliseconds
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEVICE_AUTH_DB_CACHE_TTL_MS = 5000;
let deviceAuthDbCache = {
  value: null,
  expiresAt: 0,
};

// Device auth config for OpenClaw challenge-response protocol.
// OpenClaw now requires a paired device identity for operator-scoped RPCs.
function privateKeyFromStoredMaterial(material) {
  const value = String(material || '').trim();
  if (!value) return null;
  try {
    if (value.includes('BEGIN PRIVATE KEY')) {
      return crypto.createPrivateKey(value);
    }
    return crypto.createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        Buffer.from(value, 'base64url'),
      ]),
      format: 'der',
      type: 'pkcs8',
    });
  } catch (_) {
    return null;
  }
}

async function getDeviceAuthConfigFromDb() {
  const now = Date.now();
  if (deviceAuthDbCache.expiresAt > now) {
    return deviceAuthDbCache.value;
  }

  try {
    const pool = require('../db/pool');
    const result = await pool.query(
      `SELECT device_id, public_key, private_key, device_token, client_id, client_mode, platform
       FROM openclaw_integration_state
       WHERE id = 1
       LIMIT 1`,
    );
    const row = result.rows?.[0];
    if (!row?.device_id || !row?.public_key || !row?.private_key || !row?.device_token) {
      deviceAuthDbCache = { value: null, expiresAt: now + DEVICE_AUTH_DB_CACHE_TTL_MS };
      return null;
    }
    const privateKey = privateKeyFromStoredMaterial(row.private_key);
    if (!privateKey) {
      deviceAuthDbCache = { value: null, expiresAt: now + DEVICE_AUTH_DB_CACHE_TTL_MS };
      return null;
    }

    const value = {
      deviceId: row.device_id,
      publicKey: row.public_key,
      privateKey,
      deviceToken: row.device_token,
      clientId: row.client_id || DEVICE_CLIENT_ID,
      clientMode: row.client_mode || DEVICE_CLIENT_MODE,
      platform: row.platform || process.platform || 'node',
    };

    deviceAuthDbCache = { value, expiresAt: now + DEVICE_AUTH_DB_CACHE_TTL_MS };
    return value;
  } catch (error) {
    // No pairing table yet or DB unavailable — fall back to non-DB auth paths.
    if (error?.code === '42P01') {
      deviceAuthDbCache = { value: null, expiresAt: now + DEVICE_AUTH_DB_CACHE_TTL_MS };
      return null;
    }
    logger.debug('Unable to load OpenClaw device auth from DB; falling back', {
      error: error?.message || String(error),
    });
    deviceAuthDbCache = { value: null, expiresAt: now + DEVICE_AUTH_DB_CACHE_TTL_MS };
    return null;
  }
}

function resolveDeviceAuthConfig(options = {}) {
  if (options.deviceAuth) return options.deviceAuth;
  if (process.env.JEST_WORKER_ID !== undefined) return null;
  return getDeviceAuthConfigFromDb();
}

const DEVICE_CLIENT_ID = 'openclaw-control-ui';
const DEVICE_CLIENT_MODE = 'webchat';
const DEVICE_ROLE = 'operator';
const DEVICE_SCOPES = [
  'operator.admin',
  'operator.approvals',
  'operator.pairing',
  'operator.read',
  'operator.write',
];

const PERSISTENT_RPC_IDLE_MS = parseInt(
  // Keep the persistent RPC socket warm for long stretches to avoid reconnect churn.
  process.env.OPENCLAW_WS_RPC_IDLE_MS || String(30 * 60 * 1000),
  10,
);
// Enforced for pre-production hardening: always use persistent RPC path.
const ENABLE_PERSISTENT_RPC = true;

const persistentRpcState = {
  ws: null,
  pending: new Map(),
  nextId: 1,
  connected: false,
  connecting: null,
  idleTimer: null,
  currentUrl: null,
};

function resetPersistentRpcState() {
  if (persistentRpcState.idleTimer) {
    clearTimeout(persistentRpcState.idleTimer);
    persistentRpcState.idleTimer = null;
  }
  persistentRpcState.connected = false;
  persistentRpcState.connecting = null;
  persistentRpcState.currentUrl = null;
  for (const [, handler] of persistentRpcState.pending) {
    handler.reject(new Error('Persistent gateway RPC connection reset'));
  }
  persistentRpcState.pending.clear();
  if (persistentRpcState.ws) {
    try {
      persistentRpcState.ws.removeAllListeners();
      persistentRpcState.ws.close();
    } catch (_) {
      void _;
    }
  }
  persistentRpcState.ws = null;
  persistentRpcState.nextId = 1;
}

function buildDeviceConnectPayload(deviceAuth, nonce, authOptions = {}) {
  const signedAt = Date.now();
  const clientId = deviceAuth.clientId || DEVICE_CLIENT_ID;
  const clientMode = deviceAuth.clientMode || DEVICE_CLIENT_MODE;
  const clientPlatform = deviceAuth.platform || process.platform || 'node';
  const authToken =
    typeof authOptions.authToken === 'string' && authOptions.authToken.trim().length > 0
      ? authOptions.authToken.trim()
      : deviceAuth.deviceToken;
  const authDeviceToken =
    typeof authOptions.authDeviceToken === 'string' && authOptions.authDeviceToken.trim().length > 0
      ? authOptions.authDeviceToken.trim()
      : null;
  const canonical = [
    'v2',
    deviceAuth.deviceId,
    clientId,
    clientMode,
    DEVICE_ROLE,
    DEVICE_SCOPES.join(','),
    String(signedAt),
    authToken || '',
    nonce,
  ].join('|');
  const sig = crypto
    .sign(null, Buffer.from(canonical), deviceAuth.privateKey)
    .toString('base64url');
  return {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: clientId,
      version: 'server',
      platform: clientPlatform,
      mode: clientMode,
    },
    role: DEVICE_ROLE,
    scopes: DEVICE_SCOPES,
    device: {
      id: deviceAuth.deviceId,
      publicKey: deviceAuth.publicKey,
      signature: sig,
      signedAt,
      nonce,
    },
    auth: {
      ...(authToken ? { token: authToken } : {}),
      ...(authDeviceToken ? { deviceToken: authDeviceToken } : {}),
    },
  };
}

// Helper to check if an error is retryable
function isRetryableError(error) {
  // Retry on timeout errors
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return true;
  }

  // Retry on connection errors
  if (
    (error.message && error.message.includes('fetch failed')) ||
    error.code === 'ECONNREFUSED' ||
    error.code === 'ENOTFOUND'
  ) {
    return true;
  }

  // Retry on 503 Service Unavailable (transient server errors)
  if (error.status === 503 && error.code !== 'SERVICE_NOT_CONFIGURED') {
    return true;
  }

  return false;
}

// Helper to make requests to OpenClaw Gateway with retry logic
async function makeOpenClawGatewayRequest(path, body = null, retryCount = 0) {
  // Determine retry settings based on environment for faster tests
  const isTestEnvironment =
    process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
  const maxRetries = isTestEnvironment ? 1 : 3; // Reduce retries in test environment
  const baseDelayMs = isTestEnvironment ? 10 : 500; // Reduce delay in test environment

  // Only use Kubernetes default if explicitly in production environment
  // In development, require explicit configuration to avoid connection errors
  const gatewayUrl = config.openclaw.gatewayUrl;
  const gatewayToken = config.openclaw.gatewayToken;

  // Check if OpenClaw Gateway is configured (in local dev, URL should be explicitly set)
  if (!gatewayUrl || gatewayUrl === '') {
    const err = new Error(
      'OpenClaw gateway is not configured. Set OPENCLAW_GATEWAY_URL to enable.',
    );
    err.status = 503;
    err.code = 'SERVICE_NOT_CONFIGURED';
    throw err;
  }

  const url = `${gatewayUrl}${path}`;
  const timeoutMs = config.openclaw.gatewayTimeoutMs;
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(timeoutMs),
  };

  // Add auth token if configured
  if (gatewayToken) {
    options.headers['Authorization'] = `Bearer ${gatewayToken}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      const err = new Error(`OpenClaw gateway error: ${response.status} ${errorText}`);
      err.status = response.status;
      err.code = 'OPENCLAW_GATEWAY_ERROR';

      // Retry on 503 if we haven't exceeded max retries
      if (isRetryableError(err) && retryCount < maxRetries) {
        const delayMs = baseDelayMs * Math.pow(2, retryCount); // Exponential backoff
        logger.warn('OpenClaw gateway request failed, retrying', {
          path,
          url,
          retryCount: retryCount + 1,
          maxRetries,
          delayMs,
          error: err.message,
        });
        await sleep(delayMs);
        return makeOpenClawGatewayRequest(path, body, retryCount + 1);
      }

      throw err;
    }

    return await response.json();
  } catch (error) {
    // Handle connection/timeout errors with retry
    if (isRetryableError(error) && retryCount < maxRetries) {
      const delayMs = baseDelayMs * Math.pow(2, retryCount); // Exponential backoff
      logger.warn('OpenClaw gateway request failed, retrying', {
        path,
        url,
        retryCount: retryCount + 1,
        maxRetries,
        delayMs,
        error: error.message,
        errorCode: error.code,
      });
      await sleep(delayMs);
      return makeOpenClawGatewayRequest(path, body, retryCount + 1);
    }

    // Handle connection/timeout errors (after retries exhausted)
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      const err = new Error('OpenClaw gateway request timed out');
      err.status = 503;
      err.code = 'SERVICE_TIMEOUT';
      logger.error('OpenClaw gateway request timed out after retries', {
        path,
        url,
        retryCount,
      });
      throw err;
    }

    // Handle fetch failures (connection refused, DNS errors, etc.) (after retries exhausted)
    if (
      error.message.includes('fetch failed') ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND'
    ) {
      const err = new Error(
        'OpenClaw gateway is unavailable. This may be expected in local development.',
      );
      err.status = 503;
      err.code = 'SERVICE_UNAVAILABLE';
      logger.warn('OpenClaw gateway unavailable after retries', {
        path,
        url,
        retryCount,
        hint: 'Set OPENCLAW_GATEWAY_URL to disable or configure the gateway URL',
      });
      throw err;
    }

    // Re-throw if already has status code
    if (error.status) {
      // 401 is handled by callers (e.g. invokeTool) — log at debug to avoid double-logging
      const logLevel = error.status === 401 ? 'debug' : 'error';
      logger[logLevel]('OpenClaw gateway request failed', {
        path,
        error: error.message,
        status: error.status,
        retryCount,
      });
      throw error;
    }

    // Generic error
    const err = new Error(`OpenClaw gateway request failed: ${error.message}`);
    err.status = 503;
    err.code = 'SERVICE_ERROR';
    logger.error('OpenClaw gateway request failed', {
      path,
      error: error.message,
      retryCount,
    });
    throw err;
  }
}

/**
 * Invoke a tool via OpenClaw Gateway /tools/invoke endpoint
 * @param {string} tool - Tool name (e.g., 'sessions_list', 'sessions_history')
 * @param {object} args - Tool-specific arguments
 * @param {object} options - Additional options (sessionKey, action, dryRun)
 * @returns {Promise<object>} Tool result
 */
async function invokeTool(tool, args = {}, options = {}) {
  const { sessionKey = 'main', action = 'json', dryRun = false } = options;

  const body = {
    tool,
    action,
    args,
    sessionKey,
    dryRun,
  };

  try {
    const response = await makeOpenClawGatewayRequest('/tools/invoke', body);

    if (!response.ok) {
      const err = new Error(response.error?.message || 'Tool invocation failed');
      err.status = 400;
      err.code = 'TOOL_INVOCATION_ERROR';
      throw err;
    }

    return response.result || response;
  } catch (error) {
    // Return null for 404 (tool not available) — the tool genuinely doesn't exist
    if (error.status === 404) {
      logger.warn('Tool not available', { tool, error: error.message });
      return null;
    }
    // Surface auth errors clearly instead of masking them as "tool not available"
    if (error.status === 401) {
      logger.warn('OpenClaw gateway auth failed for tool invocation', {
        tool,
        sessionKey,
        status: error.status,
      });
      return null;
    }
    throw error;
  }
}

/**
 * List sessions via sessions_list tool
 * @param {object} params - Query parameters
 * @param {string} params.sessionKey - Full session key for agent context (e.g., 'main', 'agent:coo:main')
 * @param {string[]} params.kinds - Filter by session kinds (main, group, cron, hook, node, other)
 * @param {number} params.limit - Max rows to return
 * @param {number} params.activeMinutes - Only sessions updated within N minutes
 * @param {number} params.messageLimit - Include last N messages per session (0 = no messages)
 * @returns {Promise<Array>} Array of session rows
 */
async function sessionsList({
  sessionKey = 'main',
  kinds,
  limit,
  activeMinutes,
  messageLimit,
} = {}) {
  const args = {};

  if (kinds) args.kinds = kinds;
  if (limit != null) args.limit = limit;
  if (activeMinutes != null) args.activeMinutes = activeMinutes;
  if (messageLimit != null) args.messageLimit = messageLimit;

  try {
    const result = await invokeTool('sessions_list', args, { sessionKey });
    // sessions_list returns various structures depending on the tool implementation
    if (!result) {
      return [];
    }

    // Handle direct array response
    if (Array.isArray(result)) {
      return result;
    }

    // Handle { details: { sessions: [...] } } structure (OpenClaw Gateway format)
    if (result.details && Array.isArray(result.details.sessions)) {
      return result.details.sessions;
    }

    // Handle { rows: [...] } structure
    if (result.rows && Array.isArray(result.rows)) {
      return result.rows;
    }

    // Handle { sessions: [...] } structure
    if (result.sessions && Array.isArray(result.sessions)) {
      return result.sessions;
    }

    // Fallback to empty array if structure is unexpected
    logger.warn('Unexpected sessions_list result structure', { result });
    return [];
  } catch (error) {
    // If service is not configured, return empty array (graceful degradation)
    if (error.code === 'SERVICE_NOT_CONFIGURED' || error.code === 'SERVICE_UNAVAILABLE') {
      logger.warn('OpenClaw gateway not available for sessions_list, returning empty array');
      return [];
    }
    throw error;
  }
}

/**
 * Fetch session history via sessions_history tool
 * @param {object} params - Query parameters
 * @param {string} params.sessionKey - Session key or sessionId
 * @param {number} params.limit - Max messages to return
 * @param {boolean} params.includeTools - Include tool result messages
 * @returns {Promise<Array>} Array of messages
 */
async function sessionsHistory({ sessionKey, limit, includeTools } = {}) {
  if (!sessionKey) {
    throw new Error('sessionKey is required for sessions_history');
  }

  const args = { sessionKey };
  if (limit != null) args.limit = limit;
  if (includeTools != null) args.includeTools = includeTools;

  try {
    // For subagent sessions, the sessions_history tool isn't available in the
    // subagent's own context. Invoke from the parent agent's main session instead.
    let contextKey = sessionKey;
    if (sessionKey.includes(':subagent:')) {
      const parts = sessionKey.split(':');
      contextKey = `agent:${parts[1]}:main`;
    }
    const result = await invokeTool('sessions_history', args, {
      sessionKey: contextKey,
    });

    // Log detailed information about the result for debugging
    logger.info('sessions_history tool result', {
      sessionKey,
      resultType: Array.isArray(result) ? 'array' : typeof result,
      resultKeys: result && typeof result === 'object' ? Object.keys(result) : null,
      messagesCount: result?.messages?.length || (Array.isArray(result) ? result.length : 0),
      hasMessages: !!(result?.messages || Array.isArray(result)),
      isNull: result === null,
      isUndefined: result === undefined,
    });

    // sessions_history returns { messages: [...] } or just an array
    const messages = result?.messages || result || [];

    // Warn if we got an empty result for a session that should have data
    if ((!messages || messages.length === 0) && sessionKey) {
      logger.warn('sessions_history returned empty messages', {
        sessionKey,
        args,
        resultType: typeof result,
        result: result ? JSON.stringify(result).substring(0, 200) : null,
      });
    }

    return messages;
  } catch (error) {
    // If service is not configured, return empty array (graceful degradation)
    if (error.code === 'SERVICE_NOT_CONFIGURED' || error.code === 'SERVICE_UNAVAILABLE') {
      logger.warn('OpenClaw gateway not available for sessions_history, returning empty array', {
        sessionKey,
      });
      return [];
    }
    throw error;
  }
}

/**
 * List cron jobs from the OpenClaw Gateway scheduler.
 * Tries the cron.list tool first (via /tools/invoke), then falls back to
 * reading the persisted jobs.json from the workspace service.
 * @returns {Promise<Array>} Array of cron job objects
 */
async function cronList() {
  // Attempt 1: Try cron.list via /tools/invoke
  try {
    const result = await invokeTool('cron.list', {});
    if (result) {
      const jobs = extractJobsArray(result);
      if (jobs.length > 0) {
        logger.info('cron.list returned jobs via /tools/invoke', {
          count: jobs.length,
        });
        return jobs;
      }
    }
  } catch (error) {
    if (error.code === 'SERVICE_NOT_CONFIGURED' || error.code === 'SERVICE_UNAVAILABLE') {
      logger.warn('OpenClaw gateway not available for cron.list, returning empty array');
      return [];
    }
    // Log and fall through to fallback
    logger.warn('cron.list tool invocation failed, trying jobs.json fallback', {
      error: error.message,
      code: error.code,
    });
  }

  // Attempt 2: Read the persisted jobs.json from the workspace service
  // OpenClaw stores cron jobs at ~/.openclaw/cron/jobs.json on the gateway host.
  // In containerized setups this is typically at /home/node/.openclaw/cron/jobs.json
  // which may be accessible via the workspace service.
  try {
    const { getFileContent } = require('./openclawWorkspaceClient');
    const content = await getFileContent('/cron/jobs.json');
    if (content) {
      const raw = typeof content === 'string' ? content : content.content || content;
      const parsed = parseJsonWithLiteralNewlines(raw);
      const jobs = extractJobsArray(parsed);
      if (jobs.length > 0) {
        logger.info('cron jobs loaded from jobs.json fallback', {
          count: jobs.length,
        });
        return jobs;
      }
    }
  } catch (fallbackError) {
    logger.warn('jobs.json fallback also failed', {
      error: fallbackError.message,
    });
  }

  return [];
}

/**
 * Parse JSON that may contain literal (unescaped) newline characters and/or
 * unescaped double-quote characters inside string values — a common artifact
 * when OpenClaw writes multiline payloads (e.g. markdown code blocks) to jobs.json.
 *
 * Strategy:
 *  1. Try a direct JSON.parse (fast path).
 *  2. Find markdown code blocks that are delimited by *literal* newlines
 *     (i.e. the code block was written raw into a JSON string without escaping).
 *     Escape their content: literal \n → \\n, unescaped " → \".
 *  3. Escape any remaining bare \n/\r that sit inside JSON string values
 *     using a character-by-character walk.
 *  4. Final JSON.parse attempt.
 */
function parseJsonWithLiteralNewlines(str) {
  // Fast path
  try {
    return JSON.parse(str);
  } catch (_) {
    /* fall through */
  }

  // Pass 1: fix markdown code blocks that contain literal newlines + unescaped quotes.
  // These appear when OpenClaw writes a payload message that includes a ```json ... ```
  // example block without escaping the content for JSON string embedding.
  // Pattern: literal-newline + ```[lang] + literal-newline + content + literal-newline + ``` + literal-newline
  let fixed = str.replace(
    /\n(```[a-z]*)\n([\s\S]*?)\n(```)\n/g,
    (_match, open, codeContent, close) => {
      const escapedContent = codeContent
        .replace(/\\/g, '\\\\') // escape existing backslashes first
        .replace(/"/g, '\\"') // escape unescaped double quotes
        .replace(/\n/g, '\\n') // escape remaining literal newlines
        .replace(/\r/g, '\\r');
      return '\\n' + open + '\\n' + escapedContent + '\\n' + close + '\\n';
    },
  );

  try {
    return JSON.parse(fixed);
  } catch (_) {
    /* fall through */
  }

  // Pass 2: escape any remaining bare \n/\r inside JSON string values.
  let sanitized = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (escaped) {
      sanitized += ch;
      escaped = false;
    } else if (ch === '\\' && inString) {
      sanitized += ch;
      escaped = true;
    } else if (ch === '"') {
      sanitized += ch;
      inString = !inString;
    } else if (inString && ch === '\n') {
      sanitized += '\\n';
    } else if (inString && ch === '\r') {
      sanitized += '\\r';
    } else {
      sanitized += ch;
    }
  }

  return JSON.parse(sanitized); // throws if still broken
}

/**
 * List ALL sessions via the gateway's native WebSocket RPC sessions.list method.
 * Unlike sessionsList() which uses /tools/invoke and is scoped to a single agent's
 * session store, this uses the gateway-level WebSocket RPC that has visibility across
 * all agents — including subagent sessions (kind: subagent).
 *
 * The OpenClaw UI uses this same mechanism (client.request("sessions.list", params)).
 *
 * @param {object} params
 * @param {boolean} params.includeGlobal - Include global/shared sessions (default: true)
 * @param {boolean} params.includeUnknown - Include sessions with unknown agent (default: false)
 * @param {number}  params.activeMinutes  - Only sessions updated within N minutes (0 = no filter)
 * @param {number}  params.limit          - Max sessions to return (0 = no limit)
 * @returns {Promise<object>} Raw sessions.list payload from the gateway
 */
async function sessionsListAllViaWs({
  includeGlobal = true,
  includeUnknown = false,
  activeMinutes = 0,
  limit = 0,
  messageLimit = 0,
} = {}) {
  const params = { includeGlobal, includeUnknown };
  if (activeMinutes > 0) params.activeMinutes = activeMinutes;
  if (limit > 0) params.limit = limit;
  if (messageLimit > 0) params.messageLimit = messageLimit;

  return gatewayWsRpc('sessions.list', params);
}

function schedulePersistentRpcIdleClose() {
  if (persistentRpcState.idleTimer) {
    clearTimeout(persistentRpcState.idleTimer);
  }

  if (!persistentRpcState.ws || !persistentRpcState.connected) {
    return;
  }

  persistentRpcState.idleTimer = setTimeout(() => {
    if (!persistentRpcState.ws) return;
    if (persistentRpcState.pending.size > 0) return;
    try {
      persistentRpcState.ws.close();
    } catch (_) {
      void _;
    }
  }, PERSISTENT_RPC_IDLE_MS);
}

function persistentRpcSend(method, params = {}, timeoutMs = null) {
  if (!persistentRpcState.ws || !persistentRpcState.connected) {
    return Promise.reject(new Error('Persistent gateway RPC is not connected'));
  }

  const id = String(persistentRpcState.nextId++);
  const request = JSON.stringify({ type: 'req', id, method, params });

  return new Promise((resolve, reject) => {
    const perRequestTimeout =
      timeoutMs != null && Number.isFinite(timeoutMs)
        ? timeoutMs
        : config.openclaw.gatewayTimeoutMs;

    const timeout = setTimeout(() => {
      persistentRpcState.pending.delete(id);
      reject(new Error(`Persistent gateway RPC timed out for method ${method}`));
    }, perRequestTimeout);

    persistentRpcState.pending.set(id, {
      resolve: (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    try {
      persistentRpcState.ws.send(request);
    } catch (error) {
      persistentRpcState.pending.delete(id);
      clearTimeout(timeout);
      reject(error);
    }
  });
}

async function ensurePersistentRpcConnection(options = {}) {
  if (persistentRpcState.ws && persistentRpcState.connected) {
    return;
  }

  if (persistentRpcState.connecting) {
    return persistentRpcState.connecting;
  }

  const gatewayUrl = config.openclaw.gatewayUrl;
  const gatewayToken = config.openclaw.gatewayToken;
  const resolvedDeviceAuth = resolveDeviceAuthConfig(options);
  const deviceAuth =
    resolvedDeviceAuth && typeof resolvedDeviceAuth.then === 'function'
      ? await resolvedDeviceAuth
      : resolvedDeviceAuth;

  if (!gatewayUrl) {
    const err = new Error(
      'OpenClaw gateway is not configured. Set OPENCLAW_GATEWAY_URL to enable.',
    );
    err.status = 503;
    err.code = 'SERVICE_NOT_CONFIGURED';
    throw err;
  }

  if (!deviceAuth) {
    const err = new Error('OpenClaw device auth is required but no device credentials were provided');
    err.status = 503;
    err.code = 'DEVICE_AUTH_REQUIRED';
    throw err;
  }

  if (persistentRpcState.ws && persistentRpcState.currentUrl !== gatewayUrl) {
    resetPersistentRpcState();
  }

  const wsUrl = gatewayUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');
  const WebSocket = require('ws');
  const parsedUrl = new URL(wsUrl.replace(/^ws/, 'http'));
  const originHost = parsedUrl.host;
  const originScheme = wsUrl.startsWith('wss://') ? 'https' : 'http';

  persistentRpcState.connecting = new Promise((resolve, reject) => {
    let settled = false;
    const connectTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resetPersistentRpcState();
      const err = new Error('OpenClaw persistent WebSocket connect timed out');
      err.status = 503;
      err.code = 'SERVICE_TIMEOUT';
      reject(err);
    }, config.openclaw.gatewayTimeoutMs);

    const ws = new WebSocket(wsUrl, {
      headers: {
        ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
        Origin: `${originScheme}://${originHost}`,
        Host: originHost,
      },
      rejectUnauthorized: false,
    });

    const failConnect = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimeout);
      resetPersistentRpcState();
      reject(error);
    };

    ws.on('open', () => {
      logger.debug('Persistent gateway WebSocket opened, waiting for connect.challenge');
    });

    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (_) {
        return;
      }

      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        try {
          const sharedGatewayToken =
            typeof gatewayToken === 'string' && gatewayToken.trim().length > 0
              ? gatewayToken.trim()
              : '';
          const storedDeviceToken =
            typeof deviceAuth?.deviceToken === 'string' && deviceAuth.deviceToken.trim().length > 0
              ? deviceAuth.deviceToken.trim()
              : '';
          const authToken = sharedGatewayToken || storedDeviceToken;
          const authDeviceToken =
            sharedGatewayToken && storedDeviceToken && sharedGatewayToken !== storedDeviceToken
              ? storedDeviceToken
              : null;

          const nonce = msg.payload?.nonce || '';
          const connectPayload = buildDeviceConnectPayload(deviceAuth, nonce, {
            authToken,
            authDeviceToken,
          });
          const connectResult = await new Promise((res, rej) => {
            const id = String(persistentRpcState.nextId++);
            persistentRpcState.pending.set(id, {
              resolve: (payload) => res(payload),
              reject: (err) => rej(err),
            });
            ws.send(JSON.stringify({ type: 'req', id, method: 'connect', params: connectPayload }));
          });
          if (typeof options.onConnectOk === 'function') {
            await options.onConnectOk(connectResult);
          }
        } catch (error) {
          failConnect(error);
        }
        return;
      }

      if (msg.type === 'res') {
        const handler = persistentRpcState.pending.get(msg.id);
        if (!handler) return;
        persistentRpcState.pending.delete(msg.id);

        if (msg.ok) {
          handler.resolve(msg.payload);
          if (!persistentRpcState.connected) {
            persistentRpcState.connected = true;
            if (!settled) {
              settled = true;
              clearTimeout(connectTimeout);
              persistentRpcState.currentUrl = gatewayUrl;
              resolve();
            }
          }
          schedulePersistentRpcIdleClose();
        } else {
          const rpcErr = new Error(msg.error?.message || 'RPC request failed');
          rpcErr.rpcCode = msg.error?.code;
          rpcErr.rpcDetails = msg.error;
          handler.reject(rpcErr);
          if (!persistentRpcState.connected) {
            failConnect(rpcErr);
          }
        }
      }
    });

    ws.on('error', (err) => {
      const wrapped = new Error(`OpenClaw persistent WebSocket error: ${err.message}`);
      wrapped.status = 503;
      wrapped.code = 'SERVICE_UNAVAILABLE';
      failConnect(wrapped);
    });

    ws.on('close', (code, reason) => {
      const closeError = new Error(`Persistent WebSocket closed (${code}): ${reason}`);
      for (const [, handler] of persistentRpcState.pending) {
        handler.reject(closeError);
      }
      persistentRpcState.pending.clear();
      persistentRpcState.connected = false;
      persistentRpcState.ws = null;
      persistentRpcState.currentUrl = null;
      if (!settled) {
        settled = true;
        clearTimeout(connectTimeout);
        reject(closeError);
      }
    });

    persistentRpcState.ws = ws;
  });

  return persistentRpcState.connecting.finally(() => {
    persistentRpcState.connecting = null;
  });
}

async function gatewayWsRpcPersistent(method, params = {}, options = {}) {
  await ensurePersistentRpcConnection(options);

  try {
    const result = await persistentRpcSend(method, params, options.timeoutMs);
    schedulePersistentRpcIdleClose();
    return result;
  } catch (error) {
    if (
      error?.message?.includes('Persistent gateway RPC timed out') ||
      error?.message?.includes('Persistent WebSocket closed')
    ) {
      resetPersistentRpcState();
      await ensurePersistentRpcConnection(options);
      const result = await persistentRpcSend(method, params, options.timeoutMs);
      schedulePersistentRpcIdleClose();
      return result;
    }
    throw error;
  }
}

/**
 * Open a short-lived WebSocket RPC connection to the gateway using device-auth
 * (Ed25519 challenge-response), run a single RPC call, and return its result.
 *
 * OpenClaw 2026.2.22+ requires operator.read scope for sessions/usage RPCs.
 * Device-auth connections are required for operator-scoped gateway RPCs.
 *
 * @param {string} method  RPC method name (e.g. "sessions.list", "sessions.usage")
 * @param {object} params  RPC method params
 * @returns {Promise<object>} The RPC payload
 */
async function gatewayWsRpcWithDeviceAuth(method, params = {}, options = {}) {
  const gatewayUrl = config.openclaw.gatewayUrl;
  const gatewayToken = config.openclaw.gatewayToken;
  const resolvedDeviceAuth = resolveDeviceAuthConfig(options);
  const deviceAuth =
    resolvedDeviceAuth && typeof resolvedDeviceAuth.then === 'function'
      ? await resolvedDeviceAuth
      : resolvedDeviceAuth;

  if (!gatewayUrl) {
    const err = new Error(
      'OpenClaw gateway is not configured. Set OPENCLAW_GATEWAY_URL to enable.',
    );
    err.status = 503;
    err.code = 'SERVICE_NOT_CONFIGURED';
    throw err;
  }

  if (!deviceAuth) {
    const err = new Error('OpenClaw device auth is required but no device credentials were provided');
    err.status = 503;
    err.code = 'DEVICE_AUTH_REQUIRED';
    throw err;
  }

  const wsUrl = gatewayUrl.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');

  // Determine timeout based on environment for faster tests
  // In test environments, we use shorter timeouts, but respect explicit test overrides
  const timeoutMs = config.openclaw.gatewayTimeoutMs;

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch (_) {
          void _;
        }
        const err = new Error('OpenClaw gateway WebSocket request timed out');
        err.status = 503;
        err.code = 'SERVICE_TIMEOUT';
        reject(err);
      }
    }, timeoutMs);

    const WebSocket = require('ws');
    const parsedUrl = new URL(wsUrl.replace(/^ws/, 'http'));
    const originHost = parsedUrl.host; // e.g. "openclaw.openclaw-personal.svc.cluster.local:18789"
    const originScheme = wsUrl.startsWith('wss://') ? 'https' : 'http';
    const ws = new WebSocket(wsUrl, {
      headers: {
        ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
        Origin: `${originScheme}://${originHost}`,
        Host: originHost,
      },
      rejectUnauthorized: false,
    });

    let nextId = 1;
    const pending = new Map();

    function send(m, p) {
      const id = String(nextId++);
      ws.send(JSON.stringify({ type: 'req', id, method: m, params: p }));
      return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
    }

    async function doConnectAndRpc(nonce) {
      try {
        const sharedGatewayToken =
          typeof gatewayToken === 'string' && gatewayToken.trim().length > 0
            ? gatewayToken.trim()
            : '';
        const storedDeviceToken =
          typeof deviceAuth?.deviceToken === 'string' && deviceAuth.deviceToken.trim().length > 0
            ? deviceAuth.deviceToken.trim()
            : '';
        const authToken = sharedGatewayToken || storedDeviceToken;
        const authDeviceToken =
          sharedGatewayToken && storedDeviceToken && sharedGatewayToken !== storedDeviceToken
            ? storedDeviceToken
            : null;

        const connectPayload = buildDeviceConnectPayload(deviceAuth, nonce, {
          authToken,
          authDeviceToken,
        });
        logger.debug('Sending device-auth connect handshake', {
          deviceId: deviceAuth.deviceId,
          nonce,
          hasSharedToken: Boolean(sharedGatewayToken),
          hasStoredDeviceToken: Boolean(storedDeviceToken),
          hasAuthDeviceToken: Boolean(authDeviceToken),
        });
        const connectResult = await send('connect', connectPayload);
        if (typeof options.onConnectOk === 'function') {
          await options.onConnectOk(connectResult);
        }
        logger.debug('Device-auth connect successful');

        const result = await send(method, params);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          resolve(result);
        }
      } catch (err) {
        const rpcErr = new Error(err.message || 'RPC request failed');
        rpcErr.rpcCode = err.rpcCode;
        rpcErr.rpcDetails = err.rpcDetails;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try {
            ws.close();
          } catch (_) {
            void _;
          }
          reject(rpcErr);
        }
      }
    }

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch (_) {
        return;
      }

      // Device-auth: gateway sends connect.challenge before we send connect.
      if (msg.type === 'event' && msg.event === 'connect.challenge') {
        const nonce = msg.payload?.nonce || '';
        doConnectAndRpc(nonce);
        return;
      }

      if (msg.type === 'res') {
        const handler = pending.get(msg.id);
        if (!handler) return;
        pending.delete(msg.id);
        if (msg.ok) {
          handler.resolve(msg.payload);
        } else {
          const rpcErr = new Error(msg.error?.message || 'RPC request failed');
          rpcErr.rpcCode = msg.error?.code;
          rpcErr.rpcDetails = msg.error;
          handler.reject(rpcErr);
        }
      }
    });

    ws.on('open', () => {
      // Device-auth path: wait for connect.challenge event from gateway
      logger.debug('WebSocket opened, waiting for connect.challenge');
    });

    ws.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        const e = new Error(`OpenClaw gateway WebSocket error: ${err.message}`);
        e.status = 503;
        e.code = 'SERVICE_UNAVAILABLE';
        reject(e);
      }
    });

    ws.on('close', (code, reason) => {
      for (const [, handler] of pending) {
        handler.reject(new Error(`WebSocket closed (${code}): ${reason}`));
      }
      pending.clear();
    });
  });
}

// Main RPC entrypoint: persistent connection in production, short-lived in dev/tests.
async function gatewayWsRpc(method, params = {}, options = {}) {
  if (ENABLE_PERSISTENT_RPC) {
    return gatewayWsRpcPersistent(method, params, options);
  }
  return gatewayWsRpcWithDeviceAuth(method, params, options);
}

/**
 * Fetch session message history via WebSocket RPC chat.history.
 * Bypasses tool-level visibility restrictions (uses operator.admin scope).
 *
 * @param {object} params
 * @param {string} params.sessionKey  Full session key (e.g. "agent:cto:subagent:UUID")
 * @param {number} params.limit       Max messages to return (default 200)
 * @returns {Promise<object>} { messages: [...], thinkingLevel: ... }
 */
async function sessionsHistoryViaWs({ sessionKey, limit = 200 } = {}) {
  if (!sessionKey) throw new Error('sessionKey is required');
  return gatewayWsRpc('chat.history', { sessionKey, limit });
}

/**
 * Extract a flat array of jobs from various response shapes
 */
function extractJobsArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.jobs && Array.isArray(data.jobs)) return data.jobs;
  if (data.details && Array.isArray(data.details.jobs)) return data.details.jobs;
  // jobs.json stores as { "jobs": { "<id>": {...}, ... } } map
  if (data.jobs && typeof data.jobs === 'object' && !Array.isArray(data.jobs)) {
    return Object.values(data.jobs);
  }
  if (data.jobId || data.name) return [data];
  return [];
}

module.exports = {
  buildDeviceConnectPayload,
  invokeTool,
  sessionsList,
  sessionsListAllViaWs,
  sessionsHistory,
  sessionsHistoryViaWs,
  gatewayWsRpc,
  cronList,
  parseJsonWithLiteralNewlines,
  sleep,
  isRetryableError,
  makeOpenClawGatewayRequest,
};
