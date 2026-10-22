import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
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

function getActiveProviders(): SearchProvider[] {
  const env = process.env;
  const providers: SearchProvider[] = [];

  if (env.BRAVE_API_KEY || env.BRAVE_SEARCH_API_KEY) {
    providers.push(
      createBraveProvider({ apiKey: (env.BRAVE_API_KEY || env.BRAVE_SEARCH_API_KEY)! })
    );
  }
  if (env.TAVILY_API_KEY) {
    providers.push(createTavilyProvider({ apiKey: env.TAVILY_API_KEY }));
  }
  if (env.EXA_API_KEY) {
    providers.push(createExaProvider({ apiKey: env.EXA_API_KEY }));
  }
  if (env.GOOGLE_API_KEY && env.GOOGLE_CX) {
    providers.push(createGoogleProvider({ apiKey: env.GOOGLE_API_KEY, cx: env.GOOGLE_CX }));
  }
  if (env.PERPLEXITY_API_KEY) {
    providers.push(createPerplexityProvider({ apiKey: env.PERPLEXITY_API_KEY }));
  }
  if (env.BING_API_KEY) {
    providers.push(createBingProvider({ apiKey: env.BING_API_KEY }));
  }
  if (env.YOU_API_KEY) {
    providers.push(createYouProvider({ apiKey: env.YOU_API_KEY }));
  }
  if (env.PARALLEL_API_KEY) {
    providers.push(createParallelProvider({ apiKey: env.PARALLEL_API_KEY }));
  }
  if (env.SERPAPI_API_KEY) {
    providers.push(createSerpApiProvider({ apiKey: env.SERPAPI_API_KEY }));
  }
  if (env.SEARXNG_BASE_URL) {
    providers.push(createSearXNGProvider({ baseUrl: env.SEARXNG_BASE_URL }));
  }

  // Always include zero-API-key fallback providers
  providers.push(createDuckDuckGoProvider());
  providers.push(createPubMedProvider());
  providers.push(createArxivProvider());
  providers.push(createSemanticScholarProvider());
  providers.push(createGitHubProvider({ apiKey: env.GITHUB_TOKEN || env.GITHUB_API_KEY }));

  return providers;
}

export async function runServer(): Promise<void> {
  const server = new Server(
    {
      name: 'omnisearch-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'web_search',
          description:
            'Search the live web across multiple search engines with automatic fallback, deduplication, and domain filtering.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The search query to execute.' },
              maxResults: {
                type: 'number',
                description: 'Maximum results to return (default 10).',
              },
              freshness: {
                type: 'string',
                enum: ['day', 'week', 'month', 'year'],
                description: 'Filter content published within the last day, week, month, or year.',
              },
              strategy: {
                type: 'string',
                enum: ['parallel', 'fallback', 'race'],
                description: 'Multi-provider execution strategy.',
              },
              includeDomains: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of domain names to restrict results to.',
              },
              excludeDomains: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of domain names to exclude from results.',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'news_search',
          description: 'Search breaking and recent news articles across search engines.',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The news search query.' },
              maxResults: { type: 'number', description: 'Maximum news results to return.' },
              freshness: {
                type: 'string',
                enum: ['day', 'week', 'month', 'year'],
                description: 'Recency filter for news.',
              },
            },
            required: ['query'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const providers = getActiveProviders();

    if (name === 'web_search' || name === 'news_search') {
      const query = (args?.query as string) || '';
      const maxResults = (args?.maxResults as number) || 10;
      const freshness = args?.freshness as 'day' | 'week' | 'month' | 'year' | undefined;
      const strategy = (args?.strategy as 'parallel' | 'fallback' | 'race') || 'parallel';
      const searchType = name === 'news_search' ? 'news' : 'web';
      const includeDomains = args?.includeDomains as string[] | undefined;
      const excludeDomains = args?.excludeDomains as string[] | undefined;

      try {
        const results = await webSearch({
          query,
          provider: providers,
          maxResults,
          freshness,
          strategy,
          searchType,
          includeDomains,
          excludeDomains,
          deduplicate: true,
        });

        const formatted = results
          .map((r, i) => `${i + 1}. [${r.title}](${r.url})\n   ${r.snippet ?? ''}`)
          .join('\n\n');

        return {
          content: [
            {
              type: 'text',
              text: formatted || `No results found for "${query}".`,
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Search error: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch((error) => {
  console.error('Fatal MCP Server error:', error);
  process.exit(1);
});
