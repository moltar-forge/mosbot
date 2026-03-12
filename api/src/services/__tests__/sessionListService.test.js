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
  });

  it('lists sessions with dailyCost from usage.cost', async () => {
    sessionsListAllViaWs.mockResolvedValueOnce({
      sessions: [
        {
          id: '1',
          key: 'agent:main:main',
          updatedAt: new Date().toISOString(),
          modelProvider: 'openrouter',
          model: 'anthropic/claude-sonnet-4.5',
          contextTokens: 100,
          totalTokens: 10,
        },
      ],
    });

    gatewayWsRpc
      .mockResolvedValueOnce({ sessions: [] })
      .mockResolvedValueOnce({ totals: { totalCost: 4.56 } });

    const result = await listSessionsData({ userId: 'u1' });
    expect(result.dailyCost).toBe(4.56);
    expect(Array.isArray(result.sessions)).toBe(true);
    expect(result.sessions).toHaveLength(1);
  });

  it('falls back to per-agent list when websocket list fails', async () => {
    sessionsListAllViaWs.mockRejectedValueOnce(new Error('ws down'));
    makeOpenClawRequest.mockResolvedValueOnce({ content: JSON.stringify({ agents: { list: [] } }) });
    sessionsList.mockResolvedValue([]);

    const result = await listSessionsData({ userId: 'u1' });
    expect(result.sessions).toEqual([]);
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
});
