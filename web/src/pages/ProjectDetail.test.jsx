import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProjectDetail from './ProjectDetail';

vi.mock('../api/client', () => ({
  getProjects: vi.fn(),
  getAgents: vi.fn(),
  updateProject: vi.fn(),
  assignAgentToProject: vi.fn(),
  unassignAgentFromProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({ isAdmin: () => true }),
}));

vi.mock('../stores/toastStore', () => ({
  useToastStore: () => ({ showToast: vi.fn() }),
}));

vi.mock('../components/WorkspaceExplorer', () => ({
  default: ({ routeBase, workspaceRootPath }) => (
    <div data-testid="workspace-explorer">
      explorer:{routeBase}:{workspaceRootPath}
    </div>
  ),
}));

const { getProjects, getAgents, updateProject } = await import('../api/client');

describe('ProjectDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getProjects.mockResolvedValue([
      {
        id: 'p1',
        slug: 'project-alpha',
        name: 'Project Alpha',
        description: 'Sample project description',
        root_path: '/projects/project-alpha',
        contract_path: '/projects/project-alpha/agent-contract.md',
        status: 'active',
        assigned_agents: 2,
        assigned_agent_ids: ['api-agent', 'web-agent'],
      },
    ]);

    getAgents.mockResolvedValue([
      { id: 'main', name: 'main', icon: '🦞' },
      { id: 'api-agent', name: 'API Agent', icon: '⚙️' },
      { id: 'web-agent', name: 'Web Agent', icon: '🖥️' },
      { id: 'architect-agent', name: 'Architect Agent', icon: '🧭' },
    ]);
  });

  it('renders assigned agents in overview', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/project-alpha']}>
        <Routes>
          <Route path="/projects/:slug" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Assigned agents')).toBeInTheDocument();
    });

    expect(screen.getByText('API Agent')).toBeInTheDocument();
    expect(screen.getByText('Web Agent')).toBeInTheDocument();
    expect(screen.queryByText('Architect Agent')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(2);
  });

  it('excludes main from the assignment dropdown', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/project-alpha']}>
        <Routes>
          <Route path="/projects/:slug" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Assign agent' })).toBeInTheDocument();
    });

    const options = Array.from(screen.getAllByRole('option')).map((option) => option.textContent);
    expect(options).toContain('🧭 architect-agent');
    expect(options).not.toContain('🦞 main');
  });

  it('archives a project from the detail page without persisting dirty form edits', async () => {
    updateProject.mockResolvedValue({ status: 'archived' });

    render(
      <MemoryRouter initialEntries={['/projects/project-alpha']}>
        <Routes>
          <Route path="/projects/:slug" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Archive project' })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByDisplayValue('Project Alpha'), {
      target: { value: 'Unsaved Project Name' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Archive project' }));

    await waitFor(() => {
      expect(updateProject).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({
          name: 'Project Alpha',
          slug: 'project-alpha',
          description: 'Sample project description',
          status: 'archived',
          rootPath: '/projects/project-alpha',
        }),
      );
    });
  });

  it('renders workspace explorer on files route', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/project-alpha/files']}>
        <Routes>
          <Route path="/projects/:slug/files/*" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Project files')).toBeInTheDocument();
    });

    expect(screen.getByTestId('workspace-explorer')).toHaveTextContent(
      'explorer:/projects/project-alpha/files:/projects/project-alpha',
    );
  });
});
