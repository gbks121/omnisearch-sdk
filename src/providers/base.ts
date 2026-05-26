import { ResultAsync } from 'neverthrow';
import pRetry, { AbortError } from 'p-retry';
import pTimeout from 'p-timeout';
import pThrottle from 'p-throttle';
import { SearchOptions, SearchResult, SearchProvider, ProviderConfig } from '../types';
import { HttpError } from '../utils/http';
import { debug } from '../utils/debug';

/**
 * Abstract base class for search providers that handles common concerns:
 * - Throttling
 * - Retries
 * - Timeouts
 * - Error standardization and troubleshooting
 */
export abstract class AbstractSearchProvider<
  TConfig extends ProviderConfig = ProviderConfig,
  TOptions extends SearchOptions = SearchOptions,
> implements SearchProvider<TConfig, TOptions>
{
  public abstract readonly name: string;
  public readonly config: TConfig;
  private throttledSearch?: (options: TOptions) => Promise<SearchResult[]>;

  constructor(config: TConfig) {
    this.config = config;
  }

  /**
   * Internal search implementation to be provided by subclasses
   */
  protected abstract doSearch(options: TOptions): Promise<SearchResult[]>;

  /**
   * Optional hook for provider-specific troubleshooting messages
   */
  protected getTroubleshooting(error: Error, statusCode?: number): string {
    return '';
  }

  /**
   * Standardized search method that wraps the internal implementation with resilience logic
   */
  public search(options: TOptions): ResultAsync<SearchResult[], Error> {
    const retries = options.retries ?? 2;
    const timeout = options.timeout ?? this.config.timeout ?? 30000;
    const searchFn = this.getThrottledSearch();

    const runWithResilience = () =>
      pRetry(
        async () => {
          try {
            return await pTimeout(searchFn(options), {
              milliseconds: timeout,
              message: `Search timed out after ${timeout}ms`,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Handle p-timeout's TimeoutError
            if (error instanceof Error && error.name === 'TimeoutError') {
              const abortErr = new AbortError(errorMessage);
              (abortErr as any).originalError = error;
              throw abortErr;
            }

            // Only retry on transient errors
            if (
              error instanceof HttpError ||
              (error !== null && typeof error === 'object' && 'statusCode' in error)
            ) {
              const statusCode = (error as any).statusCode;
              if (statusCode === 429 || statusCode >= 500) {
                throw error; // Allow retry
              }
              const abortErr = new AbortError(errorMessage);
              (abortErr as any).originalError = error;
              throw abortErr;
            }

            const abortErr = new AbortError(errorMessage);
            (abortErr as any).originalError = error;
            throw abortErr;
          }
        },
        {
          retries,
          onFailedAttempt: (error) => {
            debug.log(
              options.debug,
              `Provider ${this.name} search attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`,
              { error: error.message }
            );
          },
        }
      );

    return ResultAsync.fromPromise(runWithResilience(), (error: unknown) => {
      return this.standardizeError(error);
    });
  }

  private getThrottledSearch(): (options: TOptions) => Promise<SearchResult[]> {
    if (this.throttledSearch) return this.throttledSearch;

    const internalSearch = this.doSearch.bind(this);

    if (this.config.throttleLimit) {
      const throttle = pThrottle({
        limit: this.config.throttleLimit,
        interval: this.config.throttleInterval ?? 1000,
      });
      this.throttledSearch = throttle(internalSearch);
      return this.throttledSearch;
    }

    return internalSearch;
  }

  private standardizeError(error: unknown): Error {
    let errObj: Error;
    let errorMessage: string;
    let statusCode: number | undefined;

    const isAbortError =
      error instanceof AbortError ||
      (error !== null &&
        typeof error === 'object' &&
        (error.constructor.name === 'AbortError' || 'originalError' in error));

    const actualError =
      isAbortError && (error as any).originalError ? (error as any).originalError : error;

    const isHttpError =
      actualError instanceof HttpError ||
      (actualError !== null &&
        typeof actualError === 'object' &&
        'statusCode' in actualError &&
        'message' in actualError);

    if (isHttpError) {
      const httpErr = actualError as any;
      errObj = httpErr instanceof Error ? httpErr : new Error(httpErr.message || String(httpErr));
      errorMessage = httpErr.message || String(httpErr);
      statusCode = httpErr.statusCode;
    } else if (
      actualError instanceof Error ||
      (actualError !== null && typeof actualError === 'object' && 'message' in actualError)
    ) {
      errObj = actualError as Error;
      errorMessage = (actualError as any).message || String(actualError);
    } else {
      errorMessage = typeof actualError === 'string' ? actualError : JSON.stringify(actualError);
      errObj = new Error(errorMessage);
    }

    let troubleshooting = this.getTroubleshooting(errObj, statusCode);

    if (!troubleshooting) {
      if (statusCode === 401 || statusCode === 403) {
        troubleshooting = 'Authentication failed or Access denied. Your API key or token may be invalid.';
      } else if (statusCode === 400) {
        troubleshooting = 'Bad request. Check your search parameters or query for invalid content.';
      } else if (statusCode === 429) {
        troubleshooting = 'Rate limit exceeded. Try again later.';
      } else if (statusCode && statusCode >= 500) {
        troubleshooting = 'Server error. The search provider is experiencing issues.';
      }
    }

    const displayNames: Record<string, string> = {
      serpapi: 'SerpAPI',
      duckduckgo: 'DuckDuckGo',
      searxng: 'SearXNG',
      arxiv: 'Arxiv',
      google: 'Google',
      brave: 'Brave',
      exa: 'Exa',
      perplexity: 'Perplexity',
      parallel: 'Parallel',
      tavily: 'Tavily',
    };

    const displayName =
      displayNames[this.name.toLowerCase()] ||
      this.name.charAt(0).toUpperCase() + this.name.slice(1);
    let detailedMessage = `${displayName} search failed: ${errorMessage}`;

    if (troubleshooting) {
      detailedMessage += `\n\nTroubleshooting: ${troubleshooting}`;
    }

    return new Error(detailedMessage);
  }
}
