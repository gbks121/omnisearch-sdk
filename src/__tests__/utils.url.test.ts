import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../types';
import { dedupeResults, normalizeUrl } from '../utils/url';

describe('normalizeUrl', () => {
  it('should normalize protocol to https and lowercase hostname', () => {
    expect(normalizeUrl('http://EXAMPLE.COM/path')).toBe('https://example.com/path');
  });

  it('should strip default tracking parameters while keeping content params', () => {
    const raw =
      'https://example.com/article?utm_source=twitter&utm_medium=social&id=123&fbclid=xyz&ref=rss';
    expect(normalizeUrl(raw)).toBe('https://example.com/article?id=123');
  });

  it('should sort remaining query parameters canonically', () => {
    const raw = 'https://example.com/search?z=3&a=1&m=2';
    expect(normalizeUrl(raw)).toBe('https://example.com/search?a=1&m=2&z=3');
  });

  it('should normalize trailing slashes on subpaths but keep root slash', () => {
    expect(normalizeUrl('https://example.com/docs/')).toBe('https://example.com/docs');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('should remove fragment hashes', () => {
    expect(normalizeUrl('https://example.com/page#section-2')).toBe('https://example.com/page');
  });

  it('should not strip www by default', () => {
    expect(normalizeUrl('https://www.example.com/test')).toBe('https://www.example.com/test');
  });

  it('should strip www when stripWww is true', () => {
    expect(normalizeUrl('https://www.example.com/test', { stripWww: true })).toBe(
      'https://example.com/test'
    );
  });

  it('should strip all query parameters when stripQueryParams is true', () => {
    expect(
      normalizeUrl('https://example.com/test?foo=bar&baz=qux', { stripQueryParams: true })
    ).toBe('https://example.com/test');
  });

  it('should support custom tracking params', () => {
    expect(
      normalizeUrl('https://example.com/test?custom_tracker=999&keep=me', {
        customTrackingParams: ['custom_tracker'],
      })
    ).toBe('https://example.com/test?keep=me');
  });
});

describe('dedupeResults', () => {
  it('should deduplicate results having identical canonical URLs', () => {
    const results: SearchResult[] = [
      {
        url: 'https://example.com/news?utm_source=twitter',
        title: 'Title 1',
        snippet: 'Snippet 1',
        provider: 'brave',
      },
      {
        url: 'http://example.com/news/?fbclid=12345',
        title: 'Title 2 (duplicate)',
        snippet: 'Snippet 2',
        provider: 'google',
      },
      {
        url: 'https://example.com/other',
        title: 'Title 3',
        snippet: 'Snippet 3',
        provider: 'tavily',
      },
    ];

    const deduped = dedupeResults(results);
    expect(deduped).toHaveLength(2);
    expect(deduped[0].provider).toBe('brave');
    expect(deduped[1].provider).toBe('tavily');
  });

  it('should write the canonical URL back onto returned items', () => {
    const results: SearchResult[] = [
      {
        url: 'https://example.com/article?utm_source=twitter&fbclid=abc123&id=9',
        title: 'Tracked URL',
        provider: 'brave',
      },
      {
        url: 'not a valid url',
        title: 'Unparseable URL',
        provider: 'tavily',
      },
    ];

    const deduped = dedupeResults(results);
    expect(deduped[0].url).toBe('https://example.com/article?id=9');
    expect(deduped[1].url).toBe('not a valid url');
  });
});
