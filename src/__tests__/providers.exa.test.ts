import { describe, it, expect, vi, afterEach } from 'vitest';
import { createExaProvider, exa } from '../providers/exa';

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

const sampleExaResponse = {
  results: [
    {
      title: 'Research Paper',
      url: 'https://papers.example.com/1234',
      text: 'Abstract text here',
      relevance_score: 0.95,
      publish_date: '2024-01-15',
      author: 'Test Author',
    },
    {
      title: 'Another Result',
      url: 'https://example.org/result',
      text: 'More content here',
    },
  ],
  query: 'test query',
};

describe('createExaProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws if no apiKey is provided', () => {
    expect(() => createExaProvider({ apiKey: '' })).toThrow('Exa requires an API key');
  });

  it('creates a provider with name "exa"', () => {
    const provider = createExaProvider({ apiKey: 'test-key' });
    expect(provider.name).toBe('exa');
  });

  it('returns search results correctly', async () => {
    mockFetch(200, sampleExaResponse);
    const provider = createExaProvider({ apiKey: 'test-key' });
    const results = await provider.search({ query: 'test query' });

    expect(results).toHaveLength(2);
    expect(results[0].url).toBe('https://papers.example.com/1234');
    expect(results[0].title).toBe('Research Paper');
    expect(results[0].snippet).toBe('Abstract text here');
    expect(results[0].domain).toBe('papers.example.com');
    expect(results[0].publishedDate).toBe('2024-01-15');
    expect(results[0].provider).toBe('exa');
  });

  it('returns empty array when no results', async () => {
    mockFetch(200, { results: [], query: 'test' });
    const provider = createExaProvider({ apiKey: 'test-key' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('returns empty array when results is undefined', async () => {
    mockFetch(200, { query: 'test' });
    const provider = createExaProvider({ apiKey: 'test-key' });
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('handles invalid URL gracefully for domain extraction', async () => {
    const response = {
      results: [{ title: 'Test', url: 'not-a-url', text: 'content' }],
      query: 'test',
    };
    mockFetch(200, response);
    const provider = createExaProvider({ apiKey: 'test-key' });
    const results = await provider.search({ query: 'test' });
    expect(results[0].domain).toBeUndefined();
  });

  it('sends Authorization Bearer header', async () => {
    mockFetch(200, sampleExaResponse);
    const provider = createExaProvider({ apiKey: 'my-exa-key' });
    await provider.search({ query: 'test' });
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.headers.Authorization).toBe('Bearer my-exa-key');
  });

  it('sends POST request', async () => {
    mockFetch(200, sampleExaResponse);
    const provider = createExaProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test' });
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(options.method).toBe('POST');
  });

  it('uses custom model when provided', async () => {
    mockFetch(200, sampleExaResponse);
    const provider = createExaProvider({ apiKey: 'test-key', model: 'embeddings' });
    await provider.search({ query: 'test' });
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.model).toBe('embeddings');
  });

  it('defaults to keyword model', async () => {
    mockFetch(200, sampleExaResponse);
    const provider = createExaProvider({ apiKey: 'test-key' });
    await provider.search({ query: 'test' });
    const options = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(options.body);
    expect(body.model).toBe('keyword');
  });

  it('uses custom baseUrl when provided', async () => {
    mockFetch(200, sampleExaResponse);
    const provider = createExaProvider({
      apiKey: 'test-key',
      baseUrl: 'https://custom-exa.example.com/search',
    });
    await provider.search({ query: 'test' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('custom-exa.example.com');
  });

  it('throws detailed error on 401', async () => {
    mockFetch(401, { message: 'Unauthorized' }, 'Unauthorized');
    const provider = createExaProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Invalid API key');
  });

  it('throws detailed error on 403', async () => {
    mockFetch(403, { message: 'Forbidden' }, 'Forbidden');
    const provider = createExaProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Access denied');
  });

  it('throws detailed error on 429', async () => {
    mockFetch(429, { message: 'Too Many Requests' }, 'Too Many Requests');
    const provider = createExaProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Rate limit exceeded');
  });

  it('throws detailed error on 400 with model error', async () => {
    mockFetch(400, { message: 'Invalid model value' }, 'Bad Request');
    const provider = createExaProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Bad request');
  });

  it('throws detailed error on 400 with max_results error', async () => {
    mockFetch(400, { message: 'max_results must be positive' }, 'Bad Request');
    const provider = createExaProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('max_results');
  });

  it('throws detailed error on 500+', async () => {
    mockFetch(500, { message: 'Server Error' }, 'Internal Server Error');
    const provider = createExaProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('server error');
  });

  it('handles generic Error with token mention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Invalid token')));
    const provider = createExaProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Authentication issue');
  });

  it('handles generic Error with timeout mention', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Request timeout occurred')));
    const provider = createExaProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('timed out');
  });

  it('wraps non-Error throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const provider = createExaProvider({ apiKey: 'test-key' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'Exa search failed: string error'
    );
  });
});

describe('exa singleton', () => {
  it('has correct name', () => {
    expect(exa.name).toBe('exa');
  });

  it('throws when search is called without configure', async () => {
    await expect(exa.search({ query: 'test' })).rejects.toThrow(
      'Exa provider must be configured before use'
    );
  });

  it('configure returns a working provider', () => {
    const provider = exa.configure({ apiKey: 'test-key' });
    expect(provider.name).toBe('exa');
  });
});
