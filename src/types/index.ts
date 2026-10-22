import { z } from 'zod';

export const SearchResultSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  snippet: z.string().optional(),
  content: z.string().optional(),
  domain: z.string().optional(),
  publishedDate: z.string().optional(),
  provider: z.string(),
  raw: z.unknown().optional(),
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export abstract class SearchProviderError extends Error {
  abstract readonly code: 'RATE_LIMIT' | 'TIMEOUT' | 'VALIDATION' | 'PROVIDER' | 'NETWORK';
  readonly provider: string;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    provider: string,
    options?: { statusCode?: number; retryable?: boolean; cause?: Error }
  ) {
    super(message, { cause: options?.cause });
    this.name = 'SearchProviderError';
    this.provider = provider;
    this.statusCode = options?.statusCode;
    this.retryable = options?.retryable ?? false;
  }
}

export class RateLimitError extends SearchProviderError {
  readonly code = 'RATE_LIMIT' as const;
  readonly telemetry?: RateLimitTelemetry;
  constructor(
    provider: string,
    options?: { statusCode?: number; cause?: Error; telemetry?: RateLimitTelemetry }
  ) {
    const msg = options?.statusCode
      ? `${provider} search failed: rate limit exceeded (HTTP ${options.statusCode})`
      : `${provider} search failed: rate limit exceeded`;
    super(msg, provider, { ...options, retryable: true });
    this.name = 'RateLimitError';
    this.telemetry = options?.telemetry;
  }
}

export class TimeoutError extends SearchProviderError {
  readonly code = 'TIMEOUT' as const;
  constructor(provider: string, message: string, options?: { cause?: Error }) {
    super(message, provider, { retryable: false, ...options });
    this.name = 'TimeoutError';
  }
}

export class SearchValidationError extends SearchProviderError {
  readonly code = 'VALIDATION' as const;
  constructor(provider: string, message: string) {
    super(message, provider, { retryable: false });
    this.name = 'SearchValidationError';
  }
}

export class ProviderApiError extends SearchProviderError {
  readonly code = 'PROVIDER' as const;
  readonly troubleshooting?: string;
  constructor(
    provider: string,
    message: string,
    options?: {
      statusCode?: number;
      retryable?: boolean;
      troubleshooting?: string;
      cause?: Error;
    }
  ) {
    let fullMessage = message;
    if (options?.troubleshooting) {
      fullMessage += `\n\nTroubleshooting: ${options.troubleshooting}`;
    }
    super(fullMessage, provider, options);
    this.name = 'ProviderApiError';
    this.troubleshooting = options?.troubleshooting;
  }
}

export class NetworkError extends SearchProviderError {
  readonly code = 'NETWORK' as const;
  constructor(provider: string, message: string, options?: { cause?: Error }) {
    super(message, provider, { retryable: true, ...options });
    this.name = 'NetworkError';
  }
}

export interface RateLimitTelemetry {
  limit?: number;
  remaining?: number;
  reset?: number;
  retryAfter?: number;
  /** True when the result was served from SearchCacheStore without an HTTP request. */
  cached?: boolean;
}

export interface SearchHooks {
  onRequest?(provider: string, query: string): void;
  onResponse?(
    provider: string,
    resultCount: number,
    durationMs: number,
    telemetry?: RateLimitTelemetry
  ): void;
  onError?(provider: string, error: SearchProviderError): void;
}

export interface DedupeOptions {
  stripQueryParams?: boolean;
  stripTrackingParams?: boolean;
  customTrackingParams?: string[];
  stripWww?: boolean;
  normalizeTrailingSlash?: boolean;
}

export interface SearchCacheStore {
  get(key: string): Promise<SearchResult[] | undefined> | SearchResult[] | undefined;
  set(key: string, value: SearchResult[], ttlMs?: number): Promise<void> | void;
  has?(key: string): Promise<boolean> | boolean;
  delete?(key: string): Promise<void> | void;
  clear?(): Promise<void> | void;
}

export interface SearchQuery {
  query?: string;
  maxResults?: number;
  language?: string;
  region?: string;
  safeSearch?: 'off' | 'moderate' | 'strict';
  page?: number;
  timeout?: number;
  retries?: number;
  searchType?: 'web' | 'news' | 'text' | 'images';
  searchDepth?: 'basic' | 'comprehensive';
  recencyFilter?: 'day' | 'week' | 'month' | 'year';
  freshness?: 'day' | 'week' | 'month' | 'year';
  includeDomains?: string[];
  excludeDomains?: string[];
  cache?: boolean | SearchCacheStore;
  cacheTtlMs?: number;
  hooks?: SearchHooks;
  /** Aborts in-flight provider HTTP requests when triggered. */
  signal?: AbortSignal;
  /** Give up retrying immediately when a 429 reports retryAfter above this many seconds (default: 5). */
  maxRetryAfterSeconds?: number;
  /**
   * @internal Forwarded to the HTTP layer so AbstractSearchProvider can capture
   * rate-limit telemetry from 2xx responses and attach it to hooks.onResponse.
   */
  onTelemetry?: (telemetry: RateLimitTelemetry | undefined) => void;
  [key: string]: unknown;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  throttleLimit?: number;
  throttleInterval?: number;
  cache?: SearchCacheStore;
  cacheTtlMs?: number;
  maxRetryAfterSeconds?: number;
  [key: string]: unknown;
}

export interface SearchProvider<TConfig extends ProviderConfig = ProviderConfig> {
  readonly name: string;
  readonly config: TConfig;
  search(options: SearchQuery): Promise<SearchResult[]>;
}

export interface WebSearchOptions extends SearchQuery {
  provider: SearchProvider[];
  concurrency?: number;
  strategy?: 'parallel' | 'fallback' | 'race';
  deduplicate?: boolean | DedupeOptions;
}
