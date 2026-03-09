const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../../db/pool');
const { authenticateToken, requireManageUsers } = require('../auth');

router.use(authenticateToken);
router.use(requireManageUsers);

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
    const { agentId, name, title = null, status = 'active', reportsTo = null, department = null, meta = null } = req.body;

    if (!agentId || !name) {
      return res.status(400).json({
        error: { message: 'agentId and name are required', status: 400 },
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
