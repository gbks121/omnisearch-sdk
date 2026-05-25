import { SearchOptions, SearchProvider, SearchResult, ProviderConfig } from '../types';
import { post, createBaseProvider } from '../utils';
import { debug } from '../utils/debug';
import { err } from 'neverthrow';

/**
 * Tavily API response types
 */
interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  source?: string;
  published_date?: string;
}

interface TavilySearchResponse {
  query: string;
  results: TavilySearchResult[];
  search_id: string;
  search_depth?: string;
  max_results?: number;
  include_answer?: boolean;
  include_raw_content?: boolean;
  answer?: string;
}

/**
 * Tavily configuration options
 */
export interface TavilyConfig extends ProviderConfig {
  /** Base URL for Tavily API */
  baseUrl?: string;
  /** Whether to include answers in response */
  includeAnswer?: boolean;
  /** Sort results by relevance or date */
  sortBy?: 'relevance' | 'date';
  /** Search depth (basic or comprehensive) */
  searchDepth?: 'basic' | 'comprehensive';
}

/**
 * Tavily request body interface
 */
interface TavilyRequestBody {
  api_key: string;
  query: string;
  limit: number;
  include_answer: boolean;
  search_depth: 'basic' | 'comprehensive';
  sort_by: 'relevance' | 'date';
  locale?: string;
  safe_search?: boolean;
  page?: number;
}

/**
 * Default base URL for Tavily API
 */
const DEFAULT_BASE_URL = 'https://api.tavily.com/search';

/**
 * Creates a Tavily provider instance
 *
 * @param config Configuration options for Tavily
 * @returns A configured Tavily provider
 */
export function createTavilyProvider(config: TavilyConfig): SearchProvider {
  if (!config.apiKey) {
    throw new Error('Tavily requires an API key');
  }

  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  return createBaseProvider({
    name: 'tavily',
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
      const {
        query,
        maxResults = 10,
        page = 1,
        language,
        region,
        safeSearch,
        timeout,
        debug: debugOptions,
      } = options;

      if (!query || !query.trim()) {
        throw new Error('Tavily search requires a query.');
      }

      // Prepare request body
      const requestBody: TavilyRequestBody = {
        api_key: config.apiKey || '',
        query: query.trim(),
        limit: maxResults,
        include_answer: config.includeAnswer || false,
        search_depth: config.searchDepth || 'basic',
        sort_by: config.sortBy || 'relevance',
      };

      // Add optional parameters
      if (language || region) {
        requestBody.locale = region ? `${language || 'en'}-${region.toUpperCase()}` : language;
      }

      if (safeSearch && safeSearch !== 'moderate') {
        requestBody.safe_search = safeSearch === 'strict';
      }

      if (page > 1) {
        requestBody.page = page;
      }

      // Log request details if debugging is enabled
      debug.logRequest(debugOptions, 'Tavily Search request', {
        url: baseUrl,
        body: {
          ...requestBody,
          api_key: '***', // Hide API key in logs
        },
      });

      const result = await post<TavilySearchResponse>(baseUrl, requestBody, {
        timeout,
      });
      if (result.isErr()) throw result.error;
      const response = result.value;

      // Log response if debugging is enabled
      debug.logResponse(debugOptions, 'Tavily Search raw response', {
        status: 'success',
        itemCount: response.results?.length || 0,
        searchId: response.search_id,
        query: response.query,
        searchDepth: response.search_depth,
      });

      if (!response.results || response.results.length === 0) {
        debug.log(debugOptions, 'Tavily Search returned no results');
        return [];
      }

      // Transform Tavily response to standard SearchResult format
      return response.results.map((result) => {
        // Extract domain from URL
        let domain;
        try {
          domain = new URL(result.url).hostname;
        } catch {
          domain = undefined;
        }

        return {
          url: result.url,
          title: result.title,
          snippet: result.content,
          domain,
          publishedDate: result.published_date,
          provider: 'tavily',
          raw: result,
        };
      });
    },
  });
}

/**
 * Pre-configured Tavily provider
 * Note: You must call configure before using this provider
 */
export const tavily = {
  name: 'tavily',
  config: { apiKey: '' },

  /**
   * Configure the Tavily provider with your API credentials
   *
   * @param config Tavily configuration
   * @returns Configured Tavily provider
   */
  configure: (config: TavilyConfig) => createTavilyProvider(config),

  /**
   * Search implementation that ensures provider is properly configured before use
   */
  search: async (_options: SearchOptions) => {
    return err(
      new Error('Tavily provider must be configured before use. Call tavily.configure() first.')
    );
  },
  };

