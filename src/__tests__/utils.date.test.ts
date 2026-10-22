import { describe, expect, it } from 'vitest';
import { normalizeIsoDate } from '../utils/date';

describe('normalizeIsoDate', () => {
  const FIXED_NOW = 1774350000000; // e.g., 2026-03-24T11:00:00.000Z

  it('should normalize standard ISO string', () => {
    const iso = '2026-03-20T14:30:00.000Z';
    expect(normalizeIsoDate(iso)).toBe(iso);
  });

  it('should parse date string and return ISO 8601 UTC format', () => {
    const res = normalizeIsoDate('2026-01-15');
    expect(res).toBeDefined();
    expect(res).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('should parse Unix epoch timestamp in seconds', () => {
    const epochSec = 1774350000;
    const res = normalizeIsoDate(epochSec);
    expect(res).toBe('2026-03-24T11:00:00.000Z');
  });

  it('should parse Unix epoch timestamp in milliseconds', () => {
    const epochMs = 1774350000000;
    const res = normalizeIsoDate(epochMs);
    expect(res).toBe('2026-03-24T11:00:00.000Z');
  });

  it('should parse relative time strings accurately', () => {
    const oneSecAgo = normalizeIsoDate('10 seconds ago', FIXED_NOW);
    expect(oneSecAgo).toBe(new Date(FIXED_NOW - 10000).toISOString());

    const fiveMinsAgo = normalizeIsoDate('5 mins ago', FIXED_NOW);
    expect(fiveMinsAgo).toBe(new Date(FIXED_NOW - 5 * 60000).toISOString());

    const oneHourAgo = normalizeIsoDate('1 hour ago', FIXED_NOW);
    expect(oneHourAgo).toBe(new Date(FIXED_NOW - 3600000).toISOString());

    const twoDaysAgo = normalizeIsoDate('2 days ago', FIXED_NOW);
    expect(twoDaysAgo).toBe(new Date(FIXED_NOW - 2 * 86400000).toISOString());

    const threeWeeksAgo = normalizeIsoDate('3 weeks ago', FIXED_NOW);
    expect(threeWeeksAgo).toBe(new Date(FIXED_NOW - 3 * 7 * 86400000).toISOString());

    const twoMonthsAgo = normalizeIsoDate('2 months ago', FIXED_NOW);
    expect(twoMonthsAgo).toBe(new Date(FIXED_NOW - 2 * 30 * 86400000).toISOString());

    const oneYearAgo = normalizeIsoDate('1 year ago', FIXED_NOW);
    expect(oneYearAgo).toBe(new Date(FIXED_NOW - 365 * 86400000).toISOString());

    const yesterday = normalizeIsoDate('yesterday', FIXED_NOW);
    expect(yesterday).toBe(new Date(FIXED_NOW - 86400000).toISOString());

    const justNow = normalizeIsoDate('just now', FIXED_NOW);
    expect(justNow).toBe(new Date(FIXED_NOW).toISOString());
  });

  it('should return undefined for empty or invalid input', () => {
    expect(normalizeIsoDate('')).toBeUndefined();
    expect(normalizeIsoDate('   ')).toBeUndefined();
    expect(normalizeIsoDate(null)).toBeUndefined();
    expect(normalizeIsoDate(undefined)).toBeUndefined();
    expect(normalizeIsoDate(-500)).toBeUndefined();
    expect(normalizeIsoDate(NaN)).toBeUndefined();
    expect(normalizeIsoDate('invalid-date-string-xyz')).toBeUndefined();
  });
});
