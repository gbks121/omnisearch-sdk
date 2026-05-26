import { describe, it, expect, vi } from 'vitest';
import { ok, err } from 'neverthrow';
import { webSearch } from '../index';
import type { SearchProvider, SearchResult } from '../types';
import { HttpError } from '../utils/http';

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
        return Promise.resolve(err(errorToThrow || new Error(`${name} failed`)));
      }
      return Promise.resolve(ok(results));
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
    const badProvider = makeProvider('google', [], true, new Error("Search with provider 'google' failed"));
    await expect(webSearch({ provider: [badProvider], query: 'test' })).rejects.toThrow(
      "Search with provider 'google' failed"
    );
  });

  it('passes searchOptions to providers (minus provider and debug fields)', async () => {
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

  it('passes debug options to provider.search', async () => {
    const provider = makeProvider('google', sampleResults);
    const debugOptions = { enabled: true };
    await webSearch({
      provider: [provider],
      query: 'test',
      debug: debugOptions,
    });
    expect(provider.search).toHaveBeenCalledWith(expect.objectContaining({ debug: debugOptions }));
  });

  it('logs with debug enabled', async () => {
    const customLogger = vi.fn();
    const provider = makeProvider('google', sampleResults);
    await webSearch({
      provider: [provider],
      query: 'test',
      debug: { enabled: true, logger: customLogger },
    });
    expect(customLogger).toHaveBeenCalled();
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
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain('google error');
      expect(message).toContain('brave error');
    }
  });
});
