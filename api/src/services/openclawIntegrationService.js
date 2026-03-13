const crypto = require('crypto');
const pool = require('../db/pool');
const config = require('../config');
const { gatewayWsRpc } = require('./openclawGatewayClient');

const REQUIRED_OPERATOR_SCOPES = [
  'operator.admin',
  'operator.approvals',
  'operator.pairing',
  'operator.read',
  'operator.write',
];

const DEFAULT_CLIENT_ID = 'openclaw-control-ui';
const DEFAULT_CLIENT_MODE = 'webchat';

function createHttpError(status, message, code, details) {
  const err = new Error(message);
  err.status = status;
  if (code) err.code = code;
  if (details !== undefined) err.details = details;
  return err;
}

function normalizeScopes(rawScopes) {
  if (Array.isArray(rawScopes)) {
    return [...new Set(rawScopes.map((s) => String(s || '').trim()).filter(Boolean))];
  }

  if (rawScopes && typeof rawScopes === 'object') {
    return [...new Set(Object.values(rawScopes).map((s) => String(s || '').trim()).filter(Boolean))];
  }

  return [];
}

function serializeStoredSecret(plaintext) {
  if (!plaintext) return null;
  return String(plaintext);
}

function deserializeStoredSecret(payload) {
  if (!payload) return null;
  return String(payload);
}

function privateKeyFromSeedB64(seedB64) {
  return crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      Buffer.from(seedB64, 'base64url'),
    ]),
    format: 'der',
    type: 'pkcs8',
  });
}

function privateKeyFromStoredMaterial(material) {
  const value = String(material || '').trim();
  if (!value) return null;

  try {
    if (value.includes('BEGIN PRIVATE KEY')) {
      return crypto.createPrivateKey(value);
    }
    return privateKeyFromSeedB64(value);
  } catch (_) {
    return null;
  }
}

function generateDeviceIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicSpki = publicKey.export({ format: 'der', type: 'spki' });
  const privatePkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' });

  const publicKeyRaw = Buffer.from(publicSpki).subarray(-32).toString('base64url');
  const privateSeed = Buffer.from(privatePkcs8).subarray(-32).toString('base64url');

  return {
    // OpenClaw validates device.id against the Ed25519 public key fingerprint.
    // It must be sha256(rawPublicKeyBytes) in lowercase hex.
    deviceId: crypto.createHash('sha256').update(Buffer.from(publicKeyRaw, 'base64url')).digest('hex'),
    publicKey: publicKeyRaw,
    privateSeed,
    // First handshake authenticates with shared gateway token; gateway may return
    // a rotated per-device token in hello-ok.auth.deviceToken after pairing.
    deviceToken: String(config.openclaw.gatewayToken || ''),
    clientId: DEFAULT_CLIENT_ID,
    clientMode: DEFAULT_CLIENT_MODE,
    platform: process.platform || 'node',
  };
}

async function getIntegrationRow() {
  const result = await pool.query('SELECT * FROM openclaw_integration_state WHERE id = 1');
  return result.rows?.[0] || null;
}

async function getIntegrationStatusRow() {
  const result = await pool.query(
    `SELECT
      status,
      granted_scopes,
      gateway_url,
      device_id,
      client_id,
      client_mode,
      platform,
      last_error,
      last_checked_at,
      updated_at
    FROM openclaw_integration_state
    WHERE id = 1`,
  );
  return result.rows?.[0] || null;
}

async function upsertIntegrationRow(patch) {
  const existing = await getIntegrationRow();
  const next = {
    id: 1,
    status: patch.status ?? existing?.status ?? 'uninitialized',
    gateway_url: patch.gateway_url ?? existing?.gateway_url ?? config.openclaw.gatewayUrl ?? null,
    device_id: patch.device_id ?? existing?.device_id ?? null,
    client_id: patch.client_id ?? existing?.client_id ?? DEFAULT_CLIENT_ID,
    client_mode: patch.client_mode ?? existing?.client_mode ?? DEFAULT_CLIENT_MODE,
    platform: patch.platform ?? existing?.platform ?? (process.platform || 'node'),
    public_key: patch.public_key ?? existing?.public_key ?? null,
    private_key: patch.private_key ?? existing?.private_key ?? null,
    device_token: patch.device_token ?? existing?.device_token ?? null,
    granted_scopes: patch.granted_scopes ?? existing?.granted_scopes ?? [],
    last_error: patch.last_error ?? existing?.last_error ?? null,
    last_checked_at: patch.last_checked_at ?? existing?.last_checked_at ?? null,
  };

  await pool.query(
    `INSERT INTO openclaw_integration_state (
      id, status, gateway_url, device_id, client_id, client_mode, platform,
      public_key, private_key, device_token,
      granted_scopes, last_error, last_checked_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10,
      $11::jsonb, $12, $13
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      gateway_url = EXCLUDED.gateway_url,
      device_id = EXCLUDED.device_id,
      client_id = EXCLUDED.client_id,
      client_mode = EXCLUDED.client_mode,
      platform = EXCLUDED.platform,
      public_key = EXCLUDED.public_key,
      private_key = EXCLUDED.private_key,
      device_token = EXCLUDED.device_token,
      granted_scopes = EXCLUDED.granted_scopes,
      last_error = EXCLUDED.last_error,
      last_checked_at = EXCLUDED.last_checked_at`,
    [
      next.id,
      next.status,
      next.gateway_url,
      next.device_id,
      next.client_id,
      next.client_mode,
      next.platform,
      next.public_key,
      next.private_key,
      next.device_token,
      JSON.stringify(next.granted_scopes || []),
      next.last_error,
      next.last_checked_at,
    ],
  );
}

function mapPairingErrorToStatus(error) {
  const rpcCode = String(error?.rpcCode || error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();

  if (
    rpcCode === 'NOT_PAIRED' ||
    message.includes('not paired') ||
    message.includes('device identity mismatch')
  ) {
    return 'pending_pairing';
  }

  if (
    rpcCode === 'SERVICE_TIMEOUT' ||
    rpcCode === 'SERVICE_NOT_CONFIGURED' ||
    rpcCode === 'GATEWAY_UNREACHABLE' ||
    message.includes('timed out') ||
    message.includes('gateway')
  ) {
    return 'gateway_unreachable';
  }

  return 'paired_missing_scopes';
}

function buildStatusFromRow(row = null) {
  if (!row) {
    return {
      status: 'uninitialized',
      ready: false,
      requiredScopes: [...REQUIRED_OPERATOR_SCOPES],
      grantedScopes: [],
      missingScopes: [...REQUIRED_OPERATOR_SCOPES],
      lastError: null,
      lastCheckedAt: null,
    };
  }

  const grantedScopes = normalizeScopes(row.granted_scopes);
  const missingScopes = REQUIRED_OPERATOR_SCOPES.filter((scope) => !grantedScopes.includes(scope));

  const status =
    row.status === 'ready' && missingScopes.length > 0 ? 'paired_missing_scopes' : row.status || 'uninitialized';

  return {
    status,
    ready: status === 'ready' && missingScopes.length === 0,
    requiredScopes: [...REQUIRED_OPERATOR_SCOPES],
    grantedScopes: [...grantedScopes],
    missingScopes: [...missingScopes],
    gatewayUrl: row.gateway_url || null,
    deviceId: row.device_id || null,
    clientId: row.client_id || null,
    clientMode: row.client_mode || null,
    platform: row.platform || null,
    lastError: row.last_error || null,
    lastCheckedAt: row.last_checked_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function getIntegrationStatus() {
  try {
    const row = await getIntegrationStatusRow();
    return buildStatusFromRow(row);
  } catch (error) {
    if (error.code === '42P01') {
      return buildStatusFromRow(null);
    }
    throw error;
  }
}

async function getDeviceAuthFromDb() {
  const row = await getIntegrationRow();
  if (!row) return null;

  const privateKeyMaterial = deserializeStoredSecret(row.private_key);
  const deviceToken = deserializeStoredSecret(row.device_token);
  if (!row.device_id || !row.public_key || !privateKeyMaterial || !deviceToken) {
    return null;
  }

  const privateKey = privateKeyFromStoredMaterial(privateKeyMaterial);
  if (!privateKey) return null;

  return {
    deviceId: row.device_id,
    publicKey: row.public_key,
    privateKey,
    deviceToken,
    clientId: row.client_id || DEFAULT_CLIENT_ID,
    clientMode: row.client_mode || DEFAULT_CLIENT_MODE,
    platform: row.platform || process.platform || 'node',
  };
}

async function startPairing() {
  const existing = await getIntegrationRow();
  const hasReusablePendingIdentity =
    existing?.status === 'pending_pairing' &&
    existing?.device_id &&
    existing?.public_key &&
    existing?.private_key &&
    existing?.device_token;

  if (!hasReusablePendingIdentity) {
    const identity = generateDeviceIdentity();

    await upsertIntegrationRow({
      status: 'pending_pairing',
      gateway_url: config.openclaw.gatewayUrl || null,
      device_id: identity.deviceId,
      client_id: identity.clientId,
      client_mode: identity.clientMode,
      platform: identity.platform,
      public_key: identity.publicKey,
      private_key: serializeStoredSecret(identity.privateSeed),
      device_token: serializeStoredSecret(identity.deviceToken),
      granted_scopes: [],
      last_error: null,
      last_checked_at: new Date().toISOString(),
    });
  } else {
    await upsertIntegrationRow({
      status: 'pending_pairing',
      gateway_url: config.openclaw.gatewayUrl || null,
      granted_scopes: [],
      last_error: null,
      last_checked_at: new Date().toISOString(),
    });
  }

  // Attempting a device-auth RPC here intentionally creates/refreshes pairing request server-side.
  try {
    const connectMeta = {};
    await gatewayWsRpc(
      'sessions.list',
      { limit: 1, includeGlobal: true, includeUnknown: false },
      {
        deviceAuth: await getDeviceAuthFromDb(),
        requireDeviceAuth: true,
        onConnectOk: (connectPayload) => {
          Object.assign(connectMeta, connectPayload || {});
        },
      },
    );

    const grantedScopes = normalizeScopes(connectMeta?.auth?.scopes);
    const rotatedDeviceToken =
      typeof connectMeta?.auth?.deviceToken === 'string'
        ? connectMeta.auth.deviceToken.trim()
        : '';

    // If it succeeds immediately, we can mark ready.
    await upsertIntegrationRow({
      status: 'ready',
      granted_scopes: grantedScopes.length > 0 ? grantedScopes : REQUIRED_OPERATOR_SCOPES,
      ...(rotatedDeviceToken ? { device_token: serializeStoredSecret(rotatedDeviceToken) } : {}),
      last_error: null,
      last_checked_at: new Date().toISOString(),
    });
  } catch (error) {
    await upsertIntegrationRow({
      status: mapPairingErrorToStatus(error),
      last_error: error?.message || 'pairing check failed',
      last_checked_at: new Date().toISOString(),
    });
  }

  return getIntegrationStatus();
}

async function finalizePairing() {
  const deviceAuth = await getDeviceAuthFromDb();
  if (!deviceAuth) {
    throw createHttpError(
      409,
      'Pairing has not been started. Start pairing before finalize.',
      'PAIRING_NOT_STARTED',
    );
  }

  try {
    const connectMeta = {};
    await gatewayWsRpc(
      'sessions.list',
      { limit: 1, includeGlobal: true, includeUnknown: false },
      {
        deviceAuth,
        requireDeviceAuth: true,
        onConnectOk: (connectPayload) => {
          Object.assign(connectMeta, connectPayload || {});
        },
      },
    );

    const grantedScopes = normalizeScopes(connectMeta?.auth?.scopes);
    const rotatedDeviceToken =
      typeof connectMeta?.auth?.deviceToken === 'string'
        ? connectMeta.auth.deviceToken.trim()
        : '';

    await upsertIntegrationRow({
      status: 'ready',
      granted_scopes: grantedScopes.length > 0 ? grantedScopes : REQUIRED_OPERATOR_SCOPES,
      ...(rotatedDeviceToken ? { device_token: serializeStoredSecret(rotatedDeviceToken) } : {}),
      last_error: null,
      last_checked_at: new Date().toISOString(),
    });
  } catch (error) {
    await upsertIntegrationRow({
      status: mapPairingErrorToStatus(error),
      granted_scopes: [],
      last_error: error?.message || 'pairing finalize failed',
      last_checked_at: new Date().toISOString(),
    });
  }

  return getIntegrationStatus();
}

async function assertIntegrationReady() {
  const status = await getIntegrationStatus();
  if (!status.ready) {
    throw createHttpError(
      503,
      'OpenClaw pairing is required before using this feature. Complete the pairing wizard first.',
      'OPENCLAW_PAIRING_REQUIRED',
      {
        status: status.status,
        missingScopes: status.missingScopes,
      },
    );
  }
  return status;
}

module.exports = {
  REQUIRED_OPERATOR_SCOPES,
  getIntegrationStatus,
  assertIntegrationReady,
  startPairing,
  finalizePairing,
};
