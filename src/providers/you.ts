import type { ProviderConfig, SearchQuery, SearchResult } from '../types';
import { buildUrl, clampMaxResults, extractDomain, get } from '../utils';
import { AbstractSearchProvider } from './base';

interface YouHit {
  title: string;
  url: string;
  description?: string;
  snippets?: string[];
  age?: string;
}

interface YouSearchResponse {
  hits?: YouHit[];
  news?: Array<{
    title: string;
    url: string;
    description?: string;
    age?: string;
  }>;
}

export interface YouSearchConfig extends ProviderConfig {
  baseUrl?: string;
  searchType?: 'web' | 'news';
}

const DEFAULT_BASE_URLS = {
  web: 'https://api.ydc-index.io/search',
  news: 'https://api.ydc-index.io/news',
};

export class YouSearchProvider extends AbstractSearchProvider<YouSearchConfig> {
  public readonly name = 'you';
  protected override get displayName(): string {
    return 'You.com';
  }

  constructor(config: YouSearchConfig) {
    if (!config.apiKey) {
      throw new Error('You.com requires an API key (X-API-Key)');
    }
    super(config);
  }

  protected getTroubleshooting(_error: Error, statusCode?: number): string {
    if (statusCode === 401 || statusCode === 403) {
      return 'Authentication failed. Check your You.com API key and subscription status.';
    }
    if (statusCode === 429) {
      return 'Rate limit exceeded for You.com Search API. Retry after backoff.';
    }
    if (statusCode && statusCode >= 500) {
      return 'You.com search servers are currently experiencing issues.';
    }
    return '';
  }

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    const { query, maxResults = 10, timeout } = options;

    if (!query?.trim()) {
      throw new Error('You.com search requires a query.');
    }

    const clampedMaxResults = clampMaxResults(maxResults, 1, 50);
    const searchType =
      (options.searchType as 'web' | 'news') || (this.config.searchType as 'web' | 'news') || 'web';
    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URLS[searchType];

    const params: Record<string, string | number | undefined> = {
      query: query.trim(),
      count: clampedMaxResults,
    };

    const url = buildUrl(baseUrl, params);
    const response = await get<YouSearchResponse>(url, {
      headers: {
        'X-API-Key': this.config.apiKey as string,
      },
      timeout,
    });

    const items =
      searchType === 'news' ? (response.news ?? response.hits ?? []) : (response.hits ?? []);

    return items.map((hit) => {
      const snippets = 'snippets' in hit ? (hit as YouHit).snippets : undefined;
      const snippet = snippets && snippets.length > 0 ? snippets.join(' ') : hit.description;
      return {
        url: hit.url,
        title: hit.title,
        snippet,
        domain: extractDomain(hit.url),
        publishedDate: hit.age,
        provider: 'you',
        raw: hit,
      };
    });
  }
}

export function createYouProvider(config: YouSearchConfig): YouSearchProvider {
  return new YouSearchProvider(config);
}
