import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SessionDetailPanel from './SessionDetailPanel';
import { getSessionMessages, getCronJobRuns } from '../api/client';
import { useAgentStore } from '../stores/agentStore';

vi.mock('../api/client', () => ({
  getSessionMessages: vi.fn(),
  getCronJobRuns: vi.fn(),
}));

vi.mock('../stores/agentStore', () => ({
  useAgentStore: vi.fn(),
}));

vi.mock('./MarkdownRenderer', () => ({
  default: ({ content }) => <div>{content}</div>,
}));

vi.mock('@headlessui/react', () => {
  function Dialog({ children }) {
    return <div>{children}</div>;
  }

  function DialogPanel({ children }) {
    return <div>{children}</div>;
  }

  function DialogTitle({ children }) {
    return <div>{children}</div>;
  }

  Dialog.Panel = DialogPanel;
  Dialog.Title = DialogTitle;

  return {
    Dialog,
    Transition: {
      Root: ({ show, children }) => (show ? <>{children}</> : null),
      Child: ({ children }) => <>{children}</>,
    },
  };
});

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('SessionDetailPanel live refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    setVisibility('visible');

    useAgentStore.mockImplementation((selector) =>
      selector({
        getAgentById: () => null,
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('loads immediately and refreshes regular sessions every 2s, then stops when closed', async () => {
    getSessionMessages.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' }],
      session: null,
      sessionNotLoaded: false,
    });

    const { rerender } = render(
      <SessionDetailPanel
        isOpen
        onClose={() => {}}
        session={{ key: 'agent:main:main', kind: 'main', label: 'Main Session' }}
      />,
    );

    await flush();
    expect(getSessionMessages).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(getSessionMessages).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await flush();
    expect(getSessionMessages).toHaveBeenCalledTimes(2);

    rerender(
      <SessionDetailPanel
        isOpen={false}
        onClose={() => {}}
        session={{ key: 'agent:main:main', kind: 'main', label: 'Main Session' }}
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(getSessionMessages).toHaveBeenCalledTimes(2);
  });

  it('refreshes cron sessions every 5s while open', async () => {
    getCronJobRuns.mockResolvedValue({
      runs: [
        {
          runId: 'run-1',
          sessionKey: 'agent:coo:cron:job-1:run:run-1',
          status: 'ok',
        },
      ],
    });

    getSessionMessages.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'cron message', timestamp: '2026-01-01T00:00:00.000Z' }],
      session: null,
      sessionNotLoaded: false,
    });

    render(
      <SessionDetailPanel
        isOpen
        onClose={() => {}}
        session={{ key: 'agent:coo:cron:job-1', kind: 'cron', label: 'Cron Job', jobId: 'job-1' }}
      />,
    );

    await flush();
    expect(getCronJobRuns).toHaveBeenCalledTimes(1);
    expect(getSessionMessages).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(4999);
    });
    expect(getCronJobRuns).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await flush();
    expect(getCronJobRuns).toHaveBeenCalledTimes(2);
    expect(getSessionMessages).toHaveBeenCalledTimes(2);
  });

  it('pauses polling when tab is hidden and refreshes once when visible again', async () => {
    getSessionMessages.mockResolvedValue({
      messages: [{ role: 'assistant', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' }],
      session: null,
      sessionNotLoaded: false,
    });

    render(
      <SessionDetailPanel
        isOpen
        onClose={() => {}}
        session={{ key: 'agent:main:main', kind: 'main', label: 'Main Session' }}
      />,
    );

    await flush();
    expect(getSessionMessages).toHaveBeenCalledTimes(1);

    setVisibility('hidden');
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(getSessionMessages).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(getSessionMessages).toHaveBeenCalledTimes(2);
  });

  it('does not let stale response overwrite messages after switching sessions', async () => {
    const pendingA = deferred();

    getSessionMessages
      .mockImplementationOnce(() => pendingA.promise)
      .mockResolvedValueOnce({
        messages: [
          { role: 'assistant', content: 'B fresh', timestamp: '2026-01-01T00:00:02.000Z' },
        ],
        session: null,
        sessionNotLoaded: false,
      });

    const { rerender } = render(
      <SessionDetailPanel
        isOpen
        onClose={() => {}}
        session={{ key: 'agent:a:main', kind: 'main', label: 'Session A' }}
      />,
    );

    await flush();
    expect(getSessionMessages).toHaveBeenCalledTimes(1);

    rerender(
      <SessionDetailPanel
        isOpen
        onClose={() => {}}
        session={{ key: 'agent:b:main', kind: 'main', label: 'Session B' }}
      />,
    );

    await flush();
    expect(getSessionMessages).toHaveBeenCalledTimes(2);

    await act(async () => {
      pendingA.resolve({
        messages: [{ role: 'assistant', content: 'A stale', timestamp: '2026-01-01T00:00:01.000Z' }],
        session: null,
        sessionNotLoaded: false,
      });
    });

    await flush();
    expect(screen.getByText('B fresh')).toBeInTheDocument();
    expect(screen.queryByText('A stale')).not.toBeInTheDocument();
  });
});
