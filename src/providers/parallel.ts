import { SearchOptions, SearchResult, ProviderConfig } from '../types';
import { post, extractDomain, clampMaxResults } from '../utils';
import { debug } from '../utils/debug';
import { AbstractSearchProvider } from './base';

/**
 * Parallel Search API response types
 */
interface ParallelWebSearchResult {
  url: string;
  title?: string;
  publish_date?: string;
  excerpts?: string[];
}

interface ParallelSearchResponse {
  search_id: string;
  results: ParallelWebSearchResult[];
  warnings?: Array<{
    type: string;
    message: string;
    detail?: Record<string, unknown>;
  }>;
  usage?: Array<{
    type: string;
    amount: number;
    unit: string;
  }>;
}

/**
 * Source policy for Parallel search
 */
interface SourcePolicy {
  include_domains?: string[];
  exclude_domains?: string[];
  after_date?: string;
  before_date?: string;
}

/**
 * Excerpt settings for Parallel search
 */
interface ExcerptSettings {
  max_chars_per_result?: number;
  count?: number;
}

/**
 * Fetch policy for Parallel search
 */
interface FetchPolicy {
  strategy?: 'cached' | 'live';
}

/**
 * Parallel Search API request body
 */
interface ParallelSearchRequestBody {
  objective?: string;
  search_queries?: string[];
  mode?: 'one-shot' | 'agentic';
  max_results?: number;
  excerpts?: ExcerptSettings;
  source_policy?: SourcePolicy;
  fetch_policy?: FetchPolicy;
}

/**
 * Parallel API configuration options
 */
export interface ParallelConfig extends ProviderConfig {
  /** Base URL for Parallel API */
  baseUrl?: string;
  /** Mode: 'one-shot' for comprehensive results, 'agentic' for concise results */
  mode?: 'one-shot' | 'agentic';
  /** Maximum number of results */
  maxResults?: number;
  /** Domains to include in search results */
  includeDomains?: string[];
  /** Domains to exclude from search results */
  excludeDomains?: string[];
  /** Start date for filtering results (YYYY-MM-DD format) */
  afterDate?: string;
  /** End date for filtering results (YYYY-MM-DD format) */
  beforeDate?: string;
  /** Maximum characters per excerpt */
  maxCharsPerResult?: number;
  /** Number of excerpts per result */
  excerptCount?: number;
  /** Fetch strategy: 'cached' for faster results, 'live' for fresher content */
  fetchStrategy?: 'cached' | 'live';
  /** Optional metadata for client-side tracking and reference */
  metadata?: Record<string, unknown>;
}

/**
 * Default base URL for Parallel API
 */
const DEFAULT_BASE_URL = 'https://api.parallel.ai/v1beta/search';

/**
 * Beta header value for Parallel search API
 */
const PARALLEL_BETA_HEADER = 'search-extract-2025-10-10';

export class ParallelSearchProvider extends AbstractSearchProvider<ParallelConfig> {
  public readonly name = 'parallel';

  constructor(config: ParallelConfig) {
    if (!config.apiKey) {
      throw new Error('Parallel requires an API key');
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

  protected async doSearch(options: SearchOptions): Promise<SearchResult[]> {
    const { query, maxResults = 10, timeout, debug: debugOptions } = options;

    if (!query || !query.trim()) {
      throw new Error('Parallel search requires a query.');
    }

    const requestBody: ParallelSearchRequestBody = {
      objective: query,
    };

    if (this.config.mode) {
      requestBody.mode = this.config.mode;
    }

    const effectiveMaxResults = clampMaxResults(maxResults || this.config.maxResults || 10);
    requestBody.max_results = effectiveMaxResults;

    if (this.config.maxCharsPerResult !== undefined || this.config.excerptCount !== undefined) {
      const excerptSettings: ExcerptSettings = {};
      if (this.config.maxCharsPerResult !== undefined) {
        excerptSettings.max_chars_per_result = this.config.maxCharsPerResult;
      }
      if (this.config.excerptCount !== undefined) {
        excerptSettings.count = this.config.excerptCount;
      }
      requestBody.excerpts = excerptSettings;
    }

    if (
      this.config.includeDomains?.length ||
      this.config.excludeDomains?.length ||
      this.config.afterDate ||
      this.config.beforeDate
    ) {
      const sourcePolicy: SourcePolicy = {};
      if (this.config.includeDomains?.length) {
        sourcePolicy.include_domains = this.config.includeDomains;
      }
      if (this.config.excludeDomains?.length) {
        sourcePolicy.exclude_domains = this.config.excludeDomains;
      }
      if (this.config.afterDate) {
        sourcePolicy.after_date = this.config.afterDate;
      }
      if (this.config.beforeDate) {
        sourcePolicy.before_date = this.config.beforeDate;
      }
      requestBody.source_policy = sourcePolicy;
    }

    if (this.config.fetchStrategy) {
      requestBody.fetch_policy = {
        strategy: this.config.fetchStrategy,
      };
    }

    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;

    debug.logRequest(debugOptions, 'Parallel Search request', {
      url: baseUrl,
      body: { ...requestBody, apiKey: '***' },
    });

    const result = await post<ParallelSearchResponse>(baseUrl, requestBody, {
      headers: {
        'x-api-key': this.config.apiKey as string,
        'Content-Type': 'application/json',
        'parallel-beta': PARALLEL_BETA_HEADER,
      },
      timeout,
    });
    if (result.isErr()) throw result.error;
    const response = result.value;

    debug.logResponse(debugOptions, 'Parallel Search raw response', {
      status: 'success',
      itemCount: response.results?.length || 0,
      searchId: response.search_id || '',
      warnings: response.warnings || [],
      usage: response.usage || [],
    });

    // Log warnings if present
    if (response.warnings && response.warnings.length > 0) {
      debug.log(debugOptions, 'Parallel Search warnings', {
        warnings: response.warnings,
      });
    }

    if (!response.results || response.results.length === 0) {
      return [];
    }

    return response.results.map((result) => {
      const excerpts = result.excerpts || [];
      const snippet = excerpts.length > 0 ? excerpts[0] : undefined;
      const content = excerpts.length > 0 ? excerpts.join('\n\n') : undefined;

      return {
        url: result.url,
        title: result.title || 'No title available',
        snippet,
        content,
        domain: extractDomain(result.url),
        publishedDate: result.publish_date,
        provider: 'parallel',
        raw: result,
      };
    });
  }
}

/**
 * Creates a Parallel search provider instance
 */
export function createParallelProvider(config: ParallelConfig): ParallelSearchProvider {
  return new ParallelSearchProvider(config);
}
