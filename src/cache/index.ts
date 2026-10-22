import type { SearchCacheStore, SearchQuery, SearchResult } from '../types';

export interface MemoryCacheStoreOptions {
  maxEntries?: number;
  defaultTtlMs?: number;
}

interface CacheEntry {
  value: SearchResult[];
  expiresAt?: number;
}

export class MemoryCacheStore implements SearchCacheStore {
  private readonly maxEntries: number;
  private readonly defaultTtlMs?: number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options?: MemoryCacheStoreOptions) {
    this.maxEntries = options?.maxEntries ?? 500;
    this.defaultTtlMs = options?.defaultTtlMs ?? 5 * 60 * 1000; // 5 minutes default
  }

  public get(key: string): SearchResult[] | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Refresh position for LRU (re-insert)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  public set(key: string, value: SearchResult[], ttlMs?: number): void {
    const effectiveTtl = ttlMs ?? this.defaultTtlMs;
    const expiresAt = effectiveTtl ? Date.now() + effectiveTtl : undefined;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict least recently used (first key in insertion order)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { value, expiresAt });
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public delete(key: string): void {
    this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  public get size(): number {
    return this.cache.size;
  }
}

export function generateCacheKey(providerName: string, query: SearchQuery): string {
  const parts: Record<string, unknown> = {
    provider: providerName,
    q: query.query ?? '',
    max: query.maxResults ?? 10,
    freshness: query.freshness || query.recencyFilter,
    type: query.searchType,
    page: query.page,
    lang: query.language,
    region: query.region,
    safe: query.safeSearch,
    inc: query.includeDomains ? [...query.includeDomains].sort().join(',') : undefined,
    exc: query.excludeDomains ? [...query.excludeDomains].sort().join(',') : undefined,
  };

  return JSON.stringify(parts);
}

export * from '../types';
