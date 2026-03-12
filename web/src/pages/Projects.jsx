import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusIcon,
  PencilSquareIcon,
  FolderOpenIcon,
  ArchiveBoxIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import Header from '../components/Header';
import { createProject, getProjects, updateProject, deleteProject } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  status: 'active',
};

function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
}

function ProjectForm({
  title,
  submitLabel,
  initialValues = EMPTY_FORM,
  isSaving = false,
  onSubmit,
  onCancel = null,
}) {
  const [form, setForm] = useState(initialValues);

  useEffect(() => {
    setForm(initialValues);
  }, [initialValues]);

  const derivedSlug = normalizeSlug(form.name);
  const effectiveSlug = normalizeSlug(form.slug || derivedSlug);

  const handleChange = (field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'slug') {
        next.slug = normalizeSlug(value);
      }
      return next;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onSubmit({
      name: form.name.trim(),
      slug: effectiveSlug,
      description: form.description.trim(),
      status: form.status,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-dark-800 border border-dark-700 rounded-lg p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-dark-100">{title}</h2>
          <p className="text-xs text-dark-400 mt-1">
            Slug controls the workspace path at{' '}
            <code className="text-dark-300">/projects/&lt;slug&gt;</code>.
          </p>
        </div>

        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-dark-500">Name</label>
          <input
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            className="input-field mt-1 w-full"
            placeholder="My Project"
            required
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wide text-dark-500">Slug</label>
          <input
            value={form.slug}
            onChange={(e) => handleChange('slug', e.target.value)}
            className="input-field mt-1 w-full"
            placeholder={derivedSlug || 'my-project'}
          />
        </div>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wide text-dark-500">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => handleChange('description', e.target.value)}
          className="input-field mt-1 w-full min-h-[96px]"
          placeholder="What the project is, why it exists, who it serves."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-dark-500">Status</label>
          <select
            value={form.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="input-field mt-1 w-full"
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div className="text-xs text-dark-400">
          Root path:{' '}
          <code className="text-dark-300">/projects/{effectiveSlug || 'project-slug'}</code>
        </div>
      </div>

      <div className="flex items-center gap-2 justify-end">
        <button type="submit" className="btn-primary disabled:opacity-50" disabled={isSaving}>
          {isSaving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function ProjectCard({ project, onEdit, onDelete, onToggleArchive, isAdmin, isDeleting, isTogglingArchive }) {
  const statusClass =
    project.status === 'archived'
      ? 'bg-yellow-900/40 text-yellow-300 border-yellow-700/60'
      : 'bg-green-900/30 text-green-300 border-green-700/60';

  return (
    <div className="bg-dark-800 border border-dark-700 rounded-lg p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-dark-100 truncate">{project.name}</h2>
            <span className={`text-[10px] px-2 py-1 rounded border ${statusClass}`}>
              {project.status}
            </span>
          </div>
          <p className="text-xs text-dark-400 mt-1">/{project.slug}</p>
          {project.description ? (
            <p className="text-xs text-dark-300 mt-2 line-clamp-3">{project.description}</p>
          ) : (
            <p className="text-xs text-dark-500 mt-2">No description yet.</p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div>
          <dt className="text-dark-500">Root path</dt>
          <dd className="text-dark-200 mt-1 break-all">{project.root_path}</dd>
        </div>
        <div>
          <dt className="text-dark-500">Assigned agents</dt>
          <dd className="text-dark-200 mt-1">{project.assigned_agents ?? 0}</dd>
        </div>
        <div>
          <dt className="text-dark-500">Updated</dt>
          <dd className="text-dark-200 mt-1">{project.updated_at || '—'}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <Link to={`/projects/${project.slug}`} className="btn-primary inline-flex items-center gap-2">
          <FolderOpenIcon className="w-4 h-4" />
          Open project
        </Link>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary inline-flex items-center gap-2" onClick={() => onEdit(project)}>
              <PencilSquareIcon className="w-4 h-4" />
              Edit
            </button>
            <button
              className="btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
              onClick={() => onToggleArchive(project)}
              disabled={isTogglingArchive}
            >
              <ArchiveBoxIcon className="w-4 h-4" />
              {isTogglingArchive
                ? project.status === 'archived'
                  ? 'Restoring…'
                  : 'Archiving…'
                : project.status === 'archived'
                  ? 'Restore'
                  : 'Archive'}
            </button>
            <button
              className="btn-danger inline-flex items-center gap-2 disabled:opacity-50"
              onClick={() => onDelete(project)}
              disabled={isDeleting}
            >
              <TrashIcon className="w-4 h-4" />
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Projects() {
  const { isAdmin } = useAuthStore();
  const { showToast } = useToastStore();

  const [projects, setProjects] = useState([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState(null);
  const [togglingArchiveProjectId, setTogglingArchiveProjectId] = useState(null);

  const loadProjects = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const { activeProjects, archivedProjects } = useMemo(() => {
    const active = [];
    const archived = [];
    projects.forEach((project) => {
      if (project.status === 'archived') archived.push(project);
      else active.push(project);
    });
    return { activeProjects: active, archivedProjects: archived };
  }, [projects]);

  const handleCreateProject = async (payload) => {
    setIsSavingProject(true);
    try {
      await createProject(payload);
      showToast('Project created', 'success');
      setShowCreateForm(false);
      await loadProjects();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to create project', 'error');
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleUpdateProject = async (payload) => {
    if (!editingProject?.id) return;

    setIsSavingProject(true);
    try {
      await updateProject(editingProject.id, {
        ...payload,
        rootPath: `/projects/${payload.slug}`,
      });
      showToast(`Updated ${payload.slug}`, 'success');
      setEditingProject(null);
      await loadProjects();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to update project', 'error');
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleToggleArchiveProject = async (project) => {
    if (!project?.id) return;

    const nextStatus = project.status === 'archived' ? 'active' : 'archived';
    setTogglingArchiveProjectId(project.id);
    try {
      await updateProject(project.id, {
        name: project.name,
        slug: project.slug,
        description: project.description || '',
        status: nextStatus,
        rootPath: project.root_path,
      });
      showToast(
        nextStatus === 'archived' ? `Archived ${project.slug}` : `Restored ${project.slug}`,
        'success',
      );
      if (editingProject?.id === project.id) {
        setEditingProject((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      }
      await loadProjects();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to update project status', 'error');
    } finally {
      setTogglingArchiveProjectId(null);
    }
  };

  const handleDeleteProject = async (project) => {
    if (!project?.id) return;
    const confirmed = window.confirm(
      `Delete project "${project.slug}"? This removes assignments and workspace links.`,
    );
    if (!confirmed) return;

    setDeletingProjectId(project.id);
    try {
      await deleteProject(project.id);
      showToast(`Deleted project ${project.slug}`, 'success');
      if (editingProject?.id === project.id) {
        setEditingProject(null);
      }
      await loadProjects();
    } catch (err) {
      showToast(err?.response?.data?.error?.message || err.message || 'Failed to delete project', 'error');
    } finally {
      setDeletingProjectId(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header title="Projects" subtitle="Registry first. Project detail and files live one level down." />

      <div className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4">
        <div className="bg-dark-800 border border-dark-700 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-dark-100">Project Registry</h2>
              <p className="text-xs text-dark-400 mt-1 max-w-3xl">
                Use this page to manage project records. Open a project to handle files, agent assignment,
                and project-specific actions.
              </p>
            </div>

            {isAdmin() && (
              <button
                className="btn-primary inline-flex items-center gap-2"
                onClick={() => {
                  setEditingProject(null);
                  setShowCreateForm((prev) => !prev);
                }}
              >
                <PlusIcon className="w-4 h-4" />
                {showCreateForm ? 'Close' : 'New Project'}
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-dark-900 rounded-lg border border-dark-700 p-3">
              <div className="text-dark-500">Active</div>
              <div className="text-lg font-semibold text-dark-100 mt-1">{activeProjects.length}</div>
            </div>
            <div className="bg-dark-900 rounded-lg border border-dark-700 p-3">
              <div className="text-dark-500">Archived</div>
              <div className="text-lg font-semibold text-dark-100 mt-1">{archivedProjects.length}</div>
            </div>
            <div className="bg-dark-900 rounded-lg border border-dark-700 p-3">
              <div className="text-dark-500">Total assigned agents</div>
              <div className="text-lg font-semibold text-dark-100 mt-1">
                {projects.reduce((sum, project) => sum + (project.assigned_agents || 0), 0)}
              </div>
            </div>
          </div>
        </div>

        {isAdmin() && showCreateForm && (
          <ProjectForm
            title="Create project"
            submitLabel="Create project"
            isSaving={isSavingProject}
            onSubmit={handleCreateProject}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {isAdmin() && editingProject && (
          <ProjectForm
            title={`Edit ${editingProject.slug}`}
            submitLabel="Save changes"
            isSaving={isSavingProject}
            initialValues={{
              name: editingProject.name || '',
              slug: editingProject.slug || '',
              description: editingProject.description || '',
              status: editingProject.status || 'active',
            }}
            onSubmit={handleUpdateProject}
            onCancel={() => setEditingProject(null)}
          />
        )}

        {projectsError && <div className="text-sm text-red-400">{projectsError}</div>}

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-dark-300">
            <FolderOpenIcon className="w-5 h-5" />
            <h2 className="text-sm font-semibold">Active projects</h2>
          </div>

          {isLoadingProjects ? (
            <div className="text-sm text-dark-400">Loading projects…</div>
          ) : activeProjects.length === 0 ? (
            <div className="bg-dark-800 border border-dark-700 rounded-lg p-6 text-sm text-dark-400">
              No active projects yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {activeProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onEdit={setEditingProject}
                  onDelete={handleDeleteProject}
                  onToggleArchive={handleToggleArchiveProject}
                  isAdmin={isAdmin()}
                  isDeleting={deletingProjectId === project.id}
                  isTogglingArchive={togglingArchiveProjectId === project.id}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-dark-300">
            <ArchiveBoxIcon className="w-5 h-5" />
            <h2 className="text-sm font-semibold">Archived projects</h2>
          </div>

          {archivedProjects.length === 0 ? (
            <div className="bg-dark-800 border border-dark-700 rounded-lg p-6 text-sm text-dark-400">
              No archived projects.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {archivedProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onEdit={setEditingProject}
                  onDelete={handleDeleteProject}
                  onToggleArchive={handleToggleArchiveProject}
                  isAdmin={isAdmin()}
                  isDeleting={deletingProjectId === project.id}
                  isTogglingArchive={togglingArchiveProjectId === project.id}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
