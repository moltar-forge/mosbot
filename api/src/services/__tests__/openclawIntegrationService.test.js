jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

const pool = require('../../db/pool');
const {
  REQUIRED_OPERATOR_SCOPES,
  getIntegrationStatus,
  assertIntegrationReady,
} = require('../openclawIntegrationService');

describe('openclawIntegrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getIntegrationStatus', () => {
    it('queries a public-only integration status projection (no encrypted secrets)', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await getIntegrationStatus();

      const sql = pool.query.mock.calls[0][0];
      expect(sql).toContain('SELECT');
      expect(sql).toContain('status');
      expect(sql).not.toContain('private_key_encrypted');
      expect(sql).not.toContain('device_token_encrypted');
    });

    it('returns uninitialized when table is missing (42P01)', async () => {
      const err = new Error('relation does not exist');
      err.code = '42P01';
      pool.query.mockRejectedValueOnce(err);

      const status = await getIntegrationStatus();

      expect(status).toEqual(
        expect.objectContaining({
          status: 'uninitialized',
          ready: false,
          requiredScopes: REQUIRED_OPERATOR_SCOPES,
          missingScopes: REQUIRED_OPERATOR_SCOPES,
          grantedScopes: [],
        }),
      );
    });

    it('downgrades ready->paired_missing_scopes when required scopes are missing', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            status: 'ready',
            granted_scopes: ['operator.read'],
            gateway_url: 'wss://example',
            device_id: 'abc',
            client_id: 'mosbot',
            client_mode: 'backend',
            platform: 'darwin',
            last_error: null,
            last_checked_at: '2026-03-13T00:00:00.000Z',
            updated_at: '2026-03-13T00:00:00.000Z',
          },
        ],
      });

      const status = await getIntegrationStatus();

      expect(status.status).toBe('paired_missing_scopes');
      expect(status.ready).toBe(false);
      expect(status.missingScopes).toEqual(
        expect.arrayContaining(['operator.write', 'operator.admin', 'operator.approvals', 'operator.pairing']),
      );
    });
  });

  describe('assertIntegrationReady', () => {
    it('throws typed pairing error when status is not ready', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await expect(assertIntegrationReady()).rejects.toMatchObject({
        status: 503,
        code: 'OPENCLAW_PAIRING_REQUIRED',
        details: expect.objectContaining({
          status: 'uninitialized',
          missingScopes: REQUIRED_OPERATOR_SCOPES,
        }),
      });
    });

    it('returns status when integration is ready', async () => {
      pool.query.mockResolvedValueOnce({
        rows: [
          {
            status: 'ready',
            granted_scopes: REQUIRED_OPERATOR_SCOPES,
            gateway_url: 'wss://example',
            device_id: 'abc',
            client_id: 'mosbot',
            client_mode: 'backend',
            platform: 'darwin',
            last_error: null,
            last_checked_at: '2026-03-13T00:00:00.000Z',
            updated_at: '2026-03-13T00:00:00.000Z',
          },
        ],
      });

      const status = await assertIntegrationReady();
      expect(status.ready).toBe(true);
      expect(status.status).toBe('ready');
    });
  });
});
