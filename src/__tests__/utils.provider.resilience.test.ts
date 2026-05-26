import { describe, it, expect, vi } from 'vitest';
import { AbstractSearchProvider } from '../providers/base';
import {
  SearchQuery,
  SearchResult,
  SearchProviderError,
  TimeoutError,
  RateLimitError,
  ProviderApiError,
  SearchValidationError,
} from '../types';
import { HttpError } from '../utils/http';

class TestSearchProvider extends AbstractSearchProvider {
  public readonly name = 'test';
  public searchImpl = vi.fn().mockResolvedValue([]);

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    return this.searchImpl(options);
  }
}

describe('AbstractSearchProvider Resilience Features', () => {
  it('should throw TimeoutError if search takes too long', async () => {
    const provider = new TestSearchProvider({ timeout: 50 });
    provider.searchImpl.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return [];
    });

    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as TimeoutError).code).toBe('TIMEOUT');
      expect((error as TimeoutError).message.toLowerCase()).toContain('timed out');
    }
  });

  it('should honor request-specific timeout override', async () => {
    const provider = new TestSearchProvider({ timeout: 1000 });
    provider.searchImpl.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return [];
    });

    try {
      await provider.search({ query: 'test', timeout: 50, retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
      expect((error as Error).message.toLowerCase()).toContain('timed out');
    }
  });

  it('should throttle requests if throttleLimit is set', async () => {
    const provider = new TestSearchProvider({
      throttleLimit: 1,
      throttleInterval: 100,
    });

    const start = Date.now();

    await Promise.all([
      provider.search({ query: '1', retries: 0 }),
      provider.search({ query: '2', retries: 0 }),
    ]);

    const duration = Date.now() - start;

    expect(provider.searchImpl).toHaveBeenCalledTimes(2);
    expect(duration).toBeGreaterThanOrEqual(100);
  });

  it('should retry on transient 500 errors and succeed', async () => {
    const provider = new TestSearchProvider({});
    let callCount = 0;
    provider.searchImpl.mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        throw new HttpError('Internal Server Error', 500);
      }
      return [{ url: 'https://example.com', title: 'Test', provider: 'test' }];
    });

    const results = await provider.search({ query: 'test', retries: 2, timeout: 5000 });
    expect(callCount).toBe(3);
    expect(results).toHaveLength(1);
  });

  it('should retry on 429 rate limit errors', async () => {
    const provider = new TestSearchProvider({});
    let callCount = 0;
    provider.searchImpl.mockImplementation(async () => {
      callCount++;
      if (callCount < 2) {
        throw new HttpError('Too Many Requests', 429);
      }
      return [{ url: 'https://example.com', title: 'Test', provider: 'test' }];
    });

    const results = await provider.search({ query: 'test', retries: 2, timeout: 5000 });
    expect(callCount).toBe(2);
    expect(results).toHaveLength(1);
  });

  it('should not retry on 400 client errors', async () => {
    const provider = new TestSearchProvider({});
    provider.searchImpl.mockImplementation(async () => {
      throw new HttpError('Bad Request', 400);
    });

    try {
      await provider.search({ query: 'test', retries: 3, timeout: 5000 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderApiError);
      expect(provider.searchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it('should exhaust retries and fail for persistent 500 errors', async () => {
    const provider = new TestSearchProvider({});
    provider.searchImpl.mockImplementation(async () => {
      throw new HttpError('Internal Server Error', 500);
    });

    try {
      await provider.search({ query: 'test', retries: 2, timeout: 5000 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderApiError);
      expect((error as ProviderApiError).retryable).toBe(true);
      expect(provider.searchImpl).toHaveBeenCalledTimes(3);
    }
  });

  it('should throw SearchValidationError for empty query', async () => {
    const provider = new TestSearchProvider({});
    provider.searchImpl.mockImplementation(async () => {
      throw new Error('Test search requires a query.');
    });

    try {
      await provider.search({ query: '', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(SearchValidationError);
      expect((error as SearchValidationError).code).toBe('VALIDATION');
    }
  });

  it('should throw RateLimitError for 429 status', async () => {
    const provider = new TestSearchProvider({});
    provider.searchImpl.mockImplementation(async () => {
      throw new HttpError('Too Many Requests', 429);
    });

    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(RateLimitError);
      expect((error as RateLimitError).code).toBe('RATE_LIMIT');
      expect((error as RateLimitError).retryable).toBe(true);
    }
  });

  it('should call onRequest and onResponse hooks', async () => {
    const provider = new TestSearchProvider({});
    provider.searchImpl.mockResolvedValue([
      { url: 'https://example.com', title: 'Test', provider: 'test' },
    ]);
    const onRequest = vi.fn();
    const onResponse = vi.fn();

    await provider.search({ query: 'test', retries: 0, hooks: { onRequest, onResponse } });

    expect(onRequest).toHaveBeenCalledWith('test', 'test');
    expect(onResponse).toHaveBeenCalledWith('test', 1, expect.any(Number));
  });

  it('should call onError hook on failure', async () => {
    const provider = new TestSearchProvider({});
    provider.searchImpl.mockImplementation(async () => {
      throw new HttpError('Bad Request', 400);
    });
    const onError = vi.fn();

    try {
      await provider.search({ query: 'test', retries: 0, hooks: { onError } });
      expect.unreachable('Should have thrown');
    } catch {
      // expected
    }

    expect(onError).toHaveBeenCalledWith('test', expect.any(SearchProviderError));
  });
});
