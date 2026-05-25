import { ResultAsync, err, ok } from 'neverthrow';

/**
 * HTTP request method types
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/**
 * Options for HTTP requests
 */
export interface HttpRequestOptions {
  /** HTTP method for the request */
  method?: HttpMethod;
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (for POST, PUT, PATCH) */
  body?: unknown;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Error class for HTTP request failures
 */
export class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly response?: Response,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Default timeout for HTTP requests in milliseconds (15 seconds)
 */
const DEFAULT_TIMEOUT = 15000;

/**
 * Makes an HTTP request to the specified URL with the given options, returning a ResultAsync
 *
 * @param url The URL to make the request to
 * @param options Request options including method, headers, body, and timeout
 * @returns ResultAsync that resolves to the response data or an Error/HttpError
 */
export function makeRequest<T>(
  url: string,
  options: HttpRequestOptions = {}
): ResultAsync<T, HttpError | Error> {
  const { method = 'GET', headers = {}, body, timeout = DEFAULT_TIMEOUT } = options;

  return ResultAsync.fromPromise(
    (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        const requestOptions: RequestInit = {
          method,
          headers: {
            Accept: 'application/json',
            ...headers,
          },
          signal: controller.signal,
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
            const body = responseBody as any;
            const extra = body.message || body.error || body.detail || body.error_message || body.errorMessage;
            if (extra && typeof extra === 'string') {
              message += ` - ${extra}`;
            }
          }

          throw new HttpError(message, response.status, response, responseBody);
        }

        const contentType = response.headers && typeof response.headers.get === 'function' 
          ? (response.headers.get('content-type') ?? '')
          : '';
          
        if (contentType.includes('application/json')) {
          return (await response.json()) as T;
        } else {
          const text = await response.text();
          try {
            // Try parsing as JSON anyway if it looks like JSON
            if (typeof text === 'string' && (text.trim().startsWith('{') || text.trim().startsWith('['))) {
              return JSON.parse(text) as T;
            }
          } catch {
            // Fallback to text
          }
          return text as unknown as T;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    })(),
    (e) => {
      if (e instanceof HttpError) return e;
      if (e instanceof Error) {
        if (e.name === 'AbortError') {
          return new Error(`Request timed out after ${timeout}ms`);
        }
        return e;
      }
      return new Error(String(e));
    }
  );
}

/**
 * Makes a GET request to the specified URL
 */
export function get<T>(
  url: string,
  options: Omit<HttpRequestOptions, 'method'> = {}
): ResultAsync<T, HttpError | Error> {
  return makeRequest<T>(url, { ...options, method: 'GET' });
}

/**
 * Makes a POST request to the specified URL
 */
export function post<T>(
  url: string,
  body: unknown,
  options: Omit<HttpRequestOptions, 'method' | 'body'> = {}
): ResultAsync<T, HttpError | Error> {
  return makeRequest<T>(url, { ...options, method: 'POST', body });
}

/**
 * Builds a URL with query parameters from a base URL and a params object
 */
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
