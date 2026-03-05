import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TaskCard from './TaskCard';
import { TASK_PRIORITY, TASK_TYPE } from '../utils/constants';

// Mock react-dnd
const mockUseDrag = vi.fn(() => [
  { isDragging: false },
  vi.fn(), // drag ref
]);

vi.mock('react-dnd', () => ({
  useDrag: () => mockUseDrag(),
  DndProvider: ({ children }) => children,
}));

describe('TaskCard', () => {
  const mockOnClick = vi.fn();
  const baseTask = {
    id: 1,
    title: 'Test Task',
    status: 'TODO',
    priority: TASK_PRIORITY.MEDIUM,
    type: TASK_TYPE.TASK,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDrag.mockReturnValue([{ isDragging: false }, vi.fn()]);
  });

  it('renders task title', () => {
    render(<TaskCard task={baseTask} onClick={mockOnClick} />);

    expect(screen.getByText('Test Task')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', async () => {
    const user = userEvent.setup();
    render(<TaskCard task={baseTask} onClick={mockOnClick} />);

    const card = screen.getByText('Test Task').closest('.card');
    await user.click(card);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('renders task description when provided', () => {
    const taskWithDescription = {
      ...baseTask,
      description: 'This is a test description',
    };

    render(<TaskCard task={taskWithDescription} onClick={mockOnClick} />);

    expect(screen.getByText(/This is a test description/)).toBeInTheDocument();
  });

  it('renders task summary when provided', () => {
    const taskWithSummary = {
      ...baseTask,
      summary: 'Task summary',
    };

    render(<TaskCard task={taskWithSummary} onClick={mockOnClick} />);

    expect(screen.getByText('Task summary')).toBeInTheDocument();
  });

  it('prefers summary over description when both are provided', () => {
    const taskWithBoth = {
      ...baseTask,
      summary: 'Summary text',
      description: 'Description text',
    };

    render(<TaskCard task={taskWithBoth} onClick={mockOnClick} />);

    expect(screen.getByText('Summary text')).toBeInTheDocument();
    expect(screen.queryByText('Description text')).not.toBeInTheDocument();
  });

  it('renders tags when provided', () => {
    const taskWithTags = {
      ...baseTask,
      tags: ['urgent', 'frontend', 'bug'],
    };

    render(<TaskCard task={taskWithTags} onClick={mockOnClick} />);

    expect(screen.getByText('urgent')).toBeInTheDocument();
    expect(screen.getByText('frontend')).toBeInTheDocument();
    expect(screen.getByText('bug')).toBeInTheDocument();
  });

  it('does not render tags section when no tags', () => {
    render(<TaskCard task={baseTask} onClick={mockOnClick} />);

    const tagsContainer = screen.queryByText(/urgent|frontend|bug/);
    expect(tagsContainer).not.toBeInTheDocument();
  });

  it('renders due date when provided', () => {
    const taskWithDueDate = {
      ...baseTask,
      due_date: '2024-12-31T00:00:00Z',
    };

    render(<TaskCard task={taskWithDueDate} onClick={mockOnClick} />);

    expect(screen.getByText(/ago|in/)).toBeInTheDocument();
  });

  it('renders due date from dueDate field', () => {
    const taskWithDueDate = {
      ...baseTask,
      dueDate: '2024-12-31T00:00:00Z',
    };

    render(<TaskCard task={taskWithDueDate} onClick={mockOnClick} />);

    expect(screen.getByText(/ago|in/)).toBeInTheDocument();
  });

  it('renders comment count when provided', () => {
    const taskWithComments = {
      ...baseTask,
      comments: 5,
    };

    render(<TaskCard task={taskWithComments} onClick={mockOnClick} />);

    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('does not render comment count when zero', () => {
    const taskWithZeroComments = {
      ...baseTask,
      comments: 0,
    };

    render(<TaskCard task={taskWithZeroComments} onClick={mockOnClick} />);

    // Comment count should not be visible when 0
    const commentIcon = screen.queryByRole('img', { hidden: true });
    // If comment icon exists, it means comments are shown
    if (commentIcon) {
      const commentText = screen.queryByText('0');
      expect(commentText).not.toBeInTheDocument();
    }
  });

  it('renders reporter avatar when reporter_name is provided', () => {
    const taskWithReporter = {
      ...baseTask,
      reporter_name: 'John Doe',
    };

    render(<TaskCard task={taskWithReporter} onClick={mockOnClick} />);

    const reporterAvatar = screen.getByTitle('Reporter: John Doe');
    expect(reporterAvatar).toBeInTheDocument();
    expect(reporterAvatar).toHaveTextContent('J');
  });

  it('renders assignee avatar when assignee_name is provided', () => {
    const taskWithAssignee = {
      ...baseTask,
      assignee_name: 'Jane Smith',
    };

    render(<TaskCard task={taskWithAssignee} onClick={mockOnClick} />);

    const assigneeAvatar = screen.getByTitle('Assignee: Jane Smith');
    expect(assigneeAvatar).toBeInTheDocument();
    expect(assigneeAvatar).toHaveTextContent('J');
  });

  it('renders assignee avatar from assignee field', () => {
    const taskWithAssignee = {
      ...baseTask,
      assignee: 'Bob Wilson',
    };

    render(<TaskCard task={taskWithAssignee} onClick={mockOnClick} />);

    const assigneeAvatar = screen.getByTitle('Assignee: Bob Wilson');
    expect(assigneeAvatar).toBeInTheDocument();
    expect(assigneeAvatar).toHaveTextContent('B');
  });

  it('renders both reporter and assignee avatars', () => {
    const taskWithBoth = {
      ...baseTask,
      reporter_name: 'John Doe',
      assignee_name: 'Jane Smith',
    };

    render(<TaskCard task={taskWithBoth} onClick={mockOnClick} />);

    expect(screen.getByTitle('Reporter: John Doe')).toBeInTheDocument();
    expect(screen.getByTitle('Assignee: Jane Smith')).toBeInTheDocument();
  });

  it('applies correct priority border color', () => {
    const highPriorityTask = {
      ...baseTask,
      priority: TASK_PRIORITY.HIGH,
    };

    const { container } = render(<TaskCard task={highPriorityTask} onClick={mockOnClick} />);

    const card = container.querySelector('.border-l-yellow-500');
    expect(card).toBeInTheDocument();
  });

  it('applies medium priority when priority is not provided', () => {
    const taskWithoutPriority = {
      ...baseTask,
      priority: undefined,
    };

    const { container } = render(<TaskCard task={taskWithoutPriority} onClick={mockOnClick} />);

    const card = container.querySelector('.border-l-blue-500');
    expect(card).toBeInTheDocument();
  });

  it('renders correct task type icon', () => {
    const bugTask = {
      ...baseTask,
      type: TASK_TYPE.BUG,
    };

    render(<TaskCard task={bugTask} onClick={mockOnClick} />);

    // Bug type should have ExclamationTriangleIcon
    const icon = screen.getByTitle('Bug');
    expect(icon).toBeInTheDocument();
  });

  it('renders feature type icon', () => {
    const featureTask = {
      ...baseTask,
      type: TASK_TYPE.FEATURE,
    };

    render(<TaskCard task={featureTask} onClick={mockOnClick} />);

    const icon = screen.getByTitle('Feature');
    expect(icon).toBeInTheDocument();
  });

  it('handles dragging state', () => {
    mockUseDrag.mockReturnValue([{ isDragging: true }, vi.fn()]);

    const { container } = render(<TaskCard task={baseTask} onClick={mockOnClick} />);

    const card = container.querySelector('.opacity-50');
    expect(card).toBeInTheDocument();
  });

  it('truncates long descriptions', () => {
    const longDescription = 'A'.repeat(200);
    const taskWithLongDesc = {
      ...baseTask,
      description: longDescription,
    };

    render(<TaskCard task={taskWithLongDesc} onClick={mockOnClick} />);

    const description = screen.getByText(/A+/);
    expect(description.textContent.length).toBeLessThanOrEqual(123); // 120 + '...'
  });

  it('handles task without optional fields', () => {
    const minimalTask = {
      id: 1,
      title: 'Minimal Task',
      status: 'TODO',
    };

    render(<TaskCard task={minimalTask} onClick={mockOnClick} />);

    expect(screen.getByText('Minimal Task')).toBeInTheDocument();
  });

  it('renders AI usage when agent fields are provided', () => {
    const taskWithAI = {
      ...baseTask,
      agent_cost_usd: 0.0523,
      agent_tokens_input: 1500,
      agent_tokens_input_cache: 500,
      agent_tokens_output: 800,
      agent_tokens_output_cache: 200,
      agent_model: 'claude-3-sonnet',
      agent_model_provider: 'anthropic',
    };

    render(<TaskCard task={taskWithAI} onClick={mockOnClick} />);

    // Check that AI usage is displayed
    expect(screen.getByText(/AI:/)).toBeInTheDocument();

    // Check that total tokens are shown (1500 + 500 + 800 + 200 = 3000 = 3.0k)
    expect(screen.getByText(/3\.0k tok/)).toBeInTheDocument();

    // Check that cost is shown
    expect(screen.getByText(/\$0\.05/)).toBeInTheDocument();
  });

  it('renders AI usage with partial data', () => {
    const taskWithPartialAI = {
      ...baseTask,
      agent_cost_usd: 0.0012,
      agent_tokens_input: 250,
    };

    render(<TaskCard task={taskWithPartialAI} onClick={mockOnClick} />);

    // Check that AI usage is displayed
    expect(screen.getByText(/AI:/)).toBeInTheDocument();

    // Check that cost is shown with appropriate precision for small values
    expect(screen.getByText(/\$0\.0012/)).toBeInTheDocument();
  });

  it('formats large token counts correctly', () => {
    const taskWithLargeTokens = {
      ...baseTask,
      agent_tokens_input: 1500000,
      agent_tokens_output: 500000,
    };

    render(<TaskCard task={taskWithLargeTokens} onClick={mockOnClick} />);

    // Total is 2,000,000 which should be formatted as 2.0m
    expect(screen.getByText(/2\.0m tok/)).toBeInTheDocument();
  });

  it('does not render AI usage when all agent fields are absent', () => {
    render(<TaskCard task={baseTask} onClick={mockOnClick} />);

    // AI usage section should not be present
    expect(screen.queryByText(/AI:/)).not.toBeInTheDocument();
  });

  it('renders AI usage with only model info', () => {
    const taskWithModelOnly = {
      ...baseTask,
      agent_model: 'gpt-4',
      agent_model_provider: 'openai',
    };

    render(<TaskCard task={taskWithModelOnly} onClick={mockOnClick} />);

    // AI usage should still render even with just model info
    expect(screen.getByText(/AI/)).toBeInTheDocument();
  });
});
