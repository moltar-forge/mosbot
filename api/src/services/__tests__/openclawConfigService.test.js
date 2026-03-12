jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../openclawGatewayClient', () => ({
  gatewayWsRpc: jest.fn(),
}));

jest.mock('../activityLogService', () => ({
  recordActivityLogEventSafe: jest.fn(),
}));

jest.mock('../agentReconciliationService', () => ({
  reconcileAgentsFromOpenClaw: jest.fn().mockResolvedValue({}),
}));

const pool = require('../../db/pool');
const { gatewayWsRpc } = require('../openclawGatewayClient');
const { recordActivityLogEventSafe } = require('../activityLogService');
const {
  getConfig,
  applyConfig,
  listBackups,
  readBackup,
} = require('../openclawConfigService');

describe('openclawConfigService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns normalized config payload from gateway', async () => {
    gatewayWsRpc.mockResolvedValueOnce({ raw: '{"a":1}', hash: 'h1' });
    const data = await getConfig();
    expect(data).toEqual({ raw: '{"a":1}', hash: 'h1' });
  });

  it('throws conflict when baseHash differs from current', async () => {
    gatewayWsRpc.mockResolvedValueOnce({ raw: '{"a":1}', hash: 'current' });

    await expect(
      applyConfig({
        userId: 'u1',
        userRole: 'admin',
        raw: '{"a":2}',
        baseHash: 'stale',
      }),
    ).rejects.toMatchObject({ status: 409, code: 'CONFIG_CONFLICT' });
  });

  it('applies config and returns backup metadata', async () => {
    gatewayWsRpc
      .mockResolvedValueOnce({ raw: '{"token":"secret"}', hash: 'h1' })
      .mockResolvedValueOnce({ hash: 'h2' });

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-1111-1111-111111111111' }] })
      .mockResolvedValueOnce({});

    const data = await applyConfig({
      userId: 'u1',
      userRole: 'admin',
      raw: '{"token":"__OPENCLAW_REDACTED__"}',
      baseHash: 'h1',
      note: 'test apply',
    });

    expect(gatewayWsRpc).toHaveBeenCalledWith(
      'config.apply',
      expect.objectContaining({
        baseHash: 'h1',
      }),
    );
    expect(data.applied).toBe(true);
    expect(data.hash).toBe('h2');
    expect(recordActivityLogEventSafe).toHaveBeenCalled();
  });

  it('lists backups and maps db rows', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          created_at: '2026-03-12T12:00:00.000Z',
          note: 'n',
          actor_user_id: 'u1',
          base_hash: 'h1',
          new_hash: 'h2',
          size_bytes: 42,
        },
      ],
    });

    const data = await listBackups();
    expect(data).toHaveLength(1);
    expect(data[0].path).toBe('db:11111111-1111-1111-1111-111111111111');
  });

  it('validates backup id format in readBackup', async () => {
    await expect(readBackup('bad-id')).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_BACKUP_ID',
    });
  });
});
