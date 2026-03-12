const mockPoolQuery = jest.fn();

jest.mock('../../db/pool', () => ({
  query: (...args) => mockPoolQuery(...args),
}));

const {
  parseJsonl,
  fetchRuntimeSubagents,
  enrichWithTaskNumbers,
  getAllSubagents,
  clearEmptyFileCache,
} = require('../subagentsRuntimeService');

describe('subagentsRuntimeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearEmptyFileCache();
  });

  describe('parseJsonl()', () => {
    it('returns empty array for non-string content', () => {
      expect(parseJsonl(null)).toEqual([]);
      expect(parseJsonl({})).toEqual([]);
    });

    it('parses valid lines and ignores malformed lines', () => {
      const content = [JSON.stringify({ a: 1 }), 'not-json', JSON.stringify({ b: 2 })].join('\n');
      expect(parseJsonl(content)).toEqual([{ a: 1 }, { b: 2 }]);
    });
  });

  describe('fetchRuntimeSubagents()', () => {
    it('returns explicit empty runtime data', async () => {
      await expect(fetchRuntimeSubagents()).resolves.toEqual({
        running: [],
        queued: [],
        completed: [],
        activityBySession: expect.any(Map),
      });
    });

    it('returns empty runtime data when filtered by taskId', async () => {
      const result = await fetchRuntimeSubagents({ taskId: 'task-1' });
      expect(result.running).toEqual([]);
      expect(result.queued).toEqual([]);
      expect(result.completed).toEqual([]);
    });
  });

  describe('enrichWithTaskNumbers()', () => {
    it('enriches rows with taskNumber from DB lookup', async () => {
      mockPoolQuery.mockResolvedValueOnce({
        rows: [{ id: 't1', task_number: 101 }],
      });

      const result = await enrichWithTaskNumbers(
        [{ taskId: 't1', status: 'RUNNING' }],
        [{ taskId: null, status: 'SPAWN_QUEUED' }],
        [{ taskId: 'missing', status: 'COMPLETED' }],
      );

      expect(result.running[0].taskNumber).toBe(101);
      expect(result.queued[0].taskNumber).toBeNull();
      expect(result.completed[0].taskNumber).toBeNull();
    });
  });

  describe('getAllSubagents()', () => {
    it('returns empty arrays without runtime-file access', async () => {
      const result = await getAllSubagents();

      expect(mockPoolQuery).not.toHaveBeenCalled();
      expect(result.running).toEqual([]);
      expect(result.queued).toEqual([]);
      expect(result.completed).toEqual([]);
    });
  });
});
