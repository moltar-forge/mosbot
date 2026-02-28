import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import TaskView from './TaskView';
import logger from '../utils/logger';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock stores - useTaskStore needs both selector support and getState() for direct store access
// vi.hoisted ensures these exist before vi.mock runs
const { mockFetchTaskById, mockTasks, mockUseTaskStore } = vi.hoisted(() => {
  const mockFetchTaskById = vi.fn();
  const mockTasks = [];
  const createState = () => ({
    fetchTaskById: mockFetchTaskById,
    tasks: mockTasks,
    isLoading: false,
    error: null,
  });
  const mockUseTaskStore = Object.assign(
    (selector) => (typeof selector === 'function' ? selector(createState()) : createState()),
    { getState: () => ({ tasks: mockTasks }) },
  );
  return { mockFetchTaskById, mockTasks, mockUseTaskStore };
});
vi.mock('../stores/taskStore', () => ({
  useTaskStore: mockUseTaskStore,
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  default: {
    error: vi.fn(),
  },
}));

// Mock TaskModal - needs to work with lazy loading
const MockTaskModal = ({ isOpen, onClose, task }) =>
  isOpen ? (
    <div data-testid="task-modal">
      <button onClick={onClose}>Close</button>
      {task && <div>Task: {task.title}</div>}
    </div>
  ) : null;

vi.mock('../components/TaskModal', () => ({
  default: MockTaskModal,
}));

describe('TaskView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockClear();
    mockTasks.length = 0;
  });

  it('loads task from store when available', async () => {
    const existingTask = { id: '1', title: 'Existing Task', status: 'TODO' };
    mockTasks.push(existingTask);

    render(
      <MemoryRouter initialEntries={['/task/1']}>
        <Routes>
          <Route path="/task/:id" element={<TaskView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('task-modal')).toBeInTheDocument();
        expect(screen.getByText('Task: Existing Task')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('fetches task from API when not in store', async () => {
    const fetchedTask = { id: '2', title: 'Fetched Task', status: 'TODO' };
    mockFetchTaskById.mockResolvedValue(fetchedTask);

    render(
      <MemoryRouter initialEntries={['/task/2']}>
        <Routes>
          <Route path="/task/:id" element={<TaskView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(mockFetchTaskById).toHaveBeenCalledWith('2');
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('task-modal')).toBeInTheDocument();
        expect(screen.getByText('Task: Fetched Task')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('shows loading state', async () => {
    // Task not in store - fetchTaskById will be called. Never resolve so we stay in loading state
    mockFetchTaskById.mockImplementation(() => new Promise(() => {}));

    render(
      <MemoryRouter initialEntries={['/task/1']}>
        <Routes>
          <Route path="/task/:id" element={<TaskView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(screen.getByText('Loading task...')).toBeInTheDocument();
      },
      { timeout: 500 },
    );
  });

  it('shows error state', async () => {
    mockFetchTaskById.mockRejectedValue(new Error('Task not found'));

    render(
      <MemoryRouter initialEntries={['/task/1']}>
        <Routes>
          <Route path="/task/:id" element={<TaskView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(screen.getByText('Error loading task')).toBeInTheDocument();
        expect(screen.getByText('Task not found')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it('navigates to dashboard when close button is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup({ delay: null });

    const existingTask = { id: '1', title: 'Task', status: 'TODO' };
    mockTasks.push(existingTask);

    render(
      <MemoryRouter initialEntries={['/task/1']}>
        <Routes>
          <Route path="/task/:id" element={<TaskView />} />
          <Route path="/" element={<div>Dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(screen.getByTestId('task-modal')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const closeButton = screen.getByText('Close');
    await user.click(closeButton);

    // Wait for navigation delay
    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      },
      { timeout: 1000 },
    );
  });

  it('logs error when task fetch fails', async () => {
    const error = new Error('Fetch failed');
    mockFetchTaskById.mockRejectedValue(error);

    render(
      <MemoryRouter initialEntries={['/task/1']}>
        <Routes>
          <Route path="/task/:id" element={<TaskView />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(
      () => {
        expect(logger.error).toHaveBeenCalledWith('Failed to load task', error);
      },
      { timeout: 3000 },
    );
  });

  it('does not load task when id is not provided', () => {
    render(
      <MemoryRouter initialEntries={['/task']}>
        <Routes>
          <Route path="/task/:id?" element={<TaskView />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(mockFetchTaskById).not.toHaveBeenCalled();
  });
});
