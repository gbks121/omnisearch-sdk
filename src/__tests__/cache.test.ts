import { describe, expect, it, vi } from 'vitest';
import { createKvCacheStore, generateCacheKey, KvCacheStore, MemoryCacheStore } from '../cache';
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

function createMockKv() {
  const store = new Map<string, string>();
  let lastPutOptions: { expirationTtl?: number } | undefined;
  const kv = {
    store,
    get lastPutOptions() {
      return lastPutOptions;
    },
    get: vi.fn(async (key: string): Promise<string | null> => store.get(key) ?? null),
    put: vi.fn(
      async (key: string, value: string, options?: { expirationTtl?: number }): Promise<void> => {
        store.set(key, value);
        lastPutOptions = options;
      }
    ),
    delete: vi.fn(async (key: string): Promise<void> => {
      store.delete(key);
    }),
  };
  return kv;
}

describe('KvCacheStore', () => {
  const sampleResults: SearchResult[] = [
    { url: 'https://example.com', title: 'Example', provider: 'kv-test' },
  ];

  it('reads and writes serialized SearchResult[] through the KV binding', async () => {
    const kv = createMockKv();
    const cache = new KvCacheStore(kv);

    await cache.set('key1', sampleResults, 120_000);
    expect(kv.put).toHaveBeenCalledTimes(1);

    const read = await cache.get('key1');
    expect(read).toEqual(sampleResults);
  });

  it('prefixes and compacts keys deterministically under the default prefix', async () => {
    const kv = createMockKv();
    const cache = new KvCacheStore(kv);

    await cache.set(generateCacheKey('google', { query: 'a' }), sampleResults);
    await cache.set(generateCacheKey('google', { query: 'a' }), sampleResults);

    const putKey = kv.put.mock.calls[0][0];
    expect(putKey.startsWith('omnisearch:cache:v1:')).toBe(true);
    expect(putKey.length).toBeLessThanOrEqual(512);
    expect(kv.put.mock.calls[1][0]).toBe(putKey);

    const otherKey = kv.put.mock.calls[0][0];
    await cache.set(generateCacheKey('brave', { query: 'a' }), sampleResults);
    expect(kv.put.mock.calls[2][0]).not.toBe(otherKey);
  });

  it('respects a custom keyPrefix', async () => {
    const kv = createMockKv();
    const cache = new KvCacheStore(kv, { keyPrefix: 'myapp:' });

    await cache.set('key1', sampleResults);

    expect(kv.put.mock.calls[0][0].startsWith('myapp:')).toBe(true);
  });

  it('clamps sub-60s TTLs to expirationTtl of 60 seconds', async () => {
    const kv = createMockKv();
    const cache = new KvCacheStore(kv);

    await cache.set('key1', sampleResults, 5_000);

    expect(kv.lastPutOptions?.expirationTtl).toBe(60);
  });

  it('converts millisecond TTLs to whole seconds', async () => {
    const kv = createMockKv();
    const cache = new KvCacheStore(kv);

    await cache.set('key1', sampleResults, 300_000);

    expect(kv.lastPutOptions?.expirationTtl).toBe(300);
  });

  it('uses defaultTtlMs when no TTL is provided', async () => {
    const kv = createMockKv();
    const cache = new KvCacheStore(kv, { defaultTtlMs: 120_000 });

    await cache.set('key1', sampleResults);

    expect(kv.lastPutOptions?.expirationTtl).toBe(120);
  });

  it('fails open on corrupt JSON', async () => {
    const kv = createMockKv();
    kv.store.set('omnisearch:cache:v1:deadbeef', 'not json');
    const cache = new KvCacheStore(kv);

    expect(await cache.get('anything')).toBeUndefined();
  });

  it('fails open when KV get rejects', async () => {
    const kv = createMockKv();
    kv.get = vi.fn(async () => {
      throw new Error('KV unavailable');
    });
    const cache = new KvCacheStore(kv);

    expect(await cache.get('key1')).toBeUndefined();
  });

  it('fails open when KV put rejects', async () => {
    const kv = createMockKv();
    kv.put = vi.fn(async () => {
      throw new Error('KV write failed');
    });
    const cache = new KvCacheStore(kv);

    await expect(cache.set('key1', sampleResults)).resolves.toBeUndefined();
  });

  it('returns undefined for missing keys and non-array payloads', async () => {
    const kv = createMockKv();
    const cache = new KvCacheStore(kv);

    expect(await cache.get('missing')).toBeUndefined();

    await cache.set('key1', sampleResults);
    const storedKey = kv.put.mock.calls[0][0];
    kv.store.set(storedKey, JSON.stringify({ no: 'array' }));

    expect(await cache.get('key1')).toBeUndefined();
  });

  it('deletes keys through the KV binding when available', async () => {
    const kv = createMockKv();
    const cache = new KvCacheStore(kv);

    await cache.set('key1', sampleResults);
    await cache.delete('key1');

    expect(await cache.get('key1')).toBeUndefined();
    expect(kv.delete).toHaveBeenCalledTimes(1);
  });

  it('reports { cached: true } in onResponse on KV cache hits when wired to a provider', async () => {
    const kv = createMockKv();
    const cache = createKvCacheStore(kv);
    const provider = new MockSearchProvider({ cache });

    const onResponse = vi.fn();
    await provider.search({ query: 'kv', hooks: { onResponse } });
    expect(provider.searchCount).toBe(1);

    onResponse.mockClear();
    await provider.search({ query: 'kv', hooks: { onResponse } });

    expect(provider.searchCount).toBe(1);
    expect(onResponse).toHaveBeenCalledWith('cached-test', 1, 0, { cached: true });
  });

  it('exposes createKvCacheStore factory', () => {
    const kv = createMockKv();
    const cache = createKvCacheStore(kv);
    expect(cache).toBeInstanceOf(KvCacheStore);
  });
});
