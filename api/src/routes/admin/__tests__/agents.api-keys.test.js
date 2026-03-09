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

const pool = require('../../../db/pool');
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

describe('admin agents API key routes', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    app = makeApp();
  });

  it('creates agent API key and returns plaintext once', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ agent_id: 'main' }] }) // agent exists
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

    const res = await request(app)
      .post('/api/v1/admin/agents/main/keys')
      .send({ label: 'test' });

    expect(res.status).toBe(201);
    expect(res.body.data.agent_id).toBe('main');
    expect(res.body.data.apiKey).toMatch(/^mba_/);
  });
});
