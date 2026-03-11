import { useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import Header from '../components/Header';
import WorkspaceExplorer from '../components/WorkspaceExplorer';
import { createProject, assignAgentToProject, getProjects } from '../api/client';
import { useAgentStore } from '../stores/agentStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';

const AGENT_ID = 'projects';
const ROOT_PATH = '/projects';

export default function Projects() {
  const { '*': filePathParam } = useParams();
  const { agents, fetchAgents } = useAgentStore();
  const { createDirectory, setWorkspaceRootPath } = useWorkspaceStore();
  const { isAdmin } = useAuthStore();
  const { showToast } = useToastStore();

  const [isEnsuring, setIsEnsuring] = useState(false);
  const [ensureComplete, setEnsureComplete] = useState(false);

  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState(null);

  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectSlug, setNewProjectSlug] = useState('');

  const [assignments, setAssignments] = useState({}); // { [projectId]: agentId }
  const [assigningProjectId, setAssigningProjectId] = useState(null);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const loadProjects = async () => {
    setIsLoadingProjects(true);
    try {
      const data = await getProjects();
      setProjects(Array.isArray(data) ? data : []);
      setProjectsError(null);
    } catch (err) {
      setProjects([]);
      setProjectsError(err.message || 'Failed to load projects');
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    const ensureDir = async () => {
      if (isEnsuring || ensureComplete) return;
      setIsEnsuring(true);
      setWorkspaceRootPath(ROOT_PATH);
      try {
        if (isAdmin()) {
          await createDirectory({ path: '/', agentId: AGENT_ID });
        }
      } catch {
        // Directory likely already exists (409) — that's fine
      } finally {
        setIsEnsuring(false);
        setEnsureComplete(true);
      }
    };
    ensureDir();
  }, [createDirectory, setWorkspaceRootPath, isAdmin, isEnsuring, ensureComplete]);

  const availableAgents = useMemo(
    () => (Array.isArray(agents) ? agents.filter((a) => a.id && a.id !== 'archived') : []),
    [agents],
  );

  const handleCreateProject = async () => {
    if (!isAdmin()) return;

    setIsCreatingProject(true);
    try {
      const payload = {
        name: newProjectName || undefined,
        slug: newProjectSlug || undefined,
      };
      await createProject(payload);
      setNewProjectName('');
      setNewProjectSlug('');
      showToast('Project created', 'success');
      await loadProjects();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to create project', 'error');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleAssign = async (projectId) => {
    if (!isAdmin()) return;

    const agentId = assignments[projectId];
    if (!agentId) {
      showToast('Select an agent to assign', 'error');
      return;
    }

    setAssigningProjectId(projectId);
    try {
      await assignAgentToProject(projectId, { agentId });
      showToast(`Assigned ${agentId}`, 'success');
      await loadProjects();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to assign agent', 'error');
    } finally {
      setAssigningProjectId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Projects" subtitle="Project registry + shared project workspace" />

      <div className="flex-1 flex flex-col p-3 md:p-6 overflow-hidden gap-4">
        <div className="bg-dark-800 border border-dark-700 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-dark-100">Registry</h2>
              <p className="text-xs text-dark-400">
                Projects live under <code className="text-dark-300">/projects/*</code> and can be
                linked into agent workspaces as <code className="text-dark-300">/project</code>.
              </p>
            </div>

            {isAdmin() && (
              <div className="flex items-end gap-2">
                <div>
                  <label className="text-[10px] text-dark-500">Name</label>
                  <input
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="input-field mt-1 w-48"
                    placeholder="Chaos Codex"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-dark-500">Slug</label>
                  <input
                    value={newProjectSlug}
                    onChange={(e) => setNewProjectSlug(e.target.value)}
                    className="input-field mt-1 w-44"
                    placeholder="chaos-codex"
                  />
                </div>
                <button
                  onClick={handleCreateProject}
                  disabled={isCreatingProject}
                  className="btn-primary flex items-center gap-2 disabled:opacity-50"
                >
                  <PlusIcon className="w-4 h-4" />
                  {isCreatingProject ? 'Creating…' : 'Create'}
                </button>
              </div>
            )}
          </div>

          {projectsError && <p className="text-xs text-red-400 mt-2">{projectsError}</p>}

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {isLoadingProjects && <p className="text-xs text-dark-400">Loading projects…</p>}

            {!isLoadingProjects && projects.length === 0 && (
              <p className="text-xs text-dark-400">No projects yet.</p>
            )}

            {projects.map((p) => (
              <div key={p.id} className="bg-dark-900 border border-dark-700 rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-dark-100 truncate">
                      {p.name} <span className="text-dark-400">({p.slug})</span>
                    </p>
                    <p className="text-xs text-dark-500 mt-1">
                      Root: <code className="text-dark-300">{p.root_path}</code>
                    </p>
                    <p className="text-xs text-dark-500 mt-1">
                      Assigned agents: <span className="text-dark-300">{p.assigned_agents}</span>
                    </p>
                  </div>

                  {isAdmin() && (
                    <div className="flex items-end gap-2">
                      <select
                        className="input-field"
                        value={assignments[p.id] || ''}
                        onChange={(e) =>
                          setAssignments((prev) => ({ ...prev, [p.id]: e.target.value }))
                        }
                      >
                        <option value="">Assign agent…</option>
                        {availableAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.icon || '🤖'} {a.id}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn-secondary disabled:opacity-50"
                        onClick={() => handleAssign(p.id)}
                        disabled={assigningProjectId === p.id}
                      >
                        {assigningProjectId === p.id ? 'Assigning…' : 'Assign'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {ensureComplete ? (
            <WorkspaceExplorer
              agentId={AGENT_ID}
              agent={{
                id: AGENT_ID,
                name: 'Projects',
                workspaceRootPath: ROOT_PATH,
                icon: '📁',
              }}
              initialFilePath={filePathParam || null}
              routeBase="/projects"
              showAgentSelector={false}
              workspaceRootPath={ROOT_PATH}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-block w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-dark-400">Setting up projects space...</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

