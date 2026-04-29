const logger = require('../utils/logger');
const pool = require('../db/pool');
const { estimateCostFromTokens } = require('./modelPricingService');
const { makeOpenClawRequest } = require('./openclawWorkspaceClient');
const { gatewayWsRpc, sessionsListAllViaWs, sessionsList } = require('./openclawGatewayClient');
const { upsertSessionUsageBatch } = require('./sessionUsageService');

function toUpdatedAtMs(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const t = new Date(val).getTime();
  return Number.isFinite(t) ? t : 0;
}

const SESSIONS_STATUS_CACHE_TTL_MS = 15000;
const ENABLE_SESSIONS_STATUS_CACHE = process.env.NODE_ENV !== 'test';
let sessionsStatusCache = { value: null, fetchedAt: 0 };
let sessionsStatusInflight = null;

async function getSessionsStatusData() {
  const now = Date.now();
  if (
    ENABLE_SESSIONS_STATUS_CACHE &&
    sessionsStatusCache.value &&
    now - sessionsStatusCache.fetchedAt < SESSIONS_STATUS_CACHE_TTL_MS
  ) {
    return sessionsStatusCache.value;
  }
  if (ENABLE_SESSIONS_STATUS_CACHE && sessionsStatusInflight) {
    return sessionsStatusInflight;
  }
  if (!ENABLE_SESSIONS_STATUS_CACHE) {
    sessionsStatusInflight = null;
  }
  sessionsStatusInflight = (async () => {
    const RUNNING_THRESHOLD_MS = 2 * 60 * 1000;
    const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000;
    let sessions = [];
    try {
      const wsResult = await sessionsListAllViaWs({
        includeGlobal: true,
        includeUnknown: false,
        limit: 0,
      });
      if (Array.isArray(wsResult)) {
        sessions = wsResult;
      } else if (wsResult?.sessions && Array.isArray(wsResult.sessions)) {
        sessions = wsResult.sessions;
      }
    } catch (wsErr) {
      logger.warn('sessions/status: WebSocket sessions.list failed', {
        error: wsErr.message,
      });
      return { running: 0, active: 0, idle: 0, total: 0 };
    }

    let running = 0;
    let active = 0;
    let idle = 0;
    for (const s of sessions) {
      const updatedAtMs = toUpdatedAtMs(s.updatedAt ?? s.updated_at);
      const age = now - updatedAtMs;
      if (age <= RUNNING_THRESHOLD_MS) running++;
      else if (age <= ACTIVE_THRESHOLD_MS) active++;
      else idle++;
    }

    const counts = { running, active, idle, total: sessions.length };
    if (ENABLE_SESSIONS_STATUS_CACHE) {
      sessionsStatusCache = { value: counts, fetchedAt: now };
    }
    return counts;
  })();

  try {
    return await sessionsStatusInflight;
  } finally {
    sessionsStatusInflight = null;
  }
}

async function listSessionsData({ userId }) {
  logger.info('Fetching active sessions from OpenClaw Gateway', { userId });

  let sessions = [];
  let usedWsFallback = false;
  let dailyCost = 0;

  try {
    const wsResult = await sessionsListAllViaWs({
      includeGlobal: true,
      includeUnknown: true,
      limit: 0,
    });

    if (Array.isArray(wsResult)) {
      sessions = wsResult;
    } else if (wsResult?.sessions && Array.isArray(wsResult.sessions)) {
      sessions = wsResult.sessions;
    } else {
      sessions = [];
    }

    logger.info('Sessions fetched via WebSocket RPC', {
      count: sessions.length,
      wsResultType: Array.isArray(wsResult) ? 'array' : typeof wsResult,
      hasSessionsProperty: wsResult?.sessions !== undefined,
      wsResultKeys: wsResult && typeof wsResult === 'object' ? Object.keys(wsResult) : null,
    });

    if (sessions.length === 0 && wsResult) {
      logger.warn('WebSocket RPC returned empty sessions array', {
        wsResultType: typeof wsResult,
        wsResultIsArray: Array.isArray(wsResult),
        wsResultKeys: wsResult && typeof wsResult === 'object' ? Object.keys(wsResult) : null,
        wsResultSample:
          wsResult && typeof wsResult === 'object'
            ? JSON.stringify(wsResult).substring(0, 200)
            : String(wsResult).substring(0, 200),
      });
    }

    if (sessions.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      try {
        const [usageResult, costResult] = await Promise.all([
          gatewayWsRpc('sessions.usage', {
            startDate: today,
            endDate: today,
            limit: 1000,
          }),
          gatewayWsRpc('usage.cost', { startDate: today, endDate: today }),
        ]);

        if (usageResult?.sessions) {
          const usageMap = new Map();
          for (const us of usageResult.sessions) {
            const u = us.usage || {};
            usageMap.set(us.key, {
              totalCost: u.totalCost || 0,
              input: u.input || 0,
              output: u.output || 0,
              cacheRead: u.cacheRead || 0,
              cacheWrite: u.cacheWrite || 0,
            });
          }

          const sessionMetaByKey = new Map();
          for (const s of sessions) {
            if (!s.key || typeof s.key !== 'string') continue;
            let agentKey = 'main';
            if (s.key.startsWith('agent:')) {
              const parts = s.key.split(':');
              if (parts.length >= 2) agentKey = parts[1];
            }

            let model = null;
            if (
              s.modelProvider &&
              typeof s.modelProvider === 'string' &&
              s.model &&
              typeof s.model === 'string'
            ) {
              let normalizedModel = s.model.trim();
              const doublePrefixMatch = normalizedModel.match(/^([^/]+)\/\1\/(.+)$/);
              if (doublePrefixMatch) {
                const [, prefix, rest] = doublePrefixMatch;
                normalizedModel = `${prefix}/${rest}`;
              }
              if (normalizedModel.startsWith(`${s.modelProvider.trim()}/`)) {
                model = normalizedModel;
              } else {
                model = `${s.modelProvider}/${normalizedModel}`;
              }
            } else if (s.model && typeof s.model === 'string') {
              model = s.model;
            } else {
              const lastMsg = s.messages?.[0];
              if (
                lastMsg?.provider &&
                typeof lastMsg.provider === 'string' &&
                lastMsg?.model &&
                typeof lastMsg.model === 'string'
              ) {
                let normalizedModel = lastMsg.model.trim();
                const doublePrefixMatch = normalizedModel.match(/^([^/]+)\/\1\/(.+)$/);
                if (doublePrefixMatch) {
                  const [, prefix, rest] = doublePrefixMatch;
                  normalizedModel = `${prefix}/${rest}`;
                }
                if (normalizedModel.startsWith(`${lastMsg.provider.trim()}/`)) {
                  model = normalizedModel;
                } else {
                  model = `${lastMsg.provider}/${normalizedModel}`;
                }
              } else if (lastMsg?.model) {
                model = lastMsg.model;
              }
            }

            sessionMetaByKey.set(s.key, { agentKey, model });
          }

          for (const s of sessions) {
            if (s.key && usageMap.has(s.key)) {
              const ud = usageMap.get(s.key);
              s._totalCost = ud.totalCost;
              s._usageInput = ud.input;
              s._usageOutput = ud.output;
              s._cacheRead = ud.cacheRead;
              s._cacheWrite = ud.cacheWrite;
            }
          }

          const cronBuckets = new Map();
          for (const us of usageResult.sessions) {
            if (!us.key || !us.key.includes(':cron:')) continue;
            const u = us.usage || {};
            const lastActivity = us.lastActivity ?? u.lastActivity ?? null;
            const runIdx = us.key.indexOf(':run:');
            const isRun = runIdx !== -1;
            const parentKey = isRun ? us.key.slice(0, runIdx) : us.key;
            if (!cronBuckets.has(parentKey)) {
              cronBuckets.set(parentKey, { runs: [], parent: null });
            }
            const bucket = cronBuckets.get(parentKey);
            if (isRun) {
              bucket.runs.push({ ...u, lastActivity, _runKey: us.key });
            } else {
              bucket.parent = { ...u, lastActivity, _runKey: us.key };
            }
          }

          const cronLatestRunMap = new Map();
          for (const [parentKey, bucket] of cronBuckets) {
            const hasRuns = bucket.runs.length > 0;
            const candidates = hasRuns ? bucket.runs : bucket.parent ? [bucket.parent] : [];
            let latest = null;
            for (const u of candidates) {
              if (!latest || (u.lastActivity || 0) > (latest.lastActivity || 0)) {
                latest = u;
              }
            }
            if (latest) {
              let isCumul = !hasRuns;
              if (hasRuns && bucket.runs.length === 1) {
                const userMsgs = bucket.runs[0]?.messageCounts?.user || 0;
                if (userMsgs > 1) isCumul = true;
              }
              cronLatestRunMap.set(parentKey, {
                ...latest,
                _isCumulative: isCumul,
              });
            }
          }

          for (const s of sessions) {
            if (!s.key || !s.key.includes(':cron:')) continue;
            const runIdx = s.key.indexOf(':run:');
            const parentKey = runIdx !== -1 ? s.key.slice(0, runIdx) : s.key;
            const latestRun = cronLatestRunMap.get(parentKey);
            if (latestRun) {
              s._cronLatestRun = {
                ...latestRun,
                totalTokens: s.totalTokens ?? 0,
              };
            }
          }

          const enrichedUsage = usageResult.sessions.map((us) => {
            const meta = sessionMetaByKey.get(us.key);
            return {
              ...us,
              agent_key: meta?.agentKey,
              model: meta?.model ?? undefined,
            };
          });

          upsertSessionUsageBatch(enrichedUsage).catch((err) => {
            logger.warn('Failed to persist session usage from sessions endpoint', {
              error: err.message,
            });
          });
        }

        dailyCost = costResult?.totals?.totalCost || 0;
      } catch (costErr) {
        logger.warn('Failed to fetch session cost data', {
          error: costErr.message,
        });
      }
    }
  } catch (wsErr) {
    logger.warn('WebSocket sessions.list failed, falling back to per-agent tool invocation', {
      error: wsErr.message,
      errorCode: wsErr.code,
      errorStatus: wsErr.status,
      stack: wsErr.stack,
    });
    usedWsFallback = true;
  }

  if (usedWsFallback) {
    let agentIds = ['main', 'coo', 'cto', 'cmo', 'cpo'];
    try {
      const data = await makeOpenClawRequest('GET', '/files/content?path=/openclaw.json');
      const parsedConfig = JSON.parse(data.content);
      const agentsList = parsedConfig?.agents?.list || [];
      const configuredAgents = agentsList.map((agent) => agent.id);
      if (configuredAgents.length > 0) {
        agentIds = ['main', ...configuredAgents];
      }
    } catch (configError) {
      logger.warn('Could not read agent config, using default agent list', {
        error: configError.message,
      });
    }

    const ALL_SESSION_KINDS = ['main', 'group', 'cron', 'hook', 'node', 'subagent', 'other'];
    const sessionPromises = agentIds.map((agentId) => {
      const sessionKey = agentId === 'main' ? 'main' : `agent:${agentId}:main`;
      return sessionsList({
        sessionKey,
        kinds: ALL_SESSION_KINDS,
        limit: 500,
        messageLimit: 1,
      }).catch((err) => {
        logger.warn('Failed to fetch sessions for agent', {
          agentId,
          sessionKey,
          error: err.message,
        });
        return [];
      });
    });

    const sessionArrays = await Promise.all(sessionPromises);
    const allSessions = sessionArrays.flat();

    logger.info('Fallback sessions fetched', {
      agentCount: agentIds.length,
      totalSessionsBeforeDedup: allSessions.length,
      sessionsPerAgent: sessionArrays.map((arr, idx) => ({
        agentId: agentIds[idx],
        count: arr.length,
      })),
    });

    const sessionMap = new Map();
    let skippedNoId = 0;
    allSessions.forEach((session) => {
      const sessionId = session.key || session.sessionId || session.id;
      if (sessionId) {
        if (!sessionMap.has(sessionId)) {
          sessionMap.set(sessionId, session);
        }
      } else {
        skippedNoId++;
        if (skippedNoId <= 3) {
          logger.debug('Session skipped (no id/key)', {
            sessionKeys: Object.keys(session),
            sessionSample: JSON.stringify(session).substring(0, 200),
          });
        }
      }
    });

    sessions = Array.from(sessionMap.values());

    if (skippedNoId > 0) {
      logger.warn('Skipped sessions without id/key in fallback', {
        skippedCount: skippedNoId,
      });
    }

    logger.info('Fallback sessions after deduplication', {
      totalSessions: sessions.length,
      uniqueSessionIds: sessionMap.size,
    });
  }

  logger.info('Sessions received from OpenClaw Gateway', {
    userId,
    sessionCount: sessions.length,
  });

  const RUNNING_THRESHOLD_MS = 2 * 60 * 1000;
  const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000;
  const now = Date.now();

  const transformedSessions = sessions.map((session) => {
    let agentName = 'unknown';
    if (session.key) {
      const keyParts = session.key.split(':');
      if (keyParts.length >= 2 && keyParts[0] === 'agent') {
        agentName = keyParts[1];
      }
    }

    let rawUpdatedAt = session.updatedAt ?? session.updated_at;
    if (session._cronLatestRun?.lastActivity) {
      rawUpdatedAt = session._cronLatestRun.lastActivity;
    } else if (session.kind === 'cron' && session.messages?.[0]?.timestamp) {
      rawUpdatedAt = session.messages[0].timestamp;
    }

    const updatedAtMs = toUpdatedAtMs(rawUpdatedAt);
    const timeSinceUpdate = now - updatedAtMs;
    let status;
    if (timeSinceUpdate <= RUNNING_THRESHOLD_MS) {
      status = 'running';
    } else if (timeSinceUpdate <= ACTIVE_THRESHOLD_MS) {
      status = 'active';
    } else {
      status = 'idle';
    }

    const lastMessage = session.messages?.[0] || null;
    let actualModel = null;
    if (
      session.modelProvider &&
      typeof session.modelProvider === 'string' &&
      session.model &&
      typeof session.model === 'string'
    ) {
      let normalizedModel = session.model.trim();
      const doublePrefixMatch = normalizedModel.match(/^([^/]+)\/\1\/(.+)$/);
      if (doublePrefixMatch) {
        const [, prefix, rest] = doublePrefixMatch;
        normalizedModel = `${prefix}/${rest}`;
      }
      if (normalizedModel.startsWith(`${session.modelProvider.trim()}/`)) {
        actualModel = normalizedModel;
      } else {
        actualModel = `${session.modelProvider}/${normalizedModel}`;
      }
    } else if (
      lastMessage?.provider &&
      typeof lastMessage.provider === 'string' &&
      lastMessage?.model &&
      typeof lastMessage.model === 'string'
    ) {
      let normalizedModel = lastMessage.model.trim();
      const doublePrefixMatch = normalizedModel.match(/^([^/]+)\/\1\/(.+)$/);
      if (doublePrefixMatch) {
        const [, prefix, rest] = doublePrefixMatch;
        normalizedModel = `${prefix}/${rest}`;
      }
      if (normalizedModel.startsWith(`${lastMessage.provider.trim()}/`)) {
        actualModel = normalizedModel;
      } else {
        actualModel = `${lastMessage.provider}/${normalizedModel}`;
      }
    } else if (lastMessage?.model) {
      actualModel = lastMessage.model;
    } else if (session.model) {
      actualModel = session.model;
    }

    const model = actualModel || null;

    const usage = lastMessage?.usage || {};
    let inputTokens;
    let outputTokens;
    let cacheReadTokens;
    let cacheWriteTokens;
    let messageCost;

    if (session._cronLatestRun) {
      const r = session._cronLatestRun;
      inputTokens = r.input || 0;
      outputTokens = r.output || 0;
      cacheReadTokens = r.cacheRead || 0;
      cacheWriteTokens = r.cacheWrite || 0;
      messageCost =
        r.totalCost ||
        estimateCostFromTokens(model, inputTokens, outputTokens, {
          cacheReadTokens,
          cacheWriteTokens,
        }) ||
        0;
    } else {
      inputTokens = session._usageInput || session.inputTokens || usage.input || 0;
      outputTokens = session._usageOutput || session.outputTokens || usage.output || 0;
      cacheReadTokens = session._cacheRead || usage.cacheRead || 0;
      cacheWriteTokens = session._cacheWrite || usage.cacheWrite || 0;
      messageCost =
        session._totalCost ||
        usage.cost?.total ||
        estimateCostFromTokens(model, inputTokens, outputTokens, {
          cacheReadTokens,
          cacheWriteTokens,
        }) ||
        0;
    }

    const contextTokens = session.contextTokens || 0;
    const rawTotalTokens = session._cronLatestRun?.totalTokens ?? session.totalTokens ?? 0;
    const totalTokensUsed =
      contextTokens > 0 ? Math.min(rawTotalTokens, contextTokens) : rawTotalTokens;
    const contextUsagePercent =
      contextTokens > 0 ? Math.round((totalTokensUsed / contextTokens) * 100 * 10) / 10 : 0;

    let lastMessageText = null;
    if (lastMessage?.content) {
      if (typeof lastMessage.content === 'string') {
        lastMessageText = lastMessage.content;
      } else if (Array.isArray(lastMessage.content)) {
        const textBlock = lastMessage.content.find((c) => c.type === 'text');
        lastMessageText = textBlock?.text || null;
      }
    }

    if (lastMessageText && lastMessageText.length > 200) {
      lastMessageText = `${lastMessageText.substring(0, 200)}...`;
    }

    const displayName = (
      session.label ||
      session.name ||
      session.displayName ||
      session.sessionLabel ||
      ''
    )
      .toString()
      .toLowerCase();
    const sessionKey = (session.key || '').toString().toLowerCase();
    const isHeartbeatSession =
      displayName.includes('heartbeat') ||
      sessionKey.endsWith(':heartbeat') ||
      sessionKey.includes(':heartbeat:');
    const hasUsage = inputTokens > 0 || outputTokens > 0;
    if (!lastMessageText && isHeartbeatSession && hasUsage) {
      lastMessageText = 'HEARTBEAT_OK';
    }

    let kind = session.kind || 'main';
    let sessionMode = null;
    if (kind === 'direct' && session.key) {
      const keyParts = session.key.split(':');
      if (keyParts[0] === 'agent' && keyParts.length >= 3) {
        const keyKind = keyParts[2];
        if (keyKind) kind = keyKind;
      }
    }
    if (session.key) {
      const keyParts = session.key.split(':');
      if (keyParts[0] === 'agent' && keyParts.length >= 3) {
        const seg = keyParts[2];
        if (seg === 'main' || seg === 'isolated') sessionMode = seg;
      }
    }
    if (kind === 'isolated') kind = 'heartbeat';

    let rawLabel =
      session.label ||
      session.name ||
      session.displayName ||
      session.sessionLabel ||
      session.sessionId ||
      session.id;

    let telegramUserId = null;
    let telegramIdMatch = null;
    let userName = null;
    let topicName = null;
    let channelName = null;

    const isTelegramSession =
      rawLabel && typeof rawLabel === 'string' && rawLabel.toLowerCase().includes('telegram');

    let cleanedGroupName =
      isTelegramSession && typeof rawLabel === 'string'
        ? rawLabel.replace(/(?:Telegram|telegram):\s*/gi, '').trim()
        : typeof rawLabel === 'string'
          ? rawLabel
          : String(rawLabel || '');
    if (typeof cleanedGroupName === 'string' && cleanedGroupName.startsWith('g-')) {
      cleanedGroupName = cleanedGroupName.substring(2);
    }

    if (isTelegramSession) {
      telegramIdMatch = rawLabel.match(/(?:telegram|Telegram):\s*(\d+)/i);
      telegramUserId = telegramIdMatch?.[1];

      userName =
        session.lastTo ||
        session.userName ||
        session.user_name ||
        session.contactName ||
        lastMessage?.from?.name ||
        lastMessage?.from?.username ||
        lastMessage?.fromName ||
        lastMessage?.author ||
        lastMessage?.userName;

      if (userName && typeof userName === 'string') {
        const userNameStr = userName.trim();
        if (
          userNameStr.toLowerCase().includes('telegram:') ||
          userNameStr === telegramUserId ||
          userNameStr.match(/^telegram:\d+$/i)
        ) {
          userName = null;
        } else {
          userName = userNameStr;
        }
      }

      let cleanedLabel =
        typeof rawLabel === 'string'
          ? rawLabel.replace(/(?:Telegram|telegram):\s*/gi, '').trim()
          : String(rawLabel || '');
      if (typeof cleanedLabel === 'string' && cleanedLabel.startsWith('g-')) {
        cleanedLabel = cleanedLabel.substring(2);
      }

      if (
        userName &&
        typeof userName === 'string' &&
        userName.trim() &&
        userName !== telegramUserId &&
        !userName.match(/^\d+$/)
      ) {
        rawLabel = userName;
      } else if (telegramUserId) {
        const userIdOnly = String(telegramUserId).trim();
        rawLabel = userIdOnly.length > 0 ? userIdOnly : cleanedLabel;
      } else {
        rawLabel = cleanedLabel || rawLabel;
      }
    }

    let topicIdFromKey = null;
    if (session.key && typeof session.key === 'string') {
      const keyParts = session.key.split(':');
      const telegramIdx = keyParts.indexOf('telegram');
      if (
        telegramIdx !== -1 &&
        keyParts[telegramIdx + 1] === 'group' &&
        keyParts.length > telegramIdx + 4 &&
        keyParts[telegramIdx + 3] === 'topic'
      ) {
        topicIdFromKey = keyParts[telegramIdx + 4];
      }
    }

    const potentialTopicFromTo =
      lastMessage?.to &&
      typeof lastMessage.to === 'string' &&
      lastMessage.to.trim() !== cleanedGroupName &&
      !lastMessage.to.match(/^telegram:/i) &&
      !lastMessage.to.match(/^g-\d+$/)
        ? lastMessage.to.trim()
        : null;

    const potentialTopicFromChannel =
      session.lastChannel &&
      typeof session.lastChannel === 'string' &&
      session.lastChannel.trim() !== cleanedGroupName &&
      !session.lastChannel.match(/^telegram:/i) &&
      !session.lastChannel.match(/^telegram$/i) &&
      !session.lastChannel.match(/^g-\d+$/) &&
      session.lastChannel.trim() !== potentialTopicFromTo
        ? session.lastChannel.trim()
        : null;

    topicName =
      session.topic ||
      session.topicName ||
      session.topic_name ||
      lastMessage?.topic ||
      lastMessage?.topicName ||
      potentialTopicFromChannel ||
      potentialTopicFromTo ||
      (topicIdFromKey ? `Topic ${topicIdFromKey}` : null);

    channelName =
      session.lastChannel ||
      session.channel ||
      session.channelName ||
      session.channel_name ||
      lastMessage?.channel ||
      null;

    const label =
      typeof rawLabel === 'string' &&
      !rawLabel.includes(':') &&
      /^[a-z]/.test(rawLabel) &&
      !rawLabel.includes(' ')
        ? rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1)
        : rawLabel;

    const isCumulative = session._cronLatestRun?._isCumulative === true;
    const todayTotalCost = session._cronLatestRun?.totalCost ?? null;

    return {
      id: session.sessionId || session.id,
      key: session.key || null,
      label,
      status,
      kind,
      sessionMode,
      updatedAt: updatedAtMs || null,
      agent: agentName,
      model,
      contextTokens,
      totalTokensUsed,
      contextUsagePercent,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      messageCost,
      todayTotalCost,
      isCumulative,
      lastMessage: lastMessageText,
      lastMessageRole: lastMessage?.role || null,
      topic: topicName || null,
      channel: channelName || null,
    };
  });

  transformedSessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  const sessionAgentNameMap = new Map();
  try {
    const sessionAgentIds = [...new Set(transformedSessions.map((s) => s.agent).filter(Boolean))];
    if (sessionAgentIds.length > 0) {
      const result = await pool.query(
        'SELECT agent_id, name FROM agents WHERE agent_id = ANY($1)',
        [sessionAgentIds],
      );
      result.rows.forEach((row) => {
        sessionAgentNameMap.set(row.agent_id, row.name);
      });
    }
  } catch (dbErr) {
    logger.warn('Could not query agents table for session agent names', {
      error: dbErr.message,
    });
  }

  const enrichedSessions = transformedSessions.map((session) => ({
    ...session,
    agentName: sessionAgentNameMap.get(session.agent) || null,
  }));

  logger.info('Returning sessions', {
    userId,
    total: enrichedSessions.length,
    running: enrichedSessions.filter((s) => s.status === 'running').length,
    active: enrichedSessions.filter((s) => s.status === 'active').length,
    idle: enrichedSessions.filter((s) => s.status === 'idle').length,
  });

  return {
    sessions: enrichedSessions,
    dailyCost,
  };
}

async function deleteSessionByKey({ userId, sessionKey }) {
  if (!sessionKey || typeof sessionKey !== 'string') {
    const error = new Error('Query parameter key (session key) is required');
    error.status = 400;
    throw error;
  }

  logger.info('Deleting OpenClaw session', {
    userId,
    sessionKey,
  });

  try {
    await gatewayWsRpc('sessions.delete', { key: sessionKey });
    logger.info('Session deleted via Gateway sessions.delete', {
      sessionKey,
    });
    return { deleted: true };
  } catch (rpcErr) {
    const msg = (rpcErr?.message || '').toLowerCase();
    if (msg.includes('method') || msg.includes('not found') || msg.includes('unknown')) {
      const error = new Error(
        'Session deletion is not supported by the OpenClaw Gateway. The sessions.delete RPC may not be available in this Gateway version.',
      );
      error.status = 501;
      error.code = 'NOT_IMPLEMENTED';
      throw error;
    }
    if (msg.includes('webchat') || msg.includes('cannot delete')) {
      const error = new Error(
        'Session deletion is not allowed. The OpenClaw Gateway restricts session deletion for security reasons.',
      );
      error.status = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }
    throw rpcErr;
  }
}

module.exports = {
  toUpdatedAtMs,
  getSessionsStatusData,
  listSessionsData,
  deleteSessionByKey,
};
