import { useState, useMemo } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import SessionRow from './SessionRow';
import { useAgentStore } from '../stores/agentStore';

export default function SessionList({
  sessions,
  title,
  emptyMessage = 'No sessions',
  onSessionClick,
  groupBy = 'agent',
}) {
  const getAgentById = useAgentStore((state) => state.getAgentById);
  // All groups start expanded
  const [collapsed, setCollapsed] = useState(new Set());

  const toggleGroup = (key) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const grouped = useMemo(() => {
    if (groupBy === 'none' || sessions.length === 0) {
      const sorted = [...sessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return [{ key: '__all__', label: null, sessions: sorted }];
    }

    const map = new Map();
    sessions.forEach((s) => {
      const agentId = s.agent || s.agentId || 'unknown';
      const kind = s.kind || 'main';
      const groupKey = groupBy === 'agent' ? agentId : kind;
      const agentObj = groupBy === 'agent' ? getAgentById(agentId) : null;
      const label =
        groupBy === 'agent'
          ? agentObj?.name || agentId.charAt(0).toUpperCase() + agentId.slice(1)
          : kind.charAt(0).toUpperCase() + kind.slice(1);

      if (!map.has(groupKey)) map.set(groupKey, { key: groupKey, label, sessions: [] });
      map.get(groupKey).sessions.push(s);
    });

    // Sort sessions within each group: most recent first
    map.forEach((group) => {
      group.sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    });

    // Sort groups by the most recent updatedAt within each group
    return [...map.values()].sort((a, b) => {
      const aLatest = Math.max(...a.sessions.map((s) => s.updatedAt || 0));
      const bLatest = Math.max(...b.sessions.map((s) => s.updatedAt || 0));
      return bLatest - aLatest;
    });
  }, [sessions, groupBy, getAgentById]);

  return (
    <div className="bg-dark-900 border border-dark-800 rounded-lg p-3 sm:p-4 md:p-6">
      <h3 className="text-base sm:text-lg font-semibold text-dark-100 mb-3 sm:mb-5">{title}</h3>

      {sessions.length === 0 ? (
        <p className="text-sm text-dark-500 text-center py-6 sm:py-8">{emptyMessage}</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ key, label, sessions: groupSessions }) => {
            const isCollapsed = collapsed.has(key);
            const runCount = groupSessions.filter((s) => s.status === 'running').length;
            const activeCount = groupSessions.filter((s) => s.status === 'active').length;
            const idleCount = groupSessions.filter(
              (s) => s.status !== 'running' && s.status !== 'active',
            ).length;

            return (
              <div key={key}>
                {/* Section header — only rendered when grouping is active */}
                {label && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    className="w-full flex items-center gap-2 mb-2 px-1 group"
                  >
                    {isCollapsed ? (
                      <ChevronRightIcon className="w-3.5 h-3.5 text-dark-500 flex-shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-3.5 h-3.5 text-dark-500 flex-shrink-0" />
                    )}
                    <span className="text-xs font-semibold uppercase tracking-widest text-dark-400 group-hover:text-dark-300 transition-colors">
                      {label}
                    </span>
                    <span className="text-xs text-dark-600 font-medium">
                      {groupSessions.length}
                    </span>
                    {/* Status summary dots */}
                    <div className="flex items-center gap-1.5 ml-1">
                      {runCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-green-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                          {runCount}
                        </span>
                      )}
                      {activeCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-blue-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                          {activeCount}
                        </span>
                      )}
                      {idleCount > 0 && (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-dark-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-dark-500" />
                          {idleCount}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 h-px bg-dark-800 ml-1" />
                  </button>
                )}

                {/* Session rows */}
                {!isCollapsed && (
                  <div className="space-y-2 sm:space-y-2.5">
                    {groupSessions.map((session) => (
                      <SessionRow key={session.id} session={session} onClick={onSessionClick} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
