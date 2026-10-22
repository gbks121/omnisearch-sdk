import type { ProviderConfig, SearchQuery, SearchResult } from '../types';
import { buildUrl, clampMaxResults, extractDomain, get } from '../utils';
import { AbstractSearchProvider } from './base';

interface GitHubRepoItem {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  pushed_at?: string;
  owner?: {
    login: string;
  };
}

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepoItem[];
}

export interface GitHubConfig extends ProviderConfig {
  baseUrl?: string;
  userAgent?: string;
}

const DEFAULT_BASE_URL = 'https://api.github.com/search/repositories';

export class GitHubSearchProvider extends AbstractSearchProvider<GitHubConfig> {
  public readonly name = 'github';
  protected override get displayName(): string {
    return 'GitHub';
  }

  constructor(config: GitHubConfig = {}) {
    super(config);
  }

  protected getTroubleshooting(_error: Error, statusCode?: number): string {
    if (statusCode === 403 || statusCode === 429) {
      return 'GitHub rate limit exceeded. Unauthenticated requests are limited to 10 queries per minute. Supply a personal access token (apiKey) to increase limits.';
    }
    if (statusCode === 401) {
      return 'Authentication failed. Check your GitHub personal access token.';
    }
    return '';
  }

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    const { query, maxResults = 10, page = 1, timeout } = options;

    if (!query?.trim()) {
      throw new Error('GitHub search requires a query.');
    }

    const clampedMaxResults = clampMaxResults(maxResults, 1, 100);
    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;

    const params: Record<string, string | number | undefined> = {
      q: query.trim(),
      per_page: clampedMaxResults,
      page,
    };

    const url = buildUrl(baseUrl, params);
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': this.config.userAgent || 'omnisearch-sdk',
    };
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const response = await get<GitHubSearchResponse>(url, { headers, timeout });

    if (!response.items || response.items.length === 0) {
      return [];
    }

    return response.items.map((repo) => {
      const details = [
        repo.description,
        repo.language ? `Language: ${repo.language}` : null,
        `★ ${repo.stargazers_count}`,
      ]
        .filter(Boolean)
        .join(' | ');

      return {
        url: repo.html_url,
        title: repo.full_name,
        snippet: details || undefined,
        domain: extractDomain(repo.html_url),
        publishedDate: repo.pushed_at || repo.updated_at,
        provider: 'github',
        raw: repo,
      };
    });
  }
}

export function createGitHubProvider(config?: GitHubConfig): GitHubSearchProvider {
  return new GitHubSearchProvider(config);
}

export const createGithubProvider = createGitHubProvider;
