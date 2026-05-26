import { SearchOptions, SearchProvider, SearchResult, ProviderConfig, DebugOptions } from '../types';
import { get, post } from '../utils';
import { debug } from '../utils/debug';
import { AbstractSearchProvider } from './base';

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
 * DuckDuckGo specific search options
 */
export interface DuckDuckGoSearchOptions extends SearchOptions {
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

export class DuckDuckGoSearchProvider extends AbstractSearchProvider<DuckDuckGoConfig, DuckDuckGoSearchOptions> {
  public readonly name = 'duckduckgo';

  protected getTroubleshooting(error: Error, statusCode?: number): string {
    if (error.message.includes('vqd')) {
      return 'Failed to extract the vqd parameter from DuckDuckGo. This may be due to temporary API changes or rate limiting. Try again later.';
    }
    if (statusCode === 429 || error.message.includes('rate')) {
      return 'You may be making too many requests to DuckDuckGo. Try adding a delay between requests.';
    }
    return '';
  }

  protected async doSearch(options: DuckDuckGoSearchOptions): Promise<SearchResult[]> {
    const {
      query,
      maxResults = 10,
      region = 'wt-wt',
      safeSearch = 'moderate',
      debug: debugOptions,
      timeout,
    } = options;

    const effectiveSearchType = options.searchType || this.config.searchType || 'text';

    if (!query || !query.trim()) {
      throw new Error('DuckDuckGo search requires a query.');
    }

    if (effectiveSearchType === 'images') {
      return await this.searchImages(query, region, safeSearch, maxResults, debugOptions, timeout);
    } else if (effectiveSearchType === 'news') {
      return await this.searchNews(query, region, safeSearch, maxResults, debugOptions, timeout);
    } else {
      return await this.searchText(query, region, safeSearch, maxResults, debugOptions, timeout);
    }
  }

  private getHeaders() {
    return {
      'User-Agent':
        this.config.userAgent ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      Referer: this.config.useLite ? 'https://lite.duckduckgo.com/' : 'https://html.duckduckgo.com/',
    };
  }

  private async searchText(
    query: string,
    region: string,
    _safeSearch: string,
    maxResults: number,
    _debugOptions?: DebugOptions,
    timeout?: number
  ): Promise<SearchResult[]> {
    const useLite = this.config.useLite || false;
    const baseUrl = this.config.baseUrl || (useLite ? DEFAULT_BASE_URLS.lite : DEFAULT_BASE_URLS.text);
    const payload = { q: query, b: '', kl: region };

    const result = await post<string>(baseUrl, payload, { headers: this.getHeaders(), timeout });
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

  private async searchImages(
    query: string,
    region: string,
    safeSearch: string,
    maxResults: number,
    _debugOptions?: DebugOptions,
    timeout?: number
  ): Promise<SearchResult[]> {
    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URLS.images;
    const initialResult = await get<string>('https://duckduckgo.com', {
      headers: { ...this.getHeaders(), Referer: 'https://duckduckgo.com/' },
      timeout,
    });
    if (initialResult.isErr()) throw initialResult.error;
    const initialResponse = initialResult.value;

    const vqd = extractVqd(initialResponse);
    if (!vqd) throw new Error('Failed to extract vqd parameter for DuckDuckGo Images Search');

    const safesearchMapping: Record<string, string> = { on: '1', moderate: '1', off: '-1' };
    const searchUrl = new URL(baseUrl);
    searchUrl.searchParams.append('l', region);
    searchUrl.searchParams.append('o', 'json');
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('vqd', vqd);
    searchUrl.searchParams.append('p', safesearchMapping[safeSearch.toLowerCase()] || '1');

    const result = await get<DuckDuckGoImagesResponse>(searchUrl.toString(), {
      headers: { ...this.getHeaders(), Referer: 'https://duckduckgo.com/' },
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

  private async searchNews(
    query: string,
    region: string,
    safeSearch: string,
    maxResults: number,
    _debugOptions?: DebugOptions,
    timeout?: number
  ): Promise<SearchResult[]> {
    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URLS.news;
    const initialResult = await get<string>('https://duckduckgo.com', {
      headers: { ...this.getHeaders(), Referer: 'https://duckduckgo.com/' },
      timeout,
    });
    if (initialResult.isErr()) throw initialResult.error;
    const initialResponse = initialResult.value;

    const vqd = extractVqd(initialResponse);
    if (!vqd) throw new Error('Failed to extract vqd parameter for DuckDuckGo News Search');

    const safesearchMapping: Record<string, string> = { on: '1', moderate: '-1', off: '-2' };
    const searchUrl = new URL(baseUrl);
    searchUrl.searchParams.append('l', region);
    searchUrl.searchParams.append('o', 'json');
    searchUrl.searchParams.append('noamp', '1');
    searchUrl.searchParams.append('q', query);
    searchUrl.searchParams.append('vqd', vqd);
    searchUrl.searchParams.append('p', safesearchMapping[safeSearch.toLowerCase()] || '-1');

    const result = await get<DuckDuckGoNewsResponse>(searchUrl.toString(), {
      headers: this.getHeaders(),
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

/**
 * Creates a DuckDuckGo search provider instance
 */
export function createDuckDuckGoProvider(config: DuckDuckGoConfig = {}): DuckDuckGoSearchProvider {
  return new DuckDuckGoSearchProvider(config);
}
