import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Header from './Header';
import { useTaskStore } from '../stores/taskStore';

// Mock taskStore
vi.mock('../stores/taskStore', () => ({
  useTaskStore: vi.fn(),
}));

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaskStore.mockReturnValue({
      isRefreshing: false,
      lastFetchedAt: null,
    });
  });

  it('renders title', () => {
    render(<Header title="Test Title" />);

    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<Header title="Title" subtitle="Subtitle text" />);

    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
  });

  it('does not render subtitle when not provided', () => {
    render(<Header title="Title" />);

    expect(screen.queryByText(/Subtitle/)).not.toBeInTheDocument();
  });

  it('renders create task button when onCreateTask is provided', () => {
    const mockOnCreateTask = vi.fn();
    render(<Header title="Title" onCreateTask={mockOnCreateTask} />);

    expect(screen.getByText('New Task')).toBeInTheDocument();
  });

  it('calls onCreateTask when create button is clicked', async () => {
    const user = userEvent.setup();
    const mockOnCreateTask = vi.fn();
    render(<Header title="Title" onCreateTask={mockOnCreateTask} />);

    const createButton = screen.getByText('New Task');
    await user.click(createButton);

    expect(mockOnCreateTask).toHaveBeenCalledTimes(1);
  });

  it('does not render create button when onCreateTask is not provided', () => {
    render(<Header title="Title" />);

    expect(screen.queryByText('New Task')).not.toBeInTheDocument();
  });

  it('renders search input when onSearchChange is provided', () => {
    const mockOnSearchChange = vi.fn();
    render(<Header title="Title" onSearchChange={mockOnSearchChange} />);

    expect(screen.getByPlaceholderText('Search tasks...')).toBeInTheDocument();
  });

  it('calls onSearchChange when search input changes', async () => {
    const user = userEvent.setup();
    const mockOnSearchChange = vi.fn();
    render(<Header title="Title" onSearchChange={mockOnSearchChange} />);

    const searchInput = screen.getByPlaceholderText('Search tasks...');
    await user.type(searchInput, 'test');

    expect(mockOnSearchChange).toHaveBeenCalled();
  });

  it('displays search value', () => {
    const mockOnSearchChange = vi.fn();
    render(
      <Header title="Title" searchValue="current search" onSearchChange={mockOnSearchChange} />,
    );

    const searchInput = screen.getByPlaceholderText('Search tasks...');
    expect(searchInput).toHaveValue('current search');
  });

  it('uses empty string for search value when not provided', () => {
    const mockOnSearchChange = vi.fn();
    render(<Header title="Title" onSearchChange={mockOnSearchChange} />);

    const searchInput = screen.getByPlaceholderText('Search tasks...');
    expect(searchInput).toHaveValue('');
  });

  it('does not render search input when onSearchChange is not provided', () => {
    render(<Header title="Title" />);

    expect(screen.queryByPlaceholderText('Search tasks...')).not.toBeInTheDocument();
  });

  it('renders both search and create button when both props provided', () => {
    const mockOnCreateTask = vi.fn();
    const mockOnSearchChange = vi.fn();
    render(
      <Header title="Title" onCreateTask={mockOnCreateTask} onSearchChange={mockOnSearchChange} />,
    );

    expect(screen.getByText('New Task')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search tasks...')).toBeInTheDocument();
  });

  describe('refresh button', () => {
    it('renders refresh button when onRefresh is provided', () => {
      const mockOnRefresh = vi.fn();
      render(<Header title="Title" onRefresh={mockOnRefresh} />);

      expect(screen.getByTitle('Refresh')).toBeInTheDocument();
    });

    it('does not render refresh button when onRefresh is not provided', () => {
      render(<Header title="Title" />);

      expect(screen.queryByTitle('Refresh')).not.toBeInTheDocument();
    });

    it('calls onRefresh when refresh button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnRefresh = vi.fn().mockResolvedValue(undefined);
      render(<Header title="Title" onRefresh={mockOnRefresh} />);

      const refreshButton = screen.getByTitle('Refresh');
      await user.click(refreshButton);

      expect(mockOnRefresh).toHaveBeenCalledTimes(1);
    });

    it('disables refresh button when isRefreshing is true', () => {
      useTaskStore.mockReturnValue({
        isRefreshing: true,
        lastFetchedAt: Date.now(),
      });
      const mockOnRefresh = vi.fn();
      render(<Header title="Title" onRefresh={mockOnRefresh} />);

      const refreshButton = screen.getByTitle('Refresh');
      expect(refreshButton).toBeDisabled();
    });

    it('disables refresh button when manual refresh is in progress', async () => {
      const user = userEvent.setup();
      let resolveRefresh;
      const mockOnRefresh = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      );
      render(<Header title="Title" onRefresh={mockOnRefresh} />);

      const refreshButton = screen.getByTitle('Refresh');
      expect(refreshButton).not.toBeDisabled();

      // Start refresh
      const clickPromise = user.click(refreshButton);
      await waitFor(() => {
        expect(refreshButton).toBeDisabled();
      });

      // Complete refresh
      resolveRefresh();
      await clickPromise;
      await waitFor(() => {
        expect(refreshButton).not.toBeDisabled();
      });
    });

    it('shows spinning animation when refreshing', () => {
      useTaskStore.mockReturnValue({
        isRefreshing: true,
        lastFetchedAt: Date.now(),
      });
      render(<Header title="Title" onRefresh={vi.fn()} />);

      const refreshButton = screen.getByTitle('Refresh');
      const icon = refreshButton.querySelector('svg');
      expect(icon).toHaveClass('animate-spin');
    });

    it('displays last updated time when lastFetchedAt is available', () => {
      const now = Date.now();
      useTaskStore.mockReturnValue({
        isRefreshing: false,
        lastFetchedAt: now,
      });
      render(<Header title="Title" onRefresh={vi.fn()} />);

      expect(screen.getByText(/Updated/)).toBeInTheDocument();
    });

    it('displays "Just now" for recent updates', () => {
      const now = Date.now();
      useTaskStore.mockReturnValue({
        isRefreshing: false,
        lastFetchedAt: now,
      });
      render(<Header title="Title" onRefresh={vi.fn()} />);

      expect(screen.getByText(/Just now/)).toBeInTheDocument();
    });

    it('displays minutes ago for older updates', () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      useTaskStore.mockReturnValue({
        isRefreshing: false,
        lastFetchedAt: fiveMinutesAgo,
      });
      render(<Header title="Title" onRefresh={vi.fn()} />);

      expect(screen.getByText(/5m ago/)).toBeInTheDocument();
    });

    it('does not display last updated when lastFetchedAt is null', () => {
      useTaskStore.mockReturnValue({
        isRefreshing: false,
        lastFetchedAt: null,
      });
      render(<Header title="Title" onRefresh={vi.fn()} />);

      expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
    });
  });
});
