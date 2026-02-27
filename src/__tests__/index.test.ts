import { describe, it, expect, vi } from 'vitest';
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
    search: shouldFail
      ? vi.fn().mockRejectedValue(errorToThrow || new Error(`${name} failed`))
      : vi.fn().mockResolvedValue(results),
  };
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

  it('throws if no query and no arxiv idList is provided', async () => {
    const provider = makeProvider('google', []);
    await expect(webSearch({ provider: [provider] })).rejects.toThrow(
      'A search query or ID list (for Arxiv) is required'
    );
  });

  it('throws if query is only whitespace', async () => {
    const provider = makeProvider('google', []);
    await expect(webSearch({ provider: [provider], query: '   ' })).rejects.toThrow(
      'A search query or ID list (for Arxiv) is required'
    );
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
    const badProvider = makeProvider('google', [], true);
    await expect(webSearch({ provider: [badProvider], query: 'test' })).rejects.toThrow(
      "Search with provider 'google' failed"
    );
  });

  it('includes troubleshooting info in error when HttpError occurs', async () => {
    const httpError = new HttpError('Unauthorized', 401);
    const provider = makeProvider('google', [], true, httpError);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      'Troubleshooting:'
    );
  });

  it('handles HttpError with 403 status', async () => {
    const httpError = new HttpError('Forbidden', 403);
    const provider = makeProvider('google', [], true, httpError);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      'authentication issue'
    );
  });

  it('handles HttpError with 400 status', async () => {
    const httpError = new HttpError('Bad Request', 400);
    const provider = makeProvider('serpapi', [], true, httpError);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      'invalid request parameters'
    );
  });

  it('handles HttpError with 429 status', async () => {
    const httpError = new HttpError('Rate Limited', 429);
    const provider = makeProvider('brave', [], true, httpError);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow('rate limit');
  });

  it('handles HttpError with 500+ status', async () => {
    const httpError = new HttpError('Server Error', 503);
    const provider = makeProvider('exa', [], true, httpError);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      'server issues'
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

  it('handles provider throwing a non-Error value', async () => {
    const provider: SearchProvider = {
      name: 'weird',
      config: { apiKey: '' },
      search: vi.fn().mockRejectedValue('string error'),
    };

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      "Search with provider 'weird' failed: string error"
    );
  });

  it('includes [object Object] debug hint in error message when applicable', async () => {
    const errorWithObjectMessage = new Error('[object Object]');
    const provider = makeProvider('google', [], true, errorWithObjectMessage);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow('debug mode');
  });

  it('provides google-specific troubleshooting for API key errors', async () => {
    const error = new Error('Invalid API key provided');
    const provider = makeProvider('google', [], true, error);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      'Google API key'
    );
  });

  it('provides google-specific troubleshooting for quota errors', async () => {
    const error = new Error('quota exceeded');
    const provider = makeProvider('google', [], true, error);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow('quota');
  });

  it('provides serpapi-specific troubleshooting for apiKey error', async () => {
    const error = new Error('apiKey is missing');
    const provider = makeProvider('serpapi', [], true, error);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow('SerpAPI');
  });

  it('provides brave-specific troubleshooting for token error', async () => {
    const error = new Error('Invalid token');
    const provider = makeProvider('brave', [], true, error);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      'Brave Search API token'
    );
  });

  it('provides searxng-specific troubleshooting for not found error', async () => {
    const httpError = new HttpError('Not Found', 404);
    const provider = makeProvider('searxng', [], true, httpError);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      'SearXNG instance URL'
    );
  });

  it('provides duckduckgo-specific troubleshooting for vqd error', async () => {
    const error = new Error('Failed to extract vqd parameter');
    const provider = makeProvider('duckduckgo', [], true, error);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow('vqd');
  });

  it('provides duckduckgo-specific troubleshooting for rate limit', async () => {
    const httpError = new HttpError('Too Many Requests', 429);
    const provider = makeProvider('duckduckgo', [], true, httpError);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      'too many requests'
    );
  });

  it('provides perplexity-specific troubleshooting for api_key error', async () => {
    const error = new Error('Invalid api_key');
    const provider = makeProvider('perplexity', [], true, error);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      'Perplexity API key'
    );
  });

  it('provides perplexity-specific troubleshooting for 429', async () => {
    const httpError = new HttpError('Rate Limited', 429);
    const provider = makeProvider('perplexity', [], true, httpError);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow('Perplexity');
  });

  it('provides perplexity-specific troubleshooting for 400', async () => {
    const httpError = new HttpError('Bad Request', 400);
    const provider = makeProvider('perplexity', [], true, httpError);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow('Perplexity');
  });

  it('provides generic troubleshooting for unknown provider', async () => {
    const error = new Error('Some error');
    const provider = makeProvider('unknownprovider', [], true, error);

    await expect(webSearch({ provider: [provider], query: 'test' })).rejects.toThrow(
      'unknownprovider'
    );
  });

  it('includes all error messages when all providers fail', async () => {
    const p1 = makeProvider('google', [], true, new Error('google error'));
    const p2 = makeProvider('brave', [], true, new Error('brave error'));

    try {
      await webSearch({ provider: [p1, p2], query: 'test' });
    } catch (e) {
      const message = (e as Error).message;
      expect(message).toContain('google');
      expect(message).toContain('brave');
    }
  });
});
