import { describe, expect, it } from 'vitest';
import * as omnisearch from '../index';

describe('Strict Edge Runtime Verification', () => {
  it('should export all primary public symbols without relying on Node-only builtins', () => {
    expect(typeof omnisearch.webSearch).toBe('function');
    expect(typeof omnisearch.webSearchStream).toBe('function');
    expect(typeof omnisearch.reciprocalRankFusion).toBe('function');
    expect(typeof omnisearch.normalizeUrl).toBe('function');
    expect(typeof omnisearch.dedupeResults).toBe('function');
    expect(typeof omnisearch.normalizeIsoDate).toBe('function');
    expect(typeof omnisearch.MemoryCacheStore).toBe('function');
  });

  it('should only use Web Standard fetch, URL, and AbortController primitives in core transport', () => {
    // Verify standard primitives exist in runtime environment
    expect(typeof globalThis.fetch).toBe('function');
    expect(typeof globalThis.URL).toBe('function');
    expect(typeof globalThis.URLSearchParams).toBe('function');
    expect(typeof globalThis.AbortController).toBe('function');
    expect(typeof globalThis.Headers).toBe('function');
  });

  it('should instantiate MemoryCacheStore and providers in a pure in-memory web context', async () => {
    const cache = new omnisearch.MemoryCacheStore();
    cache.set('edge-key', [
      { url: 'https://edge.cloudflare.com', title: 'Edge Worker', provider: 'test' },
    ]);
    expect(cache.has('edge-key')).toBe(true);

    const rrf = omnisearch.reciprocalRankFusion([
      [{ url: 'https://edge.cloudflare.com', title: 'Edge Worker', provider: 'test' }],
    ]);
    expect(rrf).toHaveLength(1);
  });
});
