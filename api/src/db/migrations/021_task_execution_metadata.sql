-- 021_task_execution_metadata.sql
-- Track lightweight per-task agent execution metadata and typed execution events.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS last_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS last_session_key TEXT,
  ADD COLUMN IF NOT EXISTS last_run_id TEXT,
  ADD COLUMN IF NOT EXISTS last_branch TEXT,
  ADD COLUMN IF NOT EXISTS last_pr_url TEXT,
  ADD COLUMN IF NOT EXISTS last_reported_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_tasks_last_agent_id ON tasks(last_agent_id) WHERE last_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_last_reported_at ON tasks(last_reported_at DESC) WHERE last_reported_at IS NOT NULL;

ALTER TABLE task_logs DROP CONSTRAINT IF EXISTS valid_event_type;
ALTER TABLE task_logs
  ADD CONSTRAINT valid_event_type CHECK (
    event_type IN (
      'CREATED',
      'UPDATED',
      'STATUS_CHANGED',
      'ARCHIVED_AUTO',
      'ARCHIVED_MANUAL',
      'RESTORED',
      'DELETED',
      'COMMENT_CREATED',
      'COMMENT_UPDATED',
      'COMMENT_DELETED',
      'AGENT_ACK',
      'AGENT_PROGRESS',
      'AGENT_BLOCKER',
      'AGENT_DONE'
    )
  );
