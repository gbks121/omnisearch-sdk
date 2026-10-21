# OmniSearch SDK

A unified, high-performance TypeScript SDK for web search providers.

Inspired by [PlustOrg/search-sdk](https://github.com/PlustOrg/search-sdk), this version is a **complete overhaul and redesign** focused on reliability, structured errors, and robust concurrency.

## Key Enhancements

- **Structured Error Handling**: Typed error hierarchy (`SearchProviderError`, `RateLimitError`, `TimeoutError`, etc.) with `code`, `provider`, `statusCode`, and `retryable` fields. No unexpected exceptions.
- **Lifecycle Hooks**: `onRequest`, `onResponse`, `onError` callbacks for observability without coupling to a specific logger.
- **Smart Retries**: Integrated exponential backoff via `p-retry` for 429 (Rate Limit) and 5xx errors.
- **Deadlines & Throttling**: Hard timeouts per request via `p-timeout` and proactive rate limiting with `p-throttle`.
- **Strict Validation**: Type safety with Zod for all provider responses.
- **Modern ESM & CJS**: Dual package support for ES Modules and CommonJS (Node 20+).
- **Standardized Architecture**: All providers share a common factory, ensuring consistent behavior and troubleshooting.

## Quick Start

### Installation

```bash
pnpm add omnisearch-sdk
# or
npm install omnisearch-sdk
```

### Basic Usage

The `webSearch` function provides an aggregate interface for querying multiple providers concurrently. It returns a `Promise<SearchResult[]>` and throws if all providers fail or if no providers are given.

```typescript
import { webSearch, createGoogleProvider, createBraveProvider } from 'omnisearch-sdk';

const google = createGoogleProvider({ apiKey: 'YOUR_API_KEY', cx: 'YOUR_CX' });
const brave = createBraveProvider({ apiKey: 'YOUR_API_KEY' });

async function search() {
  try {
    const results = await webSearch({
      query: 'TypeScript functional programming',
      provider: [google, brave],
      maxResults: 10,
    });

    results.forEach((res) => {
      console.log(`[${res.provider}] ${res.title} - ${res.url}`);
    });
  } catch (error) {
    console.error('Search failed:', error);
  }
}
```

## Error Handling

Direct provider calls (`provider.search(...)`) throw typed errors extending `SearchProviderError`:

| Error Type | Code | When |
|---|---|---|
| `RateLimitError` | `RATE_LIMIT` | HTTP 429 |
| `TimeoutError` | `TIMEOUT` | Request exceeded deadline |
| `SearchValidationError` | `VALIDATION` | Invalid input (empty query, etc.) |
| `ProviderApiError` | `PROVIDER` | HTTP 4xx/5xx or provider-level errors |
| `NetworkError` | `NETWORK` | Connection failures |

All errors include:
- `error.provider` — which provider failed
- `error.statusCode` — HTTP status (when applicable)
- `error.retryable` — whether retrying might help
- `error.troubleshooting` — actionable hint (on `ProviderApiError`)

When using `webSearch`, if one provider fails while others succeed, the failure is dispatched to `hooks.onError` and successful results are returned. `webSearch` only throws an aggregated error if all configured providers fail (or no provider was provided).

```typescript
import { RateLimitError, TimeoutError } from 'omnisearch-sdk';

try {
  const results = await webSearch({ ... });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(`Rate limited by ${error.provider}, retryable: ${error.retryable}`);
  } else if (error instanceof TimeoutError) {
    console.log(`Request to ${error.provider} timed out`);
  }
}
```

Consumers who prefer `neverthrow` can wrap calls trivially:

```typescript
import { fromPromise } from 'neverthrow';
const result = await fromPromise(webSearch(opts), (e) => e as Error);
```

## Lifecycle Hooks

Observe search operations without modifying behavior:

```typescript
const results = await webSearch({
  query: 'TypeScript',
  provider: [google, brave],
  hooks: {
    onRequest: (provider, query) => {
      console.log(`[${provider}] Searching for: ${query}`);
    },
    onResponse: (provider, resultCount, durationMs) => {
      metrics.timing('search.duration', durationMs, { provider });
    },
    onError: (provider, error) => {
      sentry.captureException(error, { tags: { provider } });
    },
  },
});
```

## Response Structure

All providers return a standardized `SearchResult` object:

```typescript
interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
  content?: string;
  domain?: string;
  publishedDate?: string;
  provider: string;
  raw?: unknown;
}
```

## Supported Providers

| Provider | Factory Function | Requirements |
|---|---|---|
| **Google** | `createGoogleProvider` | API Key & CX (Search Engine ID) |
| **Brave** | `createBraveProvider` | API Key |
| **Exa** | `createExaProvider` | API Key |
| **Tavily** | `createTavilyProvider` | API Key |
| **SerpAPI** | `createSerpApiProvider` | API Key |
| **Perplexity** | `createPerplexityProvider` | API Key |
| **SearXNG** | `createSearXNGProvider` | Instance URL |
| **Arxiv** | `createArxivProvider` | None |
| **DuckDuckGo** | `createDuckDuckGoProvider` | None (Scraping) |
| **Parallel** | `createParallelProvider` | API Key |

> **Note on Google:** As of Jan 2026, new Programmable Search Engines are restricted to searching specific domains (up to 50). Whole-web search is only available on engines created before this change (until Jan 2027). The Custom Search JSON API is closed to new customers.

## Advanced Usage

### Configuration & Retries

All providers support configuration at instantiation and per-request overrides.

```typescript
const google = createGoogleProvider({
  apiKey: '...',
  cx: '...',
  timeout: 5000,
});

await google.search({ query: '...', maxResults: 20, retries: 5 });
```

### Timeouts & Throttling

Control request deadlines and prevent rate limiting at the source.

```typescript
const google = createGoogleProvider({
  apiKey: '...',
  cx: '...',
  timeout: 5000,
  throttleLimit: 5,
  throttleInterval: 2000,
});

await google.search({
  query: 'TypeScript',
  timeout: 2000,
});
```

### Unified Query Options

`SearchQuery` is a unified interface accepted by all providers. Provider-specific options are passed via the index signature:

```typescript
import { createArxivProvider, createBraveProvider } from 'omnisearch-sdk';

const arxiv = createArxivProvider();
await arxiv.search({ idList: '2305.02392,2305.02393' });

const brave = createBraveProvider({ apiKey: '...' });
await brave.search({ query: 'SpaceX', searchType: 'news' });
```

## Development

```bash
pnpm install
pnpm test               # Run test suite
pnpm run type-check     # Type-check TypeScript
pnpm run check          # Lint & format with Biome
pnpm run build          # Build ESM, CJS, and DTS bundles

# Optional: Run real integration tests (requires API keys)
cp .env.example .env    # Configure provider API keys
pnpm test src/__tests__/integration.test.ts
```

## License

MIT
