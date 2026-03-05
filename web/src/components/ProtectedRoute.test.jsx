import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { useAuthStore } from '../stores/authStore';

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

  it('renders children when authenticated', () => {
    useAuthStore.setState({
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

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });
});
