import { create } from 'zustand';

/**
 * Holds scheduler "attention" counts for nav badges (errors, missed).
 * Also caches cron jobs for instant display when navigating back to the page.
 * Updated by the Scheduler page when cron jobs are loaded.
 */
export const useSchedulerStore = create((set) => ({
  attention: { errors: 0, missed: 0 },
  cachedJobs: null, // Cached jobs for stale-while-revalidate pattern
  jobsCacheTimestamp: null, // When jobs were last cached
  lastFetchedAt: null, // When jobs were last fetched (for Header display)
  isRefreshing: false, // Whether jobs are currently being refreshed

  setAttention: (counts) =>
    set({ attention: { errors: counts.errors ?? 0, missed: counts.missed ?? 0 } }),

  setCachedJobs: (jobs) =>
    set({
      cachedJobs: jobs,
      jobsCacheTimestamp: Date.now(),
      lastFetchedAt: Date.now(),
    }),

  setRefreshing: (isRefreshing) => set({ isRefreshing }),

  clearCachedJobs: () => set({ cachedJobs: null, jobsCacheTimestamp: null, lastFetchedAt: null }),
}));
