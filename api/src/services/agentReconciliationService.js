const pool = require('../db/pool');
const logger = require('../utils/logger');
const { makeOpenClawRequest } = require('./openclawWorkspaceClient');
const { parseOpenClawConfig } = require('../utils/configParser');

let reconcileIntervalHandle = null;

function normalizeDiscoveredAgents(openclawConfig) {
  const list = Array.isArray(openclawConfig?.agents?.list) ? openclawConfig.agents.list : [];
  const discovered = [];
  const seen = new Set();

  for (const agent of list) {
    if (!agent?.id || seen.has(agent.id)) continue;
    seen.add(agent.id);
    discovered.push({
      agentId: agent.id,
      name: agent.identity?.name || agent.name || agent.id,
    });
  }

  // OpenClaw always has implicit main runtime agent even if absent from agents.list
  if (!seen.has('main')) {
    discovered.push({ agentId: 'main', name: 'main' });
  }

  return discovered;
}

async function reconcileAgentsFromOpenClaw({ trigger = 'manual', actorUserId = null } = {}) {
  const configData = await makeOpenClawRequest('GET', '/files/content?path=/openclaw.json');
  const openclawConfig = parseOpenClawConfig(configData.content);
  const discovered = normalizeDiscoveredAgents(openclawConfig);
  const discoveredIds = discovered.map((a) => a.agentId);

  let upserted = 0;
  for (const agent of discovered) {
    await pool.query(
      `INSERT INTO agents (agent_id, name, status, active, meta)
       VALUES ($1, $2, 'active', true, jsonb_build_object('source', 'openclaw'))
       ON CONFLICT (agent_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         status = 'active',
         active = true,
         meta = COALESCE(agents.meta, '{}'::jsonb) || jsonb_build_object(
           'source', 'openclaw',
           'lastSeenInOpenClawAt', NOW()
         ),
         updated_at = NOW()`,
      [agent.agentId, agent.name],
    );
    upserted += 1;
  }

  let deactivated = 0;
  if (discoveredIds.length > 0) {
    const deactivateResult = await pool.query(
      `UPDATE agents
       SET active = false,
           status = 'deprecated',
           updated_at = NOW(),
           meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('removedFromOpenClawAt', NOW())
       WHERE agent_id <> ALL($1::text[])
         AND active = true`,
      [discoveredIds],
    );
    deactivated = deactivateResult.rowCount || 0;
  }

  logger.info('Agent reconcile completed', {
    trigger,
    actorUserId,
    discoveredCount: discovered.length,
    upserted,
    deactivated,
  });

  return {
    discoveredCount: discovered.length,
    upserted,
    deactivated,
    discoveredIds,
  };
}

function startAgentReconcileJob(intervalMs = 5 * 60 * 1000) {
  if (reconcileIntervalHandle) {
    clearInterval(reconcileIntervalHandle);
  }

  const run = async (trigger) => {
    try {
      await reconcileAgentsFromOpenClaw({ trigger });
    } catch (error) {
      logger.warn('Agent reconcile failed', { trigger, error: error.message });
    }
  };

  // Immediate startup sync
  run('startup');

  reconcileIntervalHandle = setInterval(() => {
    run('interval');
  }, Math.max(60_000, Number(intervalMs) || 300_000));

  return reconcileIntervalHandle;
}

module.exports = {
  reconcileAgentsFromOpenClaw,
  startAgentReconcileJob,
};
