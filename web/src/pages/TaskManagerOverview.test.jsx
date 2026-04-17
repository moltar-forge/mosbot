import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import TaskManagerOverview from './TaskManagerOverview';
import { getCronJobs, getSchedulerStats } from '../api/client';
import { useBotStore } from '../stores/botStore';
import { useAgentStore } from '../stores/agentStore';
import { useUsageStore } from '../stores/usageStore';
import { useSchedulerStore } from '../stores/schedulerStore';

vi.mock('../api/client', () => ({
  getCronJobs: vi.fn(),
  getSchedulerStats: vi.fn(),
}));

vi.mock('../stores/botStore', () => ({
  useBotStore: vi.fn(),
}));

vi.mock('../stores/agentStore', () => ({
  useAgentStore: vi.fn(),
}));

vi.mock('../stores/usageStore', () => ({
  useUsageStore: vi.fn(),
}));

vi.mock('../stores/schedulerStore', () => ({
  useSchedulerStore: vi.fn(),
}));

vi.mock('../components/Header', () => ({
  default: ({ title, onRefresh }) => (
    <header>
      <h1>{title}</h1>
      <button type="button" onClick={onRefresh}>
        Refresh
      </button>
    </header>
  ),
}));

vi.mock('../components/StatCard', () => ({
  default: ({ label, value }) => (
    <div>
      {label}: {value}
    </div>
  ),
}));

vi.mock('../components/SessionList', () => ({
  default: ({ sessions, title, emptyMessage }) => (
    <section aria-label={title}>
      {sessions.length === 0 ? (
        <p>{emptyMessage}</p>
      ) : (
        sessions.map((session) => <div key={session.id}>{session.label || session.id}</div>)
      )}
    </section>
  ),
}));

vi.mock('../components/SessionDetailPanel', () => ({
  default: () => null,
}));

describe('TaskManagerOverview', () => {
  const mockFetchSessions = vi.fn();
  const mockFetchTodaySummary = vi.fn();
  const mockSetAttention = vi.fn();

  const renderOverview = async () => {
    let result;

    await act(async () => {
      result = render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <TaskManagerOverview />
        </MemoryRouter>,
      );
    });

    return result;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });

    mockFetchSessions.mockResolvedValue([]);
    mockFetchTodaySummary.mockResolvedValue();
    mockSetAttention.mockReturnValue();
    getCronJobs.mockResolvedValue([]);
    getSchedulerStats.mockResolvedValue({ errors: 0, missed: 0 });

    const botState = {
      sessions: [
        { id: 'running-session', label: 'Running Session', status: 'running', kind: 'main' },
        { id: 'idle-session', label: 'Idle Session', status: 'idle', kind: 'main' },
      ],
      sessionsLoaded: true,
      sessionsError: null,
      fetchSessions: mockFetchSessions,
    };

    const agentState = {
      agents: [],
      getAgentById: vi.fn(),
    };

    const usageState = {
      todaySummary: { totalTokensInput: 0, totalTokensOutput: 0, totalCostUsd: 0 },
      fetchTodaySummary: mockFetchTodaySummary,
    };

    const schedulerState = {
      setAttention: mockSetAttention,
    };

    useBotStore.mockImplementation((selector) => selector(botState));
    useAgentStore.mockImplementation((selector) => selector(agentState));
    useUsageStore.mockImplementation((selector) => selector(usageState));
    useSchedulerStore.mockImplementation((selector) => selector(schedulerState));
  });

  it('runs an immediate visible refresh when auto-refresh is enabled', async () => {
    await renderOverview();

    await waitFor(() => {
      expect(mockFetchSessions).toHaveBeenCalledTimes(2);
    });
    expect(getCronJobs).toHaveBeenCalledTimes(2);
    expect(mockFetchTodaySummary).toHaveBeenCalledTimes(2);
    expect(getSchedulerStats).toHaveBeenCalledTimes(2);
  });

  it('clears the activity filter with the rest of the filters', async () => {
    const user = userEvent.setup();
    getCronJobs.mockImplementation(() => new Promise(() => {}));

    await renderOverview();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Running' }));
    });

    expect(screen.getByText('Running Session')).toBeInTheDocument();
    expect(screen.queryByText('Idle Session')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Clear/ })).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /Clear/ }));
    });

    expect(screen.getByText('Running Session')).toBeInTheDocument();
    expect(screen.getByText('Idle Session')).toBeInTheDocument();
  });
});
