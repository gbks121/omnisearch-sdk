export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface HttpRequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

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

const DEFAULT_TIMEOUT = 15000;

export async function makeRequest<T>(url: string, options: HttpRequestOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, timeout = DEFAULT_TIMEOUT } = options;

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

    const contentType =
      response.headers && typeof response.headers.get === 'function'
        ? (response.headers.get('content-type') ?? '')
        : '';

    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    } else {
      const text = await response.text();
      try {
        if (
          typeof text === 'string' &&
          (text.trim().startsWith('{') || text.trim().startsWith('['))
        ) {
          return JSON.parse(text) as T;
        }
      } catch {
        // Fallback to text
      }
      return text as unknown as T;
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeout}ms`);
      }
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
