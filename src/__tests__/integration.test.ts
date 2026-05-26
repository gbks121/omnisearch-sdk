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

function printResults(
  name: string,
  results: { title?: string; url?: string; snippet?: string; domain?: string }[]
) {
  console.log(`\n[${name}] ${results.length} result(s):`);
  for (const r of results) {
    console.log(`  - ${r.title}`);
    if (r.url) console.log(`    ${r.url}`);
    if (r.snippet)
      console.log(`    "${r.snippet.slice(0, 120)}${r.snippet.length > 120 ? '...' : ''}"`);
    if (r.domain) console.log(`    domain: ${r.domain}`);
  }
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
      printResults('Google', result.value);
    }
  });

  skipIfNo('BRAVE_API_KEY')('Brave', async () => {
    const provider = createBraveProvider({ apiKey: env('BRAVE_API_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      printResults('Brave', result.value);
    }
  });

  skipIfNo('EXA_API_KEY')('Exa', async () => {
    const provider = createExaProvider({ apiKey: env('EXA_API_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      printResults('Exa', result.value);
    }
  });

  skipIfNo('TAVILY_API_KEY')('Tavily', async () => {
    const provider = createTavilyProvider({ apiKey: env('TAVILY_API_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      printResults('Tavily', result.value);
    }
  });

  skipIfNo('SERPAPI_KEY')('SerpAPI', async () => {
    const provider = createSerpApiProvider({ apiKey: env('SERPAPI_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      printResults('SerpAPI', result.value);
    }
  });

  skipIfNo('PERPLEXITY_API_KEY')('Perplexity', async () => {
    const provider = createPerplexityProvider({ apiKey: env('PERPLEXITY_API_KEY')! });
    const result = await provider.search({ query: QUERY, maxResults: 3 });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.length).toBeGreaterThan(0);
      printResults('Perplexity', result.value);
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
      console.log('[Arxiv]', result.value[0]?.snippet);
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
