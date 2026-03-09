-- Store OpenClaw config history snapshots in DB (instead of workspace files)

CREATE TABLE IF NOT EXISTS openclaw_config_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  base_hash TEXT,
  new_hash TEXT,
  note TEXT,
  raw_config TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'config_editor'
);

CREATE INDEX IF NOT EXISTS idx_openclaw_config_history_created_at
  ON openclaw_config_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_openclaw_config_history_actor
  ON openclaw_config_history(actor_user_id);
