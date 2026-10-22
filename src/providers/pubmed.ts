import type { ProviderConfig, SearchQuery, SearchResult } from '../types';
import { buildUrl, clampMaxResults, get } from '../utils';
import { AbstractSearchProvider } from './base';

interface PubMedESearchResponse {
  esearchresult?: {
    idlist?: string[];
    count?: string;
  };
}

interface PubMedDocSummary {
  uid: string;
  title?: string;
  pubdate?: string;
  source?: string;
  authors?: Array<{ name: string }>;
}

interface PubMedESummaryResponse {
  result?: {
    uids?: string[];
    [uid: string]: PubMedDocSummary | string[] | undefined;
  };
}

export interface PubMedConfig extends ProviderConfig {
  baseUrl?: string;
  summaryBaseUrl?: string;
}

const DEFAULT_ESEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const DEFAULT_ESUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

const FRESHNESS_RELDATE: Record<'day' | 'week' | 'month' | 'year', number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

export class PubMedSearchProvider extends AbstractSearchProvider<PubMedConfig> {
  public readonly name = 'pubmed';
  protected override get displayName(): string {
    return 'PubMed';
  }

  constructor(config: PubMedConfig = {}) {
    super(config);
  }

  protected getTroubleshooting(_error: Error, statusCode?: number): string {
    if (statusCode === 429) {
      return 'PubMed (NCBI) rate limit exceeded. Consider supplying an NCBI API key or reducing request rate.';
    }
    if (statusCode && statusCode >= 500) {
      return 'NCBI Entrez E-utilities servers are currently unavailable.';
    }
    return '';
  }

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    const { query, maxResults = 10, timeout } = options;

    if (!query?.trim()) {
      throw new Error('PubMed search requires a query.');
    }

    const clampedMaxResults = clampMaxResults(maxResults, 1, 50);
    const searchUrl = this.config.baseUrl || DEFAULT_ESEARCH_URL;

    const searchParams: Record<string, string | number | undefined> = {
      db: 'pubmed',
      term: query.trim(),
      retmode: 'json',
      retmax: clampedMaxResults,
    };
    const freshness = options.freshness || options.recencyFilter;
    if (freshness) {
      searchParams.reldate = FRESHNESS_RELDATE[freshness];
      searchParams.datetype = 'pdat';
    }
    if (this.config.apiKey) {
      searchParams.api_key = this.config.apiKey;
    }

    const searchFullUrl = buildUrl(searchUrl, searchParams);
    const searchRes = await get<PubMedESearchResponse>(searchFullUrl, {
      timeout,
      signal: options.signal,
      onTelemetry: options.onTelemetry,
    });

    const idList = searchRes.esearchresult?.idlist;
    if (!idList || idList.length === 0) {
      return [];
    }

    const summaryUrl = this.config.summaryBaseUrl || DEFAULT_ESUMMARY_URL;
    const summaryParams: Record<string, string | number | undefined> = {
      db: 'pubmed',
      id: idList.join(','),
      retmode: 'json',
    };
    if (this.config.apiKey) {
      summaryParams.api_key = this.config.apiKey;
    }

    const summaryFullUrl = buildUrl(summaryUrl, summaryParams);
    const summaryRes = await get<PubMedESummaryResponse>(summaryFullUrl, {
      timeout,
      signal: options.signal,
      onTelemetry: options.onTelemetry,
    });

    if (!summaryRes.result) {
      return [];
    }

    const results: SearchResult[] = [];
    for (const uid of idList) {
      const doc = summaryRes.result[uid] as PubMedDocSummary | undefined;
      if (doc) {
        const authors = doc.authors?.map((a) => a.name).join(', ');
        const snippet = [doc.source, authors ? `Authors: ${authors}` : '']
          .filter(Boolean)
          .join(' — ');

        results.push({
          url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
          title: doc.title || `PubMed Article ${uid}`,
          snippet: snippet || undefined,
          domain: 'pubmed.ncbi.nlm.nih.gov',
          publishedDate: doc.pubdate,
          provider: 'pubmed',
          raw: doc,
        });
      }
    }

    return results;
  }
}

export function createPubMedProvider(config?: PubMedConfig): PubMedSearchProvider {
  return new PubMedSearchProvider(config);
}

export const createPubmedProvider = createPubMedProvider;
