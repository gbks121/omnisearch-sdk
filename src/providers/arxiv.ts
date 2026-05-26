import { debug, get, clampMaxResults } from '../utils';
import { SearchResult, SearchOptions, ProviderConfig } from '../types';
import { XMLParser } from 'fast-xml-parser';
import { AbstractSearchProvider } from './base';

/**
 * Arxiv API (Atom 1.0 XML) feed structure.
 */
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

/**
 * Arxiv configuration options
 */
export interface ArxivConfig extends ProviderConfig {
  /** Base URL for Arxiv API query endpoint */
  baseUrl?: string;
  /** Default sort order for results */
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  /** Default sort direction */
  sortOrder?: 'ascending' | 'descending';
}

/**
 * Arxiv specific search options
 */
export interface ArxivSearchOptions extends SearchOptions {
  /** A comma-delimited list of Arxiv IDs to fetch. */
  idList?: string;
  /** Pagination offset */
  start?: number;
  /** Sort order */
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  /** Sort direction */
  sortOrder?: 'ascending' | 'descending';
}

/**
 * Default base URL for Arxiv API
 */
const DEFAULT_BASE_URL = 'https://export.arxiv.org/api/query';

/**
 * Shared XMLParser instance configured for Arxiv Atom feeds.
 */
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

export class ArxivSearchProvider extends AbstractSearchProvider<ArxivConfig, ArxivSearchOptions> {
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

  protected async doSearch(options: ArxivSearchOptions): Promise<SearchResult[]> {
    const {
      query,
      idList,
      maxResults = 10,
      start = 0,
      sortBy = this.config.sortBy || 'relevance',
      sortOrder = this.config.sortOrder || 'descending',
      debug: debugOptions,
      timeout,
    } = options;

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

    debug.logRequest(debugOptions, 'Arxiv Search request', { url });

    const result = await get<string>(url, { timeout });
    if (result.isErr()) throw result.error;
    const responseXmlText = result.value;
    debug.log(debugOptions, 'Arxiv raw XML response received', {
      length: responseXmlText.length,
    });

    const parsedXml: ArxivParsedXml = arxivXmlParser.parse(responseXmlText);

    debug.log(debugOptions, 'Arxiv XML parsed successfully');

    if (!parsedXml || !parsedXml.feed) {
      debug.log(debugOptions, 'Arxiv parsed data is empty or malformed', { parsedXml });
      return [];
    }

    const feed = parsedXml.feed;
    const entries = feed.entry ?? [];

    if (entries.length === 0) {
      debug.log(debugOptions, 'No entries found in Arxiv response');
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

    const totalResults = parseInt(String(feed['opensearch:totalResults']), 10) || 0;
    debug.logResponse(debugOptions, 'Arxiv Search successful', {
      status: 'success',
      itemCount: results.length,
      totalResults,
    });
    return results;
  }
}

/**
 * Creates an Arxiv provider instance
 *
 * @param config Configuration options for Arxiv
 * @returns A configured Arxiv provider
 */
export function createArxivProvider(config: ArxivConfig = {}): ArxivSearchProvider {
  return new ArxivSearchProvider(config);
}
