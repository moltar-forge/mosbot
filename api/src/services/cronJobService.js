const config = require('../config');
const logger = require('../utils/logger');
const pool = require('../db/pool');
const { parseOpenClawConfig } = require('../utils/configParser');
const { makeOpenClawRequest, getFileContent } = require('./openclawWorkspaceClient');
const { estimateCostFromTokens } = require('./modelPricingService');
const { cronList, gatewayWsRpc } = require('./openclawGatewayClient');
const { toUpdatedAtMs } = require('./sessionListService');

function parseInterval(str) {
  if (!str) return null;
  const match = str.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * (multipliers[unit] || 60000);
}

function getAgentWorkspaceBase(agent) {
  if (agent.workspace) return agent.workspace;
  if (agent.id === 'main') return '/home/node/.openclaw/workspace';
  return `/home/node/.openclaw/workspace-${agent.id}`;
}

async function getHeartbeatJobsFromConfig() {
  try {
    const data = await makeOpenClawRequest('GET', '/files/content?path=/openclaw.json');
    const parsedConfig = parseOpenClawConfig(data.content);
    const agentsList = parsedConfig?.agents?.list || [];
    const agentsWithHeartbeat = agentsList.filter((agent) => agent.heartbeat);

    const heartbeatResults = await Promise.all(
      agentsWithHeartbeat.map(async (agent) => {
        const hb = agent.heartbeat;
        const intervalMs = parseInterval(hb.every);

        let lastRunAt = null;
        let nextRunAt = null;
        try {
          const workspaceBase = getAgentWorkspaceBase(agent);
          const relativePath = workspaceBase.replace(/^\/home\/node\/\.openclaw\//, '/');
          const hbData = await makeOpenClawRequest(
            'GET',
            `/files/content?path=${encodeURIComponent(`${relativePath}/runtime/heartbeat/last.json`)}`,
          );
          if (hbData?.content) {
            const parsed = JSON.parse(hbData.content);
            if (parsed.lastHeartbeat) {
              lastRunAt = parsed.lastHeartbeat;
              if (intervalMs) {
                nextRunAt = new Date(new Date(lastRunAt).getTime() + intervalMs).toISOString();
              }
            }
          }
        } catch (_hbReadError) {
          // Heartbeat file may not exist yet.
        }

        return {
          jobId: `heartbeat-${agent.id}`,
          name: `${agent.identity?.name || agent.id} Heartbeat`,
          description: `Periodic heartbeat for the ${agent.identity?.name || agent.id} agent.`,
          source: 'config',
          enabled: true,
          agentId: agent.id,
          agentEmoji: agent.identity?.emoji || null,
          sessionTarget: hb.session || 'main',
          schedule: {
            kind: 'every',
            everyMs: intervalMs,
            label: hb.every,
          },
          payload: {
            kind: 'heartbeat',
            model: hb.model || null,
            session: hb.session || 'main',
            target: hb.target || 'last',
            prompt: hb.prompt || null,
            ackMaxChars: hb.ackMaxChars || 200,
            activeHours: hb.activeHours || null,
          },
          delivery: {
            mode: hb.target === 'last' ? 'announce (last)' : hb.target || 'none',
          },
          lastRunAt,
          nextRunAt,
        };
      }),
    );

    return heartbeatResults;
  } catch (readError) {
    logger.warn('Could not read OpenClaw config for heartbeats', {
      error: readError.message,
    });
    return [];
  }
}

async function getCronJobsData({ userId }) {
  logger.info('Fetching cron jobs from OpenClaw', { userId });

  let openclawConfig = null;
  try {
    const configData = await makeOpenClawRequest('GET', '/files/content?path=/openclaw.json');
    openclawConfig = parseOpenClawConfig(configData.content);
  } catch (configErr) {
    logger.warn('Could not read OpenClaw config for agent enrichment', {
      error: configErr.message,
    });
  }

  const [gatewayJobs, heartbeatJobs] = await Promise.all([
    cronList().catch((err) => {
      if (err.code === 'SERVICE_NOT_CONFIGURED' || err.code === 'SERVICE_UNAVAILABLE') {
        return [];
      }
      logger.warn('Failed to fetch gateway cron jobs', {
        error: err.message,
      });
      return [];
    }),
    getHeartbeatJobsFromConfig(),
  ]);

  let CronExpressionParser = null;
  try {
    CronExpressionParser = require('cron-parser').CronExpressionParser;
  } catch (_) {
    // Optional dependency.
  }

  if (gatewayJobs.length > 0) {
    logger.info('Raw gateway job sample (first job keys)', {
      keys: Object.keys(gatewayJobs[0]),
      sample: JSON.stringify(gatewayJobs[0]).slice(0, 500),
    });
  }

  const taggedGatewayJobs = gatewayJobs.map((job) => {
    const normalized = {
      ...job,
      source: job.source || 'gateway',
    };

    if (!normalized.schedule) {
      if (job.cron) {
        normalized.schedule = {
          kind: 'cron',
          expr: job.cron,
          tz: job.tz || job.timezone || null,
        };
      } else if (job.expression) {
        normalized.schedule = {
          kind: 'cron',
          expr: job.expression,
          tz: job.tz || job.timezone || null,
        };
      } else if (job.interval || job.every) {
        const intervalStr = job.interval || job.every;
        const intervalMs = parseInterval(intervalStr);
        normalized.schedule = {
          kind: 'every',
          everyMs: intervalMs,
          label: intervalStr,
        };
      }
    }

    if (!normalized.lastRunAt) {
      const state = job.state || {};
      if (state.lastRunAtMs) {
        normalized.lastRunAt = new Date(state.lastRunAtMs).toISOString();
      } else {
        normalized.lastRunAt = job.lastFiredAt || job.lastRanAt || job.lastRun || job.last_fired_at || null;
      }
    }

    if (!normalized.nextRunAt) {
      const state = job.state || {};
      if (state.nextRunAtMs) {
        normalized.nextRunAt = new Date(state.nextRunAtMs).toISOString();
      } else {
        normalized.nextRunAt = job.nextFireAt || job.nextRun || job.next_fire_at || null;
      }
    }

    if (!normalized.nextRunAt) {
      try {
        const sched = normalized.schedule || {};
        if (sched.kind === 'cron' && sched.expr && CronExpressionParser) {
          const options = {};
          options.tz = sched.tz || config.timezone;
          const interval = CronExpressionParser.parse(sched.expr, options);
          normalized.nextRunAt = interval.next().toISOString();
        } else if (sched.kind === 'every' && sched.everyMs && normalized.lastRunAt) {
          normalized.nextRunAt = new Date(
            new Date(normalized.lastRunAt).getTime() + sched.everyMs,
          ).toISOString();
        }
      } catch (cronErr) {
        logger.warn('Could not compute nextRunAt for gateway job', {
          jobId: job.jobId || job.id || job.name,
          error: cronErr.message,
        });
      }
    }

    if (!normalized.status && job.state?.lastStatus) {
      normalized.status = job.state.lastStatus;
    }

    if (normalized.payload) {
      if (!normalized.payload.message && normalized.payload.text) {
        normalized.payload.message = normalized.payload.text;
      }
      if (!normalized.payload.message && normalized.payload.prompt) {
        normalized.payload.message = normalized.payload.prompt;
      }
    }

    return normalized;
  });

  const agentsList = openclawConfig?.agents?.list || [];
  const enrichedJobs = [...taggedGatewayJobs, ...heartbeatJobs].map((job) => {
    if (job.agentId && agentsList.length > 0) {
      const agent = agentsList.find((a) => a.id === job.agentId);
      if (agent && agent.model) {
        return {
          ...job,
          agentModel: agent.model?.primary || agent.model || null,
        };
      }
    }
    return job;
  });

  let cronSessionMap = new Map();
  let cronUsageByParent = new Map();

  try {
    const [sessionsResult, usageResult] = await Promise.all([
      gatewayWsRpc('sessions.list', { includeUnknown: true, limit: 500 }),
      gatewayWsRpc('sessions.usage', {
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10),
        limit: 2000,
      }).catch((err) => {
        logger.warn('Failed to fetch cron session usage', {
          error: err.message,
        });
        return { sessions: [] };
      }),
    ]);

    const allSessions = sessionsResult?.sessions || [];
    allSessions.forEach((session) => {
      if (
        session.key &&
        (session.key.includes(':cron:') ||
          session.key.includes(':heartbeat') ||
          /^agent:[^:]+:isolated$/.test(session.key))
      ) {
        cronSessionMap.set(session.key, session);
      }
    });

    const isCronOrHeartbeatKey = (key) =>
      key.includes(':cron:') || key.includes(':heartbeat') || /^agent:[^:]+:isolated(:|$)/.test(key);

    const cronRawBuckets = new Map();
    for (const entry of usageResult?.sessions || []) {
      if (!entry.key || !isCronOrHeartbeatKey(entry.key)) continue;
      const runIdx = entry.key.indexOf(':run:');
      const isIsolatedRun = runIdx !== -1;
      const parentKey = isIsolatedRun ? entry.key.slice(0, runIdx) : entry.key;

      if (!cronRawBuckets.has(parentKey)) {
        cronRawBuckets.set(parentKey, { runs: [], parent: null });
      }
      const bucket = cronRawBuckets.get(parentKey);
      if (isIsolatedRun) {
        bucket.runs.push(entry.usage || {});
      } else {
        bucket.parent = entry.usage || {};
      }
    }

    for (const [parentKey, bucket] of cronRawBuckets) {
      const hasRuns = bucket.runs.length > 0;
      const entries = hasRuns ? bucket.runs : bucket.parent ? [bucket.parent] : [];
      const agg = {
        totalCost: 0,
        latestRun: null,
        latestActivity: 0,
        isCumulative: false,
      };

      for (const usage of entries) {
        agg.totalCost += usage.totalCost || 0;
        const activity = usage.lastActivity || 0;
        if (activity > agg.latestActivity) {
          agg.latestActivity = activity;
          agg.latestRun = usage;
        }
      }

      if (!hasRuns && bucket.parent) {
        agg.isCumulative = true;
        agg.runCount = entries.length;
      } else if (hasRuns && bucket.runs.length === 1) {
        const userMsgs = bucket.runs[0]?.messageCounts?.user || 0;
        if (userMsgs > 1) {
          agg.isCumulative = true;
          agg.runCount = userMsgs;
        }
      }
      cronUsageByParent.set(parentKey, agg);
    }

    logger.info('Cron sessions fetched via WebSocket RPC', {
      totalSessions: allSessions.length,
      cronSessions: cronSessionMap.size,
      cronUsageEntries: cronUsageByParent.size,
    });
  } catch (wsErr) {
    logger.warn('Failed to fetch sessions via WebSocket for cron matching', {
      error: wsErr.message,
    });
  }

  const jobsWithExecutionData = enrichedJobs.map((job) => {
    if (!job.agentId) return job;

    const isHeartbeatJob = job.source === 'config' || job.payload?.kind === 'heartbeat';
    const jobId = job.jobId || job.id;

    if (!isHeartbeatJob && job.source !== 'gateway') return job;

    const resolvedSessionTarget =
      job.sessionTarget ||
      job.payload?.session ||
      (job.payload?.kind === 'agentTurn' ? 'isolated' : 'main');

    let expectedKey;
    let messageSessionKey;

    if (isHeartbeatJob) {
      const isolatedKey = `agent:${job.agentId}:isolated`;
      const heartbeatKey = `agent:${job.agentId}:heartbeat`;
      expectedKey = cronSessionMap.has(isolatedKey) ? isolatedKey : heartbeatKey;
      messageSessionKey = expectedKey;
    } else {
      expectedKey = `agent:${job.agentId}:cron:${jobId}`;
      messageSessionKey =
        resolvedSessionTarget === 'main' ? `agent:${job.agentId}:main` : expectedKey;
    }

    let matchedSession = cronSessionMap.get(expectedKey);
    if (!matchedSession && !isHeartbeatJob) {
      const runPrefix = `${expectedKey}:run:`;
      let latestRunTs = 0;
      for (const [key, session] of cronSessionMap) {
        if (!key.startsWith(runPrefix)) continue;
        const ts = toUpdatedAtMs(session.updatedAt ?? session.updated_at) || 0;
        if (ts > latestRunTs) {
          latestRunTs = ts;
          matchedSession = session;
        }
      }
    }

    const usageAgg = cronUsageByParent.get(expectedKey);
    const latestRun = usageAgg?.latestRun;
    const jobLastRunMs = job.state?.lastRunAtMs;

    if (matchedSession || latestRun) {
      const isCumulative = usageAgg?.isCumulative === true;
      const actualModel = matchedSession?.model || null;

      const inputTokens = latestRun?.input ?? matchedSession?.inputTokens ?? 0;
      const outputTokens = latestRun?.output ?? matchedSession?.outputTokens ?? 0;
      const cacheReadTokens = latestRun?.cacheRead ?? 0;
      const cacheWriteTokens = latestRun?.cacheWrite ?? 0;
      const messageCost =
        latestRun?.totalCost ||
        estimateCostFromTokens(actualModel, inputTokens, outputTokens, {
          cacheReadTokens,
          cacheWriteTokens,
        }) ||
        0;

      const todayTotalCost = usageAgg?.totalCost ?? 0;
      const contextTokens = matchedSession?.contextTokens || 0;
      const rawTotalTokens = latestRun?.totalTokens ?? matchedSession?.totalTokens ?? 0;
      const totalTokensUsed = contextTokens > 0 ? Math.min(rawTotalTokens, contextTokens) : rawTotalTokens;
      const contextUsagePercent =
        contextTokens > 0 ? Math.round((totalTokensUsed / contextTokens) * 100 * 10) / 10 : 0;

      return {
        ...job,
        lastExecution: {
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          messageCost,
          todayTotalCost,
          isCumulative,
          model: actualModel,
          lastMessage: null,
          updatedAt:
            toUpdatedAtMs(matchedSession?.updatedAt ?? matchedSession?.updated_at) ||
            jobLastRunMs ||
            null,
          contextTokens,
          totalTokensUsed,
          contextUsagePercent,
          sessionKey: messageSessionKey,
          sessionLabel: matchedSession?.displayName || matchedSession?.sessionLabel || null,
        },
      };
    }

    return {
      ...job,
      lastExecution: {
        inputTokens: null,
        outputTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        messageCost: null,
        todayTotalCost: null,
        model: null,
        lastMessage: null,
        updatedAt: jobLastRunMs || null,
        contextTokens: null,
        totalTokensUsed: null,
        contextUsagePercent: null,
        sessionKey: messageSessionKey,
        durationMs: job.state?.lastDurationMs || null,
        status: job.state?.lastStatus || null,
        unavailable: true,
      },
    };
  });

  const jobsWithRecalculatedNextRun = jobsWithExecutionData.map((job) => {
    const isHeartbeatJob = job.source === 'config' || job.payload?.kind === 'heartbeat';
    if (!isHeartbeatJob) return job;

    const lastExecutionTime = job.lastExecution?.updatedAt;
    const intervalMs = job.schedule?.everyMs;

    if (lastExecutionTime && intervalMs) {
      const lastExecutionMs =
        typeof lastExecutionTime === 'number'
          ? lastExecutionTime
          : new Date(lastExecutionTime).getTime();

      if (!isNaN(lastExecutionMs)) {
        const recalculatedNextRunAt = new Date(lastExecutionMs + intervalMs).toISOString();
        return {
          ...job,
          nextRunAt: recalculatedNextRunAt,
        };
      }
    }

    return job;
  });

  const agentNameMap = new Map();
  const agentTitleMap = new Map();

  (openclawConfig?.agents?.list || []).forEach((agent) => {
    if (agent.id) {
      agentTitleMap.set(agent.id, agent.identity?.title || null);
    }
  });

  try {
    const allAgentIds = [...new Set(jobsWithRecalculatedNextRun.map((j) => j.agentId).filter(Boolean))];
    if (allAgentIds.length > 0) {
      const result = await pool.query('SELECT agent_id, name FROM agents WHERE agent_id = ANY($1)', [
        allAgentIds,
      ]);
      result.rows.forEach((row) => {
        agentNameMap.set(row.agent_id, row.name);
      });
    }
  } catch (dbErr) {
    logger.warn('Could not query agents table for agent names', {
      error: dbErr.message,
    });
  }

  const finalJobs = jobsWithRecalculatedNextRun.map((job) => {
    if (!job.agentId) return job;
    return {
      ...job,
      agentName: agentNameMap.get(job.agentId) || null,
      agentTitle: agentTitleMap.get(job.agentId) || null,
    };
  });

  logger.info('Cron jobs aggregated', {
    userId,
    gateway: taggedGatewayJobs.length,
    heartbeats: heartbeatJobs.length,
    total: finalJobs.length,
    withExecutionData: finalJobs.filter((j) => j.lastExecution).length,
  });

  return { version: 1, jobs: finalJobs };
}

async function getCronJobStatsData({ userId }) {
  logger.info('Fetching cron jobs stats for attention counts', {
    userId,
  });

  const gatewayJobsP = cronList().catch((err) => {
    logger.warn('Failed to fetch gateway jobs for stats', {
      error: err.message,
    });
    return [];
  });

  const configJobsP = getHeartbeatJobsFromConfig().catch((err) => {
    logger.warn('Failed to fetch config jobs for stats', {
      error: err.message,
    });
    return [];
  });

  let [gatewayJobs, configJobs] = await Promise.all([gatewayJobsP, configJobsP]);
  if (!Array.isArray(gatewayJobs)) gatewayJobs = [];
  if (!Array.isArray(configJobs)) configJobs = [];

  const gatewayJobsNormalized = gatewayJobs.map((job) => {
    let nextRunAtMs = job.state?.nextRunAtMs || null;
    if (!nextRunAtMs && job.enabled !== false) {
      if (job.cron || job.expression || (job.schedule?.kind === 'cron' && job.schedule?.expr)) {
        try {
          const expr = job.cron || job.expression || job.schedule.expr;
          const tz = job.tz || job.schedule?.tz || config.timezone;
          const { CronExpressionParser } = require('cron-parser');
          nextRunAtMs = CronExpressionParser.parse(expr, { tz }).next().getTime();
        } catch (_e) {
          nextRunAtMs = null;
        }
      }
    }
    return { ...job, nextRunAtMs };
  });

  const allJobs = [
    ...gatewayJobsNormalized,
    ...configJobs.map((j) => ({
      ...j,
      nextRunAtMs: j.state?.nextRunAtMs || null,
    })),
  ];

  const nowMs = Date.now();

  const errors = allJobs.filter((j) => j.state?.lastStatus === 'error' || j.status === 'error').length;
  const missed = allJobs.filter((j) => j.enabled !== false && j.nextRunAtMs && j.nextRunAtMs < nowMs).length;

  return { errors, missed };
}

async function getCronJobRunsData({ userId, jobId, limit }) {
  const parsedLimit = Math.min(parseInt(limit, 10) || 50, 200);

  if (!jobId || !/^[\w-]+$/.test(jobId)) {
    const error = new Error('Invalid jobId');
    error.status = 400;
    throw error;
  }

  logger.info('Fetching cron job run history from workspace', {
    userId,
    jobId,
    limit: parsedLimit,
  });

  let runs = [];
  try {
    const content = await getFileContent(`/cron/runs/${jobId}.jsonl`);
    if (content) {
      runs = content
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((row) => row && row.action === 'finished')
        .sort((a, b) => (b.runAtMs || b.ts || 0) - (a.runAtMs || a.ts || 0))
        .slice(0, parsedLimit)
        .reverse()
        .map((row) => {
          const inputTokens = row.usage?.input_tokens ?? null;
          const outputTokens = row.usage?.output_tokens ?? null;
          const estimatedCost = estimateCostFromTokens(row.model, inputTokens, outputTokens);
          return {
            sessionId: row.sessionId || null,
            sessionKey: row.sessionKey || null,
            runAtMs: row.runAtMs || row.ts || null,
            durationMs: row.durationMs || null,
            status: row.status || null,
            error: row.error || null,
            summary: row.summary || null,
            delivered: row.delivered ?? null,
            deliveryStatus: row.deliveryStatus || null,
            model: row.model || null,
            provider: row.provider || null,
            inputTokens,
            outputTokens,
            estimatedCost: estimatedCost ?? null,
          };
        });
    }
  } catch (fileErr) {
    logger.warn('Could not read cron runs JSONL from workspace', {
      jobId,
      error: fileErr.message,
    });
  }

  return { runs, total: runs.length };
}

module.exports = {
  parseInterval,
  getAgentWorkspaceBase,
  getHeartbeatJobsFromConfig,
  getCronJobsData,
  getCronJobStatsData,
  getCronJobRunsData,
};
