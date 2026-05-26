import pRetry, { AbortError } from 'p-retry';
import pTimeout from 'p-timeout';
import pThrottle from 'p-throttle';
import {
  SearchQuery,
  SearchResult,
  SearchProvider,
  ProviderConfig,
  SearchResultSchema,
  SearchProviderError,
  RateLimitError,
  TimeoutError,
  SearchValidationError,
  ProviderApiError,
  NetworkError,
} from '../types';
import { HttpError } from '../utils/http';

interface ExtendedAbortError extends AbortError {
  originalError: Error;
}

export abstract class AbstractSearchProvider<
  TConfig extends ProviderConfig = ProviderConfig,
> implements SearchProvider<TConfig> {
  public abstract readonly name: string;
  public readonly config: TConfig;
  private throttledSearch?: (options: SearchQuery) => Promise<SearchResult[]>;

  protected get displayName(): string {
    return this.name.charAt(0).toUpperCase() + this.name.slice(1);
  }

  constructor(config: TConfig) {
    this.config = config;
  }

  protected abstract doSearch(options: SearchQuery): Promise<SearchResult[]>;

  protected getTroubleshooting(_error: Error, _statusCode?: number): string {
    return '';
  }

  public async search(options: SearchQuery): Promise<SearchResult[]> {
    const retries = options.retries ?? 2;
    const timeout = options.timeout ?? this.config.timeout ?? 30000;
    const hooks = options.hooks;
    const query = options.query || '';
    const searchFn = this.getThrottledSearch();

    hooks?.onRequest?.(this.name, query);
    const startTime = Date.now();

    try {
      const results = await pRetry(
        async () => {
          try {
            return await pTimeout(searchFn(options), {
              milliseconds: timeout,
              message: `Search timed out after ${timeout}ms`,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (error instanceof Error && error.name === 'TimeoutError') {
              const abortErr = new AbortError(errorMessage) as ExtendedAbortError;
              abortErr.originalError = error instanceof Error ? error : new Error(String(error));
              throw abortErr;
            }

            if (
              error instanceof HttpError ||
              (error !== null && typeof error === 'object' && 'statusCode' in error)
            ) {
              const statusCode = (error as Record<string, unknown>).statusCode as
                | number
                | undefined;
              if (statusCode === 429 || (statusCode !== undefined && statusCode >= 500)) {
                throw error;
              }
              const abortErr = new AbortError(errorMessage) as ExtendedAbortError;
              abortErr.originalError = error instanceof Error ? error : new Error(String(error));
              throw abortErr;
            }

            const abortErr = new AbortError(errorMessage) as ExtendedAbortError;
            abortErr.originalError = error instanceof Error ? error : new Error(String(error));
            throw abortErr;
          }
        },
        {
          retries,
          onFailedAttempt: () => {},
        }
      );

      const validated = this.validateResults(results);
      hooks?.onResponse?.(this.name, validated.length, Date.now() - startTime);
      return validated;
    } catch (error) {
      const providerError = this.standardizeError(error);
      hooks?.onError?.(this.name, providerError);
      throw providerError;
    }
  }

  private getThrottledSearch(): (options: SearchQuery) => Promise<SearchResult[]> {
    if (this.throttledSearch) return this.throttledSearch;

    const internalSearch = this.doSearch.bind(this);

    if (this.config.throttleLimit) {
      const throttle = pThrottle({
        limit: this.config.throttleLimit as number,
        interval: (this.config.throttleInterval as number) ?? 1000,
      });
      this.throttledSearch = throttle(internalSearch);
      return this.throttledSearch;
    }

    return internalSearch;
  }

  private validateResults(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) {
      return results;
    }

    const validated: SearchResult[] = [];
    for (let i = 0; i < results.length; i++) {
      const parsed = SearchResultSchema.safeParse(results[i]);
      if (parsed.success) {
        validated.push(parsed.data);
      } else {
        console.warn(
          `[@omnisearch] Provider ${this.name} returned invalid result at index ${i}: ${parsed.error.message}`,
          { issues: parsed.error.issues }
        );
      }
    }

    return validated;
  }

  private standardizeError(error: unknown): SearchProviderError {
    const provider = this.displayName;

    const isAbortError =
      error instanceof AbortError ||
      (error !== null &&
        typeof error === 'object' &&
        (error.constructor.name === 'AbortError' || 'originalError' in error));

    const actualError =
      isAbortError && (error as Record<string, unknown>).originalError
        ? (error as Record<string, unknown>).originalError
        : error;

    const isTimeout =
      (actualError instanceof Error && actualError.name === 'TimeoutError') ||
      (isAbortError &&
        actualError instanceof Error &&
        actualError.message.toLowerCase().includes('timed out'));

    if (isTimeout) {
      return new TimeoutError(
        provider,
        actualError instanceof Error ? actualError.message : String(actualError)
      );
    }

    const isHttpError =
      actualError instanceof HttpError ||
      (actualError !== null &&
        typeof actualError === 'object' &&
        'statusCode' in actualError &&
        'message' in actualError);

    if (isHttpError) {
      const httpErr = actualError as HttpError;
      const statusCode = httpErr.statusCode;
      const errorMessage = httpErr.message || String(actualError);

      if (statusCode === 429) {
        return new RateLimitError(provider, { statusCode, cause: httpErr });
      }

      const troubleshooting =
        this.getTroubleshooting(httpErr, statusCode) || this.getDefaultTroubleshooting(statusCode);

      return new ProviderApiError(provider, `${provider} search failed: ${errorMessage}`, {
        statusCode,
        retryable: statusCode !== undefined && statusCode >= 500,
        troubleshooting,
        cause: httpErr,
      });
    }

    if (
      actualError instanceof Error ||
      (actualError !== null && typeof actualError === 'object' && 'message' in actualError)
    ) {
      const errObj = actualError as Error;
      const errorMessage = errObj.message || String(actualError);

      if (errorMessage.includes('requires a query') || errorMessage.includes('requires either')) {
        return new SearchValidationError(provider, `${provider} search failed: ${errorMessage}`);
      }

      const troubleshooting = this.getTroubleshooting(errObj);

      return new ProviderApiError(provider, `${provider} search failed: ${errorMessage}`, {
        troubleshooting: troubleshooting || undefined,
        cause: errObj,
      });
    }

    const errorMessage =
      typeof actualError === 'string' ? actualError : JSON.stringify(actualError);
    return new NetworkError(provider, `${provider} search failed: ${errorMessage}`);
  }

  private getDefaultTroubleshooting(statusCode?: number): string {
    if (statusCode === 401 || statusCode === 403) {
      return 'Authentication failed or Access denied. Your API key or token may be invalid.';
    }
    if (statusCode === 400) {
      return 'Bad request. Check your search parameters or query for invalid content.';
    }
    if (statusCode === 429) {
      return 'Rate limit exceeded. Try again later.';
    }
    if (statusCode && statusCode >= 500) {
      return 'Server error. The search provider is experiencing issues.';
    }
    return '';
  }
}
