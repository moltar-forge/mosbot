import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '../stores/authStore';

vi.mock('../api/client', () => ({
  getOpenClawIntegrationStatus: vi.fn(),
}));

const { getOpenClawIntegrationStatus } = await import('../api/client');

describe('ProtectedRoute', () => {
  beforeEach(() => {
    // Reset store to default state before each test
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      error: null,
    });
    getOpenClawIntegrationStatus.mockResolvedValue({ ready: true, status: 'ready' });
  });

  it('shows loading state when not initialized', () => {
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: true,
      isInitialized: false,
    });

    render(
      <MemoryRouter>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="*" element={<div>Test Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows loading state when loading', () => {
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: true,
      isInitialized: true,
    });

    render(
      <MemoryRouter>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="*" element={<div>Test Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('redirects to login when not authenticated', () => {
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      isInitialized: true,
    });

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="dashboard" element={<div>Dashboard</div>} />
          </Route>
          <Route path="login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    // Should redirect to login
    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
  });

  it('renders children when authenticated and integration is ready', async () => {
    useAuthStore.setState({
      user: { id: 'u1', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
      isInitialized: true,
    });

    render(
      <MemoryRouter>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="*" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('redirects admin users to pairing setup when integration is not ready', async () => {
    getOpenClawIntegrationStatus.mockResolvedValue({ ready: false, status: 'pending_pairing' });

    useAuthStore.setState({
      user: { id: 'u1', role: 'admin' },
      isAuthenticated: true,
      isLoading: false,
      isInitialized: true,
    });

    render(
      <MemoryRouter initialEntries={['/tasks']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="tasks" element={<div>Tasks Page</div>} />
            <Route path="settings/openclaw-pairing" element={<div>Pairing Setup</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Pairing Setup')).toBeInTheDocument();
    });
  });
});
