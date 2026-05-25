import { describe, it, expect, vi } from 'vitest';
import { createBaseProvider } from '../utils/provider';
import { SearchOptions, SearchResult } from '../types';

describe('createBaseProvider Resilience Features', () => {
  it('should timeout if search takes too long', async () => {
    const slowSearch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return [] as SearchResult[];
    };

    const provider = createBaseProvider({
      name: 'test',
      config: { timeout: 50 },
      search: slowSearch,
    });

    const result = await provider.search({ query: 'test', retries: 0 });
    
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message.toLowerCase()).toContain('timed out');
  });

  it('should honor request-specific timeout override', async () => {
    const slowSearch = async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return [] as SearchResult[];
    };

    const provider = createBaseProvider({
      name: 'test',
      config: { timeout: 1000 },
      search: slowSearch,
    });

    // Short override should fail
    const result = await provider.search({ query: 'test', timeout: 50, retries: 0 });
    
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().message.toLowerCase()).toContain('timed out');
  });

  it('should throttle requests if throttleLimit is set', async () => {
    const searchSpy = vi.fn().mockResolvedValue([]);
    
    const provider = createBaseProvider({
      name: 'test',
      config: { 
        throttleLimit: 1, 
        throttleInterval: 100 
      },
      search: searchSpy,
    });

    const start = Date.now();
    
    // Fire two requests. The second should be delayed by ~100ms.
    await Promise.all([
      provider.search({ query: '1', retries: 0 }),
      provider.search({ query: '2', retries: 0 })
    ]);
    
    const duration = Date.now() - start;
    
    expect(searchSpy).toHaveBeenCalledTimes(2);
    expect(duration).toBeGreaterThanOrEqual(100);
  });
});
