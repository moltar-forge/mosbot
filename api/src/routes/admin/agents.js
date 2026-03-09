const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../../db/pool');
const { authenticateToken, requireManageUsers } = require('../auth');
const { reconcileAgentsFromOpenClaw } = require('../../services/agentReconciliationService');

router.use(authenticateToken);
router.use(requireManageUsers);

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

    const slugRegex = /^[a-z0-9_-]+$/;
    if (!slugRegex.test(agentId)) {
      return res.status(400).json({
        error: { message: 'agentId must be a valid slug (lowercase, alphanumeric, hyphens, underscores)', status: 400 },
      });
    }

    const validStatuses = new Set(['scaffolded', 'active', 'deprecated']);
    if (!validStatuses.has(status)) {
      return res.status(400).json({
        error: { message: 'status must be one of: scaffolded, active, deprecated', status: 400 },
      });
    }

    if (reportsTo && !slugRegex.test(reportsTo)) {
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
        error: { message: 'reportsTo must reference an existing agent_id', status: 400, code: 'INVALID_REPORTS_TO' },
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
