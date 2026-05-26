import { describe, it, expect, vi } from 'vitest';
import { AbstractSearchProvider } from '../providers/base';
import { SearchOptions, SearchResult } from '../types';

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
});
