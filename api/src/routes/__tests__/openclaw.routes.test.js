/**
 * Comprehensive tests for OpenClaw routes
 *
 * Tests cover:
 * - Workspace file operations (GET/POST/PUT/DELETE)
 * - Agents endpoint
 * - Agents config endpoints
 * - Sessions endpoints
 * - Cron-jobs endpoints
 * - Usage endpoints
 * - Config endpoints
 * - Path validation and normalization
 * - Role-based access control
 *
 * Mocks pool and fetch so no live database or OpenClaw is needed.
 */

jest.mock('../../db/pool', () => ({
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
}));

jest.mock('../../services/activityLogService', () => ({
  recordActivityLogEventSafe: jest.fn(),
}));

jest.mock('../../services/openclawGatewayClient', () => ({
  cronList: jest.fn(),
  gatewayWsRpc: jest.fn(),
  invokeTool: jest.fn(),
  sessionsListAllViaWs: jest.fn(),
  sessionsList: jest.fn(),
  sessionsHistory: jest.fn(),
}));

jest.mock('../../services/sessionUsageService', () => ({
  upsertSessionUsageBatch: jest.fn(),
}));

jest.mock('../../services/cronJobsService', () => ({
  createCronJob: jest.fn(),
  updateCronJob: jest.fn(),
  updateHeartbeatJob: jest.fn(),
  repairCronJobs: jest.fn(),
}));

jest.mock('../../services/docsLinkReconciliationService', () => ({
  ensureDocsLinkIfMissing: jest.fn().mockResolvedValue({ action: 'unchanged' }),
  ensureProjectLinkIfMissing: jest.fn().mockResolvedValue({ action: 'unchanged' }),
}));

jest.mock('../../services/openclawIntegrationService', () => ({
  REQUIRED_OPERATOR_SCOPES: [
    'operator.admin',
    'operator.approvals',
    'operator.pairing',
    'operator.read',
    'operator.write',
  ],
  getIntegrationStatus: jest.fn(),
  assertIntegrationReady: jest.fn(),
  startPairing: jest.fn(),
  finalizePairing: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const openclawRouter = require('../openclaw');
const pool = require('../../db/pool');
const { recordActivityLogEventSafe } = require('../../services/activityLogService');
const {
  cronList,
  gatewayWsRpc,
  invokeTool,
  sessionsListAllViaWs,
  sessionsHistory,
} = require('../../services/openclawGatewayClient');
const { createCronJob } = require('../../services/cronJobsService');
const { upsertSessionUsageBatch } = require('../../services/sessionUsageService');
const {
  ensureDocsLinkIfMissing,
  ensureProjectLinkIfMissing,
} = require('../../services/docsLinkReconciliationService');
const {
  getIntegrationStatus,
  assertIntegrationReady,
  startPairing,
  finalizePairing,
} = require('../../services/openclawIntegrationService');
const bcrypt = require('bcrypt');

// Helper to get JWT token for a user
function getToken(userId, role, extraClaims = {}) {
  const jwtSecret = process.env.JWT_SECRET || 'test-only-jwt-secret-not-for-production';
  return jwt.sign({ id: userId, role, email: `${role}@example.com`, ...extraClaims }, jwtSecret, {
    expiresIn: '1h',
  });
}

describe('OpenClaw Routes', () => {
  let app;
  let originalFetch;
  let mockOpenClawUrl;

  beforeAll(() => {
    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/v1/openclaw', openclawRouter);

    // Add error handler middleware (matching main app)
    app.use((err, req, res, _next) => {
      res.status(err.status || 500).json({
        error: {
          message: err.message || 'Internal server error',
          status: err.status || 500,
        },
      });
    });

    // Mock fetch globally
    originalFetch = global.fetch;
    mockOpenClawUrl = 'http://mock-openclaw:18780';
    process.env.OPENCLAW_WORKSPACE_URL = mockOpenClawUrl;
  });

  afterAll(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    delete process.env.OPENCLAW_WORKSPACE_URL;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    recordActivityLogEventSafe.mockResolvedValue(undefined);
    cronList.mockResolvedValue([]);
    gatewayWsRpc.mockResolvedValue({});
    invokeTool.mockResolvedValue({ status: 'ok', reply: 'DONE', runId: 'run-1' });
    getIntegrationStatus.mockResolvedValue({
      status: 'ready',
      ready: true,
      requiredScopes: [
        'operator.admin',
        'operator.approvals',
        'operator.pairing',
        'operator.read',
        'operator.write',
      ],
      grantedScopes: [
        'operator.admin',
        'operator.approvals',
        'operator.pairing',
        'operator.read',
        'operator.write',
      ],
      missingScopes: [],
    });
    assertIntegrationReady.mockResolvedValue({ ready: true });
    startPairing.mockResolvedValue({ status: 'pending_pairing', ready: false });
    finalizePairing.mockResolvedValue({ status: 'ready', ready: true });
    sessionsListAllViaWs.mockResolvedValue([]);
    sessionsHistory.mockResolvedValue({ messages: [] });
    upsertSessionUsageBatch.mockResolvedValue(undefined);
    ensureDocsLinkIfMissing.mockReset();
    ensureDocsLinkIfMissing.mockResolvedValue({ action: 'unchanged' });
    ensureProjectLinkIfMissing.mockReset();
    ensureProjectLinkIfMissing.mockResolvedValue({ action: 'unchanged' });
    pool.query.mockReset();
    pool.query.mockResolvedValue({ rows: [] });
    pool.connect.mockReset();
    pool.connect.mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    });
  });

  describe('Path normalization and validation', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ files: [] }),
        text: async () => 'OK',
      });
    });

    it('should normalize relative paths to absolute', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: 'docs/test.md' });

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/files?path=%2Fdocs%2Ftest.md'),
        expect.any(Object),
      );
    });

    it('should normalize Windows-style paths', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '\\docs\\test.md' });

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/files?path=%2Fdocs%2Ftest.md'),
        expect.any(Object),
      );
    });

    it('should reject path traversal attempts', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '/../etc/passwd' });

      // Path gets normalized to /etc/passwd which is then rejected as not allowed (403)
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PATH_NOT_ALLOWED');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject paths with multiple traversal attempts', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '/docs/../../etc/passwd' });

      // Path gets normalized to /etc/passwd which is then rejected as not allowed (403)
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PATH_NOT_ALLOWED');
    });

    it('should not allow root path', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '/' });

      expect(response.status).toBe(403);
    });

    it('should default to root path when not provided', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/files?path=%2F'),
        expect.any(Object),
      );
    });
  });

  describe('Path access control', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ files: [] }),
        text: async () => 'OK',
      });
    });

    it('should allow access to /docs paths', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '/docs/test.md' });

      expect(response.status).toBe(200);
    });

    it('should allow access to /projects paths', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '/projects/test' });

      expect(response.status).toBe(200);
    });

    it('should allow access to /workspace paths', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '/workspace/test' });

      expect(response.status).toBe(200);
    });

    it('should reject access to disallowed paths', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '/forbidden/path' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PATH_NOT_ALLOWED');
    });
  });

  describe('GET /api/v1/openclaw/workspace/files/content - docs access', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: 'Document content',
          size: 18,
          modified: new Date().toISOString(),
          encoding: 'utf8',
        }),
        text: async () => 'OK',
      });
    });

    it('should allow regular users to read /docs files', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files/content')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '/docs/readme.md' });

      expect(response.status).toBe(200);
      expect(response.body.data.content).toBe('Document content');
    });

    it('should allow regular users to read root /docs', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/files/content')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '/docs' });

      expect(response.status).toBe(200);
    });
  });

  describe('POST /api/v1/openclaw/workspace/files - system config protection', () => {
    beforeEach(() => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async (_url, _options) => {
        callCount++;
        if (callCount === 1) {
          // Existence check - file doesn't exist
          return {
            ok: false,
            status: 404,
            text: async () => 'Not Found',
          };
        } else {
          // File creation succeeds
          return {
            ok: true,
            status: 201,
            json: async () => ({ path: '/openclaw.json', created: true }),
            text: async () => 'Created',
          };
        }
      });
    });

    it('should block agent role from creating system config files', async () => {
      const token = getToken('agent-id', 'agent');

      const response = await request(app)
        .post('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .send({ path: '/openclaw.json', content: '{}', encoding: 'utf8' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
      expect(response.body.error.message).toContain('System configuration files');
    });

    it('should allow admin to create system config files', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .send({ path: '/openclaw.json', content: '{}', encoding: 'utf8' });

      expect(response.status).toBe(201);
    });

    it('should allow owner to create system config files', async () => {
      const token = getToken('owner-id', 'owner');

      const response = await request(app)
        .post('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .send({ path: '/openclaw.json', content: '{}', encoding: 'utf8' });

      expect(response.status).toBe(201);
    });
  });

  describe('PUT /api/v1/openclaw/workspace/files - system config protection', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ path: '/openclaw.json', updated: true }),
        text: async () => 'OK',
      });
    });

    it('should block agent role from updating system config files', async () => {
      const token = getToken('agent-id', 'agent');

      const response = await request(app)
        .put('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .send({ path: '/openclaw.json', content: '{}', encoding: 'utf8' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('DELETE /api/v1/openclaw/workspace/files - system config protection', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: async () => null,
        text: async () => '',
      });
    });

    it('should block agent role from deleting system config files', async () => {
      const token = getToken('agent-id', 'agent');

      const response = await request(app)
        .delete('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .query({ path: '/openclaw.json' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('Workspace write scope guardrails', () => {
    it('allows agent writes inside assigned project roots', async () => {
      const token = getToken('agent-user', 'agent', { agent_id: 'cto' });

      pool.query.mockImplementation((sql) => {
        if (
          String(sql).includes('FROM agent_project_assignments apa') &&
          String(sql).includes('SELECT p.root_path')
        ) {
          return Promise.resolve({ rows: [{ root_path: '/projects/alpha' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return { ok: false, status: 404, text: async () => 'Not Found' };
        }
        return {
          ok: true,
          status: 201,
          json: async () => ({ path: '/projects/alpha/new.md', created: true }),
          text: async () => 'Created',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .send({ path: '/projects/alpha/new.md', content: 'hello', encoding: 'utf8' });

      expect(response.status).toBe(201);
    });

    it('blocks agent writes outside assigned project roots and private paths', async () => {
      const token = getToken('agent-user', 'agent', { agent_id: 'cto' });

      pool.query.mockImplementation((sql) => {
        if (
          String(sql).includes('FROM agent_project_assignments apa') &&
          String(sql).includes('SELECT p.root_path')
        ) {
          return Promise.resolve({ rows: [{ root_path: '/projects/alpha' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      global.fetch = jest.fn();

      const response = await request(app)
        .post('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .send({ path: '/projects/beta/new.md', content: 'hello', encoding: 'utf8' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('PROJECT_SCOPE_VIOLATION');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('allows agent writes in agent-private workspace path', async () => {
      const token = getToken('agent-user', 'agent', { agent_id: 'cto' });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ path: '/workspace-cto/notes.md', updated: true }),
        text: async () => 'OK',
      });

      const response = await request(app)
        .put('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .send({ path: '/workspace-cto/notes.md', content: 'updated', encoding: 'utf8' });

      expect(response.status).toBe(200);
    });

    it('allows admin writes outside project scope guardrails', async () => {
      const token = getToken('admin-id', 'admin');

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          return { ok: false, status: 404, text: async () => 'Not Found' };
        }
        return {
          ok: true,
          status: 201,
          json: async () => ({ path: '/projects/unassigned/admin.md', created: true }),
          text: async () => 'Created',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/workspace/files')
        .set('Authorization', `Bearer ${token}`)
        .send({ path: '/projects/unassigned/admin.md', content: 'hello', encoding: 'utf8' });

      expect(response.status).toBe(201);
    });
  });

  describe('GET /api/v1/openclaw/agents', () => {
    beforeEach(() => {
      pool.query.mockResolvedValue({
        rows: [
          { agent_id: 'coo', name: 'Chief Operating Officer' },
          { agent_id: 'cto', name: 'Chief Technology Officer' },
        ],
      });
    });

    it('should return agents from config file', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            agents: {
              list: [
                {
                  id: 'coo',
                  name: 'COO',
                  identity: { name: 'COO', emoji: '📊' },
                  workspace: '/workspace/coo',
                  default: true,
                },
                {
                  id: 'cto',
                  name: 'CTO',
                  identity: { name: 'CTO', emoji: '💻' },
                  workspace: '/workspace/cto',
                },
              ],
            },
          }),
        }),
        text: async () => 'OK',
      });

      const response = await request(app)
        .get('/api/v1/openclaw/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('name');
      expect(response.body.data[0]).toHaveProperty('workspace');
    });

    it('should return main fallback when agents list is empty', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            agents: {
              list: [],
            },
          }),
        }),
        text: async () => 'OK',
      });

      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/v1/openclaw/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: 'main',
        workspace: '/workspace',
        isDefault: true,
      });
    });

    it('should append synthetic main when agents list has entries but no main', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            agents: {
              list: [
                {
                  id: 'coo',
                  name: 'COO',
                  identity: { name: 'COO' },
                  workspace: '/workspace/coo',
                  default: true,
                },
              ],
            },
          }),
        }),
        text: async () => 'OK',
      });

      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/v1/openclaw/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.some((a) => a.id === 'coo')).toBe(true);
      expect(response.body.data.some((a) => a.id === 'main')).toBe(true);
    });

    it('should return empty array when config file is missing', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockRejectedValue({
        status: 404,
        message: 'File not found',
      });

      const response = await request(app)
        .get('/api/v1/openclaw/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.data.length).toBe(0);
    });

    it('should enrich agent names from users table', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            agents: {
              list: [
                {
                  id: 'coo',
                  name: 'COO',
                  identity: { name: 'COO' },
                  workspace: '/workspace/coo',
                },
              ],
            },
          }),
        }),
        text: async () => 'OK',
      });

      pool.query.mockResolvedValue({
        rows: [{ agent_id: 'coo', name: 'Chief Operating Officer' }],
      });

      const response = await request(app)
        .get('/api/v1/openclaw/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SELECT agent_id, name, meta->>'emoji' AS emoji FROM agents"),
        expect.any(Array),
      );
    });

    it('should handle database errors gracefully when enriching agent names', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            agents: {
              list: [
                {
                  id: 'coo',
                  name: 'COO',
                  identity: { name: 'COO' },
                  workspace: '/workspace/coo',
                },
              ],
            },
          }),
        }),
        text: async () => 'OK',
      });

      pool.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/v1/openclaw/agents')
        .set('Authorization', `Bearer ${token}`);

      // Should still succeed, just without enrichment
      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should sort agents with default first', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            agents: {
              list: [
                {
                  id: 'cto',
                  name: 'CTO',
                  identity: { name: 'CTO' },
                  workspace: '/workspace/cto',
                },
                {
                  id: 'coo',
                  name: 'COO',
                  identity: { name: 'COO' },
                  workspace: '/workspace/coo',
                  default: true,
                },
              ],
            },
          }),
        }),
        text: async () => 'OK',
      });

      pool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/v1/openclaw/agents')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data[0].id).toBe('coo');
      expect(response.body.data[0].isDefault).toBe(true);
    });
  });

  describe('GET /api/v1/openclaw/agents/config', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            leadership: [{ id: 'orchestrator', displayName: 'MosBot' }],
            departments: [],
          }),
        }),
        text: async () => 'OK',
      });
    });

    it('should return agents configuration', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });

    it('should append synthetic main in agents/config when leadership lacks main', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.leadership.some((l) => l.id === 'main')).toBe(true);
    });

    it('should derive leadership from openclaw agents.list', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockImplementation(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            agents: {
              list: [
                {
                  id: 'orchestrator',
                  identity: { name: 'MosBot', theme: 'Orchestration', emoji: '🤖' },
                  model: { primary: 'openrouter/anthropic/claude-sonnet-4.5' },
                },
              ],
            },
          }),
        }),
        text: async () => 'OK',
      }));

      const response = await request(app)
        .get('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.leadership.some((l) => l.id === 'orchestrator')).toBe(true);
      expect(response.body.data.leadership.some((l) => l.id === 'main')).toBe(true);
      expect(response.body.data.departments).toEqual([]);
    });

    it('should filter archived projects from agents/config project assignments query', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      const projectQueryCall = (pool.query.mock.calls || []).find((call) =>
        String(call[0]).includes('FROM agent_project_assignments'),
      );
      expect(projectQueryCall).toBeDefined();
      expect(String(projectQueryCall[0])).toContain("WHERE p.status = 'active'");
    });

    it('should synthesize main leadership when agents.list is empty', async () => {
      const token = getToken('user-id', 'user');

      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        callCount++;
        // First call: agents.json → 404
        if (callCount === 1) {
          const err = new Error('File not found');
          err.status = 404;
          throw err;
        }
        // Second call: openclaw.json with empty agents.list
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: JSON.stringify({ agents: { list: [] } }),
          }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .get('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.leadership).toHaveLength(1);
      expect(response.body.data.leadership[0]).toMatchObject({
        id: 'main',
        displayName: 'main',
        label: 'agent:main:main',
      });
      expect(response.body.data.departments).toEqual([]);
    });

    it('should return empty agents config when both files are missing', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockImplementation(async () => {
        const err = new Error('File not found');
        err.status = 404;
        throw err;
      });

      const response = await request(app)
        .get('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      // main is implicit even when openclaw config cannot be read
      expect(response.body.data.leadership).toHaveLength(1);
      expect(response.body.data.leadership[0].id).toBe('main');
      expect(response.body.data.departments).toEqual([]);
    });
  });

  describe('PUT /api/v1/openclaw/agents/config/:agentId', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [
                    {
                      id: 'coo',
                      identity: { name: 'COO' },
                    },
                  ],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }
        if (options?.method === 'PUT') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ updated: true }),
            text: async () => 'OK',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            content: JSON.stringify({
              agents: {
                list: [
                  {
                    id: 'coo',
                    identity: { name: 'COO' },
                  },
                ],
              },
            }),
          }),
          text: async () => 'OK',
        };
      });
    });

    it('should allow admin to update agent', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .put('/api/v1/openclaw/agents/config/coo')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated COO',
          displayName: 'Updated Chief Operating Officer',
        });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(ensureDocsLinkIfMissing).toHaveBeenCalledWith('coo');
    });

    it('should update main metadata without requiring agents.json', async () => {
      const token = getToken('admin-id', 'admin');

      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({ agents: { list: [] } }),
            }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ content: '{}' }),
          text: async () => 'OK',
        };
      });

      gatewayWsRpc.mockImplementation((method) => {
        if (method === 'config.get') return Promise.resolve({ hash: 'h1' });
        if (method === 'config.apply') return Promise.resolve({ hash: 'h2' });
        return Promise.resolve({});
      });

      const response = await request(app)
        .put('/api/v1/openclaw/agents/config/main')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Main Agent',
          displayName: 'main',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.agentId).toBe('main');
    });

    it('should require displayName', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .put('/api/v1/openclaw/agents/config/coo')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated Agent',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('displayName');
    });

    it('should allow update without title', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .put('/api/v1/openclaw/agents/config/coo')
        .set('Authorization', `Bearer ${token}`)
        .send({
          displayName: 'Updated Agent Name',
        });

      expect(response.status).toBe(200);
    });

    it('should deny agent role from updating', async () => {
      const token = getToken('agent-id', 'agent');

      const response = await request(app)
        .put('/api/v1/openclaw/agents/config/coo')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Updated COO',
          displayName: 'Updated Chief Operating Officer',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/openclaw/agents/config', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                leadership: [],
                agents: { list: [] },
              }),
            }),
            text: async () => 'OK',
          };
        }
        if (options?.method === 'PUT') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ created: true }),
            text: async () => 'OK',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => 'OK',
        };
      });
    });

    it('should allow admin to create agent', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
          title: 'New Agent',
          displayName: 'New Agent Display Name',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.projectOnboarding).toEqual(
        expect.objectContaining({
          hasAssignedProject: false,
          projects: [],
          missingContracts: [],
          unknownContracts: [],
        }),
      );
      expect(ensureDocsLinkIfMissing).toHaveBeenCalledWith('new-agent');
    });

    it('provisions toolkit scripts with executable mode and falls back when mode is unsupported', async () => {
      const token = getToken('admin-id', 'admin');
      const writes = [];

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                leadership: [],
                agents: { list: [] },
              }),
            }),
            text: async () => 'OK',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && String(url).endsWith('/files')) {
          const body = JSON.parse(options.body || '{}');
          writes.push({ method: options.method, path: body.path, mode: body.mode });

          // Simulate older workspace service behavior: rejects mode payloads.
          if (body.path?.endsWith('/tools/mosbot-auth') && body.mode != null) {
            return {
              ok: false,
              status: 400,
              text: async () => 'Invalid mode',
            };
          }

          return {
            ok: true,
            status: 200,
            json: async () => ({ created: true }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({}),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
          title: 'New Agent',
          displayName: 'New Agent Display Name',
        });

      expect(response.status).toBe(201);

      const authWrites = writes.filter((w) => w.path === '/workspace-new-agent/tools/mosbot-auth');
      expect(authWrites.length).toBeGreaterThanOrEqual(2);
      expect(authWrites[0].mode).toBe(0o755);
      expect(authWrites.some((w) => w.mode == null)).toBe(true);

      const taskWrite = writes.find((w) => w.path === '/workspace-new-agent/tools/mosbot-task');
      expect(taskWrite?.mode).toBe(0o755);
    });

    it('includes project onboarding context in create bootstrap when assigned projects exist', async () => {
      const token = getToken('admin-id', 'admin');
      let bootstrapContent = '';

      pool.query.mockImplementation((sql, params) => {
        if (
          String(sql).includes('FROM agent_project_assignments apa') &&
          String(sql).includes('WHERE apa.agent_id = $1') &&
          params?.[0] === 'new-agent'
        ) {
          return Promise.resolve({
            rows: [
              {
                id: 'proj-1',
                slug: 'alpha',
                name: 'Alpha',
                root_path: '/projects/alpha',
                contract_path: '/projects/alpha/agent-contract.md',
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=/openclaw.json') ||
            String(url).includes('/files/content?path=%2Fopenclaw.json'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                leadership: [],
                agents: { list: [] },
              }),
            }),
            text: async () => 'OK',
          };
        }

        if (
          options?.method === 'GET' &&
          (String(url).includes('/files?path=%2Fprojects%2Falpha') ||
            String(url).includes('/files?path=/projects/alpha'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ files: [] }),
            text: async () => 'OK',
          };
        }

        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=%2Fprojects%2Falpha%2Fagent-contract.md') ||
            String(url).includes('/files/content?path=/projects/alpha/agent-contract.md'))
        ) {
          return {
            ok: false,
            status: 404,
            text: async () => 'not found',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && String(url).endsWith('/files')) {
          const body = JSON.parse(options.body || '{}');
          if (body.path === '/workspace-new-agent/BOOTSTRAP.md') {
            bootstrapContent = body.content || '';
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ created: true }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ created: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
          title: 'New Agent',
          displayName: 'New Agent Display Name',
        });

      expect(response.status).toBe(201);
      expect(bootstrapContent).toContain('Project scope snapshot');
      expect(bootstrapContent).toContain('/projects/alpha/agent-contract.md');
      expect(bootstrapContent).toContain('project contract missing: /projects/alpha/agent-contract.md');
      expect(response.body.data.projectOnboarding).toEqual(
        expect.objectContaining({
          hasAssignedProject: true,
          missingContracts: expect.arrayContaining([
            expect.objectContaining({
              slug: 'alpha',
              contractPath: '/projects/alpha/agent-contract.md',
              contractStatus: 'missing',
            }),
          ]),
          unknownContracts: [],
          warnings: expect.arrayContaining([
            expect.stringContaining('project contract missing: /projects/alpha/agent-contract.md'),
          ]),
        }),
      );
    });

    it('should preserve main as default when creating first non-main agent', async () => {
      const token = getToken('admin-id', 'admin');

      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ content: JSON.stringify({ agents: { list: [] } }) }),
            text: async () => 'OK',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ created: true }),
          text: async () => 'OK',
        };
      });

      gatewayWsRpc.mockImplementation((method, params) => {
        if (method === 'config.get') return Promise.resolve({ hash: 'h1' });
        if (method === 'config.apply') return Promise.resolve({ hash: 'h2', appliedRaw: params?.raw });
        return Promise.resolve({});
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
          title: 'New Agent',
          displayName: 'New Agent Display Name',
        });

      expect(response.status).toBe(201);

      const applyCall = gatewayWsRpc.mock.calls.find((c) => c[0] === 'config.apply');
      expect(applyCall).toBeDefined();
      const raw = applyCall[1]?.raw || '{}';
      const cfg = JSON.parse(raw);
      expect(cfg.agents.list[0]).toMatchObject({ id: 'main', default: true });
      expect(cfg.agents.list.some((a) => a.id === 'new-agent')).toBe(true);
    });

    it('should create agent without writing agents.json', async () => {
      const token = getToken('admin-id', 'admin');

      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ content: JSON.stringify({ agents: { list: [] } }) }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ created: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
          title: 'New Agent',
          displayName: 'New Agent Display Name',
        });

      expect(response.status).toBe(201);

      const calls = global.fetch.mock.calls || [];
      const agentsWriteCall = calls.find((c) => {
        const options = c[1] || {};
        if (!options.method) return false;
        try {
          const body = JSON.parse(options.body || '{}');
          return body.path === '/agents.json';
        } catch {
          return false;
        }
      });
      expect(agentsWriteCall).toBeUndefined();
    });

    it('should require id and displayName', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('displayName');
    });

    it('should allow creation without title', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
          displayName: 'New Agent Display Name',
        });

      expect(response.status).toBe(201);
    });

    it('should reject invalid agent id format', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'Invalid Agent',
          displayName: 'Invalid Agent',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_AGENT_ID');
      expect(pool.query).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return 409 before side effects when agent already exists in openclaw config', async () => {
      const token = getToken('admin-id', 'admin');

      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [{ id: 'existing-agent' }],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'existing-agent',
          displayName: 'Existing Agent',
        });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('AGENT_EXISTS');
      expect(pool.query).not.toHaveBeenCalled();
      expect(gatewayWsRpc).not.toHaveBeenCalledWith('config.apply', expect.anything());

      const nonGetCalls = global.fetch.mock.calls.filter(([, opts]) => opts?.method !== 'GET');
      expect(nonGetCalls).toHaveLength(0);
    });

    it('should keep existing active api key and skip mosbot.env rewrite', async () => {
      const token = getToken('admin-id', 'admin');
      const writePaths = [];

      pool.query.mockImplementation((sql) => {
        if (
          String(sql).includes('FROM agent_api_keys') &&
          String(sql).includes('revoked_at IS NULL')
        ) {
          return Promise.resolve({ rows: [{ id: 'key-existing' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ content: JSON.stringify({ agents: { list: [] } }) }),
            text: async () => 'OK',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && options?.body) {
          const body = JSON.parse(options.body);
          if (body?.path) writePaths.push(body.path);
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
          displayName: 'New Agent',
        });

      expect(response.status).toBe(201);
      expect(writePaths.some((p) => p.endsWith('/mosbot.env'))).toBe(false);
      expect(response.body.data.updatedFiles.some((f) => f.endsWith('/mosbot.env'))).toBe(false);
    });

    it('should cleanup new DB agent row when toolkit bootstrap fails before config.apply', async () => {
      const token = getToken('admin-id', 'admin');

      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ content: JSON.stringify({ agents: { list: [] } }) }),
            text: async () => 'OK',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && options?.body) {
          const body = JSON.parse(options.body);
          if (String(body?.path || '').endsWith('/tools/mosbot-auth')) {
            return {
              ok: false,
              status: 500,
              text: async () => 'boom',
            };
          }
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
          displayName: 'New Agent',
        });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('WORKSPACE_BOOTSTRAP_FAILED');

      const agentDeleteCall = pool.query.mock.calls.find(([sql]) =>
        String(sql).includes('DELETE FROM agents WHERE agent_id = $1'),
      );
      expect(agentDeleteCall).toBeDefined();
      expect(agentDeleteCall[1]).toEqual(['new-agent']);
    });

    it('should cleanup new api key/env when BOOTSTRAP write fails', async () => {
      const token = getToken('admin-id', 'admin');

      pool.query.mockImplementation((sql) => {
        if (
          String(sql).includes('FROM agent_api_keys') &&
          String(sql).includes('revoked_at IS NULL')
        ) {
          return Promise.resolve({ rows: [] });
        }
        if (String(sql).includes('INSERT INTO agent_api_keys')) {
          return Promise.resolve({ rows: [{ id: 'new-key-id' }] });
        }
        if (String(sql).includes('DELETE FROM agent_api_keys')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({ content: JSON.stringify({ agents: { list: [] } }) }),
            text: async () => 'OK',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && options?.body) {
          const body = JSON.parse(options.body);
          if (String(body?.path || '').endsWith('/BOOTSTRAP.md')) {
            return {
              ok: false,
              status: 500,
              text: async () => 'boom',
            };
          }
        }

        if (options?.method === 'DELETE') {
          return {
            ok: true,
            status: 204,
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
          displayName: 'New Agent',
        });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('WORKSPACE_BOOTSTRAP_FAILED');

      const keyDeleteCall = pool.query.mock.calls.find(([sql]) =>
        String(sql).includes('DELETE FROM agent_api_keys'),
      );
      expect(keyDeleteCall).toBeDefined();
      expect(keyDeleteCall[1]).toEqual(['new-key-id']);

      const envDeleteCall = global.fetch.mock.calls.find(
        ([url, opts]) =>
          opts?.method === 'DELETE' &&
          String(url).includes('/files?path=%2Fworkspace-new-agent%2Fmosbot.env'),
      );
      expect(envDeleteCall).toBeDefined();

      const agentDeleteCall = pool.query.mock.calls.find(([sql]) =>
        String(sql).includes('DELETE FROM agents WHERE agent_id = $1'),
      );
      expect(agentDeleteCall).toBeDefined();
      expect(agentDeleteCall[1]).toEqual(['new-agent']);
    });

    it('should deny agent role from creating', async () => {
      const token = getToken('agent-id', 'agent');

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'new-agent',
          title: 'New Agent',
          displayName: 'New Agent Display Name',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/openclaw/agents/config/:agentId/rebootstrap', () => {
    it('should rebootstrap an existing configured agent', async () => {
      const token = getToken('admin-id', 'admin');
      const writePaths = [];
      let bootstrapContent = '';

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=/openclaw.json') ||
            String(url).includes('/files/content?path=%2Fopenclaw.json'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [
                    {
                      id: 'coo',
                      workspace: '/workspace-custom-coo',
                      identity: { name: 'COO', theme: 'Operations' },
                      model: { primary: 'openrouter/model-a' },
                    },
                  ],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && String(url).endsWith('/files')) {
          const body = JSON.parse(options.body || '{}');
          writePaths.push(body.path);
          if (body.path === '/workspace-custom-coo/BOOTSTRAP.md') {
            bootstrapContent = body.content || '';
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/coo/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.agentId).toBe('coo');
      expect(response.body.data.updatedFiles).toContain('/workspace-custom-coo/BOOTSTRAP.md');
      expect(writePaths).toEqual(
        expect.arrayContaining([
          '/workspace-custom-coo/tools/mosbot-auth',
          '/workspace-custom-coo/tools/mosbot-task',
          '/workspace-custom-coo/tools/INTEGRATION.md',
          '/workspace-custom-coo/TOOLS.md',
          '/workspace-custom-coo/BOOTSTRAP.md',
          '/workspace-custom-coo/mosbot.env',
        ]),
      );
      expect(bootstrapContent).toContain('re-bootstrap');
      expect(bootstrapContent).toContain('Agent profile (re-bootstrap snapshot)');
      expect(bootstrapContent).not.toContain('Agent profile (from create form)');
      expect(bootstrapContent).not.toContain('Project scope snapshot');
      expect(response.body.data.projectOnboarding).toEqual(
        expect.objectContaining({
          hasAssignedProject: false,
          projects: [],
          missingContracts: [],
          unknownContracts: [],
        }),
      );

      const agentsUpsertCall = pool.query.mock.calls.find(([sql]) =>
        String(sql).includes('INSERT INTO agents (agent_id, name, title, status, reports_to, meta, active)'),
      );
      expect(agentsUpsertCall).toBeDefined();
      const agentsUpsertSql = String(agentsUpsertCall[0]);
      expect(agentsUpsertSql).toContain("name = COALESCE(NULLIF(agents.name, ''), EXCLUDED.name)");
      expect(agentsUpsertSql).toContain("title = COALESCE(NULLIF(agents.title, ''), EXCLUDED.title)");
      expect(agentsUpsertSql).toContain("status = COALESCE(NULLIF(agents.status, ''), EXCLUDED.status)");
      expect(agentsUpsertSql).toContain(
        "meta = COALESCE(EXCLUDED.meta, '{}'::jsonb) || COALESCE(agents.meta, '{}'::jsonb)",
      );
      expect(agentsUpsertSql).toContain('active = COALESCE(agents.active, EXCLUDED.active)');
      const metaJson = agentsUpsertCall[1][5];
      const parsedMeta = JSON.parse(metaJson);
      expect(parsedMeta).toEqual({
        label: 'agent:coo:main',
        description: 'Operations',
      });
      expect(recordActivityLogEventSafe).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'agent_rebootstrapped',
          source: 'agents',
          actor_user_id: 'admin-id',
          agent_id: 'coo',
          meta: expect.objectContaining({
            workspaceRoot: '/workspace-custom-coo',
            updatedFiles: expect.arrayContaining([
              '/workspace-custom-coo/tools/*',
              '/workspace-custom-coo/TOOLS.md',
              '/workspace-custom-coo/BOOTSTRAP.md',
              '/workspace-custom-coo/mosbot.env',
            ]),
          }),
        }),
      );
      expect(invokeTool).toHaveBeenCalledWith(
        'sessions_send',
        expect.objectContaining({
          sessionKey: 'agent:coo:main',
        }),
        expect.objectContaining({
          sessionKey: 'main',
        }),
      );
    });

    it('includes project onboarding context in rebootstrap when assigned projects exist', async () => {
      const token = getToken('admin-id', 'admin');
      let bootstrapContent = '';

      pool.query.mockImplementation((sql) => {
        if (
          String(sql).includes('FROM agent_project_assignments apa') &&
          String(sql).includes('WHERE apa.agent_id = $1')
        ) {
          return Promise.resolve({
            rows: [
              {
                id: 'proj-1',
                slug: 'alpha',
                name: 'Alpha',
                root_path: '/projects/alpha',
                contract_path: '/projects/alpha/agent-contract.md',
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=/openclaw.json') ||
            String(url).includes('/files/content?path=%2Fopenclaw.json'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [{ id: 'coo', identity: { name: 'COO', theme: 'Operations' } }],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }

        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=%2Fprojects%2Falpha%2Fagent-contract.md') ||
            String(url).includes('/files/content?path=/projects/alpha/agent-contract.md'))
        ) {
          return {
            ok: false,
            status: 404,
            text: async () => 'not found',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && String(url).endsWith('/files')) {
          const body = JSON.parse(options.body || '{}');
          if (body.path === '/workspace-coo/BOOTSTRAP.md') {
            bootstrapContent = body.content || '';
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/coo/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(bootstrapContent).toContain('Project scope snapshot');
      expect(bootstrapContent).toContain('/projects/alpha/agent-contract.md');
      expect(response.body.data.projectOnboarding).toEqual(
        expect.objectContaining({
          hasAssignedProject: true,
          projects: expect.arrayContaining([
            expect.objectContaining({
              slug: 'alpha',
              contractPath: '/projects/alpha/agent-contract.md',
              contractStatus: 'missing',
            }),
          ]),
          missingContracts: expect.arrayContaining([
            expect.objectContaining({
              slug: 'alpha',
              contractPath: '/projects/alpha/agent-contract.md',
              contractStatus: 'missing',
            }),
          ]),
          warnings: expect.arrayContaining([
            expect.stringContaining('project contract missing: /projects/alpha/agent-contract.md'),
          ]),
        }),
      );
      expect((response.body.data.warnings || []).some((w) => w.includes('project contract missing'))).toBe(
        false,
      );
    });

    it('marks unconfigured project contract paths as missing in onboarding context', async () => {
      const token = getToken('admin-id', 'admin');
      let bootstrapContent = '';

      pool.query.mockImplementation((sql) => {
        if (
          String(sql).includes('FROM agent_project_assignments apa') &&
          String(sql).includes('WHERE apa.agent_id = $1')
        ) {
          return Promise.resolve({
            rows: [
              {
                id: 'proj-2',
                slug: 'beta',
                name: 'Beta',
                root_path: '/projects/beta',
                contract_path: null,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=/openclaw.json') ||
            String(url).includes('/files/content?path=%2Fopenclaw.json'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [{ id: 'coo', identity: { name: 'COO', theme: 'Operations' } }],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && String(url).endsWith('/files')) {
          const body = JSON.parse(options.body || '{}');
          if (body.path === '/workspace-coo/BOOTSTRAP.md') {
            bootstrapContent = body.content || '';
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/coo/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(bootstrapContent).toContain('Project scope snapshot');
      expect(response.body.data.projectOnboarding).toEqual(
        expect.objectContaining({
          hasAssignedProject: true,
          projects: expect.arrayContaining([
            expect.objectContaining({
              slug: 'beta',
              contractPath: null,
              contractStatus: 'missing',
            }),
          ]),
          missingContracts: expect.arrayContaining([
            expect.objectContaining({
              slug: 'beta',
              contractPath: null,
              contractStatus: 'missing',
            }),
          ]),
          warnings: expect.arrayContaining([
            expect.stringContaining('project beta has no contract path configured'),
          ]),
        }),
      );
    });

    it('marks out-of-root contract paths as unknown in onboarding context', async () => {
      const token = getToken('admin-id', 'admin');

      pool.query.mockImplementation((sql) => {
        if (
          String(sql).includes('FROM agent_project_assignments apa') &&
          String(sql).includes('WHERE apa.agent_id = $1')
        ) {
          return Promise.resolve({
            rows: [
              {
                id: 'proj-3',
                slug: 'gamma',
                name: 'Gamma',
                root_path: '/projects/gamma',
                contract_path: '/docs/not-allowed.md',
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=/openclaw.json') ||
            String(url).includes('/files/content?path=%2Fopenclaw.json'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [{ id: 'coo', identity: { name: 'COO', theme: 'Operations' } }],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/coo/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.projectOnboarding).toEqual(
        expect.objectContaining({
          projects: expect.arrayContaining([
            expect.objectContaining({
              slug: 'gamma',
              contractPath: '/docs/not-allowed.md',
              contractStatus: 'unknown',
            }),
          ]),
          missingContracts: [],
          unknownContracts: expect.arrayContaining([
            expect.objectContaining({
              slug: 'gamma',
              contractPath: '/docs/not-allowed.md',
              contractStatus: 'unknown',
            }),
          ]),
          warnings: expect.arrayContaining([
            expect.stringContaining('contract path is outside project root'),
          ]),
        }),
      );
    });

    it('should allow implicit main rebootstrap when main is not in agents list', async () => {
      const token = getToken('admin-id', 'admin');
      const writePaths = [];

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=/openclaw.json') ||
            String(url).includes('/files/content?path=%2Fopenclaw.json'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  defaults: {
                    workspace: '/workspace-main-custom',
                    identity: { name: 'Main', theme: 'Default Ops' },
                  },
                  list: [{ id: 'coo' }],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && String(url).endsWith('/files')) {
          const body = JSON.parse(options.body || '{}');
          writePaths.push(body.path);
          return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/main/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.agentId).toBe('main');
      expect(response.body.data.updatedFiles).toContain('/workspace-main-custom/BOOTSTRAP.md');
      expect(writePaths).toEqual(
        expect.arrayContaining([
          '/workspace-main-custom/tools/mosbot-auth',
          '/workspace-main-custom/BOOTSTRAP.md',
        ]),
      );
    });

    it('should return 404 when rebootstrap target is missing', async () => {
      const token = getToken('admin-id', 'admin');

      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: { list: [{ id: 'coo' }] },
              }),
            }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/cto/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('AGENT_NOT_FOUND');
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('should deny agent role from rebootstrap', async () => {
      const token = getToken('agent-id', 'agent');

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/coo/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('Admin or owner access required to manage users');
    });

    it('should reject invalid rebootstrap agent id format', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/COO/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_AGENT_ID');
      expect(pool.query).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should keep existing active api key and skip mosbot.env rewrite', async () => {
      const token = getToken('admin-id', 'admin');
      const writePaths = [];

      pool.query.mockImplementation((sql) => {
        if (
          String(sql).includes('FROM agent_api_keys') &&
          String(sql).includes('revoked_at IS NULL')
        ) {
          return Promise.resolve({ rows: [{ id: 'key-existing' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=/openclaw.json') ||
            String(url).includes('/files/content?path=%2Fopenclaw.json'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [{ id: 'coo', identity: { name: 'COO', theme: 'Operations' } }],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && options?.body) {
          const body = JSON.parse(options.body);
          if (body?.path) writePaths.push(body.path);
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/coo/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(writePaths.some((p) => p.endsWith('/mosbot.env'))).toBe(false);
      expect(response.body.data.updatedFiles.some((f) => f.endsWith('/mosbot.env'))).toBe(false);
    });

    it('should rotate active api key when mosbot.env is missing', async () => {
      const token = getToken('admin-id', 'admin');
      const writePaths = [];
      let activeKeySelectCount = 0;

      pool.query.mockImplementation((sql) => {
        if (
          String(sql).includes('FROM agent_api_keys') &&
          String(sql).includes('revoked_at IS NULL')
        ) {
          activeKeySelectCount += 1;
          return Promise.resolve({ rows: [{ id: 'key-existing' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      const clientQuery = jest.fn().mockImplementation((sql) => {
        if (String(sql).includes('BEGIN') || String(sql).includes('COMMIT')) {
          return Promise.resolve({ rows: [] });
        }
        if (
          String(sql).includes('FROM agent_api_keys') &&
          String(sql).includes('revoked_at IS NULL')
        ) {
          activeKeySelectCount += 1;
          return Promise.resolve({ rows: [{ id: 'key-existing' }] });
        }
        if (
          String(sql).includes('UPDATE agent_api_keys') &&
          String(sql).includes('SET revoked_at = NOW()')
        ) {
          return Promise.resolve({ rows: [] });
        }
        if (String(sql).includes('INSERT INTO agent_api_keys')) {
          return Promise.resolve({ rows: [{ id: 'key-rotated' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      pool.connect.mockResolvedValue({
        query: clientQuery,
        release: jest.fn(),
      });

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=/openclaw.json') ||
            String(url).includes('/files/content?path=%2Fopenclaw.json'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [
                    {
                      id: 'coo',
                      workspace: '/workspace-coo',
                      identity: { name: 'COO', theme: 'Operations' },
                    },
                  ],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }

        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=%2Fworkspace-coo%2Fmosbot.env') ||
            String(url).includes('/files/content?path=/workspace-coo/mosbot.env'))
        ) {
          return {
            ok: false,
            status: 404,
            text: async () => 'not found',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && options?.body) {
          const body = JSON.parse(options.body);
          if (body?.path) writePaths.push(body.path);
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/coo/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(activeKeySelectCount).toBeGreaterThanOrEqual(1);
      expect(writePaths).toEqual(expect.arrayContaining(['/workspace-coo/mosbot.env']));
      expect(response.body.data.updatedFiles).toContain('/workspace-coo/mosbot.env');
      expect(
        (response.body.data.warnings || []).some((w) =>
          String(w).includes('mosbot.env missing; rotated active API key'),
        ),
      ).toBe(true);

      const queryCallGroups = [
        pool.query.mock.calls || [],
        ...(typeof clientQuery !== 'undefined' && clientQuery?.mock?.calls
          ? [clientQuery.mock.calls]
          : []),
      ];
      const revokeCall = queryCallGroups
        .flat()
        .find(
          ([sql]) =>
            String(sql).includes('UPDATE agent_api_keys') &&
            String(sql).includes('SET revoked_at = NOW()'),
        );
      expect(revokeCall).toBeDefined();
      expect(revokeCall[1]).toEqual([['key-existing']]);
    });

    it('should reject rebootstrap when non-main agent resolves to shared /workspace root', async () => {
      const token = getToken('admin-id', 'admin');

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=/openclaw.json') ||
            String(url).includes('/files/content?path=%2Fopenclaw.json'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [{ id: 'coo', workspace: '/workspace' }],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/coo/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_WORKSPACE_PATH');
      expect(response.body.error.message).toContain('non-main agents must use an agent-specific workspace root');
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('should cleanup new api key/env when rebootstrap BOOTSTRAP write fails', async () => {
      const token = getToken('admin-id', 'admin');

      pool.query.mockImplementation((sql) => {
        if (
          String(sql).includes('FROM agent_api_keys') &&
          String(sql).includes('revoked_at IS NULL')
        ) {
          return Promise.resolve({ rows: [] });
        }
        if (String(sql).includes('INSERT INTO agent_api_keys')) {
          return Promise.resolve({ rows: [{ id: 'new-key-id' }] });
        }
        if (String(sql).includes('DELETE FROM agent_api_keys')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      global.fetch = jest.fn().mockImplementation(async (url, options) => {
        if (
          options?.method === 'GET' &&
          (String(url).includes('/files/content?path=/openclaw.json') ||
            String(url).includes('/files/content?path=%2Fopenclaw.json'))
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [{ id: 'coo', identity: { name: 'COO', theme: 'Operations' } }],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }

        if ((options?.method === 'PUT' || options?.method === 'POST') && options?.body) {
          const body = JSON.parse(options.body);
          if (String(body?.path || '').endsWith('/BOOTSTRAP.md')) {
            return {
              ok: false,
              status: 500,
              text: async () => 'boom',
            };
          }
        }

        if (options?.method === 'DELETE') {
          return {
            ok: true,
            status: 204,
            text: async () => 'OK',
          };
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/coo/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('WORKSPACE_REBOOTSTRAP_FAILED');

      const keyDeleteCall = pool.query.mock.calls.find(([sql]) =>
        String(sql).includes('DELETE FROM agent_api_keys'),
      );
      expect(keyDeleteCall).toBeDefined();
      expect(keyDeleteCall[1]).toEqual(['new-key-id']);

      const envDeleteCall = global.fetch.mock.calls.find(
        ([url, opts]) =>
          opts?.method === 'DELETE' &&
          String(url).includes('/files?path=%2Fworkspace-coo%2Fmosbot.env'),
      );
      expect(envDeleteCall).toBeDefined();
    });
  });

  describe('GET /api/v1/openclaw/sessions/status', () => {
    beforeEach(() => {
      sessionsListAllViaWs.mockResolvedValue([
        { key: 'session-1', status: 'running' },
        { key: 'session-2', status: 'running' },
        { key: 'session-3', status: 'idle' },
        { key: 'session-4', status: 'idle' },
      ]);
    });

    it('should return session status', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/sessions/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('active');
      expect(response.body.data).toHaveProperty('running');
      expect(response.body.data).toHaveProperty('idle');
      expect(response.body.data).toHaveProperty('total');
    });

    it('should return pairing-required when integration is not ready', async () => {
      const token = getToken('admin-id', 'admin');
      const err = new Error('OpenClaw pairing is required before using this feature. Complete the pairing wizard first.');
      err.status = 503;
      err.code = 'OPENCLAW_PAIRING_REQUIRED';
      err.details = { status: 'pending_pairing', missingScopes: ['operator.read'] };
      assertIntegrationReady.mockRejectedValueOnce(err);

      const response = await request(app)
        .get('/api/v1/openclaw/sessions/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('OPENCLAW_PAIRING_REQUIRED');
    });

    it('should not apply the pairing gate to regular users', async () => {
      const token = getToken('user-id', 'user');
      const err = new Error('OpenClaw pairing is required before using this feature. Complete the pairing wizard first.');
      err.status = 503;
      err.code = 'OPENCLAW_PAIRING_REQUIRED';
      err.details = { status: 'pending_pairing', missingScopes: ['operator.read'] };
      assertIntegrationReady.mockRejectedValue(err);

      const response = await request(app)
        .get('/api/v1/openclaw/sessions/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(assertIntegrationReady).not.toHaveBeenCalled();
      assertIntegrationReady.mockReset();
      assertIntegrationReady.mockResolvedValue({ ready: true });
    });
  });

  describe('GET /api/v1/openclaw/sessions', () => {
    beforeEach(() => {
      sessionsListAllViaWs.mockResolvedValue([
        {
          key: 'agent:coo:session-1',
          status: 'running',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ]);
      gatewayWsRpc.mockImplementation((method) => {
        if (method === 'sessions.usage') {
          return Promise.resolve({ sessions: [] });
        }
        if (method === 'usage.cost') {
          return Promise.resolve({ totalCost: 0 });
        }
        return Promise.resolve({});
      });
    });

    it('should return sessions list', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/sessions')
        .set('Authorization', `Bearer ${token}`)
        .query({ limit: 10, offset: 0 });

      if (response.status !== 200) {
        console.error('Sessions list error:', response.body);
      }
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });

    it('should handle pagination parameters', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/sessions')
        .set('Authorization', `Bearer ${token}`)
        .query({ limit: 20, offset: 10 });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/v1/openclaw/sessions/:sessionId/messages', () => {
    beforeEach(() => {
      sessionsHistory.mockResolvedValue({
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Hello',
          },
        ],
      });
    });

    it('should return session messages', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/sessions/session-123/messages')
        .set('Authorization', `Bearer ${token}`)
        .query({ key: 'agent:coo:session-123' });

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });

    it('should require session key parameter', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/sessions/session-123/messages')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/openclaw/sessions', () => {
    beforeEach(() => {
      gatewayWsRpc.mockResolvedValue({});
    });

    it('should allow admin to delete sessions', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .delete('/api/v1/openclaw/sessions')
        .set('Authorization', `Bearer ${token}`)
        .query({ key: 'agent:coo:session-1' });

      expect(response.status).toBe(204);
      expect(gatewayWsRpc).toHaveBeenCalledWith('sessions.delete', {
        key: 'agent:coo:session-1',
      });
    });

    it('should require session key parameter', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .delete('/api/v1/openclaw/sessions')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('key');
    });

    it('should deny regular users from deleting sessions', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .delete('/api/v1/openclaw/sessions')
        .set('Authorization', `Bearer ${token}`)
        .query({ key: 'agent:coo:session-1' });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/openclaw/cron-jobs', () => {
    beforeEach(() => {
      cronList.mockResolvedValue([
        {
          id: 'job-1',
          schedule: { kind: 'cron', expr: '0 0 * * *' },
          enabled: true,
        },
      ]);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          content: JSON.stringify({
            agents: { list: [] },
          }),
        }),
        text: async () => 'OK',
      });
      gatewayWsRpc.mockResolvedValue({
        sessions: [],
      });
    });

    it('should return cron jobs list', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/cron-jobs')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('POST /api/v1/openclaw/cron-jobs', () => {
    beforeEach(() => {
      createCronJob.mockResolvedValue({
        jobId: 'new-job',
        name: 'test-job',
        schedule: '0 0 * * *',
        enabled: true,
      });
    });

    it('should allow admin to create cron jobs', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/cron-jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'test-job',
          schedule: '0 0 * * *',
          command: 'echo hello',
        });

      expect(response.status).toBe(201);
      expect(response.body.data).toBeDefined();
      expect(createCronJob).toHaveBeenCalled();
    });

    it('should deny regular users from creating cron jobs', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .post('/api/v1/openclaw/cron-jobs')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'test-job',
          schedule: '0 0 * * *',
          command: 'echo hello',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/openclaw/usage', () => {
    beforeEach(() => {
      pool.query.mockResolvedValue({
        rows: [
          {
            total_cost_usd: 50.0,
            total_tokens_input: 500000,
            total_tokens_output: 500000,
            total_tokens_cache_read: 100000,
            total_tokens_cache_write: 50000,
            session_count: 10,
          },
        ],
      });
    });

    it('should return usage statistics', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/usage')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });
  });

  describe('POST /api/v1/openclaw/usage/reset', () => {
    let hashedPassword;

    beforeAll(async () => {
      hashedPassword = await bcrypt.hash('test-password', 10);
    });

    beforeEach(() => {
      pool.query.mockImplementation((query) => {
        if (query.includes('SELECT password_hash')) {
          return Promise.resolve({
            rows: [
              {
                password_hash: hashedPassword,
              },
            ],
          });
        }
        if (query.includes('SELECT COUNT(*)')) {
          return Promise.resolve({
            rows: [{ total: '100' }],
          });
        }
        if (query.includes('DELETE')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });
    });

    it('should allow admin to reset usage with password', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/usage/reset')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'test-password' });

      expect(response.status).toBe(200);
      expect(response.body.data.success).toBe(true);
    });

    it('should require password', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/usage/reset')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Password');
    });

    it('should deny regular users from resetting usage', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .post('/api/v1/openclaw/usage/reset')
        .set('Authorization', `Bearer ${token}`)
        .send({ password: 'test-password' });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/openclaw/integration/status', () => {
    it('returns integration readiness for authenticated users', async () => {
      const token = getToken('admin-id', 'admin');
      getIntegrationStatus.mockResolvedValueOnce({
        status: 'pending_pairing',
        ready: false,
        requiredScopes: [
          'operator.admin',
          'operator.approvals',
          'operator.pairing',
          'operator.read',
          'operator.write',
        ],
        grantedScopes: ['operator.admin'],
        missingScopes: ['operator.read', 'operator.write', 'operator.approvals', 'operator.pairing'],
      });

      const response = await request(app)
        .get('/api/v1/openclaw/integration/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          status: 'pending_pairing',
          ready: false,
        }),
      );
    });

    it('denies regular users from integration readiness details', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/integration/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/v1/openclaw/integration/pairing/start', () => {
    it('starts pairing for admin/owner users', async () => {
      const token = getToken('admin-id', 'admin');
      startPairing.mockResolvedValueOnce({ status: 'pending_pairing', ready: false });

      const response = await request(app)
        .post('/api/v1/openclaw/integration/pairing/start')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual(expect.objectContaining({ status: 'pending_pairing' }));
    });
  });

  describe('POST /api/v1/openclaw/integration/pairing/finalize', () => {
    it('finalizes pairing for admin/owner users', async () => {
      const token = getToken('owner-id', 'owner');
      finalizePairing.mockResolvedValueOnce({ status: 'ready', ready: true });

      const response = await request(app)
        .post('/api/v1/openclaw/integration/pairing/finalize')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(expect.objectContaining({ status: 'ready', ready: true }));
    });
  });

  describe('GET /api/v1/openclaw/config', () => {
    beforeEach(() => {
      gatewayWsRpc.mockResolvedValue({
        raw: JSON.stringify({
          agents: { list: [] },
          settings: {},
        }),
        hash: 'abc123',
      });
    });

    it('should allow owner to get config', async () => {
      const token = getToken('owner-id', 'owner');

      const response = await request(app)
        .get('/api/v1/openclaw/config')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data).toHaveProperty('raw');
      expect(response.body.data).toHaveProperty('hash');
    });

    it('should allow admin to get config', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .get('/api/v1/openclaw/config')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
    });

    it('should return pairing-required when integration is not ready', async () => {
      const token = getToken('admin-id', 'admin');
      const err = new Error('OpenClaw pairing is required before using this feature. Complete the pairing wizard first.');
      err.status = 503;
      err.code = 'OPENCLAW_PAIRING_REQUIRED';
      err.details = { status: 'pending_pairing', missingScopes: ['operator.read'] };
      assertIntegrationReady.mockRejectedValueOnce(err);

      const response = await request(app)
        .get('/api/v1/openclaw/config')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('OPENCLAW_PAIRING_REQUIRED');
    });

    it('should deny regular users from getting config', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .get('/api/v1/openclaw/config')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('PUT /api/v1/openclaw/config', () => {
    beforeEach(() => {
      gatewayWsRpc.mockImplementation((method, _params) => {
        if (method === 'config.get') {
          return Promise.resolve({
            raw: JSON.stringify({ agents: { list: [] } }),
            hash: 'abc123',
          });
        }
        if (method === 'config.apply') {
          return Promise.resolve({
            hash: 'def456',
          });
        }
        return Promise.resolve({});
      });
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ created: true }),
        text: async () => 'Created',
      });
    });

    it('should allow owner to update config', async () => {
      const token = getToken('owner-id', 'owner');

      const response = await request(app)
        .put('/api/v1/openclaw/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          raw: JSON.stringify({ agents: { list: [] } }),
          baseHash: 'abc123',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.applied).toBe(true);
    });

    it('should require raw and baseHash', async () => {
      const token = getToken('owner-id', 'owner');

      const response = await request(app)
        .put('/api/v1/openclaw/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          agents: { list: [] },
        });

      expect(response.status).toBe(400);
    });

    it('should deny regular users from updating config', async () => {
      const token = getToken('user-id', 'user');

      const response = await request(app)
        .put('/api/v1/openclaw/config')
        .set('Authorization', `Bearer ${token}`)
        .send({
          raw: JSON.stringify({ agents: { list: [] } }),
          baseHash: 'abc123',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/openclaw/config/backups', () => {
    it('should list DB-backed backups in frontend-compatible shape', async () => {
      const token = getToken('owner-id', 'owner');
      const createdAt = new Date('2026-03-09T15:00:00Z');

      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            created_at: createdAt,
            note: 'test note',
            actor_user_id: 'owner-id',
            base_hash: 'abc',
            new_hash: 'def',
            size_bytes: '1234',
          },
        ],
      });

      const response = await request(app)
        .get('/api/v1/openclaw/config/backups')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        id: '11111111-1111-1111-1111-111111111111',
        path: 'db:11111111-1111-1111-1111-111111111111',
        size: 1234,
        note: 'test note',
        actorUserId: 'owner-id',
        baseHash: 'abc',
        newHash: 'def',
      });
    });

    it('should return empty list when history table is missing (42P01)', async () => {
      const token = getToken('owner-id', 'owner');
      const err = new Error('relation does not exist');
      err.code = '42P01';
      pool.query.mockRejectedValueOnce(err);

      const response = await request(app)
        .get('/api/v1/openclaw/config/backups')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('GET /api/v1/openclaw/config/backups/content', () => {
    it('should accept db:<uuid> and plain uuid path values', async () => {
      const token = getToken('owner-id', 'owner');
      const id = '22222222-2222-2222-2222-222222222222';

      pool.query.mockResolvedValue({
        rows: [
          {
            id,
            raw_config: '{"agents":{"list":[]}}',
            created_at: new Date('2026-03-09T15:00:00Z'),
            note: null,
            actor_user_id: 'owner-id',
            base_hash: 'abc',
            new_hash: 'def',
          },
        ],
      });

      const response1 = await request(app)
        .get('/api/v1/openclaw/config/backups/content')
        .query({ path: `db:${id}` })
        .set('Authorization', `Bearer ${token}`);

      expect(response1.status).toBe(200);
      expect(response1.body.data.path).toBe(`db:${id}`);
      expect(response1.body.data.content).toContain('agents');

      const response2 = await request(app)
        .get('/api/v1/openclaw/config/backups/content')
        .query({ path: id })
        .set('Authorization', `Bearer ${token}`);

      expect(response2.status).toBe(200);
      expect(response2.body.data.path).toBe(`db:${id}`);
    });

    it('should return 503 HISTORY_TABLE_UNAVAILABLE when table is missing (42P01)', async () => {
      const token = getToken('owner-id', 'owner');
      const err = new Error('relation does not exist');
      err.code = '42P01';
      pool.query.mockRejectedValueOnce(err);

      const response = await request(app)
        .get('/api/v1/openclaw/config/backups/content')
        .query({ path: 'db:33333333-3333-3333-3333-333333333333' })
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('HISTORY_TABLE_UNAVAILABLE');
    });
  });

  describe('Project registry and assignments', () => {
    beforeEach(() => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ action: 'created', state: 'linked' }),
        text: async () => 'OK',
      });
    });

    it('lists projects for authenticated users', async () => {
      const token = getToken('user-id', 'user');
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            slug: 'alpha',
            name: 'Alpha',
            description: '',
            root_path: '/projects/alpha',
            contract_path: '/projects/alpha/agent-contract.md',
            status: 'active',
            assigned_agents: 1,
          },
        ],
      });

      const response = await request(app)
        .get('/api/v1/openclaw/projects')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].slug).toBe('alpha');
    });

    it('returns project link health for main and assigned agents', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            slug: 'alpha',
            name: 'Alpha',
            root_path: '/projects/alpha',
            agent_id: 'cto',
          },
        ],
      });

      global.fetch = jest.fn().mockImplementation(async (url) => {
        if (
          String(url).includes('/links/project/main?targetPath=%2Fprojects%2Falpha') ||
          String(url).includes('/links/project/cto?targetPath=%2Fprojects%2Falpha')
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ state: 'linked' }),
            text: async () => 'OK',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ files: [] }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .get('/api/v1/openclaw/projects/link-health')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ slug: 'alpha', agentId: 'main', state: 'linked' }),
          expect.objectContaining({ slug: 'alpha', agentId: 'cto', state: 'linked' }),
        ]),
      );
    });

    it('rejects invalid link-health limit values', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .get('/api/v1/openclaw/projects/link-health?limit=0')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_LIMIT');
    });

    it('applies repair limit when provided', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            slug: 'alpha',
            name: 'Alpha',
            root_path: '/projects/alpha',
            agent_id: 'cto',
          },
        ],
      });

      ensureProjectLinkIfMissing.mockResolvedValue({ action: 'unchanged', state: 'linked' });

      const response = await request(app)
        .post('/api/v1/openclaw/projects/link-health/repair')
        .set('Authorization', `Bearer ${token}`)
        .send({ limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.data.attempted).toBe(1);
      expect(ensureProjectLinkIfMissing).toHaveBeenCalledTimes(1);
    });

    it('repairs project links and returns summary', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            slug: 'alpha',
            name: 'Alpha',
            root_path: '/projects/alpha',
            agent_id: 'cto',
          },
        ],
      });

      ensureProjectLinkIfMissing.mockImplementation(async (agentId) => {
        if (agentId === 'main') return { action: 'created', state: 'linked' };
        return { action: 'unchanged', state: 'linked' };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/projects/link-health/repair')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(
        expect.objectContaining({
          attempted: 2,
          repaired: 1,
          unchanged: 1,
          conflicts: 0,
          failed: 0,
        }),
      );
      expect(ensureProjectLinkIfMissing).toHaveBeenCalledWith('main', '/projects/alpha');
      expect(ensureProjectLinkIfMissing).toHaveBeenCalledWith('cto', '/projects/alpha');
    });

    it('returns 409 when creating a duplicate project slug', async () => {
      const token = getToken('admin-id', 'admin');
      const duplicateError = new Error('duplicate key value violates unique constraint');
      duplicateError.code = '23505';
      pool.query.mockRejectedValueOnce(duplicateError);

      const response = await request(app)
        .post('/api/v1/openclaw/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Alpha', slug: 'alpha' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PROJECT_EXISTS');
    });

    it('rejects project creation when name is only whitespace', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '   ', slug: 'alpha' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('PROJECT_NAME_REQUIRED');
    });

    it('rejects project update when name is only whitespace', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            slug: 'alpha',
            name: 'Alpha',
            description: '',
            root_path: '/projects/alpha',
            contract_path: '/projects/alpha/agent-contract.md',
            status: 'active',
          },
        ],
      });

      const response = await request(app)
        .put('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('PROJECT_NAME_REQUIRED');
    });

    it('rejects project creation when contractPath is outside the project root', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Alpha',
          slug: 'alpha',
          contractPath: '/openclaw.json',
        });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Project contractPath');
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('rejects project update when contractPath is outside the project root', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            slug: 'alpha',
            name: 'Alpha',
            description: '',
            root_path: '/projects/alpha',
            contract_path: '/projects/alpha/agent-contract.md',
            status: 'active',
          },
        ],
      });

      const response = await request(app)
        .put('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${token}`)
        .send({ contractPath: '/docs/agent-contract.md' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Project contractPath');
      expect(pool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE projects'),
        expect.any(Array),
      );
    });

    it('does not scaffold or link archived projects during creation', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            slug: 'alpha',
            name: 'Alpha',
            description: '',
            root_path: '/projects/alpha',
            contract_path: '/projects/alpha/agent-contract.md',
            status: 'archived',
          },
        ],
      });

      const response = await request(app)
        .post('/api/v1/openclaw/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Alpha', slug: 'alpha', status: 'archived' });

      expect(response.status).toBe(201);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('reconciles links when project rootPath changes', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'alpha',
              name: 'Alpha',
              description: '',
              root_path: '/projects/alpha',
              contract_path: '/projects/alpha/agent-contract.md',
              status: 'active',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'alpha',
              name: 'Alpha',
              description: '',
              root_path: '/projects/alpha-new',
              contract_path: '/projects/alpha-new/agent-contract.md',
              status: 'active',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ agent_id: 'cto' }],
        });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ action: 'created', state: 'linked' }),
        text: async () => 'OK',
      });

      const response = await request(app)
        .put('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${token}`)
        .send({ slug: 'alpha-new', rootPath: '/projects/alpha-new' });

      expect(response.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT agent_id FROM agent_project_assignments WHERE project_id = $1',
        ['11111111-1111-1111-1111-111111111111'],
      );

      const calledUrls = (global.fetch.mock.calls || []).map((call) => String(call[0]));
      expect(
        calledUrls.some((url) =>
          url.includes('/links/project/main?targetPath=%2Fprojects%2Falpha'),
        ),
      ).toBe(true);
      expect(
        calledUrls.some((url) =>
          url.includes('/links/project/cto?targetPath=%2Fprojects%2Falpha'),
        ),
      ).toBe(true);
      expect(
        calledUrls.some((url) =>
          url.includes('/links/project/main?targetPath=%2Fprojects%2Falpha-new'),
        ),
      ).toBe(true);
      expect(
        calledUrls.some((url) =>
          url.includes('/links/project/cto?targetPath=%2Fprojects%2Falpha-new'),
        ),
      ).toBe(true);
      expect(ensureProjectLinkIfMissing).not.toHaveBeenCalled();
    });

    it('removes main and assigned links when project is archived', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'alpha',
              name: 'Alpha',
              description: '',
              root_path: '/projects/alpha',
              contract_path: '/projects/alpha/agent-contract.md',
              status: 'active',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'alpha',
              name: 'Alpha',
              description: '',
              root_path: '/projects/alpha',
              contract_path: '/projects/alpha/agent-contract.md',
              status: 'archived',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ agent_id: 'cto' }],
        });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ action: 'deleted', state: 'missing' }),
        text: async () => 'OK',
      });

      const response = await request(app)
        .put('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'archived' });

      expect(response.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT agent_id FROM agent_project_assignments WHERE project_id = $1',
        ['11111111-1111-1111-1111-111111111111'],
      );

      const calledUrls = (global.fetch.mock.calls || []).map((call) => String(call[0]));
      expect(
        calledUrls.some((url) =>
          url.includes('/links/project/main?targetPath=%2Fprojects%2Falpha'),
        ),
      ).toBe(true);
      expect(
        calledUrls.some((url) =>
          url.includes('/links/project/cto?targetPath=%2Fprojects%2Falpha'),
        ),
      ).toBe(true);

      const methods = (global.fetch.mock.calls || []).map((call) => call[1]?.method);
      expect(methods.every((method) => method === 'DELETE')).toBe(true);
      expect(ensureProjectLinkIfMissing).not.toHaveBeenCalled();
    });

    it('repairs main project link when project rootPath remains unchanged', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query
        .mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'alpha',
              name: 'Alpha',
              description: '',
              root_path: '/projects/alpha',
              contract_path: '/projects/alpha/agent-contract.md',
              status: 'active',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'alpha',
              name: 'Alpha (Updated)',
              description: '',
              root_path: '/projects/alpha',
              contract_path: '/projects/alpha/agent-contract.md',
              status: 'active',
            },
          ],
        });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ action: 'created', state: 'linked' }),
        text: async () => 'OK',
      });

      const response = await request(app)
        .put('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Alpha (Updated)' });

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/links/project/main?targetPath=%2Fprojects%2Falpha'),
        expect.any(Object),
      );
      expect(ensureProjectLinkIfMissing).not.toHaveBeenCalled();
    });

    it('rejects project rootPath when it does not match slug', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Alpha', slug: 'alpha', rootPath: '/projects/beta' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Project rootPath');
    });

    it('rejects project update when projectId is not a UUID', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .put('/api/v1/openclaw/projects/not-a-uuid')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Alpha' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_PROJECT_ID');
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('rejects project delete when projectId is not a UUID', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .delete('/api/v1/openclaw/projects/not-a-uuid')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_PROJECT_ID');
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('rejects project assignment when projectId is not a UUID', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/projects/not-a-uuid/assign-agent')
        .set('Authorization', `Bearer ${token}`)
        .send({ agentId: 'cto' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_PROJECT_ID');
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('rejects project unassign when projectId is not a UUID', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .delete('/api/v1/openclaw/projects/not-a-uuid/assign-agent/cto')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_PROJECT_ID');
      expect(pool.query).not.toHaveBeenCalled();
    });

    it('rejects project rootPath when it contains extra segments', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Alpha', slug: 'alpha', rootPath: '/projects/alpha/subdir' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('exactly /projects/<slug>');
    });

    it('assigns an agent to an active project and commits before link operations', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query
        .mockResolvedValueOnce({
          rows: [{ agent_id: 'cto' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'alpha',
              name: 'Alpha',
              root_path: '/projects/alpha',
              contract_path: '/projects/alpha/agent-contract.md',
              status: 'active',
            },
          ],
        });

      const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
      const release = jest.fn();
      pool.connect.mockResolvedValueOnce({ query: clientQuery, release });

      const response = await request(app)
        .post('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111/assign-agent')
        .set('Authorization', `Bearer ${token}`)
        .send({ agentId: 'cto' });

      expect(response.status).toBe(200);
      expect(response.body.data.agentId).toBe('cto');
      expect(clientQuery).toHaveBeenCalledWith('BEGIN');
      expect(clientQuery).toHaveBeenCalledWith('COMMIT');
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agent_project_assignments'),
        ['cto', '11111111-1111-1111-1111-111111111111', 'contributor', 'admin-id'],
      );
      expect(ensureProjectLinkIfMissing).toHaveBeenCalledWith('main', '/projects/alpha');
      expect(release).toHaveBeenCalled();
      expect(release.mock.invocationCallOrder[0]).toBeLessThan(global.fetch.mock.invocationCallOrder[0]);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/links/project/cto?targetPath=%2Fprojects%2Falpha'),
        expect.any(Object),
      );
    });

    it('rejects assignment to non-active projects', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query
        .mockResolvedValueOnce({
          rows: [{ agent_id: 'cto' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'alpha',
              name: 'Alpha',
              root_path: '/projects/alpha',
              contract_path: '/projects/alpha/agent-contract.md',
              status: 'archived',
            },
          ],
        });

      const response = await request(app)
        .post('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111/assign-agent')
        .set('Authorization', `Bearer ${token}`)
        .send({ agentId: 'cto' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('PROJECT_NOT_ACTIVE');
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('cleans up assignment when project link ensure fails after commit', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query
        .mockResolvedValueOnce({
          rows: [{ agent_id: 'cto' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'alpha',
              name: 'Alpha',
              root_path: '/projects/alpha',
              contract_path: '/projects/alpha/agent-contract.md',
              status: 'active',
            },
          ],
        });

      const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
      const release = jest.fn();
      pool.connect.mockResolvedValueOnce({ query: clientQuery, release });

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'workspace link failed',
      });

      const response = await request(app)
        .post('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111/assign-agent')
        .set('Authorization', `Bearer ${token}`)
        .send({ agentId: 'cto' });

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('PROJECT_LINK_FAILED');
      expect(clientQuery).toHaveBeenCalledWith('COMMIT');
      expect(clientQuery).not.toHaveBeenCalledWith('ROLLBACK');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM agent_project_assignments'),
        ['cto', '11111111-1111-1111-1111-111111111111'],
      );
    });

    it('propagates workspace link status when project link ensure fails after commit', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query
        .mockResolvedValueOnce({
          rows: [{ agent_id: 'cto' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              slug: 'alpha',
              name: 'Alpha',
              root_path: '/projects/alpha',
              contract_path: '/projects/alpha/agent-contract.md',
              status: 'active',
            },
          ],
        });

      const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
      const release = jest.fn();
      pool.connect.mockResolvedValueOnce({ query: clientQuery, release });

      const linkErr = new Error('workspace conflict');
      linkErr.status = 409;
      global.fetch = jest.fn().mockRejectedValueOnce(linkErr);

      const response = await request(app)
        .post('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111/assign-agent')
        .set('Authorization', `Bearer ${token}`)
        .send({ agentId: 'cto' });

      expect(response.status).toBe(409);
      expect(response.body.error.status).toBe(409);
      expect(response.body.error.code).toBe('PROJECT_LINK_FAILED');
      expect(clientQuery).toHaveBeenCalledWith('COMMIT');
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM agent_project_assignments'),
        ['cto', '11111111-1111-1111-1111-111111111111'],
      );
    });

    it('rejects invalid assign-agent IDs before DB writes', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .post('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111/assign-agent')
        .set('Authorization', `Bearer ${token}`)
        .send({ agentId: 'Bad.Agent' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_AGENT_ID');
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('returns 404 when assign-agent target is not a known agent', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111/assign-agent')
        .set('Authorization', `Bearer ${token}`)
        .send({ agentId: 'cto' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('AGENT_NOT_FOUND');
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('returns warnings when delete project link cleanup partially fails', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query
        .mockResolvedValueOnce({
          rows: [{ id: '11111111-1111-1111-1111-111111111111', slug: 'alpha', root_path: '/projects/alpha' }],
        })
        .mockResolvedValueOnce({
          rows: [{ agent_id: 'cto' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      global.fetch = jest.fn().mockImplementation(async (url) => {
        if (String(url).includes('/links/project/cto?')) {
          return {
            ok: false,
            status: 500,
            text: async () => 'agent link delete failed',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ action: 'deleted', state: 'missing' }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .delete('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.warnings).toHaveLength(1);
      expect(response.body.data.warnings[0]).toContain('agent cto link cleanup failed');
    });

    it('rejects unassign when agentId format is invalid before any side effects', async () => {
      const token = getToken('admin-id', 'admin');

      const response = await request(app)
        .delete('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111/assign-agent/Bad.Agent')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_AGENT_ID');
      expect(pool.query).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fails unassign when link deletion fails and keeps assignment untouched', async () => {
      const token = getToken('admin-id', 'admin');
      pool.query.mockResolvedValueOnce({
        rows: [{ id: '11111111-1111-1111-1111-111111111111', root_path: '/projects/alpha' }],
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'unlink failed',
      });

      const response = await request(app)
        .delete('/api/v1/openclaw/projects/11111111-1111-1111-1111-111111111111/assign-agent/cto')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('PROJECT_LINK_DELETE_FAILED');
      expect(pool.query).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM agent_project_assignments'),
        expect.any(Array),
      );
    });
  });

  describe('POST /api/v1/openclaw/agents/config/:agentId/rebootstrap', () => {
    it('revokes duplicate active API keys during rebootstrap', async () => {
      const token = getToken('admin-id', 'admin');

      pool.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id') && sql.includes('FROM agent_api_keys')) {
          return { rows: [{ id: 'active-key-id' }, { id: 'stale-key-id' }] };
        }
        if (sql.includes('UPDATE agent_api_keys') && sql.includes('ANY')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: {
                  list: [
                    {
                      id: 'cto',
                      identity: { name: 'CTO', theme: 'Build systems', emoji: '🛠️' },
                      model: { primary: 'openrouter/anthropic/claude-sonnet-4.5' },
                    },
                  ],
                },
              }),
            }),
            text: async () => 'OK',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ created: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/cto/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ANY'),
        [['stale-key-id']],
      );
    });

    it('deletes the newly-created key when BOOTSTRAP write fails', async () => {
      const token = getToken('admin-id', 'admin');

      pool.query.mockImplementation(async (sql) => {
        if (sql.includes('SELECT id') && sql.includes('FROM agent_api_keys')) {
          return { rows: [] };
        }
        if (sql.includes('INSERT INTO agent_api_keys')) {
          return { rows: [{ id: 'new-key-id' }] };
        }
        if (sql.includes('DELETE FROM agent_api_keys')) {
          return { rows: [] };
        }
        return { rows: [] };
      });

      global.fetch = jest.fn().mockImplementation(async (_url, options) => {
        if (options?.method === 'GET') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              content: JSON.stringify({
                agents: { list: [{ id: 'cto', identity: { name: 'CTO' } }] },
              }),
            }),
            text: async () => 'OK',
          };
        }
        let bodyPath = '';
        try {
          const parsed = JSON.parse(options?.body || '{}');
          bodyPath = String(parsed.path || '');
        } catch (_err) {
          bodyPath = '';
        }
        if (bodyPath.endsWith('/BOOTSTRAP.md')) {
          return {
            ok: false,
            status: 500,
            text: async () => 'workspace write failed',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ created: true }),
          text: async () => 'OK',
        };
      });

      const response = await request(app)
        .post('/api/v1/openclaw/agents/config/cto/rebootstrap')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
      expect(pool.query).toHaveBeenCalledWith(
        'DELETE FROM agent_api_keys WHERE id = $1',
        ['new-key-id'],
      );
    });
  });

  describe('Error handling', () => {
    it('should handle OpenClaw service errors gracefully', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
    });

    it('should handle network errors', async () => {
      const token = getToken('user-id', 'user');

      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .get('/api/v1/openclaw/workspace/status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(503);
    });
  });
});
