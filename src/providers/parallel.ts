import { SearchOptions, SearchProvider, SearchResult, ProviderConfig } from '../types';
import { post, HttpError } from '../utils/http';
import { debug } from '../utils/debug';

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

  return {
    name: 'parallel',
    config,
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

      try {
        const response = await post<ParallelSearchResponse>(baseUrl, requestBody, {
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
            'parallel-beta': PARALLEL_BETA_HEADER,
          },
          timeout,
        });

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
      } catch (error) {
        // Create detailed error message with diagnostic information
        let errorMessage = 'Parallel search failed';
        let diagnosticInfo = '';

        if (error instanceof HttpError) {
          // Handle specific Parallel API error codes
          if (error.statusCode === 401) {
            diagnosticInfo = 'Invalid API key. Check your Parallel API key.';
          } else if (error.statusCode === 403) {
            diagnosticInfo =
              'Access denied. Your Parallel API key may have insufficient permissions or has expired.';
          } else if (error.statusCode === 429) {
            diagnosticInfo =
              'Rate limit exceeded. You have reached your Parallel API quota or sent too many requests.';
          } else if (error.statusCode === 400) {
            diagnosticInfo = 'Bad request. Check your search parameters.';

            // Try to extract more detailed error info
            if (error.message.includes('objective') || error.message.includes('search_queries')) {
              diagnosticInfo += ' At least one of objective or search_queries must be provided.';
            } else if (error.message.includes('max_results')) {
              diagnosticInfo += ' Invalid max_results value.';
            } else if (error.message.includes('source_policy')) {
              diagnosticInfo +=
                ' Invalid source_policy configuration. Check domain and date formats.';
            }
          } else if (error.statusCode === 422) {
            diagnosticInfo = 'Validation error. The request parameters failed validation checks.';

            // Try to extract more detailed error info
            if (error.message.includes('date')) {
              diagnosticInfo +=
                ' Invalid date format. Use RFC 3339 date format (YYYY-MM-DD) for afterDate/beforeDate.';
            } else if (error.message.includes('domain')) {
              diagnosticInfo += ' Invalid domain format in includeDomains or excludeDomains.';
            } else if (error.message.includes('mode')) {
              diagnosticInfo += ' Invalid mode value. Use "one-shot" or "agentic".';
            } else if (error.message.includes('strategy')) {
              diagnosticInfo += ' Invalid fetch strategy. Use "cached" or "live".';
            }
          } else if (error.statusCode >= 500) {
            diagnosticInfo =
              'Parallel server error. The service might be experiencing issues. Try again later.';
          }

          errorMessage = `${errorMessage}: ${error.message}`;
        } else if (error instanceof Error) {
          errorMessage = `${errorMessage}: ${error.message}`;

          // Check for common error messages
          if (error.message.includes('api_key') || error.message.includes('apiKey')) {
            diagnosticInfo = 'Authentication issue. Check your Parallel API key.';
          } else if (error.message.includes('timeout')) {
            diagnosticInfo =
              'The request timed out. Try increasing the timeout value or simplifying your query.';
          }
        } else {
          errorMessage = `${errorMessage}: ${String(error)}`;
        }

        // Add diagnostic info if available
        if (diagnosticInfo) {
          errorMessage = `${errorMessage}\n\nDiagnostic information: ${diagnosticInfo}\n\nParallel API docs: https://api.parallel.ai`;
        }

        // Log detailed error information if debugging is enabled
        debug.log(debugOptions, 'Parallel Search error', {
          error: error instanceof Error ? error.message : String(error),
          statusCode: error instanceof HttpError ? error.statusCode : undefined,
          diagnosticInfo,
        });

        throw new Error(errorMessage);
      }
    },
  };
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
    throw new Error(
      'Parallel search provider must be configured before use. Call parallel.configure() first.'
    );
  },
};
