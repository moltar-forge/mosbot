const crypto = require('crypto');
const pool = require('../db/pool');
const config = require('../config');
const { getJwtSecret } = require('../utils/jwt');
const { gatewayWsRpc } = require('./openclawGatewayClient');

const REQUIRED_OPERATOR_SCOPES = [
  'operator.admin',
  'operator.approvals',
  'operator.pairing',
  'operator.read',
  'operator.write',
];

const DEFAULT_CLIENT_ID = 'mosbot';
const DEFAULT_CLIENT_MODE = 'backend';

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

function deriveEncryptionKey() {
  const secret = getJwtSecret();
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptSecret(plaintext) {
  if (!plaintext) return null;
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

function decryptSecret(payload) {
  if (!payload) return null;
  const [ivB64, tagB64, dataB64] = String(payload).split('.');
  if (!ivB64 || !tagB64 || !dataB64) return null;

  const key = deriveEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
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

function generateDeviceIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicSpki = publicKey.export({ format: 'der', type: 'spki' });
  const privatePkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' });

  const publicKeyRaw = Buffer.from(publicSpki).subarray(-32).toString('base64url');
  const privateSeed = Buffer.from(privatePkcs8).subarray(-32).toString('base64url');

  return {
    deviceId: crypto.randomBytes(32).toString('hex'),
    publicKey: publicKeyRaw,
    privateSeed,
    deviceToken: crypto.randomBytes(32).toString('base64url'),
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
    private_key_encrypted: patch.private_key_encrypted ?? existing?.private_key_encrypted ?? null,
    device_token_encrypted: patch.device_token_encrypted ?? existing?.device_token_encrypted ?? null,
    granted_scopes: patch.granted_scopes ?? existing?.granted_scopes ?? [],
    last_error: patch.last_error ?? existing?.last_error ?? null,
    last_checked_at: patch.last_checked_at ?? existing?.last_checked_at ?? null,
  };

  await pool.query(
    `INSERT INTO openclaw_integration_state (
      id, status, gateway_url, device_id, client_id, client_mode, platform,
      public_key, private_key_encrypted, device_token_encrypted,
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
      private_key_encrypted = EXCLUDED.private_key_encrypted,
      device_token_encrypted = EXCLUDED.device_token_encrypted,
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
      next.private_key_encrypted,
      next.device_token_encrypted,
      JSON.stringify(next.granted_scopes || []),
      next.last_error,
      next.last_checked_at,
    ],
  );
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

  const privateSeed = decryptSecret(row.private_key_encrypted);
  const deviceToken = decryptSecret(row.device_token_encrypted);
  if (!row.device_id || !row.public_key || !privateSeed || !deviceToken) {
    return null;
  }

  return {
    deviceId: row.device_id,
    publicKey: row.public_key,
    privateKey: privateKeyFromSeedB64(privateSeed),
    deviceToken,
    clientId: row.client_id || DEFAULT_CLIENT_ID,
    clientMode: row.client_mode || DEFAULT_CLIENT_MODE,
    platform: row.platform || process.platform || 'node',
  };
}

async function startPairing() {
  const identity = generateDeviceIdentity();

  await upsertIntegrationRow({
    status: 'pending_pairing',
    gateway_url: config.openclaw.gatewayUrl || null,
    device_id: identity.deviceId,
    client_id: identity.clientId,
    client_mode: identity.clientMode,
    platform: identity.platform,
    public_key: identity.publicKey,
    private_key_encrypted: encryptSecret(identity.privateSeed),
    device_token_encrypted: encryptSecret(identity.deviceToken),
    granted_scopes: [],
    last_error: null,
    last_checked_at: new Date().toISOString(),
  });

  // Attempting a device-auth RPC here intentionally creates/refreshes pairing request server-side.
  try {
    await gatewayWsRpc(
      'sessions.list',
      { limit: 1, includeGlobal: true, includeUnknown: false },
      { deviceAuth: await getDeviceAuthFromDb(), requireDeviceAuth: true },
    );

    // If it succeeds immediately, we can mark ready.
    await upsertIntegrationRow({
      status: 'ready',
      granted_scopes: REQUIRED_OPERATOR_SCOPES,
      last_error: null,
      last_checked_at: new Date().toISOString(),
    });
  } catch (error) {
    await upsertIntegrationRow({
      status: error?.rpcCode === 'NOT_PAIRED' ? 'pending_pairing' : 'paired_missing_scopes',
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
    await gatewayWsRpc(
      'sessions.list',
      { limit: 1, includeGlobal: true, includeUnknown: false },
      { deviceAuth, requireDeviceAuth: true },
    );

    await upsertIntegrationRow({
      status: 'ready',
      granted_scopes: REQUIRED_OPERATOR_SCOPES,
      last_error: null,
      last_checked_at: new Date().toISOString(),
    });
  } catch (error) {
    await upsertIntegrationRow({
      status: error?.rpcCode === 'NOT_PAIRED' ? 'pending_pairing' : 'paired_missing_scopes',
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
