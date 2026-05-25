import { SearchOptions, SearchProvider, SearchResult, ProviderConfig } from '../types';
import { post, createBaseProvider } from '../utils';
import { debug } from '../utils/debug';
import { err } from 'neverthrow';

/**
 * Exa API response types
 */
interface ExaSearchResult {
  title: string;
  url: string;
  text: string;
  relevance_score?: number;
  publish_date?: string;
  author?: string;
  document_id?: string;
}

interface ExaSearchResponse {
  results: ExaSearchResult[];
  query: string;
}

/**
 * Exa configuration options
 */
export interface ExaConfig extends ProviderConfig {
  /** Base URL for Exa API */
  baseUrl?: string;
  /** Search model to use (keyword or embeddings) */
  model?: 'keyword' | 'embeddings';
  /** Whether to include content extraction */
  includeContents?: boolean;
}

/**
 * Default base URL for Exa API
 */
const DEFAULT_BASE_URL = 'https://api.exa.ai/search';

/**
 * Creates an Exa provider instance
 *
 * @param config Configuration options for Exa
 * @returns A configured Exa provider
 */
export function createExaProvider(config: ExaConfig): SearchProvider {
  if (!config.apiKey) {
    throw new Error('Exa requires an API key');
  }

  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  return createBaseProvider({
    name: 'exa',
    config,
    getTroubleshooting: (_error: Error, statusCode?: number) => {
      if (statusCode === 401 || statusCode === 403) {
        return "This is likely an authentication issue. Check your API key and make sure it's valid and has the correct permissions.";
      }
      if (statusCode === 400) {
        return 'This is likely due to invalid request parameters. Check your query and other search options.';
      }
      if (statusCode === 429) {
        return "You've exceeded the rate limit for this API. Try again later or reduce your request frequency.";
      }
      if (statusCode && statusCode >= 500) {
        return 'The search provider is experiencing server issues. Try again later.';
      }
      return '';
    },
    search: async (options: SearchOptions): Promise<SearchResult[]> => {
      const { query, maxResults = 10, timeout, debug: debugOptions } = options;

      if (!query || !query.trim()) {
        throw new Error('Exa search requires a query.');
      }

      // Prepare headers with authorization token
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      };

      // Prepare request body
      const requestBody = {
        query,
        max_results: maxResults,
        model: config.model || 'keyword',
        include_contents: config.includeContents || false,
        timeout: timeout || undefined,
      };

      // Log request details if debugging is enabled
      debug.logRequest(debugOptions, 'Exa Search request', {
        url: baseUrl,
        headers: { Authorization: 'Bearer ***' },
        body: requestBody,
      });

      const result = await post<ExaSearchResponse>(baseUrl, requestBody, {
        headers,
        timeout,
      });
      if (result.isErr()) throw result.error;
      const response = result.value;


      // Log response if debugging is enabled
      debug.logResponse(debugOptions, 'Exa Search raw response', {
        status: 'success',
        itemCount: response.results?.length || 0,
        query: response.query,
      });

      if (!response.results || response.results.length === 0) {
        debug.log(debugOptions, 'Exa Search returned no results');
        return [];
      }

      // Transform Exa response to standard SearchResult format
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
          snippet: result.text,
          domain,
          publishedDate: result.publish_date,
          provider: 'exa',
          raw: result,
        };
      });
    },
  });
}

/**
 * Pre-configured Exa provider
 * Note: You must call configure before using this provider
 */
export const exa = {
  name: 'exa',
  config: { apiKey: '' },

  /**
   * Configure the Exa provider with your API credentials
   *
   * @param config Exa configuration
   * @returns Configured Exa provider
   */
  configure: (config: ExaConfig) => createExaProvider(config),

  /**
   * Search implementation that ensures provider is properly configured before use
   */
  search: async (_options: SearchOptions) => {
    return err(new Error('Exa provider must be configured before use. Call exa.configure() first.'));
  },
};
