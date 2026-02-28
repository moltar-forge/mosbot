import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUsageStore } from './usageStore';
import { getUsageAnalytics } from '../api/client';

vi.mock('../api/client', () => ({
  getUsageAnalytics: vi.fn(),
}));

describe('usageStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUsageStore.setState({
      data: null,
      isLoading: false,
      error: null,
      range: 'today',
      customRange: null,
      todaySummary: null,
      todaySummaryLoading: false,
    });
  });

  describe('fetchUsage', () => {
    it('fetches usage and updates state on success', async () => {
      const mockData = { summary: { cost: 10 }, byDay: [] };
      getUsageAnalytics.mockResolvedValue(mockData);

      await useUsageStore.getState().fetchUsage();

      expect(getUsageAnalytics).toHaveBeenCalledWith('today', null);
      expect(useUsageStore.getState().data).toEqual(mockData);
      expect(useUsageStore.getState().isLoading).toBe(false);
      expect(useUsageStore.getState().error).toBeNull();
    });

    it('handles fetch error', async () => {
      getUsageAnalytics.mockRejectedValue({
        response: { data: { error: { message: 'Network error' } } },
      });

      await useUsageStore.getState().fetchUsage();

      expect(useUsageStore.getState().error).toBe('Network error');
      expect(useUsageStore.getState().isLoading).toBe(false);
    });

    it('uses fallback error message when response has no message', async () => {
      getUsageAnalytics.mockRejectedValue({});

      await useUsageStore.getState().fetchUsage();

      expect(useUsageStore.getState().error).toBe('Failed to load usage data');
    });
  });

  describe('fetchTodaySummary', () => {
    it('fetches today summary on success', async () => {
      const mockSummary = { cost: 5 };
      getUsageAnalytics.mockResolvedValue({ summary: mockSummary });

      await useUsageStore.getState().fetchTodaySummary();

      expect(getUsageAnalytics).toHaveBeenCalledWith('today');
      expect(useUsageStore.getState().todaySummary).toEqual(mockSummary);
      expect(useUsageStore.getState().todaySummaryLoading).toBe(false);
    });

    it('sets null when no summary in response', async () => {
      getUsageAnalytics.mockResolvedValue({});

      await useUsageStore.getState().fetchTodaySummary();

      expect(useUsageStore.getState().todaySummary).toBeNull();
    });

    it('skips when already loading', async () => {
      useUsageStore.setState({ todaySummaryLoading: true });
      getUsageAnalytics.mockResolvedValue({ summary: {} });

      await useUsageStore.getState().fetchTodaySummary();

      expect(getUsageAnalytics).not.toHaveBeenCalled();
    });
  });

  describe('setRange', () => {
    it('sets valid range and fetches', async () => {
      getUsageAnalytics.mockResolvedValue({});
      useUsageStore.setState({ range: 'today', data: { old: true } });

      useUsageStore.getState().setRange('7d');

      expect(useUsageStore.getState().range).toBe('7d');
      expect(useUsageStore.getState().customRange).toBeNull();
      expect(useUsageStore.getState().data).toBeNull();
      await vi.waitFor(() => {
        expect(getUsageAnalytics).toHaveBeenCalledWith('7d', null);
      });
    });

    it('ignores invalid range', () => {
      useUsageStore.setState({ range: 'today', data: {} });

      useUsageStore.getState().setRange('invalid');

      expect(useUsageStore.getState().range).toBe('today');
      expect(getUsageAnalytics).not.toHaveBeenCalled();
    });
  });

  describe('setCustomRange', () => {
    it('sets custom range and fetches', async () => {
      getUsageAnalytics.mockResolvedValue({});
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');

      useUsageStore.getState().setCustomRange(start, end);

      expect(useUsageStore.getState().customRange).toEqual({
        startDate: start,
        endDate: end,
      });
      expect(useUsageStore.getState().data).toBeNull();
      await vi.waitFor(() => {
        expect(getUsageAnalytics).toHaveBeenCalledWith(
          'today',
          expect.objectContaining({ startDate: start, endDate: end }),
        );
      });
    });

    it('clears custom range when start or end missing', () => {
      useUsageStore.setState({ customRange: { startDate: new Date(), endDate: new Date() } });

      useUsageStore.getState().setCustomRange(null, new Date());
      expect(useUsageStore.getState().customRange).toBeNull();

      useUsageStore.getState().setCustomRange(new Date(), null);
      expect(useUsageStore.getState().customRange).toBeNull();
    });
  });
});
