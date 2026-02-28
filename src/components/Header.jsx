import { useState } from 'react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import { useTaskStore } from '../stores/taskStore';
import { useMobileNav } from './MobileNavContext';

export default function Header({
  title,
  subtitle,
  onCreateTask,
  onRefresh,
  searchValue,
  onSearchChange,
  children,
  isRefreshing: externalIsRefreshing, // Optional: override from external source
  lastFetchedAt: externalLastFetchedAt, // Optional: override from external source
}) {
  const onOpenNav = useMobileNav();
  const { isRefreshing: taskStoreIsRefreshing, lastFetchedAt: taskStoreLastFetchedAt } =
    useTaskStore();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  // Use external props if provided, otherwise fall back to taskStore
  const isRefreshing = externalIsRefreshing ?? taskStoreIsRefreshing;
  const lastFetchedAt = externalLastFetchedAt ?? taskStoreLastFetchedAt;

  const handleRefresh = async () => {
    if (isManualRefreshing || isRefreshing) return;

    setIsManualRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const getLastUpdatedText = () => {
    if (!lastFetchedAt) return '';

    const seconds = Math.floor((Date.now() - lastFetchedAt) / 1000);
    if (seconds < 60) return 'Just now';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-4 py-3 md:px-6 md:py-4 bg-dark-900 border-b border-dark-800">
      <div className="flex items-center gap-3">
        {/* Mobile Hamburger */}
        {onOpenNav && (
          <button
            type="button"
            className="md:hidden p-2 -ml-2 rounded-lg text-dark-300 hover:text-dark-100 hover:bg-dark-800 transition-colors"
            onClick={onOpenNav}
          >
            <span className="sr-only">Open sidebar</span>
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
        )}

        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold text-dark-100 truncate">{title}</h1>
            {lastFetchedAt && (
              <span className="hidden sm:inline text-xs text-dark-500 flex-shrink-0">
                Updated {getLastUpdatedText()}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-dark-500 line-clamp-2 md:line-clamp-1">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        {/* Search */}
        {onSearchChange && (
          <div className="relative flex-1 sm:flex-initial order-2 sm:order-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-500" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchValue || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-4 py-2 w-full sm:w-48 md:w-64 bg-dark-800 border border-dark-700 rounded-lg text-dark-100 placeholder-dark-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 sm:gap-3 w-full sm:w-auto order-1 sm:order-2">
          {/* Custom Children (e.g., Edit button) */}
          {children}

          {/* Create Task Button - appears before refresh on mobile */}
          {onCreateTask && (
            <button
              onClick={onCreateTask}
              className="btn-primary flex items-center justify-center gap-2 flex-1 sm:flex-initial min-w-0"
            >
              <PlusIcon className="w-5 h-5 flex-shrink-0" />
              <span className="whitespace-nowrap">New Task</span>
            </button>
          )}

          {/* Refresh Button - always on the right */}
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={isManualRefreshing || isRefreshing}
              className="p-2 rounded-lg bg-dark-800 border border-dark-700 text-dark-300 hover:text-dark-100 hover:border-dark-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed group flex-shrink-0"
              title="Refresh"
            >
              <ArrowPathIcon
                className={`w-5 h-5 transition-transform duration-500 ${
                  isManualRefreshing || isRefreshing ? 'animate-spin' : 'group-hover:rotate-180'
                }`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
