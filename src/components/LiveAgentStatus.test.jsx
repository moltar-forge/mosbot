import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import LiveAgentStatus from './LiveAgentStatus';
import { useActivityStore } from '../stores/activityStore';

vi.mock('../stores/activityStore', () => ({
  useActivityStore: vi.fn(),
}));

vi.mock('date-fns', () => ({
  formatDistanceToNow: vi.fn(() => 'moments ago'),
}));

describe('LiveAgentStatus', () => {
  const fetchLiveSessions = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows loading state while fetching with no visible agents', () => {
    useActivityStore.mockReturnValue({
      liveSessions: [],
      isLoadingSessions: true,
      fetchLiveSessions,
    });

    render(<LiveAgentStatus />);

    expect(screen.getByText('Checking agent status...')).toBeInTheDocument();
    expect(fetchLiveSessions).toHaveBeenCalledTimes(1);
  });

  it('returns null when not loading and there are no running/active sessions', () => {
    useActivityStore.mockReturnValue({
      liveSessions: [{ key: '1', agent: 'coo', status: 'idle' }],
      isLoadingSessions: false,
      fetchLiveSessions,
    });

    const { container } = render(<LiveAgentStatus />);
    expect(container.firstChild).toBeNull();
  });

  it('renders only running/active sessions and deduplicates by latest update per agent', () => {
    useActivityStore.mockReturnValue({
      liveSessions: [
        {
          key: 'old',
          agent: 'coo',
          agentName: 'COO',
          status: 'running',
          updatedAt: 1000,
          kind: 'main',
        },
        {
          key: 'new',
          agent: 'coo',
          agentName: 'COO',
          status: 'running',
          updatedAt: 2000,
          kind: 'cron',
        },
        {
          key: 'active',
          agent: 'cto',
          agentName: 'CTO',
          status: 'active',
          updatedAt: 1500,
          lastMessage: 'Working...',
        },
        { key: 'idle', agent: 'hr', status: 'idle', updatedAt: 3000 },
      ],
      isLoadingSessions: false,
      fetchLiveSessions,
    });

    render(<LiveAgentStatus />);

    expect(screen.getByText('Live:')).toBeInTheDocument();
    expect(screen.getAllByText('COO')).toHaveLength(1);
    expect(screen.getByText('CTO')).toBeInTheDocument();
    expect(screen.queryByText('hr')).not.toBeInTheDocument();
    expect(screen.getByText('Cron')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Working...')).toBeInTheDocument();
    expect(screen.getAllByText('moments ago').length).toBeGreaterThan(0);
  });

  it('falls back to generic labels when fields are missing', () => {
    useActivityStore.mockReturnValue({
      liveSessions: [{ key: 's-1', status: 'running', kind: 'custom-kind' }],
      isLoadingSessions: false,
      fetchLiveSessions,
    });

    render(<LiveAgentStatus />);

    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('custom-kind')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it('polls on interval and clears interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    useActivityStore.mockReturnValue({
      liveSessions: [{ key: 's-1', agent: 'coo', status: 'running' }],
      isLoadingSessions: false,
      fetchLiveSessions,
    });

    const { unmount } = render(<LiveAgentStatus />);
    expect(fetchLiveSessions).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30000);
    expect(fetchLiveSessions).toHaveBeenCalledTimes(2);

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
