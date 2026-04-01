import { ClockIcon, CpuChipIcon, ChatBubbleLeftIcon } from '@heroicons/react/24/outline';
import { stripMarkdown } from '../utils/helpers';
import { useAgentStore } from '../stores/agentStore';

export default function SessionRow({ session, onClick, statusDisplay }) {
  const getAgentById = useAgentStore((state) => state.getAgentById);
  const agent = session.agent ? getAgentById(session.agent) : null;
  const getStatusColor = (status) => {
    switch (status) {
      case 'running':
        return 'bg-green-600/10 text-green-500 border-green-500/20';
      case 'active':
        return 'bg-blue-600/10 text-blue-500 border-blue-500/20';
      case 'idle':
        return 'bg-yellow-600/10 text-yellow-500 border-yellow-500/20';
      case 'completed':
        return 'bg-dark-600/10 text-dark-400 border-dark-600/20';
      case 'failed':
        return 'bg-red-600/10 text-red-500 border-red-500/20';
      default:
        return 'bg-dark-700 text-dark-400 border-dark-600';
    }
  };

  const formatDuration = (timestamp) => {
    if (!timestamp) return 'Unknown';
    const start = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
    const now = new Date();
    const diffMs = now - start;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours < 24) return `${hours}h ${mins}m ago`;

    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h ago`;
  };

  const formatModelName = (model) => {
    if (!model) return null;
    // Handle provider/model format (e.g., "moonshotai/kimi-k2.5")
    const modelPart = model.includes('/') ? model.split('/').pop() : model;
    // Simplify known model names
    const lower = modelPart.toLowerCase();
    if (lower.includes('kimi-k2')) return 'Kimi K2.5';
    if (lower.includes('opus-4-6') || lower.includes('opus-4')) return 'Opus 4';
    if (lower.includes('sonnet-4-5') || lower.includes('sonnet-4')) return 'Sonnet 4.5';
    if (lower.includes('haiku-4')) return 'Haiku 4.5';
    if (lower.includes('gemini-2.5-flash-lite')) return 'Gemini Flash Lite';
    if (lower.includes('gemini-2.5-flash')) return 'Gemini Flash';
    if (lower.includes('gemini-2.5')) return 'Gemini 2.5';
    if (lower.includes('gpt-5.4')) return 'GPT-5.4';
    if (lower.includes('gpt-5.3')) return lower.includes('codex') ? 'GPT-5.3 Codex' : 'GPT-5.3';
    if (lower.includes('gpt-5.2')) return 'GPT-5.2';
    if (lower.includes('gpt-5')) return 'GPT-5';
    if (lower.includes('deepseek')) return 'DeepSeek';
    return modelPart;
  };

  const formatTokens = (count) => {
    if (!count || count === 0) return '0';
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return count.toLocaleString();
  };

  const formatCost = (cost) => {
    if (!cost || cost === 0) return null;
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const getContextBarColor = (percent) => {
    if (percent >= 80) return 'bg-red-500';
    if (percent >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div
      className="p-3 sm:p-4 md:p-5 bg-dark-800 border border-dark-700 rounded-lg hover:border-dark-600 transition-colors cursor-pointer"
      onClick={() => onClick?.(session)}
    >
      {/* Top row: label, agent, model, status */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-2.5 sm:gap-3 flex-1 min-w-0">
          <div className="flex-shrink-0 mt-1">
            {agent?.icon ? (
              <div
                className="w-5 h-5 rounded-full bg-dark-700 flex items-center justify-center text-sm"
                title={agent.name || session.agent}
              >
                {agent.icon}
              </div>
            ) : (
              <CpuChipIcon className="w-5 h-5 text-dark-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <p className="text-sm sm:text-base font-semibold text-dark-100 truncate">
                  {session.label || session.key || session.id}
                </p>
                {/* Show topic/channel for Telegram groups to differentiate duplicate group sessions */}
                {(session.topic || session.channel) && (
                  <span
                    className="text-xs text-dark-400 font-medium px-2 py-0.5 bg-dark-700/50 rounded border border-dark-600/50 flex-shrink-0"
                    title={
                      session.topic ? `Topic: ${session.topic}` : `Channel: ${session.channel}`
                    }
                  >
                    {session.topic || session.channel}
                  </span>
                )}
              </div>
              {(session.kind === 'main' ||
                session.kind === 'heartbeat' ||
                session.kind === 'cron' ||
                session.kind === 'subagent' ||
                session.kind === 'hook') && (
                <span
                  className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded border flex-shrink-0 ${
                    session.kind === 'main'
                      ? 'text-sky-400 bg-sky-500/10 border-sky-500/20'
                      : session.kind === 'heartbeat'
                        ? 'text-pink-400 bg-pink-500/10 border-pink-500/20'
                        : session.kind === 'subagent'
                          ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
                          : session.kind === 'hook'
                            ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                            : 'text-purple-400 bg-purple-500/10 border-purple-500/20'
                  }`}
                >
                  {session.kind === 'main'
                    ? 'MAIN'
                    : session.kind === 'heartbeat'
                      ? 'HEARTBEAT'
                      : session.kind === 'subagent'
                        ? 'SUBAGENT'
                        : session.kind === 'hook'
                          ? 'HOOK'
                          : 'CRON'}
                </span>
              )}
              {(session.kind === 'main' ||
                session.kind === 'heartbeat' ||
                session.kind === 'cron' ||
                session.kind === 'subagent' ||
                session.kind === 'hook') &&
                (() => {
                  // MAIN      — agent's primary persistent session
                  // DEDICATED — heartbeat's own persistent session, separate from main
                  // ISOLATED  — fresh context per run (cron, subagent, hook)
                  if (session.kind === 'main') {
                    return (
                      <span
                        className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded border flex-shrink-0 text-sky-400 bg-sky-500/10 border-sky-500/20"
                        title="The agent's primary persistent session. Context accumulates across all interactions."
                      >
                        AGENT
                      </span>
                    );
                  }
                  if (session.kind === 'heartbeat') {
                    return (
                      <span
                        className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded border flex-shrink-0 text-pink-400/80 bg-pink-500/10 border-pink-500/20"
                        title="Runs in its own dedicated session, separate from the main session. Context accumulates across heartbeat runs."
                      >
                        DEDICATED
                      </span>
                    );
                  }
                  return (
                    <span
                      className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded border flex-shrink-0 text-amber-400/80 bg-amber-500/10 border-amber-500/20"
                      title="Each run starts in a fresh isolated context. No history is carried over between runs."
                    >
                      ISOLATED
                    </span>
                  );
                })()}
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs">
              {session.agent && (
                <div className="flex items-center gap-1.5">
                  <span className="text-dark-500">Agent:</span>
                  <span className="text-dark-200 font-medium">
                    {session.agentName || agent?.name || session.agent}
                  </span>
                </div>
              )}
              {session.model && (
                <>
                  {session.agent && <span className="text-dark-600">•</span>}
                  <div className="flex items-center gap-1.5">
                    <span className="text-dark-500">Model:</span>
                    <span className="text-dark-200 font-medium">
                      {formatModelName(session.model)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 sm:flex-shrink-0">
          {session.updatedAt && (
            <div className="flex items-center gap-1.5 text-xs text-dark-400">
              <ClockIcon className="w-4 h-4" />
              <span className="font-medium">{formatDuration(session.updatedAt)}</span>
            </div>
          )}
          <span
            className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs font-medium rounded-full border ${getStatusColor(statusDisplay ?? session.status)}`}
          >
            {statusDisplay ?? session.status}
          </span>
        </div>
      </div>

      {/* Middle row: token usage, cache, cost, context window */}
      {/* Cron: per-run data ("Last In/Out/Cost") — or "Total Cost" when per-run unavailable
          Heartbeat: daily total ("Today In/Out/Cost") — shares one persistent session across runs
          Main/subagent/hook: session-level aggregates ("Session In/Out/Cost") */}
      {(session.inputTokens > 0 ||
        session.outputTokens > 0 ||
        session.cacheReadTokens > 0 ||
        session.messageCost > 0 ||
        session.todayTotalCost > 0 ||
        session.contextTokens > 0) &&
        (() => {
          const inLabel = 'In:';
          const outLabel = 'Out:';
          const costLabel = 'Cost:';
          const displayCost = session.messageCost ?? session.todayTotalCost ?? 0;
          return (
            <div className="flex items-center gap-3 mt-3 sm:mt-4 ml-6 sm:ml-8 overflow-x-auto pb-1 scrollbar-hide text-xs">
              {/* Input / Output tokens */}
              {(session.inputTokens > 0 || session.outputTokens > 0) && (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-dark-500">{inLabel}</span>
                  <span className="text-dark-200 font-mono font-medium">
                    {formatTokens(session.inputTokens)}
                  </span>
                  <span className="text-dark-600">•</span>
                  <span className="text-dark-500">{outLabel}</span>
                  <span className="text-dark-200 font-mono font-medium">
                    {formatTokens(session.outputTokens)}
                  </span>
                </div>
              )}

              {/* Cache read / write tokens */}
              {(session.cacheReadTokens > 0 || session.cacheWriteTokens > 0) && (
                <>
                  {(session.inputTokens > 0 || session.outputTokens > 0) && (
                    <span className="text-dark-600 flex-shrink-0">•</span>
                  )}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {session.cacheReadTokens > 0 && (
                      <>
                        <span className="text-dark-500">Cache Read:</span>
                        <span className="text-emerald-400/80 font-mono font-medium">
                          {formatTokens(session.cacheReadTokens)}
                        </span>
                      </>
                    )}
                    {session.cacheWriteTokens > 0 && (
                      <>
                        {session.cacheReadTokens > 0 && <span className="text-dark-600">•</span>}
                        <span className="text-dark-500">Cache Write:</span>
                        <span className="text-amber-400/80 font-mono font-medium">
                          {formatTokens(session.cacheWriteTokens)}
                        </span>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Cost */}
              {displayCost > 0 && (
                <>
                  {(session.inputTokens > 0 ||
                    session.outputTokens > 0 ||
                    session.cacheReadTokens > 0) && (
                    <span className="text-dark-600 flex-shrink-0">•</span>
                  )}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-dark-500">{costLabel}</span>
                    <span className="text-dark-200 font-mono font-medium">
                      {formatCost(displayCost)}
                    </span>
                  </div>
                </>
              )}

              {/* Context window usage — cron shows last run's context fill; others show live session context */}
              {session.contextTokens > 0 && (
                <>
                  {(session.inputTokens > 0 ||
                    session.outputTokens > 0 ||
                    session.cacheReadTokens > 0 ||
                    displayCost > 0) && <span className="text-dark-600 flex-shrink-0">•</span>}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-dark-500">Context:</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getContextBarColor(session.contextUsagePercent)}`}
                          style={{ width: `${Math.min(session.contextUsagePercent, 100)}%` }}
                        />
                      </div>
                      <span className="text-dark-200 font-mono font-medium">
                        {session.contextUsagePercent}%
                      </span>
                    </div>
                    <span className="text-dark-500">
                      ({formatTokens(session.totalTokensUsed)} /{' '}
                      {formatTokens(session.contextTokens)})
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })()}

      {/* Bottom row: last message preview — suppress synthetic API sentinels */}
      {session.lastMessage && session.lastMessage !== 'HEARTBEAT_OK' && (
        <div className="mt-3 sm:mt-4 ml-6 sm:ml-8 p-2.5 sm:p-3 bg-dark-900/50 border border-dark-700/50 rounded">
          <div className="flex items-start gap-2">
            <ChatBubbleLeftIcon className="w-4 h-4 text-dark-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs sm:text-sm text-dark-400 line-clamp-2 leading-relaxed">
              {stripMarkdown(session.lastMessage)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
