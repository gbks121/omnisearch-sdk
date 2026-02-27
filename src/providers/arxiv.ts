import { debug, HttpError, get } from '../utils';
import { SearchProvider, SearchResult, SearchOptions, ProviderConfig } from '../types';
import { XMLParser } from 'fast-xml-parser';

/**
 * Arxiv API (Atom 1.0 XML) feed structure.
 * Based on http://export.arxiv.org/api_help/docs/user-manual.html#_response_format
 *
 * With fast-xml-parser (ignoreAttributes: false, attributeNamePrefix: ''),
 * element text is a plain string and attributes are sibling keys on the same
 * object — no `_text` / `_attributes` wrappers needed.
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
  author: ArxivAtomAuthor[]; // always array via isArray callback
  link: ArxivAtomLink[]; // always array via isArray callback
  category?: ArxivAtomCategory[]; // always array via isArray callback
  'arxiv:primary_category'?: ArxivAtomCategory;
  comment?: string;
  'arxiv:journal_ref'?: string;
  'arxiv:doi'?: string;
}

interface ArxivAtomFeed {
  entry?: ArxivAtomEntry[]; // always array via isArray callback
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
  /** Sort order for results (relevance, lastUpdatedDate, submittedDate) */
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  /** Sort direction (ascending or descending) */
  sortOrder?: 'ascending' | 'descending';
}

/**
 * Default base URL for Arxiv API
 */
const DEFAULT_BASE_URL = 'http://export.arxiv.org/api/query';

/**
 * Shared XMLParser instance configured for Arxiv Atom feeds.
 * - ignoreAttributes: false  → attributes become sibling keys
 * - attributeNamePrefix: ''  → no prefix on attribute keys
 * - isArray                  → ensures these tags are always arrays
 * - parseAttributeValue: false → keep attribute values as strings
 * - trimValues: true          → strip leading/trailing whitespace from text
 * - parseTagValue: false      → keep element text as strings (no auto number coercion)
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
    return alwaysArray.includes(jpath);
  },
  parseAttributeValue: false,
  trimValues: true,
  parseTagValue: false,
});

/**
 * Creates an Arxiv provider instance
 *
 * @param config Configuration options for Arxiv
 * @returns A configured Arxiv provider
 */
export function createArxivProvider(config: ArxivConfig = {}): SearchProvider {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;

  return {
    name: 'arxiv',
    config: { ...config, apiKey: config.apiKey || '' },
    search: async (options: SearchOptions): Promise<SearchResult[]> => {
      const {
        query,
        idList,
        maxResults = 10,
        start = 0,
        sortBy = 'relevance',
        sortOrder = 'descending',
        debug: debugOptions,
        timeout,
      } = options;

      if (!query && !idList) {
        throw new Error('Arxiv search requires either a "query" or an "idList".');
      }

      const params = new URLSearchParams();
      if (query) {
        params.append('search_query', query);
      }
      if (idList) {
        params.append('id_list', idList);
      }
      params.append('start', start.toString());
      params.append('max_results', maxResults.toString());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      const url = `${baseUrl}?${params.toString()}`;

      debug.logRequest(debugOptions, 'Arxiv Search request', { url });

      try {
        const responseXmlText = await get<string>(url, { timeout });
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

          // Prefer the explicit "pdf" link, then derive from the alternate/abstract link
          const pdfLinkObj = links.find((l) => l.title === 'pdf');
          const alternateLink = links.find((l) => l.rel === 'alternate' && l.type === 'text/html');

          let pdfLink = '';
          if (pdfLinkObj) {
            pdfLink = pdfLinkObj.href;
          } else if (alternateLink) {
            pdfLink = alternateLink.href.replace('/abs/', '/pdf/');
          }

          const authors = (entry.author ?? []).map((a) => a.name).filter(Boolean);

          const categories = (entry.category ?? []).map((c) => c.term).filter(Boolean);

          return {
            url: pdfLink || entry.id,
            title: entry.title.replace(/\n\s*/g, ' ').trim(),
            snippet: entry.summary.replace(/\n\s*/g, ' ').trim(),
            publishedDate: entry.published || entry.updated,
            provider: 'arxiv',
            raw: entry,
            authors,
            categories,
          };
        });

        const totalResults = parseInt(String(feed['opensearch:totalResults']), 10) || 0;
        debug.logResponse(debugOptions, 'Arxiv Search successful', {
          status: 'success',
          itemCount: results.length,
          totalResults,
        });
        return results;
      } catch (error: unknown) {
        let errorMessage = 'Arxiv search failed';
        let statusCode: number | undefined;

        if (error instanceof HttpError) {
          errorMessage = `Arxiv API error: ${error.statusCode} - ${error.message}`;
          statusCode = error.statusCode;
          if (error.parsedResponseBody) {
            errorMessage += `\nResponse: ${JSON.stringify(error.parsedResponseBody)}`;
          }
        } else if (error instanceof Error) {
          errorMessage = `Arxiv search failed: ${error.message}`;
        } else {
          errorMessage = `Arxiv search failed: ${String(error)}`;
        }

        debug.log(debugOptions, 'Arxiv Search error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          statusCode,
          url,
        });
        throw new Error(errorMessage);
      }
    },
  };
}

/**
 * Pre-configured Arxiv provider.
 * Call `arxiv.configure({})` before use, though no API key is strictly needed;
 * it standardises provider setup and allows overriding baseUrl or other defaults.
 */
export const arxiv = {
  name: 'arxiv',
  config: { apiKey: '' },

  /**
   * Configure the Arxiv provider.
   *
   * @param config Arxiv configuration options (e.g., baseUrl, sortBy, sortOrder)
   * @returns Configured Arxiv provider
   */
  configure: (config: ArxivConfig = {}): SearchProvider => createArxivProvider(config),

  /**
   * Search implementation that ensures provider is properly configured before use.
   */
  search: async (_options: SearchOptions): Promise<SearchResult[]> => {
    throw new Error(
      'Arxiv provider must be configured before use. Call arxiv.configure() first, even with empty options if defaults are fine.'
    );
  },
};
