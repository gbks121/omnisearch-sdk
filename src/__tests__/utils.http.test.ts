import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpError, makeRequest, get, post, buildUrl } from '../utils/http';

// Helper to create a mock Response
function mockResponse(status: number, body: unknown, statusText = 'OK', isJson = true): Response {
  const bodyStr = isJson ? JSON.stringify(body) : (body as string);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
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

  it('stores a response reference when provided', () => {
    const response = mockResponse(404, { error: 'Not found' });
    const error = new HttpError('Not found', 404, response);
    expect(error.response).toBe(response);
  });

  it('parseResponseBody returns null when no response is attached', async () => {
    const error = new HttpError('Test', 500);
    const result = await error.parseResponseBody();
    expect(result).toBeNull();
  });

  it('parseResponseBody parses JSON body', async () => {
    const bodyData = { error: 'something went wrong' };
    const response = mockResponse(500, bodyData);
    const error = new HttpError('Server error', 500, response);

    const result = await error.parseResponseBody();
    expect(result).toEqual(bodyData);
    expect(error.parsedResponseBody).toEqual(bodyData);
  });

  it('parseResponseBody returns raw text for non-JSON body', async () => {
    const rawText = 'plain error text';
    const response = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: vi.fn().mockRejectedValue(new Error('Not JSON')),
      text: vi.fn().mockResolvedValue(rawText),
      clone: vi.fn().mockReturnValue({
        text: vi.fn().mockResolvedValue(rawText),
      }),
    } as unknown as Response;

    const error = new HttpError('Server error', 500, response);
    const result = await error.parseResponseBody();
    expect(result).toBe(rawText);
  });

  it('parseResponseBody returns null when body reading fails', async () => {
    const response = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      clone: vi.fn().mockReturnValue({
        text: vi.fn().mockRejectedValue(new Error('Stream error')),
      }),
    } as unknown as Response;

    const error = new HttpError('Server error', 500, response);
    const result = await error.parseResponseBody();
    expect(result).toBeNull();
  });

  it('parseResponseBody uses cached responseBody if already read', async () => {
    const bodyData = { error: 'cached' };
    const response = mockResponse(500, bodyData);
    const error = new HttpError('Server error', 500, response);
    error.responseBody = JSON.stringify(bodyData);

    const result = await error.parseResponseBody();
    // clone should not be called since responseBody is already set
    expect(response.clone).not.toHaveBeenCalled();
    expect(result).toEqual(bodyData);
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

  it('does not set Content-Type if already provided', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {}));
    const body = { query: 'test' };

    await makeRequest('https://example.com/api', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const callArgs = fetchMock.mock.calls[0][1];
    expect(callArgs.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
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

  it('throws HttpError on non-OK response with simple error message', async () => {
    const errorBody = { message: 'Not found' };
    fetchMock.mockResolvedValue(mockResponse(404, errorBody, 'Not Found'));

    await expect(makeRequest('https://example.com/api')).rejects.toThrow(HttpError);
    await expect(makeRequest('https://example.com/api')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws HttpError with error field from body', async () => {
    const errorBody = { error: 'Unauthorized' };
    fetchMock.mockResolvedValueOnce(mockResponse(401, errorBody, 'Unauthorized'));
    fetchMock.mockResolvedValueOnce(mockResponse(401, errorBody, 'Unauthorized'));

    try {
      await makeRequest('https://example.com/api');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).message).toContain('Unauthorized');
    }
  });

  it('throws HttpError with Google nested error structure', async () => {
    const errorBody = {
      error: {
        message: 'API key not valid',
        errors: [{ reason: 'keyInvalid', message: 'API key not valid' }],
      },
    };
    fetchMock.mockResolvedValueOnce(mockResponse(403, errorBody, 'Forbidden'));
    fetchMock.mockResolvedValueOnce(mockResponse(403, errorBody, 'Forbidden'));

    try {
      await makeRequest('https://example.com/api');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).message).toContain('API key not valid');
    }
  });

  it('throws HttpError with Google errors array fallback when no message', async () => {
    const errorBody = {
      error: {
        errors: [{ reason: 'dailyLimitExceeded', message: 'Daily limit exceeded' }],
      },
    };
    fetchMock.mockResolvedValueOnce(mockResponse(429, errorBody, 'Too Many Requests'));
    fetchMock.mockResolvedValueOnce(mockResponse(429, errorBody, 'Too Many Requests'));

    try {
      await makeRequest('https://example.com/api');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).message).toContain('dailyLimitExceeded');
    }
  });

  it('throws HttpError with nested Google error object (no message, no errors)', async () => {
    const errorBody = { error: { code: 403, status: 'PERMISSION_DENIED' } };
    fetchMock.mockResolvedValueOnce(mockResponse(403, errorBody, 'Forbidden'));
    fetchMock.mockResolvedValueOnce(mockResponse(403, errorBody, 'Forbidden'));

    try {
      await makeRequest('https://example.com/api');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).statusCode).toBe(403);
    }
  });

  it('throws HttpError with description field from body', async () => {
    const errorBody = { description: 'Rate limit exceeded' };
    fetchMock.mockResolvedValueOnce(mockResponse(429, errorBody, 'Too Many Requests'));
    fetchMock.mockResolvedValueOnce(mockResponse(429, errorBody, 'Too Many Requests'));

    try {
      await makeRequest('https://example.com/api');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
      expect((e as HttpError).message).toContain('Rate limit exceeded');
    }
  });

  it('throws HttpError with fallback JSON stringify for complex body', async () => {
    const errorBody = { complexField: { nested: 'value' } };
    fetchMock.mockResolvedValueOnce(mockResponse(500, errorBody, 'Server Error'));
    fetchMock.mockResolvedValueOnce(mockResponse(500, errorBody, 'Server Error'));

    try {
      await makeRequest('https://example.com/api');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
    }
  });

  it('appends plain text error details to message', async () => {
    const errorText = 'Plain text error response';
    const response = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: vi.fn().mockResolvedValue(errorText),
      text: vi.fn().mockResolvedValue(errorText),
      clone: vi.fn().mockReturnValue({
        text: vi.fn().mockResolvedValue(errorText),
      }),
    } as unknown as Response;
    fetchMock.mockResolvedValueOnce(response);
    fetchMock.mockResolvedValueOnce(response);

    try {
      await makeRequest('https://example.com/api');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpError);
    }
  });

  it('throws timeout error when request exceeds timeout', async () => {
    // Simulate an abort error (what happens when AbortController.abort() is called)
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    fetchMock.mockRejectedValueOnce(abortError);

    await expect(makeRequest('https://example.com/api', { timeout: 100 })).rejects.toThrow(
      'timed out'
    );
  });

  it('re-throws non-abort errors', async () => {
    const networkError = new Error('Network error');
    fetchMock.mockRejectedValueOnce(networkError);

    await expect(makeRequest('https://example.com/api')).rejects.toThrow('Network error');
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

  it('passes options to makeRequest', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {}));
    await get('https://example.com/api', { headers: { Authorization: 'Bearer token' } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      })
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

  it('passes extra options to makeRequest', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, {}));
    await post('https://example.com/api', {}, { headers: { 'X-Custom': 'value' } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Custom': 'value' }),
      })
    );
  });
});
