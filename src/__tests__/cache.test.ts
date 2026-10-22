import { describe, expect, it } from 'vitest';
import { generateCacheKey, MemoryCacheStore } from '../cache';
import { AbstractSearchProvider } from '../providers/base';
import type { ProviderConfig, SearchQuery, SearchResult } from '../types';

describe('MemoryCacheStore', () => {
  it('should store and retrieve results', () => {
    const store = new MemoryCacheStore();
    const results: SearchResult[] = [
      { url: 'https://example.com', title: 'Example', provider: 'test' },
    ];

    store.set('key1', results);
    expect(store.has('key1')).toBe(true);
    expect(store.get('key1')).toEqual(results);
  });

  it('should return undefined when item does not exist', () => {
    const store = new MemoryCacheStore();
    expect(store.get('missing')).toBeUndefined();
    expect(store.has('missing')).toBe(false);
  });

  it('should expire items after TTL has elapsed', async () => {
    const store = new MemoryCacheStore({ defaultTtlMs: 20 });
    const results: SearchResult[] = [
      { url: 'https://example.com', title: 'Example', provider: 'test' },
    ];

    store.set('short-lived', results, 20);
    expect(store.get('short-lived')).toEqual(results);

    await new Promise((r) => setTimeout(r, 30));
    expect(store.get('short-lived')).toBeUndefined();
  });

  it('should evict least recently used entry when maxEntries is exceeded', () => {
    const store = new MemoryCacheStore({ maxEntries: 2 });
    const r1: SearchResult[] = [{ url: 'https://1.com', title: '1', provider: 'test' }];
    const r2: SearchResult[] = [{ url: 'https://2.com', title: '2', provider: 'test' }];
    const r3: SearchResult[] = [{ url: 'https://3.com', title: '3', provider: 'test' }];

    store.set('k1', r1);
    store.set('k2', r2);

    // Access k1 to make k2 the oldest
    store.get('k1');

    // Add k3 -> should evict k2
    store.set('k3', r3);

    expect(store.get('k1')).toEqual(r1);
    expect(store.get('k2')).toBeUndefined();
    expect(store.get('k3')).toEqual(r3);
  });

  it('should delete and clear entries properly', () => {
    const store = new MemoryCacheStore();
    store.set('k1', [{ url: 'https://1.com', title: '1', provider: 'test' }]);
    store.set('k2', [{ url: 'https://2.com', title: '2', provider: 'test' }]);

    expect(store.size).toBe(2);
    store.delete('k1');
    expect(store.has('k1')).toBe(false);
    expect(store.size).toBe(1);

    store.clear();
    expect(store.size).toBe(0);
  });

  it('should generate deterministic cache keys', () => {
    const key1 = generateCacheKey('google', {
      query: 'AI agents',
      maxResults: 10,
      freshness: 'day',
    });
    const key2 = generateCacheKey('google', {
      query: 'AI agents',
      maxResults: 10,
      freshness: 'day',
    });
    const key3 = generateCacheKey('google', {
      query: 'AI agents',
      maxResults: 20,
      freshness: 'day',
    });

    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });
});

class MockSearchProvider extends AbstractSearchProvider {
  public readonly name = 'cached-test';
  public searchCount = 0;

  constructor(config: ProviderConfig = {}) {
    super(config);
  }

  protected async doSearch(_options: SearchQuery): Promise<SearchResult[]> {
    this.searchCount++;
    return [{ url: 'https://result.com', title: 'Cached result', provider: this.name }];
  }
}

describe('Provider caching integration', () => {
  it('should avoid network calls on cache hit when cache is enabled', async () => {
    const customStore = new MemoryCacheStore();
    const provider = new MockSearchProvider({ cache: customStore });

    const res1 = await provider.search({ query: 'hello', cache: true });
    expect(res1).toHaveLength(1);
    expect(provider.searchCount).toBe(1);

    const res2 = await provider.search({ query: 'hello', cache: true });
    expect(res2).toEqual(res1);
    expect(provider.searchCount).toBe(1); // Cached! No extra doSearch call
  });
});
