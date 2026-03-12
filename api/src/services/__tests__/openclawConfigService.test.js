jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../openclawGatewayClient', () => ({
  gatewayWsRpc: jest.fn(),
}));

jest.mock('../activityLogService', () => ({
  recordActivityLogEventSafe: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../agentReconciliationService', () => ({
  reconcileAgentsFromOpenClaw: jest.fn().mockResolvedValue({}),
}));

const pool = require('../../db/pool');
const logger = require('../../utils/logger');
const { gatewayWsRpc } = require('../openclawGatewayClient');
const { recordActivityLogEventSafe } = require('../activityLogService');
const { reconcileAgentsFromOpenClaw } = require('../agentReconciliationService');
const {
  getConfig,
  applyConfig,
  listBackups,
  readBackup,
} = require('../openclawConfigService');

describe('openclawConfigService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns normalized config payload from gateway', async () => {
    gatewayWsRpc.mockResolvedValueOnce({ raw: '{"a":1}', hash: 'h1' });
    const data = await getConfig();
    expect(data).toEqual({ raw: '{"a":1}', hash: 'h1' });
  });

  it('validates raw/baseHash for apply', async () => {
    await expect(
      applyConfig({ userId: 'u1', userRole: 'admin', raw: '', baseHash: 'h1' }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      applyConfig({ userId: 'u1', userRole: 'admin', raw: '{}', baseHash: '' }),
    ).rejects.toMatchObject({ status: 400 });
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

  it('maps gateway validation failure to CONFIG_VALIDATION_FAILED', async () => {
    gatewayWsRpc
      .mockResolvedValueOnce({ raw: '{"a":1}', hash: 'h1' })
      .mockRejectedValueOnce({ message: 'invalid', rpcDetails: { line: 1 } });

    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      applyConfig({ userId: 'u1', userRole: 'admin', raw: '{"a":2}', baseHash: 'h1' }),
    ).rejects.toMatchObject({ status: 400, code: 'CONFIG_VALIDATION_FAILED' });
  });

  it('rethrows service-unavailable errors from apply', async () => {
    gatewayWsRpc
      .mockResolvedValueOnce({ raw: '{"a":1}', hash: 'h1' })
      .mockRejectedValueOnce({ code: 'SERVICE_UNAVAILABLE', status: 503, message: 'down' });

    pool.query.mockResolvedValueOnce({ rows: [] });

    await expect(
      applyConfig({ userId: 'u1', userRole: 'admin', raw: '{"a":2}', baseHash: 'h1' }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('rethrows when fetching current config fails before apply', async () => {
    gatewayWsRpc.mockRejectedValueOnce(new Error('gateway down'));
    await expect(
      applyConfig({ userId: 'u1', userRole: 'admin', raw: '{"a":2}', baseHash: 'h1' }),
    ).rejects.toThrow('gateway down');
  });

  it('keeps placeholder unchanged when no matching current secret value exists', async () => {
    gatewayWsRpc
      .mockResolvedValueOnce({ raw: '{}', hash: 'h1' })
      .mockResolvedValueOnce({ hash: 'h2' });
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-1111-1111-111111111111' }] })
      .mockResolvedValueOnce({});

    await applyConfig({
      userId: 'u1',
      userRole: 'admin',
      raw: '{"token":"__OPENCLAW_REDACTED__"}',
      baseHash: 'h1',
    });

    expect(gatewayWsRpc).toHaveBeenCalledWith(
      'config.apply',
      expect.objectContaining({
        raw: '{"token":"__OPENCLAW_REDACTED__"}',
      }),
    );
  });

  it('falls back to submitted raw when placeholder restore logging throws', async () => {
    logger.info.mockImplementation((message) => {
      if (String(message).includes('Restored redacted placeholders')) {
        throw new Error('logger info failed');
      }
    });
    gatewayWsRpc
      .mockResolvedValueOnce({ raw: '{"token":"secret"}', hash: 'h1' })
      .mockResolvedValueOnce({ hash: 'h2' });
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-1111-1111-111111111111' }] })
      .mockResolvedValueOnce({});

    await applyConfig({
      userId: 'u1',
      userRole: 'admin',
      raw: '{"token":"__OPENCLAW_REDACTED__"}',
      baseHash: 'h1',
    });

    expect(gatewayWsRpc).toHaveBeenCalledWith(
      'config.apply',
      expect.objectContaining({
        raw: '{"token":"__OPENCLAW_REDACTED__"}',
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to restore redacted placeholders (non-fatal)',
      expect.any(Object),
    );
  });

  it('continues when backup insert fails with non-missing-table error', async () => {
    gatewayWsRpc
      .mockResolvedValueOnce({ raw: '{"a":1}', hash: 'h1' })
      .mockResolvedValueOnce({ hash: 'h2' });
    pool.query.mockRejectedValueOnce(new Error('insert failed'));

    const data = await applyConfig({ userId: 'u1', userRole: 'admin', raw: '{"a":2}', baseHash: 'h1' });
    expect(data.applied).toBe(true);
    expect(data.backupId).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to write OpenClaw config backup snapshot (non-fatal)',
      expect.any(Object),
    );
  });

  it('continues when reconcile step fails after apply', async () => {
    gatewayWsRpc
      .mockResolvedValueOnce({ raw: '{"a":1}', hash: 'h1' })
      .mockResolvedValueOnce({ hash: 'h2' });
    pool.query.mockResolvedValueOnce({ rows: [{ id: '11111111-1111-1111-1111-111111111111' }] });
    reconcileAgentsFromOpenClaw.mockRejectedValueOnce(new Error('reconcile failed'));

    const data = await applyConfig({ userId: 'u1', userRole: 'admin', raw: '{"a":2}', baseHash: 'h1' });
    expect(data.applied).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'Agent reconcile after config.apply failed (non-fatal)',
      expect.any(Object),
    );
  });

  it('logs warning when updating history with new hash fails', async () => {
    gatewayWsRpc
      .mockResolvedValueOnce({ raw: '{"a":1}', hash: 'h1' })
      .mockResolvedValueOnce({ hash: 'h2' });
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: '11111111-1111-1111-1111-111111111111' }] })
      .mockRejectedValueOnce(new Error('update failed'));

    const data = await applyConfig({ userId: 'u1', userRole: 'admin', raw: '{"a":2}', baseHash: 'h1' });
    expect(data.applied).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to update config history snapshot with new hash',
      expect.any(Object),
    );
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

  it('validates path is required in readBackup', async () => {
    await expect(readBackup()).rejects.toMatchObject({
      status: 400,
    });
  });

  it('returns not found when backup row is missing', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    await expect(readBackup('11111111-1111-1111-1111-111111111111')).rejects.toMatchObject({
      status: 404,
      code: 'BACKUP_NOT_FOUND',
    });
  });

  it('reads backup row by db: path and maps response', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          raw_config: '{"a":1}',
          created_at: '2026-03-12T12:00:00.000Z',
          note: 'rollback',
          actor_user_id: 'u1',
          base_hash: 'h1',
          new_hash: 'h2',
        },
      ],
    });

    const data = await readBackup('db:11111111-1111-1111-1111-111111111111');
    expect(data.path).toBe('db:11111111-1111-1111-1111-111111111111');
    expect(data.content).toBe('{"a":1}');
    expect(data.note).toBe('rollback');
  });
});
