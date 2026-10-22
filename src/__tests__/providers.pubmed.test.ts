import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPubMedProvider } from '../providers/pubmed';

describe('createPubMedProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should query NCBI ESearch and ESummary and format medical articles', async () => {
    const searchBody = { esearchresult: { idlist: ['12345678'] } };
    const summaryBody = {
      result: {
        uids: ['12345678'],
        '12345678': {
          uid: '12345678',
          title: 'CRISPR Gene Editing in Human Cells',
          pubdate: '2026 Feb 14',
          source: 'Nature Biotechnology',
          authors: [{ name: 'Smith J' }, { name: 'Doe A' }],
        },
      },
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const isSearch = url.includes('esearch.fcgi');
      const body = isSearch ? searchBody : summaryBody;
      const bodyStr = JSON.stringify(body);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve(body),
        text: () => Promise.resolve(bodyStr),
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    const provider = createPubMedProvider();
    const results = await provider.search({ query: 'crispr cas9' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('CRISPR Gene Editing in Human Cells');
    expect(results[0].url).toBe('https://pubmed.ncbi.nlm.nih.gov/12345678/');
    expect(results[0].provider).toBe('pubmed');
    expect(results[0].snippet).toContain('Nature Biotechnology');
    expect(results[0].snippet).toContain('Smith J, Doe A');
  });

  it('should return empty results when PubMed finds no IDs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ esearchresult: { idlist: [] } }),
        text: () => Promise.resolve('{}'),
      })
    );

    const provider = createPubMedProvider();
    const results = await provider.search({ query: 'nonexistenttermxyz999' });
    expect(results).toEqual([]);
  });

  it('should throw if query is empty', async () => {
    const provider = createPubMedProvider();
    await expect(provider.search({ query: '' })).rejects.toThrow('PubMed search requires a query');
  });

  it('should pass apiKey when configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ esearchresult: { idlist: [] } }),
      text: () => Promise.resolve('{}'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createPubMedProvider({ apiKey: 'my-ncbi-key' });
    await provider.search({ query: 'cancer' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api_key=my-ncbi-key'),
      expect.anything()
    );
  });
});
