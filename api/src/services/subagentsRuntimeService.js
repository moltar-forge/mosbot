const pool = require('../db/pool');

// Helper to parse JSONL files (one JSON object per line)
function parseJsonl(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_err) {
        // Ignore malformed lines
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Fetch runtime subagent data.
 * Runtime JSON/JSONL file integrations under /runtime/mosbot/* are retired.
 * We keep this service interface for route compatibility while returning
 * an explicit empty runtime snapshot.
 * @param {object} options - Query options
 * @param {string} options.taskId - Optional: filter by single task ID
 * @returns {Promise<object>} Parsed subagent data { running, queued, completed, activityBySession }
 */
async function fetchRuntimeSubagents({ taskId: _taskId } = {}) {
  return {
    running: [],
    queued: [],
    completed: [],
    activityBySession: new Map(),
  };
}

/**
 * Enrich subagent data with task numbers from database
 * @param {Array} running - Running subagents
 * @param {Array} queued - Queued subagents
 * @param {Array} completed - Completed subagents
 * @returns {Promise<object>} Enriched data { running, queued, completed }
 */
async function enrichWithTaskNumbers(running, queued, completed) {
  // Collect all unique task IDs from running, queued, and completed
  const allTaskIds = new Set();
  running.forEach((r) => r.taskId && allTaskIds.add(r.taskId));
  queued.forEach((q) => q.taskId && allTaskIds.add(q.taskId));
  completed.forEach((c) => c.taskId && allTaskIds.add(c.taskId));

  // Fetch task numbers for all task IDs in one query
  const taskNumberMap = new Map();
  if (allTaskIds.size > 0) {
    const taskIdsArray = Array.from(allTaskIds);
    const placeholders = taskIdsArray.map((_, i) => `$${i + 1}`).join(',');
    const taskQuery = await pool.query(
      `SELECT id, task_number FROM tasks WHERE id IN (${placeholders})`,
      taskIdsArray,
    );
    taskQuery.rows.forEach((row) => {
      taskNumberMap.set(row.id, row.task_number);
    });
  }

  // Enrich with task numbers
  const runningEnriched = running.map((r) => ({
    ...r,
    taskNumber: r.taskId ? taskNumberMap.get(r.taskId) || null : null,
  }));

  const queuedEnriched = queued.map((q) => ({
    ...q,
    taskNumber: q.taskId ? taskNumberMap.get(q.taskId) || null : null,
  }));

  const completedEnriched = completed.map((c) => ({
    ...c,
    taskNumber: c.taskId ? taskNumberMap.get(c.taskId) || null : null,
  }));

  return {
    running: runningEnriched,
    queued: queuedEnriched,
    completed: completedEnriched,
  };
}

/**
 * Get all subagents with task number enrichment
 * @param {object} options - Query options
 * @param {string} options.taskId - Optional: filter by single task ID
 * @returns {Promise<object>} { running, queued, completed }
 */
async function getAllSubagents({ taskId } = {}) {
  const { running, queued, completed } = await fetchRuntimeSubagents({ taskId });
  return enrichWithTaskNumbers(running, queued, completed);
}

module.exports = {
  parseJsonl,
  fetchRuntimeSubagents,
  enrichWithTaskNumbers,
  getAllSubagents,
  clearEmptyFileCache: () => {},
};
