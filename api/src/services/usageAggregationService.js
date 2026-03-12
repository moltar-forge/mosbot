const bcrypt = require('bcrypt');

const VALID_RANGES = ['today', '24h', '3d', '7d', '14d', '30d', '3m', '6m'];

function createHttpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function getStartOfTodayInTimezone(timezone, now) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === 'year').value;
  const month = parts.find((p) => p.type === 'month').value;
  const day = parts.find((p) => p.type === 'day').value;

  const noonUTC = new Date(`${year}-${month}-${day}T12:00:00Z`);
  const noonInTzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const noonInTzParts = noonInTzFormatter.formatToParts(noonUTC);
  const noonHour = parseInt(noonInTzParts.find((p) => p.type === 'hour').value, 10);
  const noonMin = parseInt(noonInTzParts.find((p) => p.type === 'minute').value, 10);
  const noonSec = parseInt(noonInTzParts.find((p) => p.type === 'second').value, 10);

  const offsetMinutes = noonHour * 60 + noonMin + noonSec / 60;
  return new Date(noonUTC.getTime() - offsetMinutes * 60 * 1000);
}

function resolveUsageWindow(query) {
  const range = VALID_RANGES.includes(query.range) ? query.range : '7d';
  const timezone = query.timezone || 'UTC';
  const startDateParam = query.startDate;
  const endDateParam = query.endDate;

  const now = new Date();
  let startAt;
  let endAt = now;

  if (startDateParam && endDateParam) {
    startAt = new Date(startDateParam);
    endAt = new Date(endDateParam);

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      throw createHttpError(
        400,
        'Invalid date format. Use ISO 8601 format (e.g., "2024-01-01T00:00:00Z")',
      );
    }

    if (startAt > endAt) {
      throw createHttpError(400, 'Start date must be before end date');
    }
  } else {
    switch (range) {
      case 'today':
        startAt = getStartOfTodayInTimezone(timezone, now);
        break;
      case '24h':
        startAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '3d':
        startAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '14d':
        startAt = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3m':
        startAt = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '6m':
        startAt = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      default:
        startAt = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }
  }

  let defaultGroupBy;
  if (startDateParam && endDateParam) {
    const durationDays = (endAt - startAt) / (24 * 60 * 60 * 1000);
    defaultGroupBy = durationDays <= 7 ? 'hour' : 'day';
  } else {
    const shortRanges = ['today', '24h', '3d', '7d'];
    defaultGroupBy = shortRanges.includes(range) ? 'hour' : 'day';
  }

  const groupBy =
    query.groupBy === 'day' ? 'day' : query.groupBy === 'hour' ? 'hour' : defaultGroupBy;

  return {
    range,
    groupBy,
    startAt,
    endAt,
    isCustomRange: Boolean(startDateParam && endDateParam),
  };
}

async function getUsageAggregation({ pool, logger, userId, query }) {
  const window = resolveUsageWindow(query || {});

  logger.info('Fetching usage analytics', {
    userId,
    range: window.isCustomRange ? 'custom' : window.range,
    startDate: window.startAt.toISOString(),
    endDate: window.endAt.toISOString(),
    groupBy: window.groupBy,
  });

  const [summaryResult, timeSeriesResult, byAgentResult, byModelResult, byJobResult] =
    await Promise.all([
      pool.query(
        `SELECT
           COALESCE(SUM(cost_usd), 0)           AS total_cost_usd,
           COALESCE(SUM(tokens_input), 0)        AS total_tokens_input,
           COALESCE(SUM(tokens_output), 0)       AS total_tokens_output,
           COALESCE(SUM(tokens_cache_read), 0)   AS total_tokens_cache_read,
           COALESCE(SUM(tokens_cache_write), 0)  AS total_tokens_cache_write,
           COUNT(DISTINCT session_key)           AS session_count
         FROM session_usage_hourly
         WHERE hour_bucket >= $1 AND hour_bucket <= $2`,
        [window.startAt, window.endAt],
      ),
      pool.query(
        `SELECT
           date_trunc($1, hour_bucket)           AS bucket,
           COALESCE(SUM(cost_usd), 0)            AS cost_usd,
           COALESCE(SUM(tokens_input), 0)        AS tokens_input,
           COALESCE(SUM(tokens_output), 0)       AS tokens_output,
           COALESCE(SUM(tokens_cache_read), 0)   AS tokens_cache_read,
           COALESCE(SUM(tokens_cache_write), 0)  AS tokens_cache_write
         FROM session_usage_hourly
         WHERE hour_bucket >= $2 AND hour_bucket <= $3
         GROUP BY 1
         ORDER BY 1 ASC`,
        [window.groupBy, window.startAt, window.endAt],
      ),
      pool.query(
        `SELECT
           agent_key,
           COALESCE(SUM(cost_usd), 0)            AS cost_usd,
           COALESCE(SUM(tokens_input), 0)        AS tokens_input,
           COALESCE(SUM(tokens_output), 0)       AS tokens_output,
           COALESCE(SUM(tokens_cache_read), 0)   AS tokens_cache_read,
           COALESCE(SUM(tokens_cache_write), 0)  AS tokens_cache_write,
           COUNT(DISTINCT session_key)           AS session_count
         FROM session_usage_hourly
         WHERE hour_bucket >= $1 AND hour_bucket <= $2
         GROUP BY agent_key
         ORDER BY cost_usd DESC`,
        [window.startAt, window.endAt],
      ),
      pool.query(
        `WITH normalized_models AS (
           SELECT
             h.*,
             CASE
               WHEN h.model IS NULL THEN NULL
               WHEN h.model ~ '^([^/]+)/\\1/' THEN
                 regexp_replace(h.model, '^([^/]+)/\\1/(.+)$', '\\1/\\2')
               WHEN h.model LIKE 'openrouter/%' THEN h.model
               WHEN h.model NOT LIKE '%/%' AND EXISTS (
                 SELECT 1 FROM session_usage_hourly h2
                 WHERE h2.hour_bucket >= $1 AND h2.hour_bucket <= $2
                   AND h2.model = 'openrouter/' || h.model
               ) THEN 'openrouter/' || h.model
               ELSE h.model
             END AS normalized_model
           FROM session_usage_hourly h
           WHERE h.hour_bucket >= $1 AND h.hour_bucket <= $2
         )
         SELECT
           normalized_model AS model,
           COALESCE(SUM(cost_usd), 0)            AS cost_usd,
           COALESCE(SUM(tokens_input), 0)        AS tokens_input,
           COALESCE(SUM(tokens_output), 0)       AS tokens_output,
           COALESCE(SUM(tokens_cache_read), 0)   AS tokens_cache_read,
           COALESCE(SUM(tokens_cache_write), 0)  AS tokens_cache_write,
           COUNT(DISTINCT session_key)           AS session_count
         FROM normalized_models
         GROUP BY normalized_model
         ORDER BY cost_usd DESC`,
        [window.startAt, window.endAt],
      ),
      pool.query(
        `SELECT
           h.job_id,
           (SELECT su.label
            FROM session_usage su
            WHERE su.job_id = h.job_id AND su.label IS NOT NULL
            LIMIT 1)                                AS job_label,
           MIN(h.agent_key)                         AS agent_key,
           COALESCE(SUM(h.cost_usd), 0)             AS cost_usd,
           COALESCE(SUM(h.tokens_input), 0)         AS tokens_input,
           COALESCE(SUM(h.tokens_output), 0)        AS tokens_output,
           COALESCE(SUM(h.tokens_cache_read), 0)    AS tokens_cache_read,
           COALESCE(SUM(h.tokens_cache_write), 0)   AS tokens_cache_write,
           COUNT(DISTINCT h.session_key)            AS run_count
         FROM session_usage_hourly h
         WHERE h.hour_bucket >= $1 AND h.hour_bucket <= $2
           AND h.job_id IS NOT NULL
         GROUP BY h.job_id
         ORDER BY cost_usd DESC`,
        [window.startAt, window.endAt],
      ),
    ]);

  const summary = summaryResult.rows[0] || {};

  return {
    range: window.range,
    groupBy: window.groupBy,
    summary: {
      totalCostUsd: parseFloat(summary.total_cost_usd || 0),
      totalTokensInput: parseInt(summary.total_tokens_input || 0, 10),
      totalTokensOutput: parseInt(summary.total_tokens_output || 0, 10),
      totalTokensCacheRead: parseInt(summary.total_tokens_cache_read || 0, 10),
      totalTokensCacheWrite: parseInt(summary.total_tokens_cache_write || 0, 10),
      sessionCount: parseInt(summary.session_count || 0, 10),
    },
    timeSeries: (timeSeriesResult.rows || []).map((r) => ({
      bucket: r.bucket,
      costUsd: parseFloat(r.cost_usd || 0),
      tokensInput: parseInt(r.tokens_input || 0, 10),
      tokensOutput: parseInt(r.tokens_output || 0, 10),
      tokensCacheRead: parseInt(r.tokens_cache_read || 0, 10),
      tokensCacheWrite: parseInt(r.tokens_cache_write || 0, 10),
    })),
    byAgent: (byAgentResult.rows || []).map((r) => ({
      agentKey: r.agent_key,
      costUsd: parseFloat(r.cost_usd || 0),
      tokensInput: parseInt(r.tokens_input || 0, 10),
      tokensOutput: parseInt(r.tokens_output || 0, 10),
      tokensCacheRead: parseInt(r.tokens_cache_read || 0, 10),
      tokensCacheWrite: parseInt(r.tokens_cache_write || 0, 10),
      sessionCount: parseInt(r.session_count || 0, 10),
    })),
    byModel: (byModelResult.rows || []).map((r) => ({
      model: r.model,
      costUsd: parseFloat(r.cost_usd || 0),
      tokensInput: parseInt(r.tokens_input || 0, 10),
      tokensOutput: parseInt(r.tokens_output || 0, 10),
      tokensCacheRead: parseInt(r.tokens_cache_read || 0, 10),
      tokensCacheWrite: parseInt(r.tokens_cache_write || 0, 10),
      sessionCount: parseInt(r.session_count || 0, 10),
    })),
    byJob: (byJobResult.rows || []).map((r) => ({
      jobId: r.job_id,
      jobLabel: r.job_label || null,
      agentKey: r.agent_key,
      costUsd: parseFloat(r.cost_usd || 0),
      tokensInput: parseInt(r.tokens_input || 0, 10),
      tokensOutput: parseInt(r.tokens_output || 0, 10),
      tokensCacheRead: parseInt(r.tokens_cache_read || 0, 10),
      tokensCacheWrite: parseInt(r.tokens_cache_write || 0, 10),
      runCount: parseInt(r.run_count || 0, 10),
    })),
  };
}

async function resetUsageData({ pool, userId, password }) {
  if (!password || password.length === 0) {
    throw createHttpError(400, 'Password is required to confirm reset');
  }

  const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length === 0) {
    throw createHttpError(401, 'User not found');
  }

  const isValidPassword = await bcrypt.compare(password, userResult.rows[0].password_hash);
  if (!isValidPassword) {
    throw createHttpError(401, 'Invalid password');
  }

  const hourlyCountResult = await pool.query('SELECT COUNT(*) AS total FROM session_usage_hourly');
  const usageCountResult = await pool.query('SELECT COUNT(*) AS total FROM session_usage');

  const deletedHourly = parseInt(hourlyCountResult.rows[0]?.total || 0, 10);
  const deletedUsage = parseInt(usageCountResult.rows[0]?.total || 0, 10);

  await pool.query('DELETE FROM session_usage_hourly');
  await pool.query('DELETE FROM session_usage');

  return {
    success: true,
    deletedCount: {
      sessionUsage: deletedUsage,
      hourlyUsage: deletedHourly,
      total: deletedUsage + deletedHourly,
    },
    message: `All usage data has been permanently deleted (${deletedUsage} session usage records, ${deletedHourly} hourly records)`,
  };
}

module.exports = {
  getUsageAggregation,
  resetUsageData,
  resolveUsageWindow,
};
