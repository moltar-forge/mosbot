import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import GlobalSessionPoller from './GlobalSessionPoller';
import { useBotStore } from '../stores/botStore';

vi.mock('../stores/botStore', () => ({
  useBotStore: vi.fn(),
}));

describe('GlobalSessionPoller', () => {
  const startSessionPolling = vi.fn();
  const stopSessionPolling = vi.fn();
  const fetchSessionStatus = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useBotStore.getState = vi.fn(() => ({ fetchSessionStatus }));
    useBotStore.mockImplementation((selector) =>
      selector({
        startSessionPolling,
        stopSessionPolling,
      }),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('starts polling on mount and stops on unmount', () => {
    const { unmount, container } = render(<GlobalSessionPoller />);
    expect(container.firstChild).toBeNull();
    expect(startSessionPolling).toHaveBeenCalledTimes(1);
    expect(stopSessionPolling).not.toHaveBeenCalled();

    unmount();
    expect(stopSessionPolling).toHaveBeenCalledTimes(1);
  });

  it('refreshes session status when tab becomes visible', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = render(<GlobalSessionPoller />);
    expect(addSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetchSessionStatus).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fetchSessionStatus).toHaveBeenCalledTimes(1);

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
