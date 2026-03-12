/**
 * Integration tests for GET /api/v1/tasks/:id/subagents
 *
 * Runtime workspace files are retired; this endpoint now primarily reflects
 * gateway-discovered subagent sessions and degrades to empty when unavailable.
 */

jest.mock('../../db/pool', () => ({
  query: jest.fn(),
  end: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

jest.mock('../../services/openclawGatewayClient', () => ({
  sessionsList: jest.fn(),
  sessionsHistory: jest.fn(),
  invokeTool: jest.fn(),
  sessionsListAllViaWs: jest.fn(),
  sessionsHistoryViaWs: jest.fn(),
  gatewayWsRpc: jest.fn(),
  cronList: jest.fn(),
  parseJsonWithLiteralNewlines: jest.fn((x) => (typeof x === 'string' ? JSON.parse(x) : x)),
  sleep: jest.fn((ms) => new Promise((r) => setTimeout(r, ms))),
  isRetryableError: jest.fn(() => false),
}));

const tasksRouter = require('../tasks');
const openclawGatewayClient = require('../../services/openclawGatewayClient');
const pool = require('../../db/pool');

function getToken(userId, role) {
  const jwtSecret = process.env.JWT_SECRET || 'test-only-jwt-secret-not-for-production';
  return jwt.sign({ id: userId, role, email: `${role}@example.com` }, jwtSecret, {
    expiresIn: '1h',
  });
}

describe('GET /api/v1/tasks/:id/subagents', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/tasks', tasksRouter);
    app.use((err, req, res, _next) => {
      res.status(err.status || 500).json({
        error: {
          message: err.message || 'Internal server error',
          status: err.status || 500,
        },
      });
    });

    pool.query.mockImplementation(async (query, params) => {
      if (query.includes('SELECT id, name, email, role, active FROM users WHERE id')) {
        const userId = params[0];
        return {
          rows: [
            {
              id: userId,
              name: 'Test User',
              email: 'test@example.com',
              role: 'user',
              active: true,
            },
          ],
        };
      }

      if (query.includes('SELECT id, task_number FROM tasks WHERE id')) {
        const taskId = params[0];
        if (taskId === '404e4567-e89b-12d3-a456-426614174404') {
          return { rows: [] };
        }
        return {
          rows: [{ id: taskId, task_number: 123 }],
        };
      }

      if (query.includes('SELECT id, task_number FROM tasks WHERE id IN')) {
        return { rows: [] };
      }

      return { rows: [] };
    });
  });

  beforeEach(() => {
    openclawGatewayClient.sessionsList.mockResolvedValue([]);
    openclawGatewayClient.sessionsHistory.mockResolvedValue([]);
  });

  it('returns gateway-backed attempts for the task', async () => {
    const token = getToken('user-id', 'user');
    const taskId = '123e4567-e89b-12d3-a456-426614174000';

    openclawGatewayClient.sessionsList.mockResolvedValue([
      {
        key: 'agent:main:subagent:abc',
        displayName: `mosbot-task-${taskId}-001`,
        kind: 'other',
        model: 'sonnet',
        totalTokens: 15000,
        updatedAt: '2026-02-10T09:00:00Z',
        abortedLastRun: false,
      },
    ]);
    openclawGatewayClient.sessionsHistory.mockResolvedValue([
      { role: 'user', content: 'Do the task' },
      { role: 'assistant', content: 'Task completed successfully' },
    ]);

    const response = await request(app)
      .get(`/api/v1/tasks/${taskId}/subagents`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.meta).toMatchObject({
      total: 1,
      running: 1,
      completed: 0,
      failed: 0,
      queued: 0,
    });
    expect(response.body.data[0]).toMatchObject({
      taskId,
      sessionKey: 'agent:main:subagent:abc',
      status: 'running',
      model: 'sonnet',
      tokensUsed: 15000,
      outcome: 'Task completed successfully',
    });
  });

  it('maps aborted gateway sessions to failed status', async () => {
    const token = getToken('user-id', 'user');
    const taskId = '223e4567-e89b-12d3-a456-426614174000';

    openclawGatewayClient.sessionsList.mockResolvedValue([
      {
        key: 'agent:main:subagent:failed',
        displayName: `mosbot-task-${taskId}-001`,
        kind: 'other',
        model: 'haiku',
        abortedLastRun: true,
      },
    ]);

    const response = await request(app)
      .get(`/api/v1/tasks/${taskId}/subagents`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.meta.failed).toBe(1);
    expect(response.body.data[0].status).toBe('failed');
  });

  it('returns empty attempts when gateway is unavailable', async () => {
    const token = getToken('user-id', 'user');
    const taskId = '323e4567-e89b-12d3-a456-426614174000';

    openclawGatewayClient.sessionsList.mockRejectedValue(new Error('gateway unavailable'));

    const response = await request(app)
      .get(`/api/v1/tasks/${taskId}/subagents`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.meta).toMatchObject({
      total: 0,
      running: 0,
      completed: 0,
      failed: 0,
      queued: 0,
    });
  });

  it('returns 404 when task is not found', async () => {
    const token = getToken('user-id', 'user');
    const missingTaskId = '404e4567-e89b-12d3-a456-426614174404';

    const response = await request(app)
      .get(`/api/v1/tasks/${missingTaskId}/subagents`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({
      message: 'Task not found',
      status: 404,
    });
  });

  it('requires authentication', async () => {
    const taskId = '123e4567-e89b-12d3-a456-426614174000';

    const response = await request(app).get(`/api/v1/tasks/${taskId}/subagents`);

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      message: 'No token provided',
      status: 401,
    });
  });
});
