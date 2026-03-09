jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

const pool = require('../../db/pool');
const authRouter = require('../auth');
const { authenticateToken } = authRouter;

function createReq(token) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    user: null,
  };
}

function createRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

describe('authenticateToken API key flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authenticates valid mba_ key as agent', async () => {
    const req = createReq('mba_test_valid_key');
    const res = createRes();
    const next = jest.fn();

    pool.query
      .mockResolvedValueOnce({
        rows: [
          {
            agent_db_id: '11111111-1111-1111-1111-111111111111',
            user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            agent_id: 'main',
            name: 'Main Agent',
            status: 'active',
            active: true,
            key_id: '22222222-2222-2222-2222-222222222222',
            revoked_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // UPDATE last_used

    await authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      agent_db_id: '11111111-1111-1111-1111-111111111111',
      role: 'agent',
      agent_id: 'main',
      auth_type: 'api_key',
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects invalid mba_ key', async () => {
    const req = createReq('mba_bad_key');
    const res = createRes();
    const next = jest.fn();

    pool.query.mockResolvedValueOnce({ rows: [] });

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects revoked mba_ key', async () => {
    const req = createReq('mba_revoked_key');
    const res = createRes();
    const next = jest.fn();

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          agent_db_id: '11111111-1111-1111-1111-111111111111',
          user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          agent_id: 'main',
          name: 'Main Agent',
          status: 'active',
          active: true,
          key_id: '22222222-2222-2222-2222-222222222222',
          revoked_at: new Date().toISOString(),
        },
      ],
    });

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects inactive/deprecated agent mba_ key', async () => {
    const req = createReq('mba_inactive_key');
    const res = createRes();
    const next = jest.fn();

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          agent_db_id: '11111111-1111-1111-1111-111111111111',
          user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          agent_id: 'main',
          name: 'Main Agent',
          status: 'deprecated',
          active: false,
          key_id: '22222222-2222-2222-2222-222222222222',
          revoked_at: null,
        },
      ],
    });

    await authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
