const express = require('express');
const request = require('supertest');

jest.mock('../../../db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed'),
}));

jest.mock('../../../utils/logger', () => ({
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../../services/openclawWorkspaceClient', () => ({
  makeOpenClawRequest: jest.fn(),
}));

jest.mock('../../auth', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = {
      id: req.headers['x-test-user-id'] || 'admin-user',
      role: req.headers['x-test-role'] || 'admin',
    };
    next();
  },
  requireManageUsers: (req, res, next) => {
    if (!['admin', 'owner'].includes(req.user?.role)) {
      return res.status(403).json({
        error: { message: 'Admin or owner access required to manage users', status: 403 },
      });
    }
    next();
  },
}));

const pool = require('../../../db/pool');
const logger = require('../../../utils/logger');
const { makeOpenClawRequest } = require('../../../services/openclawWorkspaceClient');
const usersRouter = require('../users');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/admin/users', usersRouter);
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({
      error: { message: err.message, status: err.status || 500 },
    });
  });
  return app;
}

describe('admin users legacy-agent cutover behavior', () => {
  let app;

  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockReset();
    makeOpenClawRequest.mockReset();
    app = makeApp();
  });

  it('GET / merges includeAgentConfig for admin users only', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ total: '3' }] }).mockResolvedValueOnce({
      rows: [
        { id: 'u1', role: 'agent', agent_id: 'coo' },
        { id: 'u2', role: 'admin', agent_id: 'cto' },
        { id: 'u3', role: 'user', agent_id: null },
      ],
    });
    makeOpenClawRequest.mockResolvedValueOnce({
      content: JSON.stringify({
        agents: {
          list: [
            { id: 'coo', workspace: '/w-coo', identity: { name: 'COO' }, model: { primary: 'x' } },
            { id: 'cto', workspace: '/w-cto', identity: { name: 'CTO' }, model: { primary: 'y' } },
          ],
        },
      }),
    });

    const res = await request(app).get('/api/v1/admin/users?includeAgentConfig=true');
    expect(res.status).toBe(200);
    expect(res.body.data[0].agentConfig).toBeUndefined();
    expect(res.body.data[1].agentConfig.id).toBe('cto');
    expect(res.body.data[2].agentConfig).toBeUndefined();
  });

  it('GET /:id merges includeAgentConfig for admin users only', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    pool.query.mockResolvedValueOnce({ rows: [{ id, role: 'admin', agent_id: 'coo' }] });
    makeOpenClawRequest.mockResolvedValueOnce({
      content: JSON.stringify({
        agents: { list: [{ id: 'coo', workspace: '/w', identity: { name: 'COO' } }] },
      }),
    });

    const res = await request(app).get(`/api/v1/admin/users/${id}?includeAgentConfig=true`);
    expect(res.status).toBe(200);
    expect(res.body.data.agentConfig.id).toBe('coo');
  });

  it('POST / rejects creating legacy role=agent users', async () => {
    const res = await request(app).post('/api/v1/admin/users').send({
      name: 'Agent User',
      email: 'agent@example.com',
      password: 'password123',
      role: 'agent',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AGENT_USER_DEPRECATED');
  });

  it('POST / rejects agent_id on users', async () => {
    const res = await request(app).post('/api/v1/admin/users').send({
      name: 'Admin User',
      email: 'admin@example.com',
      password: 'password123',
      role: 'admin',
      agent_id: 'coo',
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AGENT_USER_DEPRECATED');
  });

  it('PUT /:id rejects assigning role=agent', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    pool.query.mockResolvedValueOnce({ rows: [{ id, role: 'user', agent_id: null }] });

    const res = await request(app).put(`/api/v1/admin/users/${id}`).send({ role: 'agent' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AGENT_USER_DEPRECATED');
  });

  it('PUT /:id rejects setting agent_id on users', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';
    pool.query.mockResolvedValueOnce({ rows: [{ id, role: 'admin', agent_id: null }] });

    const res = await request(app).put(`/api/v1/admin/users/${id}`).send({ agent_id: 'coo' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AGENT_USER_DEPRECATED');
  });

  it('PUT /:id/agent returns 410 endpoint deprecated', async () => {
    const id = '550e8400-e29b-41d4-a716-446655440000';

    const res = await request(app).put(`/api/v1/admin/users/${id}/agent`).send({ agentId: 'coo' });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('ENDPOINT_DEPRECATED');
  });

  it('GET / continues without merge when OpenClaw config read fails', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1', role: 'admin', agent_id: 'coo' }] });
    makeOpenClawRequest.mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 }));

    const res = await request(app).get('/api/v1/admin/users?includeAgentConfig=true');
    expect(res.status).toBe(200);
    expect(res.body.data[0].agentConfig).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to read OpenClaw config for agent merge',
      expect.any(Object),
    );
  });
});
