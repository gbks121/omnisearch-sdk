import { SearchOptions, SearchProvider, SearchResult, ProviderConfig } from '../types';
import { get } from '../utils';
import { debug } from '../utils/debug';
import { AbstractSearchProvider } from './base';

/**
 * Brave Search API response types
 */
interface BraveSearchWeb {
  title: string;
  url: string;
  description: string;
  is_source_from_meta: boolean;
  is_source_local: boolean;
  language: string;
  family_friendly: boolean;
  meta_url?: {
    scheme: string;
    netloc: string;
    path: string;
    query: string;
    fragment: string;
  };
  profile?: {
    name: string;
    short_name: string;
    search_url: string;
    image?: string;
  };
  age?: string;
  type?: string;
}

interface BraveSearchResponse {
  type: string;
  query: {
    original: string;
    show_strict_warning: boolean;
    spellcheck_off?: boolean;
    is_navigational?: boolean;
    is_media_query?: boolean;
    locale?: {
      country: string;
      language: string;
    };
  };
  mixed?: {
    type: string;
    main: {
      type: string;
      results: BraveSearchWeb[];
    };
    top?: {
      type: string;
      results: BraveSearchWeb[];
    };
  };
  web?: {
    type: string;
    results: BraveSearchWeb[];
  };
  news?: {
    type: string;
    results: BraveSearchWeb[];
  };
  results?: BraveSearchWeb[];
  count?: number;
}

/**
 * Brave Search configuration options
 */
export interface BraveSearchConfig extends ProviderConfig {
  /** Base URL for Brave Search API */
  baseUrl?: string;
  /** Search type: 'web', 'news' */
  searchType?: 'web' | 'news';
}

/**
 * Default base URLs for Brave Search API
 */
const DEFAULT_BASE_URLS = {
  web: 'https://api.search.brave.com/res/v1/web/search',
  news: 'https://api.search.brave.com/res/v1/news/search',
};

export class BraveSearchProvider extends AbstractSearchProvider<BraveSearchConfig> {
  public readonly name = 'brave';

  constructor(config: BraveSearchConfig) {
    if (!config.apiKey) {
      throw new Error('Brave Search requires an API key');
    }
    super({
      ...config,
      searchType: config.searchType || 'web',
    });
  }

  protected getTroubleshooting(error: Error, statusCode?: number): string {
    if (error.message.includes('token')) {
      return 'Authentication failed. Ensure your Brave Search API token is valid. Check your subscription status in the Brave Developer Hub.';
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

    const searchType = this.config.searchType || 'web';
    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URLS[searchType];

    // Calculate offset for pagination
    const offset = (page - 1) * maxResults;

    // Build query parameters
    if (!query || !query.trim()) {
      throw new Error('Brave search requires a query.');
    }

    const searchUrl = new URL(baseUrl);
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('count', maxResults.toString());

    if (offset > 0) {
      searchUrl.searchParams.append('offset', offset.toString());
    }

    // Add language and region if available
    if (language) {
      searchUrl.searchParams.append('search_lang', language);
    }

    if (region) {
      searchUrl.searchParams.append('country', region);
    }

    // Map safe search setting (off, moderate, strict)
    if (safeSearch) {
      searchUrl.searchParams.append('safesearch', safeSearch);
    }

    // Set up headers with API token
    const headers = {
      Accept: 'application/json',
      'X-Subscription-Token': this.config.apiKey || '',
    };

    // Log request details if debugging is enabled
    debug.logRequest(debugOptions, 'Brave Search request', {
      url: searchUrl.toString(),
      params: {
        q: query,
        count: maxResults,
        offset,
        search_lang: language,
        country: region,
        safesearch: safeSearch,
      },
    });

    const result = await get<BraveSearchResponse>(searchUrl.toString(), {
      headers,
      timeout,
    });
    if (result.isErr()) throw result.error;
    const response = result.value;

    // Use results based on search type
    const results =
      searchType === 'web'
        ? response.web?.results || []
        : searchType === 'news'
          ? response.results || []
          : response.web?.results || [];

    // Log response if debugging is enabled
    debug.logResponse(debugOptions, 'Brave Search raw response', {
      status: 'success',
      itemCount: results?.length || 0,
      totalCount: response.count || 0,
      queryInfo: response.query,
      searchType,
      rawResponse: response,
    });

    if (results.length === 0) {
      debug.log(debugOptions, 'Brave Search returned no results');
      return [];
    }

    // Transform Brave response to standard SearchResult format
    return results.map((item) => {
      // Extract domain from URL
      let domain;
      try {
        domain = new URL(item.url).hostname;
      } catch {
        domain = undefined;
      }

      return {
        url: item.url,
        title: item.title,
        snippet: item.description,
        domain,
        publishedDate: item.age,
        provider: 'brave',
        raw: item,
      };
    });
  }
}

/**
 * Creates a Brave Search provider instance
 *
 * @param config Configuration options for Brave Search
 * @returns A configured Brave Search provider
 */
export function createBraveProvider(config: BraveSearchConfig): SearchProvider {
  return new BraveSearchProvider(config);
}
