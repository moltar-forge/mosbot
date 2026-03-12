const logger = require('../utils/logger');
const {
  sessionsHistory,
  sessionsHistoryViaWs,
  sessionsListAllViaWs,
} = require('./openclawGatewayClient');
const { getFileContent } = require('./openclawWorkspaceClient');
const { toUpdatedAtMs } = require('./sessionListService');

async function getSessionMessagesData({ userId, sessionId, sessionKey, limit, includeTools }) {
  if (!sessionKey) {
    const error = new Error('Session key is required as a query parameter (key=...)');
    error.status = 400;
    throw error;
  }

  logger.info('Fetching session message history', {
    userId,
    sessionId,
    sessionKey,
    limit,
    includeTools,
  });

  const parsedLimit = parseInt(limit, 10);
  let messages = [];
  let usedWsFallback = false;

  const cronRunMatch = sessionKey?.match(/^agent:([^:]+):cron:[^:]+:run:([^:]+)$/);
  if (cronRunMatch) {
    const [, agentId, runSessionId] = cronRunMatch;
    const filePath = `/agents/${agentId}/sessions/${runSessionId}.jsonl`;
    try {
      const raw = await getFileContent(filePath);
      if (raw) {
        messages = raw
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          })
          .filter((entry) => entry && entry.type === 'message' && entry.message)
          .map((entry) => ({
            ...entry.message,
            timestamp: entry.timestamp
              ? new Date(entry.timestamp).getTime()
              : entry.message.timestamp || null,
          }));

        logger.info('Cron run session history read from JSONL transcript', {
          sessionKey,
          filePath,
          messageCount: messages.length,
        });
      }
    } catch (jsonlErr) {
      logger.warn('Failed to read cron run JSONL transcript, falling back to chat.history', {
        sessionKey,
        filePath,
        error: jsonlErr.message,
      });
    }
  }

  if (!cronRunMatch || messages.length === 0) {
    try {
      const wsResult = await sessionsHistoryViaWs({
        sessionKey,
        limit: parsedLimit || 200,
      });
      messages = Array.isArray(wsResult?.messages) ? wsResult.messages : [];
      logger.info('Session history fetched via WebSocket RPC', {
        sessionKey,
        messageCount: messages.length,
      });
    } catch (wsErr) {
      logger.warn('WebSocket chat.history failed, falling back to tool invocation', {
        sessionKey,
        error: wsErr.message,
      });
      usedWsFallback = true;
    }

    if (usedWsFallback) {
      const historyResult = await sessionsHistory({
        sessionKey,
        limit: parsedLimit,
        includeTools: includeTools === 'true' || includeTools === true,
      });

      logger.debug('sessionsHistory raw result', {
        sessionKey,
        resultType: Array.isArray(historyResult) ? 'array' : typeof historyResult,
        resultKeys:
          historyResult && typeof historyResult === 'object' ? Object.keys(historyResult) : null,
        isNull: historyResult === null,
        isUndefined: historyResult === undefined,
      });

      if (historyResult?.details?.status === 'forbidden') {
        const error = new Error(
          'Agent session history is not accessible. Agent-to-agent access is disabled in OpenClaw Gateway.',
        );
        error.status = 403;
        error.code = 'AGENT_TO_AGENT_DISABLED';
        error.hint =
          'Enable agent-to-agent access by setting tools.agentToAgent.enabled=true in OpenClaw Gateway configuration';
        error.details = historyResult.details;
        throw error;
      }

      if (Array.isArray(historyResult)) {
        messages = historyResult;
      } else if (historyResult && Array.isArray(historyResult.messages)) {
        messages = historyResult.messages;
      } else if (historyResult && historyResult.details && Array.isArray(historyResult.details.messages)) {
        messages = historyResult.details.messages;
      } else if (historyResult && typeof historyResult === 'object') {
        logger.warn('Unexpected sessionsHistory result structure', {
          sessionKey,
          result: historyResult,
          resultKeys: Object.keys(historyResult),
        });
        messages = [];
      }
    }
  }

  logger.info('Session history loaded', {
    userId,
    sessionKey,
    messageCount: messages.length,
    source: usedWsFallback ? 'tool' : 'websocket',
    messageRoles: messages.map((m) => m.role),
    messageContentLengths: messages.map((m) => {
      if (typeof m.content === 'string') return m.content.length;
      if (Array.isArray(m.content)) {
        const textBlocks = m.content.filter((c) => c.type === 'text');
        return textBlocks.map((c) => c.text).join('').length;
      }
      return 0;
    }),
  });

  let session = null;
  try {
    const wsResult = await sessionsListAllViaWs({
      includeGlobal: true,
      includeUnknown: true,
    });
    const allSessions = Array.isArray(wsResult) ? wsResult : wsResult?.sessions || [];
    session = allSessions.find((s) => s.sessionId === sessionId || s.id === sessionId || s.key === sessionKey);
  } catch (metaErr) {
    logger.warn('sessionsListAllViaWs failed for session metadata, using minimal metadata', {
      sessionId,
      sessionKey,
      error: metaErr.message,
    });
  }

  const transformedMessages = messages.map((msg, index) => {
    let content = null;
    let blocks = null;
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      blocks = msg.content;
      const textBlocks = msg.content.filter((c) => c.type === 'text');
      content = textBlocks.map((c) => c.text).join('\n\n');
    }

    let model = null;
    if (msg.provider && msg.model) {
      model = `${msg.provider}/${msg.model}`;
    } else if (msg.model) {
      model = msg.model;
    }

    return {
      index,
      role: msg.role || 'unknown',
      content,
      blocks,
      model,
      provider: msg.provider || null,
      timestamp: msg.timestamp || null,
    };
  });

  let agentNameFromKey = 'unknown';
  if (sessionKey && sessionKey.startsWith('agent:')) {
    const parts = sessionKey.split(':');
    if (parts.length >= 2) agentNameFromKey = parts[1];
  }

  let sessionMetadata = {
    id: sessionId,
    key: sessionKey,
    label: sessionId,
    agent: agentNameFromKey,
    status: 'unknown',
  };

  if (session) {
    let agentName = 'unknown';
    if (session.key) {
      const keyParts = session.key.split(':');
      if (keyParts.length >= 2 && keyParts[0] === 'agent') {
        agentName = keyParts[1];
      }
    }

    const RUNNING_THRESHOLD_MS = 2 * 60 * 1000;
    const ACTIVE_THRESHOLD_MS = 30 * 60 * 1000;
    const now = Date.now();
    const rawUpdatedAt = session.updatedAt ?? session.updated_at;
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

    const metaContextTokens = session.contextTokens || 0;
    const metaRawTotalTokens = session.totalTokens || 0;
    const metaTotalTokensUsed =
      metaContextTokens > 0 ? Math.min(metaRawTotalTokens, metaContextTokens) : metaRawTotalTokens;
    const metaContextUsagePercent =
      metaContextTokens > 0
        ? Math.round((metaTotalTokensUsed / metaContextTokens) * 100 * 10) / 10
        : 0;

    sessionMetadata = {
      id: sessionId,
      key: session.key || sessionKey,
      label: session.label || session.name || session.displayName || session.sessionLabel || sessionId,
      agent: agentName,
      status,
      kind: session.kind || 'main',
      updatedAt: updatedAtMs || null,
      contextTokens: metaContextTokens,
      totalTokensUsed: metaTotalTokensUsed,
      contextUsagePercent: metaContextUsagePercent,
    };
  }

  logger.info('Returning session messages', {
    userId,
    sessionId,
    messageCount: transformedMessages.length,
  });

  const sessionNotLoaded = transformedMessages.length === 0 && !session;

  return {
    messages: transformedMessages,
    session: sessionMetadata,
    sessionNotLoaded,
  };
}

module.exports = {
  getSessionMessagesData,
};
