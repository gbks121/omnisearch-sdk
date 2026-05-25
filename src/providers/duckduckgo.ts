import { err } from 'neverthrow';
import { debug, get, post, createBaseProvider } from '../utils';
import {
  SearchProvider,
  SearchResult,
  SearchOptions,
  ProviderConfig,
  DebugOptions,
} from '../types';

/**
 * DuckDuckGo image search result
 */
interface DuckDuckGoImageResult {
  title: string;
  image: string;
  thumbnail: string;
  url: string;
  height: number;
  width: number;
  source: string;
}

/**
 * DuckDuckGo image search response
 */
interface DuckDuckGoImagesResponse {
  results: DuckDuckGoImageResult[];
  next?: string;
}

/**
 * DuckDuckGo news search result
 */
interface DuckDuckGoNewsResult {
  date: string;
  title: string;
  body: string;
  url: string;
  image?: string;
  source: string;
}

/**
 * DuckDuckGo news search response
 */
interface DuckDuckGoNewsResponse {
  results: DuckDuckGoNewsResult[];
  next?: string;
}

/**
 * DuckDuckGo configuration options
 */
export interface DuckDuckGoConfig extends ProviderConfig {
  baseUrl?: string;
  searchType?: 'text' | 'images' | 'news';
  useLite?: boolean;
  userAgent?: string;
}

/**
 * Extended SearchOptions with DuckDuckGo-specific options
 */
interface DuckDuckGoSearchOptions extends SearchOptions {
  searchType?: 'text' | 'images' | 'news';
}

const DEFAULT_BASE_URLS = {
  text: 'https://html.duckduckgo.com/html',
  lite: 'https://lite.duckduckgo.com/lite/',
  images: 'https://duckduckgo.com/i.js',
  news: 'https://duckduckgo.com/news.js',
};

function normalizeText(text: string): string {
  return text
    .replace(/<[^>]*>?/gm, '') // Remove HTML tags
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(url: string): string {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return `https://${trimmed}`;
  return trimmed;
}

function extractVqd(html: string): string | null {
  if (!html) return null;
  const match = html.match(/vqd=['"]([^'"]+)['"]/i);
  return match ? match[1] : null;
}

export function createDuckDuckGoProvider(config: DuckDuckGoConfig = {}): SearchProvider {
  const searchType = config.searchType || 'text';
  const useLite = config.useLite || false;

  const baseUrls = {
    text: config.baseUrl || (useLite ? DEFAULT_BASE_URLS.lite : DEFAULT_BASE_URLS.text),
    images: config.baseUrl || DEFAULT_BASE_URLS.images,
    news: config.baseUrl || DEFAULT_BASE_URLS.news,
  };

  const headers = {
    'User-Agent':
      config.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    Referer: useLite ? 'https://lite.duckduckgo.com/' : 'https://html.duckduckgo.com/',
  };

  return createBaseProvider({
    name: 'duckduckgo',
    config: { ...config, apiKey: config.apiKey || '' },
    getTroubleshooting: (error: Error, statusCode?: number) => {
      if (error.message.includes('vqd')) {
        return 'Failed to extract the vqd parameter from DuckDuckGo. This may be due to temporary API changes or rate limiting. Try again later.';
      }
      if (statusCode === 429 || error.message.includes('rate')) {
        return 'You may be making too many requests to DuckDuckGo. Try adding a delay between requests.';
      }
      return '';
    },
    search: async (options: SearchOptions): Promise<SearchResult[]> => {
      const {
        query,
        maxResults = 10,
        region = 'wt-wt',
        safeSearch = 'moderate',
        debug: debugOptions,
        timeout,
      } = options;

      const duckOptions = options as DuckDuckGoSearchOptions;
      const effectiveSearchType = duckOptions.searchType || searchType;

      if (!query || !query.trim()) {
        throw new Error('DuckDuckGo search requires a query.');
      }

      if (effectiveSearchType === 'images') {
        return await searchImages(query, region, safeSearch, maxResults, debugOptions, timeout);
      } else if (effectiveSearchType === 'news') {
        return await searchNews(query, region, safeSearch, maxResults, debugOptions, timeout);
      } else {
        return await searchText(query, region, safeSearch, maxResults, debugOptions, timeout);
      }
    },
  });

  async function searchText(
    query: string,
    region: string,
    _safeSearch: string,
    maxResults: number,
    debugOptions?: DebugOptions,
    timeout?: number
  ): Promise<SearchResult[]> {
    const baseUrl = useLite ? DEFAULT_BASE_URLS.lite : baseUrls.text;
    const payload = { q: query, b: '', kl: region };

    const result = await post<string>(baseUrl, payload, { headers, timeout });
    if (result.isErr()) throw result.error;
    const response = result.value;
    const results: SearchResult[] = [];
    const cache = new Set<string>();

    if (useLite) {
      const resultsRegex = /<a class="result-link" href="([^"]+)">([^<]+)<\/a>.*?<div class="result-snippet">([^<]+)<\/div>/gs;
      let match;
      while ((match = resultsRegex.exec(response)) !== null && results.length < maxResults) {
        const href = match[1];
        if (!cache.has(href)) {
          cache.add(href);
          results.push({
            url: normalizeUrl(href),
            title: normalizeText(match[2]),
            snippet: normalizeText(match[3]),
            provider: 'duckduckgo',
          });
        }
      }
    } else {
      const resultsRegex = /<h2 class="result__title">.*?<a class="result__a" href="([^"]+)"[^>]*>(.*?)<\/a>.*?<\/h2>.*?<a class="result__snippet" [^>]*>(.*?)<\/a>/gs;
      let match;
      while ((match = resultsRegex.exec(response)) !== null && results.length < maxResults) {
        const href = match[1];
        if (!cache.has(href)) {
          cache.add(href);
          results.push({
            url: normalizeUrl(href),
            title: normalizeText(match[2]),
            snippet: normalizeText(match[3]),
            provider: 'duckduckgo',
          });
        }
      }
    }

    return results;
  }

  async function searchImages(
    query: string,
    region: string,
    safeSearch: string,
    maxResults: number,
    debugOptions?: DebugOptions,
    timeout?: number
  ): Promise<SearchResult[]> {
    const initialResult = await get<string>('https://duckduckgo.com', {
      headers: { ...headers, Referer: 'https://duckduckgo.com/' },
      timeout,
    });
    if (initialResult.isErr()) throw initialResult.error;
    const initialResponse = initialResult.value;

    const vqd = extractVqd(initialResponse);
    if (!vqd) throw new Error('Failed to extract vqd parameter for DuckDuckGo Images Search');

    const safesearchMapping: Record<string, string> = { on: '1', moderate: '1', off: '-1' };
    const searchUrl = new URL(baseUrls.images);
    searchUrl.searchParams.append('l', region);
    searchUrl.searchParams.append('o', 'json');
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('vqd', vqd);
    searchUrl.searchParams.append('p', safesearchMapping[safeSearch.toLowerCase()] || '1');

    const result = await get<DuckDuckGoImagesResponse>(searchUrl.toString(), {
      headers: { ...headers, Referer: 'https://duckduckgo.com/' },
      timeout,
    });
    if (result.isErr()) throw result.error;
    const response = result.value;

    const results: SearchResult[] = [];
    if (response.results) {
      for (const img of response.results) {
        if (results.length < maxResults) {
          results.push({
            url: normalizeUrl(img.url),
            title: img.title,
            snippet: `${img.width}x${img.height} image from ${img.source}`,
            provider: 'duckduckgo',
            raw: img,
          });
        }
      }
    }
    return results;
  }

  async function searchNews(
    query: string,
    region: string,
    safeSearch: string,
    maxResults: number,
    _debugOptions?: DebugOptions,
    timeout?: number
  ): Promise<SearchResult[]> {
    const initialResult = await get<string>('https://duckduckgo.com', {
      headers: { ...headers, Referer: 'https://duckduckgo.com/' },
      timeout,
    });
    if (initialResult.isErr()) throw initialResult.error;
    const initialResponse = initialResult.value;

    const vqd = extractVqd(initialResponse);
    if (!vqd) throw new Error('Failed to extract vqd parameter for DuckDuckGo News Search');

    const safesearchMapping: Record<string, string> = { on: '1', moderate: '-1', off: '-2' };
    const searchUrl = new URL(baseUrls.news);
    searchUrl.searchParams.append('l', region);
    searchUrl.searchParams.append('o', 'json');
    searchUrl.searchParams.append('noamp', '1');
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('vqd', vqd);
    searchUrl.searchParams.append('p', safesearchMapping[safeSearch.toLowerCase()] || '-1');

    const result = await get<DuckDuckGoNewsResponse>(searchUrl.toString(), {
      headers,
      timeout,
    });
    if (result.isErr()) throw result.error;
    const response = result.value;

    const results: SearchResult[] = [];
    if (response.results) {
      for (const news of response.results) {
        if (results.length < maxResults) {
          results.push({
            url: normalizeUrl(news.url),
            title: news.title,
            snippet: normalizeText(news.body),
            publishedDate: news.date,
            provider: 'duckduckgo',
            raw: { ...news, image: news.image ? normalizeUrl(news.image) : undefined },
          });
        }
      }
    }
    return results;
  }
}

export const duckduckgo = {
  name: 'duckduckgo',
  config: { apiKey: '' },
  configure: (config: DuckDuckGoConfig = {}): SearchProvider => createDuckDuckGoProvider(config),
  search: async (_options: SearchOptions) => {
    return err(
      new Error(
        'DuckDuckGo provider must be configured before use. Call duckduckgo.configure() first.'
      )
    );
  },
} as unknown as SearchProvider & { configure: (config: DuckDuckGoConfig) => SearchProvider };
