import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStandupStore } from './standupStore';
import { getStandups, getLatestStandup, getStandupById } from '../api/client';

vi.mock('../api/client', () => ({
  getStandups: vi.fn(),
  getLatestStandup: vi.fn(),
  getStandupById: vi.fn(),
}));

describe('standupStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStandupStore.setState({
      standups: [],
      isLoadingList: false,
      errorList: null,
      pagination: { limit: 50, offset: 0, total: 0 },
      activeStandup: null,
      isLoadingDetail: false,
      errorDetail: null,
    });
  });

  describe('fetchStandups', () => {
    it('fetches standups list on success', async () => {
      const mockData = [{ id: 1, content: 'Standup 1' }];
      getStandups.mockResolvedValue({
        data: mockData,
        pagination: { limit: 50, offset: 0, total: 1 },
      });

      await useStandupStore.getState().fetchStandups();

      expect(getStandups).toHaveBeenCalledWith({ limit: 50, offset: 0 });
      expect(useStandupStore.getState().standups).toEqual(mockData);
      expect(useStandupStore.getState().pagination.total).toBe(1);
      expect(useStandupStore.getState().isLoadingList).toBe(false);
    });

    it('handles fetch error', async () => {
      getStandups.mockRejectedValue({
        response: { data: { error: { message: 'Failed' } } },
      });

      await useStandupStore.getState().fetchStandups();

      expect(useStandupStore.getState().errorList).toBe('Failed');
      expect(useStandupStore.getState().isLoadingList).toBe(false);
    });

    it('supports silent mode', async () => {
      getStandups.mockResolvedValue({ data: [], pagination: {} });

      await useStandupStore.getState().fetchStandups({ silent: true });

      expect(useStandupStore.getState().isLoadingList).toBe(false);
    });
  });

  describe('fetchLatestStandup', () => {
    it('fetches latest standup on success', async () => {
      const mockStandup = { id: 1, content: 'Latest' };
      getLatestStandup.mockResolvedValue(mockStandup);

      const result = await useStandupStore.getState().fetchLatestStandup();

      expect(result).toEqual(mockStandup);
      expect(useStandupStore.getState().activeStandup).toEqual(mockStandup);
      expect(useStandupStore.getState().isLoadingDetail).toBe(false);
    });

    it('handles error and returns null', async () => {
      getLatestStandup.mockRejectedValue({
        response: { data: { error: { message: 'Not found' } } },
      });

      const result = await useStandupStore.getState().fetchLatestStandup();

      expect(result).toBeNull();
      expect(useStandupStore.getState().errorDetail).toBe('Not found');
    });
  });

  describe('fetchStandupById', () => {
    it('fetches standup by id on success', async () => {
      const mockStandup = { id: 2, content: 'Standup 2' };
      getStandupById.mockResolvedValue(mockStandup);

      const result = await useStandupStore.getState().fetchStandupById('2');

      expect(getStandupById).toHaveBeenCalledWith('2');
      expect(result).toEqual(mockStandup);
      expect(useStandupStore.getState().activeStandup).toEqual(mockStandup);
    });

    it('returns null when id is falsy', async () => {
      const result = await useStandupStore.getState().fetchStandupById(null);

      expect(result).toBeNull();
      expect(getStandupById).not.toHaveBeenCalled();
      expect(useStandupStore.getState().activeStandup).toBeNull();
    });

    it('handles error and returns null', async () => {
      getStandupById.mockRejectedValue({
        response: { data: { error: { message: 'Not found' } } },
      });

      const result = await useStandupStore.getState().fetchStandupById('999');

      expect(result).toBeNull();
      expect(useStandupStore.getState().errorDetail).toBe('Not found');
    });
  });

  describe('clearActiveStandup', () => {
    it('clears active standup and error', () => {
      useStandupStore.setState({
        activeStandup: { id: 1 },
        errorDetail: 'Some error',
      });

      useStandupStore.getState().clearActiveStandup();

      expect(useStandupStore.getState().activeStandup).toBeNull();
      expect(useStandupStore.getState().errorDetail).toBeNull();
    });
  });

  describe('refreshActiveStandup', () => {
    it('refetches when active standup has id', async () => {
      useStandupStore.setState({ activeStandup: { id: 1 } });
      getStandupById.mockResolvedValue({ id: 1, content: 'Updated' });

      await useStandupStore.getState().refreshActiveStandup();

      expect(getStandupById).toHaveBeenCalledWith(1);
    });

    it('does nothing when no active standup', async () => {
      useStandupStore.setState({ activeStandup: null });

      await useStandupStore.getState().refreshActiveStandup();

      expect(getStandupById).not.toHaveBeenCalled();
    });
  });
});
