jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
}));

jest.mock('../openclawWorkspaceClient', () => ({
  getWorkspaceLink: jest.fn(),
  ensureWorkspaceLink: jest.fn(),
}));

const logger = require('../../utils/logger');
const { getWorkspaceLink, ensureWorkspaceLink } = require('../openclawWorkspaceClient');
const { ensureDocsLinkIfMissing } = require('../docsLinkReconciliationService');

describe('docsLinkReconciliationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates docs link when state is missing', async () => {
    getWorkspaceLink.mockResolvedValueOnce({ state: 'missing' });
    ensureWorkspaceLink.mockResolvedValueOnce({ action: 'created' });

    const result = await ensureDocsLinkIfMissing('cto');

    expect(result).toEqual({ agentId: 'cto', action: 'created', state: 'linked' });
    expect(getWorkspaceLink).toHaveBeenCalledWith('docs', 'cto');
    expect(ensureWorkspaceLink).toHaveBeenCalledWith('docs', 'cto');
  });

  it('does not write when link is already linked', async () => {
    getWorkspaceLink.mockResolvedValueOnce({ state: 'linked' });

    const result = await ensureDocsLinkIfMissing('cto');

    expect(result).toEqual({ agentId: 'cto', action: 'unchanged', state: 'linked' });
    expect(ensureWorkspaceLink).not.toHaveBeenCalled();
  });

  it('warns and skips writes when state is conflict', async () => {
    getWorkspaceLink.mockResolvedValueOnce({
      state: 'conflict',
      conflict: { reason: 'Path exists and is not a symlink' },
    });

    const result = await ensureDocsLinkIfMissing('cto');

    expect(result).toEqual({ agentId: 'cto', action: 'conflict', state: 'conflict' });
    expect(ensureWorkspaceLink).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Docs link reconciliation found conflict',
      expect.objectContaining({ agentId: 'cto' }),
    );
  });

  it('warns and returns skipped when agentId is missing', async () => {
    const result = await ensureDocsLinkIfMissing(null);
    expect(result).toEqual({ agentId: null, action: 'skipped' });
    expect(getWorkspaceLink).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('Docs link reconciliation skipped: missing agentId');
  });

  it('handles unexpected states without writing', async () => {
    getWorkspaceLink.mockResolvedValueOnce({ state: 'mystery' });

    const result = await ensureDocsLinkIfMissing('cto');

    expect(result).toEqual({ agentId: 'cto', action: 'unknown', state: 'mystery' });
    expect(ensureWorkspaceLink).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Docs link reconciliation received unexpected state',
      expect.objectContaining({ agentId: 'cto' }),
    );
  });

  it('returns error action when workspace client fails', async () => {
    getWorkspaceLink.mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 }));

    const result = await ensureDocsLinkIfMissing('main');

    expect(result).toEqual({ agentId: 'main', action: 'error' });
    expect(ensureWorkspaceLink).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Docs link reconciliation failed',
      expect.objectContaining({ agentId: 'main', status: 503 }),
    );
  });
});
