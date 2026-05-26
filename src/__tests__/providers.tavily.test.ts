import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTavilyProvider } from '../providers/tavily';

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

const sampleTavilyResponse = {
  query: 'test',
  results: [
    {
      title: 'Tavily Result',
      url: 'https://example.com/tavily',
      content: 'Tavily content snippet',
      score: 0.9,
      published_date: '2024-03-01',
    },
    {
      title: 'Another Result',
      url: 'https://another.com',
      content: 'Another snippet',
      score: 0.8,
    },
  ],
  search_id: 'abc123',
};

describe('createTavilyProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws if no apiKey is provided', () => {
    expect(() => createTavilyProvider({ apiKey: '' })).toThrow('Tavily requires an API key');
  });

  it('creates a provider with name "tavily"', () => {
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('tavily');
  });

  it('returns error if query is empty or whitespace', async () => {
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result1 = await provider.search({ query: '', retries: 0 });
    expect(result1.isErr()).toBe(true);
    if (result1.isErr()) {
      const msg = result1.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('requires a query');
    }

    const result2 = await provider.search({ query: '  ', retries: 0 });
    expect(result2.isErr()).toBe(true);
    if (result2.isErr()) {
      const msg = result2.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('requires a query');
    }
  });

  it('returns search results correctly', async () => {
    mockFetch(200, sampleTavilyResponse);
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const results = result.value;
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('https://example.com/tavily');
      expect(results[0].title).toBe('Tavily Result');
      expect(results[0].snippet).toBe('Tavily content snippet');
      expect(results[0].domain).toBe('example.com');
      expect(results[0].publishedDate).toBe('2024-03-01');
      expect(results[0].provider).toBe('tavily');
    }
  });

  it('returns empty array when no results', async () => {
    mockFetch(200, { ...sampleTavilyResponse, results: [] });
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it('returns empty array when results is undefined', async () => {
    mockFetch(200, { query: 'test', search_id: 'abc' });
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it('includes locale when language and region are provided', async () => {
    mockFetch(200, sampleTavilyResponse);
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', language: 'fr', region: 'FR', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.locale).toBe('fr-FR');
  });

  it('includes locale with default en when only region is provided', async () => {
    mockFetch(200, sampleTavilyResponse);
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', region: 'US', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.locale).toBe('en-US');
  });

  it('includes locale with only language', async () => {
    mockFetch(200, sampleTavilyResponse);
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', language: 'de', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.locale).toBe('de');
  });

  it('applies safeSearch=strict', async () => {
    mockFetch(200, sampleTavilyResponse);
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', safeSearch: 'strict', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.safe_search).toBe(true);
  });

  it('applies safeSearch=off', async () => {
    mockFetch(200, sampleTavilyResponse);
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', safeSearch: 'off', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.safe_search).toBe(false);
  });

  it('does not include safe_search for moderate', async () => {
    mockFetch(200, sampleTavilyResponse);
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', safeSearch: 'moderate', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.safe_search).toBeUndefined();
  });

  it('adds page to body when page > 1', async () => {
    mockFetch(200, sampleTavilyResponse);
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', page: 3, retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.page).toBe(3);
  });

  it('uses config searchDepth', async () => {
    mockFetch(200, sampleTavilyResponse);
    const provider = createTavilyProvider({ apiKey: 'test-key', searchDepth: 'comprehensive' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.search_depth).toBe('comprehensive');
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch(200, sampleTavilyResponse);
    const provider = createTavilyProvider({
      apiKey: 'test-key',
      baseUrl: 'https://custom-tavily.example.com/search',
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('custom-tavily.example.com');
  });

  it('returns detailed error on 401', async () => {
    mockFetch(401, { message: 'Unauthorized' }, 'Unauthorized');
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('401');
      expect(msg.toLowerCase()).toContain('tavily');
    }
  });

  it('returns detailed error on 403', async () => {
    mockFetch(403, { message: 'Forbidden' }, 'Forbidden');
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('403');
      expect(msg.toLowerCase()).toContain('tavily');
    }
  });

  it('returns detailed error on 429', async () => {
    mockFetch(429, { message: 'Rate Limited' }, 'Too Many Requests');
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('429');
      expect(msg.toLowerCase()).toContain('rate limit');
    }
  });

  it('returns detailed error on 400 with search_depth mention', async () => {
    mockFetch(400, { message: 'Invalid search_depth' }, 'Bad Request');
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('400');
      expect(msg.toLowerCase()).toContain('search_depth');
    }
  });

  it('returns detailed error on 400 with sort_by mention', async () => {
    mockFetch(400, { message: 'Invalid sort_by value' }, 'Bad Request');
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('400');
      expect(msg.toLowerCase()).toContain('sort_by');
    }
  });

  it('returns detailed error on 500+', async () => {
    mockFetch(503, { message: 'Service Unavailable' }, 'Service Unavailable');
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('503');
      expect(msg.toLowerCase()).toContain('server error');
    }
  });

  it('handles generic Error with api_key mention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Invalid api_key')));
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('tavily');
    }
  });

  it('handles generic Error with timeout mention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Request timeout')));
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('timeout');
    }
  });

  it('wraps non-Error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message.toLowerCase()).toContain('tavily search failed:');
      expect(result.error.message.toLowerCase()).toContain('string error');
    }
  });

  it('handles URL with invalid format', async () => {
    const response = {
      ...sampleTavilyResponse,
      results: [{ title: 'Test', url: 'not-valid-url', content: 'content', score: 0.5 }],
    };
    mockFetch(200, response);
    const provider = createTavilyProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].domain).toBeUndefined();
    }
  });
});

