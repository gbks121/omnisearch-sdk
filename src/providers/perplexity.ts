import { SearchQuery, SearchResult, ProviderConfig } from '../types';
import { post, extractDomain } from '../utils';
import { AbstractSearchProvider } from './base';

interface PerplexitySearchResult {
  title: string;
  url: string;
  snippet: string;
  date: string;
  last_updated: string;
}

interface PerplexitySearchResponse {
  results: PerplexitySearchResult[];
}

export interface PerplexityConfig extends ProviderConfig {
  baseUrl?: string;
  maxTokens?: number;
  maxTokensPerPage?: number;
  country?: string;
  searchDomainFilter?: string[];
  searchRecencyFilter?: 'day' | 'week' | 'month' | 'year';
  searchAfterDate?: string;
  searchBeforeDate?: string;
  searchLanguageFilter?: string[];
}

interface PerplexityRequestBody {
  query: string;
  max_results?: number;
  max_tokens?: number;
  search_domain_filter?: string[];
  max_tokens_per_page?: number;
  country?: string;
  search_recency_filter?: 'day' | 'week' | 'month' | 'year';
  search_after_date?: string;
  search_before_date?: string;
  search_language_filter?: string[];
}

const DEFAULT_BASE_URL = 'https://api.perplexity.ai/search';

export class PerplexitySearchProvider extends AbstractSearchProvider<PerplexityConfig> {
  public readonly name = 'perplexity';

  constructor(config: PerplexityConfig) {
    if (!config.apiKey) {
      throw new Error('Perplexity requires an API key');
    }
    super(config);
  }

  protected getTroubleshooting(error: Error, statusCode?: number): string {
    if (error.message.includes('api_key') || error.message.includes('apiKey')) {
      return "Authentication failed. Check your Perplexity apiKey. Make sure it's valid and has the correct permissions for the Search API.";
    }
    if (statusCode === 429) {
      return 'Rate limit exceeded. You have exceeded your Perplexity API quota or rate limits. Check your usage in your Perplexity account dashboard.';
    }
    if (statusCode === 400) {
      return 'Bad request. Check your search parameters for the Perplexity API. Ensure max_results is between 1-20, and date formats are correct (MM/DD/YYYY).';
    }
    if (statusCode === 401 || statusCode === 403) {
      return "Authentication failed or Access denied. Check your apiKey and make sure it's valid and has the correct permissions.";
    }
    if (statusCode && statusCode >= 500) {
      return 'Server error. The search provider is experiencing issues. Try again later.';
    }
    return '';
  }

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    const { query, maxResults = 10, region, language, timeout } = options;

    if (!query || !query.trim()) {
      throw new Error('Perplexity search requires a query.');
    }

    const requestBody: PerplexityRequestBody = {
      query: query,
    };

    if (maxResults !== undefined) {
      const validMaxResults = Math.max(1, Math.min(20, maxResults));
      requestBody.max_results = validMaxResults;
    }

    if (this.config.maxTokens !== undefined) {
      requestBody.max_tokens = this.config.maxTokens;
    }

    if (this.config.searchDomainFilter) {
      requestBody.search_domain_filter = this.config.searchDomainFilter;
    }

    if (this.config.maxTokensPerPage !== undefined) {
      requestBody.max_tokens_per_page = this.config.maxTokensPerPage;
    }

    if (region) {
      requestBody.country = region;
    } else if (this.config.country) {
      requestBody.country = this.config.country;
    }

    if (this.config.searchRecencyFilter) {
      requestBody.search_recency_filter = this.config.searchRecencyFilter;
    }

    if (this.config.searchAfterDate) {
      requestBody.search_after_date = this.config.searchAfterDate;
    }

    if (this.config.searchBeforeDate) {
      requestBody.search_before_date = this.config.searchBeforeDate;
    }

    if (this.config.searchLanguageFilter) {
      requestBody.search_language_filter = this.config.searchLanguageFilter;
    } else if (language) {
      requestBody.search_language_filter = [language];
    }

    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;

    const response = await post<PerplexitySearchResponse>(baseUrl, requestBody, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout,
    });

    if (!response.results || response.results.length === 0) {
      return [];
    }

    return response.results.map((result) => {
      const publishedDate = result.last_updated || result.date;

      return {
        url: result.url,
        title: result.title,
        snippet: result.snippet,
        domain: extractDomain(result.url),
        publishedDate,
        provider: 'perplexity',
        raw: result,
      };
    });
  }
}

export function createPerplexityProvider(config: PerplexityConfig): PerplexitySearchProvider {
  return new PerplexitySearchProvider(config);
}
