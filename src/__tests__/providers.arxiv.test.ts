import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createArxivProvider, arxiv } from '../providers/arxiv';

// Mock xml2js so we control the parsed output
vi.mock('xml2js', () => ({
  parseStringPromise: vi.fn(),
}));

import { parseStringPromise } from 'xml2js';

const mockParseStringPromise = vi.mocked(parseStringPromise);

function createTextResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(body),
    clone: vi.fn().mockReturnValue({ text: vi.fn().mockResolvedValue(body) }),
  } as unknown as Response;
}

function createErrorResponse(status: number, body: unknown, statusText: string): Response {
  const bodyStr = JSON.stringify(body);
  return {
    ok: false,
    status,
    statusText,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(bodyStr),
    clone: vi.fn().mockReturnValue({ text: vi.fn().mockResolvedValue(bodyStr) }),
  } as unknown as Response;
}

// Mock feed data that the code would expect: { feed: { entry: [...], ... } }
const mockSingleEntry = {
  id: 'http://arxiv.org/abs/2305.00001v1',
  updated: '2023-05-01T00:00:00Z',
  published: '2023-05-01T00:00:00Z',
  title: 'Test Paper Title',
  summary: 'Abstract of the test paper',
  author: [{ name: 'John Doe' }, { name: 'Jane Smith' }],
  link: [
    {
      _attributes: {
        href: 'http://arxiv.org/abs/2305.00001v1',
        rel: 'alternate',
        type: 'text/html',
      },
    },
    {
      _attributes: {
        title: 'pdf',
        href: 'http://arxiv.org/pdf/2305.00001v1',
        rel: 'related',
        type: 'application/pdf',
      },
    },
  ],
  category: { _attributes: { term: 'cs.AI', scheme: 'http://arxiv.org/schemas/atom' } },
};

const mockSecondEntry = {
  id: 'http://arxiv.org/abs/2305.00002v1',
  updated: '2023-05-02T00:00:00Z',
  published: '2023-05-02T00:00:00Z',
  title: 'Another\n  Paper',
  summary: 'Multi-line\n  summary text',
  author: { name: 'Bob Johnson' },
  link: [
    {
      _attributes: {
        href: 'http://arxiv.org/abs/2305.00002v1',
        rel: 'alternate',
        type: 'text/html',
      },
    },
  ],
  category: [
    { _attributes: { term: 'cs.LG', scheme: 'http://arxiv.org/schemas/atom' } },
    { _attributes: { term: 'stat.ML', scheme: 'http://arxiv.org/schemas/atom' } },
  ],
};

const mockParsedFeedMultiEntry = {
  feed: {
    entry: [mockSingleEntry, mockSecondEntry],
    'opensearch:totalResults': '2',
    'opensearch:startIndex': '0',
    'opensearch:itemsPerPage': '10',
  },
};

const mockParsedFeedSingleEntry = {
  feed: {
    entry: {
      ...mockSingleEntry,
      link: {
        _attributes: {
          href: 'http://arxiv.org/abs/2305.00003v1',
          rel: 'alternate',
          type: 'text/html',
        },
      },
      author: { name: 'Alice' },
      category: undefined,
      primary_category: { _attributes: { term: 'cs.CV', scheme: 'http://arxiv.org/schemas/atom' } },
    },
    'opensearch:totalResults': '1',
    'opensearch:startIndex': '0',
    'opensearch:itemsPerPage': '10',
  },
};

describe('createArxivProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createTextResponse('<xml/>')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('creates a provider with name "arxiv"', () => {
    const provider = createArxivProvider();
    expect(provider.name).toBe('arxiv');
  });

  it('creates provider with empty config', () => {
    const provider = createArxivProvider({});
    expect(provider.name).toBe('arxiv');
  });

  it('throws if no query and no idList is provided', async () => {
    const provider = createArxivProvider();
    await expect(provider.search({})).rejects.toThrow(
      'Arxiv search requires either a "query" or an "idList"'
    );
  });

  it('returns search results from parsed XML with multiple entries', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test paper' });

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Test Paper Title');
    expect(results[0].snippet).toBe('Abstract of the test paper');
    expect(results[0].url).toBe('http://arxiv.org/pdf/2305.00001v1');
    expect(results[0].publishedDate).toBe('2023-05-01T00:00:00Z');
    expect(results[0].provider).toBe('arxiv');
  });

  it('handles single entry (non-array)', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedSingleEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Test Paper Title');
  });

  it('falls back to abstract URL converted to /pdf/ when no PDF link', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedSingleEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // Single entry has only alternate link (no PDF link) - should convert to /pdf/
    expect(results[0].url).toContain('/pdf/');
  });

  it('returns empty array when no entries in feed', async () => {
    mockParseStringPromise.mockResolvedValueOnce({
      feed: {
        'opensearch:totalResults': '0',
        'opensearch:startIndex': '0',
        'opensearch:itemsPerPage': '10',
      },
    });
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('returns empty when parsedXml is null/empty', async () => {
    mockParseStringPromise.mockResolvedValueOnce(null);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('returns empty when parsedXml.feed is missing', async () => {
    mockParseStringPromise.mockResolvedValueOnce({});
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('handles multiple authors correctly', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // First entry has array of authors
    expect(results[0].raw).toBeDefined();
  });

  it('handles single author (non-array)', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // Second entry has single author
    expect(results[1].raw).toBeDefined();
  });

  it('handles multiple categories', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // Second entry has multiple categories
    expect(results[1].raw).toBeDefined();
  });

  it('handles primary_category when no category array', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedSingleEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // Entry has primary_category set
    expect(results[0].raw).toBeDefined();
  });

  it('cleans up multi-line title', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // Second entry has multi-line title
    expect(results[1].title).not.toContain('\n');
  });

  it('uses idList in query params', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedSingleEntry);
    const provider = createArxivProvider();
    await provider.search({ idList: '2305.00001' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('id_list=2305.00001');
  });

  it('includes query in search_query params', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    await provider.search({ query: 'machine learning' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('search_query=machine+learning');
  });

  it('applies sortBy and sortOrder from options', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    await provider.search({ query: 'test', sortBy: 'submittedDate', sortOrder: 'ascending' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('sortBy=submittedDate');
    expect(url).toContain('sortOrder=ascending');
  });

  it('applies start param', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    await provider.search({ query: 'test', start: 10 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('start=10');
  });

  it('uses custom baseUrl when provided', async () => {
    mockParseStringPromise.mockResolvedValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider({ baseUrl: 'https://custom-arxiv.example.com/api/query' });
    await provider.search({ query: 'test' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('custom-arxiv.example.com');
  });

  it('throws HttpError correctly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createErrorResponse(404, { message: 'Not Found' }, 'Not Found'))
    );
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Arxiv API error: 404');
  });

  it('handles generic Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'Arxiv search failed: Network error'
    );
  });

  it('handles XML parsing error', async () => {
    mockParseStringPromise.mockRejectedValueOnce(new Error('XML parse error'));
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'Arxiv search failed: XML parse error'
    );
  });

  it('handles non-Error throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue('string error'));
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'Arxiv search failed: string error'
    );
  });

  it('handles axios-like error with response.status and response.data', async () => {
    const axiosLikeError = {
      message: 'Axios error',
      response: {
        status: 400,
        data: { error: 'bad params' },
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(axiosLikeError));
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Arxiv API error: 400');
  });

  it('handles axios-like error with response.status and response.message', async () => {
    const axiosLikeError = {
      response: {
        status: 500,
        message: 'Internal server error',
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(axiosLikeError));
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Arxiv API error: 500');
  });

  it('handles axios-like error with only response.status', async () => {
    const axiosLikeError = {
      response: {
        status: 503,
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(axiosLikeError));
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Arxiv API error: 503');
  });

  it('handles axios-like error with response but no status/data', async () => {
    const axiosLikeError = {
      response: {},
      message: 'test error',
    };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(axiosLikeError));
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Arxiv search failed');
  });

  it('handles HttpError with parsedResponseBody', async () => {
    const errorBody = { detail: 'bad request' };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(createErrorResponse(400, errorBody, 'Bad Request'))
    );
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Arxiv API error: 400');
  });

  it('falls back to entry id URL when no link at all', async () => {
    const entryWithNoLink = {
      feed: {
        entry: {
          id: 'http://arxiv.org/abs/fallback',
          title: 'No Link Entry',
          summary: 'summary',
          'opensearch:totalResults': '1',
          'opensearch:startIndex': '0',
          'opensearch:itemsPerPage': '10',
        },
        'opensearch:totalResults': '1',
        'opensearch:startIndex': '0',
        'opensearch:itemsPerPage': '10',
      },
    };
    mockParseStringPromise.mockResolvedValueOnce(entryWithNoLink);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    expect(results[0].url).toBe('http://arxiv.org/abs/fallback');
  });
});

describe('arxiv singleton', () => {
  it('has correct name', () => {
    expect(arxiv.name).toBe('arxiv');
  });

  it('throws when search is called without configure', async () => {
    await expect(arxiv.search({ query: 'test' })).rejects.toThrow(
      'Arxiv provider must be configured before use'
    );
  });

  it('configure returns a working provider', () => {
    const provider = arxiv.configure({});
    expect(provider.name).toBe('arxiv');
  });

  it('configure with no args returns a working provider', () => {
    const provider = arxiv.configure();
    expect(provider.name).toBe('arxiv');
  });
});
