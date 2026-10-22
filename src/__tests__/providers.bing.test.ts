import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBingProvider } from '../providers/bing';

function mockFetch(status: number, body: unknown, statusText = 'OK'): void {
  const bodyStr = JSON.stringify(body);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      json: vi.fn().mockResolvedValue(body),
      text: vi.fn().mockResolvedValue(bodyStr),
      clone: vi.fn().mockReturnValue({ text: vi.fn().mockResolvedValue(bodyStr) }),
    })
  );
}

describe('createBingProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should throw if apiKey is missing', () => {
    expect(() => createBingProvider({ apiKey: '' })).toThrow('Bing Search requires an API key');
  });

  it('should successfully search web results', async () => {
    const mockResponse = {
      webPages: {
        totalEstimatedMatches: 100,
        value: [
          {
            name: 'Bing Example',
            url: 'https://bing.com/article',
            snippet: 'Bing snippet',
            datePublished: '2026-03-01T00:00:00Z',
          },
        ],
      },
    };
    mockFetch(200, mockResponse);

    const provider = createBingProvider({ apiKey: 'test-bing-key' });
    const results = await provider.search({ query: 'hello world' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Bing Example');
    expect(results[0].url).toBe('https://bing.com/article');
    expect(results[0].provider).toBe('bing');
  });

  it('should search news results when searchType is news', async () => {
    const mockNewsResponse = {
      news: {
        value: [
          {
            name: 'Breaking News',
            url: 'https://news.bing.com/top',
            description: 'News description',
            datePublished: '2026-03-02T10:00:00Z',
          },
        ],
      },
    };
    mockFetch(200, mockNewsResponse);

    const provider = createBingProvider({ apiKey: 'test-bing-key', searchType: 'news' });
    const results = await provider.search({ query: 'breaking news' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Breaking News');
    expect(results[0].snippet).toBe('News description');
  });

  it('should throw ProviderApiError on 401 error', async () => {
    mockFetch(401, { error: { message: 'Invalid subscription key' } }, 'Unauthorized');

    const provider = createBingProvider({ apiKey: 'bad-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Authentication failed');
  });

  it('should pass options like market, language, safeSearch, and freshness', async () => {
    mockFetch(200, { webPages: { value: [] } });

    const provider = createBingProvider({ apiKey: 'key', market: 'en-US' });
    const results = await provider.search({
      query: 'test',
      language: 'en',
      safeSearch: 'strict',
      freshness: 'day',
      page: 2,
    });

    expect(results).toEqual([]);
  });

  it('should format troubleshooting on 429 and 500 errors', async () => {
    mockFetch(429, { message: 'Rate limit' }, 'Too Many Requests');
    const provider = createBingProvider({ apiKey: 'key' });
    await expect(provider.search({ query: 'test', retries: 0 })).rejects.toThrow(
      'rate limit exceeded'
    );

    mockFetch(500, { message: 'Server error' }, 'Internal Server Error');
    await expect(provider.search({ query: 'test', retries: 0 })).rejects.toThrow(
      'Bing search service is currently experiencing upstream issues'
    );
  });
});
