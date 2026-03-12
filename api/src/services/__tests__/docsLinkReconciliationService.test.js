jest.mock('../../utils/logger', () => ({
  warn: jest.fn(),
}));

jest.mock('../openclawWorkspaceClient', () => ({
  getWorkspaceLink: jest.fn(),
  ensureWorkspaceLink: jest.fn(),
  getFileContent: jest.fn(),
}));

jest.mock('../../db/pool', () => ({
  query: jest.fn(),
}));

const logger = require('../../utils/logger');
const pool = require('../../db/pool');
const {
  getWorkspaceLink,
  ensureWorkspaceLink,
  getFileContent,
} = require('../openclawWorkspaceClient');
const {
  ensureDocsLinkIfMissing,
  ensureProjectLinkIfMissing,
  reconcileDocsLinksOnStartup,
  collectAgentIdsFromOpenClawConfig,
} = require('../docsLinkReconciliationService');

describe('docsLinkReconciliationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pool.query.mockResolvedValue({ rows: [] });
  });

  it('creates docs link when state is missing', async () => {
    getWorkspaceLink.mockResolvedValueOnce({ state: 'missing' });
    ensureWorkspaceLink.mockResolvedValueOnce({ action: 'created' });

    const result = await ensureDocsLinkIfMissing('cto');

    expect(result).toEqual({ agentId: 'cto', action: 'created', state: 'linked' });
    expect(getWorkspaceLink).toHaveBeenCalledWith('docs', 'cto', {});
    expect(ensureWorkspaceLink).toHaveBeenCalledWith('docs', 'cto', {});
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
      'docs link reconciliation found conflict',
      expect.objectContaining({ agentId: 'cto' }),
    );
  });

  it('repairs project link conflicts when workspace service supports self-heal', async () => {
    getWorkspaceLink.mockResolvedValueOnce({
      state: 'conflict',
      conflict: { reason: 'Symlink points to unexpected target' },
    });
    ensureWorkspaceLink.mockResolvedValueOnce({ action: 'created' });

    const result = await ensureProjectLinkIfMissing('cto', '/projects/project-alpha');

    expect(result).toEqual({ agentId: 'cto', action: 'repaired', state: 'linked' });
    expect(getWorkspaceLink).toHaveBeenCalledWith('project', 'cto', {
      targetPath: '/projects/project-alpha',
    });
    expect(ensureWorkspaceLink).toHaveBeenCalledWith('project', 'cto', {
      targetPath: '/projects/project-alpha',
    });
  });

  it('warns and returns skipped when agentId is missing', async () => {
    const result = await ensureDocsLinkIfMissing(null);
    expect(result).toEqual({ agentId: null, action: 'skipped' });
    expect(getWorkspaceLink).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('docs link reconciliation skipped: missing agentId');
  });

  it('handles unexpected states without writing', async () => {
    getWorkspaceLink.mockResolvedValueOnce({ state: 'mystery' });

    const result = await ensureDocsLinkIfMissing('cto');

    expect(result).toEqual({ agentId: 'cto', action: 'unknown', state: 'mystery' });
    expect(ensureWorkspaceLink).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'docs link reconciliation received unexpected state',
      expect.objectContaining({ agentId: 'cto' }),
    );
  });

  it('returns error action when workspace client fails', async () => {
    getWorkspaceLink.mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 }));

    const result = await ensureDocsLinkIfMissing('main');

    expect(result).toEqual({ agentId: 'main', action: 'error' });
    expect(ensureWorkspaceLink).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'docs link reconciliation failed',
      expect.objectContaining({ agentId: 'main', status: 503 }),
    );
  });

  it('collectAgentIdsFromOpenClawConfig extracts unique non-main ids', () => {
    const ids = collectAgentIdsFromOpenClawConfig(
      JSON.stringify({
        agents: {
          list: [{ id: 'main' }, { id: 'worker-agent' }, { id: 'cto' }, { id: 'cto' }],
        },
      }),
    );

    expect(ids).toEqual(['worker-agent', 'cto']);
  });

  it('collectAgentIdsFromOpenClawConfig returns [] on parse errors', () => {
    const ids = collectAgentIdsFromOpenClawConfig('{bad json');
    expect(ids).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      'Docs link startup reconciliation: could not parse openclaw.json',
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('reconcileDocsLinksOnStartup ensures main and configured agents', async () => {
    getFileContent.mockResolvedValueOnce(
      JSON.stringify({
        agents: {
          list: [{ id: 'main' }, { id: 'worker-agent' }, { id: 'cto' }],
        },
      }),
    );
    getWorkspaceLink
      .mockResolvedValueOnce({ state: 'missing' }) // main
      .mockResolvedValueOnce({ state: 'missing' }) // worker-agent
      .mockResolvedValueOnce({ state: 'linked' }); // cto
    ensureWorkspaceLink
      .mockResolvedValueOnce({ action: 'created' }) // main
      .mockResolvedValueOnce({ action: 'created' }); // worker-agent

    const result = await reconcileDocsLinksOnStartup();

    expect(getWorkspaceLink).toHaveBeenNthCalledWith(1, 'docs', 'main', {});
    expect(getWorkspaceLink).toHaveBeenNthCalledWith(2, 'docs', 'worker-agent', {});
    expect(getWorkspaceLink).toHaveBeenNthCalledWith(3, 'docs', 'cto', {});
    expect(result.main).toEqual({ agentId: 'main', action: 'created', state: 'linked' });
    expect(result.agents).toEqual([
      { agentId: 'worker-agent', action: 'created', state: 'linked' },
      { agentId: 'cto', action: 'unchanged', state: 'linked' },
    ]);
    expect(result.projectLinks).toEqual({ results: [] });
  });

  it('reconcileDocsLinksOnStartup still reconciles main when openclaw.json read fails', async () => {
    getWorkspaceLink.mockResolvedValueOnce({ state: 'linked' });
    getFileContent.mockRejectedValueOnce(
      Object.assign(new Error('workspace unavailable'), { status: 503 }),
    );

    const result = await reconcileDocsLinksOnStartup();

    expect(getWorkspaceLink).toHaveBeenCalledTimes(1);
    expect(getWorkspaceLink).toHaveBeenCalledWith('docs', 'main', {});
    expect(result).toEqual({
      main: { agentId: 'main', action: 'unchanged', state: 'linked' },
      agents: [],
      projectLinks: { results: [] },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Docs link startup reconciliation: failed to read openclaw.json',
      expect.objectContaining({ message: 'workspace unavailable', status: 503 }),
    );
  });

  it('reconcileDocsLinksOnStartup ensures main has links to all active project roots', async () => {
    getFileContent.mockResolvedValueOnce(JSON.stringify({ agents: { list: [{ id: 'main' }] } }));

    getWorkspaceLink
      .mockResolvedValueOnce({ state: 'linked' }) // docs/main
      .mockResolvedValueOnce({ state: 'missing' }) // project/main:/projects/project-alpha
      .mockResolvedValueOnce({ state: 'linked' }); // project/main:/projects/project-beta

    pool.query.mockResolvedValueOnce({
      rows: [
        { agent_id: 'api-agent', root_path: '/projects/project-alpha' },
        { agent_id: 'web-agent', root_path: '/projects/project-beta' },
      ],
    });

    const result = await reconcileDocsLinksOnStartup();

    expect(getWorkspaceLink).toHaveBeenCalledWith('project', 'main', {
      targetPath: '/projects/project-alpha',
    });
    expect(getWorkspaceLink).toHaveBeenCalledWith('project', 'main', {
      targetPath: '/projects/project-beta',
    });
    expect(result.projectLinks.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ agentId: 'main', projectRootPath: '/projects/project-alpha' }),
        expect.objectContaining({ agentId: 'main', projectRootPath: '/projects/project-beta' }),
      ]),
    );
  });

  it('reconcileDocsLinksOnStartup includes active unassigned projects for main links', async () => {
    getFileContent.mockResolvedValueOnce(JSON.stringify({ agents: { list: [{ id: 'main' }] } }));
    getWorkspaceLink
      .mockResolvedValueOnce({ state: 'linked' }) // docs/main
      .mockResolvedValueOnce({ state: 'missing' }); // project/main:/projects/unassigned
    ensureWorkspaceLink.mockResolvedValueOnce({ action: 'created' });

    pool.query.mockResolvedValueOnce({
      rows: [{ agent_id: null, root_path: '/projects/unassigned' }],
    });

    const result = await reconcileDocsLinksOnStartup();

    expect(getWorkspaceLink).toHaveBeenCalledWith('project', 'main', {
      targetPath: '/projects/unassigned',
    });
    expect(result.projectLinks.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: 'main',
          projectRootPath: '/projects/unassigned',
          action: 'created',
          state: 'linked',
        }),
      ]),
    );
  });
});
