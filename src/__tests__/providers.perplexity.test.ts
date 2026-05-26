import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPerplexityProvider } from '../providers/perplexity';

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

const samplePerplexityResponse = {
  results: [
    {
      title: 'Perplexity Result',
      url: 'https://example.com/perplexity',
      snippet: 'Perplexity snippet content',
      date: '2024-01-01',
      last_updated: '2024-02-15',
    },
    {
      title: 'Another Result',
      url: 'https://another.com',
      snippet: 'Another snippet',
      date: '2024-01-10',
      last_updated: '',
    },
  ],
};

describe('createPerplexityProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws if no apiKey is provided', () => {
    expect(() => createPerplexityProvider({ apiKey: '' })).toThrow(
      'Perplexity requires an API key'
    );
  });

  it('creates a provider with name "perplexity"', () => {
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('perplexity');
  });

  it('returns error if no query is provided', async () => {
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('requires a query');
    }
  });

  it('returns search results correctly', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const results = result.value;
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('https://example.com/perplexity');
      expect(results[0].title).toBe('Perplexity Result');
      expect(results[0].snippet).toBe('Perplexity snippet content');
      expect(results[0].domain).toBe('example.com');
      expect(results[0].publishedDate).toBe('2024-02-15'); // last_updated takes priority
      expect(results[0].provider).toBe('perplexity');
    }
  });

  it('falls back to date when last_updated is empty', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[1].publishedDate).toBe('2024-01-10');
    }
  });

  it('returns empty array when no results', async () => {
    mockFetch(200, { results: [] });
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it('returns empty array when results is undefined', async () => {
    mockFetch(200, {});
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it('sends Authorization Bearer header', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({ apiKey: 'my-perplexity-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.headers.Authorization).toBe('Bearer my-perplexity-key');
  });

  it('caps maxResults to 20', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', maxResults: 100, retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.max_results).toBe(20);
  });

  it('ensures maxResults minimum of 1', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', maxResults: 0, retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.max_results).toBe(1);
  });

  it('applies config-level options (maxTokens, maxTokensPerPage, searchDomainFilter)', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({
      apiKey: 'test-key',
      maxTokens: 5000,
      maxTokensPerPage: 1000,
      searchDomainFilter: ['example.com'],
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.max_tokens).toBe(5000);
    expect(body.max_tokens_per_page).toBe(1000);
    expect(body.search_domain_filter).toEqual(['example.com']);
  });

  it('applies region as country in request body', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', region: 'US', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.country).toBe('US');
  });

  it('falls back to config country when region is not provided', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({ apiKey: 'test-key', country: 'GB' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.country).toBe('GB');
  });

  it('applies searchRecencyFilter', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({
      apiKey: 'test-key',
      searchRecencyFilter: 'week',
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.search_recency_filter).toBe('week');
  });

  it('applies searchAfterDate and searchBeforeDate', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({
      apiKey: 'test-key',
      searchAfterDate: '01/01/2024',
      searchBeforeDate: '12/31/2024',
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.search_after_date).toBe('01/01/2024');
    expect(body.search_before_date).toBe('12/31/2024');
  });

  it('applies searchLanguageFilter from config', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({
      apiKey: 'test-key',
      searchLanguageFilter: ['en', 'fr'],
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.search_language_filter).toEqual(['en', 'fr']);
  });

  it('uses language option as searchLanguageFilter when no config filter', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', language: 'de', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.search_language_filter).toEqual(['de']);
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch(200, samplePerplexityResponse);
    const provider = createPerplexityProvider({
      apiKey: 'test-key',
      baseUrl: 'https://custom-perplexity.example.com/search',
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('custom-perplexity.example.com');
  });

  it('handles invalid URL gracefully for domain extraction', async () => {
    const response = {
      results: [
        { title: 'Test', url: 'not-a-url', snippet: 'content', date: '', last_updated: '' },
      ],
    };
    mockFetch(200, response);
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it('returns detailed error on 401', async () => {
    mockFetch(401, { message: 'Unauthorized' }, 'Unauthorized');
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('401');
      expect(msg.toLowerCase()).toContain('perplexity');
    }
  });

  it('returns detailed error on 403', async () => {
    mockFetch(403, { message: 'Forbidden' }, 'Forbidden');
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('403');
      expect(msg.toLowerCase()).toContain('perplexity');
    }
  });

  it('returns detailed error on 429', async () => {
    mockFetch(429, { message: 'Too Many Requests' }, 'Too Many Requests');
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('429');
      expect(msg.toLowerCase()).toContain('rate limit');
    }
  });

  it('returns detailed error on 400 with max_results mention', async () => {
    mockFetch(400, { message: 'max_results invalid' }, 'Bad Request');
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('400');
      expect(msg.toLowerCase()).toContain('max_results');
    }
  });

  it('returns detailed error on 400 with search_recency_filter mention', async () => {
    mockFetch(400, { message: 'invalid search_recency_filter' }, 'Bad Request');
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('400');
      expect(msg.toLowerCase()).toContain('search_recency_filter');
    }
  });

  it('returns detailed error on 400 with date mention', async () => {
    mockFetch(400, { message: 'invalid search_after_date format' }, 'Bad Request');
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('400');
      expect(msg.toLowerCase()).toContain('mm/dd/yyyy');
    }
  });

  it('returns detailed error on 500+', async () => {
    mockFetch(503, { message: 'Service Unavailable' }, 'Service Unavailable');
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
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
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('perplexity');
    }
  });

  it('handles generic Error with timeout mention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Request timeout')));
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
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
    const provider = createPerplexityProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('string error');
    }
  });
});
