import { parseArgs } from 'node:util';
import {
  createArxivProvider,
  createBingProvider,
  createBraveProvider,
  createDuckDuckGoProvider,
  createExaProvider,
  createGitHubProvider,
  createGoogleProvider,
  createParallelProvider,
  createPerplexityProvider,
  createPubMedProvider,
  createSearXNGProvider,
  createSemanticScholarProvider,
  createSerpApiProvider,
  createTavilyProvider,
  createYouProvider,
  type SearchProvider,
  webSearch,
} from 'omnisearch-sdk';

function showHelp(): void {
  console.log(`
OmniSearch CLI - High-performance multi-provider search

Usage:
  omnisearch "<query>" [options]

Options:
  -p, --provider <name>     Provider to use (brave, google, duckduckgo, etc.) Default: auto
  -f, --freshness <period>  Freshness filter (day, week, month, year)
  -s, --strategy <mode>     Execution strategy (parallel, fallback, race) Default: parallel
  -n, --max-results <num>   Maximum results to return. Default: 10
  --type <type>             Search type (web, news). Default: web
  --dedupe                  Enable canonical URL deduplication
  --json                    Output raw JSON results
  -h, --help                Show this help message

Environment Variables:
  BRAVE_API_KEY, GOOGLE_API_KEY, GOOGLE_CX, TAVILY_API_KEY, EXA_API_KEY,
  PERPLEXITY_API_KEY, BING_API_KEY, YOU_API_KEY, PARALLEL_API_KEY, SERPAPI_API_KEY
`);
}

function resolveProviders(providerName?: string): SearchProvider[] {
  const env = process.env;
  const name = providerName?.toLowerCase();

  const registry: Record<string, () => SearchProvider | null> = {
    duckduckgo: () => createDuckDuckGoProvider(),
    arxiv: () => createArxivProvider(),
    pubmed: () => createPubMedProvider(),
    github: () => createGitHubProvider({ apiKey: env.GITHUB_TOKEN || env.GITHUB_API_KEY }),
    brave: () =>
      env.BRAVE_API_KEY || env.BRAVE_SEARCH_API_KEY
        ? createBraveProvider({ apiKey: (env.BRAVE_API_KEY || env.BRAVE_SEARCH_API_KEY)! })
        : null,
    google: () =>
      env.GOOGLE_API_KEY && env.GOOGLE_CX
        ? createGoogleProvider({ apiKey: env.GOOGLE_API_KEY, cx: env.GOOGLE_CX })
        : null,
    tavily: () =>
      env.TAVILY_API_KEY ? createTavilyProvider({ apiKey: env.TAVILY_API_KEY }) : null,
    exa: () => (env.EXA_API_KEY ? createExaProvider({ apiKey: env.EXA_API_KEY }) : null),
    perplexity: () =>
      env.PERPLEXITY_API_KEY ? createPerplexityProvider({ apiKey: env.PERPLEXITY_API_KEY }) : null,
    bing: () => (env.BING_API_KEY ? createBingProvider({ apiKey: env.BING_API_KEY }) : null),
    you: () => (env.YOU_API_KEY ? createYouProvider({ apiKey: env.YOU_API_KEY }) : null),
    parallel: () =>
      env.PARALLEL_API_KEY ? createParallelProvider({ apiKey: env.PARALLEL_API_KEY }) : null,
    serpapi: () =>
      env.SERPAPI_API_KEY ? createSerpApiProvider({ apiKey: env.SERPAPI_API_KEY }) : null,
    searxng: () =>
      env.SEARXNG_BASE_URL ? createSearXNGProvider({ baseUrl: env.SEARXNG_BASE_URL }) : null,
    semanticscholar: () => createSemanticScholarProvider(),
  };

  if (name) {
    const factory = registry[name];
    if (!factory) {
      console.error(`Unknown provider: ${name}`);
      process.exit(1);
    }
    const instance = factory();
    if (!instance) {
      console.error(`Missing required environment variables/API keys for provider: ${name}`);
      process.exit(1);
    }
    return [instance];
  }

  // Auto-detect available providers
  const available: SearchProvider[] = [];
  for (const [_, factory] of Object.entries(registry)) {
    const inst = factory();
    if (inst) available.push(inst);
  }

  if (available.length === 0) {
    // Fallback to zero-config duckduckgo
    available.push(createDuckDuckGoProvider());
  }

  return available;
}

export async function runCli(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      provider: { type: 'string', short: 'p' },
      freshness: { type: 'string', short: 'f' },
      strategy: { type: 'string', short: 's', default: 'parallel' },
      'max-results': { type: 'string', short: 'n', default: '10' },
      type: { type: 'string', default: 'web' },
      dedupe: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  });

  if (values.help || positionals.length === 0) {
    showHelp();
    return;
  }

  const query = positionals.join(' ').trim();
  const providers = resolveProviders(values.provider);
  const maxResults = Number.parseInt(values['max-results'] ?? '10', 10);
  const strategy = values.strategy as 'parallel' | 'fallback' | 'race';
  const freshness = values.freshness as 'day' | 'week' | 'month' | 'year' | undefined;
  const searchType = values.type as 'web' | 'news';

  try {
    const results = await webSearch({
      query,
      provider: providers,
      maxResults,
      strategy,
      freshness,
      searchType,
      deduplicate: values.dedupe,
    });

    if (values.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      console.log(`No results found for "${query}".`);
      return;
    }

    console.log(`\nFound ${results.length} results for "${query}":\n`);
    results.forEach((item, idx) => {
      console.log(`${idx + 1}. [${item.provider}] ${item.title}`);
      console.log(`   ${item.url}`);
      if (item.snippet) {
        console.log(`   ${item.snippet.slice(0, 160)}${item.snippet.length > 160 ? '...' : ''}`);
      }
      if (item.publishedDate) {
        console.log(`   Published: ${item.publishedDate}`);
      }
      console.log('');
    });
  } catch (error) {
    console.error('Search error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Execute if run directly
runCli();
