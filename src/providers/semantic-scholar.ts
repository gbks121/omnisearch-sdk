import type { ProviderConfig, SearchQuery, SearchResult } from '../types';
import { buildUrl, clampMaxResults, extractDomain, get } from '../utils';
import { AbstractSearchProvider } from './base';

interface SemanticScholarPaper {
  paperId: string;
  title: string;
  url?: string;
  abstract?: string;
  year?: number;
  publicationDate?: string;
  authors?: Array<{ authorId?: string; name: string }>;
}

interface SemanticScholarResponse {
  total?: number;
  offset?: number;
  data?: SemanticScholarPaper[];
}

export interface SemanticScholarConfig extends ProviderConfig {
  baseUrl?: string;
}

const DEFAULT_BASE_URL = 'https://api.semanticscholar.org/graph/v1/paper/search';

export class SemanticScholarSearchProvider extends AbstractSearchProvider<SemanticScholarConfig> {
  public readonly name = 'semanticscholar';
  protected override get displayName(): string {
    return 'Semantic Scholar';
  }

  constructor(config: SemanticScholarConfig = {}) {
    super(config);
  }

  protected getTroubleshooting(_error: Error, statusCode?: number): string {
    if (statusCode === 429) {
      return 'Semantic Scholar rate limit exceeded. Consider registering for an official API key or spacing requests.';
    }
    if (statusCode && statusCode >= 500) {
      return 'Semantic Scholar API is currently experiencing upstream problems.';
    }
    return '';
  }

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    const { query, maxResults = 10, page = 1, timeout } = options;

    if (!query?.trim()) {
      throw new Error('Semantic Scholar search requires a query.');
    }

    const clampedMaxResults = clampMaxResults(maxResults, 1, 100);
    const offset = (page - 1) * clampedMaxResults;
    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;

    const params: Record<string, string | number | undefined> = {
      query: query.trim(),
      limit: clampedMaxResults,
      offset: offset > 0 ? offset : undefined,
      fields: 'title,url,abstract,year,publicationDate,authors',
    };

    const url = buildUrl(baseUrl, params);
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers['x-api-key'] = this.config.apiKey;
    }

    const response = await get<SemanticScholarResponse>(url, { headers, timeout });

    if (!response.data || response.data.length === 0) {
      return [];
    }

    return response.data.map((paper) => {
      const paperUrl = paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`;
      const authors = paper.authors?.map((a) => a.name).join(', ');
      const snippet = paper.abstract || (authors ? `Authors: ${authors}` : undefined);

      return {
        url: paperUrl,
        title: paper.title,
        snippet,
        domain: extractDomain(paperUrl),
        publishedDate: paper.publicationDate || (paper.year ? `${paper.year}-01-01` : undefined),
        provider: 'semanticscholar',
        raw: paper,
      };
    });
  }
}

export function createSemanticScholarProvider(
  config?: SemanticScholarConfig
): SemanticScholarSearchProvider {
  return new SemanticScholarSearchProvider(config);
}
