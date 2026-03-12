-- Legacy compatibility migration:
-- Convert agent_project_assignments to support multi-project assignment per agent
-- when upgrading from early schemas that used PRIMARY KEY (agent_id).
-- On fresh installs where migration 016 already created the composite PK/indexes,
-- this migration is intentionally a no-op.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agent_project_assignments'
  ) THEN
    -- Drop legacy PK if it is only on agent_id
    IF EXISTS (
      SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'agent_project_assignments'
        AND c.contype = 'p'
        AND pg_get_constraintdef(c.oid) = 'PRIMARY KEY (agent_id)'
    ) THEN
      ALTER TABLE agent_project_assignments DROP CONSTRAINT agent_project_assignments_pkey;
      ALTER TABLE agent_project_assignments
        ADD CONSTRAINT agent_project_assignments_pkey PRIMARY KEY (agent_id, project_id);
      CREATE INDEX IF NOT EXISTS idx_agent_project_assignments_agent_id
        ON agent_project_assignments(agent_id);
    END IF;
  END IF;
END $$;
