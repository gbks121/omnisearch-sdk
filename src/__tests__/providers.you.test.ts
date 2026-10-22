import { afterEach, describe, expect, it, vi } from 'vitest';
import { createYouProvider } from '../providers/you';

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

describe('createYouProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should throw if apiKey is missing', () => {
    expect(() => createYouProvider({ apiKey: '' })).toThrow('You.com requires an API key');
  });

  it('should query and map web results from You.com', async () => {
    const mockResponse = {
      hits: [
        {
          title: 'You.com Title',
          url: 'https://you.example.com/item',
          description: 'You description',
          snippets: ['Snippet 1', 'Snippet 2'],
          age: '2026-03-01T12:00:00Z',
        },
      ],
    };
    mockFetch(200, mockResponse);

    const provider = createYouProvider({ apiKey: 'test-you-key' });
    const results = await provider.search({ query: 'search prompt' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('You.com Title');
    expect(results[0].snippet).toBe('Snippet 1 Snippet 2');
    expect(results[0].provider).toBe('you');
  });

  it('should query news search results when searchType is news', async () => {
    const mockNewsResponse = {
      news: [
        {
          title: 'You News',
          url: 'https://news.you.com/article',
          description: 'News description text',
          age: '2026-03-01T08:00:00Z',
        },
      ],
    };
    mockFetch(200, mockNewsResponse);

    const provider = createYouProvider({ apiKey: 'test-key', searchType: 'news' });
    const results = await provider.search({ query: 'breaking' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('You News');
    expect(results[0].snippet).toBe('News description text');
  });

  it('should format troubleshooting on 401, 429, and 500', async () => {
    mockFetch(401, { error: 'Unauthorized' }, 'Unauthorized');
    const provider = createYouProvider({ apiKey: 'bad' });
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Authentication failed');
  });
});
