-- 018_drop_users_agent_id.sql
-- Remove legacy users.agent_id now that runtime lookups are backed by agents table.

BEGIN;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS check_agent_role_requires_agent_id,
  DROP CONSTRAINT IF EXISTS check_agent_id_format;

DROP INDEX IF EXISTS idx_users_agent_id;

ALTER TABLE users
  DROP COLUMN IF EXISTS agent_id;

COMMIT;
