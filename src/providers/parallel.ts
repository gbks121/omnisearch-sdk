import { SearchOptions, SearchProvider, SearchResult, ProviderConfig } from '../types';
import { post, createBaseProvider } from '../utils';
import { debug } from '../utils/debug';
import { err } from 'neverthrow';

/**
 * Parallel Search API response types
 */
interface ParallelWebSearchResult {
  url: string;
  title?: string;
  publish_date?: string;
  excerpts?: string[];
}

interface ParallelSearchResponse {
  search_id: string;
  results: ParallelWebSearchResult[];
  warnings?: Array<{
    type: string;
    message: string;
    detail?: Record<string, unknown>;
  }>;
  usage?: Array<{
    type: string;
    amount: number;
    unit: string;
  }>;
}

/**
 * Source policy for Parallel search
 */
interface SourcePolicy {
  /** List of domains to restrict results to */
  include_domains?: string[];
  /** List of domains to exclude from results */
  exclude_domains?: string[];
  /** Optional start date for filtering (RFC 3339 date string: YYYY-MM-DD) */
  after_date?: string;
  /** Optional end date for filtering (RFC 3339 date string: YYYY-MM-DD) */
  before_date?: string;
}

/**
 * Excerpt settings for Parallel search
 */
interface ExcerptSettings {
  /** Maximum characters per excerpt */
  max_chars_per_result?: number;
  /** Number of excerpts to return per result */
  count?: number;
}

/**
 * Fetch policy for Parallel search
 */
interface FetchPolicy {
  /** Strategy for fetching content */
  strategy?: 'cached' | 'live';
}

/**
 * Parallel Search API request body
 */
interface ParallelSearchRequestBody {
  /** Natural-language description of what to find */
  objective?: string;
  /** Traditional keyword search queries */
  search_queries?: string[];
  /** Mode: 'one-shot' or 'agentic' */
  mode?: 'one-shot' | 'agentic';
  /** Maximum number of results */
  max_results?: number;
  /** Excerpt settings */
  excerpts?: ExcerptSettings;
  /** Source policy */
  source_policy?: SourcePolicy;
  /** Fetch policy */
  fetch_policy?: FetchPolicy;
}

/**
 * Parallel API configuration options
 */
export interface ParallelConfig extends ProviderConfig {
  /** Base URL for Parallel API */
  baseUrl?: string;
  /** Mode: 'one-shot' for comprehensive results, 'agentic' for concise results */
  mode?: 'one-shot' | 'agentic';
  /** Maximum number of results (may be limited by processor) */
  maxResults?: number;
  /** Domains to include in search results */
  includeDomains?: string[];
  /** Domains to exclude from search results */
  excludeDomains?: string[];
  /** Start date for filtering results (YYYY-MM-DD format) */
  afterDate?: string;
  /** End date for filtering results (YYYY-MM-DD format) */
  beforeDate?: string;
  /** Maximum characters per excerpt */
  maxCharsPerResult?: number;
  /** Number of excerpts per result */
  excerptCount?: number;
  /** Fetch strategy: 'cached' for faster results, 'live' for fresher content */
  fetchStrategy?: 'cached' | 'live';
  /** Optional metadata for client-side tracking and reference */
  metadata?: Record<string, unknown>;
}

/**
 * Default base URL for Parallel API
 */
const DEFAULT_BASE_URL = 'https://api.parallel.ai/v1beta/search';

/**
 * Beta header value for Parallel search API
 */
const PARALLEL_BETA_HEADER = 'search-extract-2025-10-10';

/**
 * Creates a Parallel search provider instance
 *
 * @param config Configuration options for Parallel
 * @returns A configured Parallel search provider
 */
export function createParallelProvider(config: ParallelConfig): SearchProvider {
  if (!config.apiKey) {
    throw new Error('Parallel requires an API key');
  }

  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  return createBaseProvider({
    name: 'parallel',
    config,
    getTroubleshooting: (_error: Error, statusCode?: number) => {
      if (statusCode === 401 || statusCode === 403) {
        return "Authentication failed or Access denied. Check your apiKey and make sure it's valid and has the correct permissions.";
      }
      if (statusCode === 400) {
        return 'Bad request. This is likely due to invalid request parameters. Check your query and other search options.';
      }
      if (statusCode === 429) {
        return "Rate limit exceeded. You've exceeded the rate limit for this API. Try again later or reduce your request frequency.";
      }
      if (statusCode && statusCode >= 500) {
        return 'Server error. The search provider is experiencing issues. Try again later.';
      }
      return '';
    },
    search: async (options: SearchOptions): Promise<SearchResult[]> => {
      const { query, maxResults = 10, timeout, debug: debugOptions } = options;

      if (!query || !query.trim()) {
        throw new Error('Parallel search requires a query.');
      }

      // Prepare request body with Parallel-specific parameters
      const requestBody: ParallelSearchRequestBody = {
        objective: query,
      };

      // Add mode from config or default to 'one-shot'
      if (config.mode) {
        requestBody.mode = config.mode;
      }

      // Add max_results from options or config
      const effectiveMaxResults = maxResults || config.maxResults || 10;
      requestBody.max_results = effectiveMaxResults;

      // Configure excerpt settings if specified in config
      if (config.maxCharsPerResult !== undefined || config.excerptCount !== undefined) {
        const excerptSettings: ExcerptSettings = {};

        if (config.maxCharsPerResult !== undefined) {
          excerptSettings.max_chars_per_result = config.maxCharsPerResult;
        }

        if (config.excerptCount !== undefined) {
          excerptSettings.count = config.excerptCount;
        }

        requestBody.excerpts = excerptSettings;
      }

      // Configure source policy if any domain or date filters are specified
      if (
        config.includeDomains?.length ||
        config.excludeDomains?.length ||
        config.afterDate ||
        config.beforeDate
      ) {
        const sourcePolicy: SourcePolicy = {};

        if (config.includeDomains?.length) {
          sourcePolicy.include_domains = config.includeDomains;
        }

        if (config.excludeDomains?.length) {
          sourcePolicy.exclude_domains = config.excludeDomains;
        }

        if (config.afterDate) {
          sourcePolicy.after_date = config.afterDate;
        }

        if (config.beforeDate) {
          sourcePolicy.before_date = config.beforeDate;
        }

        requestBody.source_policy = sourcePolicy;
      }

      // Configure fetch policy if specified
      if (config.fetchStrategy) {
        requestBody.fetch_policy = {
          strategy: config.fetchStrategy,
        };
      }

      // Log request details if debugging is enabled
      const logBody = {
        ...requestBody,
        apiKey: '***', // Hide API key in logs
      } as Record<string, unknown>;

      debug.logRequest(debugOptions, 'Parallel Search request', {
        url: baseUrl,
        body: logBody,
      });

      // We've already validated that apiKey exists at the start of createParallelProvider
      const apiKey = config.apiKey as string;

      const result = await post<ParallelSearchResponse>(baseUrl, requestBody, {
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'parallel-beta': PARALLEL_BETA_HEADER,
        },
        timeout,
      });
      if (result.isErr()) throw result.error;
      const response = result.value;

      // Log response if debugging is enabled
      debug.logResponse(debugOptions, 'Parallel Search raw response', {
        status: 'success',
        itemCount: response.results?.length || 0,
        searchId: response.search_id || '',
        warnings: response.warnings || [],
        usage: response.usage || [],
      });

      // Log warnings if present
      if (response.warnings && response.warnings.length > 0) {
        debug.log(debugOptions, 'Parallel Search warnings', {
          warnings: response.warnings,
        });
      }

      if (!response.results || response.results.length === 0) {
        debug.log(debugOptions, 'Parallel Search returned no results');
        return [];
      }

      // Transform Parallel response to standard SearchResult format
      return response.results.map((result) => {
        // Extract domain from URL
        let domain;
        try {
          domain = new URL(result.url).hostname;
        } catch {
          domain = undefined;
        }

        // Join excerpts array for snippet and content
        // Use first excerpt for snippet if available, join all for content
        const excerpts = result.excerpts || [];
        const snippet = excerpts.length > 0 ? excerpts[0] : undefined;
        const content = excerpts.length > 0 ? excerpts.join('\n\n') : undefined;

        return {
          url: result.url,
          title: result.title || 'No title available',
          snippet,
          content,
          domain,
          publishedDate: result.publish_date,
          provider: 'parallel',
          raw: result,
        };
      });
    },
  });
}

/**
 * Pre-configured Parallel search provider
 * Note: You must call configure before using this provider
 */
export const parallel = {
  name: 'parallel',
  config: { apiKey: '' },

  /**
   * Configure the Parallel search provider with your API credentials
   *
   * @param config Parallel configuration
   * @returns Configured Parallel search provider
   */
  configure: (config: ParallelConfig) => createParallelProvider(config),

  /**
   * Search implementation that ensures provider is properly configured before use
   */
  search: async (_options: SearchOptions): Promise<SearchResult[]> => {
    return err(
      new Error(
        'Parallel search provider must be configured before use. Call parallel.configure() first.'
      )
    ) as any;
  },
};
