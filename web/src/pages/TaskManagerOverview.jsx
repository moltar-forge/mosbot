import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PlayIcon,
  ClockIcon,
  CurrencyDollarIcon,
  CircleStackIcon,
  UserGroupIcon,
  XMarkIcon,
  FunnelIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import Header from '../components/Header';
import StatCard from '../components/StatCard';
import SessionList from '../components/SessionList';
import SessionDetailPanel from '../components/SessionDetailPanel';
import { useBotStore } from '../stores/botStore';
import { useAgentStore } from '../stores/agentStore';
import { useUsageStore } from '../stores/usageStore';
import { useSchedulerStore } from '../stores/schedulerStore';
import { getCronJobs, getSchedulerStats } from '../api/client';
import logger from '../utils/logger';
import { classNames, formatTokens } from '../utils/helpers';

const MONITOR_REFRESH_INTERVAL_MS = 15000;

const SESSION_TYPES = [
  { id: 'main', label: 'Agent' },
  { id: 'subagent', label: 'Subagent' },
  { id: 'cron', label: 'Cron' },
  { id: 'heartbeat', label: 'Heartbeat' },
];

export default function TaskManagerOverview() {
  // Full session data — fetched on mount and on manual refresh.
  // The global poller only keeps lightweight counts (for the sidebar avatar).
  const sessions = useBotStore((state) => state.sessions);
  const sessionsLoaded = useBotStore((state) => state.sessionsLoaded);
  const sessionsError = useBotStore((state) => state.sessionsError);
  const fetchSessions = useBotStore((state) => state.fetchSessions);
  const agents = useAgentStore((state) => state.agents).filter((a) => a.id !== 'archived');

  const todaySummary = useUsageStore((state) => state.todaySummary);
  const fetchTodaySummary = useUsageStore((state) => state.fetchTodaySummary);
  const setAttention = useSchedulerStore((state) => state.setAttention);

  const [selectedSession, setSelectedSession] = useState(null);
  const [activeTab, setActiveTab] = useState('live');
  const [filterTypes, setFilterTypes] = useState([]);
  const [filterAgents, setFilterAgents] = useState([]);
  const [activityFilter, setActivityFilter] = useState('non-idle'); // all | non-idle | running | active
  const [groupBy, setGroupBy] = useState('kind'); // 'agent', 'kind', or 'none'
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const refreshInFlightRef = useRef(false);

  // Deep-link support: ?sessionKey=<key> auto-selects and opens the session detail panel
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkSessionKey = searchParams.get('sessionKey');
  const deepLinkApplied = useRef(false);

  // Recent cron/heartbeat activity
  const [recentJobs, setRecentJobs] = useState([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadRecentActivity = useCallback(async () => {
    try {
      const jobs = await getCronJobs();
      // Auto-refresh can finish after navigation; ignore late local state writes.
      if (!isMountedRef.current) return;
      // Filter to jobs that have actually run, sorted by lastRunAt descending
      const ranJobs = (jobs || [])
        .filter((j) => j.lastRunAt)
        .sort((a, b) => new Date(b.lastRunAt) - new Date(a.lastRunAt));
      setRecentJobs(ranJobs);
      setJobsLoaded(true);
    } catch (err) {
      logger.error('Failed to load recent cron activity', err);
    }
  }, []);

  const loadSchedulerStats = useCallback(async () => {
    try {
      const data = await getSchedulerStats();
      if (data) {
        setAttention({ errors: data.errors ?? 0, missed: data.missed ?? 0 });
      }
    } catch (err) {
      logger.error('Failed to load scheduler stats', err);
    }
  }, [setAttention]);

  // Transform cron/heartbeat jobs into session-shaped objects so they can
  // be rendered by the same SessionRow component used for Active / Idle lists.
  // For cron jobs: use actual execution data from job.lastExecution (queried from cron sessions)
  // For heartbeats: use the agent's main session data (proxy is correct for heartbeats)
  const recentActivitySessions = useMemo(() => {
    // Build a lookup: agentId -> most-recent session for that agent (for heartbeat fallback)
    const agentSessionMap = new Map();
    sessions.forEach((s) => {
      if (!s.agent) return;
      const existing = agentSessionMap.get(s.agent);
      if (!existing || (s.updatedAt || 0) > (existing.updatedAt || 0)) {
        agentSessionMap.set(s.agent, s);
      }
    });

    return recentJobs.map((job) => {
      // For heartbeat jobs, pull from the agent's main session (correct approach)
      // For cron jobs, prefer lastExecution data (actual cron run), fallback to agent session
      // Match CronJobList: source: 'config' OR payload.kind OR jobId/id prefix OR name
      const jobIdentifier = job.jobId || job.id || '';
      const isHeartbeat =
        job.source === 'config' ||
        job.payload?.kind === 'heartbeat' ||
        String(jobIdentifier).startsWith('heartbeat-') ||
        /heartbeat/i.test(job.name || '');
      const agentSession = job.agentId ? agentSessionMap.get(job.agentId) : null;
      const executionData = job.lastExecution || {};

      // Map job status to a session-style status for the badge colour
      let status = 'idle';
      const jobStatus = (job.status || '').toLowerCase();
      if (jobStatus === 'running' || jobStatus === 'pending') {
        status = 'running';
      } else if (jobStatus === 'ok' || jobStatus === 'success' || jobStatus === 'completed') {
        status = 'completed';
      } else if (jobStatus === 'failed' || jobStatus === 'error') {
        status = 'failed';
      } else if (job.lastRunAt) {
        // If it ran recently (within 30 min), show as active
        const age = Date.now() - new Date(job.lastRunAt).getTime();
        if (age < 30 * 60 * 1000) status = 'active';
      }

      // For cron jobs: if execution data is unavailable (isolated sessions not accessible),
      // show a fallback message instead of zeros
      const executionUnavailable = !isHeartbeat && executionData.unavailable;

      // For heartbeat jobs, sessionKey may be missing from lastExecution; use agent's main session key
      // since heartbeat runs in the agent's main session (e.g. agent:cmo:main)
      // If agentSession is not found, construct the expected session key from agentId
      let sessionKey = executionData.sessionKey || null;
      if (!sessionKey && isHeartbeat && job.agentId) {
        // Try to get from agent session first, otherwise construct expected key
        // Special case: 'main' agent uses 'main' as session key, others use 'agent:{id}:main'
        sessionKey =
          agentSession?.key || (job.agentId === 'main' ? 'main' : `agent:${job.agentId}:main`);
      }

      return {
        id: `activity-${job.jobId || job.id || job.name}`,
        jobId: job.jobId || job.id || null,
        isDeletable: !isHeartbeat,
        key: sessionKey,
        // For cron sessions, prefer the session's own displayName so the label matches
        // what Live Sessions shows for the same run. Fall back to the job name.
        label: !isHeartbeat && executionData.sessionLabel ? executionData.sessionLabel : job.name,
        status,
        kind: isHeartbeat ? 'heartbeat' : 'cron',
        // sessionTarget may not be returned by cron.list; infer from payload.kind as fallback
        // (agentTurn jobs are always isolated — enforced by the API)
        sessionTarget: isHeartbeat
          ? null
          : job.sessionTarget ||
            job.payload?.session ||
            (job.payload?.kind === 'agentTurn' ? 'isolated' : 'main'),
        updatedAt: job.lastRunAt ? new Date(job.lastRunAt).getTime() : null,
        agent: job.agentId || null,
        // For cron: use actual execution model only (avoid showing agent config model as session model)
        // For heartbeat: use agent session data (heartbeat runs in the main session)
        model: isHeartbeat
          ? agentSession?.model || null
          : executionUnavailable
            ? null
            : executionData.model || null,
        // Token / cost / context: prefer execution data for cron, use agent session for heartbeat
        // If execution data is unavailable, use null instead of 0 to trigger fallback display
        contextTokens: isHeartbeat
          ? agentSession?.contextTokens || 0
          : executionUnavailable
            ? null
            : executionData.contextTokens || 0,
        totalTokensUsed: isHeartbeat
          ? agentSession?.totalTokensUsed || 0
          : executionUnavailable
            ? null
            : executionData.totalTokensUsed || 0,
        contextUsagePercent: isHeartbeat
          ? agentSession?.contextUsagePercent || 0
          : executionUnavailable
            ? null
            : executionData.contextUsagePercent || 0,
        inputTokens: isHeartbeat
          ? agentSession?.inputTokens || 0
          : executionUnavailable
            ? null
            : (executionData.inputTokens ?? null),
        outputTokens: isHeartbeat
          ? agentSession?.outputTokens || 0
          : executionUnavailable
            ? null
            : (executionData.outputTokens ?? null),
        cacheReadTokens: isHeartbeat
          ? agentSession?.cacheReadTokens || 0
          : executionUnavailable
            ? null
            : (executionData.cacheReadTokens ?? null),
        cacheWriteTokens: isHeartbeat
          ? agentSession?.cacheWriteTokens || 0
          : executionUnavailable
            ? null
            : (executionData.cacheWriteTokens ?? null),
        messageCost: isHeartbeat
          ? agentSession?.messageCost || 0
          : executionUnavailable
            ? null
            : (executionData.messageCost ?? null),
        todayTotalCost: isHeartbeat
          ? null
          : executionUnavailable
            ? null
            : (executionData.todayTotalCost ?? null),
        isCumulative: isHeartbeat ? false : executionData.isCumulative || false,
        lastMessage: isHeartbeat
          ? agentSession?.lastMessage || null
          : executionUnavailable
            ? `Status: ${executionData.status || 'unknown'} (Duration: ${executionData.durationMs ? Math.round(executionData.durationMs / 1000) + 's' : 'N/A'})`
            : executionData.lastMessage || null,
        lastMessageRole: isHeartbeat
          ? agentSession?.lastMessageRole || null
          : executionData.lastMessageRole || null,
      };
    });
  }, [recentJobs, sessions]);

  // Fetch full session data on mount (global poller only keeps lightweight counts)
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    loadRecentActivity();
  }, [loadRecentActivity]);

  useEffect(() => {
    fetchTodaySummary();
  }, [fetchTodaySummary]);

  useEffect(() => {
    loadSchedulerStats();
  }, [loadSchedulerStats]);

  // Auto-select session from ?sessionKey= deep link once sessions are loaded
  useEffect(() => {
    if (!deepLinkSessionKey || deepLinkApplied.current || !sessionsLoaded) return;
    const match = sessions.find((s) => s.key === deepLinkSessionKey);
    if (match) {
      deepLinkApplied.current = true;
      setSelectedSession(match);
      // Clear the query param so back-navigation works cleanly
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('sessionKey');
          return next;
        },
        { replace: true },
      );
    }
  }, [deepLinkSessionKey, sessions, sessionsLoaded, setSearchParams]);

  const refreshOverview = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;

    try {
      await Promise.all([
        fetchSessions(),
        loadRecentActivity(),
        fetchTodaySummary(),
        loadSchedulerStats(),
      ]);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [fetchSessions, loadRecentActivity, fetchTodaySummary, loadSchedulerStats]);

  const handleRefresh = async () => {
    await refreshOverview();
  };

  const handleSessionClick = useCallback((session) => {
    setSelectedSession(session);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedSession(null);
  }, []);

  // Filter helper: session passes if (no type filter OR kind matches) AND (no agent filter OR agent matches)
  const passesFilters = useCallback(
    (session) => {
      const sessionKind = session.kind || 'main';
      const sessionAgent = session.agent || session.agentId || null;
      const sessionStatus = (session.status || 'idle').toLowerCase();
      const typeMatch = filterTypes.length === 0 || filterTypes.includes(sessionKind);
      const agentMatch =
        filterAgents.length === 0 || (sessionAgent && filterAgents.includes(sessionAgent));
      const activityMatch =
        activityFilter === 'all'
          ? true
          : activityFilter === 'non-idle'
            ? sessionStatus !== 'idle'
            : sessionStatus === activityFilter;
      return typeMatch && agentMatch && activityMatch;
    },
    [filterTypes, filterAgents, activityFilter],
  );

  useEffect(() => {
    if (!autoRefreshEnabled) return undefined;

    const runIfVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshOverview();
      }
    };

    const interval = setInterval(runIfVisible, MONITOR_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', runIfVisible);
    runIfVisible();

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', runIfVisible);
    };
  }, [autoRefreshEnabled, refreshOverview]);

  // All live sessions (running + active + idle) passing current filters
  const liveSessions = useMemo(() => sessions.filter(passesFilters), [sessions, passesFilters]);
  const filteredRecentActivitySessions = useMemo(
    () => recentActivitySessions.filter(passesFilters),
    [recentActivitySessions, passesFilters],
  );

  const runningCount = liveSessions.filter((s) => s.status === 'running').length;
  const activeCount = liveSessions.filter((s) => s.status === 'active').length;
  const idleCount = liveSessions.filter((s) => s.status === 'idle').length;
  const hasActiveFilters =
    filterTypes.length > 0 || filterAgents.length > 0 || activityFilter !== 'all';

  if (!sessionsLoaded && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-dark-400">Loading overview...</p>
        </div>
      </div>
    );
  }

  if (sessionsError && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 mb-2">Error loading overview</p>
          <p className="text-dark-500 text-sm">{sessionsError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Agent Monitor"
        subtitle="Live view of all agent sessions, scheduled jobs, and recent activity"
        onRefresh={handleRefresh}
      />

      <div className="flex-1 p-2 sm:p-3 md:p-6 overflow-auto">
        <div className="space-y-4 md:space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3 md:gap-4">
            <StatCard
              label="Running"
              sublabel="Actively processing"
              value={runningCount}
              icon={PlayIcon}
              color="green"
            />
            <StatCard
              label="Active"
              sublabel="Within last 30 min"
              value={activeCount}
              icon={ClockIcon}
              color="blue"
            />
            <StatCard
              label="Idle"
              sublabel="No recent activity"
              value={idleCount}
              icon={UserGroupIcon}
              color="yellow"
            />
            <StatCard
              label="Input Tokens"
              sublabel="Today's sessions"
              value={formatTokens(todaySummary?.totalTokensInput)}
              icon={CircleStackIcon}
              color="blue"
            />
            <StatCard
              label="Output Tokens"
              sublabel="Today's sessions"
              value={formatTokens(todaySummary?.totalTokensOutput)}
              icon={CircleStackIcon}
              color="purple"
            />
            <StatCard
              label="Total Cost"
              sublabel="Today's sessions"
              value={todaySummary ? `$${Number(todaySummary.totalCostUsd).toFixed(4)}` : '—'}
              icon={CurrencyDollarIcon}
              color="primary"
            />
          </div>

          {/* Filter bar */}
          <div className="rounded-lg border border-dark-700 bg-dark-800/50 px-3 py-3 md:px-4">
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-x-6 md:gap-y-2">
              <div className="flex items-center gap-2">
                <FunnelIcon className="w-4 h-4 text-dark-500 flex-shrink-0" aria-hidden />
                <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">
                  Filters
                </span>
              </div>

              {/* Session kind pills - scrollable on mobile */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                <span className="text-xs font-medium text-dark-500 flex-shrink-0">Kind</span>
                {SESSION_TYPES.map(({ id, label }) => {
                  const isSelected = filterTypes.includes(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() =>
                        setFilterTypes((prev) =>
                          isSelected ? prev.filter((t) => t !== id) : [...prev, id],
                        )
                      }
                      className={classNames(
                        'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors flex-shrink-0',
                        isSelected
                          ? 'bg-primary-600 text-white border-primary-500'
                          : 'bg-dark-700 text-dark-300 border-dark-600 hover:bg-dark-600 hover:text-dark-100 hover:border-dark-500',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="hidden md:block w-px h-6 bg-dark-600 flex-shrink-0" aria-hidden />

              {/* Agent pills - scrollable on mobile */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                <span className="text-xs font-medium text-dark-500 flex-shrink-0">Agent</span>
                {agents.map((agent) => {
                  const isSelected = filterAgents.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() =>
                        setFilterAgents((prev) =>
                          isSelected ? prev.filter((a) => a !== agent.id) : [...prev, agent.id],
                        )
                      }
                      className={classNames(
                        'px-2.5 py-1 text-xs font-medium rounded-full border transition-colors flex-shrink-0',
                        isSelected
                          ? 'bg-primary-600 text-white border-primary-500'
                          : 'bg-dark-700 text-dark-300 border-dark-600 hover:bg-dark-600 hover:text-dark-100 hover:border-dark-500',
                      )}
                    >
                      {agent.name || agent.id}
                    </button>
                  );
                })}
              </div>

              {/* Clear — only visible when filters are active */}
              {hasActiveFilters && (
                <>
                  <div className="hidden md:block w-px h-6 bg-dark-600 flex-shrink-0" aria-hidden />
                  <button
                    type="button"
                    onClick={() => {
                      setFilterTypes([]);
                      setFilterAgents([]);
                      setActivityFilter('all');
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-dark-400 hover:text-dark-200 transition-colors rounded-lg hover:bg-dark-700 flex-shrink-0"
                  >
                    <XMarkIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Clear filters</span>
                    <span className="sm:hidden">Clear</span>
                  </button>
                </>
              )}

              {/* Grouping toggle — pinned to the right on md+ */}
              <div className="flex items-center gap-2 md:ml-auto">
                <span className="text-xs font-medium text-dark-500 flex-shrink-0">Activity</span>
                <div className="flex items-center gap-1 bg-dark-700 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setActivityFilter('all')}
                    className={classNames(
                      'px-2 py-1 text-xs font-medium rounded transition-colors',
                      activityFilter === 'all'
                        ? 'bg-primary-600 text-white'
                        : 'text-dark-400 hover:text-dark-200',
                    )}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('non-idle')}
                    className={classNames(
                      'px-2 py-1 text-xs font-medium rounded transition-colors',
                      activityFilter === 'non-idle'
                        ? 'bg-primary-600 text-white'
                        : 'text-dark-400 hover:text-dark-200',
                    )}
                  >
                    Non-idle
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('running')}
                    className={classNames(
                      'px-2 py-1 text-xs font-medium rounded transition-colors',
                      activityFilter === 'running'
                        ? 'bg-primary-600 text-white'
                        : 'text-dark-400 hover:text-dark-200',
                    )}
                  >
                    Running
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivityFilter('active')}
                    className={classNames(
                      'px-2 py-1 text-xs font-medium rounded transition-colors',
                      activityFilter === 'active'
                        ? 'bg-primary-600 text-white'
                        : 'text-dark-400 hover:text-dark-200',
                    )}
                  >
                    Active
                  </button>
                </div>

                <div className="hidden md:block w-px h-6 bg-dark-600 flex-shrink-0" aria-hidden />
                <Squares2X2Icon className="w-4 h-4 text-dark-500 flex-shrink-0" aria-hidden />
                <span className="text-xs font-medium text-dark-500 flex-shrink-0">Group by</span>
                <div className="flex items-center gap-1 bg-dark-700 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setGroupBy('agent')}
                    className={classNames(
                      'px-2 py-1 text-xs font-medium rounded transition-colors',
                      groupBy === 'agent'
                        ? 'bg-primary-600 text-white'
                        : 'text-dark-400 hover:text-dark-200',
                    )}
                  >
                    Agent
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupBy('kind')}
                    className={classNames(
                      'px-2 py-1 text-xs font-medium rounded transition-colors',
                      groupBy === 'kind'
                        ? 'bg-primary-600 text-white'
                        : 'text-dark-400 hover:text-dark-200',
                    )}
                  >
                    Kind
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupBy('none')}
                    className={classNames(
                      'px-2 py-1 text-xs font-medium rounded transition-colors',
                      groupBy === 'none'
                        ? 'bg-primary-600 text-white'
                        : 'text-dark-400 hover:text-dark-200',
                    )}
                  >
                    None
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setAutoRefreshEnabled((v) => !v)}
                  className={classNames(
                    'px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                    autoRefreshEnabled
                      ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-600/30'
                      : 'bg-dark-700 text-dark-400 border-dark-600 hover:text-dark-200 hover:border-dark-500',
                  )}
                  title={`Auto-refresh ${autoRefreshEnabled ? 'enabled' : 'disabled'} (${Math.round(
                    MONITOR_REFRESH_INTERVAL_MS / 1000,
                  )}s)`}
                >
                  Auto {autoRefreshEnabled ? 'On' : 'Off'}
                </button>
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-dark-800 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-2 px-3 md:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex-shrink-0 ${
                activeTab === 'live'
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-dark-400 hover:text-dark-200'
              }`}
            >
              Live Sessions
              {runningCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-green-500/20 text-green-400">
                  {runningCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`flex items-center gap-2 px-3 md:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex-shrink-0 ${
                activeTab === 'activity'
                  ? 'border-primary-500 text-primary-400'
                  : 'border-transparent text-dark-400 hover:text-dark-200'
              }`}
            >
              Recent Activity
              {filteredRecentActivitySessions.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-dark-700 text-dark-400">
                  {filteredRecentActivitySessions.length}
                </span>
              )}
            </button>
          </div>

          {/* Tab content */}
          {activeTab === 'live' && (
            <SessionList
              sessions={liveSessions}
              title="Sessions"
              emptyMessage={
                hasActiveFilters ? 'No sessions match the current filters' : 'No sessions'
              }
              onSessionClick={handleSessionClick}
              groupBy={groupBy}
            />
          )}

          {activeTab === 'activity' && (
            <div>
              {!jobsLoaded ? (
                <div className="flex items-center justify-center py-16">
                  <div className="text-center">
                    <div className="inline-block w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-sm text-dark-500">Loading recent activity...</p>
                  </div>
                </div>
              ) : (
                <SessionList
                  sessions={filteredRecentActivitySessions}
                  title="Recent Activity"
                  emptyMessage={
                    hasActiveFilters
                      ? 'No recent activity matches the current filters'
                      : 'No recent cron or heartbeat activity'
                  }
                  onSessionClick={handleSessionClick}
                  groupBy={groupBy}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Session Detail Panel */}
      <SessionDetailPanel
        isOpen={!!selectedSession}
        onClose={handleClosePanel}
        session={selectedSession}
        latestRunOnly
      />
    </div>
  );
}
