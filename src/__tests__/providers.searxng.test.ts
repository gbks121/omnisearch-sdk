import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSearXNGProvider, searxng } from '../providers/searxng';

function mockFetch(status: number, body: unknown, statusText = 'OK'): void {
  const bodyStr = JSON.stringify(body);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      headers: new Map([['content-type', 'application/json']]),
      json: vi.fn().mockResolvedValue(body),
      text: vi.fn().mockResolvedValue(bodyStr),
      clone: vi.fn().mockReturnValue({ text: vi.fn().mockResolvedValue(bodyStr) }),
    })
  );
}

const sampleSearXNGResponse = {
  query: 'test',
  number_of_results: 2,
  results: [
    {
      url: 'https://example.com/result',
      title: 'SearXNG Result',
      content: 'SearXNG content snippet',
      publishedDate: '2024-01-01',
      engine: 'google',
    },
    {
      url: 'https://another.com/page',
      title: 'Another Result',
      content: 'Another content',
      publishedDate: null,
    },
  ],
};

describe('createSearXNGProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws if no baseUrl is provided', () => {
    expect(() => createSearXNGProvider({ baseUrl: '' })).toThrow('SearXNG requires a base URL');
  });

  it('creates a provider with name "searxng"', () => {
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    expect(provider.name).toBe('searxng');
  });

  it('returns error if query is empty or whitespace', async () => {
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result1 = await provider.search({ query: '', retries: 0 });
    expect(result1.isErr()).toBe(true);
    if (result1.isErr()) {
      expect(result1.error.message).toContain('SearXNG search failed');
      expect(result1.error.message).toContain('requires a query');
    }

    const result2 = await provider.search({ query: '  ', retries: 0 });
    expect(result2.isErr()).toBe(true);
    if (result2.isErr()) {
      expect(result2.error.message).toContain('SearXNG search failed');
      expect(result2.error.message).toContain('requires a query');
    }
  });

  it('returns search results correctly', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const results = result.value;
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('https://example.com/result');
      expect(results[0].title).toBe('SearXNG Result');
      expect(results[0].snippet).toBe('SearXNG content snippet');
      expect(results[0].domain).toBe('example.com');
      expect(results[0].publishedDate).toBe('2024-01-01');
      expect(results[0].provider).toBe('searxng');
    }
  });

  it('handles null publishedDate', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[1].publishedDate).toBeUndefined();
    }
  });

  it('returns empty array when no results', async () => {
    mockFetch(200, { ...sampleSearXNGResponse, results: [] });
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it('applies language parameter', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', language: 'de', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('language=de');
  });

  it('applies safeSearch off (0)', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', safeSearch: 'off', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=0');
  });

  it('applies safeSearch moderate (1)', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', safeSearch: 'moderate', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=1');
  });

  it('applies safeSearch strict (2)', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', safeSearch: 'strict', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=2');
  });

  it('appends additional params', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({
      baseUrl: 'https://searxng.example.com/search',
      additionalParams: { categories: 'news', engines: 'google,bing' },
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('categories=news');
    expect(url).toContain('engines=google%2Cbing');
  });

  it('appends api_key when provided', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({
      baseUrl: 'https://searxng.example.com/search',
      apiKey: 'secret-key',
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('api_key=secret-key');
  });

  it('handles invalid URL in result gracefully', async () => {
    const response = {
      ...sampleSearXNGResponse,
      results: [{ url: 'not-a-url', title: 'Test', content: 'Content', publishedDate: null }],
    };
    mockFetch(200, response);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].domain).toBeUndefined();
    }
  });

  it('returns detailed error on 401/403', async () => {
    mockFetch(401, { message: 'Unauthorized' }, 'Unauthorized');
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('SearXNG search failed');
      expect(result.error.message).toContain('401');
    }
  });

  it('returns detailed error on 429', async () => {
    mockFetch(429, { message: 'Too Many Requests' }, 'Too Many Requests');
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('SearXNG search failed');
      expect(result.error.message).toContain('429');
    }
  });

  it('returns detailed error on 404', async () => {
    mockFetch(404, { message: 'Not Found' }, 'Not Found');
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('SearXNG search failed');
      expect(result.error.message).toContain('404');
    }
  });

  it('returns detailed error on 400', async () => {
    mockFetch(400, { message: 'Bad Request' }, 'Bad Request');
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('SearXNG search failed');
      expect(result.error.message).toContain('400');
    }
  });

  it('returns detailed error on 500+', async () => {
    mockFetch(500, { message: 'Server Error' }, 'Internal Server Error');
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('SearXNG search failed');
      expect(result.error.message).toContain('500');
    }
  });

  it('handles ECONNREFUSED error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('SearXNG search failed');
      expect(result.error.message).toContain('ECONNREFUSED');
    }
  });

  it('handles ENOTFOUND error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('SearXNG search failed');
      expect(result.error.message).toContain('ENOTFOUND');
    }
  });

  it('handles timeout error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Request timeout')));
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('SearXNG search failed');
      expect(result.error.message).toContain('timeout');
    }
  });

  it('wraps non-Error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('SearXNG search failed');
      expect(result.error.message).toContain('string error');
    }
  });
});

describe('searxng singleton', () => {
  it('has correct name', () => {
    expect(searxng.name).toBe('searxng');
  });

  it('returns error when search is called without configure', async () => {
    const result = await searxng.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('SearXNG provider must be configured before use');
    }
  });

  it('configure returns a working provider', () => {
    const provider = searxng.configure({ baseUrl: 'https://searxng.example.com/search' });
    expect(provider.name).toBe('searxng');
  });
});
