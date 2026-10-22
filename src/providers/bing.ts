import type { ProviderConfig, SearchQuery, SearchResult } from '../types';
import { buildUrl, clampMaxResults, extractDomain, get } from '../utils';
import { AbstractSearchProvider } from './base';

interface BingWebPage {
  name: string;
  url: string;
  snippet?: string;
  datePublished?: string;
  dateLastCrawled?: string;
}

interface BingSearchResponse {
  webPages?: {
    totalEstimatedMatches?: number;
    value: BingWebPage[];
  };
  news?: {
    value: Array<{
      name: string;
      url: string;
      description?: string;
      datePublished?: string;
    }>;
  };
}

export interface BingSearchConfig extends ProviderConfig {
  baseUrl?: string;
  market?: string;
  searchType?: 'web' | 'news';
}

const DEFAULT_BASE_URLS = {
  web: 'https://api.bing.microsoft.com/v7.0/search',
  news: 'https://api.bing.microsoft.com/v7.0/news/search',
};

export class BingSearchProvider extends AbstractSearchProvider<BingSearchConfig> {
  public readonly name = 'bing';

  constructor(config: BingSearchConfig) {
    if (!config.apiKey) {
      throw new Error('Bing Search requires an API key (Ocp-Apim-Subscription-Key)');
    }
    super(config);
  }

  protected getTroubleshooting(_error: Error, statusCode?: number): string {
    if (statusCode === 401 || statusCode === 403) {
      return 'Authentication failed. Check that your Bing API key is valid and has active Azure cognitive services quota.';
    }
    if (statusCode === 429) {
      return 'Bing rate limit exceeded. Verify your Azure Search tier and retry-after header.';
    }
    if (statusCode && statusCode >= 500) {
      return 'Bing search service is currently experiencing upstream issues.';
    }
    return '';
  }

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    const { query, maxResults = 10, page = 1, language, region, safeSearch, timeout } = options;

    if (!query?.trim()) {
      throw new Error('Bing search requires a query.');
    }

    const clampedMaxResults = clampMaxResults(maxResults, 1, 50);
    const searchType =
      (options.searchType as 'web' | 'news') || (this.config.searchType as 'web' | 'news') || 'web';
    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URLS[searchType];
    const offset = (page - 1) * clampedMaxResults;

    const params: Record<string, string | number | undefined> = {
      q: query.trim(),
      count: clampedMaxResults,
      offset: offset > 0 ? offset : undefined,
    };

    if (this.config.market || region) {
      params.mkt = this.config.market || region;
    }
    if (language) {
      params.setLang = language;
    }
    if (safeSearch) {
      params.safeSearch =
        safeSearch === 'off' ? 'Off' : safeSearch === 'strict' ? 'Strict' : 'Moderate';
    }

    const freshness = options.freshness || options.recencyFilter;
    if (freshness) {
      const bingFreshnessMap: Record<string, string> = {
        day: 'Day',
        week: 'Week',
        month: 'Month',
      };
      if (bingFreshnessMap[freshness]) {
        params.freshness = bingFreshnessMap[freshness];
      }
    }

    const url = buildUrl(baseUrl, params);
    const response = await get<BingSearchResponse>(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': this.config.apiKey as string,
      },
      timeout,
    });

    const items =
      searchType === 'news' ? (response.news?.value ?? []) : (response.webPages?.value ?? []);

    return items.map((item) => ({
      url: item.url,
      title: item.name,
      snippet: 'description' in item ? (item.description as string) : (item as BingWebPage).snippet,
      domain: extractDomain(item.url),
      publishedDate:
        item.datePublished || ('dateLastCrawled' in item ? item.dateLastCrawled : undefined),
      provider: 'bing',
      raw: item,
    }));
  }
}

export function createBingProvider(config: BingSearchConfig): BingSearchProvider {
  return new BingSearchProvider(config);
}
