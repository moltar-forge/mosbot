import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBotStore, MOODS } from './botStore';
import api from '../api/client';
import logger from '../utils/logger';

// Mock the API client
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
  },
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  default: {
    warn: vi.fn(),
  },
}));

describe('botStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset store state
    useBotStore.setState({
      inflightRequests: 0,
      lastErrorAt: null,
      lastSuccessAt: null,
      isConnected: true,
      healthCheckInterval: null,
      currentMood: MOODS.CALM,
      moodTimers: {},
    });
  });

  afterEach(() => {
    // Cleanup any timers
    useBotStore.getState().cleanupTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('requestStarted', () => {
    it('increments inflight requests count', () => {
      const { requestStarted } = useBotStore.getState();

      requestStarted();

      expect(useBotStore.getState().inflightRequests).toBe(1);
    });

    it('changes mood to FOCUSED when starting first request', () => {
      const { requestStarted } = useBotStore.getState();

      requestStarted();

      expect(useBotStore.getState().currentMood).toBe(MOODS.FOCUSED);
    });

    it('does not change mood when already working', () => {
      const { requestStarted } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 1, currentMood: MOODS.FOCUSED });

      requestStarted();

      expect(useBotStore.getState().inflightRequests).toBe(2);
      expect(useBotStore.getState().currentMood).toBe(MOODS.FOCUSED);
    });
  });

  describe('requestFinished', () => {
    it('decrements inflight requests count', () => {
      const { requestFinished } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 2 });

      requestFinished();

      expect(useBotStore.getState().inflightRequests).toBe(1);
    });

    it('does not go below zero', () => {
      const { requestFinished } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 0 });

      requestFinished();

      expect(useBotStore.getState().inflightRequests).toBe(0);
    });

    it('changes mood to CALM when finishing last request', () => {
      const { requestFinished } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 1, currentMood: MOODS.FOCUSED });

      requestFinished();

      expect(useBotStore.getState().inflightRequests).toBe(0);
      expect(useBotStore.getState().currentMood).toBe(MOODS.CALM);
    });

    it('updates lastSuccessAt timestamp', () => {
      const { requestFinished } = useBotStore.getState();
      const beforeTime = Date.now();

      requestFinished();

      const lastSuccessAt = useBotStore.getState().lastSuccessAt;
      expect(lastSuccessAt).toBeGreaterThanOrEqual(beforeTime);
    });
  });

  describe('recordError', () => {
    it('sets mood to FRUSTRATED', () => {
      const { recordError } = useBotStore.getState();

      recordError();

      expect(useBotStore.getState().currentMood).toBe(MOODS.FRUSTRATED);
    });

    it('updates lastErrorAt timestamp', () => {
      const { recordError } = useBotStore.getState();
      const beforeTime = Date.now();

      recordError();

      const lastErrorAt = useBotStore.getState().lastErrorAt;
      expect(lastErrorAt).toBeGreaterThanOrEqual(beforeTime);
    });

    it('clears existing frustration timer before setting new one', () => {
      const { recordError } = useBotStore.getState();
      const mockTimer = setTimeout(() => {}, 1000);
      useBotStore.setState({ moodTimers: { frustration: mockTimer } });

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      recordError();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimer);
    });

    it('returns to CALM after timeout when no requests in flight', () => {
      const { recordError } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 0 });

      recordError();

      expect(useBotStore.getState().currentMood).toBe(MOODS.FRUSTRATED);

      // Fast-forward past frustration timeout (5000ms)
      vi.advanceTimersByTime(5000);

      expect(useBotStore.getState().currentMood).toBe(MOODS.CALM);
    });

    it('does not return to CALM if requests are in flight', () => {
      const { recordError } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 1 });

      recordError();

      expect(useBotStore.getState().currentMood).toBe(MOODS.FRUSTRATED);

      // Fast-forward past frustration timeout
      vi.advanceTimersByTime(5000);

      // Should still be FRUSTRATED because requests are in flight
      expect(useBotStore.getState().currentMood).toBe(MOODS.FRUSTRATED);
    });
  });

  describe('recordSuccess', () => {
    it('sets mood to EXCITED when no requests in flight', () => {
      const { recordSuccess } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 0 });

      recordSuccess();

      expect(useBotStore.getState().currentMood).toBe(MOODS.EXCITED);
    });

    it('does not change mood when requests are in flight', () => {
      const { recordSuccess } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 1, currentMood: MOODS.FOCUSED });

      recordSuccess();

      expect(useBotStore.getState().currentMood).toBe(MOODS.FOCUSED);
    });

    it('updates lastSuccessAt timestamp', () => {
      const { recordSuccess } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 0 });
      const beforeTime = Date.now();

      recordSuccess();

      const lastSuccessAt = useBotStore.getState().lastSuccessAt;
      expect(lastSuccessAt).toBeGreaterThanOrEqual(beforeTime);
    });

    it('clears existing excitement timer before setting new one', () => {
      const { recordSuccess } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 0 });
      const mockTimer = setTimeout(() => {}, 1000);
      useBotStore.setState({ moodTimers: { excitement: mockTimer } });

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      recordSuccess();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimer);
    });

    it('returns to CALM after timeout when no requests in flight', () => {
      const { recordSuccess } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 0 });

      recordSuccess();

      expect(useBotStore.getState().currentMood).toBe(MOODS.EXCITED);

      // Fast-forward past excitement timeout (3000ms)
      vi.advanceTimersByTime(3000);

      expect(useBotStore.getState().currentMood).toBe(MOODS.CALM);
    });

    it('does not return to CALM if requests started during excitement', () => {
      const { recordSuccess, requestStarted } = useBotStore.getState();
      useBotStore.setState({ inflightRequests: 0 });

      recordSuccess();
      expect(useBotStore.getState().currentMood).toBe(MOODS.EXCITED);

      // Start a request during excitement period
      requestStarted();

      // Fast-forward past excitement timeout
      vi.advanceTimersByTime(3000);

      // Should be FOCUSED because requests are in flight (requestStarted changes mood)
      expect(useBotStore.getState().currentMood).toBe(MOODS.FOCUSED);
    });
  });

  describe('setConnected', () => {
    it('sets connection status', () => {
      const { setConnected } = useBotStore.getState();

      setConnected(false);

      expect(useBotStore.getState().isConnected).toBe(false);

      setConnected(true);

      expect(useBotStore.getState().isConnected).toBe(true);
    });
  });

  describe('checkOpenClawHealth', () => {
    it('sets isConnected to true when health check succeeds', async () => {
      api.get.mockResolvedValue({
        data: {
          data: { accessible: true },
        },
      });

      const result = await useBotStore.getState().checkOpenClawHealth();

      expect(api.get).toHaveBeenCalledWith('/openclaw/workspace/status');
      expect(result).toBe(true);
      expect(useBotStore.getState().isConnected).toBe(true);
    });

    it('sets isConnected to false when health check fails', async () => {
      api.get.mockResolvedValue({
        data: {
          data: { accessible: false },
        },
      });

      const result = await useBotStore.getState().checkOpenClawHealth();

      expect(result).toBe(false);
      expect(useBotStore.getState().isConnected).toBe(false);
    });

    it('handles health check error', async () => {
      const error = new Error('Network error');
      api.get.mockRejectedValue(error);

      const result = await useBotStore.getState().checkOpenClawHealth();

      expect(result).toBe(false);
      expect(useBotStore.getState().isConnected).toBe(false);
      expect(logger.warn).toHaveBeenCalledWith('OpenClaw health check failed', {
        error: 'Network error',
      });
    });
  });

  describe('startHealthChecks', () => {
    it('starts periodic health checks', () => {
      const { startHealthChecks } = useBotStore.getState();
      api.get.mockResolvedValue({
        data: {
          data: { accessible: true },
        },
      });

      startHealthChecks();

      expect(useBotStore.getState().healthCheckInterval).not.toBeNull();
      expect(api.get).toHaveBeenCalled();
    });

    it('does not start multiple health check intervals', () => {
      const { startHealthChecks } = useBotStore.getState();
      api.get.mockResolvedValue({
        data: {
          data: { accessible: true },
        },
      });

      startHealthChecks();
      const firstInterval = useBotStore.getState().healthCheckInterval;

      startHealthChecks();
      const secondInterval = useBotStore.getState().healthCheckInterval;

      expect(firstInterval).toBe(secondInterval);
    });

    it('performs health checks every 30 seconds', async () => {
      const { startHealthChecks } = useBotStore.getState();
      api.get.mockResolvedValue({
        data: {
          data: { accessible: true },
        },
      });

      startHealthChecks();

      // Initial check
      expect(api.get).toHaveBeenCalledTimes(1);

      // Fast-forward 30 seconds
      vi.advanceTimersByTime(30000);
      expect(api.get).toHaveBeenCalledTimes(2);

      // Fast-forward another 30 seconds
      vi.advanceTimersByTime(30000);
      expect(api.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('stopHealthChecks', () => {
    it('stops health check interval', () => {
      const { startHealthChecks, stopHealthChecks } = useBotStore.getState();
      api.get.mockResolvedValue({
        data: {
          data: { accessible: true },
        },
      });

      startHealthChecks();
      expect(useBotStore.getState().healthCheckInterval).not.toBeNull();

      stopHealthChecks();

      expect(useBotStore.getState().healthCheckInterval).toBeNull();
    });

    it('handles stopping when no interval exists', () => {
      const { stopHealthChecks } = useBotStore.getState();

      stopHealthChecks();

      expect(useBotStore.getState().healthCheckInterval).toBeNull();
    });
  });

  describe('cleanupTimers', () => {
    it('clears all mood timers and health check interval', () => {
      const { cleanupTimers } = useBotStore.getState();
      const mockFrustrationTimer = setTimeout(() => {}, 1000);
      const mockExcitementTimer = setTimeout(() => {}, 1000);
      const mockHealthInterval = setInterval(() => {}, 1000);

      useBotStore.setState({
        moodTimers: {
          frustration: mockFrustrationTimer,
          excitement: mockExcitementTimer,
        },
        healthCheckInterval: mockHealthInterval,
      });

      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      cleanupTimers();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockFrustrationTimer);
      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockExcitementTimer);
      expect(clearIntervalSpy).toHaveBeenCalledWith(mockHealthInterval);
      expect(useBotStore.getState().moodTimers).toEqual({});
      expect(useBotStore.getState().healthCheckInterval).toBeNull();
    });
  });

  describe('isWorking', () => {
    it('returns true when requests are in flight', () => {
      useBotStore.setState({ inflightRequests: 1 });

      expect(useBotStore.getState().isWorking()).toBe(true);
    });

    it('returns false when no requests are in flight', () => {
      useBotStore.setState({ inflightRequests: 0 });

      expect(useBotStore.getState().isWorking()).toBe(false);
    });
  });

  describe('getActivityStatus', () => {
    it('returns "Offline" when not connected', () => {
      useBotStore.setState({ isConnected: false });

      expect(useBotStore.getState().getActivityStatus()).toBe('Offline');
    });

    it('returns "Working" when connected and requests in flight', () => {
      useBotStore.setState({ isConnected: true, inflightRequests: 1 });

      expect(useBotStore.getState().getActivityStatus()).toBe('Working');
    });

    it('returns "Idle" when connected and no requests', () => {
      useBotStore.setState({ isConnected: true, inflightRequests: 0 });

      expect(useBotStore.getState().getActivityStatus()).toBe('Idle');
    });
  });

  describe('getActivityLabel', () => {
    it('returns offline message when not connected', () => {
      useBotStore.setState({ isConnected: false });

      expect(useBotStore.getState().getActivityLabel()).toBe('Offline - Reconnecting...');
    });

    it('returns working message when requests in flight', () => {
      useBotStore.setState({ isConnected: true, inflightRequests: 1 });

      expect(useBotStore.getState().getActivityLabel()).toBe('Working on tasks...');
    });

    it('returns ready message when idle', () => {
      useBotStore.setState({ isConnected: true, inflightRequests: 0 });

      expect(useBotStore.getState().getActivityLabel()).toBe('Ready for tasks');
    });
  });

  describe('MOODS constant', () => {
    it('exports all mood definitions', () => {
      expect(MOODS.CALM).toBeDefined();
      expect(MOODS.FOCUSED).toBeDefined();
      expect(MOODS.FRUSTRATED).toBeDefined();
      expect(MOODS.EXCITED).toBeDefined();
    });

    it('each mood has required properties', () => {
      Object.values(MOODS).forEach((mood) => {
        expect(mood).toHaveProperty('id');
        expect(mood).toHaveProperty('label');
        expect(mood).toHaveProperty('emoji');
        expect(mood).toHaveProperty('color');
        expect(mood).toHaveProperty('description');
      });
    });
  });
});
