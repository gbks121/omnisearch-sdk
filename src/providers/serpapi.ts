import { SearchOptions, SearchProvider, SearchResult, ProviderConfig } from '../types';
import { buildUrl, get } from '../utils';
import { debug } from '../utils/debug';
import { AbstractSearchProvider } from './base';

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

export class SerpApiSearchProvider extends AbstractSearchProvider<SerpApiConfig> {
  public readonly name = 'serpapi';

  constructor(config: SerpApiConfig) {
    if (!config.apiKey) {
      throw new Error('SerpAPI requires an API key');
    }
    super(config);
  }

  protected getTroubleshooting(error: Error, statusCode?: number): string {
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
  }

  protected async doSearch(options: SearchOptions): Promise<SearchResult[]> {
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

    const params: Record<string, string | number | boolean | undefined> = {
      engine: this.config.engine || 'google',
      api_key: this.config.apiKey,
      q: query,
      num: maxResults,
      start: page > 1 ? (page - 1) * maxResults + 1 : undefined,
    };

    if (language) params.hl = language;
    if (region) params.gl = region;
    if (safeSearch) params.safe = safeSearch;

    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;
    const url = buildUrl(baseUrl, params);

    debug.logRequest(debugOptions, 'SerpAPI request', {
      url: this.config.apiKey ? url.replace(this.config.apiKey, '***') : url,
      params: { ...params, api_key: '***' },
    });

    const result = await get<SerpApiResponse>(url, { timeout });
    if (result.isErr()) throw result.error;
    const response = result.value;

    debug.logResponse(debugOptions, 'SerpAPI raw response', {
      status: response.error ? 'error' : 'success',
      itemCount: response.organic_results?.length || 0,
      totalResults: response.search_information?.total_results || 0,
    });

    if (response.error) {
      throw new Error(`SerpAPI error: ${response.error}`);
    }

    if (!response.organic_results || response.organic_results.length === 0) {
      return [];
    }

    return response.organic_results
      .filter((result) => result.link && result.title)
      .map((result) => {
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
  }
}

/**
 * Creates a SerpAPI search provider instance
 */
export function createSerpApiProvider(config: SerpApiConfig): SerpApiSearchProvider {
  return new SerpApiSearchProvider(config);
}
