-- Project-scoped workspace model (issue #33, phase 1 MVP)

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  root_path TEXT NOT NULL,
  contract_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT check_project_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  CONSTRAINT check_project_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT check_project_root_path CHECK (root_path = ('/projects/' || slug))
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS agent_project_assignments (
  agent_id TEXT NOT NULL REFERENCES agents(agent_id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'contributor',
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_project_assignments_project_id ON agent_project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_project_assignments_agent_id ON agent_project_assignments(agent_id);

DROP TRIGGER IF EXISTS update_agent_project_assignments_updated_at ON agent_project_assignments;
CREATE TRIGGER update_agent_project_assignments_updated_at
  BEFORE UPDATE ON agent_project_assignments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
