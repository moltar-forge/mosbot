const logger = require('../utils/logger');
const { getWorkspaceLink, ensureWorkspaceLink } = require('./openclawWorkspaceClient');

/**
 * Ensure docs link exists for one workspace target.
 * This helper is intentionally non-fatal for callers.
 *
 * @param {string} agentId - "main" or an agent id slug.
 * @returns {Promise<{agentId: string, action: string, state?: string}>}
 */
async function ensureDocsLinkIfMissing(agentId) {
  if (!agentId) {
    logger.warn('Docs link reconciliation skipped: missing agentId');
    return { agentId: null, action: 'skipped' };
  }

  try {
    const state = await getWorkspaceLink('docs', agentId);

    if (state?.state === 'missing') {
      await ensureWorkspaceLink('docs', agentId);
      return { agentId, action: 'created', state: 'linked' };
    }

    if (state?.state === 'linked') {
      return { agentId, action: 'unchanged', state: 'linked' };
    }

    if (state?.state === 'conflict') {
      logger.warn('Docs link reconciliation found conflict', {
        agentId,
        conflict: state.conflict || null,
      });
      return { agentId, action: 'conflict', state: 'conflict' };
    }

    logger.warn('Docs link reconciliation received unexpected state', {
      agentId,
      state: state?.state || null,
    });
    return { agentId, action: 'unknown', state: state?.state || null };
  } catch (error) {
    logger.warn('Docs link reconciliation failed', {
      agentId,
      message: error.message,
      status: error.status,
      code: error.code,
    });
    return { agentId, action: 'error' };
  }
}

module.exports = {
  ensureDocsLinkIfMissing,
};
