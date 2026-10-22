import type { RateLimitTelemetry } from '../types';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface HttpRequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  signal?: AbortSignal;
  /** Maximum response body size in bytes (default: 5 MB). */
  maxResponseBytes?: number;
  /** Invoked on 2xx responses with rate-limit telemetry extracted from response headers. */
  onTelemetry?: (telemetry: RateLimitTelemetry | undefined) => void;
}

export function extractRateLimitTelemetry(headers?: Headers): RateLimitTelemetry | undefined {
  if (!headers || typeof headers.get !== 'function') return undefined;

  const getHeader = (names: string[]): string | null => {
    for (const name of names) {
      const val = headers.get(name);
      if (val !== null && val !== undefined) return val;
    }
    return null;
  };

  const limitStr = getHeader([
    'x-ratelimit-limit',
    'ratelimit-limit',
    'x-ratelimit-limit-requests',
  ]);
  const remainingStr = getHeader([
    'x-ratelimit-remaining',
    'ratelimit-remaining',
    'x-ratelimit-remaining-requests',
  ]);
  const resetStr = getHeader([
    'x-ratelimit-reset',
    'ratelimit-reset',
    'x-ratelimit-reset-requests',
  ]);
  const retryAfterStr = getHeader(['retry-after']);

  const limit = limitStr ? Number.parseInt(limitStr, 10) : undefined;
  const remaining = remainingStr ? Number.parseInt(remainingStr, 10) : undefined;
  const reset = resetStr ? Number.parseInt(resetStr, 10) : undefined;
  const retryAfter = retryAfterStr ? Number.parseInt(retryAfterStr, 10) : undefined;

  const validLimit = limit !== undefined && !Number.isNaN(limit) ? limit : undefined;
  const validRemaining =
    remaining !== undefined && !Number.isNaN(remaining) ? remaining : undefined;
  const validReset = reset !== undefined && !Number.isNaN(reset) ? reset : undefined;
  const validRetryAfter =
    retryAfter !== undefined && !Number.isNaN(retryAfter) ? retryAfter : undefined;

  if (
    validLimit !== undefined ||
    validRemaining !== undefined ||
    validReset !== undefined ||
    validRetryAfter !== undefined
  ) {
    return {
      limit: validLimit,
      remaining: validRemaining,
      reset: validReset,
      retryAfter: validRetryAfter,
    };
  }

  return undefined;
}

export class HttpError extends Error {
  public readonly telemetry?: RateLimitTelemetry;

  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: Response,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
    if (response?.headers) {
      this.telemetry = extractRateLimitTelemetry(response.headers);
    }
  }
}

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const headers = response.headers;
  const contentLengthHeader =
    headers && typeof headers.get === 'function' ? headers.get('content-length') : null;
  if (contentLengthHeader) {
    const contentLength = Number.parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > maxBytes) {
      throw new HttpError(
        `Response body exceeded maximum allowed size (${maxBytes} bytes)`,
        413,
        response
      );
    }
  }

  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    return response.text();
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Stream may already be closed
        }
        throw new HttpError(
          `Response body exceeded maximum allowed size (${maxBytes} bytes)`,
          413,
          response
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Stream may already be closed
    }
    throw error;
  }

  return text;
}

export async function makeRequest<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = DEFAULT_TIMEOUT,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const signal = options.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;

    const requestOptions: RequestInit = {
      method,
      headers: {
        Accept: 'application/json',
        ...headers,
      },
      signal,
    };

    if (body && method !== 'GET') {
      if (typeof body === 'object') {
        requestOptions.body = JSON.stringify(body);
        if (!headers['Content-Type']) {
          requestOptions.headers = {
            ...requestOptions.headers,
            'Content-Type': 'application/json',
          };
        }
      } else {
        requestOptions.body = body as RequestInit['body'];
      }
    }

    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      let responseBody: unknown;
      let bodyText = '';
      try {
        bodyText = await response.text();
        try {
          responseBody = JSON.parse(bodyText);
        } catch {
          responseBody = bodyText;
        }
      } catch {
        responseBody = null;
      }

      let message = `Request failed with status: ${response.status} ${response.statusText}`;
      if (typeof responseBody === 'string' && responseBody) {
        message += ` - ${responseBody}`;
      } else if (responseBody && typeof responseBody === 'object') {
        const bodyObj = responseBody as Record<string, unknown>;
        const extra =
          bodyObj.message ||
          bodyObj.error ||
          bodyObj.detail ||
          bodyObj.error_message ||
          bodyObj.errorMessage;
        if (extra && typeof extra === 'string') {
          message += ` - ${extra}`;
        }
      }

      throw new HttpError(message, response.status, response, responseBody);
    }

    options.onTelemetry?.(extractRateLimitTelemetry(response.headers));

    const contentType =
      response.headers && typeof response.headers.get === 'function'
        ? (response.headers.get('content-type') ?? '')
        : '';

    const bodyText = await readBoundedText(response, maxResponseBytes);

    if (contentType.includes('application/json')) {
      return JSON.parse(bodyText) as T;
    }
    try {
      const trimmed = bodyText.trim();
      if (typeof bodyText === 'string' && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
        return JSON.parse(bodyText) as T;
      }
    } catch {
      // Fallback to text
    }
    return bodyText as unknown as T;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if ((error as { name?: string } | null)?.name === 'AbortError') {
      if (options.signal?.aborted) {
        throw error;
      }
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  } finally {
    clearTimeout(timeoutId);
  }
}

export function get<T>(url: string, options: Omit<HttpRequestOptions, 'method'> = {}): Promise<T> {
  return makeRequest<T>(url, { ...options, method: 'GET' });
}

export function post<T>(
  url: string,
  body: unknown,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): Promise<T> {
  return makeRequest<T>(url, { ...options, method: 'POST', body });
}

export function buildUrl(
  baseUrl: string,
  params: Record<string, string | number | boolean | undefined>
): string {
  if (!baseUrl) {
    throw new Error('buildUrl requires a non-empty base URL');
  }

  const url = new URL(baseUrl);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });

  return url.toString();
}
