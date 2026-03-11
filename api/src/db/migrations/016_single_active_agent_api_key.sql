-- Enforce at most one active API key per agent.
-- Keep newest active key and revoke older duplicates before adding the unique index.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY agent_id
      ORDER BY created_at DESC, id DESC
    ) AS row_num
  FROM agent_api_keys
  WHERE revoked_at IS NULL
)
UPDATE agent_api_keys k
SET revoked_at = NOW()
FROM ranked r
WHERE k.id = r.id
  AND r.row_num > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_api_keys_one_active_per_agent
ON agent_api_keys (agent_id)
WHERE revoked_at IS NULL;
