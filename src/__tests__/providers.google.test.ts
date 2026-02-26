import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createGoogleProvider, google } from '../providers/google';
import { HttpError } from '../utils/http';

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

function mockFetchError(status: number, body: unknown, statusText: string): void {
  const bodyStr = JSON.stringify(body);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      statusText,
      json: vi.fn().mockResolvedValue(body),
      text: vi.fn().mockResolvedValue(bodyStr),
      clone: vi.fn().mockReturnValue({ text: vi.fn().mockResolvedValue(bodyStr) }),
    })
  );
}

const sampleGoogleResponse = {
  kind: 'customsearch#search',
  url: { type: 'application/json', template: '' },
  queries: {
    request: [
      {
        totalResults: '100',
        searchTerms: 'test',
        count: 2,
        startIndex: 1,
        inputEncoding: 'utf8',
        outputEncoding: 'utf8',
        safe: 'off',
        cx: 'test-cx',
      },
    ],
  },
  context: { title: 'Test' },
  searchInformation: {
    searchTime: 0.5,
    formattedSearchTime: '0.5',
    totalResults: '100',
    formattedTotalResults: '100',
  },
  items: [
    {
      kind: 'customsearch#result',
      title: 'Test Page',
      htmlTitle: 'Test Page',
      link: 'https://example.com',
      displayLink: 'example.com',
      snippet: 'Test snippet',
      htmlSnippet: 'Test snippet',
      formattedUrl: 'https://example.com',
      htmlFormattedUrl: 'https://example.com',
      pagemap: {
        metatags: [{ 'article:published_time': '2024-01-01T00:00:00Z' }],
      },
    },
    {
      kind: 'customsearch#result',
      title: 'Another Page',
      htmlTitle: 'Another Page',
      link: 'https://another.com',
      displayLink: 'another.com',
      snippet: 'Another snippet',
      htmlSnippet: 'Another snippet',
      formattedUrl: 'https://another.com',
      htmlFormattedUrl: 'https://another.com',
    },
  ],
};

describe('createGoogleProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws if no apiKey is provided', () => {
    expect(() => createGoogleProvider({ apiKey: '', cx: 'test-cx' })).toThrow(
      'Google Custom Search requires an API key'
    );
  });

  it('throws if no cx is provided', () => {
    expect(() => createGoogleProvider({ apiKey: 'test-key', cx: '' })).toThrow(
      'Google Custom Search requires a Search Engine ID (cx)'
    );
  });

  it('creates a provider with name "google"', () => {
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    expect(provider.name).toBe('google');
    expect(provider.config.apiKey).toBe('test-key');
  });

  it('returns search results correctly', async () => {
    mockFetch(200, sampleGoogleResponse);
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(2);
    expect(results[0].url).toBe('https://example.com');
    expect(results[0].title).toBe('Test Page');
    expect(results[0].snippet).toBe('Test snippet');
    expect(results[0].domain).toBe('example.com');
    expect(results[0].publishedDate).toBe('2024-01-01T00:00:00Z');
    expect(results[0].provider).toBe('google');
  });

  it('extracts publishedDate from "date" metatag', async () => {
    const response = {
      ...sampleGoogleResponse,
      items: [
        {
          ...sampleGoogleResponse.items[0],
          pagemap: { metatags: [{ date: '2024-06-01' }] },
        },
      ],
    };
    mockFetch(200, response);
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    const results = await provider.search({ query: 'test' });
    expect(results[0].publishedDate).toBe('2024-06-01');
  });

  it('extracts publishedDate from "og:updated_time" metatag', async () => {
    const response = {
      ...sampleGoogleResponse,
      items: [
        {
          ...sampleGoogleResponse.items[0],
          pagemap: { metatags: [{ 'og:updated_time': '2024-06-15' }] },
        },
      ],
    };
    mockFetch(200, response);
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    const results = await provider.search({ query: 'test' });
    expect(results[0].publishedDate).toBe('2024-06-15');
  });

  it('returns empty array when no items in response', async () => {
    mockFetch(200, { ...sampleGoogleResponse, items: [] });
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('returns empty array when items is undefined', async () => {
    const { items: _items, ...responseWithoutItems } = sampleGoogleResponse;
    mockFetch(200, responseWithoutItems);
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('applies language parameter', async () => {
    mockFetch(200, sampleGoogleResponse);
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await provider.search({ query: 'test', language: 'en' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('lr=lang_en');
  });

  it('applies region parameter', async () => {
    mockFetch(200, sampleGoogleResponse);
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await provider.search({ query: 'test', region: 'us' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('gl=us');
  });

  it('applies safeSearch off parameter', async () => {
    mockFetch(200, sampleGoogleResponse);
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await provider.search({ query: 'test', safeSearch: 'off' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safe=off');
  });

  it('applies safeSearch strict parameter as active', async () => {
    mockFetch(200, sampleGoogleResponse);
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await provider.search({ query: 'test', safeSearch: 'strict' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safe=active');
  });

  it('limits maxResults to 10', async () => {
    mockFetch(200, sampleGoogleResponse);
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await provider.search({ query: 'test', maxResults: 20 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('num=10');
  });

  it('calculates pagination start correctly for page 2', async () => {
    mockFetch(200, sampleGoogleResponse);
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await provider.search({ query: 'test', page: 2, maxResults: 10 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('start=11');
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch(200, sampleGoogleResponse);
    const provider = createGoogleProvider({
      apiKey: 'test-key',
      cx: 'test-cx',
      baseUrl: 'https://custom.example.com/search',
    });
    await provider.search({ query: 'test' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('custom.example.com');
  });

  it('throws on 400 error', async () => {
    mockFetchError(400, { message: 'Bad request' }, 'Bad Request');
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Google search failed');
  });

  it('throws with diagnostic info on 403 with API key not valid', async () => {
    mockFetchError(403, { error: { message: 'API key not valid' } }, 'Forbidden');
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('invalid');
  });

  it('throws with diagnostic info on 403 with has not been used', async () => {
    mockFetchError(403, { error: { message: 'has not been used in project' } }, 'Forbidden');
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Custom Search API');
  });

  it('throws with diagnostic info on 403 with dailyLimit', async () => {
    mockFetchError(403, { error: { message: 'dailyLimit exceeded' } }, 'Forbidden');
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('daily quota');
  });

  it('throws with diagnostic info on 403 with userRateLimitExceeded', async () => {
    mockFetchError(403, { error: { message: 'userRateLimitExceeded' } }, 'Forbidden');
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('rate limiting');
  });

  it('throws with generic 403 message', async () => {
    mockFetchError(403, { error: { message: 'Access denied' } }, 'Forbidden');
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Authorization failed');
  });

  it('handles 400 with Invalid Value in message', async () => {
    mockFetchError(400, { message: 'Invalid Value for parameter' }, 'Bad Request');
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('invalid');
  });

  it('wraps generic Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'Google search failed: Network error'
    );
  });

  it('wraps non-Error throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const provider = createGoogleProvider({ apiKey: 'test-key', cx: 'test-cx' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'Google search failed: string error'
    );
  });
});

describe('google singleton', () => {
  it('has correct name', () => {
    expect(google.name).toBe('google');
  });

  it('throws when search is called without configure', async () => {
    await expect(google.search({ query: 'test' })).rejects.toThrow(
      'Google provider must be configured before use'
    );
  });

  it('configure returns a working provider', () => {
    const provider = google.configure({ apiKey: 'test-key', cx: 'test-cx' });
    expect(provider.name).toBe('google');
    expect(provider.config.apiKey).toBe('test-key');
  });
});
