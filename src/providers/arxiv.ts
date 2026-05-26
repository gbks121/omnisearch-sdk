import { get, clampMaxResults } from '../utils';
import { SearchResult, SearchQuery, ProviderConfig } from '../types';
import { XMLParser } from 'fast-xml-parser';
import { AbstractSearchProvider } from './base';

interface ArxivAtomLink {
  href: string;
  rel: string;
  type?: string;
  title?: string;
}

interface ArxivAtomAuthor {
  name: string;
}

interface ArxivAtomCategory {
  term: string;
  scheme?: string;
}

interface ArxivAtomEntry {
  id: string;
  updated: string;
  published: string;
  title: string;
  summary: string;
  author: ArxivAtomAuthor[];
  link: ArxivAtomLink[];
  category?: ArxivAtomCategory[];
  'arxiv:primary_category'?: ArxivAtomCategory;
  comment?: string;
  'arxiv:journal_ref'?: string;
  'arxiv:doi'?: string;
}

interface ArxivAtomFeed {
  entry?: ArxivAtomEntry[];
  'opensearch:totalResults': number | string;
  'opensearch:startIndex': number | string;
  'opensearch:itemsPerPage': number | string;
}

interface ArxivParsedXml {
  feed: ArxivAtomFeed;
}

export interface ArxivConfig extends ProviderConfig {
  baseUrl?: string;
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
}

const DEFAULT_BASE_URL = 'https://export.arxiv.org/api/query';

const arxivXmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (_name, jpath) => {
    const alwaysArray = [
      'feed.entry',
      'feed.entry.author',
      'feed.entry.link',
      'feed.entry.category',
    ];
    return typeof jpath === 'string' && alwaysArray.includes(jpath);
  },
  parseAttributeValue: false,
  trimValues: true,
  parseTagValue: false,
});

export class ArxivSearchProvider extends AbstractSearchProvider<ArxivConfig> {
  public readonly name = 'arxiv';

  protected getTroubleshooting(_error: Error, statusCode?: number): string {
    if (statusCode === 401 || statusCode === 403) {
      return "This is likely an authentication issue. Check your API key and make sure it's valid and has the correct permissions.";
    }
    if (statusCode === 400) {
      return 'This is likely due to invalid request parameters. Check your query and other search options.';
    }
    if (statusCode === 429) {
      return "You've exceeded the rate limit for this API. Try again later or reduce your request frequency.";
    }
    if (statusCode && statusCode >= 500) {
      return 'The search provider is experiencing server issues. Try again later.';
    }
    return '';
  }

  protected async doSearch(options: SearchQuery): Promise<SearchResult[]> {
    const { query, maxResults = 10, timeout } = options;

    const idList = options.idList as string | undefined;
    const start = (options.start as number) ?? 0;
    const sortBy =
      (options.sortBy as 'relevance' | 'lastUpdatedDate' | 'submittedDate') ||
      this.config.sortBy ||
      'relevance';
    const sortOrder =
      (options.sortOrder as 'ascending' | 'descending') || this.config.sortOrder || 'descending';

    if (!query && !idList) {
      throw new Error('Arxiv search requires either a "query" or an "idList".');
    }

    const clampedMaxResults = clampMaxResults(maxResults);

    const params = new URLSearchParams();
    if (query) {
      params.append('search_query', query);
    }
    if (idList) {
      params.append('id_list', idList);
    }
    params.append('start', start.toString());
    params.append('max_results', clampedMaxResults.toString());
    params.append('sortBy', sortBy);
    params.append('sortOrder', sortOrder);

    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;
    const url = `${baseUrl}?${params.toString()}`;

    const responseXmlText = await get<string>(url, { timeout });

    const parsedXml: ArxivParsedXml = arxivXmlParser.parse(responseXmlText);

    if (!parsedXml || !parsedXml.feed) {
      return [];
    }

    const feed = parsedXml.feed;
    const entries = feed.entry ?? [];

    if (entries.length === 0) {
      return [];
    }

    const results: SearchResult[] = entries.map((entry) => {
      const links = entry.link ?? [];

      const pdfLinkObj = links.find((l) => l.title === 'pdf');
      const alternateLink = links.find((l) => l.rel === 'alternate' && l.type === 'text/html');

      let pdfLink = '';
      if (pdfLinkObj) {
        pdfLink = pdfLinkObj.href;
      } else if (alternateLink) {
        pdfLink = alternateLink.href.replace('/abs/', '/pdf/');
      }

      return {
        url: pdfLink || entry.id,
        title: entry.title.replace(/\n\s*/g, ' ').trim(),
        snippet: entry.summary.replace(/\n\s*/g, ' ').trim(),
        publishedDate: entry.published || entry.updated,
        provider: 'arxiv',
        raw: entry,
      };
    });

    return results;
  }
}

export function createArxivProvider(config: ArxivConfig = {}): ArxivSearchProvider {
  return new ArxivSearchProvider(config);
}
