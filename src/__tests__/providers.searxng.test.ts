import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSearXNGProvider } from '../providers/searxng';

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

  it('throws if query is empty or whitespace', async () => {
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });

    try {
      await provider.search({ query: '', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('requires a query');
    }

    try {
      await provider.search({ query: '  ', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('requires a query');
    }
  });

  it('returns search results correctly', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const results = await provider.search({ query: 'test', retries: 0 });

    expect(results).toHaveLength(2);
    expect(results[0].url).toBe('https://example.com/result');
    expect(results[0].title).toBe('SearXNG Result');
    expect(results[0].snippet).toBe('SearXNG content snippet');
    expect(results[0].domain).toBe('example.com');
    expect(results[0].publishedDate).toBe('2024-01-01');
    expect(results[0].provider).toBe('searxng');
  });

  it('handles null publishedDate', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const results = await provider.search({ query: 'test', retries: 0 });
    expect(results[1].publishedDate).toBeUndefined();
  });

  it('returns empty array when no results', async () => {
    mockFetch(200, { ...sampleSearXNGResponse, results: [] });
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const results = await provider.search({ query: 'test', retries: 0 });
    expect(results).toEqual([]);
  });

  it('applies language parameter', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await provider.search({ query: 'test', language: 'de', retries: 0 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('language=de');
  });

  it('applies safeSearch off (0)', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await provider.search({ query: 'test', safeSearch: 'off', retries: 0 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=0');
  });

  it('applies safeSearch moderate (1)', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await provider.search({ query: 'test', safeSearch: 'moderate', retries: 0 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=1');
  });

  it('applies safeSearch strict (2)', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await provider.search({ query: 'test', safeSearch: 'strict', retries: 0 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=2');
  });

  it('appends additional params', async () => {
    mockFetch(200, sampleSearXNGResponse);
    const provider = createSearXNGProvider({
      baseUrl: 'https://searxng.example.com/search',
      additionalParams: { categories: 'news', engines: 'google,bing' },
    });
    await provider.search({ query: 'test', retries: 0 });
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
    await provider.search({ query: 'test', retries: 0 });
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
    const results = await provider.search({ query: 'test', retries: 0 });
    expect(results).toEqual([]);
  });

  it('throws detailed error on 401/403', async () => {
    mockFetch(401, { message: 'Unauthorized' }, 'Unauthorized');
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('401');
    }
  });

  it('throws detailed error on 429', async () => {
    mockFetch(429, { message: 'Too Many Requests' }, 'Too Many Requests');
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('429');
    }
  });

  it('throws detailed error on 404', async () => {
    mockFetch(404, { message: 'Not Found' }, 'Not Found');
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('404');
    }
  });

  it('throws detailed error on 400', async () => {
    mockFetch(400, { message: 'Bad Request' }, 'Bad Request');
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('400');
    }
  });

  it('throws detailed error on 500+', async () => {
    mockFetch(500, { message: 'Server Error' }, 'Internal Server Error');
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('500');
    }
  });

  it('handles ECONNREFUSED error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('ECONNREFUSED');
    }
  });

  it('handles ENOTFOUND error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('ENOTFOUND');
    }
  });

  it('handles timeout error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Request timeout')));
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('timeout');
    }
  });

  it('wraps non-Error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const provider = createSearXNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    try {
      await provider.search({ query: 'test', retries: 0 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('SearXNG search failed');
      expect((error as Error).message).toContain('string error');
    }
  });
});
