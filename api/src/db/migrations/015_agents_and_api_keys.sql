-- Agent metadata and API-key authentication tables
-- Addresses issues #16 and #17 foundation work.

CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  reports_to TEXT REFERENCES agents(agent_id) ON DELETE SET NULL,
  department TEXT,
  meta JSONB,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_agent_id_format CHECK (agent_id ~ '^[a-z0-9_-]+$'),
  CONSTRAINT check_agent_status CHECK (status IN ('scaffolded', 'active', 'deprecated'))
);

CREATE INDEX IF NOT EXISTS idx_agents_agent_id ON agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_reports_to ON agents(reports_to);

-- Keep updated_at fresh on updates (same behavior as core tables)
DROP TRIGGER IF EXISTS update_agents_updated_at ON agents;
CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS agent_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  label TEXT,
  last_used TIMESTAMPTZ,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_api_keys_agent_id ON agent_api_keys(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_api_keys_revoked_at ON agent_api_keys(revoked_at);

-- Backfill seed agent records from existing users with role='agent'
INSERT INTO agents (agent_id, name, title, status, active)
SELECT u.agent_id,
       COALESCE(NULLIF(trim(u.name), ''), u.agent_id) AS name,
       NULL,
       CASE WHEN u.active THEN 'active' ELSE 'deprecated' END,
       u.active
FROM users u
WHERE u.role = 'agent'
  AND u.agent_id IS NOT NULL
ON CONFLICT (agent_id) DO NOTHING;
