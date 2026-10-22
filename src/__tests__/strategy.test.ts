import { describe, expect, it, vi } from 'vitest';
import { webSearch } from '../index';
import type { SearchProvider, SearchResult } from '../types';

describe('webSearch strategies', () => {
  const createMockProvider = (
    name: string,
    results: SearchResult[],
    delayMs = 0,
    shouldFail = false
  ): SearchProvider => ({
    name,
    config: {},
    search: vi.fn(async () => {
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      if (shouldFail) {
        throw new Error(`${name} search failed`);
      }
      return results;
    }),
  });

  const sampleResult1: SearchResult = {
    url: 'https://example.com/item1?utm_source=twitter',
    title: 'Result 1',
    provider: 'p1',
  };

  const sampleResult2: SearchResult = {
    url: 'https://example.com/item2',
    title: 'Result 2',
    provider: 'p2',
  };

  describe('fallback strategy', () => {
    it('should cascade to the next provider when the first fails', async () => {
      const p1 = createMockProvider('p1', [], 10, true);
      const p2 = createMockProvider('p2', [sampleResult2], 10, false);

      const results = await webSearch({
        query: 'test',
        provider: [p1, p2],
        strategy: 'fallback',
      });

      expect(p1.search).toHaveBeenCalledTimes(1);
      expect(p2.search).toHaveBeenCalledTimes(1);
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Result 2');
    });

    it('should cascade when first provider returns empty results', async () => {
      const p1 = createMockProvider('p1', [], 5, false);
      const p2 = createMockProvider('p2', [sampleResult2], 5, false);

      const results = await webSearch({
        query: 'test',
        provider: [p1, p2],
        strategy: 'fallback',
      });

      expect(p1.search).toHaveBeenCalledTimes(1);
      expect(p2.search).toHaveBeenCalledTimes(1);
      expect(results).toEqual([sampleResult2]);
    });

    it('should stop at the first successful provider with results without calling subsequent ones', async () => {
      const p1 = createMockProvider('p1', [sampleResult1], 5, false);
      const p2 = createMockProvider('p2', [sampleResult2], 5, false);

      const results = await webSearch({
        query: 'test',
        provider: [p1, p2],
        strategy: 'fallback',
      });

      expect(p1.search).toHaveBeenCalledTimes(1);
      expect(p2.search).not.toHaveBeenCalled();
      expect(results).toEqual([sampleResult1]);
    });

    it('should throw when all providers in fallback fail', async () => {
      const p1 = createMockProvider('p1', [], 5, true);
      const p2 = createMockProvider('p2', [], 5, true);

      await expect(
        webSearch({
          query: 'test',
          provider: [p1, p2],
          strategy: 'fallback',
        })
      ).rejects.toThrow('All 2 provider(s) failed');
    });
  });

  describe('race strategy', () => {
    it('should return the fastest provider that returns non-empty results', async () => {
      const p1Slow = createMockProvider('p1', [sampleResult1], 100, false);
      const p2Fast = createMockProvider('p2', [sampleResult2], 10, false);

      const results = await webSearch({
        query: 'test',
        provider: [p1Slow, p2Fast],
        strategy: 'race',
      });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Result 2');
    });

    it('should wait for slower provider if fast provider fails', async () => {
      const p1FastFail = createMockProvider('p1', [], 10, true);
      const p2SlowSuccess = createMockProvider('p2', [sampleResult2], 50, false);

      const results = await webSearch({
        query: 'test',
        provider: [p1FastFail, p2SlowSuccess],
        strategy: 'race',
      });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Result 2');
    });
  });

  describe('deduplication flag in webSearch', () => {
    it('should deduplicate results across providers when deduplicate is true', async () => {
      const dup1: SearchResult = {
        url: 'https://example.com/page?utm_campaign=winter',
        title: 'Title 1',
        provider: 'p1',
      };
      const dup2: SearchResult = {
        url: 'https://example.com/page',
        title: 'Title 1 duplicate',
        provider: 'p2',
      };

      const p1 = createMockProvider('p1', [dup1]);
      const p2 = createMockProvider('p2', [dup2]);

      const results = await webSearch({
        query: 'test',
        provider: [p1, p2],
        strategy: 'parallel',
        deduplicate: true,
      });

      expect(results).toHaveLength(1);
      expect(results[0].provider).toBe('p1');
    });
  });
});
