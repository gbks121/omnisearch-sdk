import { SearchOptions, SearchProvider, SearchResult, ProviderConfig } from '../types';
import { buildUrl, get, createBaseProvider } from '../utils';
import { debug } from '../utils/debug';
import { err } from 'neverthrow';

/**
 * SerpAPI response types for Google search engine
 */
interface SerpApiSearchResult {
  position: number;
  title: string;
  link: string;
  displayed_link: string;
  snippet: string;
  snippet_highlighted_words?: string[];
  cached_page_link?: string;
  related_pages_link?: string;
  source?: string;
  date?: string;
}

interface SerpApiResponse {
  search_metadata: {
    id: string;
    status: string;
    json_endpoint: string;
    created_at: string;
    processed_at: string;
    google_url: string;
    raw_html_file: string;
    total_time_taken: number;
  };
  search_parameters: {
    engine: string;
    q: string;
    google_domain: string;
    device: string;
    num: number;
    start?: number;
    hl?: string;
    gl?: string;
    safe?: string;
  };
  search_information: {
    organic_results_state: string;
    total_results: number;
    time_taken_displayed: number;
    query_displayed: string;
  };
  organic_results: SerpApiSearchResult[];
  error?: string;
}

/**
 * SerpAPI configuration options
 */
export interface SerpApiConfig extends ProviderConfig {
  /** Search engine to use (e.g., google, bing, yahoo) */
  engine?: string;
  /** Base URL for SerpAPI */
  baseUrl?: string;
}

/**
 * Default base URL for SerpAPI
 */
const DEFAULT_BASE_URL = 'https://serpapi.com/search.json';

/**
 * Creates a SerpAPI provider instance
 *
 * @param config Configuration options for SerpAPI
 * @returns A configured SerpAPI provider
 */
export function createSerpApiProvider(config: SerpApiConfig): SearchProvider {
  if (!config.apiKey) {
    throw new Error('SerpAPI requires an API key');
  }

  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const engine = config.engine || 'google';

  return createBaseProvider({
    name: 'serpapi',
    config,
    getTroubleshooting: (error: Error, statusCode?: number) => {
      if (error.message.includes('apiKey')) {
        return 'Authentication failed. Check that your SerpAPI key is valid. Verify that you have enough credits remaining in your SerpAPI account.';
      }
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
        throw new Error('SerpAPI search requires a query.');
      }

      // Map SDK parameters to SerpAPI parameters
      const params: Record<string, string | number | boolean | undefined> = {
        engine,
        api_key: config.apiKey,
        q: query,
        num: maxResults,
        start: page > 1 ? (page - 1) * maxResults + 1 : undefined,
      };

      // Add optional parameters
      if (language) {
        params.hl = language; // Interface language
      }

      if (region) {
        params.gl = region; // Country/region
      }

      if (safeSearch) {
        params.safe = safeSearch;
      }

      const url = buildUrl(baseUrl, params);

      // Log request details if debugging is enabled
      debug.logRequest(debugOptions, 'SerpAPI request', {
        url: config.apiKey ? url.replace(config.apiKey, '***') : url,
        params: {
          ...params,
          api_key: '***',
        },
      });

      const result = await get<SerpApiResponse>(url, { timeout });
      if (result.isErr()) throw result.error;
      const response = result.value;

      // Log response if debugging is enabled
      debug.logResponse(debugOptions, 'SerpAPI raw response', {
        status: response.error ? 'error' : 'success',
        itemCount: response.organic_results?.length || 0,
        totalResults: response.search_information?.total_results || 0,
        metadata: response.search_metadata,
      });

      if (response.error) {
        throw new Error(`SerpAPI error: ${response.error}`);
      }

      if (!response.organic_results || response.organic_results.length === 0) {
        debug.log(debugOptions, 'SerpAPI returned no results');
        return [];
      }

      // Transform SerpAPI response to standard SearchResult format
      return response.organic_results
        .filter((result) => result.link && result.title)
        .map((result) => {
          // Extract domain from displayed_link
          const domain = result.displayed_link?.split('/')[0] || undefined;

          return {
            url: result.link,
            title: result.title,
            snippet: result.snippet || undefined,
            domain,
            publishedDate: result.date,
            provider: 'serpapi',
            raw: result,
          };
        });
    },
  });
}

/**
 * Pre-configured SerpAPI provider
 * Note: You must call configure before using this provider
 */
export const serpapi = {
  name: 'serpapi',
  config: { apiKey: '' },

  /**
   * Configure the SerpAPI provider with your API credentials
   *
   * @param config SerpAPI configuration
   * @returns Configured SerpAPI provider
   */
  configure: (config: SerpApiConfig) => createSerpApiProvider(config),

  /**
   * Search implementation that ensures provider is properly configured before use
   */
  search: async (_options: SearchOptions): Promise<SearchResult[]> => {
    return err(
      new Error('SerpAPI provider must be configured before use. Call serpapi.configure() first.')
    ) as any;
  },
};
