import { ResultAsync } from 'neverthrow';
import { z } from 'zod';

/**
 * Zod schema for SearchResult
 */
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

/**
 * Represents a web search result returned by any search provider
 */
export type SearchResult = z.infer<typeof SearchResultSchema>;

/**
 * Debug options for the search SDK
 */
export interface DebugOptions {
  /** Enable verbose logging */
  enabled?: boolean;
  /** Log request details (URLs, headers, etc.) */
  logRequests?: boolean;
  /** Log full responses */
  logResponses?: boolean;
  /** Custom logger function */
  logger?: (message: string, data?: unknown) => void;
}

/**
 * Common options for web search across all providers
 */
export interface SearchOptions {
  /** The search query text */
  query?: string;
  /** Maximum number of results to return */
  maxResults?: number;
  /** Language/locale for results */
  language?: string;
  /** Country/region for results */
  region?: string;
  /** Safe search setting */
  safeSearch?: 'off' | 'moderate' | 'strict';
  /** Result page number */
  page?: number;
  /** Custom timeout in milliseconds */
  timeout?: number;
  /** Debug options */
  debug?: DebugOptions;
  /** Retry options for p-retry */
  retries?: number;
}

/**
 * Interface that all search provider implementations must satisfy
 */
export interface SearchProvider<
  TConfig extends ProviderConfig = ProviderConfig,
  TOptions extends SearchOptions = SearchOptions,
> {
  /** Name of the search provider */
  name: string;
  /** Search method implementation returning a ResultAsync */
  search: (options: TOptions) => ResultAsync<SearchResult[], Error>;
  /** API configuration for the provider */
  config: TConfig;
}

/**
 * Provider configuration options
 */
export interface ProviderConfig {
  /** API key or token */
  apiKey?: string;
  /** Base URL for API requests */
  baseUrl?: string;
  /** Custom timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Throttle: number of requests allowed within a specific interval */
  throttleLimit?: number;
  /** Throttle: interval in milliseconds for the limit (default: 1000) */
  throttleInterval?: number;
  /** Additional provider-specific options */
  [key: string]: unknown;
}

/**
 * Options for the main webSearch function
 */
export interface WebSearchOptions extends SearchOptions {
  /** Array of search providers to query */
  provider: SearchProvider<any, any>[];
  /** Max concurrency for p-map */
  concurrency?: number;
  /** Additional provider-specific options */
  [key: string]: any;
}
