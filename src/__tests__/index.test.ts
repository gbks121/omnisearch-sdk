import { describe, it, expect, vi } from 'vitest';
import { webSearch } from '../index';
import type { SearchProvider, SearchResult } from '../types';

function makeProvider(
  name: string,
  results: SearchResult[],
  shouldFail = false,
  errorToThrow?: Error
): SearchProvider {
  return {
    name,
    config: { apiKey: 'test-key' },
    search: vi.fn().mockImplementation(() => {
      if (shouldFail) {
        return Promise.reject(errorToThrow || new Error(`${name} failed`));
      }
      return Promise.resolve(results);
    }),
  } as unknown as SearchProvider;
}

const sampleResults: SearchResult[] = [
  { url: 'https://example.com', title: 'Example', provider: 'test' },
  { url: 'https://example.org', title: 'Example Org', provider: 'test' },
];

describe('webSearch', () => {
  it('throws if no provider is provided', async () => {
    await expect(webSearch({ provider: [], query: 'test' })).rejects.toThrow(
      'At least one search provider is required'
    );
  });

  it('returns empty array if providers return empty', async () => {
    const provider = makeProvider('google', []);
    const results = await webSearch({ provider: [provider], query: 'test' });
    expect(results).toEqual([]);
  });

  it('allows search without query if arxiv provider with idList', async () => {
    const arxivProvider = makeProvider('arxiv', sampleResults);
    const results = await webSearch({
      provider: [arxivProvider],
      idList: '2305.02392',
    });
    expect(results).toEqual(sampleResults);
  });

  it('returns results from a single provider', async () => {
    const provider = makeProvider('google', sampleResults);
    const results = await webSearch({ provider: [provider], query: 'test' });
    expect(results).toEqual(sampleResults);
    expect(provider.search).toHaveBeenCalledWith(expect.objectContaining({ query: 'test' }));
  });

  it('aggregates results from multiple providers', async () => {
    const results1: SearchResult[] = [{ url: 'https://a.com', title: 'A', provider: 'google' }];
    const results2: SearchResult[] = [{ url: 'https://b.com', title: 'B', provider: 'brave' }];
    const provider1 = makeProvider('google', results1);
    const provider2 = makeProvider('brave', results2);

    const results = await webSearch({ provider: [provider1, provider2], query: 'test' });
    expect(results).toHaveLength(2);
    expect(results).toContainEqual(results1[0]);
    expect(results).toContainEqual(results2[0]);
  });

  it('continues if one provider fails (fail-soft)', async () => {
    const goodResults: SearchResult[] = [
      { url: 'https://good.com', title: 'Good', provider: 'google' },
    ];
    const goodProvider = makeProvider('google', goodResults);
    const badProvider = makeProvider('brave', [], true);

    const results = await webSearch({ provider: [goodProvider, badProvider], query: 'test' });
    expect(results).toEqual(goodResults);
  });

  it('throws if ALL providers fail', async () => {
    const provider1 = makeProvider('google', [], true);
    const provider2 = makeProvider('brave', [], true);

    await expect(webSearch({ provider: [provider1, provider2], query: 'test' })).rejects.toThrow(
      'All 2 provider(s) failed'
    );
  });

  it('includes provider name in error message when provider fails', async () => {
    const badProvider = makeProvider(
      'google',
      [],
      true,
      new Error("Search with provider 'google' failed")
    );
    await expect(webSearch({ provider: [badProvider], query: 'test' })).rejects.toThrow(
      "Search with provider 'google' failed"
    );
  });

  it('passes searchOptions to providers (minus provider and hooks fields)', async () => {
    const provider = makeProvider('google', sampleResults);
    await webSearch({
      provider: [provider],
      query: 'test',
      maxResults: 5,
      language: 'en',
    });

    expect(provider.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'test',
        maxResults: 5,
        language: 'en',
      })
    );
  });

  it('does not pass hooks to provider.search', async () => {
    const provider = makeProvider('google', sampleResults);
    const hooks = { onRequest: vi.fn(), onResponse: vi.fn(), onError: vi.fn() };
    await webSearch({
      provider: [provider],
      query: 'test',
      hooks,
    });
    expect(provider.search).toHaveBeenCalledWith(expect.not.objectContaining({ hooks }));
  });

  it('calls onRequest and onResponse hooks for successful providers', async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const onError = vi.fn();
    const provider = makeProvider('google', sampleResults);
    await webSearch({
      provider: [provider],
      query: 'test',
      hooks: { onRequest, onResponse, onError },
    });
    expect(onRequest).toHaveBeenCalledWith('google', 'test');
    expect(onResponse).toHaveBeenCalledWith('google', 2, expect.any(Number));
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError hook for failed providers', async () => {
    const onRequest = vi.fn();
    const onResponse = vi.fn();
    const onError = vi.fn();
    const goodProvider = makeProvider('google', sampleResults);
    const badProvider = makeProvider('brave', [], true);
    await webSearch({
      provider: [goodProvider, badProvider],
      query: 'test',
      hooks: { onRequest, onResponse, onError },
    });
    expect(onError).toHaveBeenCalledWith('brave', expect.any(Error));
  });

  it('returns empty array when provider returns empty results', async () => {
    const provider = makeProvider('google', []);
    const results = await webSearch({ provider: [provider], query: 'test' });
    expect(results).toEqual([]);
  });

  it('includes all error messages when all providers fail', async () => {
    const p1 = makeProvider('google', [], true, new Error('google error'));
    const p2 = makeProvider('brave', [], true, new Error('brave error'));

    try {
      await webSearch({ provider: [p1, p2], query: 'test' });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      expect((error as Error).message).toContain('google error');
      expect((error as Error).message).toContain('brave error');
    }
  });
});
