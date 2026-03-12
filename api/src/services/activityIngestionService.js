/**
 * activityIngestionService.js
 *
 * Background pollers that ingest events into activity_logs from:
 *   1. session_usage — cron runs and heartbeat runs
 *
 * Ingestion is idempotent via dedupe_key.
 */

const pool = require('../db/pool');
const config = require('../config');
const logger = require('../utils/logger');
const { recordActivityLogEvent } = require('./activityLogService');

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse session key into components.
 * Formats:
 *   agent:<agentId>:cron:<jobId>:run:<runId>   → cron run
 *   agent:<agentId>:isolated:run:<runId>        → heartbeat run (new format)
 *   agent:<agentId>:heartbeat:run:<runId>       → heartbeat run (legacy)
 *   agent:<agentId>:main                        → main session (skip)
 */
function parseSessionKey(key) {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split(':');
  if (parts[0] !== 'agent' || parts.length < 3) return null;

  const agentId = parts[1];

  if (parts[2] === 'cron' && parts.length >= 6 && parts[4] === 'run') {
    return { kind: 'cron', agentId, jobId: parts[3], runId: parts[5] };
  }

  if (parts[2] === 'isolated' && parts[3] === 'run') {
    return { kind: 'heartbeat', agentId, jobId: null, runId: parts[4] };
  }

  if (parts[2] === 'heartbeat' && parts[3] === 'run') {
    return { kind: 'heartbeat', agentId, jobId: null, runId: parts[4] };
  }

  return null;
}

/**
 * Classify a heartbeat session as needing attention.
 * We check the session messages via the OpenClaw sessions API.
 * Returns true if the last assistant message is not HEARTBEAT_OK or the session timed out.
 */
async function heartbeatNeedsAttention(sessionKey) {
  try {
    const { makeOpenClawRequest } = require('./openclawWorkspaceClient');
    const encoded = encodeURIComponent(sessionKey);
    const data = await makeOpenClawRequest('GET', `/sessions/${encoded}/messages?limit=5`);
    const messages = data?.messages || [];

    if (messages.length === 0) return true;

    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!lastAssistant) return true;

    const content =
      typeof lastAssistant.content === 'string'
        ? lastAssistant.content
        : JSON.stringify(lastAssistant.content || '');

    return !content.includes('HEARTBEAT_OK');
  } catch (_err) {
    // If we can't fetch messages, treat as needing attention
    return true;
  }
}

// ============================================================================
// Poller 1: Cron/Heartbeat runs from session_usage
// ============================================================================

let _lastCronIngestionAt = null;

async function ingestCronAndHeartbeatRuns() {
  try {
    // Fetch session_usage rows that look like cron or heartbeat runs and haven't
    // been ingested yet (no matching dedupe_key in activity_logs).
    // Use DISTINCT ON to ensure we only process each session_key once, even if
    // there are duplicate rows in session_usage (e.g., from updates).
    const result = await pool.query(`
      SELECT DISTINCT ON (su.session_key)
        su.session_key,
        su.agent_key,
        su.job_id,
        su.label,
        su.model,
        su.tokens_input,
        su.tokens_output,
        su.cost_usd,
        su.first_seen_at,
        su.last_updated_at
      FROM session_usage su
      WHERE (
        su.session_key LIKE 'agent:%:cron:%:run:%'
        OR su.session_key LIKE 'agent:%:isolated:run:%'
        OR su.session_key LIKE 'agent:%:heartbeat:run:%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM activity_logs al
        WHERE al.dedupe_key = 'session:' || su.session_key
      )
      ORDER BY su.session_key, su.first_seen_at ASC
      LIMIT 200
    `);

    if (result.rows.length === 0) return;

    logger.debug(`[activityIngestion] Ingesting ${result.rows.length} cron/heartbeat run(s)`);

    for (const row of result.rows) {
      const parsed = parseSessionKey(row.session_key);
      if (!parsed) continue;

      const dedupeKey = `session:${row.session_key}`;
      const agentId = row.agent_key || parsed.agentId;

      if (parsed.kind === 'cron') {
        await recordActivityLogEvent({
          event_type: 'cron_run',
          source: 'cron',
          severity: 'info',
          title: row.label || `Cron run: ${parsed.jobId}`,
          description: `Cron job "${parsed.jobId}" executed by agent "${agentId}"`,
          agent_id: agentId,
          job_id: parsed.jobId,
          session_key: row.session_key,
          run_id: parsed.runId,
          meta: {
            model: row.model,
            tokens_input: row.tokens_input,
            tokens_output: row.tokens_output,
            cost_usd: row.cost_usd,
            label: row.label,
          },
          dedupe_key: dedupeKey,
          timestamp: row.first_seen_at,
        }).catch(() => null);
      } else if (parsed.kind === 'heartbeat') {
        const needsAttention = await heartbeatNeedsAttention(row.session_key);
        const eventType = needsAttention ? 'heartbeat_attention' : 'heartbeat_run';
        const severity = needsAttention ? 'attention' : 'info';

        await recordActivityLogEvent({
          event_type: eventType,
          source: 'heartbeat',
          severity,
          title: needsAttention
            ? `Heartbeat attention required: ${agentId}`
            : `Heartbeat OK: ${agentId}`,
          description: needsAttention
            ? `Agent "${agentId}" heartbeat did not return HEARTBEAT_OK or timed out`
            : `Agent "${agentId}" heartbeat completed successfully`,
          agent_id: agentId,
          session_key: row.session_key,
          run_id: parsed.runId,
          meta: {
            model: row.model,
            tokens_input: row.tokens_input,
            tokens_output: row.tokens_output,
            cost_usd: row.cost_usd,
          },
          dedupe_key: dedupeKey,
          timestamp: row.first_seen_at,
        }).catch(() => null);
      }
    }

    _lastCronIngestionAt = new Date();
  } catch (err) {
    logger.error('[activityIngestion] Cron/heartbeat ingestion error', {
      error: err.message,
    });
  }
}

// ============================================================================
// Poller start functions
// ============================================================================

let _cronTimer = null;

/**
 * Start the cron/heartbeat ingestion poller.
 * @param {number} intervalMs - How often to poll (default: 2 minutes)
 */
function startCronIngestionPoller(intervalMs = 2 * 60 * 1000) {
  if (_cronTimer) return;
  logger.info('[activityIngestion] Starting cron/heartbeat ingestion poller', {
    intervalMs,
  });
  ingestCronAndHeartbeatRuns();
  _cronTimer = setInterval(ingestCronAndHeartbeatRuns, intervalMs);
}

/**
 * Start all activity ingestion pollers.
 */
function startActivityIngestionPollers(opts = {}) {
  const { cronIntervalMs = config.polling.activityCronIntervalMs } = opts;

  startCronIngestionPoller(cronIntervalMs);
}

function getIngestionStatus() {
  return {
    lastCronIngestionAt: _lastCronIngestionAt,
  };
}

module.exports = {
  startActivityIngestionPollers,
  startCronIngestionPoller,
  ingestCronAndHeartbeatRuns,
  getIngestionStatus,
};
