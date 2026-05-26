import { SearchOptions, SearchResult, ProviderConfig } from '../types';
import { buildUrl, get } from '../utils';
import { debug } from '../utils/debug';
import { AbstractSearchProvider } from './base';

/**
 * Google Custom Search API response types
 */
interface GoogleSearchItem {
  kind: string;
  title: string;
  htmlTitle: string;
  link: string;
  displayLink: string;
  snippet: string;
  htmlSnippet: string;
  formattedUrl: string;
  htmlFormattedUrl: string;
  pagemap?: {
    cse_thumbnail?: Array<{
      src: string;
      width: string;
      height: string;
    }>;
    metatags?: Array<Record<string, string>>;
    cse_image?: Array<{
      src: string;
    }>;
  };
}

interface GoogleSearchResponse {
  kind: string;
  url: {
    type: string;
    template: string;
  };
  queries: {
    request: Array<{
      totalResults: string;
      searchTerms: string;
      count: number;
      startIndex: number;
      inputEncoding: string;
      outputEncoding: string;
      safe: string;
      cx: string;
    }>;
    nextPage?: Array<{
      title: string;
      totalResults: string;
      searchTerms: string;
      count: number;
      startIndex: number;
      inputEncoding: string;
      outputEncoding: string;
      safe: string;
      cx: string;
    }>;
  };
  context: {
    title: string;
  };
  searchInformation: {
    searchTime: number;
    formattedSearchTime: string;
    totalResults: string;
    formattedTotalResults: string;
  };
  items?: GoogleSearchItem[];
}

/**
 * Google Custom Search configuration options
 */
export interface GoogleSearchConfig extends ProviderConfig {
  /** Google Custom Search Engine ID */
  cx: string;
  /** API key or token */
  apiKey: string;
  /** Base URL for Google Custom Search API */
  baseUrl?: string;
  /** Custom timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Throttle: number of requests allowed within a specific interval */
  throttleLimit?: number;
  /** Throttle: interval in milliseconds for the limit (default: 1000) */
  throttleInterval?: number;
}

/**
 * Default base URL for Google Custom Search API
 */
const DEFAULT_BASE_URL = 'https://www.googleapis.com/customsearch/v1';

export class GoogleSearchProvider extends AbstractSearchProvider<GoogleSearchConfig> {
  public readonly name = 'google';

  constructor(config: GoogleSearchConfig) {
    if (!config.apiKey) {
      throw new Error('Google Custom Search requires an API key');
    }
    if (!config.cx) {
      throw new Error('Google Custom Search requires a Search Engine ID (cx)');
    }
    super(config);
  }

  protected getTroubleshooting(error: Error, statusCode?: number): string {
    if (statusCode === 403) {
      if (error.message.includes('API key not valid')) {
        return 'Authentication failed. Your Google apiKey is invalid or has expired.';
      }
      if (error.message.includes('has not been used')) {
        return 'Access denied. The apiKey has not been activated for the Custom Search API. Enable it in your Google Cloud Console.';
      }
      if (error.message.includes('dailyLimit')) {
        return 'Rate limit exceeded. You have exceeded your daily quota for the Google Custom Search API.';
      }
      if (error.message.includes('userRateLimitExceeded')) {
        return 'Rate limit exceeded. You are sending too many requests too quickly. Implement rate limiting in your application.';
      }
      return 'Authentication failed or Access denied. Verify your apiKey and search engine ID.';
    }
    if (statusCode === 400) {
      return 'Bad request. Check your search parameters or for invalid cx (Search Engine ID).';
    }
    if (statusCode === 429) {
      return 'Rate limit exceeded. Try again later.';
    }
    if (statusCode && statusCode >= 500) {
      return 'Server error. Google search is experiencing issues.';
    }
    if (error.message.includes('API key')) {
      return 'Authentication failed. Make sure your Google apiKey is valid and has the Custom Search API enabled. Also check if your Search Engine ID (cx) is correct.';
    }
    if (error.message.includes('quota')) {
      return "Rate limit exceeded. You've exceeded your Google Custom Search API quota. Check your Google Cloud Console for quota information.";
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
      throw new Error('Google search requires a query.');
    }

    const clampedMaxResults = Math.max(1, Math.min(10, Math.floor(maxResults)));
    const start = (page - 1) * clampedMaxResults + 1;

    const params: Record<string, string | number | undefined> = {
      key: this.config.apiKey,
      cx: this.config.cx,
      q: query,
      num: clampedMaxResults,
      start,
    };

    if (language) params.lr = `lang_${language}`;
    if (region) params.gl = region;
    if (safeSearch) params.safe = safeSearch === 'off' ? 'off' : 'active';

    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;
    const url = buildUrl(baseUrl, params);

    debug.logRequest(debugOptions, 'Google Search request', {
      url: this.config.apiKey ? url.replace(this.config.apiKey, '***') : url,
      params: { ...params, key: '***' },
    });

    const result = await get<GoogleSearchResponse>(url, { timeout });
    if (result.isErr()) throw result.error;
    const response = result.value;

    debug.logResponse(debugOptions, 'Google Search raw response', {
      status: 'success',
      itemCount: response.items?.length || 0,
      totalResults: response.searchInformation?.totalResults || 0,
    });

    if (!response.items || response.items.length === 0) {
      return [];
    }

    return response.items
      .filter((item) => item.link && item.title)
      .map((item) => {
        let publishedDate: string | undefined;
        if (item.pagemap?.metatags && item.pagemap.metatags.length > 0) {
          const metatags = item.pagemap.metatags[0];
          publishedDate =
            metatags['article:published_time'] ||
            metatags['date'] ||
            metatags['og:updated_time'];
        }

        return {
          url: item.link,
          title: item.title,
          snippet: item.snippet || undefined,
          domain: item.displayLink || undefined,
          publishedDate,
          provider: 'google',
          raw: item,
        };
      });
  }
}

/**
 * Creates a Google Custom Search API provider instance
 */
export function createGoogleProvider(config: GoogleSearchConfig): GoogleSearchProvider {
  return new GoogleSearchProvider(config);
}
