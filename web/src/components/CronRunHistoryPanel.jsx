import { Fragment, useState, useEffect, useRef } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import {
  XMarkIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
  ChatBubbleLeftRightIcon,
  CpuChipIcon,
  ClipboardDocumentIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { getCronJobRuns, getSessionMessages } from '../api/client';
import { useAgentStore } from '../stores/agentStore';
import MarkdownRenderer from './MarkdownRenderer';
import logger from '../utils/logger';

// ─── CopyableId component ──────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function CopyableId({ label, value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  const isUuid = UUID_RE.test(value);
  const display = isUuid ? `${value.slice(0, 8)}…` : value;

  const handleCopy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`${label} ID: ${value}`}
      className="group flex items-center gap-1 text-xs rounded px-1.5 py-0.5 bg-dark-700/50 hover:bg-dark-700 border border-dark-600/50 hover:border-dark-600 transition-colors"
    >
      <span className="text-dark-500">{label}:</span>
      <span className="text-dark-400 font-mono">{display}</span>
      {copied ? (
        <CheckIcon className="w-3 h-3 text-green-400 flex-shrink-0" />
      ) : (
        <ClipboardDocumentIcon className="w-3 h-3 text-dark-600 group-hover:text-dark-400 flex-shrink-0 transition-colors" />
      )}
    </button>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDuration(ms) {
  if (!ms || ms <= 0) return null;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}

function formatTokens(n) {
  if (n == null) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(cost) {
  if (cost == null || cost <= 0) return null;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatModel(model) {
  if (!model) return null;
  const part = model.includes('/') ? model.split('/').pop() : model;
  const l = part.toLowerCase();
  if (l.includes('kimi-k2')) return 'Kimi K2.5';
  if (l.includes('opus-4')) return 'Opus 4';
  if (l.includes('sonnet-4')) return 'Sonnet 4.5';
  if (l.includes('haiku-4')) return 'Haiku 4.5';
  if (l.includes('gemini-2.5-flash-lite')) return 'Gemini Flash Lite';
  if (l.includes('gemini-2.5-flash')) return 'Gemini Flash';
  if (l.includes('gemini-2.5')) return 'Gemini 2.5';
  if (l.includes('gpt-5.4')) return 'GPT-5.4';
  if (l.includes('gpt-5.3')) return l.includes('codex') ? 'GPT-5.3 Codex' : 'GPT-5.3';
  if (l.includes('gpt-5.2')) return 'GPT-5.2';
  if (l.includes('gpt-5')) return 'GPT-5';
  if (l.includes('deepseek')) return 'DeepSeek';
  return part;
}

function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // **bold**
    .replace(/\*(.*?)\*/g, '$1') // *italic*
    .replace(/__(.*?)__/g, '$1') // __bold__
    .replace(/_(.*?)_/g, '$1') // _italic_
    .replace(/`(.*?)`/g, '$1') // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url)
    .replace(/^#+\s+/gm, '') // headers
    .replace(/^\s*[-*+]\s+/gm, '') // list items
    .replace(/^\s*\d+\.\s+/gm, '') // numbered list items
    .replace(/\n+/g, ' ') // replace line breaks with space
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .trim();
}

function statusMeta(status) {
  switch (status) {
    case 'ok':
      return { icon: CheckCircleIcon, badge: 'text-green-400 bg-green-500/10 border-green-500/20' };
    case 'error':
    case 'failed':
      return { icon: XCircleIcon, badge: 'text-red-400 bg-red-500/10 border-red-500/20' };
    default:
      return {
        icon: ExclamationTriangleIcon,
        badge: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
      };
  }
}

// ─── RunRow ──────────────────────────────────────────────────────────────────

function RunRow({ run, index: _index, isLatest, models = [] }) {
  const [isOpen, setIsOpen] = useState(isLatest);
  const [messages, setMessages] = useState(null); // null = not yet loaded
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [messagesError, setMessagesError] = useState(null);

  const { icon: StatusIcon, badge } = statusMeta(run.status);
  const runDate = run.runAtMs ? new Date(run.runAtMs) : null;
  const costLabel = formatCost(run.estimatedCost);

  const fetchMessages = async (sessionKey) => {
    setIsLoadingMessages(true);
    setMessagesError(null);
    try {
      const data = await getSessionMessages(sessionKey, { limit: 200, includeTools: true });
      setMessages(data.messages || []);
    } catch (err) {
      logger.warn('Failed to load run messages', { sessionKey, error: err.message });
      setMessagesError(
        'Messages could not be loaded. The gateway session may no longer be active.',
      );
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  // Auto-load messages when the run starts open (isLatest)
  useEffect(() => {
    if (isOpen && messages === null && run.sessionKey && !isLoadingMessages) {
      fetchMessages(run.sessionKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggle = async () => {
    const next = !isOpen;
    setIsOpen(next);

    if (next && messages === null && run.sessionKey && !isLoadingMessages) {
      fetchMessages(run.sessionKey);
    }
  };

  return (
    <div
      className={`rounded-lg border overflow-hidden ${isLatest ? 'border-amber-500/20' : 'border-dark-700/60'}`}
    >
      {/* Row header / toggle */}
      <button
        type="button"
        onClick={handleToggle}
        className={`w-full flex flex-col gap-2 px-4 py-3 text-left transition-colors ${
          isLatest ? 'bg-amber-500/8 hover:bg-amber-500/12' : 'bg-dark-800/60 hover:bg-dark-800'
        }`}
      >
        {/* First row: Chevron, date/time, and stats */}
        <div className="flex items-center gap-2.5 w-full">
          {isOpen ? (
            <ChevronDownIcon
              className={`w-4 h-4 flex-shrink-0 ${isLatest ? 'text-amber-400' : 'text-dark-500'}`}
            />
          ) : (
            <ChevronRightIcon
              className={`w-4 h-4 flex-shrink-0 ${isLatest ? 'text-amber-400' : 'text-dark-500'}`}
            />
          )}

          {/* Date/time */}
          {runDate && (
            <div className={`text-xs font-medium ${isLatest ? 'text-amber-400' : 'text-dark-200'}`}>
              {runDate.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })}
            </div>
          )}

          {/* Stats and status */}
          <div className="flex items-center gap-3 text-xs flex-wrap ml-auto">
            {run.durationMs && (
              <span className="flex items-center gap-1 text-dark-500">
                <ClockIcon className="w-3 h-3" />
                {formatDuration(run.durationMs)}
              </span>
            )}
            {(run.inputTokens != null || run.outputTokens != null) && (
              <div className="flex items-center gap-2">
                <span className="text-dark-500">In:</span>
                <span className="text-dark-200 font-mono font-medium">
                  {formatTokens(run.inputTokens || 0)}
                </span>
                <span className="text-dark-600">•</span>
                <span className="text-dark-500">Out:</span>
                <span className="text-dark-200 font-mono font-medium">
                  {formatTokens(run.outputTokens || 0)}
                </span>
              </div>
            )}
            {costLabel && (
              <>
                {(run.durationMs || run.inputTokens != null || run.outputTokens != null) && (
                  <span className="text-dark-600">•</span>
                )}
                <div className="flex items-center gap-1.5">
                  <span className="text-dark-500">Cost:</span>
                  <span className="text-dark-200 font-mono font-medium">{costLabel}</span>
                </div>
              </>
            )}
            {run.model && (
              <>
                {(run.durationMs ||
                  run.inputTokens != null ||
                  run.outputTokens != null ||
                  costLabel) && <span className="text-dark-600">•</span>}
                <span className="text-dark-500">{formatModel(run.model)}</span>
              </>
            )}
            {run.status && (
              <>
                {(run.durationMs ||
                  run.inputTokens != null ||
                  run.outputTokens != null ||
                  costLabel ||
                  run.model) && <span className="text-dark-600">•</span>}
                <span
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${badge}`}
                >
                  <StatusIcon className="w-3 h-3" />
                  {run.status}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Second row: Summary preview */}
        {!isOpen && run.summary && (
          <p className="text-xs text-dark-400 text-left break-words ml-6 truncate">
            {stripMarkdown(run.summary)}
          </p>
        )}
      </button>

      {/* Expanded body */}
      {isOpen && (
        <div className="p-4 bg-dark-900/40 space-y-4">
          {/* Error detail */}
          {run.error && (
            <div className="rounded-lg bg-red-900/20 border border-red-800/30 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1">
                Error
              </p>
              <p className="text-sm text-red-400 whitespace-pre-wrap">{run.error}</p>
            </div>
          )}

          {/* Summary — label outside the card */}
          {run.summary && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-dark-500">
                Summary
              </p>
              <div className="rounded-lg bg-dark-800/50 border border-dark-700/50 p-4">
                <div className="prose prose-invert prose-sm max-w-none">
                  <MarkdownRenderer content={run.summary} />
                </div>
              </div>
            </>
          )}

          {/* Messages */}
          {run.sessionKey ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-dark-500">
                  Messages
                </p>
                <p
                  className="text-[10px] font-mono text-dark-600 truncate max-w-[60%]"
                  title={run.sessionKey}
                >
                  {run.sessionKey}
                </p>
              </div>

              {isLoadingMessages && (
                <div className="flex items-center gap-2 py-4 text-sm text-dark-400">
                  <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  Loading messages…
                </div>
              )}

              {messagesError && (
                <div className="rounded-lg bg-dark-800/50 border border-dark-700/50 px-4 py-3 flex items-start gap-2.5">
                  <ChatBubbleLeftRightIcon className="w-4 h-4 text-dark-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-dark-400">{messagesError}</p>
                </div>
              )}

              {!isLoadingMessages &&
                !messagesError &&
                messages !== null &&
                messages.length === 0 && (
                  <div className="rounded-lg bg-dark-800/50 border border-dark-700/50 px-4 py-3 flex items-start gap-2.5">
                    <ChatBubbleLeftRightIcon className="w-4 h-4 text-dark-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-dark-400">No messages available for this run.</p>
                  </div>
                )}

              {!isLoadingMessages && messages && messages.length > 0 && (
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <MessageBubble key={i} message={msg} models={models} />
                  ))}
                </div>
              )}
            </>
          ) : (
            !run.summary &&
            !run.error && (
              <p className="text-xs text-dark-500 italic">No data available for this run.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function roleBadge(role) {
  switch (role) {
    case 'user':
      return 'bg-blue-600/10 text-blue-400 border-blue-500/20';
    case 'assistant':
      return 'bg-purple-600/10 text-purple-400 border-purple-500/20';
    case 'system':
      return 'bg-dark-600/10 text-dark-400 border-dark-600/20';
    case 'agent':
      return 'bg-indigo-600/10 text-indigo-400 border-indigo-500/20';
    default:
      return 'bg-dark-700 text-dark-400 border-dark-600';
  }
}

function toolCallSummary(tc) {
  const args = tc.arguments || {};
  const firstVal = Object.values(args)[0];
  const preview = typeof firstVal === 'string' ? firstVal : JSON.stringify(firstVal ?? '');
  const short = preview.length > 48 ? `${preview.slice(0, 48)}…` : preview;
  return short ? `${tc.name}(${short})` : tc.name;
}

function ToolCallChip({ tc }) {
  const [open, setOpen] = useState(false);
  const hasArgs = tc.arguments && Object.keys(tc.arguments).length > 0;
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={() => hasArgs && setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-dark-700/60 border border-dark-600/50 text-dark-400 ${hasArgs ? 'hover:bg-dark-700 hover:text-dark-300 cursor-pointer' : 'cursor-default'} transition-colors`}
      >
        <span className="text-dark-500">→</span>
        {toolCallSummary(tc)}
        {hasArgs &&
          (open ? (
            <ChevronDownIcon className="w-2.5 h-2.5 ml-0.5 flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="w-2.5 h-2.5 ml-0.5 flex-shrink-0" />
          ))}
      </button>
      {open && (
        <pre className="text-[11px] font-mono text-dark-300 bg-dark-900/60 border border-dark-700/50 rounded px-3 py-2 whitespace-pre-wrap break-all leading-relaxed">
          {JSON.stringify(tc.arguments, null, 2)}
        </pre>
      )}
    </span>
  );
}

function MessageBubble({ message, models = [] }) {
  const [thinkingOpen, setThinkingOpen] = useState(false);

  // `blocks` is the raw content array from the API; `content` is the pre-extracted text string.
  // Fall back to parsing content as an array for any legacy paths.
  const blocks = Array.isArray(message.blocks)
    ? message.blocks
    : Array.isArray(message.content)
      ? message.content
      : [];
  const content = (
    message.content && typeof message.content === 'string'
      ? message.content
      : blocks
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('')
  ).trim();

  const thinking = blocks
    .filter((b) => b.type === 'thinking')
    .map((b) => b.thinking)
    .join('\n\n');
  const toolCalls = blocks.filter((b) => b.type === 'toolCall');

  // Skip assistant messages with truly nothing to show
  if (!content && !toolCalls.length && message.role === 'assistant') return null;

  const isAgentMsg =
    content.toLowerCase().includes('[subagent context]') ||
    content.toLowerCase().includes('[subagent task]') ||
    content.toLowerCase().includes('you are running as a subagent');

  const displayRole = message.role === 'user' && isAgentMsg ? 'agent' : message.role || 'unknown';

  return (
    <div className="bg-dark-800/50 border border-dark-700/50 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-1 text-xs font-medium rounded-full border ${roleBadge(displayRole)}`}
          >
            {displayRole}
          </span>
          {message.model && (
            <span className="text-xs text-dark-400">
              {models.find((m) => m.id === message.model)?.alias || formatModel(message.model)}
            </span>
          )}
        </div>
        {message.timestamp && (
          <span className="text-xs text-dark-400 flex-shrink-0">
            {new Date(message.timestamp).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
              hour12: true,
            })}
          </span>
        )}
      </div>

      {content && (
        <div className="prose prose-invert prose-sm max-w-none">
          <MarkdownRenderer content={content} />
        </div>
      )}

      {/* Tool call chips */}
      {toolCalls.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 ${content ? 'mt-3' : ''}`}>
          {toolCalls.map((tc, i) => (
            <ToolCallChip key={i} tc={tc} />
          ))}
        </div>
      )}

      {/* Collapsible reasoning block — only shown when there is also visible text content */}
      {content && thinking && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setThinkingOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[10px] text-dark-500 hover:text-dark-400 transition-colors"
          >
            {thinkingOpen ? (
              <ChevronDownIcon className="w-3 h-3" />
            ) : (
              <ChevronRightIcon className="w-3 h-3" />
            )}
            Reasoning
          </button>
          {thinkingOpen && (
            <div className="mt-2 pl-3 border-l border-dark-700 text-xs text-dark-400 whitespace-pre-wrap leading-relaxed">
              {thinking}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export default function CronRunHistoryPanel({ isOpen, onClose, job, models = [] }) {
  const [runs, setRuns] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const getAgentById = useAgentStore((state) => state.getAgentById);
  const agent = job?.agentId ? getAgentById(job.agentId) : null;

  useEffect(() => {
    if (isOpen && job?.id) {
      loadRuns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, job?.id]);

  // Scroll to the bottom after runs load so the latest run (last item) is visible
  useEffect(() => {
    if (!isLoading && runs.length > 0 && scrollRef.current) {
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      });
    }
  }, [isLoading, runs.length]);

  const loadRuns = async () => {
    setIsLoading(true);
    setError(null);
    setRuns([]);
    try {
      const data = await getCronJobRuns(job.id, { limit: 25 });
      setRuns(data.runs || []);
    } catch (err) {
      logger.error('Failed to load cron run history', err);
      setError('Could not load run history. The workspace may be unavailable.');
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate aggregate stats from runs
  const aggregateStats = runs.reduce(
    (acc, run) => {
      acc.inputTokens += run.inputTokens || 0;
      acc.outputTokens += run.outputTokens || 0;
      acc.cacheReadTokens += run.cacheReadTokens || 0;
      acc.cacheWriteTokens += run.cacheWriteTokens || 0;
      acc.totalCost += run.estimatedCost || 0;
      return acc;
    },
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalCost: 0 },
  );

  const hasUsageStats =
    aggregateStats.inputTokens > 0 ||
    aggregateStats.outputTokens > 0 ||
    aggregateStats.cacheReadTokens > 0 ||
    aggregateStats.cacheWriteTokens > 0 ||
    aggregateStats.totalCost > 0;

  return (
    <Transition.Root show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-in-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in-out duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-dark-950/75 backdrop-blur-sm transition-opacity" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
              <Transition.Child
                as={Fragment}
                enter="transform transition ease-in-out duration-300"
                enterFrom="translate-x-full"
                enterTo="translate-x-0"
                leave="transform transition ease-in-out duration-200"
                leaveFrom="translate-x-0"
                leaveTo="translate-x-full"
              >
                <Dialog.Panel className="pointer-events-auto w-full sm:w-screen sm:max-w-3xl">
                  <div className="flex h-full flex-col bg-dark-900 shadow-xl border-l border-dark-800">
                    {/* Header */}
                    <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-dark-800 bg-dark-800/50">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 mt-1">
                            {job?.agentEmoji ? (
                              <div
                                className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center text-base"
                                title={job?.agentName || agent?.name || job?.agentId}
                              >
                                {job.agentEmoji}
                              </div>
                            ) : (
                              <ClockIcon className="w-6 h-6 text-dark-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <Dialog.Title className="text-lg font-semibold text-dark-100 truncate">
                              🤖 Cron: {job?.name || 'Run History'}
                            </Dialog.Title>
                            {(job?.id || job?.jobId) && (
                              <div className="mt-0.5 flex items-center gap-3 flex-wrap">
                                <CopyableId label="Job" value={job.id || job.jobId} />
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
                              <div className="flex items-center gap-3">
                                {job?.agentId && (
                                  <div className="flex items-center gap-1.5 text-sm">
                                    <span className="text-dark-500">Agent:</span>
                                    <span className="text-dark-200 font-medium">
                                      {job.agentName || agent?.name || job.agentId}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Usage information on the right */}
                              {hasUsageStats && (
                                <div className="flex items-center gap-3 text-xs ml-auto">
                                  {(aggregateStats.inputTokens > 0 ||
                                    aggregateStats.outputTokens > 0) && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-dark-500">In:</span>
                                      <span className="text-dark-200 font-mono font-medium">
                                        {formatTokens(aggregateStats.inputTokens)}
                                      </span>
                                      <span className="text-dark-600">•</span>
                                      <span className="text-dark-500">Out:</span>
                                      <span className="text-dark-200 font-mono font-medium">
                                        {formatTokens(aggregateStats.outputTokens)}
                                      </span>
                                    </div>
                                  )}
                                  {(aggregateStats.cacheReadTokens > 0 ||
                                    aggregateStats.cacheWriteTokens > 0) && (
                                    <>
                                      {(aggregateStats.inputTokens > 0 ||
                                        aggregateStats.outputTokens > 0) && (
                                        <span className="text-dark-600">•</span>
                                      )}
                                      <div className="flex items-center gap-2">
                                        {aggregateStats.cacheReadTokens > 0 && (
                                          <>
                                            <span className="text-dark-500">Cache Read:</span>
                                            <span className="text-emerald-400/80 font-mono font-medium">
                                              {formatTokens(aggregateStats.cacheReadTokens)}
                                            </span>
                                          </>
                                        )}
                                        {aggregateStats.cacheWriteTokens > 0 && (
                                          <>
                                            {aggregateStats.cacheReadTokens > 0 && (
                                              <span className="text-dark-600">•</span>
                                            )}
                                            <span className="text-dark-500">Cache Write:</span>
                                            <span className="text-amber-400/80 font-mono font-medium">
                                              {formatTokens(aggregateStats.cacheWriteTokens)}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </>
                                  )}
                                  {aggregateStats.totalCost > 0 && (
                                    <>
                                      {(aggregateStats.inputTokens > 0 ||
                                        aggregateStats.outputTokens > 0 ||
                                        aggregateStats.cacheReadTokens > 0) && (
                                        <span className="text-dark-600">•</span>
                                      )}
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-dark-500">Cost:</span>
                                        <span className="text-dark-200 font-mono font-medium">
                                          {formatCost(aggregateStats.totalCost)}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="ml-3 flex-shrink-0 rounded-md bg-dark-800 p-2 text-dark-400 hover:text-dark-300 hover:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                          onClick={onClose}
                        >
                          <span className="sr-only">Close panel</span>
                          <XMarkIcon className="h-5 w-5" />
                        </button>
                      </div>
                    </div>

                    {/* Body — scrolls to bottom after load so latest run is visible */}
                    <div
                      ref={scrollRef}
                      className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"
                    >
                      {isLoading && (
                        <div className="flex items-center justify-center py-16">
                          <div className="text-center">
                            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto" />
                            <p className="mt-3 text-sm text-dark-400">Loading run history…</p>
                          </div>
                        </div>
                      )}

                      {!isLoading && error && (
                        <div className="rounded-lg bg-red-900/20 border border-red-800/30 p-4">
                          <p className="text-sm text-red-400">{error}</p>
                          <button
                            onClick={loadRuns}
                            className="mt-2 text-sm text-red-300 hover:text-red-200 underline"
                          >
                            Try again
                          </button>
                        </div>
                      )}

                      {!isLoading && !error && runs.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                          <CpuChipIcon className="w-12 h-12 text-dark-600 mb-3" />
                          <p className="text-sm text-dark-400">No run history found.</p>
                          <p className="text-xs text-dark-500 mt-1">
                            Run records are written to the workspace after each completed execution.
                          </p>
                        </div>
                      )}

                      {!isLoading && !error && runs.length > 0 && (
                        <div className="space-y-3">
                          {/* Runs are in chronological order (oldest first); latest is last and auto-expanded */}
                          {runs.map((run, i) => (
                            <RunRow
                              key={
                                run.sessionId ?? run.sessionKey ?? String(run.runAtMs) ?? String(i)
                              }
                              run={run}
                              index={i + 1}
                              isLatest={i === runs.length - 1}
                              models={models}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition.Root>
  );
}
