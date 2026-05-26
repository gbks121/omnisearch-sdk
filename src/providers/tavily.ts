import { SearchQuery, SearchResult, ProviderConfig } from '../types';
import { post, extractDomain, clampMaxResults } from '../utils';
import { AbstractSearchProvider } from './base';

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

export interface TavilyConfig extends ProviderConfig {
  baseUrl?: string;
  includeAnswer?: boolean;
  sortBy?: 'relevance' | 'date';
  searchDepth?: 'basic' | 'comprehensive';
}

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

const DEFAULT_BASE_URL = 'https://api.tavily.com/search';

export class TavilySearchProvider extends AbstractSearchProvider<TavilyConfig> {
  public readonly name = 'tavily';

  constructor(config: TavilyConfig) {
    if (!config.apiKey) {
      throw new Error('Tavily requires an API key');
    }
    super(config);
  }

  protected getTroubleshooting(_error: Error, statusCode?: number): string {
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

    if (!query || !query.trim()) {
      throw new Error('Tavily search requires a query.');
    }

    const clampedMaxResults = clampMaxResults(maxResults);

    const requestBody: TavilyRequestBody = {
      api_key: this.config.apiKey || '',
      query: query.trim(),
      limit: clampedMaxResults,
      include_answer: this.config.includeAnswer || false,
      search_depth: this.config.searchDepth || 'basic',
      sort_by: this.config.sortBy || 'relevance',
    };

    if (language || region) {
      requestBody.locale = region ? `${language || 'en'}-${region.toUpperCase()}` : language;
    }

    if (safeSearch && safeSearch !== 'moderate') {
      requestBody.safe_search = safeSearch === 'strict';
    }

    if (page > 1) {
      requestBody.page = page;
    }

    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;

    const response = await post<TavilySearchResponse>(baseUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout,
    });

    if (!response.results || response.results.length === 0) {
      return [];
    }

    return response.results.map((result) => {
      return {
        url: result.url,
        title: result.title,
        snippet: result.content,
        domain: extractDomain(result.url),
        publishedDate: result.published_date,
        provider: 'tavily',
        raw: result,
      };
    });
  }
}

export function createTavilyProvider(config: TavilyConfig): TavilySearchProvider {
  return new TavilySearchProvider(config);
}
