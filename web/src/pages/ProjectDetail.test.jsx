import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const { getProjects, getAgents } = await import('../api/client');

describe('ProjectDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getProjects.mockResolvedValue([
      {
        id: 'p1',
        slug: 'chaos-codex',
        name: 'Chaos Codex',
        description: 'BRP companion app',
        root_path: '/projects/chaos-codex',
        contract_path: '/projects/chaos-codex/agent-contract.md',
        status: 'active',
        assigned_agents: 2,
        assigned_agent_ids: ['cc-api', 'cc-web'],
      },
    ]);

    getAgents.mockResolvedValue([
      { id: 'main', name: 'main', icon: '🦞' },
      { id: 'cc-api', name: 'Chaos Codex API Engineer', icon: '⚙️' },
      { id: 'cc-web', name: 'Chaos Codex Web Engineer', icon: '🖥️' },
      { id: 'cc-architect', name: 'Chaos Codex Architect', icon: '🧭' },
    ]);
  });

  it('renders assigned agents in overview', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/chaos-codex']}>
        <Routes>
          <Route path="/projects/:slug" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Assigned agents')).toBeInTheDocument();
    });

    expect(screen.getByText('Chaos Codex API Engineer')).toBeInTheDocument();
    expect(screen.getByText('Chaos Codex Web Engineer')).toBeInTheDocument();
    expect(screen.queryByText('Chaos Codex Architect')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /remove/i })).toHaveLength(2);
  });

  it('excludes main from the assignment dropdown', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/chaos-codex']}>
        <Routes>
          <Route path="/projects/:slug" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Assign agent' })).toBeInTheDocument();
    });

    const options = Array.from(screen.getAllByRole('option')).map((option) => option.textContent);
    expect(options).toContain('🧭 cc-architect');
    expect(options).not.toContain('🦞 main');
  });

  it('renders workspace explorer on files route', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/chaos-codex/files']}>
        <Routes>
          <Route path="/projects/:slug/files/*" element={<ProjectDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Project files')).toBeInTheDocument();
    });

    expect(screen.getByTestId('workspace-explorer')).toHaveTextContent(
      'explorer:/projects/chaos-codex/files:/projects/chaos-codex',
    );
  });
});
