import { SearchOptions, SearchResult, ProviderConfig } from '../types';
import { get } from '../utils';
import { debug } from '../utils/debug';
import { AbstractSearchProvider } from './base';

/**
 * SearXNG API response types
 */
interface SearXNGResult {
  url: string;
  title: string;
  content: string;
  publishedDate: string | null;
  thumbnail?: string;
  engine?: string;
  template?: string;
  parsed_url?: string[];
  img_src?: string;
  priority?: string;
  engines?: string[];
  positions?: number[];
  score?: number;
  category?: string;
}

interface SearXNGResponse {
  query: string;
  number_of_results: number;
  results: SearXNGResult[];
}

/**
 * SearXNG configuration options
 */
export interface SearXNGConfig extends ProviderConfig {
  /** Base URL for SearXNG instance (without query params) */
  baseUrl: string;
  /** Additional request parameters */
  additionalParams?: Record<string, string>;
}

export class SearXNGSearchProvider extends AbstractSearchProvider<SearXNGConfig> {
  public readonly name = 'searxng';

  constructor(config: SearXNGConfig) {
    if (!config.baseUrl) {
      throw new Error('SearXNG requires a base URL');
    }
    super(config);
  }

  protected getTroubleshooting(error: Error, statusCode?: number): string {
    if (error.message.includes('not found') || statusCode === 404) {
      return 'Check if your SearXNG instance URL is correct and that the server is running. Verify the format of your search URL.';
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
  }

  protected async doSearch(options: SearchOptions): Promise<SearchResult[]> {
    const { query, maxResults = 10, language, safeSearch, timeout, debug: debugOptions } = options;

    if (!query || !query.trim()) {
      throw new Error('SearXNG search requires a query.');
    }

    const searchUrl = new URL(this.config.baseUrl);
    searchUrl.searchParams.append('q', query.trim());
    searchUrl.searchParams.append('format', 'json');

    if (maxResults) {
      searchUrl.searchParams.append('count', maxResults.toString());
    }

    if (language) {
      searchUrl.searchParams.append('language', language);
    }

    if (safeSearch) {
      const safeValue = safeSearch === 'off' ? '0' : safeSearch === 'moderate' ? '1' : '2';
      searchUrl.searchParams.append('safesearch', safeValue);
    }

    if (this.config.additionalParams) {
      Object.entries(this.config.additionalParams).forEach(([key, value]) => {
        searchUrl.searchParams.append(key, value);
      });
    }

    if (this.config.apiKey) {
      searchUrl.searchParams.append('api_key', this.config.apiKey);
    }

    debug.logRequest(debugOptions, 'SearXNG Search request', {
      url: searchUrl.toString().replace(/api_key=([^&]*)/, 'api_key=***'),
      params: {
        q: query,
        count: maxResults,
        language,
        safesearch: safeSearch
          ? safeSearch === 'off'
            ? '0'
            : safeSearch === 'moderate'
              ? '1'
              : '2'
          : undefined,
        ...this.config.additionalParams,
      },
    });

    const result = await get<SearXNGResponse>(searchUrl.toString(), {
      timeout,
    });
    if (result.isErr()) throw result.error;
    const response = result.value;

    debug.logResponse(debugOptions, 'SearXNG Search raw response', {
      status: 'success',
      itemCount: response.results?.length || 0,
      totalResults: response.number_of_results || 0,
      query: response.query,
    });

    if (!response.results || response.results.length === 0) {
      return [];
    }

    return response.results.map((result) => {
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
        publishedDate: result.publishedDate || undefined,
        provider: 'searxng',
        raw: result,
      };
    });
  }
}

/**
 * Creates a SearXNG search provider instance
 */
export function createSearXNGProvider(config: SearXNGConfig): SearXNGSearchProvider {
  return new SearXNGSearchProvider(config);
}
