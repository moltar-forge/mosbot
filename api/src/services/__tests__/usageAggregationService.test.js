jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

const bcrypt = require('bcrypt');
const {
  getUsageAggregation,
  resetUsageData,
  resolveUsageWindow,
} = require('../usageAggregationService');

describe('usageAggregationService', () => {
  let pool;
  let logger;

  beforeEach(() => {
    pool = {
      query: jest.fn(),
    };
    logger = {
      info: jest.fn(),
    };
    jest.clearAllMocks();
  });

  it('defaults to 7d range and hour/day auto grouping', () => {
    const result = resolveUsageWindow({});
    expect(result.range).toBe('7d');
    expect(['hour', 'day']).toContain(result.groupBy);
    expect(result.startAt).toBeInstanceOf(Date);
    expect(result.endAt).toBeInstanceOf(Date);
  });

  it('supports today range with timezone', () => {
    const result = resolveUsageWindow({ range: 'today', timezone: 'America/New_York' });
    expect(result.range).toBe('today');
    expect(result.startAt).toBeInstanceOf(Date);
  });

  it.each(['24h', '3d', '14d', '30d', '3m', '6m'])(
    'supports predefined range %s',
    (range) => {
      const result = resolveUsageWindow({ range });
      expect(result.range).toBe(range);
      expect(result.startAt).toBeInstanceOf(Date);
    },
  );

  it('throws 400 when custom date range is invalid', async () => {
    await expect(
      getUsageAggregation({
        pool,
        logger,
        userId: 'u1',
        query: { startDate: 'invalid', endDate: 'also-invalid' },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when start date is after end date', async () => {
    await expect(
      getUsageAggregation({
        pool,
        logger,
        userId: 'u1',
        query: {
          startDate: '2026-03-12T00:00:00.000Z',
          endDate: '2026-03-10T00:00:00.000Z',
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns mapped usage analytics payload', async () => {
    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            total_cost_usd: '12.34',
            total_tokens_input: '100',
            total_tokens_output: '20',
            total_tokens_cache_read: '5',
            total_tokens_cache_write: '1',
            session_count: '3',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            bucket: '2026-03-01T00:00:00.000Z',
            cost_usd: '1.2',
            tokens_input: '10',
            tokens_output: '2',
            tokens_cache_read: '0',
            tokens_cache_write: '0',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            agent_key: 'main',
            cost_usd: '2.5',
            tokens_input: '20',
            tokens_output: '10',
            tokens_cache_read: '1',
            tokens_cache_write: '0',
            session_count: '2',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            model: 'openrouter/a',
            cost_usd: '3.2',
            tokens_input: '30',
            tokens_output: '15',
            tokens_cache_read: '2',
            tokens_cache_write: '1',
            session_count: '2',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            job_id: 'job-1',
            job_label: 'Job 1',
            agent_key: 'main',
            cost_usd: '4.2',
            tokens_input: '40',
            tokens_output: '16',
            tokens_cache_read: '3',
            tokens_cache_write: '1',
            run_count: '3',
          },
        ],
      });

    const data = await getUsageAggregation({
      pool,
      logger,
      userId: 'u1',
      query: { range: '7d', groupBy: 'hour' },
    });

    expect(data.summary.totalCostUsd).toBe(12.34);
    expect(data.byAgent[0].agentKey).toBe('main');
    expect(data.byModel[0].model).toBe('openrouter/a');
    expect(data.byJob[0].jobId).toBe('job-1');
  });

  it('resets usage data after password verification', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ password_hash: 'hash' }] })
      .mockResolvedValueOnce({ rows: [{ total: '4' }] })
      .mockResolvedValueOnce({ rows: [{ total: '6' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    bcrypt.compare.mockResolvedValue(true);

    const data = await resetUsageData({
      pool,
      userId: 'u1',
      password: 'secret',
    });

    expect(data.success).toBe(true);
    expect(data.deletedCount.total).toBe(10);
  });

  it('throws 400 when password missing during reset', async () => {
    await expect(
      resetUsageData({
        pool,
        userId: 'u1',
        password: '',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('throws 401 when user is missing during reset', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      resetUsageData({
        pool,
        userId: 'u1',
        password: 'secret',
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('throws 401 on invalid password during reset', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ password_hash: 'hash' }] });
    bcrypt.compare.mockResolvedValue(false);

    await expect(
      resetUsageData({
        pool,
        userId: 'u1',
        password: 'bad',
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
