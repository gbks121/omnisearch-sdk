import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubProvider } from '../providers/github';

function mockFetch(status: number, body: unknown, statusText = 'OK'): void {
  const bodyStr = JSON.stringify(body);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      json: vi.fn().mockResolvedValue(body),
      text: vi.fn().mockResolvedValue(bodyStr),
      clone: vi.fn().mockReturnValue({ text: vi.fn().mockResolvedValue(bodyStr) }),
    })
  );
}

describe('createGitHubProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should search repositories and format code metadata', async () => {
    const mockResponse = {
      total_count: 1,
      incomplete_results: false,
      items: [
        {
          id: 1024,
          name: 'omnisearch-sdk',
          full_name: 'gbks121/omnisearch-sdk',
          html_url: 'https://github.com/gbks121/omnisearch-sdk',
          description: 'Unified search sdk for web providers',
          language: 'TypeScript',
          stargazers_count: 350,
          updated_at: '2026-03-01T12:00:00Z',
          owner: { login: 'gbks121' },
        },
      ],
    };

    mockFetch(200, mockResponse);

    const provider = createGitHubProvider();
    const results = await provider.search({ query: 'omnisearch' });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('gbks121/omnisearch-sdk');
    expect(results[0].url).toBe('https://github.com/gbks121/omnisearch-sdk');
    expect(results[0].provider).toBe('github');
    expect(results[0].snippet).toContain('TypeScript');
    expect(results[0].snippet).toContain('★ 350');
  });

  it('should format troubleshooting message on 403 rate limit', async () => {
    mockFetch(403, { message: 'API rate limit exceeded' }, 'Forbidden');

    const provider = createGitHubProvider();
    await expect(provider.search({ query: 'repo' })).rejects.toThrow('GitHub rate limit exceeded');
  });

  it.each(['day', 'week'] as const)(
    'should append pushed:>=YYYY-MM-DD when freshness is %s',
    async (freshness) => {
      mockFetch(200, { total_count: 0, incomplete_results: false, items: [] });

      const provider = createGitHubProvider();
      await provider.search({ query: 'omnisearch', freshness });

      const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      const q = new URL(url).searchParams.get('q') ?? '';
      expect(q).toContain('omnisearch');
      expect(q).toMatch(/pushed:>=\d{4}-\d{2}-\d{2}$/);
    }
  );

  it('should not duplicate pushed qualifier when query already has one', async () => {
    mockFetch(200, { total_count: 0, incomplete_results: false, items: [] });

    const provider = createGitHubProvider();
    await provider.search({ query: 'omnisearch pushed:>=2020-01-01', freshness: 'week' });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const q = new URL(url).searchParams.get('q') ?? '';
    expect(q.match(/pushed:>=/g)).toHaveLength(1);
  });

  it('should not append pushed qualifier without freshness', async () => {
    mockFetch(200, { total_count: 0, incomplete_results: false, items: [] });

    const provider = createGitHubProvider();
    await provider.search({ query: 'omnisearch' });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    const q = new URL(url).searchParams.get('q') ?? '';
    expect(q).toBe('omnisearch');
  });
});
