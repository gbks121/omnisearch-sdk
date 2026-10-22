import { describe, expect, it, vi } from 'vitest';
import { webSearchStream } from '../index';
import type { SearchProvider, SearchResult } from '../types';

describe('webSearchStream', () => {
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
        throw new Error(`${name} stream failed`);
      }
      return results;
    }),
  });

  const res1: SearchResult = {
    url: 'https://example.com/fast',
    title: 'Fast result',
    provider: 'fast-p',
  };

  const res2: SearchResult = {
    url: 'https://example.com/slow',
    title: 'Slow result',
    provider: 'slow-p',
  };

  it('should stream results incrementally as providers resolve', async () => {
    const fastP = createMockProvider('fast-p', [res1], 10);
    const slowP = createMockProvider('slow-p', [res2], 60);

    const received: SearchResult[] = [];
    const timestamps: number[] = [];
    const start = Date.now();

    for await (const result of webSearchStream({
      query: 'stream test',
      provider: [slowP, fastP],
    })) {
      received.push(result);
      timestamps.push(Date.now() - start);
    }

    expect(received).toHaveLength(2);
    // fastP should yield first despite being second in the provider array
    expect(received[0].url).toBe('https://example.com/fast');
    expect(received[1].url).toBe('https://example.com/slow');
  });

  it('should deduplicate results on the fly if deduplicate is enabled', async () => {
    const dupRes1: SearchResult = {
      url: 'https://example.com/article?utm_source=twitter',
      title: 'Article 1',
      provider: 'p1',
    };
    const dupRes2: SearchResult = {
      url: 'http://example.com/article/',
      title: 'Article 1 duplicate',
      provider: 'p2',
    };

    const p1 = createMockProvider('p1', [dupRes1], 10);
    const p2 = createMockProvider('p2', [dupRes2], 30);

    const streamed: SearchResult[] = [];
    for await (const result of webSearchStream({
      query: 'test',
      provider: [p1, p2],
      deduplicate: true,
    })) {
      streamed.push(result);
    }

    expect(streamed).toHaveLength(1);
    expect(streamed[0].provider).toBe('p1');
  });

  it('should write the canonical URL back onto streamed items when deduplicating', async () => {
    const tracked: SearchResult = {
      url: 'https://example.com/article?utm_source=twitter&id=9',
      title: 'Article',
      provider: 'p1',
    };

    const p1 = createMockProvider('p1', [tracked], 5);

    const streamed: SearchResult[] = [];
    for await (const result of webSearchStream({
      query: 'test',
      provider: [p1],
      deduplicate: true,
    })) {
      streamed.push(result);
    }

    expect(streamed).toHaveLength(1);
    expect(streamed[0].url).toBe('https://example.com/article?id=9');
  });

  it('should throw if all streaming providers fail', async () => {
    const p1 = createMockProvider('p1', [], 10, true);
    const p2 = createMockProvider('p2', [], 10, true);

    const stream = webSearchStream({
      query: 'test',
      provider: [p1, p2],
    });

    await expect(async () => {
      for await (const _ of stream) {
        // empty
      }
    }).rejects.toThrow('All 2 provider(s) failed');
  });
});
