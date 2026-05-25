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
    const result = await provider.search({ query: 'test', retries: 0 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const results = result.value;
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://example.com/page');
      expect(results[0].title).toBe('Test Page');
      expect(results[0].snippet).toBe('Test description');
      expect(results[0].domain).toBe('example.com');
      expect(results[0].publishedDate).toBe('2024-01-01');
      expect(results[0].provider).toBe('brave');
    }
  });

  it('returns news search results when searchType is news', async () => {
    mockFetch(200, sampleBraveNewsResponse);
    const provider = createBraveProvider({ apiKey: 'test-key', searchType: 'news' });
    const result = await provider.search({ query: 'test news', retries: 0 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const results = result.value;
      expect(results).toHaveLength(1);
      expect(results[0].url).toBe('https://news.example.com/article');
      expect(results[0].title).toBe('Breaking News');
    }
  });

  it('returns error if no query is provided', async () => {
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Brave search failed: Brave search requires a query');
    }
  });

  it('returns empty array when no results', async () => {
    mockFetch(200, { ...sampleBraveWebResponse, web: { type: 'search', results: [] } });
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
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
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].domain).toBeUndefined();
    }
  });

  it('applies language parameter', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', language: 'fr', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('search_lang=fr');
  });

  it('applies region parameter', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', region: 'US', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('country=US');
  });

  it('applies safeSearch parameter', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', safeSearch: 'strict', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=strict');
  });

  it('applies pagination offset for page 2', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', page: 2, maxResults: 10, retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('offset=10');
  });

  it('does not append offset=0 for page 1', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', page: 1, retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).not.toContain('offset=');
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({
      apiKey: 'test-key',
      baseUrl: 'https://custom-brave.example.com/search',
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('custom-brave.example.com');
  });

  it('sends X-Subscription-Token header', async () => {
    mockFetch(200, sampleBraveWebResponse);
    const provider = createBraveProvider({ apiKey: 'my-brave-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.headers['X-Subscription-Token']).toBe('my-brave-key');
  });

  it('returns detailed error on 401', async () => {
    mockFetch(401, { message: 'Unauthorized' }, 'Unauthorized');
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Brave search failed');
      expect(result.error.message).toContain('401');
    }
  });

  it('returns detailed error on 403', async () => {
    mockFetch(403, { message: 'Forbidden' }, 'Forbidden');
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Brave search failed');
      expect(result.error.message).toContain('403');
    }
  });

  it('returns detailed error on 429', async () => {
    mockFetch(429, { message: 'Rate Limited' }, 'Too Many Requests');
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Brave');
      expect(result.error.message).toContain('429');
    }
  });

  it('returns detailed error on 400', async () => {
    mockFetch(400, { message: 'Bad Request' }, 'Bad Request');
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Brave');
      expect(result.error.message).toContain('400');
    }
  });

  it('returns detailed error on 500+', async () => {
    mockFetch(503, { message: 'Service Unavailable' }, 'Service Unavailable');
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Brave');
      expect(result.error.message).toContain('503');
    }
  });

  it('returns error on generic Error with token/key mention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Invalid token')));
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Brave search failed: Invalid token');
      expect(result.error.message).toContain('Brave Search API token');
    }
  });

  it('wraps non-Error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Brave search failed: string error');
    }
  });

  it('handles response with no web results (undefined)', async () => {
    mockFetch(200, { type: 'search', query: { original: 'test', show_strict_warning: false } });
    const provider = createBraveProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });
});

describe('brave singleton', () => {
  it('has correct name', () => {
    expect(brave.name).toBe('brave');
  });

  it('returns error when search is called without configure', async () => {
    const result = await brave.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('Brave Search provider must be configured before use');
    }
  });

  it('configure returns a working provider', () => {
    const provider = brave.configure({ apiKey: 'test-key' });
    expect(provider.name).toBe('brave');
  });
});
