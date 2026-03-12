import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Projects from './Projects';

vi.mock('../api/client', () => ({
  getProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({ isAdmin: () => true }),
}));

vi.mock('../stores/toastStore', () => ({
  useToastStore: () => ({ showToast: vi.fn() }),
}));

const { getProjects } = await import('../api/client');

describe('Projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders registry summary and project cards', async () => {
    getProjects.mockResolvedValue([
      {
        id: 'p1',
        slug: 'chaos-codex',
        name: 'Chaos Codex',
        description: 'BRP companion app',
        root_path: '/projects/chaos-codex',
        status: 'active',
        assigned_agents: 3,
        updated_at: '2026-03-12T19:00:00.000Z',
      },
      {
        id: 'p2',
        slug: 'old-project',
        name: 'Old Project',
        description: '',
        root_path: '/projects/old-project',
        status: 'archived',
        assigned_agents: 0,
        updated_at: '2026-03-01T19:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Project Registry')).toBeInTheDocument();
    });

    expect(screen.getByText('Chaos Codex')).toBeInTheDocument();
    expect(screen.getByText('Old Project')).toBeInTheDocument();
    const openLinks = screen.getAllByRole('link', { name: /open project/i });
    expect(openLinks[0]).toHaveAttribute('href', '/projects/chaos-codex');
    expect(screen.getByText('Active projects')).toBeInTheDocument();
    expect(screen.getByText('Archived projects')).toBeInTheDocument();
    expect(screen.getByText('Total assigned agents')).toBeInTheDocument();
  });
});
