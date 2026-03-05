import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Settings from './Settings';
import { useAuthStore } from '../stores/authStore';
import { api } from '../api/client';

// Mock the auth store
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

// Mock the API client
vi.mock('../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock UserModal
vi.mock('../components/UserModal', () => ({
  default: ({ isOpen, onClose, user, onSave }) =>
    isOpen ? (
      <div data-testid="user-modal">
        <div>User Modal {user ? 'Edit' : 'Add'}</div>
        <button onClick={onClose}>Close</button>
        <button onClick={() => onSave({ name: 'Test', email: 'test@example.com' }, user?.id)}>
          Save
        </button>
      </div>
    ) : null,
}));

// Mock navigate and location
const mockNavigate = vi.fn();
const mockLocation = { pathname: '/settings/users' };

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  };
});

describe('Settings', () => {
  const mockUsers = [
    {
      id: 1,
      name: 'Admin User',
      email: 'admin@example.com',
      role: 'admin',
      active: true,
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 2,
      name: 'Regular User',
      email: 'user@example.com',
      role: 'user',
      active: true,
      created_at: '2024-01-02T00:00:00Z',
    },
    {
      id: 3,
      name: 'Owner User',
      email: 'owner@example.com',
      role: 'owner',
      active: true,
      created_at: '2024-01-03T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({
      data: { data: mockUsers },
    });
    api.delete.mockResolvedValue({ data: { success: true } });
    api.post.mockResolvedValue({ data: { success: true } });
    api.put.mockResolvedValue({ data: { success: true } });
    // Mock window.confirm and alert
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
  });

  describe('Permission Logic - canModifyUsers', () => {
    it('shows "Add User" button for admin users', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 1, email: 'admin@example.com', role: 'admin' },
        isAdmin: () => true,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
      });
    });

    it('hides "Add User" button for non-admin users', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 2, email: 'user@example.com', role: 'user' },
        isAdmin: () => false,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.queryByText('Add User')).not.toBeInTheDocument();
      });
    });

    it('shows "View-only access" indicator for non-admin users', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 2, email: 'user@example.com', role: 'user' },
        isAdmin: () => false,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('View-only access')).toBeInTheDocument();
      });
    });

    it('hides "View-only access" indicator for admin users', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 1, email: 'admin@example.com', role: 'admin' },
        isAdmin: () => true,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.queryByText('View-only access')).not.toBeInTheDocument();
      });
    });
  });

  describe('Conditional Rendering - Actions Column', () => {
    it('shows Actions column header for admin users', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 1, email: 'admin@example.com', role: 'admin' },
        isAdmin: () => true,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Actions')).toBeInTheDocument();
      });
    });

    it('hides Actions column header for non-admin users', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 2, email: 'user@example.com', role: 'user' },
        isAdmin: () => false,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.queryByText('Actions')).not.toBeInTheDocument();
      });
    });

    it('shows edit and delete buttons for admin users', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 1, email: 'admin@example.com', role: 'admin' },
        isAdmin: () => true,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        const editButtons = screen.getAllByTitle('Edit user');
        const deleteButtons = screen.getAllByTitle('Delete user');
        expect(editButtons.length).toBeGreaterThan(0);
        expect(deleteButtons.length).toBeGreaterThan(0);
      });
    });

    it('hides edit and delete buttons for non-admin users', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 2, email: 'user@example.com', role: 'user' },
        isAdmin: () => false,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.queryByTitle('Edit user')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Delete user')).not.toBeInTheDocument();
      });
    });
  });

  describe('Admin vs Non-Admin User Behavior', () => {
    it('allows admin users to see all user management features', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 1, email: 'admin@example.com', role: 'admin' },
        isAdmin: () => true,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Add User')).toBeInTheDocument();
        expect(screen.getByText('Actions')).toBeInTheDocument();
        expect(screen.queryByText('View-only access')).not.toBeInTheDocument();
      });
    });

    it('restricts non-admin users to view-only mode', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 2, email: 'user@example.com', role: 'user' },
        isAdmin: () => false,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('View-only access')).toBeInTheDocument();
        expect(screen.queryByText('Add User')).not.toBeInTheDocument();
        expect(screen.queryByText('Actions')).not.toBeInTheDocument();
      });
    });

    it('allows non-admin users to view user list', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 2, email: 'user@example.com', role: 'user' },
        isAdmin: () => false,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
        expect(screen.getByText('Regular User')).toBeInTheDocument();
        expect(screen.getByText('Owner User')).toBeInTheDocument();
      });
    });
  });

  describe('User List Display', () => {
    it('displays user list for all authenticated users', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 2, email: 'user@example.com', role: 'user' },
        isAdmin: () => false,
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
        expect(screen.getByText('admin@example.com')).toBeInTheDocument();
        expect(screen.getByText('Regular User')).toBeInTheDocument();
        expect(screen.getByText('user@example.com')).toBeInTheDocument();
      });
    });

    it('shows loading state while fetching users', () => {
      useAuthStore.mockReturnValue({
        user: { id: 1, email: 'admin@example.com', role: 'admin' },
        isAdmin: () => true,
      });

      api.get.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      // Check for loading spinner (the component uses a spinning div)
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('displays error message when API call fails', async () => {
      useAuthStore.mockReturnValue({
        user: { id: 1, email: 'admin@example.com', role: 'admin' },
        isAdmin: () => true,
      });

      api.get.mockRejectedValue({
        response: {
          data: {
            error: {
              message: 'Failed to load users',
            },
          },
        },
      });

      render(
        <BrowserRouter>
          <Settings />
        </BrowserRouter>,
      );

      await waitFor(() => {
        expect(screen.getByText('Failed to load users')).toBeInTheDocument();
      });
    });
  });
});
