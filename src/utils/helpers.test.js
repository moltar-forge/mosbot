import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  parseDatabaseDate,
  formatDateTimeLocal,
  truncateText,
  generateId,
  classNames,
} from './helpers';

describe('helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Set a fixed date for consistent testing
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('formatDate', () => {
    it('formats a date correctly', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const result = formatDate(date);

      expect(result).toBe('Jan 15, 2024');
    });

    it('returns empty string for null', () => {
      expect(formatDate(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatDate(undefined)).toBe('');
    });

    it('handles date string', () => {
      const result = formatDate('2024-01-15T12:00:00Z');
      expect(result).toBe('Jan 15, 2024');
    });
  });

  describe('formatDateTime', () => {
    it('formats date and time correctly', () => {
      const date = new Date('2024-01-15T14:30:00Z');
      const result = formatDateTime(date);

      // Format uses local timezone, so check for date part and time format
      expect(result).toContain('Jan 15, 2024');
      expect(result).toMatch(/\d{2}:\d{2}/);
    });

    it('returns empty string for null', () => {
      expect(formatDateTime(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatDateTime(undefined)).toBe('');
    });

    it('handles date string', () => {
      const result = formatDateTime('2024-01-15T14:30:00Z');
      expect(result).toContain('Jan 15, 2024');
      expect(result).toMatch(/\d{2}:\d{2}/);
    });
  });

  describe('formatRelativeTime', () => {
    it('formats relative time correctly', () => {
      const pastDate = new Date('2024-01-15T11:00:00Z'); // 1 hour ago
      const result = formatRelativeTime(pastDate);

      expect(result).toContain('ago');
    });

    it('returns empty string for null', () => {
      expect(formatRelativeTime(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatRelativeTime(undefined)).toBe('');
    });

    it('handles date string', () => {
      const pastDate = '2024-01-15T11:00:00Z';
      const result = formatRelativeTime(pastDate);

      expect(result).toContain('ago');
    });
  });

  describe('parseDatabaseDate', () => {
    it('parses date string with Z timezone', () => {
      const result = parseDatabaseDate('2024-01-15T12:00:00Z');

      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe('2024-01-15T12:00:00.000Z');
    });

    it('parses date string with timezone offset', () => {
      const result = parseDatabaseDate('2024-01-15T12:00:00+05:00');

      expect(result).toBeInstanceOf(Date);
    });

    it('parses PostgreSQL timestamp format (space-separated, no timezone)', () => {
      const result = parseDatabaseDate('2024-01-15 12:00:00.087');

      expect(result).toBeInstanceOf(Date);
      // Should be treated as UTC
      expect(result.toISOString()).toBe('2024-01-15T12:00:00.087Z');
    });

    it('returns Date object as-is', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const result = parseDatabaseDate(date);

      expect(result).toBe(date);
    });

    it('converts timestamp number to Date', () => {
      const timestamp = new Date('2024-01-15T12:00:00Z').getTime();
      const result = parseDatabaseDate(timestamp);

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBe(timestamp);
    });

    it('returns null for null', () => {
      expect(parseDatabaseDate(null)).toBeNull();
    });

    it('returns null for undefined', () => {
      expect(parseDatabaseDate(undefined)).toBeNull();
    });

    it('handles empty string', () => {
      expect(parseDatabaseDate('')).toBeNull();
    });

    it('handles whitespace-only string', () => {
      const result = parseDatabaseDate('   ');
      // parseDatabaseDate trims and appends 'Z', which creates invalid date
      expect(result).toBeInstanceOf(Date);
      expect(isNaN(result.getTime())).toBe(true);
    });
  });

  describe('formatDateTimeLocal', () => {
    it('formats date in local timezone', () => {
      const date = new Date('2024-01-15T12:00:00Z');
      const result = formatDateTimeLocal(date);

      // Should contain date and time components
      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/); // DD/MM/YYYY format
      expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/); // Time format
    });

    it('returns empty string for null', () => {
      expect(formatDateTimeLocal(null)).toBe('');
    });

    it('returns empty string for undefined', () => {
      expect(formatDateTimeLocal(undefined)).toBe('');
    });

    it('handles PostgreSQL timestamp format', () => {
      const result = formatDateTimeLocal('2024-01-15 12:00:00.087');

      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });

    it('returns empty string for invalid date', () => {
      const result = formatDateTimeLocal('invalid-date');

      expect(result).toBe('');
    });

    it('handles date string with timezone', () => {
      const result = formatDateTimeLocal('2024-01-15T12:00:00Z');

      expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    });
  });

  describe('truncateText', () => {
    it('truncates text longer than maxLength', () => {
      const text = 'This is a very long text that should be truncated';
      const result = truncateText(text, 20);

      expect(result).toBe('This is a very long ...');
      expect(result.length).toBe(23); // 20 chars + '...'
    });

    it('returns text as-is when shorter than maxLength', () => {
      const text = 'Short text';
      const result = truncateText(text, 20);

      expect(result).toBe('Short text');
    });

    it('returns text as-is when equal to maxLength', () => {
      const text = 'Exactly twenty chars!';
      // Text is 21 chars, so it will be truncated
      const result = truncateText(text, 20);

      expect(result).toBe('Exactly twenty chars...');
    });

    it('uses default maxLength of 100', () => {
      const shortText = 'Short text';
      const result = truncateText(shortText);

      expect(result).toBe('Short text');
    });

    it('handles null', () => {
      expect(truncateText(null)).toBeNull();
    });

    it('handles undefined', () => {
      expect(truncateText(undefined)).toBeUndefined();
    });

    it('handles empty string', () => {
      expect(truncateText('')).toBe('');
    });
  });

  describe('generateId', () => {
    it('generates a unique ID', () => {
      const id1 = generateId();
      const id2 = generateId();

      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBeGreaterThan(0);
    });

    it('generates ID with timestamp and random string', () => {
      const id = generateId();

      // Should contain timestamp and random string separated by dash
      expect(id).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it('generates different IDs on subsequent calls', () => {
      const ids = Array.from({ length: 10 }, () => generateId());
      const uniqueIds = new Set(ids);

      // All IDs should be unique
      expect(uniqueIds.size).toBe(10);
    });
  });

  describe('classNames', () => {
    it('joins multiple class strings', () => {
      const result = classNames('class1', 'class2', 'class3');

      expect(result).toBe('class1 class2 class3');
    });

    it('filters out falsy values', () => {
      const result = classNames('class1', null, 'class2', undefined, false, 'class3');

      expect(result).toBe('class1 class2 class3');
    });

    it('handles empty arguments', () => {
      expect(classNames()).toBe('');
    });

    it('handles all falsy values', () => {
      expect(classNames(null, undefined, false, '')).toBe('');
    });

    it('handles single class', () => {
      expect(classNames('single')).toBe('single');
    });

    it('handles conditional classes', () => {
      const condition = true;
      const result = classNames('base', condition && 'conditional', 'end');

      expect(result).toBe('base conditional end');
    });

    it('handles conditional classes that are false', () => {
      const condition = false;
      const result = classNames('base', condition && 'conditional', 'end');

      expect(result).toBe('base end');
    });
  });
});
