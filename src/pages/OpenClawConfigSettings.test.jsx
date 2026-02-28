import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import OpenClawConfigSettings from './OpenClawConfigSettings';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import { getOpenClawConfig, updateOpenClawConfig, listOpenClawConfigBackups } from '../api/client';

vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../stores/toastStore', () => ({
  useToastStore: vi.fn(),
}));

vi.mock('../api/client', () => ({
  getOpenClawConfig: vi.fn(),
  updateOpenClawConfig: vi.fn(),
  listOpenClawConfigBackups: vi.fn(),
  getOpenClawConfigBackupContent: vi.fn(),
}));

// Monaco editor is a large dependency — stub it out in tests
vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, options }) => (
    <textarea
      data-testid="monaco-editor"
      value={value}
      readOnly={options?.readOnly}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}));

vi.mock('../components/MobileNavContext', () => ({
  useMobileNav: () => null,
}));

vi.mock('../utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockConfig = {
  raw: '{ "agents": [] }',
  hash: 'abc123',
};

const renderPage = () =>
  render(
    <BrowserRouter>
      <OpenClawConfigSettings />
    </BrowserRouter>,
  );

describe('OpenClawConfigSettings', () => {
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useToastStore.mockReturnValue({ showToast: mockShowToast });
    getOpenClawConfig.mockResolvedValue(mockConfig);
    listOpenClawConfigBackups.mockResolvedValue([]);
  });

  describe('Loading state', () => {
    it('shows a loading spinner while config is being fetched', () => {
      getOpenClawConfig.mockImplementation(() => new Promise(() => {}));
      useAuthStore.mockReturnValue({ user: { role: 'admin' } });

      renderPage();

      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('Admin / Owner access', () => {
    beforeEach(() => {
      useAuthStore.mockReturnValue({ user: { role: 'admin' } });
    });

    it('renders the editor with config content after loading', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      expect(screen.getByTestId('monaco-editor').value).toBe(mockConfig.raw);
    });

    it('does not show the read-only access banner for admin', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByText(/read-only access/i)).not.toBeInTheDocument();
      });
    });

    it('shows the Save & Apply button for admin', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Save & Apply')).toBeInTheDocument();
      });
    });

    it('disables Save & Apply when there are no unsaved changes', async () => {
      renderPage();

      await waitFor(() => {
        const saveBtn = screen.getByText('Save & Apply').closest('button');
        expect(saveBtn).toBeDisabled();
      });
    });

    it('enables Save & Apply after editing the config', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('monaco-editor'), {
        target: { value: '{ "agents": [{}] }' },
      });

      const saveBtn = screen.getByText('Save & Apply').closest('button');
      expect(saveBtn).not.toBeDisabled();
    });

    it('shows the config hash after loading', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/abc123/)).toBeInTheDocument();
      });
    });
  });

  describe('Non-admin / read-only access', () => {
    beforeEach(() => {
      useAuthStore.mockReturnValue({ user: { role: 'user' } });
    });

    it('shows the read-only access banner for non-admin', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText(/read-only access/i)).toBeInTheDocument();
      });
    });

    it('does not show the Save & Apply button for non-admin', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.queryByText('Save & Apply')).not.toBeInTheDocument();
      });
    });

    it('renders the editor in read-only mode for non-admin', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      expect(screen.getByTestId('monaco-editor')).toHaveAttribute('readonly');
    });
  });

  describe('Load error handling', () => {
    beforeEach(() => {
      useAuthStore.mockReturnValue({ user: { role: 'admin' } });
    });

    it('shows an error banner when config fails to load', async () => {
      getOpenClawConfig.mockRejectedValue({
        message: 'Network error',
        response: { data: { error: { message: 'Failed to load config' } } },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Failed to load config')).toBeInTheDocument();
      });
    });

    it('shows a Retry button on load error', async () => {
      getOpenClawConfig.mockRejectedValue({ message: 'Network error' });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });
  });

  describe('History drawer', () => {
    beforeEach(() => {
      useAuthStore.mockReturnValue({ user: { role: 'admin' } });
    });

    it('opens the history drawer when History button is clicked', async () => {
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('History')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('History'));

      await waitFor(() => {
        expect(screen.getByText('Config History')).toBeInTheDocument();
      });
    });

    it('shows empty state when no backups exist', async () => {
      listOpenClawConfigBackups.mockResolvedValue([]);
      renderPage();

      await waitFor(() => {
        expect(screen.getByText('History')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('History'));

      await waitFor(() => {
        expect(screen.getByText('No backups yet.')).toBeInTheDocument();
      });
    });
  });

  describe('Save flow', () => {
    beforeEach(() => {
      useAuthStore.mockReturnValue({ user: { role: 'admin' } });
    });

    it('calls updateOpenClawConfig with raw content and baseHash on save', async () => {
      updateOpenClawConfig.mockResolvedValue({ hash: 'newHash123', backupPath: '/backups/x' });
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('monaco-editor'), {
        target: { value: '{ "agents": [{}] }' },
      });

      fireEvent.click(screen.getByText('Save & Apply').closest('button'));

      await waitFor(() => {
        expect(updateOpenClawConfig).toHaveBeenCalledWith({
          raw: '{ "agents": [{}] }',
          baseHash: mockConfig.hash,
          note: undefined,
        });
      });
    });

    it('shows a success toast after a successful save', async () => {
      updateOpenClawConfig.mockResolvedValue({ hash: 'newHash123', backupPath: '/backups/x' });
      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('monaco-editor'), {
        target: { value: '{ "agents": [{}] }' },
      });

      fireEvent.click(screen.getByText('Save & Apply').closest('button'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(
          expect.stringContaining('applied successfully'),
          'success',
        );
      });
    });

    it('shows a conflict banner on 409 response', async () => {
      updateOpenClawConfig.mockRejectedValue({
        response: {
          status: 409,
          data: {
            error: { message: 'Config conflict detected.' },
            data: { raw: '{ "agents": [] }', hash: 'conflictHash' },
          },
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('monaco-editor'), {
        target: { value: '{ "agents": [{}] }' },
      });

      fireEvent.click(screen.getByText('Save & Apply').closest('button'));

      await waitFor(() => {
        expect(screen.getByText('Config conflict detected')).toBeInTheDocument();
      });
    });

    it('shows a validation error banner on 400 response', async () => {
      updateOpenClawConfig.mockRejectedValue({
        response: {
          status: 400,
          data: {
            error: { message: 'Invalid JSON5 syntax.' },
          },
        },
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('monaco-editor'), {
        target: { value: 'not valid json' },
      });

      fireEvent.click(screen.getByText('Save & Apply').closest('button'));

      await waitFor(() => {
        expect(screen.getByText('Invalid JSON5 syntax.')).toBeInTheDocument();
      });
    });
  });
});
