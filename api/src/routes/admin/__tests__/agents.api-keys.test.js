const express = require('express');
const request = require('supertest');

jest.mock('../../../db/pool', () => {
  const query = jest.fn();
  const release = jest.fn();
  const connect = jest.fn(async () => ({ query, release }));
  return { query, connect, __release: release };
});

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

jest.mock('../../../services/openclawWorkspaceClient', () => ({
  makeOpenClawRequest: jest.fn(),
}));

jest.mock('../../../services/openclawGatewayClient', () => ({
  gatewayWsRpc: jest.fn(),
  sessionsListAllViaWs: jest.fn(),
}));

jest.mock('../../../utils/configParser', () => ({
  parseOpenClawConfig: jest.fn(),
}));

jest.mock('../../../services/activityLogService', () => ({
  recordActivityLogEventSafe: jest.fn(),
}));

const pool = require('../../../db/pool');
const { reconcileAgentsFromOpenClaw } = require('../../../services/agentReconciliationService');
const { makeOpenClawRequest } = require('../../../services/openclawWorkspaceClient');
const { gatewayWsRpc, sessionsListAllViaWs } = require('../../../services/openclawGatewayClient');
const { parseOpenClawConfig } = require('../../../utils/configParser');
const { recordActivityLogEventSafe } = require('../../../services/activityLogService');
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
    reconcileAgentsFromOpenClaw.mockResolvedValue({
      discoveredCount: 1,
      upserted: 1,
      deactivated: 0,
      discoveredIds: ['main'],
    });
    makeOpenClawRequest.mockResolvedValue({ content: '{}' });
    parseOpenClawConfig.mockReturnValue({ agents: { list: [] } });
    sessionsListAllViaWs.mockResolvedValue({ sessions: [] });
    gatewayWsRpc.mockResolvedValue({ hash: 'h2' });
    recordActivityLogEventSafe.mockResolvedValue(null);
    app = makeApp();
  });

  it('runs manual reconcile sync endpoint', async () => {
    const res = await request(app).post('/api/v1/admin/agents/sync').send({});

    expect(res.status).toBe(200);
    expect(reconcileAgentsFromOpenClaw).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'manual' }),
    );
    expect(res.body.data.discoveredIds).toEqual(['main']);
  });

  it('rejects invalid agentId slug on create', async () => {
    const res = await request(app)
      .post('/api/v1/admin/agents')
      .send({ agentId: 'Bad Slug', name: 'Bad' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('valid slug');
  });

  it('maps invalid reportsTo FK to 400', async () => {
    const err = new Error('fk violation');
    err.code = '23503';
    pool.query.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/v1/admin/agents')
      .send({ agentId: 'worker', name: 'Worker', reportsTo: 'missing' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REPORTS_TO');
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

  it('protects main agent from deletion', async () => {
    const res = await request(app).delete('/api/v1/admin/agents/main');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MAIN_AGENT_PROTECTED');
  });

  it('blocks delete when active sessions exist and force is not set', async () => {
    parseOpenClawConfig.mockReturnValue({ agents: { list: [{ id: 'coo' }] } });
    sessionsListAllViaWs.mockResolvedValue({
      sessions: [{ key: 'agent:coo:main', kind: 'main' }],
    });

    const res = await request(app).delete('/api/v1/admin/agents/coo');

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_SESSIONS_EXIST');
    expect(gatewayWsRpc).not.toHaveBeenCalled();
  });

  it('allows delete when only stale sessions exist', async () => {
    parseOpenClawConfig.mockReturnValue({
      agents: {
        list: [
          { id: 'coo', default: true },
          { id: 'cto' },
        ],
      },
    });

    sessionsListAllViaWs.mockResolvedValue({
      sessions: [{ key: 'agent:coo:main', updatedAt: '2026-03-12T12:00:00.000Z' }],
    });

    pool.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ agent_id: 'coo', active: true, status: 'active' }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rowCount: 1 }) // clear reports_to
      .mockResolvedValueOnce({ rows: [] }) // revoke keys
      .mockResolvedValueOnce({ rows: [] }) // assignments
      .mockResolvedValueOnce({ rows: [{ agent_id: 'coo', active: false, status: 'deprecated' }] }) // soft delete
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app).delete('/api/v1/admin/agents/coo');

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      agentId: 'coo',
      activeSessionsCount: 0,
      staleSessionsCount: 1,
    });
  });

  it('deletes an agent end-to-end with runtime + DB cleanup', async () => {
    parseOpenClawConfig.mockReturnValue({
      agents: {
        list: [
          { id: 'coo', default: true },
          { id: 'cto' },
        ],
      },
    });

    pool.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ agent_id: 'coo', active: true, status: 'active' }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rowCount: 2 }) // clear reports_to
      .mockResolvedValueOnce({ rows: [{ id: 'k1' }, { id: 'k2' }] }) // revoke keys
      .mockResolvedValueOnce({ rows: [{ project_id: 'p1' }] }) // assignments
      .mockResolvedValueOnce({ rows: [{ agent_id: 'coo', active: false, status: 'deprecated' }] }) // soft delete
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app).delete('/api/v1/admin/agents/coo?force=true');

    expect(res.status).toBe(200);
    expect(gatewayWsRpc).toHaveBeenCalledWith(
      'config.apply',
      expect.objectContaining({ note: expect.stringContaining('Delete agent coo') }),
    );
    expect(res.body.data).toMatchObject({
      agentId: 'coo',
      deleted: true,
      runtimeRemoved: true,
      dbSoftDeleted: true,
      revokedKeys: 2,
      removedAssignments: 1,
      reportsToCleared: 2,
    });
    expect(recordActivityLogEventSafe).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'agent_deleted', agent_id: 'coo' }),
    );
  });
});
