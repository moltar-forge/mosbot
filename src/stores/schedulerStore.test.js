import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSchedulerStore } from './schedulerStore';

describe('schedulerStore', () => {
  beforeEach(() => {
    useSchedulerStore.setState({
      attention: { errors: 0, missed: 0 },
      cachedJobs: null,
      jobsCacheTimestamp: null,
      lastFetchedAt: null,
      isRefreshing: false,
    });
    vi.restoreAllMocks();
  });

  it('starts with expected defaults', () => {
    const state = useSchedulerStore.getState();
    expect(state.attention).toEqual({ errors: 0, missed: 0 });
    expect(state.cachedJobs).toBeNull();
    expect(state.jobsCacheTimestamp).toBeNull();
    expect(state.lastFetchedAt).toBeNull();
    expect(state.isRefreshing).toBe(false);
  });

  it('setAttention stores provided counts and defaults missing values to zero', () => {
    useSchedulerStore.getState().setAttention({ errors: 3, missed: 1 });
    expect(useSchedulerStore.getState().attention).toEqual({ errors: 3, missed: 1 });

    useSchedulerStore.getState().setAttention({ errors: 2 });
    expect(useSchedulerStore.getState().attention).toEqual({ errors: 2, missed: 0 });

    useSchedulerStore.getState().setAttention({});
    expect(useSchedulerStore.getState().attention).toEqual({ errors: 0, missed: 0 });
  });

  it('setCachedJobs stores jobs and updates timestamps', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValueOnce(1111).mockReturnValueOnce(2222);
    const jobs = [{ id: 'job-1', enabled: true }];

    useSchedulerStore.getState().setCachedJobs(jobs);

    const state = useSchedulerStore.getState();
    expect(state.cachedJobs).toEqual(jobs);
    expect(state.jobsCacheTimestamp).toBe(1111);
    expect(state.lastFetchedAt).toBe(2222);
    expect(nowSpy).toHaveBeenCalledTimes(2);
  });

  it('setRefreshing toggles refresh status', () => {
    useSchedulerStore.getState().setRefreshing(true);
    expect(useSchedulerStore.getState().isRefreshing).toBe(true);

    useSchedulerStore.getState().setRefreshing(false);
    expect(useSchedulerStore.getState().isRefreshing).toBe(false);
  });

  it('clearCachedJobs resets cache and fetch timestamps', () => {
    useSchedulerStore.setState({
      cachedJobs: [{ id: 'job-2' }],
      jobsCacheTimestamp: 100,
      lastFetchedAt: 200,
    });

    useSchedulerStore.getState().clearCachedJobs();
    const state = useSchedulerStore.getState();

    expect(state.cachedJobs).toBeNull();
    expect(state.jobsCacheTimestamp).toBeNull();
    expect(state.lastFetchedAt).toBeNull();
  });
});
