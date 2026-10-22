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

/**
 * Minimal KV binding contract satisfied by Cloudflare Workers KV namespaces,
 * Vercel KV, Redis clients, and similar edge key-value stores.
 */
export interface KvNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface KvCacheStoreOptions {
  /** Key prefix in the shared KV namespace (default: 'omnisearch:cache:v1:'). */
  keyPrefix?: string;
  /** Default TTL in milliseconds (default: 300_000 = 5 minutes). */
  defaultTtlMs?: number;
}

const FNV_64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_64_PRIME = 0x100000001b3n;

function fnv1a64Hex(input: string): string {
  let hash = FNV_64_OFFSET_BASIS;
  const bytes = new TextEncoder().encode(input);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * FNV_64_PRIME);
  }
  return hash.toString(16).padStart(16, '0');
}

export class KvCacheStore implements SearchCacheStore {
  private readonly kv: KvNamespaceLike;
  private readonly keyPrefix: string;
  private readonly defaultTtlMs: number;

  constructor(kv: KvNamespaceLike, options?: KvCacheStoreOptions) {
    this.kv = kv;
    this.keyPrefix = options?.keyPrefix ?? 'omnisearch:cache:v1:';
    this.defaultTtlMs = options?.defaultTtlMs ?? 5 * 60 * 1000;
  }

  public async get(key: string): Promise<SearchResult[] | undefined> {
    try {
      const raw = await this.kv.get(this.prefixKey(key));
      if (!raw) return undefined;
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as SearchResult[]) : undefined;
    } catch {
      return undefined;
    }
  }

  public async set(key: string, value: SearchResult[], ttlMs?: number): Promise<void> {
    try {
      const effectiveTtlMs = ttlMs ?? this.defaultTtlMs;
      // Cloudflare Workers KV requires expirationTtl >= 60 seconds.
      const expirationTtl = Math.max(60, Math.ceil(effectiveTtlMs / 1000));
      await this.kv.put(this.prefixKey(key), JSON.stringify(value), { expirationTtl });
    } catch {
      // Fail-open: KV write failures must not break searches.
    }
  }

  public async delete(key: string): Promise<void> {
    try {
      await this.kv.delete?.(this.prefixKey(key));
    } catch {
      // Fail-open.
    }
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${fnv1a64Hex(key)}`;
  }
}

export function createKvCacheStore(
  kv: KvNamespaceLike,
  options?: KvCacheStoreOptions
): KvCacheStore {
  return new KvCacheStore(kv, options);
}

export * from '../types';
