import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  FolderOpenIcon,
  UserGroupIcon,
  ArchiveBoxIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import Header from '../components/Header';
import WorkspaceExplorer from '../components/WorkspaceExplorer';
import {
  getProjects,
  getAgents,
  updateProject,
  assignAgentToProject,
  unassignAgentFromProject,
  deleteProject,
  getProjectLinkHealth,
  repairProjectLinkHealth,
} from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { normalizeProjectSlug } from '../utils/projectSlug';

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-3 py-2 rounded-md text-sm border transition-colors',
        active
          ? 'bg-primary-600/20 border-primary-500 text-primary-200'
          : 'bg-dark-800 border-dark-700 text-dark-300 hover:bg-dark-700',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export default function ProjectDetail() {
  const { slug, '*': filePathParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuthStore();
  const { showToast } = useToastStore();

  const [project, setProject] = useState(null);
  const [projectsError, setProjectsError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingArchive, setIsTogglingArchive] = useState(false);
  const [unassigningAgentId, setUnassigningAgentId] = useState(null);
  const [linkHealth, setLinkHealth] = useState([]);
  const [isLoadingLinkHealth, setIsLoadingLinkHealth] = useState(false);
  const [isRepairingLinkHealth, setIsRepairingLinkHealth] = useState(false);
  const [linkHealthError, setLinkHealthError] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    slug: '',
    description: '',
    status: 'active',
  });

  const activeTab = useMemo(() => {
    if (location.pathname.includes('/files')) return 'files';
    return 'overview';
  }, [location.pathname]);

  const loadProject = useCallback(async () => {
    setIsLoading(true);
    try {
      const [projectsData, agentsData] = await Promise.all([getProjects(), getAgents()]);
      const nextProject = (projectsData || []).find((item) => item.slug === slug);
      if (!nextProject) {
        setProject(null);
        setProjectsError(`Project "${slug}" not found`);
        setLinkHealth([]);
        setLinkHealthError(null);
      } else {
        setProject(nextProject);
        setEditForm({
          name: nextProject.name || '',
          slug: nextProject.slug || '',
          description: nextProject.description || '',
          status: nextProject.status || 'active',
        });
        setProjectsError(null);

        setIsLoadingLinkHealth(true);
        try {
          const health = await getProjectLinkHealth({ projectId: nextProject.id, limit: 200 });
          setLinkHealth(Array.isArray(health) ? health : []);
          setLinkHealthError(null);
        } catch (healthErr) {
          setLinkHealth([]);
          setLinkHealthError(healthErr.message || 'Failed to load project link health');
        } finally {
          setIsLoadingLinkHealth(false);
        }
      }
      setAgents(Array.isArray(agentsData) ? agentsData : []);
    } catch (err) {
      setProjectsError(err.message || 'Failed to load project');
      setProject(null);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const assignedAgents = useMemo(() => {
    if (!project?.assigned_agent_ids) return [];
    return project.assigned_agent_ids
      .map((agentId) => agents.find((agent) => agent.id === agentId) || { id: agentId, icon: '🤖' })
      .filter(Boolean);
  }, [project, agents]);

  const availableAgents = useMemo(() => {
    const assigned = new Set(project?.assigned_agent_ids || []);
    return (agents || []).filter(
      (agent) => agent.id && agent.id !== 'archived' && agent.id !== 'main' && !assigned.has(agent.id),
    );
  }, [agents, project]);

  const handleSave = async () => {
    if (!project?.id) return;
    setIsSaving(true);
    try {
      const normalizedSlug = normalizeProjectSlug(editForm.slug);

      const updated = await updateProject(project.id, {
        name: editForm.name.trim(),
        slug: normalizedSlug,
        description: editForm.description.trim(),
        status: editForm.status,
        rootPath: `/projects/${normalizedSlug}`,
      });

      showToast(`Updated ${updated.slug}`, 'success');
      if (normalizedSlug !== slug) {
        navigate(`/projects/${normalizedSlug}`, { replace: true });
        return;
      }
      await loadProject();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to update project', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!project?.id || !selectedAgentId) return;
    setIsAssigning(true);
    try {
      await assignAgentToProject(project.id, { agentId: selectedAgentId });
      showToast(`Assigned ${selectedAgentId}`, 'success');
      setSelectedAgentId('');
      await loadProject();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to assign agent', 'error');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassign = async (agentId) => {
    if (!project?.id || !agentId) return;
    setUnassigningAgentId(agentId);
    try {
      await unassignAgentFromProject(project.id, agentId);
      showToast(`Unassigned ${agentId}`, 'success');
      await loadProject();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to unassign agent', 'error');
    } finally {
      setUnassigningAgentId(null);
    }
  };

  const handleRepairLinkHealth = async () => {
    if (!project?.id) return;
    setIsRepairingLinkHealth(true);
    try {
      const result = await repairProjectLinkHealth({ projectId: project.id, limit: 200 });
      showToast(
        `Link repair complete · repaired ${result?.repaired ?? 0}, failed ${result?.failed ?? 0}`,
        result?.failed ? 'warning' : 'success',
      );
      await loadProject();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to repair project links', 'error');
    } finally {
      setIsRepairingLinkHealth(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!project?.id) return;

    const nextStatus = project.status === 'archived' ? 'active' : 'archived';
    setIsTogglingArchive(true);
    try {
      await updateProject(project.id, {
        name: project.name,
        slug: project.slug,
        description: project.description || '',
        status: nextStatus,
        rootPath: project.root_path,
      });
      showToast(nextStatus === 'archived' ? `Archived ${project.slug}` : `Restored ${project.slug}`, 'success');
      setEditForm((prev) => ({ ...prev, status: nextStatus }));
      await loadProject();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to update project status', 'error');
    } finally {
      setIsTogglingArchive(false);
    }
  };

  const handleDelete = async () => {
    if (!project?.id) return;
    const confirmed = window.confirm(
      `Delete project "${project.slug}"? This removes project assignments and workspace links.`,
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteProject(project.id);
      showToast(`Deleted ${project.slug}`, 'success');
      navigate('/projects', { replace: true });
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to delete project', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Projects" subtitle="Loading project…" />
        <div className="flex-1 flex items-center justify-center text-dark-400">Loading project…</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Projects" subtitle="Project detail" />
        <div className="flex-1 overflow-y-auto p-3 md:p-6">
          <div className="bg-dark-800 border border-dark-700 rounded-lg p-6 space-y-3">
            <p className="text-red-400">{projectsError || 'Project not found'}</p>
            <Link to="/projects" className="btn-secondary inline-flex items-center gap-2">
              <ArrowLeftIcon className="w-4 h-4" />
              Back to projects
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={project.name} subtitle={`${project.slug} · ${project.root_path}`} />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to="/projects" className="btn-secondary inline-flex items-center gap-2">
              <ArrowLeftIcon className="w-4 h-4" />
              Back
            </Link>
            <TabButton active={activeTab === 'overview'} onClick={() => navigate(`/projects/${project.slug}`)}>
              Overview
            </TabButton>
            <TabButton active={activeTab === 'files'} onClick={() => navigate(`/projects/${project.slug}/files`)}>
              Files
            </TabButton>
          </div>

          <div className="text-xs text-dark-400">
            Contract:{' '}
            <code className="text-dark-300">{project.contract_path}</code>
          </div>
        </div>

        {activeTab !== 'files' && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-dark-800 border border-dark-700 rounded-lg p-4 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-dark-100">Project metadata</h2>
                <p className="text-xs text-dark-400 mt-1">
                  Registry data lives here. Files and directory browsing live under the Files tab.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-dark-500">Name</label>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="input-field mt-1 w-full"
                    disabled={!isAdmin()}
                  />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-dark-500">Slug</label>
                  <input
                    value={editForm.slug}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, slug: e.target.value }))}
                    className="input-field mt-1 w-full"
                    disabled={!isAdmin()}
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] uppercase tracking-wide text-dark-500">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="input-field mt-1 w-full min-h-[120px]"
                  disabled={!isAdmin()}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="text-[11px] uppercase tracking-wide text-dark-500">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                    className="input-field mt-1 w-full"
                    disabled={!isAdmin()}
                  >
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="text-xs text-dark-400">
                  Root path:{' '}
                  <code className="text-dark-300">
                    /projects/
                    {normalizeProjectSlug(editForm.slug) || 'project-slug'}
                  </code>
                </div>
              </div>

              {isAdmin() && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-dark-700">
                  <button
                    className="btn-primary disabled:opacity-50"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving…' : 'Save changes'}
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
                      onClick={handleToggleArchive}
                      disabled={isTogglingArchive}
                    >
                      <ArchiveBoxIcon className="w-4 h-4" />
                      {isTogglingArchive
                        ? project.status === 'archived'
                          ? 'Restoring…'
                          : 'Archiving…'
                        : project.status === 'archived'
                          ? 'Restore project'
                          : 'Archive project'}
                    </button>
                    <button
                      className="btn-danger inline-flex items-center gap-2 disabled:opacity-50"
                      onClick={handleDelete}
                      disabled={isDeleting}
                    >
                      <TrashIcon className="w-4 h-4" />
                      {isDeleting ? 'Deleting…' : 'Delete project'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div id="agents" className="bg-dark-800 border border-dark-700 rounded-lg p-4 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-dark-100">Assigned agents</h2>
                <p className="text-xs text-dark-400 mt-1">
                  Agent assignment belongs here, not on the registry screen.
                </p>
              </div>

              <div className="space-y-2">
                {assignedAgents.length === 0 ? (
                  <div className="text-sm text-dark-400">No assigned agents.</div>
                ) : (
                  assignedAgents.map((agent) => (
                    <div
                      key={agent.id}
                      className="bg-dark-900 border border-dark-700 rounded-lg p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-dark-100 flex items-center gap-2">
                          <span>{agent.icon || '🤖'}</span>
                          <span className="truncate">{agent.name || agent.id}</span>
                        </div>
                        <div className="text-xs text-dark-500 mt-1">{agent.id}</div>
                      </div>

                      {isAdmin() && (
                        <button
                          className="btn-secondary disabled:opacity-50"
                          onClick={() => handleUnassign(agent.id)}
                          disabled={unassigningAgentId === agent.id}
                        >
                          {unassigningAgentId === agent.id ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-dark-700 pt-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] uppercase tracking-wide text-dark-500">Link health</label>
                  {isAdmin() && (
                    <button
                      className="btn-secondary text-xs disabled:opacity-50"
                      onClick={handleRepairLinkHealth}
                      disabled={isRepairingLinkHealth || project.status !== 'active'}
                    >
                      {isRepairingLinkHealth ? 'Repairing…' : 'Repair links'}
                    </button>
                  )}
                </div>

                {isLoadingLinkHealth ? (
                  <div className="text-xs text-dark-400">Loading link diagnostics…</div>
                ) : linkHealthError ? (
                  <div className="text-xs text-red-400">{linkHealthError}</div>
                ) : linkHealth.length === 0 ? (
                  <div className="text-xs text-dark-400">No link diagnostics found.</div>
                ) : (
                  <div className="space-y-2">
                    {linkHealth.map((entry) => {
                      const state = String(entry.state || 'unknown').toLowerCase();
                      const stateClass =
                        state === 'linked'
                          ? 'bg-green-900/30 text-green-300 border-green-700/60'
                          : state === 'error' || state === 'conflict'
                            ? 'bg-red-900/30 text-red-300 border-red-700/60'
                            : 'bg-yellow-900/30 text-yellow-300 border-yellow-700/60';

                      return (
                        <div
                          key={`${entry.slug}-${entry.agentId}`}
                          className="bg-dark-900 border border-dark-700 rounded p-2 text-xs flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-dark-200 truncate">{entry.agentId}</div>
                            {entry.errorCode ? <div className="text-red-400">{entry.errorCode}</div> : null}
                          </div>
                          <span className={`px-2 py-0.5 rounded border ${stateClass}`}>{state}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {isAdmin() && project.status === 'active' && (
                <div className="border-t border-dark-700 pt-4 space-y-2">
                  <label className="text-[11px] uppercase tracking-wide text-dark-500">Assign agent</label>
                  <select
                    className="input-field w-full"
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                  >
                    <option value="">Select an agent…</option>
                    {availableAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.icon || '🤖'} {agent.id}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-primary w-full inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    onClick={handleAssign}
                    disabled={!selectedAgentId || isAssigning}
                  >
                    <UserGroupIcon className="w-4 h-4" />
                    {isAssigning ? 'Assigning…' : 'Assign agent'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="h-[calc(100vh-240px)] min-h-[600px]">
            <div className="bg-dark-800 border border-dark-700 rounded-lg p-4 h-full flex flex-col gap-4 overflow-hidden">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold text-dark-100 flex items-center gap-2">
                    <FolderOpenIcon className="w-4 h-4" />
                    Project files
                  </h2>
                  <p className="text-xs text-dark-400 mt-1">
                    Browsing the shared project workspace at <code className="text-dark-300">{project.root_path}</code>
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                <WorkspaceExplorer
                  agentId="projects"
                  agent={{
                    id: 'projects',
                    name: `Project ${project.slug}`,
                    workspaceRootPath: project.root_path,
                    icon: '📁',
                  }}
                  initialFilePath={filePathParam || null}
                  routeBase={`/projects/${project.slug}/files`}
                  showAgentSelector={false}
                  workspaceRootPath={project.root_path}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
