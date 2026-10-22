import { describe, expect, it, vi } from 'vitest';
import { MemoryCacheStore } from '../cache';
import { AbstractSearchProvider } from '../providers/base';
import type { SearchQuery, SearchResult } from '../types';
import { HttpError } from '../utils/http';

class HookTestProvider extends AbstractSearchProvider {
  public readonly name = 'hooktest';
  public searchImpl = vi.fn().mockResolvedValue([]);

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    return this.searchImpl(options);
  }
}

function rateLimitResponse(status: number, headers: Record<string, string>): Response {
  return new Response('', { status, headers: new Headers(headers) });
}

describe('AbstractSearchProvider telemetry & hooks wiring', () => {
  it('passes 2xx rate-limit telemetry captured via onTelemetry to hooks.onResponse', async () => {
    const provider = new HookTestProvider({});
    provider.searchImpl.mockImplementation(async (options: SearchQuery) => {
      options.onTelemetry?.({ limit: 100, remaining: 42 });
      return [{ url: 'https://example.com', title: 'Test', provider: 'hooktest' }];
    });
    const onResponse = vi.fn();

    await provider.search({ query: 'test', retries: 0, hooks: { onResponse } });

    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith('hooktest', 1, expect.any(Number), {
      limit: 100,
      remaining: 42,
      cached: false,
    });
  });

  it('reports { cached: true } on onResponse for cache hits', async () => {
    const store = new MemoryCacheStore();
    const provider = new HookTestProvider({ cache: store });
    provider.searchImpl.mockResolvedValue([
      { url: 'https://example.com', title: 'Test', provider: 'hooktest' },
    ]);
    const onResponse = vi.fn();

    await provider.search({ query: 'cached', hooks: { onResponse } });
    const firstCalls = onResponse.mock.calls.length;
    expect(firstCalls).toBe(1);

    onResponse.mockClear();
    await provider.search({ query: 'cached', hooks: { onResponse } });

    expect(provider.searchImpl).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith('hooktest', 1, 0, { cached: true });
  });

  it('forwards the resolved provider-level config timeout into doSearch options', async () => {
    const provider = new HookTestProvider({ timeout: 1234 });
    provider.searchImpl.mockResolvedValue([]);

    await provider.search({ query: 'test', retries: 0 });

    expect(provider.searchImpl).toHaveBeenCalledWith(expect.objectContaining({ timeout: 1234 }));
  });
});

describe('AbstractSearchProvider smart 429 short-circuit', () => {
  it('aborts retries immediately when 429 telemetry reports remaining === 0', async () => {
    const provider = new HookTestProvider({});
    provider.searchImpl.mockImplementation(async () => {
      throw new HttpError(
        'Too Many Requests',
        429,
        rateLimitResponse(429, {
          'x-ratelimit-remaining': '0',
        })
      );
    });

    await expect(provider.search({ query: 'test', retries: 3 })).rejects.toThrow();
    expect(provider.searchImpl).toHaveBeenCalledTimes(1);
  });

  it('aborts retries immediately when retryAfter exceeds maxRetryAfterSeconds', async () => {
    const provider = new HookTestProvider({});
    provider.searchImpl.mockImplementation(async () => {
      throw new HttpError(
        'Too Many Requests',
        429,
        rateLimitResponse(429, { 'retry-after': '60' })
      );
    });

    await expect(provider.search({ query: 'test', retries: 3 })).rejects.toThrow();
    expect(provider.searchImpl).toHaveBeenCalledTimes(1);
  });

  it('still retries 429 responses without short-circuit telemetry', async () => {
    const provider = new HookTestProvider({});
    let callCount = 0;
    provider.searchImpl.mockImplementation(async () => {
      callCount++;
      if (callCount < 2) {
        throw new HttpError('Too Many Requests', 429);
      }
      return [{ url: 'https://example.com', title: 'Test', provider: 'hooktest' }];
    });

    const results = await provider.search({ query: 'test', retries: 2, timeout: 5000 });
    expect(results).toHaveLength(1);
    expect(callCount).toBe(2);
  });

  it('honors maxRetryAfterSeconds override from query options', async () => {
    const provider = new HookTestProvider({});
    let callCount = 0;
    provider.searchImpl.mockImplementation(async () => {
      callCount++;
      if (callCount < 2) {
        throw new HttpError(
          'Too Many Requests',
          429,
          rateLimitResponse(429, { 'retry-after': '2' })
        );
      }
      return [{ url: 'https://example.com', title: 'Test', provider: 'hooktest' }];
    });

    const results = await provider.search({
      query: 'test',
      retries: 2,
      timeout: 5000,
      maxRetryAfterSeconds: 10,
    });
    expect(results).toHaveLength(1);
    expect(callCount).toBe(2);
  });
});

describe('AbstractSearchProvider strict date & freshness filtering', () => {
  it('clears unparseable publishedDate values to undefined', async () => {
    const provider = new HookTestProvider({});
    provider.searchImpl.mockResolvedValue([
      {
        url: 'https://example.com',
        title: 'Bad date',
        publishedDate: 'not-a-date',
        provider: 'hooktest',
      },
      {
        url: 'https://example.com/2',
        title: 'Good date',
        publishedDate: '2026-01-15T10:00:00Z',
        provider: 'hooktest',
      },
    ]);

    const results = await provider.search({ query: 'test', retries: 0 });

    expect(results[0].publishedDate).toBeUndefined();
    expect(results[1].publishedDate).toBe('2026-01-15T10:00:00.000Z');
  });

  it('filters stale results when freshness is set', async () => {
    const provider = new HookTestProvider({});
    const now = Date.now();
    provider.searchImpl.mockResolvedValue([
      {
        url: 'https://fresh.com',
        title: 'Fresh',
        publishedDate: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        provider: 'hooktest',
      },
      {
        url: 'https://stale.com',
        title: 'Stale',
        publishedDate: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
        provider: 'hooktest',
      },
      {
        url: 'https://nodate.com',
        title: 'No date',
        provider: 'hooktest',
      },
    ]);

    const results = await provider.search({ query: 'test', retries: 0, freshness: 'day' });

    expect(results.map((r) => r.url)).toEqual(['https://fresh.com', 'https://nodate.com']);
  });

  it('applies recencyFilter as a fallback freshness window', async () => {
    const provider = new HookTestProvider({});
    const now = Date.now();
    provider.searchImpl.mockResolvedValue([
      {
        url: 'https://stale.com',
        title: 'Stale',
        publishedDate: new Date(now - 400 * 24 * 60 * 60 * 1000).toISOString(),
        provider: 'hooktest',
      },
    ]);

    const results = await provider.search({ query: 'test', retries: 0, recencyFilter: 'year' });

    expect(results).toHaveLength(0);
  });

  it('does not filter when freshness is unset', async () => {
    const provider = new HookTestProvider({});
    const now = Date.now();
    provider.searchImpl.mockResolvedValue([
      {
        url: 'https://ancient.com',
        title: 'Ancient',
        publishedDate: new Date(now - 4000 * 24 * 60 * 60 * 1000).toISOString(),
        provider: 'hooktest',
      },
    ]);

    const results = await provider.search({ query: 'test', retries: 0 });

    expect(results).toHaveLength(1);
  });
});

describe('webSearch hook deduplication with AbstractSearchProvider', () => {
  it('fires lifecycle hooks exactly once per provider', async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const onError = vi.fn();

    const good = new HookTestProvider({});
    good.searchImpl.mockResolvedValue([
      { url: 'https://good.com', title: 'Good', provider: 'hooktest' },
    ]);
    const bad = new HookTestProvider({});
    bad.searchImpl.mockRejectedValue(new HttpError('Bad Request', 400));

    const { webSearch } = await import('../index');
    await webSearch({
      provider: [good, bad],
      query: 'test',
      hooks: { onRequest, onResponse, onError },
    });

    expect(onRequest).toHaveBeenCalledTimes(2);
    expect(onResponse).toHaveBeenCalledTimes(1);
    expect(onResponse).toHaveBeenCalledWith('hooktest', 1, expect.any(Number), undefined);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('hooktest', expect.any(Error));
  });
});
