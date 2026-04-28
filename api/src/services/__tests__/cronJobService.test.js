jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../../utils/configParser', () => ({
  parseOpenClawConfig: jest.fn(),
}));

jest.mock('../openclawWorkspaceClient', () => ({
  makeOpenClawRequest: jest.fn(),
  getFileContent: jest.fn(),
}));

jest.mock('../modelPricingService', () => ({
  estimateCostFromTokens: jest.fn(() => 0.12),
}));

jest.mock('../openclawGatewayClient', () => ({
  cronList: jest.fn(),
  gatewayWsRpc: jest.fn(),
}));

const pool = require('../../db/pool');
const { parseOpenClawConfig } = require('../../utils/configParser');
const { makeOpenClawRequest, getFileContent } = require('../openclawWorkspaceClient');
const { estimateCostFromTokens } = require('../modelPricingService');
const { cronList, gatewayWsRpc } = require('../openclawGatewayClient');
const {
  parseInterval,
  getAgentWorkspaceBase,
  getHeartbeatJobsFromConfig,
  getCronJobsData,
  getCronJobStatsData,
  getCronJobRunsData,
} = require('../cronJobService');

describe('cronJobService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    pool.query.mockResolvedValue({ rows: [] });
    cronList.mockResolvedValue([]);
    gatewayWsRpc.mockResolvedValue({ sessions: [] });
    parseOpenClawConfig.mockReturnValue({ agents: { list: [] } });
    estimateCostFromTokens.mockReturnValue(0.12);
  });

  it('parses interval labels to milliseconds', () => {
    expect(parseInterval('30m')).toBe(30 * 60 * 1000);
    expect(parseInterval('2h')).toBe(2 * 60 * 60 * 1000);
    expect(parseInterval('bad')).toBeNull();
  });

  it('uses the correct default workspace base and lets config override it', () => {
    expect(getAgentWorkspaceBase({ id: 'main' })).toBe('/home/node/.openclaw/workspace');
    expect(getAgentWorkspaceBase({ id: 'coo' })).toBe('/home/node/.openclaw/workspace-coo');
    expect(getAgentWorkspaceBase({ id: 'main', workspace: '/custom/main-workspace' })).toBe(
      '/custom/main-workspace',
    );
  });

  it('reads heartbeat jobs from parsed openclaw config', async () => {
    makeOpenClawRequest
      .mockResolvedValueOnce({ content: '{"agents":[]}' })
      .mockResolvedValueOnce({ content: JSON.stringify({ lastHeartbeat: '2026-03-10T01:00:00.000Z' }) });

    parseOpenClawConfig.mockReturnValue({
      agents: {
        list: [
          {
            id: 'coo',
            workspace: '/home/node/.openclaw/workspace-coo',
            identity: { name: 'COO', emoji: '📊' },
            heartbeat: { every: '30m', model: 'm', session: 'main', target: 'last' },
          },
        ],
      },
    });

    const jobs = await getHeartbeatJobsFromConfig();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].jobId).toBe('heartbeat-coo');
    expect(jobs[0].schedule.everyMs).toBe(30 * 60 * 1000);
  });

  it('uses the main workspace default when reading heartbeat state', async () => {
    makeOpenClawRequest
      .mockResolvedValueOnce({ content: '{"agents":[]}' })
      .mockResolvedValueOnce({ content: JSON.stringify({ lastHeartbeat: '2026-03-10T01:00:00.000Z' }) });

    parseOpenClawConfig.mockReturnValueOnce({
      agents: {
        list: [
          {
            id: 'main',
            identity: { name: 'Main' },
            heartbeat: { every: '15m' },
          },
        ],
      },
    });

    await getHeartbeatJobsFromConfig();

    expect(makeOpenClawRequest).toHaveBeenNthCalledWith(2, 'GET', expect.stringContaining(
      encodeURIComponent('/workspace/runtime/heartbeat/last.json'),
    ));
  });

  it('handles missing heartbeat last-run file gracefully', async () => {
    makeOpenClawRequest
      .mockResolvedValueOnce({ content: '{"agents":[]}' })
      .mockRejectedValueOnce(new Error('missing last file'));

    parseOpenClawConfig.mockReturnValueOnce({
      agents: {
        list: [
          {
            id: 'cto',
            identity: { name: 'CTO' },
            heartbeat: { every: '15m' },
          },
        ],
      },
    });

    const jobs = await getHeartbeatJobsFromConfig();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].lastRunAt).toBeNull();
  });

  it('aggregates cron jobs with execution data and agent enrichment', async () => {
    makeOpenClawRequest
      .mockResolvedValueOnce({ content: '{"agents":[]}' })
      .mockResolvedValueOnce({ content: JSON.stringify({ lastHeartbeat: '2026-03-10T01:00:00.000Z' }) });

    parseOpenClawConfig.mockReturnValueOnce({
      agents: {
        list: [
          {
            id: 'coo',
            identity: { title: 'Chief Ops', name: 'COO' },
            model: { primary: 'openrouter/model' },
            workspace: '/home/node/.openclaw/workspace-coo',
            heartbeat: { every: '30m', session: 'main', target: 'last' },
          },
        ],
      },
    });

    cronList.mockResolvedValueOnce([
      {
        jobId: 'daily',
        name: 'Daily Job',
        source: 'gateway',
        agentId: 'coo',
        cron: '*/5 * * * *',
        state: { lastRunAtMs: 1710000000000, nextRunAtMs: 1710000300000, lastStatus: 'ok' },
        payload: { kind: 'agentTurn', prompt: 'do work' },
      },
    ]);

    gatewayWsRpc
      .mockResolvedValueOnce({
        sessions: [
          {
            key: 'agent:coo:cron:daily',
            updatedAt: new Date().toISOString(),
            model: 'openrouter/model',
            contextTokens: 200,
            totalTokens: 100,
          },
          {
            key: 'agent:coo:isolated',
            updatedAt: new Date().toISOString(),
            model: 'openrouter/model',
            contextTokens: 50,
            totalTokens: 20,
          },
        ],
      })
      .mockResolvedValueOnce({
        sessions: [
          {
            key: 'agent:coo:cron:daily:run:1',
            usage: {
              input: 20,
              output: 10,
              cacheRead: 2,
              cacheWrite: 1,
              totalCost: 0.33,
              totalTokens: 70,
              lastActivity: Date.now(),
              messageCounts: { user: 1 },
            },
          },
        ],
      });

    pool.query.mockResolvedValueOnce({ rows: [{ agent_id: 'coo', name: 'COO Name' }] });

    const data = await getCronJobsData({ userId: 'u1' });
    expect(data.version).toBe(1);
    expect(data.jobs.length).toBeGreaterThan(0);
    const daily = data.jobs.find((j) => j.jobId === 'daily');
    expect(daily).toBeDefined();
    expect(daily.agentName).toBe('COO Name');
    expect(daily.lastExecution).toBeDefined();
  });

  it('normalizes schedule from expression/every and falls back when ws matching fails', async () => {
    makeOpenClawRequest.mockResolvedValueOnce({ content: '{"agents":[]}' });
    parseOpenClawConfig.mockReturnValueOnce({ agents: { list: [] } });

    cronList.mockResolvedValueOnce([
      {
        id: 'expr-job',
        name: 'Expr Job',
        source: 'gateway',
        agentId: 'main',
        expression: '*/10 * * * *',
        payload: { text: 'hello' },
      },
      {
        id: 'every-job',
        name: 'Every Job',
        source: 'gateway',
        agentId: 'main',
        interval: '30m',
        lastRunAt: '2026-03-12T10:00:00.000Z',
        payload: { prompt: 'ping' },
      },
    ]);

    gatewayWsRpc.mockRejectedValueOnce(new Error('ws list failed'));
    pool.query.mockRejectedValueOnce(new Error('db names failed'));

    const data = await getCronJobsData({ userId: 'u1' });
    expect(data.jobs).toHaveLength(2);
    expect(data.jobs[0].lastExecution).toBeDefined();
  });

  it('handles gateway cronList service-not-configured by returning only heartbeat jobs', async () => {
    makeOpenClawRequest.mockResolvedValueOnce({ content: '{"agents":[]}' });
    parseOpenClawConfig.mockReturnValueOnce({ agents: { list: [] } });
    cronList.mockRejectedValueOnce({ code: 'SERVICE_NOT_CONFIGURED', message: 'off' });

    gatewayWsRpc
      .mockResolvedValueOnce({ sessions: [] })
      .mockResolvedValueOnce({ sessions: [] });

    const data = await getCronJobsData({ userId: 'u1' });
    expect(Array.isArray(data.jobs)).toBe(true);
  });

  it('handles generic gateway cronList failure and still returns empty jobs', async () => {
    makeOpenClawRequest.mockResolvedValueOnce({ content: '{"agents":[]}' });
    parseOpenClawConfig.mockReturnValueOnce({ agents: { list: [] } });
    cronList.mockRejectedValueOnce(new Error('gateway failed'));
    gatewayWsRpc
      .mockResolvedValueOnce({ sessions: [] })
      .mockResolvedValueOnce({ sessions: [] });

    const data = await getCronJobsData({ userId: 'u1' });
    expect(data.jobs).toEqual([]);
  });

  it('keeps non-gateway non-heartbeat jobs unchanged and marks unavailable when no run match', async () => {
    makeOpenClawRequest.mockResolvedValueOnce({ content: '{"agents":[]}' });
    parseOpenClawConfig.mockReturnValueOnce({ agents: { list: [] } });

    cronList.mockResolvedValueOnce([
      { id: 'custom', source: 'other', agentId: 'x1', payload: { kind: 'systemEvent' } },
      { id: 'g1', source: 'gateway', agentId: 'x1', payload: { kind: 'systemEvent' } },
    ]);

    gatewayWsRpc
      .mockResolvedValueOnce({ sessions: [] })
      .mockResolvedValueOnce({ sessions: [] });

    const data = await getCronJobsData({ userId: 'u1' });
    const custom = data.jobs.find((j) => j.id === 'custom');
    const gateway = data.jobs.find((j) => j.id === 'g1');
    expect(custom).toBeDefined();
    expect(gateway.lastExecution.unavailable).toBe(true);
  });

  it('covers parent-only cumulative usage, run-prefix fallback, and heartbeat isolated mapping', async () => {
    makeOpenClawRequest
      .mockResolvedValueOnce({ content: '{"agents":[]}' })
      .mockResolvedValueOnce({ content: JSON.stringify({ lastHeartbeat: '2026-03-10T01:00:00.000Z' }) });

    parseOpenClawConfig.mockReturnValueOnce({
      agents: {
        list: [
          {
            id: 'coo',
            identity: { title: 'COO' },
            heartbeat: { every: '10m', session: 'isolated' },
            workspace: '/home/node/.openclaw/workspace-coo',
          },
        ],
      },
    });

    cronList.mockResolvedValueOnce([
      { id: 'g-main', source: 'gateway', agentId: 'coo', payload: { kind: 'systemEvent', session: 'main' } },
      { id: 'g-iso', source: 'gateway', agentId: 'coo', payload: { kind: 'agentTurn' } },
    ]);

    gatewayWsRpc
      .mockResolvedValueOnce({
        sessions: [
          {
            key: 'agent:coo:cron:g-main:run:abc',
            updatedAt: new Date().toISOString(),
            model: 'm',
            contextTokens: 100,
            totalTokens: 50,
          },
          {
            key: 'agent:coo:isolated',
            updatedAt: new Date().toISOString(),
            model: 'm',
            contextTokens: 100,
            totalTokens: 30,
          },
        ],
      })
      .mockResolvedValueOnce({
        sessions: [
          { key: 'agent:coo:cron:g-main', usage: { totalCost: 3, input: 20, output: 10, lastActivity: 100 } },
          {
            key: 'agent:coo:cron:g-iso:run:1',
            usage: { totalCost: 1, input: 5, output: 2, messageCounts: { user: 2 }, lastActivity: 200 },
          },
        ],
      });

    pool.query.mockResolvedValueOnce({ rows: [{ agent_id: 'coo', name: 'COO Name' }] });

    const data = await getCronJobsData({ userId: 'u1' });
    expect(data.jobs.some((j) => j.lastExecution?.isCumulative)).toBe(true);
    expect(data.jobs.length).toBeGreaterThan(0);
  });

  it('handles sessions usage fetch failure and heartbeat fallback to heartbeat key', async () => {
    makeOpenClawRequest
      .mockResolvedValueOnce({ content: '{"agents":[]}' })
      .mockResolvedValueOnce({ content: '{"agents":[]}' })
      .mockResolvedValueOnce({ content: JSON.stringify({ lastHeartbeat: '2026-03-10T01:00:00.000Z' }) });

    parseOpenClawConfig
      .mockReturnValueOnce({ agents: { list: [] } })
      .mockReturnValueOnce({
      agents: {
        list: [
          {
            id: 'coo',
            identity: { name: 'COO' },
            heartbeat: { every: '5m' },
            workspace: '/home/node/.openclaw/workspace-coo',
          },
        ],
      },
      });

    cronList.mockResolvedValueOnce([]);
    gatewayWsRpc
      .mockResolvedValueOnce({
        sessions: [
          {
            key: 'agent:coo:heartbeat',
            updatedAt: new Date().toISOString(),
            model: 'm',
            contextTokens: 100,
            totalTokens: 10,
          },
        ],
      })
      .mockRejectedValueOnce(new Error('usage failed'));

    const data = await getCronJobsData({ userId: 'u1' });
    expect(data.jobs).toHaveLength(1);
    expect(data.jobs[0].lastExecution.sessionKey).toBe('agent:coo:heartbeat');
  });

  it('keeps heartbeat job unchanged when lastExecution timestamp is invalid', async () => {
    makeOpenClawRequest.mockResolvedValueOnce({ content: '{"agents":[]}' });
    parseOpenClawConfig.mockReturnValueOnce({ agents: { list: [] } });

    cronList.mockResolvedValueOnce([
      {
        id: 'hb-invalid',
        source: 'config',
        agentId: 'a1',
        schedule: { kind: 'every', everyMs: 60000 },
        payload: { kind: 'heartbeat' },
        lastExecution: { updatedAt: 'not-a-date' },
      },
    ]);

    gatewayWsRpc
      .mockResolvedValueOnce({ sessions: [] })
      .mockResolvedValueOnce({ sessions: [] });

    const data = await getCronJobsData({ userId: 'u1' });
    expect(data.jobs[0].nextRunAt).toBeNull();
  });

  it('handles missing run-log file by returning empty runs', async () => {
    getFileContent.mockRejectedValueOnce(new Error('missing'));
    const data = await getCronJobRunsData({ userId: 'u1', jobId: 'job-1', limit: 10 });
    expect(data).toEqual({ runs: [], total: 0 });
  });

  it('computes stats from gateway and config jobs', async () => {
    cronList.mockResolvedValueOnce([
      { state: { lastStatus: 'error', nextRunAtMs: Date.now() - 1000 }, enabled: true },
    ]);
    makeOpenClawRequest.mockRejectedValueOnce(new Error('missing config'));

    const data = await getCronJobStatsData({ userId: 'u1' });
    expect(data.errors).toBe(1);
    expect(data.missed).toBe(1);
  });

  it('parses cron expression in stats when nextRunAtMs is missing', async () => {
    cronList.mockResolvedValueOnce([{ cron: '*/5 * * * *', enabled: true }]);
    makeOpenClawRequest.mockRejectedValueOnce(new Error('no config'));
    const data = await getCronJobStatsData({ userId: 'u1' });
    expect(data).toHaveProperty('missed');
  });

  it('handles stats gateway/list failures and parser errors without throwing', async () => {
    cronList.mockRejectedValueOnce(new Error('gateway stats fail'));
    makeOpenClawRequest
      .mockResolvedValueOnce({ content: '{"agents":[]}' })
      .mockResolvedValueOnce({ content: JSON.stringify({ lastHeartbeat: '2026-03-10T01:00:00.000Z' }) });
    parseOpenClawConfig.mockReturnValueOnce({
      agents: {
        list: [
          {
            id: 'coo',
            identity: { name: 'COO' },
            heartbeat: { every: 'bad-interval' },
          },
        ],
      },
    });

    const data = await getCronJobStatsData({ userId: 'u1' });
    expect(data).toEqual({ errors: 0, missed: 0 });
  });

  it('handles invalid cron expression in stats parser gracefully', async () => {
    cronList.mockResolvedValueOnce([{ expression: 'not-valid-cron', enabled: true }]);
    makeOpenClawRequest.mockRejectedValueOnce(new Error('no config'));
    const data = await getCronJobStatsData({ userId: 'u1' });
    expect(data).toHaveProperty('errors');
  });

  it('validates job id when reading run history', async () => {
    await expect(
      getCronJobRunsData({ userId: 'u1', jobId: '../bad', limit: 10 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps run log rows into API shape', async () => {
    getFileContent.mockResolvedValueOnce(
      '{"action":"finished","sessionId":"s1","runAtMs":100,"status":"ok","usage":{"input_tokens":10,"output_tokens":5},"model":"m"}\n' +
        'not-json\n',
    );

    const data = await getCronJobRunsData({ userId: 'u1', jobId: 'job-1', limit: 10 });
    expect(data.total).toBe(1);
    expect(data.runs[0].inputTokens).toBe(10);
    expect(data.runs[0].estimatedCost).toBe(0.12);
  });

  it('sorts completed runs desc then returns ascending oldest->newest', async () => {
    getFileContent.mockResolvedValueOnce(
      '{"action":"finished","sessionId":"s1","runAtMs":200,"status":"ok"}\n' +
        '{"action":"finished","sessionId":"s2","runAtMs":100,"status":"ok"}\n',
    );

    const data = await getCronJobRunsData({ userId: 'u1', jobId: 'job-2', limit: 10 });
    expect(data.total).toBe(2);
    expect(data.runs[0].runAtMs).toBe(100);
    expect(data.runs[1].runAtMs).toBe(200);
  });
});
