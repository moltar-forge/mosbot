-- 019_openclaw_integration_state.sql
-- Wizard-first OpenClaw integration state (singleton row, DB-backed pairing contract)
-- Sensitive values are stored as encrypted-at-rest payloads (no plaintext secret columns).

BEGIN;

CREATE TABLE IF NOT EXISTS openclaw_integration_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'uninitialized',
  gateway_url TEXT,
  device_id TEXT,
  client_id TEXT,
  client_mode TEXT,
  platform TEXT,
  public_key TEXT,
  private_key_encrypted TEXT,
  device_token_encrypted TEXT,
  granted_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_error TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT openclaw_integration_singleton CHECK (id = 1),
  CONSTRAINT openclaw_integration_status_check CHECK (
    status IN (
      'uninitialized',
      'pending_pairing',
      'paired_missing_scopes',
      'ready',
      'gateway_unreachable'
    )
  )
);

CREATE OR REPLACE FUNCTION set_openclaw_integration_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_openclaw_integration_updated_at ON openclaw_integration_state;
CREATE TRIGGER trg_openclaw_integration_updated_at
BEFORE UPDATE ON openclaw_integration_state
FOR EACH ROW
EXECUTE FUNCTION set_openclaw_integration_updated_at();

COMMIT;
