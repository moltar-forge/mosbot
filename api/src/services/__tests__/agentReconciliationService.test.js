jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../openclawWorkspaceClient', () => ({
  makeOpenClawRequest: jest.fn(),
}));

const pool = require('../../db/pool');
const { makeOpenClawRequest } = require('../openclawWorkspaceClient');
const { reconcileAgentsFromOpenClaw } = require('../agentReconciliationService');

describe('agentReconciliationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts discovered agents and deactivates removed ones', async () => {
    makeOpenClawRequest.mockResolvedValueOnce({
      content: JSON.stringify({
        agents: {
          list: [
            { id: 'coo', identity: { name: 'COO' } },
            { id: 'cto', identity: { name: 'CTO' } },
          ],
        },
      }),
    });

    pool.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await reconcileAgentsFromOpenClaw({ trigger: 'test' });

    expect(result.discoveredIds).toEqual(expect.arrayContaining(['coo', 'cto', 'main']));
    expect(result.deactivated).toBe(1);

    // Reconcile should preserve custom DB names (it should not blindly overwrite name)
    const upsertSql = pool.query.mock.calls[0][0];
    expect(upsertSql).toContain("COALESCE(NULLIF(agents.name, ''), EXCLUDED.name)");
  });

  it('injects implicit main when agents.list is empty', async () => {
    makeOpenClawRequest.mockResolvedValueOnce({
      content: JSON.stringify({ agents: { list: [] } }),
    });

    pool.query
      .mockResolvedValueOnce({}) // upsert main
      .mockResolvedValueOnce({ rowCount: 0 }); // deactivate missing

    const result = await reconcileAgentsFromOpenClaw({ trigger: 'test-empty' });

    expect(result.discoveredIds).toEqual(['main']);
    expect(result.discoveredCount).toBe(1);
    expect(result.deactivated).toBe(0);
  });

  it('deduplicates repeated agent IDs in openclaw list', async () => {
    makeOpenClawRequest.mockResolvedValueOnce({
      content: JSON.stringify({
        agents: {
          list: [
            { id: 'coo', identity: { name: 'COO 1' } },
            { id: 'coo', identity: { name: 'COO 2' } },
          ],
        },
      }),
    });

    pool.query
      .mockResolvedValueOnce({}) // upsert coo
      .mockResolvedValueOnce({}) // upsert main
      .mockResolvedValueOnce({ rowCount: 0 }); // deactivate

    const result = await reconcileAgentsFromOpenClaw({ trigger: 'test-dedupe' });

    expect(result.discoveredIds).toEqual(expect.arrayContaining(['coo', 'main']));
    expect(result.discoveredIds.filter((id) => id === 'coo')).toHaveLength(1);
    expect(result.discoveredCount).toBe(2);
  });
});
