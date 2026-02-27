import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock factories, making mockParseFn available
// inside the factory closure without hitting a temporal-dead-zone error.
const { mockParseFn } = vi.hoisted(() => ({ mockParseFn: vi.fn() }));

vi.mock('fast-xml-parser', () => ({
  XMLParser: class {
    parse = mockParseFn;
  },
}));

import { createArxivProvider, arxiv } from '../providers/arxiv';

const getMockParse = () => mockParseFn;

function createTextResponse(body: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'text/xml' },
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
    headers: { get: () => 'application/json' },
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(bodyStr),
    clone: vi.fn().mockReturnValue({ text: vi.fn().mockResolvedValue(bodyStr) }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Mock feed data — flat fast-xml-parser shape (no _attributes / _text wrappers)
// ---------------------------------------------------------------------------
const mockSingleEntry = {
  id: 'http://arxiv.org/abs/2305.00001v1',
  updated: '2023-05-01T00:00:00Z',
  published: '2023-05-01T00:00:00Z',
  title: 'Test Paper Title',
  summary: 'Abstract of the test paper',
  author: [{ name: 'John Doe' }, { name: 'Jane Smith' }],
  link: [
    { href: 'http://arxiv.org/abs/2305.00001v1', rel: 'alternate', type: 'text/html' },
    {
      href: 'http://arxiv.org/pdf/2305.00001v1',
      rel: 'related',
      type: 'application/pdf',
      title: 'pdf',
    },
  ],
  category: [{ term: 'cs.AI', scheme: 'http://arxiv.org/schemas/atom' }],
};

const mockSecondEntry = {
  id: 'http://arxiv.org/abs/2305.00002v1',
  updated: '2023-05-02T00:00:00Z',
  published: '2023-05-02T00:00:00Z',
  title: 'Another\n  Paper',
  summary: 'Multi-line\n  summary text',
  author: [{ name: 'Bob Johnson' }],
  link: [{ href: 'http://arxiv.org/abs/2305.00002v1', rel: 'alternate', type: 'text/html' }],
  category: [
    { term: 'cs.LG', scheme: 'http://arxiv.org/schemas/atom' },
    { term: 'stat.ML', scheme: 'http://arxiv.org/schemas/atom' },
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

// Single entry — alternate link only (no explicit PDF link), no categories
const mockSingleEntryNoPdf = {
  ...mockSingleEntry,
  link: [{ href: 'http://arxiv.org/abs/2305.00003v1', rel: 'alternate', type: 'text/html' }],
  author: [{ name: 'Alice' }],
  category: [],
};

const mockParsedFeedSingleEntry = {
  feed: {
    entry: [mockSingleEntryNoPdf],
    'opensearch:totalResults': '1',
    'opensearch:startIndex': '0',
    'opensearch:itemsPerPage': '10',
  },
};

// ---------------------------------------------------------------------------

describe('createArxivProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createTextResponse('<xml/>')));
    getMockParse().mockReturnValue(mockParsedFeedMultiEntry);
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
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test paper' });

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Test Paper Title');
    expect(results[0].snippet).toBe('Abstract of the test paper');
    expect(results[0].url).toBe('http://arxiv.org/pdf/2305.00001v1');
    expect(results[0].publishedDate).toBe('2023-05-01T00:00:00Z');
    expect(results[0].provider).toBe('arxiv');
  });

  it('handles single entry in array', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedSingleEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Test Paper Title');
  });

  it('falls back to abstract URL converted to /pdf/ when no PDF link', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedSingleEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // Has only alternate link → converted to /pdf/
    expect(results[0].url).toContain('/pdf/');
    expect(results[0].url).toBe('http://arxiv.org/pdf/2305.00003v1');
  });

  it('returns empty array when no entries in feed', async () => {
    getMockParse().mockReturnValueOnce({
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
    getMockParse().mockReturnValueOnce(null);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('returns empty when parsedXml.feed is missing', async () => {
    getMockParse().mockReturnValueOnce({});
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    expect(results).toEqual([]);
  });

  it('handles multiple authors correctly', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // First entry has 2 authors
    expect((results[0] as { authors?: string[] }).authors).toEqual(['John Doe', 'Jane Smith']);
  });

  it('handles single author in array', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // Second entry has single author array
    expect((results[1] as { authors?: string[] }).authors).toEqual(['Bob Johnson']);
  });

  it('handles multiple categories', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // Second entry has 2 categories
    expect((results[1] as { categories?: string[] }).categories).toEqual(['cs.LG', 'stat.ML']);
  });

  it('extracts single category correctly', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    expect((results[0] as { categories?: string[] }).categories).toEqual(['cs.AI']);
  });

  it('cleans up multi-line title', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    // Second entry has multi-line title
    expect(results[1].title).toBe('Another Paper');
    expect(results[1].title).not.toContain('\n');
  });

  it('cleans up multi-line summary', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    const results = await provider.search({ query: 'test' });
    expect(results[1].snippet).toBe('Multi-line summary text');
  });

  it('uses idList in query params', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedSingleEntry);
    const provider = createArxivProvider();
    await provider.search({ idList: '2305.00001' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('id_list=2305.00001');
  });

  it('includes query in search_query params', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    await provider.search({ query: 'machine learning' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('search_query=machine+learning');
  });

  it('applies sortBy and sortOrder from options', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    await provider.search({ query: 'test', sortBy: 'submittedDate', sortOrder: 'ascending' });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('sortBy=submittedDate');
    expect(url).toContain('sortOrder=ascending');
  });

  it('applies start param', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
    const provider = createArxivProvider();
    await provider.search({ query: 'test', start: 10 });
    const url = (vi.mocked(globalThis.fetch) as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('start=10');
  });

  it('uses custom baseUrl when provided', async () => {
    getMockParse().mockReturnValueOnce(mockParsedFeedMultiEntry);
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

  it('handles XML parsing error thrown by XMLParser.parse()', async () => {
    getMockParse().mockImplementationOnce(() => {
      throw new Error('XML parse error');
    });
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

  it('wraps plain objects thrown as errors', async () => {
    const plainObject = { message: 'something went wrong' };
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(plainObject));
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow('Arxiv search failed');
  });

  it('wraps Error subclasses as standard Error message', async () => {
    class CustomError extends Error {
      constructor() {
        super('custom error message');
        this.name = 'CustomError';
      }
    }
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new CustomError()));
    const provider = createArxivProvider();
    await expect(provider.search({ query: 'test' })).rejects.toThrow(
      'Arxiv search failed: custom error message'
    );
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
    getMockParse().mockReturnValueOnce({
      feed: {
        entry: [
          {
            id: 'http://arxiv.org/abs/fallback',
            title: 'No Link Entry',
            summary: 'summary',
            published: '2023-01-01',
            updated: '2023-01-01',
            author: [],
            link: [],
            category: [],
          },
        ],
        'opensearch:totalResults': '1',
        'opensearch:startIndex': '0',
        'opensearch:itemsPerPage': '10',
      },
    });
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
