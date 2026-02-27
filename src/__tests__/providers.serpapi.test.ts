import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSerpApiProvider, serpapi } from '../providers/serpapi';

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

const sampleSerpApiResponse = {
  search_metadata: {
    id: 'abc',
    status: 'Success',
    json_endpoint: '',
    created_at: '',
    processed_at: '',
    google_url: '',
    raw_html_file: '',
    total_time_taken: 1.0,
  },
  search_parameters: {
    engine: 'google',
    q: 'test',
    google_domain: 'google.com',
    device: 'desktop',
    num: 10,
  },
  search_information: {
    organic_results_state: 'Results for exact spelling',
    total_results: 1000,
    time_taken_displayed: 0.5,
    query_displayed: 'test',
  },
  organic_results: [
    {
      position: 1,
      title: 'SerpAPI Result',
      link: 'https://example.com/result',
      displayed_link: 'example.com/result',
      snippet: 'SerpAPI snippet content',
      date: '2024-02-01',
    },
  ],
};

describe('createSerpApiProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws if no apiKey is provided', () => {
    expect(() => createSerpApiProvider({ apiKey: '' })).toThrow('SerpAPI requires an API key');
  });

  it('creates a provider with name "serpapi"', () => {
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('serpapi');
  });

  it('throws if query is empty or whitespace', async () => {
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: '' })).rejects.toThrow('SerpAPI search requires a query');
    await expect(provider.search({ query: '  ' })).rejects.toThrow(
      'SerpAPI search requires a query'
    );
  });

  it('returns search results correctly', async () => {
    mockFetch(200, sampleSerpApiResponse);
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/result');
    expect(results[0].title).toBe('SerpAPI Result');
    expect(results[0].snippet).toBe('SerpAPI snippet content');
    expect(results[0].domain).toBe('example.com');
    expect(results[0].publishedDate).toBe('2024-02-01');
    expect(results[0].provider).toBe('serpapi');
  });

  it('returns empty array when no organic_results', async () => {
    mockFetch(200, { ...sampleSerpApiResponse, organic_results: [] });
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('throws when response contains error field', async () => {
    mockFetch(200, { ...sampleSerpApiResponse, organic_results: [], error: 'Invalid API key' });
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'SerpAPI error: Invalid API key'
    );
  });

  it('applies language parameter', async () => {
    mockFetch(200, sampleSerpApiResponse);
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test', language: 'fr' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('hl=fr');
  });

  it('applies region parameter', async () => {
    mockFetch(200, sampleSerpApiResponse);
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test', region: 'us' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('gl=us');
  });

  it('applies safeSearch parameter', async () => {
    mockFetch(200, sampleSerpApiResponse);
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test', safeSearch: 'strict' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('safe=strict');
  });

  it('adds start for page > 1', async () => {
    mockFetch(200, sampleSerpApiResponse);
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test', page: 2, maxResults: 10 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('start=11');
  });

  it('does not add start for page 1', async () => {
    mockFetch(200, sampleSerpApiResponse);
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test', page: 1 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // start=undefined should not be appended
    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.has('start')).toBe(false);
  });

  it('uses custom engine when provided', async () => {
    mockFetch(200, sampleSerpApiResponse);
    const provider = createSerpApiProvider({ apiKey: 'test-key', engine: 'bing' });
    await provider.search({ query: 'test' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('engine=bing');
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch(200, sampleSerpApiResponse);
    const provider = createSerpApiProvider({
      apiKey: 'test-key',
      baseUrl: 'https://custom-serpapi.example.com/search',
    });
    await provider.search({ query: 'test' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('custom-serpapi.example.com');
  });

  it('throws detailed error on 401/403', async () => {
    mockFetch(401, { message: 'Unauthorized' }, 'Unauthorized');
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Invalid API key');
  });

  it('throws detailed error on 429', async () => {
    mockFetch(429, { message: 'Rate Limited' }, 'Too Many Requests');
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Rate limit exceeded');
  });

  it('throws detailed error on 400', async () => {
    mockFetch(400, { message: 'Bad Request' }, 'Bad Request');
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Bad request');
  });

  it('throws detailed error on 400 with missing parameter message', async () => {
    mockFetch(400, { message: 'parameter is missing' }, 'Bad Request');
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('required parameter');
  });

  it('throws detailed error on 500+', async () => {
    mockFetch(503, { message: 'Service Unavailable' }, 'Service Unavailable');
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('server error');
  });

  it('handles generic Error with API key mention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API key is invalid')));
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Invalid or missing API key');
  });

  it('handles generic Error with quota/limit mention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('quota exceeded')));
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('usage limit');
  });

  it('wraps non-Error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const provider = createSerpApiProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'SerpAPI search failed: string error'
    );
  });
});

describe('serpapi singleton', () => {
  it('has correct name', () => {
    expect(serpapi.name).toBe('serpapi');
  });

  it('throws when search is called without configure', async () => {
    await expect(serpapi.search({ query: 'test' })).rejects.toThrow(
      'SerpAPI provider must be configured before use'
    );
  });

  it('configure returns a working provider', () => {
    const provider = serpapi.configure({ apiKey: 'test-key' });
    expect(provider.name).toBe('serpapi');
  });
});
