import { useEffect, useRef } from 'react';
import { useActivityStore } from '../stores/activityStore';
import { formatDistanceToNow } from 'date-fns';

const REFRESH_INTERVAL_MS = 30_000;

const STATUS_CONFIG = {
  running: {
    dot: 'bg-green-400 animate-pulse',
    badge: 'bg-green-500/15 border-green-500/30 text-green-400',
    label: 'Running',
  },
  active: {
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
    label: 'Active',
  },
  idle: {
    dot: 'bg-dark-500',
    badge: 'bg-dark-700/50 border-dark-600/30 text-dark-400',
    label: 'Idle',
  },
};

// Human-readable label for session kind
const KIND_LABEL = {
  main: 'Main',
  cron: 'Cron',
  heartbeat: 'Heartbeat',
  subagent: 'Subagent',
  hook: 'Hook',
};

function AgentPill({ session }) {
  const cfg = STATUS_CONFIG[session.status] || STATUS_CONFIG.idle;
  const name = session.agentName || session.agent || 'Agent';
  const updatedMs = session.updatedAt;
  const timeAgo = updatedMs ? formatDistanceToNow(new Date(updatedMs), { addSuffix: true }) : null;
  const kindLabel = KIND_LABEL[session.kind] || session.kind || null;

  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${cfg.badge} shrink-0`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot}`} />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{name}</span>
          {kindLabel && (
            <span className="text-xs opacity-50 bg-black/20 px-1.5 py-0.5 rounded">
              {kindLabel}
            </span>
          )}
          <span className="text-xs opacity-60">{cfg.label}</span>
        </div>
        {session.lastMessage && (
          <p className="text-xs opacity-50 truncate max-w-[220px] mt-0.5">{session.lastMessage}</p>
        )}
        {timeAgo && <p className="text-xs opacity-40">{timeAgo}</p>}
      </div>
    </div>
  );
}

export default function LiveAgentStatus() {
  const { liveSessions, isLoadingSessions, fetchLiveSessions } = useActivityStore();
  const intervalRef = useRef(null);

  useEffect(() => {
    fetchLiveSessions();
    intervalRef.current = setInterval(fetchLiveSessions, REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchLiveSessions]);

  // Only show agents that are running or active (updated within 30 min)
  const visible = (liveSessions ?? []).filter(
    (s) => s.status === 'running' || s.status === 'active',
  );

  // Deduplicate by agent — show only the most recently updated session per agent
  const byAgent = new Map();
  for (const s of visible) {
    const key = s.agent || s.agentName || s.key;
    const existing = byAgent.get(key);
    if (!existing || (s.updatedAt || 0) > (existing.updatedAt || 0)) {
      byAgent.set(key, s);
    }
  }
  const agents = Array.from(byAgent.values());

  if (!isLoadingSessions && agents.length === 0) return null;

  return (
    <div className="px-3 md:px-6 py-2 bg-dark-900 border-b border-dark-800">
      <div className="max-w-5xl mx-auto">
        {isLoadingSessions && agents.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-dark-500 py-1">
            <span className="w-2 h-2 rounded-full bg-dark-600 animate-pulse" />
            Checking agent status...
          </div>
        ) : (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <span className="text-xs text-dark-500 shrink-0 mr-1">Live:</span>
            {agents.map((session) => (
              <AgentPill key={session.key || session.agent} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
