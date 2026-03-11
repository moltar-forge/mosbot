const logger = require('../utils/logger');
const pool = require('../db/pool');
const {
  getWorkspaceLink,
  ensureWorkspaceLink,
  getFileContent,
} = require('./openclawWorkspaceClient');

/**
 * Ensure docs link exists for one workspace target.
 * This helper is intentionally non-fatal for callers.
 *
 * @param {string} agentId - "main" or an agent id slug.
 * @returns {Promise<{agentId: string, action: string, state?: string}>}
 */
async function ensureTypedLinkIfMissing(type, agentId, options = {}) {
  if (!agentId) {
    logger.warn(`${type} link reconciliation skipped: missing agentId`);
    return { agentId: null, action: 'skipped' };
  }

  try {
    const state = await getWorkspaceLink(type, agentId, options);

    if (state?.state === 'missing') {
      await ensureWorkspaceLink(type, agentId, options);
      return { agentId, action: 'created', state: 'linked' };
    }

    if (state?.state === 'linked') {
      return { agentId, action: 'unchanged', state: 'linked' };
    }

    if (state?.state === 'conflict') {
      logger.warn(`${type} link reconciliation found conflict`, {
        agentId,
        conflict: state.conflict || null,
        ...(options.targetPath ? { targetPath: options.targetPath } : {}),
      });
      return { agentId, action: 'conflict', state: 'conflict' };
    }

    logger.warn(`${type} link reconciliation received unexpected state`, {
      agentId,
      state: state?.state || null,
      ...(options.targetPath ? { targetPath: options.targetPath } : {}),
    });
    return { agentId, action: 'unknown', state: state?.state || null };
  } catch (error) {
    logger.warn(`${type} link reconciliation failed`, {
      agentId,
      message: error.message,
      status: error.status,
      code: error.code,
      ...(options.targetPath ? { targetPath: options.targetPath } : {}),
    });
    return { agentId, action: 'error' };
  }
}

async function ensureDocsLinkIfMissing(agentId) {
  return ensureTypedLinkIfMissing('docs', agentId);
}

async function ensureProjectLinkIfMissing(agentId, projectRootPath) {
  if (!projectRootPath) {
    logger.warn('project link reconciliation skipped: missing projectRootPath', { agentId });
    return { agentId, action: 'skipped' };
  }

  return ensureTypedLinkIfMissing('project', agentId, { targetPath: projectRootPath });
}

function collectAgentIdsFromOpenClawConfig(content) {
  if (!content) return [];

  try {
    const parsed = JSON.parse(content);
    const agentsList = Array.isArray(parsed?.agents?.list) ? parsed.agents.list : [];
    const ids = agentsList
      .map((agent) => (typeof agent?.id === 'string' ? agent.id.trim() : ''))
      .filter(Boolean)
      .filter((id) => id !== 'main');
    return [...new Set(ids)];
  } catch (error) {
    logger.warn('Docs link startup reconciliation: could not parse openclaw.json', {
      message: error.message,
    });
    return [];
  }
}

async function collectProjectAssignments() {
  try {
    const rows = await pool.query(
      `SELECT apa.agent_id, p.root_path
         FROM agent_project_assignments apa
         JOIN projects p ON p.id = apa.project_id
        WHERE p.status = 'active'`,
    );

    const byAgent = new Map();
    const allProjectRoots = new Set();

    for (const row of rows.rows || []) {
      const agentId = row.agent_id;
      const rootPath = row.root_path;
      if (!agentId || !rootPath) continue;

      if (!byAgent.has(agentId)) byAgent.set(agentId, new Set());
      byAgent.get(agentId).add(rootPath);
      allProjectRoots.add(rootPath);
    }

    return { byAgent, allProjectRoots };
  } catch (error) {
    if (error.code !== '42P01') {
      logger.warn('Project link startup reconciliation: failed to read project assignments', {
        message: error.message,
        status: error.status,
        code: error.code,
      });
    }
    return { byAgent: new Map(), allProjectRoots: new Set() };
  }
}

/**
 * Startup reconciliation: ensure docs links for main + all configured agents,
 * and project links for assigned agents. Main always gets links to all project roots.
 * This helper is intentionally non-fatal.
 *
 * @returns {Promise<{main: object, agents: object[], projectLinks: object}>}
 */
async function reconcileDocsLinksOnStartup() {
  const mainResult = await ensureDocsLinkIfMissing('main');

  let agentIds = [];
  try {
    const openclawContent = await getFileContent('/openclaw.json');
    agentIds = collectAgentIdsFromOpenClawConfig(openclawContent);
  } catch (error) {
    logger.warn('Docs link startup reconciliation: failed to read openclaw.json', {
      message: error.message,
      status: error.status,
      code: error.code,
    });
  }

  const agentResults = [];
  for (const agentId of agentIds) {
    const result = await ensureDocsLinkIfMissing(agentId);
    agentResults.push(result);
  }

  const projectAssignments = await collectProjectAssignments();
  const projectResults = [];

  // Main should always have links to all project roots.
  for (const projectRootPath of projectAssignments.allProjectRoots) {
    const result = await ensureProjectLinkIfMissing('main', projectRootPath);
    projectResults.push({ agentId: 'main', projectRootPath, ...result });
  }

  // Assigned agents should have links to their assigned projects.
  for (const [agentId, projectRoots] of projectAssignments.byAgent.entries()) {
    for (const projectRootPath of projectRoots) {
      const result = await ensureProjectLinkIfMissing(agentId, projectRootPath);
      projectResults.push({ agentId, projectRootPath, ...result });
    }
  }

  return { main: mainResult, agents: agentResults, projectLinks: { results: projectResults } };
}

module.exports = {
  ensureDocsLinkIfMissing,
  ensureProjectLinkIfMissing,
  reconcileDocsLinksOnStartup,
  collectAgentIdsFromOpenClawConfig,
};
