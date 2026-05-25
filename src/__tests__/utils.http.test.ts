import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpError, makeRequest, get, post, buildUrl } from '../utils/http';

// Helper to create a mock Response
function mockResponse(status: number, body: unknown, statusText = 'OK', isJson = true): Response {
  const bodyStr = isJson ? JSON.stringify(body) : (body as string);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: new Map([['content-type', isJson ? 'application/json' : 'text/plain']]),
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(bodyStr),
    clone: vi.fn().mockReturnValue({
      text: vi.fn().mockResolvedValue(bodyStr),
    }),
  } as unknown as Response;
}

describe('HttpError', () => {
  it('creates an error with the correct properties', () => {
    const error = new HttpError('Test error', 404);
    expect(error.name).toBe('HttpError');
    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(404);
    expect(error.response).toBeUndefined();
  });

  it('stores a response reference and body when provided', () => {
    const response = mockResponse(404, { error: 'Not found' });
    const responseBody = { error: 'Not found' };
    const error = new HttpError('Not found', 404, response, responseBody);
    expect(error.response).toBe(response);
    expect(error.responseBody).toEqual(responseBody);
  });
});

describe('buildUrl', () => {
  it('throws on empty base URL', () => {
    expect(() => buildUrl('', { q: 'test' })).toThrow('non-empty base URL');
  });

  it('builds a URL with query parameters', () => {
    const url = buildUrl('https://example.com/search', { q: 'test', count: 10 });
    expect(url).toBe('https://example.com/search?q=test&count=10');
  });

  it('omits undefined values', () => {
    const url = buildUrl('https://example.com/search', {
      q: 'test',
      page: undefined,
      count: 5,
    });
    expect(url).not.toContain('page');
    expect(url).toContain('q=test');
    expect(url).toContain('count=5');
  });

  it('handles boolean values', () => {
    const url = buildUrl('https://example.com/api', { active: true, deleted: false });
    expect(url).toContain('active=true');
    expect(url).toContain('deleted=false');
  });

  it('preserves existing query parameters in base URL', () => {
    const url = buildUrl('https://example.com/api?version=1', { q: 'test' });
    expect(url).toContain('version=1');
    expect(url).toContain('q=test');
  });

  it('handles empty params object', () => {
    const url = buildUrl('https://example.com/search', {});
    expect(url).toBe('https://example.com/search');
  });
});

describe('makeRequest', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes a GET request and returns parsed JSON', async () => {
    const responseData = { result: 'success' };
    fetchMock.mockResolvedValueOnce(mockResponse(200, responseData));

    const result = await makeRequest<typeof responseData>('https://example.com/api');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(responseData);
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('adds Accept header by default', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {}));

    await makeRequest('https://example.com/api');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'application/json' }),
      })
    );
  });

  it('merges custom headers with defaults', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {}));

    await makeRequest('https://example.com/api', {
      headers: { Authorization: 'Bearer token' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          Authorization: 'Bearer token',
        }),
      })
    );
  });

  it('sends JSON body for POST requests with object body', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {}));
    const body = { query: 'test' };

    await makeRequest('https://example.com/api', { method: 'POST', body });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(body),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('does not send body for GET requests', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {}));

    await makeRequest('https://example.com/api', {
      method: 'GET',
      body: { data: 'test' },
    });

    const callArgs = fetchMock.mock.calls[0][1];
    expect(callArgs.body).toBeUndefined();
  });

  it('returns HttpError on non-OK response', async () => {
    const errorBody = { message: 'Not found' };
    fetchMock.mockResolvedValue(mockResponse(404, errorBody, 'Not Found'));

    const result = await makeRequest('https://example.com/api');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(HttpError);
      const httpErr = result.error as HttpError;
      expect(httpErr.statusCode).toBe(404);
      expect(httpErr.responseBody).toEqual(errorBody);
    }
  });

  it('returns timeout error when request exceeds timeout', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortError);

    const result = await makeRequest('https://example.com/api', { timeout: 100 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain('timed out');
    }
  });

  it('returns other errors', async () => {
    const networkError = new Error('Network error');
    fetchMock.mockRejectedValueOnce(networkError);

    const result = await makeRequest('https://example.com/api');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe('Network error');
    }
  });
});

describe('get', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes a GET request', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { data: 'test' }));
    const result = await get<{ data: string }>('https://example.com/api');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ data: 'test' });
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({ method: 'GET' })
    );
  });
});

describe('post', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('makes a POST request with body', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { success: true }));
    const body = { query: 'test search' };
    const result = await post<{ success: boolean }>('https://example.com/api', body);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ success: true });
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })
    );
  });
});
