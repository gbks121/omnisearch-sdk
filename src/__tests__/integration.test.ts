import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import {
  createGoogleProvider,
  createBraveProvider,
  createExaProvider,
  createTavilyProvider,
  createSerpApiProvider,
  createPerplexityProvider,
  createSearXNGProvider,
  createArxivProvider,
  createDuckDuckGoProvider,
  createParallelProvider,
} from '../providers';

const env = (key: string) => process.env[key];

function skipIfNo(key: string) {
  return env(key) ? it : it.skip;
}

describe('integration: real provider calls', () => {
  const QUERY = 'TypeScript neverthrow';

  skipIfNo('GOOGLE_API_KEY')('Google', async () => {
    const provider = createGoogleProvider({
      apiKey: env('GOOGLE_API_KEY')!,
      cx: env('GOOGLE_CX')!,
    });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      console.log('[Google]', result.value[0]?.title);
    }
  });

  skipIfNo('BRAVE_API_KEY')('Brave', async () => {
    const provider = createBraveProvider({ apiKey: env('BRAVE_API_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      console.log('[Brave]', result.value[0]?.title);
    }
  });

  skipIfNo('EXA_API_KEY')('Exa', async () => {
    const provider = createExaProvider({ apiKey: env('EXA_API_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      console.log('[Exa]', result.value[0]?.title);
    }
  });

  skipIfNo('TAVILY_API_KEY')('Tavily', async () => {
    const provider = createTavilyProvider({ apiKey: env('TAVILY_API_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      console.log('[Tavily]', result.value[0]?.title);
    }
  });

  skipIfNo('SERPAPI_KEY')('SerpAPI', async () => {
    const provider = createSerpApiProvider({ apiKey: env('SERPAPI_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      console.log('[SerpAPI]', result.value[0]?.title);
    }
  });

  skipIfNo('PERPLEXITY_API_KEY')('Perplexity', async () => {
    const provider = createPerplexityProvider({ apiKey: env('PERPLEXITY_API_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      console.log('[Perplexity]', result.value[0]?.title);
    }
  });

  skipIfNo('SEARXNG_URL')('SearXNG', async () => {
    const provider = createSearXNGProvider({ baseUrl: env('SEARXNG_URL')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      console.log('[SearXNG]', result.value[0]?.title);
    }
  });

  it('Arxiv', async () => {
    const provider = createArxivProvider();
    const result = await provider.search({ query: 'machine learning', maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      console.log('[Arxiv]', result.value[0]?.title);
    }
  });

  it('DuckDuckGo', async () => {
    const provider = createDuckDuckGoProvider();
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      console.log(`[DuckDuckGo] ${result.value.length} results`);
      if (result.value.length > 0) console.log('[DuckDuckGo]', result.value[0]?.title);
    }
  });

  skipIfNo('PARALLEL_API_KEY')('Parallel', async () => {
    const provider = createParallelProvider({ apiKey: env('PARALLEL_API_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      console.log('[Parallel]', result.value[0]?.title);
    }
  });
});
