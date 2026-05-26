import { SearchQuery, SearchResult, ProviderConfig } from '../types';
import { post, extractDomain, clampMaxResults } from '../utils';
import { AbstractSearchProvider } from './base';

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

export interface ExaConfig extends ProviderConfig {
  baseUrl?: string;
  model?: 'keyword' | 'embeddings';
  includeContents?: boolean;
}

const DEFAULT_BASE_URL = 'https://api.exa.ai/search';

export class ExaSearchProvider extends AbstractSearchProvider<ExaConfig> {
  public readonly name = 'exa';

  constructor(config: ExaConfig) {
    if (!config.apiKey) {
      throw new Error('Exa requires an API key');
    }
    super(config);
  }

  protected getTroubleshooting(_error: Error, statusCode?: number): string {
    if (statusCode === 401 || statusCode === 403) {
      return "This is likely an authentication issue. Check your API key and make sure it's valid and has the correct permissions.";
    }
    if (statusCode === 400) {
      return 'Bad request. This is likely due to invalid request parameters. Check your query and other search options.';
    }
    if (statusCode === 429) {
      return "You've exceeded the rate limit for this API. Try again later or reduce your request frequency.";
    }
    if (statusCode && statusCode >= 500) {
      return 'The search provider is experiencing server issues. Try again later.';
    }
    return '';
  }

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    const { query, maxResults = 10, timeout } = options;

    if (!query || !query.trim()) {
      throw new Error('Exa search requires a query.');
    }

    const clampedMaxResults = clampMaxResults(maxResults);

    const requestBody = {
      query,
      max_results: clampedMaxResults,
      model: this.config.model || 'keyword',
      include_contents: this.config.includeContents || false,
    };

    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;

    const response = await post<ExaSearchResponse>(baseUrl, requestBody, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
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
        snippet: result.text,
        domain: extractDomain(result.url),
        publishedDate: result.publish_date,
        provider: 'exa',
        raw: result,
      };
    });
  }
}

export function createExaProvider(config: ExaConfig): ExaSearchProvider {
  return new ExaSearchProvider(config);
}
