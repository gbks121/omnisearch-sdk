import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSearxNGProvider, searxng } from '../providers/searxng';

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

const sampleSearxNGResponse = {
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

describe('createSearxNGProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws if no baseUrl is provided', () => {
    expect(() => createSearxNGProvider({ baseUrl: '' })).toThrow('SearXNG requires a base URL');
  });

  it('creates a provider with name "searxng"', () => {
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    expect(provider.name).toBe('searxng');
  });

  it('returns search results correctly', async () => {
    mockFetch(200, sampleSearxNGResponse);
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(2);
    expect(results[0].url).toBe('https://example.com/result');
    expect(results[0].title).toBe('SearXNG Result');
    expect(results[0].snippet).toBe('SearXNG content snippet');
    expect(results[0].domain).toBe('example.com');
    expect(results[0].publishedDate).toBe('2024-01-01');
    expect(results[0].provider).toBe('searxng');
  });

  it('handles null publishedDate', async () => {
    mockFetch(200, sampleSearxNGResponse);
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const results = await provider.search({ query: 'test' });
    expect(results[1].publishedDate).toBeUndefined();
  });

  it('returns empty array when no results', async () => {
    mockFetch(200, { ...sampleSearxNGResponse, results: [] });
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('applies language parameter', async () => {
    mockFetch(200, sampleSearxNGResponse);
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await provider.search({ query: 'test', language: 'de' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('language=de');
  });

  it('applies safeSearch off (0)', async () => {
    mockFetch(200, sampleSearxNGResponse);
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await provider.search({ query: 'test', safeSearch: 'off' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=0');
  });

  it('applies safeSearch moderate (1)', async () => {
    mockFetch(200, sampleSearxNGResponse);
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await provider.search({ query: 'test', safeSearch: 'moderate' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=1');
  });

  it('applies safeSearch strict (2)', async () => {
    mockFetch(200, sampleSearxNGResponse);
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await provider.search({ query: 'test', safeSearch: 'strict' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safesearch=2');
  });

  it('appends additional params', async () => {
    mockFetch(200, sampleSearxNGResponse);
    const provider = createSearxNGProvider({
      baseUrl: 'https://searxng.example.com/search',
      additionalParams: { categories: 'news', engines: 'google,bing' },
    });
    await provider.search({ query: 'test' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('categories=news');
    expect(url).toContain('engines=google%2Cbing');
  });

  it('appends api_key when provided', async () => {
    mockFetch(200, sampleSearxNGResponse);
    const provider = createSearxNGProvider({
      baseUrl: 'https://searxng.example.com/search',
      apiKey: 'secret-key',
    });
    await provider.search({ query: 'test' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('api_key=secret-key');
  });

  it('handles invalid URL in result gracefully', async () => {
    const response = {
      ...sampleSearxNGResponse,
      results: [{ url: 'not-a-url', title: 'Test', content: 'Content', publishedDate: null }],
    };
    mockFetch(200, response);
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    const results = await provider.search({ query: 'test' });
    expect(results[0].domain).toBeUndefined();
  });

  it('throws detailed error on 401/403', async () => {
    mockFetch(401, { message: 'Unauthorized' }, 'Unauthorized');
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Authentication failed');
  });

  it('throws detailed error on 429', async () => {
    mockFetch(429, { message: 'Too Many Requests' }, 'Too Many Requests');
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Rate limit exceeded');
  });

  it('throws detailed error on 404', async () => {
    mockFetch(404, { message: 'Not Found' }, 'Not Found');
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('not found');
  });

  it('throws detailed error on 400', async () => {
    mockFetch(400, { message: 'Bad Request' }, 'Bad Request');
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Bad request');
  });

  it('throws detailed error on 500+', async () => {
    mockFetch(500, { message: 'Server Error' }, 'Internal Server Error');
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('server error');
  });

  it('handles ECONNREFUSED error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Could not connect');
  });

  it('handles ENOTFOUND error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Could not connect');
  });

  it('handles timeout error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Request timeout')));
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('timed out');
  });

  it('wraps non-Error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const provider = createSearxNGProvider({ baseUrl: 'https://searxng.example.com/search' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'SearxNG search failed: string error'
    );
  });
});

describe('searxng singleton', () => {
  it('has correct name', () => {
    expect(searxng.name).toBe('searxng');
  });

  it('throws when search is called without configure', async () => {
    await expect(searxng.search({ query: 'test' })).rejects.toThrow(
      'SearxNG provider must be configured before use'
    );
  });

  it('configure returns a working provider', () => {
    const provider = searxng.configure({ baseUrl: 'https://searxng.example.com/search' });
    expect(provider.name).toBe('searxng');
  });
});
