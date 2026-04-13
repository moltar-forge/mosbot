import { useEffect, useState, useCallback, useRef, useMemo, Fragment } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Dialog, Transition } from '@headlessui/react';
import {
  PlusIcon,
  XMarkIcon,
  PencilIcon,
  TrashIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import Header from '../components/Header';
import MarkdownRenderer from '../components/MarkdownRenderer';
import SessionDetailPanel from '../components/SessionDetailPanel';
import CronRunHistoryPanel from '../components/CronRunHistoryPanel';
import {
  api,
  getCronJobs,
  createCronJob,
  updateCronJob,
  deleteCronJob,
  setCronJobEnabled,
  triggerCronJob,
  getInstanceConfig,
} from '../api/client';
import { stripMarkdown } from '../utils/helpers';
import { useToastStore } from '../stores/toastStore';
import { useAgentStore } from '../stores/agentStore';
import { useSchedulerStore } from '../stores/schedulerStore';
import logger from '../utils/logger';

// Import the existing CronJobRow component styling logic
import {
  ClockIcon,
  CalendarDaysIcon,
  HeartIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';

// Copied and adapted from CronJobList.jsx
function formatSchedule(schedule, job) {
  if (!schedule && !job) return 'Unknown';
  if (schedule?.label) return `Every ${schedule.label}`;
  if (schedule?.kind === 'every') {
    const ms = schedule.everyMs;
    if (!ms) return 'Every ?';
    if (ms < 60000) return `Every ${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `Every ${Math.round(ms / 60000)}m`;
    if (ms < 86400000) {
      const h = Math.floor(ms / 3600000);
      const m = Math.round((ms % 3600000) / 60000);
      return m > 0 ? `Every ${h}h ${m}m` : `Every ${h}h`;
    }
    return `Every ${Math.round(ms / 86400000)}d`;
  }
  if (schedule?.kind === 'cron') {
    const expr = schedule.expr || '';
    const storedTz = schedule.tz || 'UTC';
    const browserTz = getBrowserTimezone();
    const browserTzAbbr = getTimezoneAbbr(browserTz);

    // Convert cron expression from stored timezone to browser timezone for display
    const displayExpr = convertCronTimezone(expr, storedTz, browserTz);

    return `Cron ${displayExpr} (${browserTzAbbr})`;
  }
  if (schedule?.kind === 'at') {
    const at = schedule.at;
    if (!at) return 'One-shot';
    try {
      return `At ${new Date(at).toLocaleString()}`;
    } catch {
      return `At ${at}`;
    }
  }
  if (job) {
    if (job.cron) {
      const storedTz = job.tz || job.timezone || 'UTC';
      const browserTz = getBrowserTimezone();
      const browserTzAbbr = getTimezoneAbbr(browserTz);

      // Convert cron expression from stored timezone to browser timezone for display
      const displayExpr = convertCronTimezone(job.cron, storedTz, browserTz);

      return `Cron ${displayExpr} (${browserTzAbbr})`;
    }
    if (job.expression) {
      const storedTz = job.tz || job.timezone || 'UTC';
      const browserTz = getBrowserTimezone();
      const browserTzAbbr = getTimezoneAbbr(browserTz);

      // Convert cron expression from stored timezone to browser timezone for display
      const displayExpr = convertCronTimezone(job.expression, storedTz, browserTz);

      return `Cron ${displayExpr} (${browserTzAbbr})`;
    }
    if (job.interval || job.every) {
      return `Every ${job.interval || job.every}`;
    }
  }
  return 'Unknown';
}

function formatRelativeTime(timestamp) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const absDiffMs = Math.abs(diffMs);
  const isFuture = diffMs < 0;

  const minutes = Math.floor(absDiffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return isFuture ? 'now' : 'just now';

  let label;
  if (minutes < 60) label = `${minutes}m`;
  else if (hours < 2) label = `${hours}h ${minutes % 60}m`;
  else if (hours < 24) label = `${hours}h`;
  else label = `${days}d ${hours % 24}h`;

  return isFuture ? `${label} from now` : `${label} ago`;
}

/** True if timestamp would display as "now" (next) or "just now" (last) — within 1 minute. */
function isWithinJustNowWindow(timestamp) {
  if (!timestamp) return false;
  const diffMs = new Date() - new Date(timestamp);
  return Math.abs(diffMs) < 60000;
}

/**
 * Human-readable label for a model id (e.g. openrouter/moonshotai/kimi-k2.5 → Kimi K2.5).
 * Used in dropdowns and cards; full id remains in option title for tooltip.
 */
function formatModel(model) {
  if (!model) return null;
  const modelValue =
    typeof model === 'string' ? model : model?.id || model?.model || model?.name || null;
  if (!modelValue || typeof modelValue !== 'string') return null;
  const modelPart = modelValue.includes('/') ? modelValue.split('/').pop() : modelValue;
  const lower = modelPart.toLowerCase();
  if (lower.includes('kimi-k2')) return 'Kimi K2.5';
  if (lower.includes('opus-4')) return 'Opus 4';
  if (lower.includes('sonnet-4')) return 'Sonnet 4.5';
  if (lower.includes('haiku-4')) return 'Haiku 4.5';
  if (lower.includes('gemini-2.5-flash-lite')) return 'Gemini Flash Lite';
  if (lower.includes('gemini-2.5-flash')) return 'Gemini 2.5 Flash';
  if (lower.includes('gemini-2.5')) return 'Gemini 2.5';
  if (lower.includes('gpt-5.4')) return 'GPT-5.4';
  if (lower.includes('gpt-5.3')) return lower.includes('codex') ? 'GPT-5.3 Codex' : 'GPT-5.3';
  if (lower.includes('gpt-5.2')) return 'GPT-5.2';
  if (lower.includes('gpt-5')) return 'GPT-5';
  if (lower.includes('deepseek-chat')) return 'DeepSeek Chat';
  if (lower.includes('deepseek')) return 'DeepSeek';
  return modelPart;
}

// Accept both ms-epoch integers and ISO strings for backwards compat with heartbeat jobs
function toMs(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  const ms = new Date(value).getTime();
  return isNaN(ms) ? null : ms;
}

// Check if a cron expression is currently within its active hours
function isCronCurrentlyActive(cronExpr, cronTz) {
  if (!cronExpr || typeof cronExpr !== 'string') return null;

  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const hour = parts[1];

  // Check if hour has a range restriction (e.g., 8-18)
  // Also check for step patterns with ranges (e.g., */15 8-18)
  if (!hour.includes('-')) return null; // No hour restriction, always active

  // Extract hour range - handle cases like "8-18" or "*/15 8-18" (but hour is just "8-18")
  const hourRange = hour.split('-');
  if (hourRange.length !== 2) return null;

  const startHour = parseInt(hourRange[0], 10);
  const endHour = parseInt(hourRange[1], 10);
  if (isNaN(startHour) || isNaN(endHour)) return null;

  // Get current hour in the cron's timezone (or browser timezone if not specified)
  try {
    const targetTz = cronTz || getBrowserTimezone();
    const now = new Date();

    // Get current hour in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: targetTz,
      hour: '2-digit',
      hour12: false,
    });

    const formatted = formatter.format(now);
    const match = formatted.match(/(\d+)/);
    if (!match) return null;

    const currentHour = parseInt(match[1], 10);

    // Check if current hour is within the range
    return currentHour >= startHour && currentHour <= endHour;
  } catch (error) {
    console.warn('Failed to check cron active status:', error);
    return null;
  }
}

function getStatusBadge(
  lastStatus,
  enabled,
  nextRunAtMs,
  lastRunAtMs,
  cronExpr = null,
  cronTz = null,
  isHeartbeat = false,
) {
  if (enabled === false) {
    return {
      classes: 'bg-dark-600/10 text-dark-400 border-dark-600/20',
      icon: XCircleIcon,
      label: 'disabled',
    };
  }
  if (enabled !== false && !nextRunAtMs && !lastRunAtMs && !isHeartbeat) {
    return {
      classes: 'bg-yellow-600/10 text-yellow-500 border-yellow-500/20',
      icon: ExclamationTriangleIcon,
      label: 'not scheduled',
    };
  }
  if (enabled !== false && nextRunAtMs && nextRunAtMs < Date.now()) {
    return {
      classes: 'bg-yellow-600/10 text-yellow-500 border-yellow-500/20',
      icon: ExclamationTriangleIcon,
      label: 'missed',
    };
  }
  if (lastStatus === 'error') {
    return {
      classes: 'bg-red-600/10 text-red-500 border-red-500/20',
      icon: ExclamationTriangleIcon,
      label: 'error',
    };
  }

  // Check if cron is currently within active hours
  // Use the cron expression in its stored timezone for accurate checking
  if (cronExpr) {
    const isActive = isCronCurrentlyActive(cronExpr, cronTz);

    if (isActive === false) {
      return {
        classes: 'bg-blue-600/10 text-blue-400 border-blue-500/20',
        icon: ClockIcon,
        label: 'off hours',
      };
    }
  }

  return {
    classes: 'bg-green-600/10 text-green-500 border-green-500/20',
    icon: CheckCircleIcon,
    label: 'enabled',
  };
}

function CronJobRow({
  job,
  onEdit,
  onDelete,
  onToggleEnabled,
  onTrigger,
  onJobClick,
  agents,
  models,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Prefer ms-epoch fields from state object; fall back to legacy top-level ISO strings
  // For lastRunAtMs: prefer lastExecution.updatedAt (actual session timestamp) over state.lastRunAtMs or lastRunAt
  // This ensures heartbeat jobs show the correct last run time from the session, not the stale heartbeat file timestamp
  const nextRunAtMs = toMs(job.state?.nextRunAtMs ?? job.nextRunAt);
  const lastRunAtMs = toMs(job.lastExecution?.updatedAt ?? job.state?.lastRunAtMs ?? job.lastRunAt);
  const lastStatus = job.state?.lastStatus ?? job.status ?? null;

  // Extract cron expression and timezone for active hours check
  const schedule = job.schedule || {};
  const cronExpr = schedule.kind === 'cron' ? schedule.expr : null;
  const cronTz = schedule.tz || null;

  const isHeartbeat = job.source === 'config' || job.payload?.kind === 'heartbeat';
  const badge = getStatusBadge(
    lastStatus,
    job.enabled,
    nextRunAtMs,
    lastRunAtMs,
    cronExpr,
    cronTz,
    isHeartbeat,
  );
  const BadgeIcon = badge.icon;

  const prompt =
    job.payload?.message || job.payload?.text || job.payload?.prompt || job.prompt || null;
  const agentId = job.agentId || null;

  // Get model: show if explicitly set in job payload (applies to all job types)
  const agent = agents.find((a) => a.id === agentId);
  const displayModelId = job.payload?.model || null;
  const displayModel = displayModelId ? models.find((m) => m.id === displayModelId) || null : null;

  const IconElement = isHeartbeat ? (
    job.agentEmoji ? (
      <span className="text-xl leading-none" role="img" aria-label={agentId}>
        {job.agentEmoji}
      </span>
    ) : (
      <HeartIcon className="w-5 h-5 text-pink-400" />
    )
  ) : (
    <CalendarDaysIcon className="w-5 h-5 text-dark-400" />
  );

  const handleCardClick = () => {
    if (onJobClick) {
      onJobClick(job);
    }
  };

  const runNowDisabled = isWithinJustNowWindow(nextRunAtMs) || isWithinJustNowWindow(lastRunAtMs);

  return (
    <div
      className="group p-4 bg-dark-800 border border-dark-700 rounded-lg hover:border-dark-600 transition-colors cursor-pointer"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
      aria-label={`View run history for ${job.name}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{IconElement}</div>

        <div className="flex-1 min-w-0">
          {/* Top line: Name (left), Badge + Actions (right) */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              <p className="text-base font-semibold text-dark-100">{job.name}</p>
              <span
                className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider rounded border ${
                  isHeartbeat
                    ? 'text-pink-400 bg-pink-500/10 border-pink-500/20'
                    : 'text-purple-400 bg-purple-500/10 border-purple-500/20'
                }`}
              >
                {isHeartbeat ? 'HEARTBEAT' : 'CRON'}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={`px-2.5 py-0.5 text-xs font-medium rounded-full border flex items-center gap-1 ${badge.classes}`}
              >
                <BadgeIcon className="w-3 h-3" />
                {badge.label}
              </span>
              {/* Action buttons - visible on hover on desktop, always visible on mobile */}
              <div
                className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 md:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Run Now button - only for cron jobs (heartbeats are not replayable); disabled when next/last is "just now" */}
                {job.enabled !== false && !isHeartbeat && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (runNowDisabled) return;
                      onTrigger(job);
                    }}
                    disabled={runNowDisabled}
                    className="p-1.5 text-dark-400 hover:text-green-400 hover:bg-dark-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-dark-400 disabled:hover:bg-transparent"
                    title={
                      runNowDisabled
                        ? 'Run now (unavailable when next or last is just now)'
                        : 'Run now'
                    }
                  >
                    <PlayIcon className="w-4 h-4" />
                  </button>
                )}
                {/* Enable/Disable button - only for gateway jobs */}
                {!isHeartbeat && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleEnabled(job);
                    }}
                    className="px-2.5 py-1 text-xs font-medium text-dark-300 hover:text-dark-100 bg-dark-700 hover:bg-dark-600 rounded transition-colors"
                    title={job.enabled ? 'Disable' : 'Enable'}
                  >
                    {job.enabled ? 'Disable' : 'Enable'}
                  </button>
                )}
                {/* Edit button - available for all jobs */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(job);
                  }}
                  className="p-1.5 text-dark-400 hover:text-primary-400 hover:bg-dark-700 rounded transition-colors"
                  title="Edit"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
                {/* Delete button - only for gateway jobs */}
                {!isHeartbeat && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(job);
                    }}
                    className="p-1.5 text-dark-400 hover:text-red-400 hover:bg-dark-700 rounded transition-colors"
                    title="Delete"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {job.description && (
            <p className="text-sm text-dark-400 mt-1 line-clamp-1 leading-relaxed">
              {job.description}
            </p>
          )}

          {/* Schedule info with agent and model inline */}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-dark-400 flex-wrap">
            <ClockIcon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium">{formatSchedule(job.schedule, job)}</span>
            {agentId && (
              <>
                <span className="text-dark-600">•</span>
                <span className="text-dark-500">Agent:</span>
                <span className="text-primary-400 font-medium">
                  {job.agentName || agent?.name || agentId}
                </span>
              </>
            )}
            {displayModel && (
              <>
                <span className="text-dark-600">•</span>
                <span className="text-dark-500">Model:</span>
                <span className="text-dark-300 font-mono text-[11px]">
                  {displayModel.alias || formatModel(displayModel.id)}
                  {job.payload?.model && (
                    <span className="ml-1 text-primary-400" title="Custom model override">
                      *
                    </span>
                  )}
                </span>
              </>
            )}
          </div>

          {/* Next/Last run timing */}
          {((job.enabled !== false && nextRunAtMs) || lastRunAtMs) && (
            <div className="flex items-center gap-3 mt-1.5 text-xs flex-wrap">
              {job.enabled !== false && nextRunAtMs && (
                <div className="flex items-center gap-1.5">
                  <span className="text-dark-500 font-medium uppercase tracking-wide">
                    {badge.label === 'missed' ? 'Missed' : 'Next'}
                  </span>
                  <span
                    className={
                      badge.label === 'missed' ? 'text-yellow-400 font-medium' : 'text-dark-300'
                    }
                  >
                    {formatRelativeTime(nextRunAtMs)}
                  </span>
                </div>
              )}
              {lastRunAtMs && (
                <>
                  {job.enabled !== false && nextRunAtMs && <span className="text-dark-600">•</span>}
                  <div className="flex items-center gap-1.5">
                    <span className="text-dark-500 font-medium uppercase tracking-wide">Last</span>
                    <span className="text-dark-300">{formatRelativeTime(lastRunAtMs)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Collapsible prompt preview */}
          {prompt && (
            <div className="mt-2">
              {!isExpanded ? (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-dark-400 line-clamp-1 flex-1">
                    {stripMarkdown(prompt)}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsExpanded(true);
                    }}
                    className="text-xs text-primary-400 hover:text-primary-300 font-medium whitespace-nowrap"
                  >
                    Show more
                  </button>
                </div>
              ) : (
                <div className="p-2.5 bg-dark-900/50 border border-dark-700/50 rounded">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] text-dark-500 uppercase tracking-wider font-medium">
                      Prompt
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(false);
                      }}
                      className="text-xs text-primary-400 hover:text-primary-300 font-medium"
                    >
                      Show less
                    </button>
                  </div>
                  <MarkdownRenderer
                    content={prompt}
                    size="sm"
                    className="text-dark-300 leading-relaxed"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Get browser's timezone (e.g., "Asia/Singapore")
 */
function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Get timezone display name (e.g., "Asia/Singapore", "UTC")
 * Returns the full IANA timezone name for better clarity
 */
function getTimezoneAbbr(timezone) {
  // Return the timezone as-is (it's already an IANA timezone like "Asia/Singapore")
  // This is clearer than trying to get abbreviations which may vary
  return timezone;
}

/**
 * Convert cron expression from one timezone to another.
 * Only converts if the expression has specific hour/minute values (not wildcards or complex patterns).
 * Returns the original expression if conversion is not possible or not needed.
 */
function convertCronTimezone(cronExpr, fromTz, toTz) {
  if (!cronExpr || typeof cronExpr !== 'string') return cronExpr;
  if (fromTz === toTz) return cronExpr;

  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return cronExpr;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Only convert if we have specific numeric values for hour and minute (not wildcards or ranges)
  const hasSpecificTime =
    minute !== '*' &&
    hour !== '*' &&
    !minute.includes('/') &&
    !hour.includes('/') &&
    !minute.includes('-') &&
    !hour.includes('-') &&
    !minute.includes(',') &&
    !hour.includes(',');

  if (!hasSpecificTime) return cronExpr;

  const m = parseInt(minute, 10);
  const h = parseInt(hour, 10);
  if (isNaN(m) || isNaN(h)) return cronExpr;

  try {
    // Use a fixed date (2024-01-15) to calculate timezone conversion
    // This avoids DST complications for most use cases
    const year = 2024;
    const mon = 1; // January
    const day = 15;

    // Create formatters for both timezones
    const fromFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: fromTz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const toFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: toTz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    // Find the UTC time that, when formatted in fromTz, gives us h:m
    // We'll try all possible UTC times and find the best match
    let bestMatch = null;
    let minDiff = Infinity;

    for (let utcHour = 0; utcHour < 24; utcHour++) {
      for (let utcMinute = 0; utcMinute < 60; utcMinute++) {
        const utcDate = new Date(
          `${year}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}T${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')}:00Z`,
        );

        // Format this UTC time in the source timezone
        const formattedInFrom = fromFormatter.format(utcDate);
        const fromMatch = formattedInFrom.match(/(\d+):(\d+)/);

        if (fromMatch) {
          const fmtHour = parseInt(fromMatch[1], 10);
          const fmtMinute = parseInt(fromMatch[2], 10);

          // Check if this matches our target time in fromTz
          const diff = Math.abs(fmtHour - h) * 60 + Math.abs(fmtMinute - m);

          if (diff < minDiff) {
            minDiff = diff;
            // Format the same UTC time in the target timezone
            const formattedInTo = toFormatter.format(utcDate);
            const toMatch = formattedInTo.match(/(\d+):(\d+)/);

            if (toMatch) {
              bestMatch = {
                hour: parseInt(toMatch[1], 10),
                minute: parseInt(toMatch[2], 10),
              };
            }
          }
        }
      }
    }

    if (bestMatch && minDiff === 0) {
      return `${bestMatch.minute} ${bestMatch.hour} ${dayOfMonth} ${month} ${dayOfWeek}`;
    }

    // If no exact match found, return original
    return cronExpr;
  } catch (error) {
    // If conversion fails, return original expression
    console.warn('Failed to convert cron timezone:', error);
    return cronExpr;
  }
}

// Helper function to parse common cron expressions
function parseCronExpression(expr) {
  if (!expr || typeof expr !== 'string') return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Daily patterns
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    if (!isNaN(h) && !isNaN(m)) {
      return `Runs daily at ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
  }

  // Every X minutes (e.g. */5, */15)
  if (
    minute.startsWith('*/') &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    const step = parseInt(minute.substring(2), 10);
    if (!isNaN(step) && step > 0) {
      return step === 1 ? 'Runs every minute' : `Runs every ${step} minutes`;
    }
  }

  // Hourly patterns (fixed minute, e.g. 15 = at :15 past every hour)
  if (
    minute !== '*' &&
    !minute.startsWith('*/') &&
    hour === '*' &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    const m = parseInt(minute, 10);
    if (!isNaN(m)) {
      return `Runs every hour at ${m} minutes past`;
    }
  }

  // Every X hours
  if (
    minute !== '*' &&
    hour.startsWith('*/') &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    const h = parseInt(hour.substring(2), 10);
    const m = parseInt(minute, 10);
    if (!isNaN(h) && !isNaN(m)) {
      return `Runs every ${h} hours at ${m} minutes past`;
    }
  }

  // Every X minutes within hour range (e.g. */15 8-18 * * *)
  if (
    minute.startsWith('*/') &&
    hour.includes('-') &&
    dayOfMonth === '*' &&
    month === '*' &&
    dayOfWeek === '*'
  ) {
    const step = parseInt(minute.substring(2), 10);
    const hourRange = hour.split('-');
    if (hourRange.length === 2 && !isNaN(step) && step > 0) {
      const startHour = parseInt(hourRange[0], 10);
      const endHour = parseInt(hourRange[1], 10);
      if (!isNaN(startHour) && !isNaN(endHour)) {
        const startTime = `${startHour.toString().padStart(2, '0')}:00`;
        const endTime = `${endHour.toString().padStart(2, '0')}:59`;
        return `Runs every ${step} minutes between ${startTime} and ${endTime}`;
      }
    }
  }

  // Weekly patterns
  if (minute !== '*' && hour !== '*' && dayOfMonth === '*' && month === '*' && dayOfWeek !== '*') {
    const days = {
      0: 'Sunday',
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
    };
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    const dayName = days[dayOfWeek];
    if (!isNaN(h) && !isNaN(m) && dayName) {
      return `Runs every ${dayName} at ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }
  }

  return null;
}

function CronJobModal({
  isOpen,
  onClose,
  job,
  onSave,
  timezone = 'UTC',
  jobs = [],
  models = [],
  loadingModels = false,
}) {
  const agents = useAgentStore((state) => state.agents);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    scheduleKind: 'cron',
    cronExpr: '',
    everyInterval: '30',
    everyUnit: 'm',
    prompt: '',
    agentId: '',
    model: '',
    sessionTarget: 'isolated', // isolated required for agentTurn (default for new jobs)
    wakeMode: 'now', // 'now' or 'next-heartbeat'
    deliveryMode: 'announce', // 'announce' or 'none'
    deliveryChannel: '', // optional channel override for announce
    deliveryTo: '', // optional recipient override for announce
    enabled: true,
    // Heartbeat-specific fields
    target: 'last',
    ackMaxChars: '200',
    activeHoursEnabled: false,
    activeHoursStart: '08:00',
    activeHoursEnd: '22:00',
    activeHoursTz: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobIdCopied, setJobIdCopied] = useState(false);
  const showToast = useToastStore((state) => state.showToast);
  const defaultModelSetForCreateRef = useRef(false);

  // Derive known channel/to values from existing jobs for autocomplete hints
  const knownChannels = useMemo(
    () => [...new Set(jobs.map((j) => j.delivery?.channel).filter(Boolean))],
    [jobs],
  );
  const knownTos = useMemo(
    () => [...new Set(jobs.map((j) => j.delivery?.to).filter(Boolean))],
    [jobs],
  );

  // Get browser timezone for display and conversion
  const browserTimezone = getBrowserTimezone();
  const browserTzAbbr = getTimezoneAbbr(browserTimezone);

  // Auto-select default model (e.g. Kimi K2.5) when opening create form
  useEffect(() => {
    if (!isOpen) {
      defaultModelSetForCreateRef.current = false;
      return;
    }
    if (job || models.length === 0 || defaultModelSetForCreateRef.current) return;
    const defaultId =
      models.find((m) => m.isDefault)?.id ?? models.find((m) => /kimi-k2/i.test(m.id))?.id;
    if (defaultId) {
      defaultModelSetForCreateRef.current = true;
      setFormData((prev) => ({ ...prev, model: defaultId }));
    }
  }, [isOpen, job, models]);

  useEffect(() => {
    if (job) {
      const schedule = job.schedule || {};

      // Parse schedule: for heartbeats, schedule might be in different format
      let scheduleKind = schedule.kind || 'cron';
      let everyInterval = '30';
      let everyUnit = 'm';

      if (schedule.kind === 'every' && schedule.everyMs) {
        everyInterval = Math.floor(schedule.everyMs / 60000).toString();
        everyUnit = 'm';
      } else if (schedule.label) {
        // Parse label like "30m", "1h", etc.
        const match = schedule.label.match(/^(\d+)([smh])$/);
        if (match) {
          everyInterval = match[1];
          everyUnit = match[2];
          scheduleKind = 'every';
        }
      }

      // Extract prompt from official format (text for systemEvent, message for agentTurn)
      const promptText =
        job.payload?.message || job.payload?.text || job.payload?.prompt || job.prompt || '';
      // Extract session target from top-level or payload
      const sessionTargetValue = job.sessionTarget || job.payload?.session || 'main';

      // Convert cron expression from stored timezone (UTC) to browser timezone for editing
      const storedCronExpr = schedule.expr || '';
      const storedTz = schedule.tz || timezone || 'UTC';
      const displayCronExpr =
        scheduleKind === 'cron' && storedCronExpr
          ? convertCronTimezone(storedCronExpr, storedTz, browserTimezone)
          : storedCronExpr;

      setFormData({
        name: job.name || '',
        description: job.description || '',
        scheduleKind,
        cronExpr: displayCronExpr,
        everyInterval,
        everyUnit,
        prompt: promptText,
        agentId: job.agentId || '',
        model: job.payload?.model || '',
        sessionTarget: sessionTargetValue,
        wakeMode: job.wakeMode || 'now',
        deliveryMode: job.delivery?.mode || 'announce',
        deliveryChannel: job.delivery?.channel || '',
        deliveryTo: job.delivery?.to || '',
        enabled: job.enabled !== false,
        target: job.payload?.target || 'last', // For both heartbeat and cron jobs
        ackMaxChars: job.payload?.ackMaxChars?.toString() || '200',
        activeHoursEnabled: !!job.payload?.activeHours,
        activeHoursStart: job.payload?.activeHours?.start || '08:00',
        activeHoursEnd: job.payload?.activeHours?.end || '22:00',
        activeHoursTz: job.payload?.activeHours?.timezone || '',
      });
    } else {
      setFormData({
        name: '',
        description: '',
        scheduleKind: 'cron',
        cronExpr: '',
        everyInterval: '30',
        everyUnit: 'm',
        prompt: '',
        agentId: agents.length > 0 ? agents[0].id : '',
        model: '',
        sessionTarget: 'isolated',
        wakeMode: 'now',
        deliveryMode: 'announce',
        deliveryChannel: '',
        deliveryTo: '',
        enabled: true,
        target: 'last', // Default target for cron jobs
        ackMaxChars: '200',
        activeHoursEnabled: false,
        activeHoursStart: '08:00',
        activeHoursEnd: '22:00',
        activeHoursTz: '',
      });
    }
  }, [job, isOpen, agents, browserTimezone, timezone]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const isHeartbeat = job?.source === 'config' || job?.payload?.kind === 'heartbeat';
    const isIsolated = formData.sessionTarget === 'isolated';

    // Client-side validation for schema rules
    if (!isHeartbeat && !formData.agentId) {
      showToast('Agent is required', 'error');
      return;
    }
    if (!isHeartbeat && isIsolated && !formData.model.trim()) {
      showToast('AI Model is required for isolated (agentTurn) sessions', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        enabled: formData.enabled,
        agentId: formData.agentId || undefined,
        wakeMode: formData.wakeMode || 'now',
        schedule: {},
        sessionTarget: formData.sessionTarget || 'isolated',
        payload: {},
      };

      if (formData.scheduleKind === 'cron') {
        // Convert cron expression from browser timezone back to UTC for storage
        const browserCronExpr = formData.cronExpr.trim();
        const utcCronExpr = convertCronTimezone(
          browserCronExpr,
          browserTimezone,
          timezone || 'UTC',
        );

        payload.schedule = {
          kind: 'cron',
          expr: utcCronExpr,
          tz: timezone || 'UTC',
        };
      } else if (formData.scheduleKind === 'every') {
        const intervalValue = parseInt(formData.everyInterval, 10);
        const multiplier =
          formData.everyUnit === 's' ? 1000 : formData.everyUnit === 'm' ? 60000 : 3600000;
        payload.schedule = {
          kind: 'every',
          everyMs: intervalValue * multiplier,
          label: `${intervalValue}${formData.everyUnit}`,
        };
      }

      if (isHeartbeat) {
        payload.payload.kind = 'heartbeat';
        payload.payload.target = formData.target;
        const ackMaxChars = parseInt(formData.ackMaxChars, 10);
        if (!isNaN(ackMaxChars) && ackMaxChars > 0) {
          payload.payload.ackMaxChars = ackMaxChars;
        }
        if (formData.prompt.trim()) {
          payload.payload.prompt = formData.prompt.trim();
          payload.payload.message = formData.prompt.trim();
        }
        payload.payload.session = formData.sessionTarget;
        // Allow model override for heartbeat jobs (optional)
        if (formData.model.trim()) {
          payload.payload.model = formData.model.trim();
        }
        // Active hours — null removes the restriction; object sets it
        if (formData.activeHoursEnabled) {
          payload.payload.activeHours = {
            start: formData.activeHoursStart,
            end: formData.activeHoursEnd,
            ...(formData.activeHoursTz.trim() ? { timezone: formData.activeHoursTz.trim() } : {}),
          };
        } else {
          payload.payload.activeHours = null;
        }
      } else if (isIsolated) {
        // isolated → agentTurn (schema rule: sessionTarget=isolated required for agentTurn)
        payload.payload.kind = 'agentTurn';
        payload.payload.message = formData.prompt.trim();
        payload.payload.model = formData.model.trim();
      } else {
        // main → systemEvent
        payload.payload.kind = 'systemEvent';
        payload.payload.text = formData.prompt.trim();
        // Allow model override for main session jobs (optional)
        if (formData.model.trim()) {
          payload.payload.model = formData.model.trim();
        }
      }

      // Delivery config
      if (formData.deliveryMode) {
        payload.delivery = { mode: formData.deliveryMode };
        if (formData.deliveryChannel.trim()) {
          payload.delivery.channel = formData.deliveryChannel.trim();
        }
        if (formData.deliveryTo.trim()) {
          payload.delivery.to = formData.deliveryTo.trim();
        }
      }

      await onSave(payload);
      onClose();
      showToast(
        job ? 'Scheduled job updated successfully' : 'Scheduled job created successfully',
        'success',
      );
    } catch (error) {
      logger.error('Failed to save scheduled job', error);
      showToast(error.response?.data?.error?.message || 'Failed to save scheduled job', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditingHeartbeat = !!(job?.source === 'config' || job?.payload?.kind === 'heartbeat');
  const cronPreview =
    formData.scheduleKind === 'cron' ? parseCronExpression(formData.cronExpr) : null;

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/75" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-lg bg-dark-900 border border-dark-700 shadow-xl transition-all">
                {/* Modal Header with X button and Enabled toggle */}
                <div className="flex items-center justify-between p-6 pb-4 border-b border-dark-700">
                  <Dialog.Title className="text-lg font-semibold text-dark-100">
                    {job ? 'Edit Scheduled Job' : 'Create Scheduled Job'}
                  </Dialog.Title>
                  <div className="flex items-center gap-3">
                    {/* Enabled Toggle Switch */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-sm text-dark-300 font-medium">Enabled</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={formData.enabled}
                        onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          formData.enabled ? 'bg-primary-600' : 'bg-dark-700'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            formData.enabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </label>
                    {/* Close Button */}
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-1 text-dark-400 hover:text-dark-100 hover:bg-dark-800 rounded transition-colors"
                    >
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Daily workspace review"
                    />
                    {/* Job ID — displayed only when editing an existing job */}
                    {job && (job.jobId || job.id) && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-dark-500 font-medium shrink-0">Job ID</span>
                        <code className="text-xs text-dark-300 font-mono bg-dark-800 border border-dark-700 px-2 py-0.5 rounded flex-1 truncate">
                          {job.jobId || job.id}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(job.jobId || job.id);
                            setJobIdCopied(true);
                            setTimeout(() => setJobIdCopied(false), 1500);
                          }}
                          className="p-1 text-dark-500 hover:text-dark-200 transition-colors shrink-0"
                          title="Copy job ID"
                        >
                          {jobIdCopied ? (
                            <span className="text-[10px] text-green-400 font-medium">Copied</span>
                          ) : (
                            <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Optional description"
                    />
                  </div>

                  {/* Schedule Section */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-dark-300 mb-1">
                        Schedule Type *
                      </label>
                      {isEditingHeartbeat ? (
                        <div className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-400 text-sm">
                          Interval{' '}
                          <span className="text-dark-600 ml-1">
                            (heartbeat jobs only support interval schedules)
                          </span>
                        </div>
                      ) : (
                        <select
                          value={formData.scheduleKind}
                          onChange={(e) =>
                            setFormData({ ...formData, scheduleKind: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="cron">Cron Expression</option>
                          <option value="every">Interval</option>
                        </select>
                      )}
                    </div>

                    {!isEditingHeartbeat && formData.scheduleKind === 'cron' && (
                      <div>
                        <label className="block text-sm font-medium text-dark-300 mb-1">
                          Cron Expression *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.cronExpr}
                          onChange={(e) => setFormData({ ...formData, cronExpr: e.target.value })}
                          className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
                          placeholder="0 9 * * *"
                        />
                        {cronPreview ? (
                          <p className="text-xs text-primary-400 mt-1.5 font-medium">
                            {cronPreview}
                            <span className="text-dark-500 font-normal ml-1">
                              ({browserTzAbbr})
                            </span>
                          </p>
                        ) : formData.cronExpr.trim() ? (
                          <p className="text-xs text-dark-500 mt-1">
                            {`"${formData.cronExpr.trim()}" (${browserTzAbbr})`}
                          </p>
                        ) : (
                          <p className="text-xs text-dark-500 mt-1">
                            {`Example: "0 9 * * *" = daily at 9:00 AM (${browserTzAbbr})`}
                          </p>
                        )}
                      </div>
                    )}

                    {formData.scheduleKind === 'every' && (
                      <div>
                        <label className="block text-sm font-medium text-dark-300 mb-1">
                          Run Every *
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            required
                            min="1"
                            value={formData.everyInterval}
                            onChange={(e) =>
                              setFormData({ ...formData, everyInterval: e.target.value })
                            }
                            className="flex-1 px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                          <select
                            value={formData.everyUnit}
                            onChange={(e) =>
                              setFormData({ ...formData, everyUnit: e.target.value })
                            }
                            className="px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="s">seconds</option>
                            <option value="m">minutes</option>
                            <option value="h">hours</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-1">
                      Prompt/Message
                    </label>
                    <textarea
                      value={formData.prompt}
                      onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                      rows={5}
                      className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Message to send when this job runs"
                    />
                  </div>

                  {!isEditingHeartbeat && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-1">
                            Agent *
                          </label>
                          <select
                            required
                            value={formData.agentId}
                            onChange={(e) => setFormData({ ...formData, agentId: e.target.value })}
                            className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            {agents.length === 0 && <option value="">No agents available</option>}
                            {agents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.icon} {agent.name} ({agent.id.toUpperCase()})
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-dark-500 mt-1">
                            Which agent will run this job
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-1">
                            Session *
                          </label>
                          <select
                            value={formData.sessionTarget}
                            onChange={(e) =>
                              setFormData({ ...formData, sessionTarget: e.target.value })
                            }
                            className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="isolated">
                              Isolated — fresh context each run (agentTurn)
                            </option>
                            <option value="main">
                              Main — persistent shared context (systemEvent)
                            </option>
                          </select>
                          <p className="text-xs text-dark-500 mt-1">
                            Isolated: new session per run, requires model. Main: reuses agent&apos;s
                            persistent session
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-1">
                            AI Model {formData.sessionTarget === 'isolated' ? '*' : '(optional)'}
                          </label>
                          <select
                            value={formData.model}
                            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                            disabled={loadingModels}
                            className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
                          >
                            <option value="">
                              {formData.sessionTarget === 'isolated'
                                ? 'Select a model...'
                                : 'Default (use agent main session model)'}
                            </option>
                            {models.map((m) => (
                              <option key={m.id} value={m.id} title={m.id}>
                                {m.alias || formatModel(m.id)} ({m.id})
                                {m.isDefault ? ' — default' : ''}
                              </option>
                            ))}
                            {formData.model && !models.some((m) => m.id === formData.model) && (
                              <option value={formData.model} title={formData.model}>
                                Current: {formData.model}
                              </option>
                            )}
                          </select>
                          <p className="text-xs text-dark-500 mt-1">
                            {formData.sessionTarget === 'isolated'
                              ? 'Required: isolated sessions use a fresh context with this model'
                              : 'Optional: override the model for this job (uses agent\u2019s main session model if not set)'}
                          </p>
                          {loadingModels && (
                            <p className="text-xs text-dark-500 mt-1">Loading models...</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-1">
                            Wake Mode *
                          </label>
                          <select
                            value={formData.wakeMode}
                            onChange={(e) => setFormData({ ...formData, wakeMode: e.target.value })}
                            className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="now">Now — run immediately when scheduled</option>
                            <option value="next-heartbeat">
                              Next heartbeat — wait for agent heartbeat
                            </option>
                          </select>
                          <p className="text-xs text-dark-500 mt-1">
                            Now: fires at the scheduled time. Next heartbeat: defers to the
                            agent&apos;s next heartbeat cycle
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-dark-300 mb-1">
                          Delivery
                        </label>
                        <select
                          value={formData.deliveryMode}
                          onChange={(e) =>
                            setFormData({ ...formData, deliveryMode: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        >
                          <option value="announce">
                            Announce — send summary to configured channels
                          </option>
                          <option value="none">None — run silently without notifications</option>
                        </select>
                        {formData.deliveryMode === 'announce' && (
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-dark-400 mb-1">
                                Channel <span className="text-dark-500">(optional override)</span>
                              </label>
                              <input
                                type="text"
                                list="delivery-channel-list"
                                value={formData.deliveryChannel}
                                onChange={(e) =>
                                  setFormData({ ...formData, deliveryChannel: e.target.value })
                                }
                                placeholder="Leave blank to use default"
                                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 placeholder-dark-600 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              />
                              {knownChannels.length > 0 && (
                                <datalist id="delivery-channel-list">
                                  {knownChannels.map((c) => (
                                    <option key={c} value={c} />
                                  ))}
                                </datalist>
                              )}
                              <p className="text-xs text-dark-500 mt-1">
                                {knownChannels.length > 0
                                  ? 'Override the default channel — suggestions from existing jobs'
                                  : 'Override the default announce channel'}
                              </p>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-dark-400 mb-1">
                                To <span className="text-dark-500">(optional override)</span>
                              </label>
                              <input
                                type="text"
                                list="delivery-to-list"
                                value={formData.deliveryTo}
                                onChange={(e) =>
                                  setFormData({ ...formData, deliveryTo: e.target.value })
                                }
                                placeholder="Leave blank to use default"
                                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 placeholder-dark-600 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              />
                              {knownTos.length > 0 && (
                                <datalist id="delivery-to-list">
                                  {knownTos.map((t) => (
                                    <option key={t} value={t} />
                                  ))}
                                </datalist>
                              )}
                              <p className="text-xs text-dark-500 mt-1">
                                {knownTos.length > 0
                                  ? 'Override the default recipient — suggestions from existing jobs'
                                  : 'Override the default announce recipient'}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {/* Heartbeat-specific fields */}
                  {(job?.source === 'config' || job?.payload?.kind === 'heartbeat') && (
                    <div className="pt-4 border-t border-dark-700">
                      <h4 className="text-sm font-semibold text-dark-200 mb-3">
                        Heartbeat Configuration
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-1">
                            Target
                          </label>
                          <select
                            value={formData.target}
                            onChange={(e) => setFormData({ ...formData, target: e.target.value })}
                            className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="last">Last (most recent session)</option>
                            <option value="main">Main (primary session)</option>
                          </select>
                          <p className="text-xs text-dark-500 mt-1">
                            Which session to target for heartbeat checks
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-1">
                            AI Model (optional)
                          </label>
                          <select
                            value={formData.model}
                            onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                            disabled={loadingModels}
                            className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
                          >
                            <option value="">Default (use agent main session model)</option>
                            {models.map((m) => (
                              <option key={m.id} value={m.id} title={m.id}>
                                {m.alias || formatModel(m.id)} ({m.id})
                                {m.isDefault ? ' — default' : ''}
                              </option>
                            ))}
                            {formData.model && !models.some((m) => m.id === formData.model) && (
                              <option value={formData.model} title={formData.model}>
                                Current: {formData.model}
                              </option>
                            )}
                          </select>
                          <p className="text-xs text-dark-500 mt-1">
                            Optional: override the model for heartbeat responses
                          </p>
                          {loadingModels && (
                            <p className="text-xs text-dark-500 mt-1">Loading models...</p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-dark-300 mb-1">
                            Acknowledgment Max Chars
                          </label>
                          <input
                            type="number"
                            min="1"
                            max="1000"
                            value={formData.ackMaxChars}
                            onChange={(e) =>
                              setFormData({ ...formData, ackMaxChars: e.target.value })
                            }
                            className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="200"
                          />
                          <p className="text-xs text-dark-500 mt-1">
                            Maximum characters for heartbeat acknowledgment
                          </p>
                        </div>
                      </div>

                      {/* Active Hours */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-dark-300">
                            Active Hours{' '}
                            <span className="text-dark-500 font-normal">(optional)</span>
                          </label>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={formData.activeHoursEnabled}
                            onClick={() =>
                              setFormData({
                                ...formData,
                                activeHoursEnabled: !formData.activeHoursEnabled,
                              })
                            }
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              formData.activeHoursEnabled ? 'bg-primary-600' : 'bg-dark-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                formData.activeHoursEnabled ? 'translate-x-5' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                        <p className="text-xs text-dark-500 mb-3">
                          Restrict heartbeats to a time window. Outside the window, runs are
                          skipped.
                        </p>
                        {formData.activeHoursEnabled && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-dark-400 mb-1">
                                Start (HH:MM)
                              </label>
                              <input
                                type="time"
                                value={formData.activeHoursStart}
                                onChange={(e) =>
                                  setFormData({ ...formData, activeHoursStart: e.target.value })
                                }
                                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-dark-400 mb-1">
                                End (HH:MM)
                              </label>
                              <input
                                type="time"
                                value={formData.activeHoursEnd}
                                onChange={(e) =>
                                  setFormData({ ...formData, activeHoursEnd: e.target.value })
                                }
                                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-dark-400 mb-1">
                                Timezone <span className="text-dark-500">(optional)</span>
                              </label>
                              <input
                                type="text"
                                value={formData.activeHoursTz}
                                onChange={(e) =>
                                  setFormData({ ...formData, activeHoursTz: e.target.value })
                                }
                                placeholder="Asia/Singapore"
                                className="w-full px-3 py-2 bg-dark-800 border border-dark-700 rounded text-dark-100 placeholder-dark-600 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                              />
                            </div>
                            <p className="text-xs text-dark-500 md:col-span-3">
                              Uses your configured user timezone if left blank. Start is inclusive;
                              end is exclusive (use 24:00 for end-of-day).
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-4 border-t border-dark-700">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-medium text-dark-300 hover:text-dark-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSubmitting ? 'Saving...' : job ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

function DeleteConfirmModal({ isOpen, onClose, job, onConfirm }) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/75" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-lg bg-dark-900 border border-dark-700 p-6 shadow-xl transition-all">
                <Dialog.Title className="text-lg font-semibold text-dark-100 mb-2">
                  Delete Scheduled Job
                </Dialog.Title>
                <p className="text-sm text-dark-400 mb-4">
                  Are you sure you want to delete &quot;
                  <span className="font-medium text-dark-200">{job?.name}</span>&quot;? This action
                  cannot be undone.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={isDeleting}
                    className="px-4 py-2 text-sm font-medium text-dark-300 hover:text-dark-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={isDeleting}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}

export default function CronJobs() {
  const agents = useAgentStore((state) => state.agents);
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // Track background refresh
  const [filter, setFilter] = useState('all'); // all, enabled, disabled, gateway, config, agent-{id}
  const [editingJob, setEditingJob] = useState(null);
  const [deletingJob, setDeletingJob] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [instanceTimezone, setInstanceTimezone] = useState('UTC');
  const [models, setModels] = useState([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const showToast = useToastStore((state) => state.showToast);
  const {
    setAttention,
    cachedJobs,
    setCachedJobs,
    lastFetchedAt,
    isRefreshing: storeIsRefreshing,
    setRefreshing: setStoreRefreshing,
  } = useSchedulerStore((state) => ({
    setAttention: state.setAttention,
    cachedJobs: state.cachedJobs,
    setCachedJobs: state.setCachedJobs,
    lastFetchedAt: state.lastFetchedAt,
    isRefreshing: state.isRefreshing,
    setRefreshing: state.setRefreshing,
  }));

  // Deep-link support: ?jobId=<id> highlights/opens the matching job
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkJobId = searchParams.get('jobId');
  const deepLinkApplied = useRef(false);
  const isInitialMount = useRef(true);

  const loadJobs = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) {
          setIsLoading(true);
          setStoreRefreshing(true);
        } else {
          setIsRefreshing(true);
          setStoreRefreshing(true);
        }
        const data = await getCronJobs();
        setJobs(data || []);
        // Update cache for next visit (this also updates lastFetchedAt)
        setCachedJobs(data || []);
      } catch (err) {
        logger.error('Failed to fetch cron jobs', err);
        // Only show error toast if this was the initial load (not a background refresh)
        if (showLoading) {
          showToast('Failed to load cron jobs', 'error');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
        setStoreRefreshing(false);
      }
    },
    [showToast, setCachedJobs, setStoreRefreshing],
  );

  // Refresh handler for manual refresh button
  const handleRefresh = useCallback(() => {
    loadJobs(true);
  }, [loadJobs]);

  // On mount: show cached data immediately, then refresh in background
  useEffect(() => {
    // Load instance config (doesn't need caching)
    getInstanceConfig()
      .then((config) => {
        if (config?.timezone) setInstanceTimezone(config.timezone);
      })
      .catch(() => {
        /* keep default UTC */
      });

    // If we have cached jobs, show them immediately
    if (cachedJobs && cachedJobs.length > 0) {
      setJobs(cachedJobs);
      setIsLoading(false);
      // Refresh in background (don't show loading spinner)
      loadJobs(false);
    } else {
      // No cache - show loading skeleton and fetch
      loadJobs(true);
    }
    isInitialMount.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount - cachedJobs checked inside

  // Fetch models once on mount (used by CronJobRow and CronRunHistoryPanel)
  useEffect(() => {
    let cancelled = false;
    setLoadingModels(true);
    api
      .get('/models')
      .then((res) => {
        if (!cancelled) {
          setModels(res.data?.data?.models ?? []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          logger.error('Failed to fetch models', err);
          setModels([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingModels(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-highlight job from ?jobId= deep link once jobs are loaded
  useEffect(() => {
    if (!deepLinkJobId || deepLinkApplied.current || isLoading || jobs.length === 0) return;
    const match = jobs.find((j) => (j.jobId || j.id) === deepLinkJobId);
    if (match) {
      deepLinkApplied.current = true;
      setSelectedJob(match);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('jobId');
          return next;
        },
        { replace: true },
      );
    }
  }, [deepLinkJobId, jobs, isLoading, setSearchParams]);

  const handleCreate = async (payload) => {
    await createCronJob(payload);
    await loadJobs(true); // Show loading for mutations
  };

  const handleUpdate = async (payload) => {
    if (!editingJob) return;
    await updateCronJob(editingJob.jobId || editingJob.id, payload);
    await loadJobs(true); // Show loading for mutations
  };

  const handleDelete = async () => {
    if (!deletingJob) return;
    try {
      await deleteCronJob(deletingJob.jobId || deletingJob.id);
      showToast('Scheduled job deleted successfully', 'success');
      await loadJobs(true); // Show loading for mutations
    } catch (error) {
      logger.error('Failed to delete cron job', error);
      showToast(error.response?.data?.error?.message || 'Failed to delete scheduled job', 'error');
    }
  };

  const handleToggleEnabled = async (job) => {
    try {
      await setCronJobEnabled(job.jobId || job.id, !job.enabled);
      showToast(`Scheduled job ${job.enabled ? 'disabled' : 'enabled'} successfully`, 'success');
      await loadJobs(true); // Show loading for mutations
    } catch (error) {
      logger.error('Failed to toggle cron job', error);
      showToast(error.response?.data?.error?.message || 'Failed to toggle scheduled job', 'error');
    }
  };

  const handleTrigger = async (job) => {
    try {
      await triggerCronJob(job.jobId || job.id);
      showToast(`"${job.name}" triggered — it will run within the next 60 seconds`, 'success');
      await loadJobs(true); // Show loading for mutations
    } catch (error) {
      logger.error('Failed to trigger cron job', error);
      showToast(error.response?.data?.error?.message || 'Failed to trigger scheduled job', 'error');
    }
  };

  const filteredJobs = jobs.filter((job) => {
    if (filter === 'enabled') return job.enabled !== false;
    if (filter === 'disabled') return job.enabled === false;
    if (filter === 'gateway') return job.source === 'gateway';
    if (filter === 'config') return job.source === 'config';
    if (filter.startsWith('agent-')) {
      const agentId = filter.replace('agent-', '');
      return job.agentId === agentId;
    }
    return true;
  });

  // Separate jobs into groups
  const scheduledJobs = filteredJobs.filter((j) => j.source === 'gateway');
  const heartbeatJobs = filteredJobs.filter((j) => j.source === 'config');

  // Calculate stats — use ms-epoch fields from state; fall back to legacy ISO strings
  const disabledCount = jobs.filter((j) => j.enabled === false).length;
  const nowMs = Date.now();
  const errorCount = jobs.filter((j) => (j.state?.lastStatus ?? j.status) === 'error').length;
  const missedCount = jobs.filter((j) => {
    const nxt = toMs(j.state?.nextRunAtMs ?? j.nextRunAt);
    return j.enabled !== false && nxt && nxt < nowMs;
  }).length;

  // Separate enabled jobs into active and off-hours
  const enabledJobs = jobs.filter((j) => j.enabled !== false);
  let activeCount = 0;
  let offHoursCount = 0;

  enabledJobs.forEach((job) => {
    const schedule = job.schedule || {};
    const cronExpr = schedule.kind === 'cron' ? schedule.expr : null;
    const cronTz = schedule.tz || null;

    if (cronExpr) {
      const isActive = isCronCurrentlyActive(cronExpr, cronTz);
      if (isActive === false) {
        offHoursCount++;
      } else {
        activeCount++;
      }
    } else {
      // No hour restrictions, consider it active
      activeCount++;
    }
  });

  const enabledCount = activeCount + offHoursCount; // Total enabled for backward compatibility

  // Find next upcoming job (only future runs, ignore missed)
  const nextJob = jobs
    .filter((j) => {
      const nxt = toMs(j.state?.nextRunAtMs ?? j.nextRunAt);
      return j.enabled !== false && nxt && nxt > nowMs;
    })
    .sort((a, b) => {
      const aMs = toMs(a.state?.nextRunAtMs ?? a.nextRunAt);
      const bMs = toMs(b.state?.nextRunAtMs ?? b.nextRunAt);
      return aMs - bMs;
    })[0];

  // Count jobs per agent
  const agentJobCounts = agents.reduce((acc, agent) => {
    acc[agent.id] = jobs.filter((j) => j.agentId === agent.id).length;
    return acc;
  }, {});

  // Sync attention counts to store for sidebar badges (only when done loading to avoid flashing 0)
  useEffect(() => {
    if (!isLoading) {
      setAttention({ errors: errorCount, missed: missedCount });
    }
  }, [isLoading, errorCount, missedCount, setAttention]);

  const FilterChip = ({ label, value, count }) => {
    const isActive = filter === value;
    return (
      <button
        onClick={() => setFilter(value)}
        className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
          isActive
            ? 'bg-primary-600 text-white'
            : 'bg-dark-800 text-dark-300 hover:bg-dark-700 hover:text-dark-100'
        }`}
      >
        {label} {count !== undefined && `(${count})`}
      </button>
    );
  };

  // Helper: convert job to session-shaped object for SessionDetailPanel
  const toSessionShape = (job) => {
    if (!job) return null;

    const isHeartbeat = job.source === 'config' || job.payload?.kind === 'heartbeat';

    // Resolve session target: agentTurn is always isolated; systemEvent defaults to main
    const resolvedSessionTarget = isHeartbeat
      ? null
      : job.sessionTarget ||
        job.payload?.session ||
        (job.payload?.kind === 'agentTurn' ? 'isolated' : 'main');

    // For gateway cron: use lastExecution.sessionKey (set by API enrichment).
    // The API sets this to agent:{id}:main for sessionTarget=main jobs, and
    // agent:{id}:cron:{jobId} for isolated jobs.
    // For heartbeat fallback: API enrichment resolves the correct key, but if
    // lastExecution is absent we try the v2026.2.19+ isolated key format first,
    // then fall back to the older :heartbeat key.
    const sessionKey =
      job.lastExecution?.sessionKey ??
      (isHeartbeat && job.agentId ? `agent:${job.agentId}:isolated` : null);

    // For main-session jobs the messages come from the agent's shared persistent session.
    // Use kind 'main' so the panel renders a flat list rather than grouping by time gap
    // (gap-based grouping would create spurious "runs" for normal conversation pauses).
    const isMainSession = resolvedSessionTarget === 'main';

    return {
      key: sessionKey,
      label: job.name,
      agent: job.agentId,
      status: job.status || (job.enabled !== false ? 'idle' : 'completed'),
      kind: isHeartbeat ? 'heartbeat' : isMainSession ? 'main' : 'cron',
      sessionTarget: resolvedSessionTarget,
      model: job.lastExecution?.model || job.payload?.model || job.agentModel || null,
      inputTokens: job.lastExecution?.inputTokens ?? null,
      outputTokens: job.lastExecution?.outputTokens ?? null,
      cacheReadTokens: job.lastExecution?.cacheReadTokens ?? null,
      cacheWriteTokens: job.lastExecution?.cacheWriteTokens ?? null,
      messageCost: job.lastExecution?.messageCost ?? null,
      todayTotalCost: job.lastExecution?.todayTotalCost ?? null,
      isCumulative: job.lastExecution?.isCumulative || false,
      contextTokens: job.lastExecution?.contextTokens || 0,
      totalTokensUsed: job.lastExecution?.totalTokensUsed || 0,
      contextUsagePercent: job.lastExecution?.contextUsagePercent || 0,
      // Prefer lastExecution.updatedAt (actual session timestamp) over state.lastRunAtMs or lastRunAt
      // This ensures heartbeat jobs show the correct last run time from the session
      updatedAt: toMs(job.lastExecution?.updatedAt ?? job.state?.lastRunAtMs ?? job.lastRunAt),
    };
  };

  // Skeleton component for stats cards - matches exact dimensions
  const StatsCardSkeleton = () => (
    <div className="p-4 bg-dark-800 border border-dark-700 rounded-lg">
      <div className="h-3 w-24 bg-dark-700 rounded mb-1 animate-pulse"></div>
      {/* Match text-2xl font-bold height - typically ~36px with line-height */}
      <div className="h-9 w-16 bg-dark-700 rounded animate-pulse"></div>
    </div>
  );

  // Skeleton component for job cards - matches exact structure and spacing
  // Uses minimum height that matches a real card without description/prompt
  const JobCardSkeleton = () => (
    <div className="p-4 bg-dark-800 border border-dark-700 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="w-5 h-5 bg-dark-700 rounded animate-pulse flex-shrink-0 mt-0.5"></div>
        <div className="flex-1 min-w-0">
          {/* Top line: Name (left), Badge + Actions (right) */}
          <div className="flex items-center justify-between gap-3 mb-0">
            <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
              {/* text-base font-semibold = 1rem font-size, ~1.125rem line-height */}
              <div className="h-[1.125rem] w-32 bg-dark-700 rounded animate-pulse"></div>
              {/* Badge: text-[10px] with py-0.5 = ~18px total height */}
              <div className="h-[18px] w-16 bg-dark-700 rounded animate-pulse"></div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Badge: px-2.5 py-0.5 text-xs = ~24px height */}
              <div className="h-6 w-20 bg-dark-700 rounded-full animate-pulse"></div>
              {/* Action buttons container - show placeholder for buttons */}
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 bg-dark-700 rounded animate-pulse"></div>
                <div className="h-6 w-14 bg-dark-700 rounded animate-pulse"></div>
                <div className="h-6 w-6 bg-dark-700 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
          {/* Schedule info - always present */}
          <div className="flex items-center gap-2 mt-1.5">
            {/* ClockIcon w-3.5 h-3.5 */}
            <div className="h-3.5 w-3.5 bg-dark-700 rounded animate-pulse flex-shrink-0"></div>
            {/* text-xs = 0.75rem, line-height ~1rem */}
            <div className="h-3 w-40 bg-dark-700 rounded animate-pulse"></div>
          </div>
          {/* Next/Last run timing - always present */}
          <div className="flex items-center gap-3 mt-1.5">
            <div className="h-3 w-24 bg-dark-700 rounded animate-pulse"></div>
            <div className="h-3 w-20 bg-dark-700 rounded animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Scheduler"
        subtitle="Scheduled jobs, intervals, and heartbeats"
        onRefresh={handleRefresh}
        isRefreshing={isLoading || isRefreshing || storeIsRefreshing}
        lastFetchedAt={lastFetchedAt}
      />

      <div className="flex-1 p-3 md:p-6 overflow-auto">
        <div className="space-y-6">
          {/* Summary Stats Bar */}
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
              <StatsCardSkeleton />
            </div>
          ) : (
            jobs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 bg-dark-800 border border-dark-700 rounded-lg">
                  <p className="text-xs text-dark-500 uppercase tracking-wide font-medium mb-1">
                    Total Jobs
                  </p>
                  <p className="text-2xl font-bold text-dark-100">{jobs.length}</p>
                </div>
                <div className="p-4 bg-dark-800 border border-dark-700 rounded-lg">
                  <p className="text-xs text-dark-500 uppercase tracking-wide font-medium mb-1">
                    Active / Off Hours / Disabled
                  </p>
                  <p className="text-2xl font-bold text-dark-100">
                    <span className="text-green-400">{activeCount}</span>
                    <span className="text-dark-600 mx-1">/</span>
                    <span className={offHoursCount > 0 ? 'text-blue-400' : 'text-dark-500'}>
                      {offHoursCount}
                    </span>
                    <span className="text-dark-600 mx-1">/</span>
                    <span className="text-dark-500">{disabledCount}</span>
                  </p>
                </div>
                <div className="p-4 bg-dark-800 border border-dark-700 rounded-lg">
                  <p className="text-xs text-dark-500 uppercase tracking-wide font-medium mb-1">
                    Errors / Missed
                  </p>
                  <p className="text-2xl font-bold text-dark-100">
                    <span className={errorCount > 0 ? 'text-red-400' : 'text-dark-500'}>
                      {errorCount}
                    </span>
                    <span className="text-dark-600 mx-2">/</span>
                    <span className={missedCount > 0 ? 'text-yellow-400' : 'text-dark-500'}>
                      {missedCount}
                    </span>
                  </p>
                </div>
                <div className="p-4 bg-dark-800 border border-dark-700 rounded-lg">
                  <p className="text-xs text-dark-500 uppercase tracking-wide font-medium mb-1">
                    Next Run
                  </p>
                  {nextJob ? (
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-dark-200 line-clamp-1">
                        {nextJob.name}
                      </p>
                      <p className="text-xs text-primary-400 font-medium">
                        {formatRelativeTime(toMs(nextJob.state?.nextRunAtMs ?? nextJob.nextRunAt))}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-dark-500">No upcoming jobs</p>
                  )}
                </div>
              </div>
            )
          )}

          {/* Filter Chips */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <FilterChip label="All" value="all" count={jobs.length} />
              <FilterChip label="Enabled" value="enabled" count={enabledCount} />
              <FilterChip label="Disabled" value="disabled" count={disabledCount} />
              <FilterChip label="Scheduled" value="gateway" count={scheduledJobs.length} />
              <FilterChip label="Heartbeats" value="config" count={heartbeatJobs.length} />
              {agents.map((agent) => (
                <FilterChip
                  key={agent.id}
                  label={`${agent.icon} ${agent.name || agent.id}`}
                  value={`agent-${agent.id}`}
                  count={agentJobCounts[agent.id] || 0}
                />
              ))}
            </div>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              Create Job
            </button>
          </div>

          {/* Jobs List */}
          {isLoading ? (
            <div className="space-y-8">
              {/* Skeleton for Cron (Gateway) Section */}
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-4 w-32 bg-dark-700 rounded animate-pulse"></div>
                  <div className="h-5 w-8 bg-dark-700 rounded animate-pulse"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <JobCardSkeleton />
                  <JobCardSkeleton />
                </div>
              </section>
              {/* Skeleton for Heartbeat (Config) Section */}
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-4 w-40 bg-dark-700 rounded animate-pulse"></div>
                  <div className="h-5 w-8 bg-dark-700 rounded animate-pulse"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <JobCardSkeleton />
                </div>
              </section>
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-12">
              <CalendarDaysIcon className="w-12 h-12 text-dark-600 mx-auto mb-3" />
              <p className="text-dark-400">No scheduled jobs found</p>
              {filter !== 'all' && (
                <button
                  onClick={() => setFilter('all')}
                  className="text-sm text-primary-400 hover:text-primary-300 mt-2"
                >
                  Clear filter
                </button>
              )}
            </div>
          ) : filter === 'all' ? (
            /* Sectioned view: Cron (Gateway) vs Heartbeat (Config) */
            <div className="space-y-8">
              {/* When both sections are empty, show a single prominent empty state */}
              {scheduledJobs.length === 0 && heartbeatJobs.length === 0 ? (
                <section className="text-center py-10 px-4 bg-dark-800/50 border border-dark-700 rounded-lg">
                  <CalendarDaysIcon className="w-12 h-12 text-dark-500 mx-auto mb-3" />
                  <p className="text-dark-300 font-medium mb-1">No scheduled jobs yet</p>
                  <p className="text-sm text-dark-500 max-w-md mx-auto mb-4">
                    Create a gateway job with the button above, or configure agent heartbeats in
                    OpenClaw to see them here.
                  </p>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded transition-colors"
                  >
                    <PlusIcon className="w-4 h-4" />
                    Create Job
                  </button>
                </section>
              ) : null}

              {/* Cron (Gateway) Section */}
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-dark-200 uppercase tracking-wide">
                    Cron (Gateway)
                  </h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-dark-700 text-dark-400 rounded">
                    {scheduledJobs.length}
                  </span>
                </div>
                {scheduledJobs.length === 0 ? (
                  <p className="text-sm text-dark-500 py-4">
                    No gateway-scheduled jobs. Use &quot;Create Job&quot; above to add one.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {scheduledJobs.map((job) => (
                      <CronJobRow
                        key={job.jobId || job.id || job.name}
                        job={job}
                        agents={agents}
                        models={models}
                        onEdit={setEditingJob}
                        onDelete={setDeletingJob}
                        onToggleEnabled={handleToggleEnabled}
                        onTrigger={handleTrigger}
                        onJobClick={setSelectedJob}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Heartbeat (Config) Section */}
              <section>
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-sm font-semibold text-dark-200 uppercase tracking-wide">
                    Heartbeat (Config)
                  </h3>
                  <span className="px-2 py-0.5 text-xs font-medium bg-dark-700 text-dark-400 rounded">
                    {heartbeatJobs.length}
                  </span>
                </div>
                {heartbeatJobs.length === 0 ? (
                  <p className="text-sm text-dark-500 py-4">
                    No agent heartbeats. Configure{' '}
                    <code className="text-dark-400 bg-dark-800 px-1 rounded">heartbeat</code> in
                    OpenClaw agent config to see them here.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {heartbeatJobs.map((job) => (
                      <CronJobRow
                        key={job.jobId || job.id || job.name}
                        job={job}
                        agents={agents}
                        models={models}
                        onEdit={setEditingJob}
                        onDelete={setDeletingJob}
                        onToggleEnabled={handleToggleEnabled}
                        onTrigger={handleTrigger}
                        onJobClick={setSelectedJob}
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            /* Filtered view: single section based on filter */
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold text-dark-200 uppercase tracking-wide">
                  {filter === 'gateway'
                    ? 'Cron (Gateway)'
                    : filter === 'config'
                      ? 'Heartbeat (Config)'
                      : 'Jobs'}
                </h3>
                <span className="px-2 py-0.5 text-xs font-medium bg-dark-700 text-dark-400 rounded">
                  {filteredJobs.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredJobs.map((job) => (
                  <CronJobRow
                    key={job.jobId || job.id || job.name}
                    job={job}
                    agents={agents}
                    models={models}
                    onEdit={setEditingJob}
                    onDelete={setDeletingJob}
                    onToggleEnabled={handleToggleEnabled}
                    onTrigger={handleTrigger}
                    onJobClick={setSelectedJob}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      <CronJobModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        job={null}
        onSave={handleCreate}
        timezone={instanceTimezone}
        jobs={jobs}
        models={models}
        loadingModels={loadingModels}
      />

      <CronJobModal
        isOpen={!!editingJob}
        onClose={() => setEditingJob(null)}
        job={editingJob}
        onSave={handleUpdate}
        timezone={instanceTimezone}
        models={models}
        loadingModels={loadingModels}
        jobs={jobs}
      />

      <DeleteConfirmModal
        isOpen={!!deletingJob}
        onClose={() => setDeletingJob(null)}
        job={deletingJob}
        onConfirm={handleDelete}
      />

      {/* Run history panels — isolated cron jobs use the workspace-backed run history panel;
          heartbeat and main-session jobs use the gateway session panel */}
      {(() => {
        if (!selectedJob) return null;
        const shape = toSessionShape(selectedJob);
        const isIsolatedCron = shape?.kind === 'cron';
        return isIsolatedCron ? (
          <CronRunHistoryPanel
            isOpen={!!selectedJob}
            onClose={() => setSelectedJob(null)}
            job={selectedJob}
            models={models}
          />
        ) : (
          <SessionDetailPanel
            isOpen={!!selectedJob}
            onClose={() => setSelectedJob(null)}
            session={shape}
          />
        );
      })()}
    </div>
  );
}
