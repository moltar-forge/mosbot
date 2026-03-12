jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../../utils/configParser', () => ({
  parseOpenClawConfig: jest.fn(() => ({ agents: { list: [] } })),
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
const { makeOpenClawRequest, getFileContent } = require('../openclawWorkspaceClient');
const { cronList, gatewayWsRpc } = require('../openclawGatewayClient');
const {
  parseInterval,
  getCronJobsData,
  getCronJobStatsData,
  getCronJobRunsData,
} = require('../cronJobService');

describe('cronJobService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [] });
    cronList.mockResolvedValue([]);
    gatewayWsRpc.mockResolvedValue({ sessions: [] });
  });

  it('parses interval labels to milliseconds', () => {
    expect(parseInterval('30m')).toBe(30 * 60 * 1000);
    expect(parseInterval('2h')).toBe(2 * 60 * 60 * 1000);
    expect(parseInterval('bad')).toBeNull();
  });

  it('returns empty cron job payload when no jobs exist', async () => {
    makeOpenClawRequest.mockRejectedValue(new Error('missing config'));

    const data = await getCronJobsData({ userId: 'u1' });
    expect(data).toEqual({ version: 1, jobs: [] });
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

  it('validates job id when reading run history', async () => {
    await expect(
      getCronJobRunsData({ userId: 'u1', jobId: '../bad', limit: 10 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('maps run log rows into API shape', async () => {
    getFileContent.mockResolvedValueOnce(
      '{"action":"finished","sessionId":"s1","runAtMs":100,"status":"ok","usage":{"input_tokens":10,"output_tokens":5},"model":"m"}\n',
    );

    const data = await getCronJobRunsData({ userId: 'u1', jobId: 'job-1', limit: 10 });
    expect(data.total).toBe(1);
    expect(data.runs[0].inputTokens).toBe(10);
  });
});
