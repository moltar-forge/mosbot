import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import { useTaskStore } from '../stores/taskStore';

// Mock stores
vi.mock('../stores/taskStore', () => ({
  useTaskStore: vi.fn(),
}));

// Mock components
vi.mock('../components/KanbanBoard', () => ({
  default: ({ onTaskClick }) => (
    <div data-testid="kanban-board">
      <button onClick={() => onTaskClick({ id: 1, title: 'Test Task' })}>Click Task</button>
    </div>
  ),
}));

vi.mock('../components/Header', () => ({
  default: ({ title, onCreateTask, searchValue, onSearchChange }) => (
    <div data-testid="header">
      <h1>{title}</h1>
      <button onClick={onCreateTask}>Create Task</button>
      <input
        data-testid="search-input"
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('../components/TaskModal', () => ({
  default: ({ isOpen, onClose, task }) =>
    isOpen ? (
      <div data-testid="task-modal">
        <button onClick={onClose}>Close</button>
        {task ? <div>Editing: {task.title}</div> : <div>Creating new task</div>}
      </div>
    ) : null,
}));

describe('Dashboard', () => {
  const mockFetchTasks = vi.fn();
  const mockRefreshTasks = vi.fn();
  const mockSetSearchQuery = vi.fn();
  const mockGetState = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetState.mockReturnValue({ tasks: [] });
    useTaskStore.mockReturnValue({
      fetchTasks: mockFetchTasks,
      refreshTasks: mockRefreshTasks,
      isLoading: false,
      error: null,
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
      tasks: [],
      getState: mockGetState,
    });
    useTaskStore.getState = mockGetState;
  });

  it('renders dashboard with header', () => {
    render(<Dashboard />);

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders kanban board', () => {
    render(<Dashboard />);

    expect(screen.getByTestId('kanban-board')).toBeInTheDocument();
  });

  it('fetches tasks on mount', () => {
    render(<Dashboard />);

    expect(mockFetchTasks).toHaveBeenCalledTimes(1);
  });

  it('shows loading state when loading and no tasks', () => {
    mockGetState.mockReturnValue({ tasks: [] });
    useTaskStore.mockReturnValue({
      fetchTasks: mockFetchTasks,
      isLoading: true,
      error: null,
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
      tasks: [],
      getState: mockGetState,
    });
    useTaskStore.getState = mockGetState;

    render(<Dashboard />);

    expect(screen.getByText('Loading tasks...')).toBeInTheDocument();
  });

  it('does not show loading when tasks exist', () => {
    const tasks = [{ id: 1, title: 'Task 1' }];
    mockGetState.mockReturnValue({ tasks });
    useTaskStore.mockReturnValue({
      fetchTasks: mockFetchTasks,
      isLoading: true,
      error: null,
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
      tasks,
      getState: mockGetState,
    });
    useTaskStore.getState = mockGetState;

    render(<Dashboard />);

    expect(screen.queryByText('Loading tasks...')).not.toBeInTheDocument();
  });

  it('shows error state when error occurs', () => {
    useTaskStore.mockReturnValue({
      fetchTasks: mockFetchTasks,
      isLoading: false,
      error: 'Failed to load tasks',
      searchQuery: '',
      setSearchQuery: mockSetSearchQuery,
      tasks: [],
    });

    render(<Dashboard />);

    expect(screen.getByText('Error loading tasks')).toBeInTheDocument();
    expect(screen.getByText('Failed to load tasks')).toBeInTheDocument();
  });

  it('opens modal when create task is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    render(<Dashboard />);

    const createButton = screen.getByText('Create Task');
    await user.click(createButton);

    await waitFor(() => {
      expect(screen.getByTestId('task-modal')).toBeInTheDocument();
      expect(screen.getByText('Creating new task')).toBeInTheDocument();
    });
  });

  it('opens modal with task when task is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    render(<Dashboard />);

    const taskButton = screen.getByText('Click Task');
    await user.click(taskButton);

    await waitFor(() => {
      expect(screen.getByTestId('task-modal')).toBeInTheDocument();
      expect(screen.getByText('Editing: Test Task')).toBeInTheDocument();
    });
  });

  it('closes modal when close is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    render(<Dashboard />);

    // Open modal
    const createButton = screen.getByText('Create Task');
    await user.click(createButton);

    expect(screen.getByTestId('task-modal')).toBeInTheDocument();

    // Close modal
    const closeButton = screen.getByText('Close');
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByTestId('task-modal')).not.toBeInTheDocument();
    });
  });

  it('passes search query to header', () => {
    useTaskStore.mockReturnValue({
      fetchTasks: mockFetchTasks,
      isLoading: false,
      error: null,
      searchQuery: 'test query',
      setSearchQuery: mockSetSearchQuery,
      tasks: [],
    });

    render(<Dashboard />);

    const searchInput = screen.getByTestId('search-input');
    expect(searchInput).toHaveValue('test query');
  });

  it('updates search query when header search changes', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    render(<Dashboard />);

    const searchInput = screen.getByTestId('search-input');
    await user.type(searchInput, 'new search');

    expect(mockSetSearchQuery).toHaveBeenCalled();
  });

  describe('auto-refresh polling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sets up polling interval on mount', () => {
      render(<Dashboard />);

      // Initial fetch should be called
      expect(mockFetchTasks).toHaveBeenCalledTimes(1);
      expect(mockRefreshTasks).not.toHaveBeenCalled();

      // Advance timer by 30 seconds (POLLING_INTERVAL)
      vi.advanceTimersByTime(30000);

      // refreshTasks should be called after interval
      expect(mockRefreshTasks).toHaveBeenCalledTimes(1);
    });

    it('calls refreshTasks at polling interval', () => {
      render(<Dashboard />);

      // Advance timer multiple intervals
      vi.advanceTimersByTime(30000);
      expect(mockRefreshTasks).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(30000);
      expect(mockRefreshTasks).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(30000);
      expect(mockRefreshTasks).toHaveBeenCalledTimes(3);
    });

    it('cleans up polling interval on unmount', () => {
      const { unmount } = render(<Dashboard />);

      // Advance timer once
      vi.advanceTimersByTime(30000);
      expect(mockRefreshTasks).toHaveBeenCalledTimes(1);

      // Unmount component
      unmount();

      // Advance timer again - should not call refreshTasks
      vi.advanceTimersByTime(30000);
      expect(mockRefreshTasks).toHaveBeenCalledTimes(1);
    });
  });

  describe('visibility change handler', () => {
    it('refreshes tasks when tab becomes visible', () => {
      render(<Dashboard />);

      // Simulate tab becoming hidden
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(mockRefreshTasks).not.toHaveBeenCalled();

      // Simulate tab becoming visible
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        configurable: true,
        value: 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(mockRefreshTasks).toHaveBeenCalledTimes(1);
    });

    it('does not refresh when tab becomes hidden', () => {
      render(<Dashboard />);

      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        configurable: true,
        value: 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(mockRefreshTasks).not.toHaveBeenCalled();
    });

    it('cleans up visibility change listener on unmount', () => {
      const { unmount } = render(<Dashboard />);

      // Remove the component
      unmount();

      // Try to trigger visibility change - should not call refreshTasks
      Object.defineProperty(document, 'visibilityState', {
        writable: true,
        configurable: true,
        value: 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // refreshTasks should only be called from initial mount polling, not from visibility change
      expect(mockRefreshTasks).not.toHaveBeenCalled();
    });
  });
});
