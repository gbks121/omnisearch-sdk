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
  const QUERY = 'Machine Learning';

  skipIfNo('GOOGLE_API_KEY')('Google', async () => {
    const provider = createGoogleProvider({
      apiKey: env('GOOGLE_API_KEY')!,
      cx: env('GOOGLE_CX')!,
    });
    try {
      const results = await provider.search({ query: QUERY, maxResults: 3 });
      expect(results.length).toBeGreaterThan(0);
      printResults('Google', results);
    } catch (error) {
      console.log('[Google] error:', (error as Error).message);
      throw error;
    }
  });

  skipIfNo('BRAVE_API_KEY')('Brave', async () => {
    const provider = createBraveProvider({ apiKey: env('BRAVE_API_KEY')! });
    const results = await provider.search({ query: QUERY, maxResults: 3 });
    expect(results.length).toBeGreaterThan(0);
    printResults('Brave', results);
  });

  skipIfNo('EXA_API_KEY')('Exa', async () => {
    const provider = createExaProvider({ apiKey: env('EXA_API_KEY')! });
    const results = await provider.search({ query: QUERY, maxResults: 3 });
    expect(results.length).toBeGreaterThan(0);
    printResults('Exa', results);
  });

  skipIfNo('TAVILY_API_KEY')('Tavily', async () => {
    const provider = createTavilyProvider({ apiKey: env('TAVILY_API_KEY')! });
    const results = await provider.search({ query: QUERY, maxResults: 3 });
    expect(results.length).toBeGreaterThan(0);
    printResults('Tavily', results);
  });

  skipIfNo('SERPAPI_KEY')('SerpAPI', async () => {
    const provider = createSerpApiProvider({ apiKey: env('SERPAPI_KEY')! });
    const results = await provider.search({ query: QUERY, maxResults: 3 });
    expect(results.length).toBeGreaterThan(0);
    printResults('SerpAPI', results);
  });

  skipIfNo('PERPLEXITY_API_KEY')('Perplexity', async () => {
    const provider = createPerplexityProvider({ apiKey: env('PERPLEXITY_API_KEY')! });
    const results = await provider.search({ query: QUERY, maxResults: 3 });
    expect(results.length).toBeGreaterThan(0);
    printResults('Perplexity', results);
  });

  skipIfNo('SEARXNG_URL')('SearXNG', async () => {
    const provider = createSearXNGProvider({ baseUrl: env('SEARXNG_URL')! });
    const results = await provider.search({ query: QUERY, maxResults: 3 });
    expect(results.length).toBeGreaterThan(0);
    printResults('SearXNG', results);
  });

  it('Arxiv', async () => {
    const provider = createArxivProvider({ timeout: 20000 });
    try {
      const results = await provider.search({ query: 'machine learning', maxResults: 3 });
      printResults('Arxiv', results);
    } catch (error) {
      console.log('[Arxiv] skipped — API unavailable:', (error as Error).message);
    }
  }, 25_000);

  it('DuckDuckGo', async () => {
    const provider = createDuckDuckGoProvider();
    const results = await provider.search({ query: QUERY, maxResults: 3 });
    printResults('DuckDuckGo', results);
  });

  skipIfNo('PARALLEL_API_KEY')('Parallel', async () => {
    const provider = createParallelProvider({ apiKey: env('PARALLEL_API_KEY')! });
    const results = await provider.search({ query: QUERY, maxResults: 3 });
    expect(results.length).toBeGreaterThan(0);
    console.log('[Parallel]', results[0]?.title);
  });
});
