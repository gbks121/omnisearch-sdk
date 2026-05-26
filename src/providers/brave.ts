import { SearchQuery, SearchResult, ProviderConfig } from '../types';
import { get, extractDomain, clampMaxResults } from '../utils';
import { AbstractSearchProvider } from './base';

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

export interface BraveSearchConfig extends ProviderConfig {
  baseUrl?: string;
  searchType?: 'web' | 'news';
}

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

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    const { query, maxResults = 10, page = 1, language, region, safeSearch, timeout } = options;

    const clampedMaxResults = clampMaxResults(maxResults, 1, 50);
    const searchType =
      (options.searchType as 'web' | 'news') || (this.config.searchType as 'web' | 'news') || 'web';
    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URLS[searchType];

    const offset = (page - 1) * clampedMaxResults;

    if (!query || !query.trim()) {
      throw new Error('Brave search requires a query.');
    }

    const searchUrl = new URL(baseUrl);
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('count', clampedMaxResults.toString());

    if (offset > 0) {
      searchUrl.searchParams.append('offset', offset.toString());
    }

    if (language) {
      searchUrl.searchParams.append('search_lang', language);
    }

    if (region) {
      searchUrl.searchParams.append('country', region);
    }

    if (safeSearch) {
      searchUrl.searchParams.append('safesearch', safeSearch);
    }

    const headers = {
      Accept: 'application/json',
      'X-Subscription-Token': this.config.apiKey || '',
    };

    const response = await get<BraveSearchResponse>(searchUrl.toString(), {
      headers,
      timeout,
    });

    const results =
      searchType === 'web'
        ? response.web?.results || []
        : searchType === 'news'
          ? response.results || []
          : response.web?.results || [];

    if (results.length === 0) {
      return [];
    }

    return results.map((item) => {
      return {
        url: item.url,
        title: item.title,
        snippet: item.description,
        domain: extractDomain(item.url),
        publishedDate: item.age,
        provider: 'brave',
        raw: item,
      };
    });
  }
}

export function createBraveProvider(config: BraveSearchConfig): BraveSearchProvider {
  return new BraveSearchProvider(config);
}
