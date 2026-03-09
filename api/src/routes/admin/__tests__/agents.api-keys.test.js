const express = require('express');
const request = require('supertest');

jest.mock('../../../db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../../auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'owner-1', role: 'owner' };
    next();
  },
  requireManageUsers: (req, res, next) => {
    if (!['admin', 'owner'].includes(req.user?.role)) {
      return res.status(403).json({ error: { message: 'forbidden', status: 403 } });
    }
    next();
  },
}));

jest.mock('../../../services/agentReconciliationService', () => ({
  reconcileAgentsFromOpenClaw: jest.fn(),
}));

const pool = require('../../../db/pool');
const { reconcileAgentsFromOpenClaw } = require('../../../services/agentReconciliationService');
const router = require('../agents');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/agents', router);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ error: { message: err.message, status: err.status || 500 } });
  });
  return app;
}

describe('admin agents routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    reconcileAgentsFromOpenClaw.mockResolvedValue({
      discoveredCount: 1,
      upserted: 1,
      deactivated: 0,
      discoveredIds: ['main'],
    });
    app = makeApp();
  });

  it('POST /sync runs manual reconcile', async () => {
    const res = await request(app).post('/api/v1/admin/agents/sync').send({});

    expect(res.status).toBe(200);
    expect(reconcileAgentsFromOpenClaw).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'manual', actorUserId: 'owner-1' }),
    );
  });

  it('POST /sync bubbles reconcile error', async () => {
    reconcileAgentsFromOpenClaw.mockRejectedValueOnce(new Error('sync failed'));

    const res = await request(app).post('/api/v1/admin/agents/sync').send({});
    expect(res.status).toBe(500);
    expect(res.body.error.message).toContain('sync failed');
  });

  it('GET / lists agents with key counts', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ agent_id: 'main', name: 'Main', active_key_count: '2' }],
    });

    const res = await request(app).get('/api/v1/admin/agents');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].agent_id).toBe('main');
  });

  it('GET / bubbles db error', async () => {
    pool.query.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/api/v1/admin/agents');
    expect(res.status).toBe(500);
  });

  it('POST / validates required fields', async () => {
    const res = await request(app).post('/api/v1/admin/agents').send({ agentId: 'a1' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('agentId and name are required');
  });

  it('POST / rejects invalid agentId slug', async () => {
    const res = await request(app)
      .post('/api/v1/admin/agents')
      .send({ agentId: 'Bad Slug', name: 'Bad' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('valid slug');
  });

  it('POST / rejects invalid status', async () => {
    const res = await request(app)
      .post('/api/v1/admin/agents')
      .send({ agentId: 'worker', name: 'Worker', status: 'paused' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('status must be one of');
  });

  it('POST / rejects invalid reportsTo slug', async () => {
    const res = await request(app)
      .post('/api/v1/admin/agents')
      .send({ agentId: 'worker', name: 'Worker', reportsTo: 'Bad Slug' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('reportsTo must be a valid agentId slug');
  });

  it('POST / rejects self reportsTo reference', async () => {
    const res = await request(app)
      .post('/api/v1/admin/agents')
      .send({ agentId: 'worker', name: 'Worker', reportsTo: 'worker' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('cannot reference the same agent');
  });

  it('POST / creates agent', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ agent_id: 'worker', name: 'Worker', status: 'active' }],
    });

    const res = await request(app)
      .post('/api/v1/admin/agents')
      .send({ agentId: 'worker', name: 'Worker' });

    expect(res.status).toBe(201);
    expect(res.body.data.agent_id).toBe('worker');
  });

  it('POST / maps unique violation to AGENT_EXISTS', async () => {
    const err = new Error('dup');
    err.code = '23505';
    pool.query.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/v1/admin/agents')
      .send({ agentId: 'worker', name: 'Worker' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('AGENT_EXISTS');
  });

  it('POST / maps invalid reportsTo FK to INVALID_REPORTS_TO', async () => {
    const err = new Error('fk violation');
    err.code = '23503';
    pool.query.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/v1/admin/agents')
      .send({ agentId: 'worker', name: 'Worker', reportsTo: 'missing' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REPORTS_TO');
  });

  it('POST / maps check constraint to INVALID_AGENT_INPUT', async () => {
    const err = new Error('check');
    err.code = '23514';
    pool.query.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/v1/admin/agents')
      .send({ agentId: 'worker', name: 'Worker' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_AGENT_INPUT');
  });

  it('GET /:agentId/keys returns key list', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'k1', agent_id: 'main' }] });

    const res = await request(app).get('/api/v1/admin/agents/main/keys');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('POST /:agentId/keys returns 404 when agent missing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/v1/admin/agents/missing/keys').send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('AGENT_NOT_FOUND');
  });

  it('POST /:agentId/keys creates API key and stores creator user id', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ agent_id: 'main' }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '33333333-3333-3333-3333-333333333333',
            agent_id: 'main',
            key_prefix: 'mba_abcdef12',
            label: 'test',
            created_at: new Date().toISOString(),
          },
        ],
      });

    const res = await request(app).post('/api/v1/admin/agents/main/keys').send({ label: 'test' });

    expect(res.status).toBe(201);
    expect(res.body.data.agent_id).toBe('main');
    expect(res.body.data.apiKey).toMatch(/^mba_/);
    expect(pool.query).toHaveBeenLastCalledWith(expect.any(String), [
      'main',
      expect.any(String),
      expect.stringMatching(/^mba_/),
      'test',
      'owner-1',
    ]);
  });

  it('POST /:agentId/keys bubbles db error', async () => {
    pool.query.mockRejectedValueOnce(new Error('db error'));

    const res = await request(app).post('/api/v1/admin/agents/main/keys').send({});
    expect(res.status).toBe(500);
  });

  it('POST /:agentId/keys/:keyId/revoke revokes active key', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 'k1', agent_id: 'main' }] });

    const res = await request(app).post('/api/v1/admin/agents/main/keys/k1/revoke').send({});
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('k1');
  });

  it('POST /:agentId/keys/:keyId/revoke returns 404 when key missing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/v1/admin/agents/main/keys/missing/revoke').send({});
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('KEY_NOT_FOUND');
  });
});
