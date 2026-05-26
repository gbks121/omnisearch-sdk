import { describe, it, expect, vi } from 'vitest';
import { AbstractSearchProvider } from '../providers/base';
import { SearchOptions, SearchResult } from '../types';
import { HttpError } from '../utils/http';

class TestSearchProvider extends AbstractSearchProvider {
  public readonly name = 'test';
  public searchImpl = vi.fn().mockResolvedValue([]);

  protected async doSearch(options: SearchOptions): Promise<SearchResult[]> {
    return this.searchImpl(options);
  }
}

describe('AbstractSearchProvider Resilience Features', () => {
  it('should timeout if search takes too long', async () => {
    const provider = new TestSearchProvider({ timeout: 50 });
    provider.searchImpl.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return [];
    });

    const result = await provider.search({ query: 'test', retries: 0 });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message.toLowerCase()).toContain('timed out');
  });

  it('should honor request-specific timeout override', async () => {
    const provider = new TestSearchProvider({ timeout: 1000 });
    provider.searchImpl.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return [];
    });

    // Short override should fail
    const result = await provider.search({ query: 'test', timeout: 50, retries: 0 });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message.toLowerCase()).toContain('timed out');
  });

  it('should throttle requests if throttleLimit is set', async () => {
    const provider = new TestSearchProvider({
      throttleLimit: 1,
      throttleInterval: 100,
    });

    const start = Date.now();

    // Fire two requests. The second should be delayed by ~100ms.
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

    const result = await provider.search({ query: 'test', retries: 2, timeout: 5000 });

    expect(result.isOk()).toBe(true);
    expect(callCount).toBe(3);
    expect(result._unsafeUnwrap()).toHaveLength(1);
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

    const result = await provider.search({ query: 'test', retries: 2, timeout: 5000 });

    expect(result.isOk()).toBe(true);
    expect(callCount).toBe(2);
  });

  it('should not retry on 400 client errors', async () => {
    const provider = new TestSearchProvider({});
    provider.searchImpl.mockImplementation(async () => {
      throw new HttpError('Bad Request', 400);
    });

    const result = await provider.search({ query: 'test', retries: 3, timeout: 5000 });

    expect(result.isErr()).toBe(true);
    expect(provider.searchImpl).toHaveBeenCalledTimes(1);
  });

  it('should exhaust retries and fail for persistent 500 errors', async () => {
    const provider = new TestSearchProvider({});
    provider.searchImpl.mockImplementation(async () => {
      throw new HttpError('Internal Server Error', 500);
    });

    const result = await provider.search({ query: 'test', retries: 2, timeout: 5000 });

    expect(result.isErr()).toBe(true);
    expect(provider.searchImpl).toHaveBeenCalledTimes(3);
  });
});
