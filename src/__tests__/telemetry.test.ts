import { describe, expect, it } from 'vitest';
import { RateLimitError } from '../types';
import { extractRateLimitTelemetry, HttpError } from '../utils/http';

describe('Rate limit telemetry extraction', () => {
  it('should parse rate limit and retry-after headers', () => {
    const headers = new Headers({
      'x-ratelimit-limit': '100',
      'x-ratelimit-remaining': '42',
      'x-ratelimit-reset': '1774350000',
      'retry-after': '60',
    });

    const telemetry = extractRateLimitTelemetry(headers);
    expect(telemetry).toEqual({
      limit: 100,
      remaining: 42,
      reset: 1774350000,
      retryAfter: 60,
    });
  });

  it('should attach telemetry to HttpError', () => {
    const headers = new Headers({
      'x-ratelimit-remaining': '0',
      'retry-after': '30',
    });
    const fakeResponse = new Response('Too Many Requests', { status: 429, headers });
    const httpErr = new HttpError('429', 429, fakeResponse);

    expect(httpErr.telemetry).toBeDefined();
    expect(httpErr.telemetry?.remaining).toBe(0);
    expect(httpErr.telemetry?.retryAfter).toBe(30);
  });

  it('should propagate telemetry into RateLimitError', () => {
    const telemetry = { limit: 100, remaining: 0, retryAfter: 15 };
    const err = new RateLimitError('Brave', { statusCode: 429, telemetry });

    expect(err.telemetry).toEqual(telemetry);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMIT');
  });
});
