jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../modelPricingService', () => ({
  estimateCostFromTokens: jest.fn(() => 0),
}));

jest.mock('../openclawWorkspaceClient', () => ({
  makeOpenClawRequest: jest.fn(),
}));

jest.mock('../openclawGatewayClient', () => ({
  gatewayWsRpc: jest.fn(),
  sessionsListAllViaWs: jest.fn(),
  sessionsList: jest.fn(),
}));

jest.mock('../sessionUsageService', () => ({
  upsertSessionUsageBatch: jest.fn().mockResolvedValue(undefined),
}));

const pool = require('../../db/pool');
const { makeOpenClawRequest } = require('../openclawWorkspaceClient');
const { gatewayWsRpc, sessionsListAllViaWs, sessionsList } = require('../openclawGatewayClient');
const { upsertSessionUsageBatch } = require('../sessionUsageService');
const {
  getSessionsStatusData,
  listSessionsData,
  deleteSessionByKey,
} = require('../sessionListService');

describe('sessionListService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [] });
  });

  it('returns zeroed status counts when ws list fails', async () => {
    sessionsListAllViaWs.mockRejectedValueOnce(new Error('ws down'));

    const data = await getSessionsStatusData();
    expect(data).toEqual({ running: 0, active: 0, idle: 0, total: 0 });
  });

  it('returns status counts from sessions.list data', async () => {
    const now = Date.now();
    sessionsListAllViaWs.mockResolvedValue([
      { updatedAt: new Date(now - 30 * 1000).toISOString() },
      { updatedAt: new Date(now - 5 * 60 * 1000).toISOString() },
      { updatedAt: new Date(now - 60 * 60 * 1000).toISOString() },
    ]);

    const data = await getSessionsStatusData();
    expect(data.total).toBe(3);
    expect(data.running).toBeGreaterThanOrEqual(1);
    expect(data.idle).toBeGreaterThanOrEqual(1);
  });

  it('supports object {sessions: [...]} shape for status endpoint', async () => {
    sessionsListAllViaWs.mockResolvedValueOnce({
      sessions: [{ updatedAt: new Date().toISOString() }],
    });
    const data = await getSessionsStatusData();
    expect(data.total).toBe(1);
  });

  it('lists sessions with enrichment, telegram parsing, and cron latest-run usage', async () => {
    const now = Date.now();
    sessionsListAllViaWs.mockResolvedValueOnce({
      sessions: [
        {
          id: '1',
          key: 'agent:main:cron:daily-ops',
          updatedAt: new Date(now - 15 * 60 * 1000).toISOString(),
          kind: 'cron',
          label: 'heartbeat',
          modelProvider: 'openrouter',
          model: 'openrouter/anthropic/claude-sonnet-4.5',
          contextTokens: 200,
          totalTokens: 350,
          messages: [{ role: 'assistant', content: '' }],
        },
        {
          id: '2',
          key: 'agent:coo:telegram:group:-100:topic:7',
          updatedAt: new Date(now - 60 * 1000).toISOString(),
          kind: 'direct',
          label: 'Telegram: g-100',
          modelProvider: 'openrouter',
          model: 'anthropic/claude-3.5-sonnet',
          contextTokens: 100,
          totalTokens: 30,
          lastChannel: 'Ops Topic',
          messages: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Done' }],
              provider: 'openrouter',
              model: 'anthropic/claude-3.5-sonnet',
              usage: { input: 5, output: 2 },
            },
          ],
        },
      ],
    });

    gatewayWsRpc
      .mockResolvedValueOnce({
        sessions: [
          {
            key: 'agent:main:cron:daily-ops',
            usage: { totalCost: 1.25, input: 100, output: 50, cacheRead: 10, cacheWrite: 5 },
          },
          {
            key: 'agent:main:cron:daily-ops:run:1',
            usage: {
              totalCost: 0.5,
              input: 10,
              output: 5,
              cacheRead: 1,
              cacheWrite: 0,
              lastActivity: now,
              messageCounts: { user: 1 },
            },
          },
          {
            key: 'agent:coo:telegram:group:-100:topic:7',
            usage: { totalCost: 0.1, input: 5, output: 2, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      })
      .mockResolvedValueOnce({ totals: { totalCost: 4.56 } });

    pool.query.mockResolvedValueOnce({
      rows: [{ agent_id: 'main', name: 'Main Agent' }, { agent_id: 'coo', name: 'COO' }],
    });

    const result = await listSessionsData({ userId: 'u1' });

    expect(result.dailyCost).toBe(4.56);
    expect(result.sessions).toHaveLength(2);

    const cron = result.sessions.find((s) => s.key === 'agent:main:cron:daily-ops');
    expect(cron).toBeDefined();
    expect(cron.agentName).toBe('Main Agent');
    expect(cron.messageCost).toBeGreaterThan(0);
    expect(cron.totalTokensUsed).toBeLessThanOrEqual(cron.contextTokens);

    const telegram = result.sessions.find((s) => s.key.includes('telegram:group'));
    expect(telegram).toBeDefined();
    expect(telegram.agentName).toBe('COO');
    expect(telegram.topic).toContain('Ops Topic');
  });

  it('handles ws array response and cost-fetch failure gracefully', async () => {
    const now = Date.now();
    sessionsListAllViaWs.mockResolvedValueOnce([
      {
        id: '1',
        key: 'agent:main:isolated',
        updatedAt: new Date(now - 10 * 60 * 1000).toISOString(),
        kind: 'direct',
        model: 'm1',
        messages: [{ role: 'assistant', content: 'ok', model: 'm1' }],
      },
    ]);

    gatewayWsRpc.mockRejectedValueOnce(new Error('cost fail'));
    pool.query.mockRejectedValueOnce(new Error('db fail'));

    const result = await listSessionsData({ userId: 'u1' });
    expect(result.dailyCost).toBe(0);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].kind).toBe('heartbeat');
  });

  it('covers model derivation fallbacks, truncation, and async usage upsert failure', async () => {
    const now = Date.now();
    sessionsListAllViaWs.mockResolvedValueOnce({
      sessions: [
        {
          id: 's1',
          key: 'agent:main:main',
          updatedAt: new Date(now - 60 * 1000).toISOString(),
          messages: [
            {
              role: 'assistant',
              provider: 'openrouter',
              model: 'openrouter/openrouter/anthropic/claude-3.5-sonnet',
              content: 'x'.repeat(260),
              usage: { input: 5, output: 2 },
            },
          ],
          contextTokens: 100,
          totalTokens: 20,
        },
        {
          id: 's2',
          key: 'agent:coo:cron:daily',
          kind: 'cron',
          updatedAt: new Date(now - 40 * 60 * 1000).toISOString(),
          messages: [{ timestamp: now - 20 * 60 * 1000, content: 'heartbeat msg' }],
          model: 'plain-model',
          contextTokens: 50,
          totalTokens: 100,
        },
      ],
    });

    gatewayWsRpc
      .mockResolvedValueOnce({
        sessions: [
          { key: 'agent:coo:cron:daily', usage: { totalCost: 2, input: 12, output: 6 } },
          {
            key: 'agent:coo:cron:daily:run:1',
            usage: { totalCost: 1, input: 4, output: 2, messageCounts: { user: 2 }, lastActivity: now },
          },
        ],
      })
      .mockResolvedValueOnce({ totals: { totalCost: 1.23 } });

    pool.query.mockResolvedValueOnce({ rows: [] });
    upsertSessionUsageBatch.mockRejectedValueOnce(new Error('upsert failed'));

    const result = await listSessionsData({ userId: 'u1' });
    expect(result.sessions).toHaveLength(2);
    const first = result.sessions.find((s) => s.id === 's1');
    expect(first.lastMessage.length).toBeLessThanOrEqual(203);
    const cron = result.sessions.find((s) => s.id === 's2');
    expect(['active', 'running']).toContain(cron.status);
  });

  it('falls back to per-agent list when websocket list fails', async () => {
    sessionsListAllViaWs.mockRejectedValueOnce(new Error('ws down'));
    makeOpenClawRequest.mockResolvedValueOnce({
      content: JSON.stringify({ agents: { list: [{ id: 'coo' }] } }),
    });
    sessionsList
      .mockResolvedValueOnce([{ id: 'a', key: 'main' }])
      .mockResolvedValueOnce([{ sessionId: 'b', key: 'agent:coo:main' }]);

    const result = await listSessionsData({ userId: 'u1' });
    expect(result.sessions.length).toBe(2);
  });

  it('validates session key for deletion', async () => {
    await expect(deleteSessionByKey({ userId: 'u1' })).rejects.toMatchObject({ status: 400 });
  });

  it('maps unsupported delete RPC to 501', async () => {
    gatewayWsRpc.mockRejectedValueOnce(new Error('unknown method'));

    await expect(
      deleteSessionByKey({ userId: 'u1', sessionKey: 'agent:main:main' }),
    ).rejects.toMatchObject({ status: 501, code: 'NOT_IMPLEMENTED' });
  });

  it('maps forbidden delete RPC to 403', async () => {
    gatewayWsRpc.mockRejectedValueOnce(new Error('cannot delete webchat session'));

    await expect(
      deleteSessionByKey({ userId: 'u1', sessionKey: 'agent:main:main' }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('deletes session successfully when gateway supports it', async () => {
    gatewayWsRpc.mockResolvedValueOnce({ ok: true });

    const result = await deleteSessionByKey({ userId: 'u1', sessionKey: 'agent:main:main' });
    expect(result.deleted).toBe(true);
  });

  it('handles unknown ws result shape and returns empty sessions', async () => {
    sessionsListAllViaWs.mockResolvedValueOnce({ foo: 'bar' });

    const result = await listSessionsData({ userId: 'u1' });
    expect(result.sessions).toEqual([]);
    expect(result.dailyCost).toBe(0);
  });

  it('handles fallback agent config parse failure and sessions without identifiers', async () => {
    sessionsListAllViaWs.mockRejectedValueOnce(new Error('ws fail'));
    makeOpenClawRequest.mockRejectedValueOnce(new Error('config missing'));
    sessionsList
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{ id: 'ok-id', key: 'agent:coo:main' }])
      .mockResolvedValue([]);

    const result = await listSessionsData({ userId: 'u1' });
    expect(result.sessions.length).toBeGreaterThan(0);
  });

  it('rethrows unknown delete errors', async () => {
    gatewayWsRpc.mockRejectedValueOnce(new Error('boom'));
    await expect(
      deleteSessionByKey({ userId: 'u1', sessionKey: 'agent:main:main' }),
    ).rejects.toThrow('boom');
  });
});
