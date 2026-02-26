import { describe, it, expect, vi, afterEach } from 'vitest';
import { createBraveProvider, brave } from '../providers/brave';

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

const sampleBraveWebResponse = {
  type: 'search',
  query: { original: 'test', show_strict_warning: false },
  web: {
    type: 'search',
    results: [
      {
        title: 'Test Page',
        url: 'https://example.com/page',
        description: 'Test description',
        is_source_from_meta: false,
        is_source_local: false,
        language: 'en',
        family_friendly: true,
        age: '2024-01-01',
      },
    ],
  },
  count: 1,
};

const sampleBraveNewsResponse = {
  type: 'news',
  query: { original: 'test news', show_strict_warning: false },
  results: [
    {
      title: 'Breaking News',
      url: 'https://news.example.com/article',
      description: 'News description',
      is_source_from_meta: false,
      is_source_local: false,
      language: 'en',
      family_friendly: true,
    },
  ],
  count: 1,
};

describe('createBraveProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws if no apiKey is provided', () => {
    expect(() => createBraveProvider({ apiKey: '' })).toThrow('Brave Search requires an API key');
  });

  it('creates a provider with name "brave"', () => {
    const provider = createBraveProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('brave');
  });

  it('returns web search results', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/page');
    expect(results[0].title).toBe('Test Page');
    expect(results[0].snippet).toBe('Test description');
    expect(results[0].domain).toBe('example.com');
    expect(results[0].publishedDate).toBe('2024-01-01');
    expect(results[0].provider).toBe('brave');
  });

  it('returns news search results when searchType is news', async () => {
    mockFetch(200, sampleBraveNewsResponse);
    const provider = createBraveProvider({ apiKey: 'test-key', searchType: 'news' });
    const results = await provider.search({ query: 'test news' });

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://news.example.com/article');
    expect(results[0].title).toBe('Breaking News');
  });

  it('throws if no query is provided', async () => {
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await expect(provider.search({})).rejects.toThrow('Brave search requires a query');
  });

  it('returns empty array when no results', async () => {
    mockFetch(200, { ...sampleBraveWebResponse, web: { type: 'search', results: [] } });
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('handles URL with invalid hostname gracefully', async () => {
    const response = {
      ...sampleBraveWebResponse,
      web: {
        type: 'search',
        results: [
          {
            ...sampleBraveWebResponse.web.results[0],
            url: 'not-a-valid-url',
          },
        ],
      },
    };
    mockFetch(200, response);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const results = await provider.search({ query: 'test' });
    expect(results[0].domain).toBeUndefined();
  });

  it('applies language parameter', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test', language: 'fr' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('search_lang=fr');
  });

  it('applies region parameter', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test', region: 'US' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('country=US');
  });

  it('applies safeSearch parameter', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test', safeSearch: 'strict' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=strict');
  });

  it('applies pagination offset for page 2', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test', page: 2, maxResults: 10 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('offset=10');
  });

  it('does not append offset=0 for page 1', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test', page: 1 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).not.toContain('offset=');
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({
      apiKey: 'test-key',
      baseUrl: 'https://custom-brave.example.com/search',
    });
    await provider.search({ query: 'test' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('custom-brave.example.com');
  });

  it('sends X-Subscription-Token header', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'my-brave-key' });
    await provider.search({ query: 'test' });
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.headers['X-Subscription-Token']).toBe('my-brave-key');
  });

  it('throws detailed error on 401', async () => {
    mockFetch(401, { message: 'Unauthorized' }, 'Unauthorized');
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Invalid API key');
  });

  it('throws detailed error on 403', async () => {
    mockFetch(403, { message: 'Forbidden' }, 'Forbidden');
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Access denied');
  });

  it('throws detailed error on 429', async () => {
    mockFetch(429, { message: 'Rate Limited' }, 'Too Many Requests');
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Rate limit exceeded');
  });

  it('throws detailed error on 400', async () => {
    mockFetch(400, { message: 'Bad Request' }, 'Bad Request');
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Bad request');
  });

  it('throws detailed error on 500+', async () => {
    mockFetch(503, { message: 'Service Unavailable' }, 'Service Unavailable');
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('server error');
  });

  it('throws on generic Error with token/key mention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Invalid token')));
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'Invalid or missing API token'
    );
  });

  it('wraps non-Error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const provider = createBraveProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'Brave search failed: string error'
    );
  });

  it('handles response with no web results (undefined)', async () => {
    mockFetch(200, { type: 'search', query: { original: 'test', show_strict_warning: false } });
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });
});

describe('brave singleton', () => {
  it('has correct name', () => {
    expect(brave.name).toBe('brave');
  });

  it('throws when search is called without configure', async () => {
    await expect(brave.search({ query: 'test' })).rejects.toThrow(
      'Brave Search provider must be configured before use'
    );
  });

  it('configure returns a working provider', () => {
    const provider = brave.configure({ apiKey: 'test-key' });
    expect(provider.name).toBe('brave');
  });
});
