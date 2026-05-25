import { ResultAsync } from 'neverthrow';
import pRetry, { AbortError } from 'p-retry';
import pTimeout from 'p-timeout';
import pThrottle from 'p-throttle';
import { SearchOptions, SearchResult, SearchProvider, ProviderConfig } from '../types';
import { HttpError } from './http';
import { debug } from './debug';

/**
 * Type for the internal search implementation of a provider
 */
export type InternalSearchFn = (options: SearchOptions) => Promise<SearchResult[]>;

/**
 * Options for creating a provider
 */
export interface CreateProviderOptions<T extends ProviderConfig> {
  name: string;
  config: T;
  search: InternalSearchFn;
  getTroubleshooting?: (error: Error, statusCode?: number) => string;
}

/**
 * Creates a standardized search provider with built-in retry logic, timeouts, and throttling
 */
export function createBaseProvider<T extends ProviderConfig>(
  options: CreateProviderOptions<T>
): SearchProvider {
  const { name, config, search: internalSearch, getTroubleshooting } = options;

  let throttledSearch: InternalSearchFn | undefined;

  const getThrottledSearch = (): InternalSearchFn => {
    if (throttledSearch) return throttledSearch;

    if (config.throttleLimit) {
      const throttle = pThrottle({
        limit: config.throttleLimit,
        interval: config.throttleInterval ?? 1000,
      });
      throttledSearch = throttle(internalSearch);
      return throttledSearch;
    }

    return internalSearch;
  };

  return {
    name,
    config,
    search: (searchOptions: SearchOptions): ResultAsync<SearchResult[], Error> => {
      const retries = searchOptions.retries ?? 2;
      const timeout = searchOptions.timeout ?? config.timeout ?? 30000;
      const currentInternalSearch = getThrottledSearch();

      const runWithRetry = () =>
        pRetry(
          async () => {
            try {
              return await pTimeout(currentInternalSearch(searchOptions), {
                milliseconds: timeout,
                message: `Search timed out after ${timeout}ms`,
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);

              // Handle p-timeout's TimeoutError
              if (error instanceof Error && error.name === 'TimeoutError') {
                // We don't retry on timeouts by default to avoid piling up slow requests, 
                // but we could if we wanted to. For now, abort.
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
                  // Allow retry
                  throw error;
                }
                // Don't retry on 4xx errors (except 429)
                const abortErr = new AbortError(errorMessage);
                (abortErr as any).originalError = error;
                throw abortErr;
              }
              // Don't retry on other errors (like validation)
              const abortErr = new AbortError(errorMessage);
              (abortErr as any).originalError = error;
              throw abortErr;
            }
          },
          {
            retries,
            onFailedAttempt: (error) => {
              debug.log(
                searchOptions.debug,
                `Provider ${name} search attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`,
                { error: error.message }
              );
            },
          }
        );

      return ResultAsync.fromPromise(runWithRetry(), (error: unknown) => {
        let errObj: Error;
        let errorMessage: string;
        let statusCode: number | undefined;

        // Robust check for AbortError
        const isAbortError =
          error instanceof AbortError ||
          (error !== null &&
            typeof error === 'object' &&
            (error.constructor.name === 'AbortError' || 'originalError' in error));

        // Extract original error from AbortError if present
        const actualError =
          isAbortError && (error as any).originalError ? (error as any).originalError : error;

        // Robust check for HttpError that works even if instanceof fails due to multiple module instances
        const isHttpError =
          actualError instanceof HttpError ||
          (actualError !== null &&
            typeof actualError === 'object' &&
            'statusCode' in actualError &&
            'message' in actualError &&
            ('response' in actualError || 'responseBody' in actualError));

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

        let troubleshooting = getTroubleshooting?.(errObj, statusCode);

        if (!troubleshooting) {
          if (statusCode === 401 || statusCode === 403) {
            troubleshooting =
              'Authentication failed or Access denied. Your API key or token may be invalid.';
          } else if (statusCode === 400) {
            troubleshooting = 'Bad request. Check your search parameters or query for invalid content.';
          } else if (statusCode === 429) {
            troubleshooting = 'Rate limit exceeded. Try again later.';
          } else if (statusCode && statusCode >= 500) {
            troubleshooting = 'Server error. The search provider is experiencing issues.';
          }
        }

        // Map common provider names to their display versions for consistent error messages
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
          displayNames[name.toLowerCase()] || name.charAt(0).toUpperCase() + name.slice(1);
        let detailedMessage = `${displayName} search failed: ${errorMessage}`;

        if (troubleshooting) {
          detailedMessage += `\n\nTroubleshooting: ${troubleshooting}`;
        }

        return new Error(detailedMessage);
      });
    },
  };
}
