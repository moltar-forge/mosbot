/**
 * Integration tests for GET /api/v1/openclaw/subagents
 *
 * Runtime file integrations under /runtime/mosbot/* are retired.
 * This endpoint remains as a compatibility surface and returns empty arrays.
 */

jest.mock('../../db/pool', () => ({
  query: jest.fn(),
  end: jest.fn(),
}));

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const openclawRouter = require('../openclaw');
const pool = require('../../db/pool');

function getToken(userId, role) {
  const jwtSecret = process.env.JWT_SECRET || 'test-only-jwt-secret-not-for-production';
  return jwt.sign({ id: userId, role, email: `${role}@example.com` }, jwtSecret, {
    expiresIn: '1h',
  });
}

describe('GET /api/v1/openclaw/subagents', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/openclaw', openclawRouter);
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

      return { rows: [] };
    });
  });

  it('returns empty arrays for running, queued, and completed', async () => {
    const token = getToken('user-id', 'user');

    const response = await request(app)
      .get('/api/v1/openclaw/subagents')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        running: [],
        queued: [],
        completed: [],
      },
    });
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/openclaw/subagents');

    expect(response.status).toBe(401);
    expect(response.body.error).toMatchObject({
      message: 'Authorization required',
      status: 401,
    });
  });
});
