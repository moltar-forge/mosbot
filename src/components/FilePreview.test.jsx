import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import FilePreview from './FilePreview';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';

// Mock the stores
vi.mock('../stores/workspaceStore', () => ({
  useWorkspaceStore: vi.fn(),
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../stores/toastStore', () => ({
  useToastStore: vi.fn(),
}));

describe('FilePreview', () => {
  const mockFetchFileContent = vi.fn();
  const mockUpdateFile = vi.fn();
  const mockShowToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // fetchFileContent must return a Promise so .catch() works (called in useEffect)
    mockFetchFileContent.mockResolvedValue({ content: '', encoding: 'utf8' });
    useAuthStore.mockReturnValue({
      isAdmin: () => false,
    });
    useToastStore.mockReturnValue({
      showToast: mockShowToast,
    });
    useWorkspaceStore.mockReturnValue({
      fileContents: {},
      isLoadingContent: false,
      contentError: null,
      fetchFileContent: mockFetchFileContent,
      updateFile: mockUpdateFile,
      fetchListing: vi.fn().mockResolvedValue({}),
    });
  });

  describe('403 Error Handling', () => {
    it('detects 403 error and shows restricted view', () => {
      const mockFile = {
        id: 1,
        name: 'restricted.md',
        path: '/restricted.md',
        type: 'file',
      };

      useWorkspaceStore.mockReturnValue({
        fileContents: {},
        isLoadingContent: false,
        contentError: 'Admin access required',
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
        fetchListing: vi.fn().mockResolvedValue({}),
      });

      render(<FilePreview file={mockFile} />);

      expect(screen.getByText('File Access Restricted')).toBeInTheDocument();
      expect(
        screen.getByText(/You don't have permission to view the contents of this file/),
      ).toBeInTheDocument();
      expect(screen.getByText('Access restricted')).toBeInTheDocument();
    });

    it('detects 403 error from error message containing "403"', () => {
      const mockFile = {
        id: 1,
        name: 'restricted.md',
        path: '/restricted.md',
        type: 'file',
      };

      useWorkspaceStore.mockReturnValue({
        fileContents: {},
        isLoadingContent: false,
        contentError: 'Error 403: Forbidden',
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
        fetchListing: vi.fn().mockResolvedValue({}),
      });

      render(<FilePreview file={mockFile} />);

      expect(screen.getByText('File Access Restricted')).toBeInTheDocument();
    });

    it('detects 403 error from error message containing "Forbidden"', () => {
      const mockFile = {
        id: 1,
        name: 'restricted.md',
        path: '/restricted.md',
        type: 'file',
      };

      useWorkspaceStore.mockReturnValue({
        fileContents: {},
        isLoadingContent: false,
        contentError: 'Forbidden access',
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
        fetchListing: vi.fn().mockResolvedValue({}),
      });

      render(<FilePreview file={mockFile} />);

      expect(screen.getByText('File Access Restricted')).toBeInTheDocument();
    });

    it('renders mosaic overlay for 403 errors', () => {
      const mockFile = {
        id: 1,
        name: 'restricted.md',
        path: '/restricted.md',
        type: 'file',
      };

      useWorkspaceStore.mockReturnValue({
        fileContents: {},
        isLoadingContent: false,
        contentError: 'Admin access required',
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
        fetchListing: vi.fn().mockResolvedValue({}),
      });

      const { container } = render(<FilePreview file={mockFile} />);

      // Check for mosaic pattern (grid with multiple divs)
      const mosaicContainer = container.querySelector('.grid.grid-cols-12');
      expect(mosaicContainer).toBeInTheDocument();
    });

    it('shows file name and access restricted message in header for 403 errors', () => {
      const mockFile = {
        id: 1,
        name: 'restricted.md',
        path: '/restricted.md',
        type: 'file',
      };

      useWorkspaceStore.mockReturnValue({
        fileContents: {},
        isLoadingContent: false,
        contentError: 'Admin access required',
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
        fetchListing: vi.fn().mockResolvedValue({}),
      });

      render(<FilePreview file={mockFile} />);

      expect(screen.getByText('restricted.md')).toBeInTheDocument();
      expect(screen.getByText('Access restricted')).toBeInTheDocument();
    });
  });

  describe('Generic Error Handling', () => {
    it('shows generic error message for non-403 errors', () => {
      const mockFile = {
        id: 1,
        name: 'error.md',
        path: '/error.md',
        type: 'file',
      };

      useWorkspaceStore.mockReturnValue({
        fileContents: {},
        isLoadingContent: false,
        contentError: 'Network error occurred',
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
        fetchListing: vi.fn().mockResolvedValue({}),
      });

      render(<FilePreview file={mockFile} />);

      expect(screen.getByText('Failed to load file')).toBeInTheDocument();
      expect(screen.getByText('Network error occurred')).toBeInTheDocument();
      expect(screen.queryByText('File Access Restricted')).not.toBeInTheDocument();
    });

    it('does not show mosaic overlay for non-403 errors', () => {
      const mockFile = {
        id: 1,
        name: 'error.md',
        path: '/error.md',
        type: 'file',
      };

      useWorkspaceStore.mockReturnValue({
        fileContents: {},
        isLoadingContent: false,
        contentError: 'Network error occurred',
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
        fetchListing: vi.fn().mockResolvedValue({}),
      });

      const { container } = render(<FilePreview file={mockFile} />);

      const mosaicContainer = container.querySelector('.grid.grid-cols-12');
      expect(mosaicContainer).not.toBeInTheDocument();
    });
  });

  describe('Toast Notification for Non-403 Errors', () => {
    it('shows toast notification when fetchFileContent fails with non-403 error', async () => {
      const mockFile = {
        id: 1,
        name: 'test.md',
        path: '/test.md',
        type: 'file',
      };

      const mockError = {
        response: {
          status: 500,
          data: {
            error: {
              message: 'Server error',
            },
          },
        },
      };

      mockFetchFileContent.mockRejectedValue(mockError);

      useWorkspaceStore.mockReturnValue({
        fileContents: {},
        isLoadingContent: false,
        contentError: null,
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
      });

      render(<FilePreview file={mockFile} />);

      await waitFor(() => {
        expect(mockFetchFileContent).toHaveBeenCalledWith(
          expect.objectContaining({ path: '/test.md' }),
        );
      });

      // Wait a bit for the error handling to complete
      await waitFor(
        () => {
          expect(mockShowToast).toHaveBeenCalledWith('Server error', 'error');
        },
        { timeout: 1000 },
      );
    });

    it('does not show toast notification for 403 errors', async () => {
      const mockFile = {
        id: 1,
        name: 'restricted.md',
        path: '/restricted.md',
        type: 'file',
      };

      const mockError = {
        response: {
          status: 403,
          data: {
            error: {
              message: 'Admin access required',
            },
          },
        },
      };

      mockFetchFileContent.mockRejectedValue(mockError);

      useWorkspaceStore.mockReturnValue({
        fileContents: {},
        isLoadingContent: false,
        contentError: null,
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
      });

      render(<FilePreview file={mockFile} />);

      await waitFor(() => {
        expect(mockFetchFileContent).toHaveBeenCalledWith(
          expect.objectContaining({ path: '/restricted.md' }),
        );
      });

      // Wait a bit to ensure toast is not called
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
      });

      // Toast should not be called for 403 errors
      expect(mockShowToast).not.toHaveBeenCalled();
    });
  });

  describe('File Content Display', () => {
    it('displays file content when successfully loaded', () => {
      const mockFile = {
        id: 1,
        name: 'test.md',
        path: '/test.md',
        type: 'file',
      };

      // FilePreview uses cache key `${agentId}:${path}` (default agentId is 'coo')
      useWorkspaceStore.mockReturnValue({
        fileContents: {
          'coo:/test.md': {
            content: '# Test Content',
            size: 1024,
            modified: '2024-01-01T00:00:00Z',
            encoding: 'utf8',
          },
        },
        isLoadingContent: false,
        contentError: null,
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
      });

      render(<FilePreview file={mockFile} />);

      expect(screen.getByText('test.md')).toBeInTheDocument();
      // ReactMarkdown renders "# Test Content" as an h1 with text "Test Content"
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('shows loading state while fetching content', () => {
      const mockFile = {
        id: 1,
        name: 'test.md',
        path: '/test.md',
        type: 'file',
      };

      useWorkspaceStore.mockReturnValue({
        fileContents: {},
        isLoadingContent: true,
        contentError: null,
        fetchFileContent: mockFetchFileContent,
        updateFile: mockUpdateFile,
      });

      render(<FilePreview file={mockFile} />);

      expect(screen.getByText('Loading file...')).toBeInTheDocument();
    });
  });
});
