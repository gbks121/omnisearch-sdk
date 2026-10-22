import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildUrl, get, HttpError, makeRequest, post } from '../utils/http';

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
    expect(result).toEqual(responseData);
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

  it('throws HttpError on non-OK response', async () => {
    const errorBody = { message: 'Not found' };
    fetchMock.mockResolvedValue(mockResponse(404, errorBody, 'Not Found'));

    try {
      await makeRequest('https://example.com/api');
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      const httpErr = error as HttpError;
      expect(httpErr.statusCode).toBe(404);
      expect(httpErr.responseBody).toEqual(errorBody);
    }
  });

  it('throws timeout error when request exceeds timeout', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortError);

    try {
      await makeRequest('https://example.com/api', { timeout: 100 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toContain('timed out');
    }
  });

  it('throws other errors', async () => {
    const networkError = new Error('Network error');
    fetchMock.mockRejectedValueOnce(networkError);

    try {
      await makeRequest('https://example.com/api');
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).message).toBe('Network error');
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
    expect(result).toEqual({ data: 'test' });
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
    expect(result).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) })
    );
  });
});

describe('makeRequest telemetry, abort, and bounded reads', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts rate-limit telemetry from 200 OK responses via onTelemetry', async () => {
    const headers = new Headers({
      'x-ratelimit-limit': '100',
      'x-ratelimit-remaining': '42',
      'x-ratelimit-reset': '1774350000',
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers,
      text: vi.fn().mockResolvedValue(JSON.stringify({ ok: true })),
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as Response);

    const onTelemetry = vi.fn();
    const result = await makeRequest<{ ok: boolean }>('https://example.com/api', { onTelemetry });

    expect(result).toEqual({ ok: true });
    expect(onTelemetry).toHaveBeenCalledTimes(1);
    expect(onTelemetry).toHaveBeenCalledWith({
      limit: 100,
      remaining: 42,
      reset: 1774350000,
      retryAfter: undefined,
    });
  });

  it('parses vendor -requests rate-limit header variants', async () => {
    const headers = new Headers({
      'x-ratelimit-limit-requests': '60',
      'x-ratelimit-remaining-requests': '3',
      'x-ratelimit-reset-requests': '1774350000',
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers,
      text: vi.fn().mockResolvedValue(JSON.stringify({ ok: true })),
      json: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as Response);

    const onTelemetry = vi.fn();
    await makeRequest('https://example.com/api', { onTelemetry });

    expect(onTelemetry).toHaveBeenCalledWith({
      limit: 60,
      remaining: 3,
      reset: 1774350000,
      retryAfter: undefined,
    });
  });

  it('aborts an in-flight fetch when the external signal aborts', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const abortError = new Error('The operation was aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          });
        })
    );

    const controller = new AbortController();
    const promise = makeRequest('https://example.com/slow', { signal: controller.signal });

    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort();

    try {
      await promise;
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect((error as Error).name).toBe('AbortError');
      expect((error as Error).message).not.toContain('timed out');
    }
  });

  it('throws HttpError 413 when Content-Length exceeds maxResponseBytes', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/plain', 'content-length': '100' }),
      text: vi.fn(),
    } as unknown as Response);

    try {
      await makeRequest('https://example.com/huge', { maxResponseBytes: 10 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(413);
      expect((error as HttpError).message).toContain('exceeded maximum allowed size');
    }
  });

  it('throws HttpError 413 when streamed body exceeds maxResponseBytes', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('a'.repeat(100)));
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/plain' }),
      body,
    } as unknown as Response);

    try {
      await makeRequest('https://example.com/huge', { maxResponseBytes: 10 });
      expect.unreachable('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(413);
    }
  });

  it('returns full body when stream is within maxResponseBytes', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello'));
        controller.close();
      },
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/plain' }),
      body,
    } as unknown as Response);

    const result = await makeRequest<string>('https://example.com/ok', { maxResponseBytes: 100 });
    expect(result).toBe('hello');
  });
});
