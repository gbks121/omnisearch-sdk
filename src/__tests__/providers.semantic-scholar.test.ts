import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSemanticScholarProvider } from '../providers/semantic-scholar';

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

describe('createSemanticScholarProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should search papers and parse publication metadata', async () => {
    const mockResponse = {
      total: 1,
      data: [
        {
          paperId: '649def34f',
          title: 'Attention Is All You Need',
          url: 'https://www.semanticscholar.org/paper/649def34f',
          abstract: 'The dominant sequence transduction models are based on complex recurrent...',
          year: 2017,
          publicationDate: '2017-06-12',
          authors: [{ name: 'Vaswani A' }, { name: 'Shazeer N' }],
        },
      ],
    };

    mockFetch(200, mockResponse);

    const provider = createSemanticScholarProvider();
    const results = await provider.search({ query: 'transformer attention' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Attention Is All You Need');
    expect(results[0].url).toBe('https://www.semanticscholar.org/paper/649def34f');
    expect(results[0].provider).toBe('semanticscholar');
  });

  it('should return empty array when no papers match', async () => {
    mockFetch(200, { total: 0, data: [] });

    const provider = createSemanticScholarProvider();
    const results = await provider.search({ query: 'nonexistent' });
    expect(results).toEqual([]);
  });

  it('should fall back to year when publicationDate is missing', async () => {
    mockFetch(200, {
      total: 1,
      data: [{ paperId: 'p123', title: 'Paper 123', year: 2020 }],
    });

    const provider = createSemanticScholarProvider();
    const results = await provider.search({ query: 'ml' });
    expect(results[0].publishedDate).toBe('2020-01-01T00:00:00.000Z');
  });

  it('should pass x-api-key when configured', async () => {
    mockFetch(200, { total: 0, data: [] });
    const provider = createSemanticScholarProvider({ apiKey: 'my-s2-key' });
    await provider.search({ query: 'deep learning' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-api-key': 'my-s2-key' }),
      })
    );
  });
});
