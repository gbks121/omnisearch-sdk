import { describe, expect, it } from 'vitest';
import { AbstractSearchProvider } from '../providers/base';
import type { ProviderConfig, SearchQuery, SearchResult } from '../types';

class TestSearchProvider extends AbstractSearchProvider {
  public readonly name = 'test-provider';
  public mockResults: SearchResult[] = [];

  constructor(config: ProviderConfig = {}) {
    super(config);
  }

  protected async doSearch(_options: SearchQuery): Promise<SearchResult[]> {
    return this.mockResults;
  }
}

describe('Domain filtering in AbstractSearchProvider', () => {
  const provider = new TestSearchProvider();

  const mockData: SearchResult[] = [
    { url: 'https://allowed.com/page1', title: 'Allowed 1', provider: 'test' },
    { url: 'https://sub.allowed.com/page2', title: 'Sub Allowed 2', provider: 'test' },
    { url: 'https://blocked.com/bad', title: 'Blocked 1', provider: 'test' },
    { url: 'https://news.blocked.com/spam', title: 'Sub Blocked 2', provider: 'test' },
    { url: 'https://neutral.org/info', title: 'Neutral', provider: 'test' },
  ];

  it('should filter results by includeDomains including subdomains', async () => {
    provider.mockResults = [...mockData];
    const results = await provider.search({
      query: 'test',
      includeDomains: ['allowed.com'],
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.url)).toEqual([
      'https://allowed.com/page1',
      'https://sub.allowed.com/page2',
    ]);
  });

  it('should filter out results by excludeDomains including subdomains', async () => {
    provider.mockResults = [...mockData];
    const results = await provider.search({
      query: 'test',
      excludeDomains: ['blocked.com'],
    });

    expect(results).toHaveLength(3);
    expect(results.map((r) => r.url)).toEqual([
      'https://allowed.com/page1',
      'https://sub.allowed.com/page2',
      'https://neutral.org/info',
    ]);
  });

  it('should handle both includeDomains and excludeDomains together', async () => {
    provider.mockResults = [...mockData];
    const results = await provider.search({
      query: 'test',
      includeDomains: ['allowed.com', 'blocked.com'],
      excludeDomains: ['blocked.com'],
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.url)).toEqual([
      'https://allowed.com/page1',
      'https://sub.allowed.com/page2',
    ]);
  });
});
