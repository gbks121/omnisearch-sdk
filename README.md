# OmniSearch SDK

A unified, high-performance TypeScript SDK for multi-provider web search retrieval. Built for AI agents, production pipelines, and edge environments.

## Key Features

- **Structured Error Handling**: Typed error hierarchy (`SearchProviderError`, `RateLimitError`, `TimeoutError`, etc.) with `code`, `provider`, `statusCode`, and `retryable` fields.
- **Cascade & Strategy Modes**: Support for `'parallel'`, `'fallback'`, and `'race'` search strategies across multiple engines.
- **Canonical URL Deduplication**: Intelligent stripping of analytics/tracking parameters (`utm_*`, `fbclid`, `gclid`, etc.) and protocol/path normalization.
- **Unified Freshness & News Mode**: Standardized temporal filters (`day`, `week`, `month`, `year`) and `searchType: 'news' | 'web'` across supported providers.
- **Deterministic Domain Filtering**: `includeDomains` and `excludeDomains` with native API mapping and guaranteed base-provider fallback filtering.
- **Normalized ISO 8601 Timestamps**: Guaranteed ISO 8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`) for all result publication dates.
- **Zero-Dependency Caching**: Pluggable `SearchCacheStore` interface with a built-in in-memory LRU store (`MemoryCacheStore`).
- **Real-Time Result Streaming**: `webSearchStream` asynchronous generator for incremental processing as each provider resolves.
- **Reciprocal Rank Fusion (RRF)**: Consensus-based multi-engine re-ranking utility (`reciprocalRankFusion`).
- **Telemetry & Rate Limit Visibility**: Automatic response header parsing (`x-ratelimit-remaining`, `retry-after`) surfaced directly to hooks.
- **Edge Ready & Node 24+**: Zero Node.js-only dependencies in the core retrieval engine. Verified for Cloudflare Workers, Vercel Edge, Deno, and Node.js >= 24.

---

## Quick Start

### Installation

```bash
pnpm add omnisearch-sdk
# or
npm install omnisearch-sdk
```

### Basic Usage

```typescript
import { webSearch, createBraveProvider, createTavilyProvider } from 'omnisearch-sdk';

const brave = createBraveProvider({ apiKey: process.env.BRAVE_API_KEY });
const tavily = createTavilyProvider({ apiKey: process.env.TAVILY_API_KEY });

const results = await webSearch({
  query: 'autonomous AI agents',
  provider: [brave, tavily],
  maxResults: 10,
  deduplicate: true,
});

for (const res of results) {
  console.log(`[${res.provider}] ${res.title} - ${res.url}`);
}
```

---

## Retrieval Strategies (`strategy`)

The `webSearch` function supports three execution strategies:

```typescript
// 1. Parallel (Default): Query all providers concurrently up to bounded concurrency
const parallelResults = await webSearch({
  query: 'TypeScript',
  provider: [brave, tavily],
  strategy: 'parallel',
});

// 2. Fallback: Cascades sequentially (e.g. Brave -> Tavily -> DuckDuckGo) until one succeeds
const fallbackResults = await webSearch({
  query: 'TypeScript',
  provider: [brave, tavily],
  strategy: 'fallback',
});

// 3. Race: Resolves with the fastest provider to return non-empty results
const raceResults = await webSearch({
  query: 'TypeScript',
  provider: [brave, tavily],
  strategy: 'race',
});
```

---

## Result Streaming (`webSearchStream`)

Start consuming results as soon as each provider finishes without waiting for slower engines:

```typescript
import { webSearchStream, createBraveProvider, createPerplexityProvider } from 'omnisearch-sdk';

const brave = createBraveProvider({ apiKey: process.env.BRAVE_API_KEY });
const perplexity = createPerplexityProvider({ apiKey: process.env.PERPLEXITY_API_KEY });

for await (const result of webSearchStream({
  query: 'LLM retrieval benchmarks',
  provider: [brave, perplexity],
  deduplicate: true,
})) {
  console.log(`Streamed: [${result.provider}] ${result.title}`);
}
```

---

## Canonical Deduplication & Normalization

Cross-syndicated articles with differing tracking query params or protocols are automatically normalized and deduplicated:

```typescript
import { dedupeResults, normalizeUrl } from 'omnisearch-sdk';

const cleanUrl = normalizeUrl('http://example.com/page/?utm_source=twitter&fbclid=123');
// -> "https://example.com/page"

const deduped = dedupeResults(results, { stripWww: false });
```

---

## Reciprocal Rank Fusion (RRF)

Re-rank multi-provider results based on consensus ranking:

```typescript
import { reciprocalRankFusion } from 'omnisearch-sdk';

const braveResults = await brave.search({ query: 'quantum computing' });
const googleResults = await google.search({ query: 'quantum computing' });

const fusedResults = reciprocalRankFusion([braveResults, googleResults], { k: 60 });
```

---

## Caching (`MemoryCacheStore`)

Prevent duplicate queries and reduce API spend using the built-in LRU cache:

```typescript
import { createBraveProvider, MemoryCacheStore } from 'omnisearch-sdk';

const cache = new MemoryCacheStore({ maxEntries: 1000, defaultTtlMs: 10 * 60 * 1000 });
const brave = createBraveProvider({ apiKey: '...', cache });

// First search hits API
const res1 = await brave.search({ query: 'react 19', cache: true });

// Second search returns cached results in <1ms
const res2 = await brave.search({ query: 'react 19', cache: true });
```

---

## Freshness, News, and Domain Filtering

```typescript
await webSearch({
  query: 'AI breakthroughs',
  provider: [brave, tavily],
  freshness: 'day', // 'day' | 'week' | 'month' | 'year'
  searchType: 'news', // 'web' | 'news'
  includeDomains: ['nature.com', 'arxiv.org'],
  excludeDomains: ['contentfarm.com'],
});
```

---

## Lifecycle Hooks & Telemetry

```typescript
const results = await webSearch({
  query: 'TypeScript',
  provider: [brave, tavily],
  hooks: {
    onRequest: (provider, query) => {
      console.log(`[${provider}] Searching: ${query}`);
    },
    onResponse: (provider, count, durationMs, telemetry) => {
      console.log(`[${provider}] Returned ${count} items in ${durationMs}ms`);
      if (telemetry?.remaining !== undefined) {
        console.log(`Quota remaining: ${telemetry.remaining}`);
      }
    },
    onError: (provider, error) => {
      console.error(`[${provider}] Failed:`, error.message);
    },
  },
});
```

---

## Supported Search Providers (15 Engines)

| Provider | Factory Function | Category | Requirements |
|---|---|---|---|
| **Brave** | `createBraveProvider` | Web / News | API Key |
| **Google** | `createGoogleProvider` | Web | API Key & Search Engine ID (CX) |
| **Bing** | `createBingProvider` | Web / News | Azure Bing API Key |
| **You.com** | `createYouProvider` | Web / News | API Key |
| **Tavily** | `createTavilyProvider` | Web / News / AI | API Key |
| **Exa** | `createExaProvider` | Neural / Keyword | API Key |
| **Parallel** | `createParallelProvider` | Agentic / Live | API Key |
| **Perplexity** | `createPerplexityProvider` | Web / LLM | API Key |
| **PubMed** | `createPubMedProvider` | Academic / Biomedical | None (API Key optional) |
| **Semantic Scholar** | `createSemanticScholarProvider` | Academic / Papers | None (API Key optional) |
| **Arxiv** | `createArxivProvider` | Academic / Preprints | None |
| **GitHub** | `createGitHubProvider` | Code / Repositories | None (API Token optional) |
| **DuckDuckGo** | `createDuckDuckGoProvider` | Web / News / Images | None |
| **SearXNG** | `createSearXNGProvider` | Self-Hosted Metasearch | Instance URL |
| **SerpAPI** | `createSerpApiProvider` | Google / Yahoo / Bing | API Key |

---

## Tooling Packages

### Standalone CLI (`omnisearch-cli`)
Interactive search directly from your terminal:
```bash
npx omnisearch-cli "AI research papers" --provider pubmed -n 5
npx omnisearch-cli "Breaking news" --provider brave --freshness day --json
```

### Model Context Protocol Server (`omnisearch-mcp`)
Expose OmniSearch directly to Claude Desktop, Cursor, and agent runtimes:
```json
{
  "mcpServers": {
    "omnisearch": {
      "command": "npx",
      "args": ["-y", "omnisearch-mcp"],
      "env": {
        "BRAVE_API_KEY": "YOUR_KEY"
      }
    }
  }
}
```

---

## Development & Testing

```bash
pnpm install
pnpm test               # Run all unit and integration tests
pnpm run test:coverage  # Run coverage verification (>=80% thresholds)
pnpm run type-check     # Strict TypeScript validation
pnpm run check          # Biome linting & formatting
pnpm run build          # Bundle ESM, CJS, and DTS distributions
```

## License

MIT
