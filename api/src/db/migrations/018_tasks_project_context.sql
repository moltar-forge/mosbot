-- Link tasks to project context so orchestration has first-class repo/docs metadata

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);

-- Extend project registry with explicit repo/docs metadata used by tasks + agents
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS repo_url TEXT,
  ADD COLUMN IF NOT EXISTS docs_path TEXT,
  ADD COLUMN IF NOT EXISTS default_branch TEXT;
