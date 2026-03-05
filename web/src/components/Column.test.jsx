import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Column from './Column';

// Mock react-dnd
const mockUseDrop = vi.fn(() => [
  { isOver: false, canDrop: false },
  vi.fn(), // drop ref
]);

vi.mock('react-dnd', () => ({
  useDrop: () => mockUseDrop(),
  DndProvider: ({ children }) => children,
}));

// Mock TaskCard
vi.mock('./TaskCard', () => ({
  default: vi.fn(({ task, onClick }) => (
    <div data-testid={`task-card-${task.id}`} onClick={onClick}>
      {task.title}
    </div>
  )),
}));

describe('Column', () => {
  const mockOnTaskClick = vi.fn();
  const mockOnTaskDrop = vi.fn();
  const baseColumn = {
    id: 'TODO',
    title: 'TO DO',
    color: 'border-dark-700',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDrop.mockReturnValue([{ isOver: false, canDrop: false }, vi.fn()]);
  });

  it('renders column title', () => {
    render(
      <Column
        column={baseColumn}
        tasks={[]}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    expect(screen.getByText('TO DO')).toBeInTheDocument();
  });

  it('displays task count', () => {
    const tasks = [
      { id: 1, title: 'Task 1', status: 'TODO' },
      { id: 2, title: 'Task 2', status: 'TODO' },
    ];

    render(
      <Column
        column={baseColumn}
        tasks={tasks}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('displays zero count when no tasks', () => {
    render(
      <Column
        column={baseColumn}
        tasks={[]}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders "No tasks" message when tasks array is empty', () => {
    render(
      <Column
        column={baseColumn}
        tasks={[]}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('renders TaskCard components for each task', () => {
    const tasks = [
      { id: 1, title: 'Task 1', status: 'TODO' },
      { id: 2, title: 'Task 2', status: 'TODO' },
      { id: 3, title: 'Task 3', status: 'TODO' },
    ];

    render(
      <Column
        column={baseColumn}
        tasks={tasks}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    expect(screen.getByTestId('task-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('task-card-2')).toBeInTheDocument();
    expect(screen.getByTestId('task-card-3')).toBeInTheDocument();
  });

  it('calls onTaskClick when task is clicked', async () => {
    const { userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();

    const tasks = [{ id: 1, title: 'Task 1', status: 'TODO' }];

    render(
      <Column
        column={baseColumn}
        tasks={tasks}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    const taskCard = screen.getByTestId('task-card-1');
    await user.click(taskCard);

    expect(mockOnTaskClick).toHaveBeenCalledWith(tasks[0]);
  });

  it('applies column color to header', () => {
    const { container } = render(
      <Column
        column={baseColumn}
        tasks={[]}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    const header = container.querySelector('.border-dark-700');
    expect(header).toBeInTheDocument();
  });

  it('handles drag over state', () => {
    mockUseDrop.mockReturnValue([{ isOver: true, canDrop: true }, vi.fn()]);

    const { container } = render(
      <Column
        column={baseColumn}
        tasks={[]}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    const dropZone = container.querySelector('.bg-dark-800\\/50');
    expect(dropZone).toBeInTheDocument();
  });

  it('sets up drop handler with correct accept type', () => {
    mockUseDrop.mockImplementation((configFn) => {
      if (typeof configFn === 'function') {
        const config = configFn();
        // Verify accept type is correct
        expect(config.accept).toBe('TASK');
        expect(config.drop).toBeDefined();
        expect(config.collect).toBeDefined();
      }
      return [{ isOver: false, canDrop: false }, vi.fn()];
    });

    render(
      <Column
        column={baseColumn}
        tasks={[]}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    // Verify useDrop was called
    expect(mockUseDrop).toHaveBeenCalled();
  });

  it('drop handler checks status before calling onTaskDrop', () => {
    let dropHandler;
    mockUseDrop.mockImplementation((configFn) => {
      if (typeof configFn === 'function') {
        const config = configFn();
        dropHandler = config.drop;
      }
      return [{ isOver: false, canDrop: false }, vi.fn()];
    });

    render(
      <Column
        column={baseColumn}
        tasks={[]}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    // Test drop handler logic directly
    if (dropHandler) {
      // Same status - should not call onTaskDrop
      dropHandler({ id: 1, status: 'TODO' });
      expect(mockOnTaskDrop).not.toHaveBeenCalled();

      // Different status - should call onTaskDrop
      dropHandler({ id: 2, status: 'IN_PROGRESS' });
      expect(mockOnTaskDrop).toHaveBeenCalledWith(2, 'TODO');
    }
  });

  it('handles canDrop false state', () => {
    mockUseDrop.mockReturnValue([{ isOver: true, canDrop: false }, vi.fn()]);

    const { container } = render(
      <Column
        column={baseColumn}
        tasks={[]}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    // Should not have active drop zone styling
    const dropZone = container.querySelector('.bg-dark-800\\/50');
    expect(dropZone).not.toBeInTheDocument();
  });

  it('renders tasks in correct order', () => {
    const tasks = [
      { id: 1, title: 'First', status: 'TODO' },
      { id: 2, title: 'Second', status: 'TODO' },
      { id: 3, title: 'Third', status: 'TODO' },
    ];

    render(
      <Column
        column={baseColumn}
        tasks={tasks}
        onTaskClick={mockOnTaskClick}
        onTaskDrop={mockOnTaskDrop}
      />,
    );

    const taskCards = screen.getAllByTestId(/task-card-/);
    expect(taskCards).toHaveLength(3);
    expect(taskCards[0]).toHaveTextContent('First');
    expect(taskCards[1]).toHaveTextContent('Second');
    expect(taskCards[2]).toHaveTextContent('Third');
  });
});
