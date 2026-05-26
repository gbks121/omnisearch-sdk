import { describe, it, expect, vi, afterEach } from 'vitest';
import { createParallelProvider } from '../providers/parallel';

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

const sampleParallelResponse = {
  search_id: 'search-123',
  results: [
    {
      url: 'https://example.com/result',
      title: 'Parallel Result',
      publish_date: '2024-01-01',
      excerpts: ['First excerpt content', 'Second excerpt content'],
    },
    {
      url: 'https://another.com',
      publish_date: undefined,
      excerpts: [],
    },
  ],
};

describe('createParallelProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws if no apiKey is provided', () => {
    expect(() => createParallelProvider({ apiKey: '' })).toThrow('Parallel requires an API key');
  });

  it('creates a provider with name "parallel"', () => {
    const provider = createParallelProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('parallel');
  });

  it('returns error if no query is provided', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('requires a query');
    }
  });

  it('returns search results correctly', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const results = result.value;
      expect(results).toHaveLength(2);
      expect(results[0].url).toBe('https://example.com/result');
      expect(results[0].title).toBe('Parallel Result');
      expect(results[0].snippet).toBe('First excerpt content');
      expect(results[0].content).toBe('First excerpt content\n\nSecond excerpt content');
      expect(results[0].domain).toBe('example.com');
      expect(results[0].publishedDate).toBe('2024-01-01');
      expect(results[0].provider).toBe('parallel');
    }
  });

  it('handles result with no excerpts', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[1].snippet).toBeUndefined();
      expect(result.value[1].content).toBeUndefined();
    }
  });

  it('uses "No title available" for result with no title', async () => {
    const response = {
      ...sampleParallelResponse,
      results: [{ url: 'https://example.com', excerpts: [] }],
    };
    mockFetch(200, response);
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].title).toBe('No title available');
    }
  });

  it('returns empty array when no results', async () => {
    mockFetch(200, { ...sampleParallelResponse, results: [] });
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it('returns empty array when results is undefined', async () => {
    mockFetch(200, { search_id: 'abc' });
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it('sends x-api-key header', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({ apiKey: 'my-parallel-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.headers['x-api-key']).toBe('my-parallel-key');
  });

  it('sends parallel-beta header', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.headers['parallel-beta']).toBeTruthy();
  });

  it('applies mode from config', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({ apiKey: 'test-key', mode: 'agentic' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.mode).toBe('agentic');
  });

  it('applies excerpt settings from config', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({
      apiKey: 'test-key',
      maxCharsPerResult: 500,
      excerptCount: 3,
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.excerpts.max_chars_per_result).toBe(500);
    expect(body.excerpts.count).toBe(3);
  });

  it('applies source policy with includeDomains and excludeDomains', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({
      apiKey: 'test-key',
      includeDomains: ['example.com'],
      excludeDomains: ['spam.com'],
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.source_policy.include_domains).toEqual(['example.com']);
    expect(body.source_policy.exclude_domains).toEqual(['spam.com']);
  });

  it('applies source policy with date filters', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({
      apiKey: 'test-key',
      afterDate: '2024-01-01',
      beforeDate: '2024-12-31',
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.source_policy.after_date).toBe('2024-01-01');
    expect(body.source_policy.before_date).toBe('2024-12-31');
  });

  it('applies fetch strategy from config', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({ apiKey: 'test-key', fetchStrategy: 'live' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.fetch_policy.strategy).toBe('live');
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch(200, sampleParallelResponse);
    const provider = createParallelProvider({
      apiKey: 'test-key',
      baseUrl: 'https://custom-parallel.example.com/search',
    });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('custom-parallel.example.com');
  });

  it('logs warnings when present in response', async () => {
    const responseWithWarnings = {
      ...sampleParallelResponse,
      warnings: [{ type: 'warning', message: 'Some warning' }],
    };
    const customLogger = vi.fn();
    mockFetch(200, responseWithWarnings);
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({
      query: 'test',
      retries: 0,
      debug: { enabled: true, logger: customLogger },
    });
    expect(result.isOk()).toBe(true);
    expect(customLogger).toHaveBeenCalledWith(
      expect.stringContaining('warnings'),
      expect.anything()
    );
  });

  it('handles invalid URL in result gracefully', async () => {
    const response = {
      search_id: 'abc',
      results: [{ url: 'not-a-url', title: 'Test', excerpts: ['content'] }],
    };
    mockFetch(200, response);
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].domain).toBeUndefined();
    }
  });

  it('returns detailed error on 401', async () => {
    mockFetch(401, { message: 'Unauthorized' }, 'Unauthorized');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('401');
      expect(msg.toLowerCase()).toContain('parallel');
    }
  });

  it('returns detailed error on 403', async () => {
    mockFetch(403, { message: 'Forbidden' }, 'Forbidden');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('403');
      expect(msg.toLowerCase()).toContain('parallel');
    }
  });

  it('returns detailed error on 429', async () => {
    mockFetch(429, { message: 'Too Many Requests' }, 'Too Many Requests');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('429');
      expect(msg.toLowerCase()).toContain('rate limit');
    }
  });

  it('returns detailed error on 400 with objective mention', async () => {
    mockFetch(400, { message: 'objective field is required' }, 'Bad Request');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('400');
      expect(msg.toLowerCase()).toContain('objective');
    }
  });

  it('returns detailed error on 400 with max_results mention', async () => {
    mockFetch(400, { message: 'max_results is invalid' }, 'Bad Request');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('400');
      expect(msg.toLowerCase()).toContain('max_results');
    }
  });

  it('returns detailed error on 400 with source_policy mention', async () => {
    mockFetch(400, { message: 'invalid source_policy' }, 'Bad Request');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('400');
      expect(msg.toLowerCase()).toContain('source_policy');
    }
  });

  it('returns detailed error on 422 with date mention', async () => {
    mockFetch(422, { message: 'invalid date format' }, 'Unprocessable Entity');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('422');
      expect(msg.toLowerCase()).toContain('date format');
    }
  });

  it('returns detailed error on 422 with domain mention', async () => {
    mockFetch(422, { message: 'invalid domain format' }, 'Unprocessable Entity');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('422');
      expect(msg.toLowerCase()).toContain('domain format');
    }
  });

  it('returns detailed error on 422 with mode mention', async () => {
    mockFetch(422, { message: 'invalid mode value' }, 'Unprocessable Entity');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('422');
      expect(msg.toLowerCase()).toContain('mode');
    }
  });

  it('returns detailed error on 422 with strategy mention', async () => {
    mockFetch(422, { message: 'invalid strategy' }, 'Unprocessable Entity');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('422');
      expect(msg.toLowerCase()).toContain('strategy');
    }
  });

  it('returns detailed error on 422 (validation) without specific mention', async () => {
    mockFetch(422, { message: 'validation failed' }, 'Unprocessable Entity');
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('422');
      expect(msg.toLowerCase()).toContain('validation');
    }
  });

  it('returns detailed error on 500+', async () => {
    mockFetch(503, { message: 'Service Unavailable' }, 'Service Unavailable');
    const provider = createParallelProvider({ apiKey: 'test-key' });
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
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('parallel');
    }
  });

  it('handles generic Error with timeout mention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Request timeout')));
    const provider = createParallelProvider({ apiKey: 'test-key' });
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
    const provider = createParallelProvider({ apiKey: 'test-key' });
    const result = await provider.search({ query: 'test', retries: 0 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const msg = result.error.message;
      expect(msg.toLowerCase()).toContain('search failed');
      expect(msg.toLowerCase()).toContain('string error');
    }
  });
});
