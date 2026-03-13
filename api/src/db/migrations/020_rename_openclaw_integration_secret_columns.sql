-- 020_rename_openclaw_integration_secret_columns.sql
-- Align column names with current plaintext-at-rest contract.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'openclaw_integration_state'
      AND column_name = 'private_key_encrypted'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'openclaw_integration_state'
      AND column_name = 'private_key'
  ) THEN
    EXECUTE 'ALTER TABLE openclaw_integration_state RENAME COLUMN private_key_encrypted TO private_key';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'openclaw_integration_state'
      AND column_name = 'device_token_encrypted'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'openclaw_integration_state'
      AND column_name = 'device_token'
  ) THEN
    EXECUTE 'ALTER TABLE openclaw_integration_state RENAME COLUMN device_token_encrypted TO device_token';
  END IF;
END $$;

COMMIT;
