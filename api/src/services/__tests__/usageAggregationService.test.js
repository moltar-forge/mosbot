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
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const data = await getUsageAggregation({
      pool,
      logger,
      userId: 'u1',
      query: { range: '7d', groupBy: 'hour' },
    });

    expect(data.summary.totalCostUsd).toBe(12.34);
    expect(data.summary.totalTokensInput).toBe(100);
    expect(data.timeSeries).toHaveLength(1);
    expect(data.timeSeries[0].costUsd).toBe(1.2);
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
