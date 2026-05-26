# OmniSearch SDK

A unified, high-performance TypeScript SDK for web search providers.

Inspired by [PlustOrg/search-sdk](https://github.com/PlustOrg/search-sdk), this version is a **complete overhaul and redesign** focused on reliability, functional error handling, and robust concurrency.

## ✨ Key Enhancements

- **Functional Error Handling**: Powered by [`neverthrow`](https://github.com/supermacro/neverthrow) for type-safe error paths without unexpected exceptions.
- **Smart Retries**: Integrated exponential backoff via [`p-retry`](https://github.com/sindresorhus/p-retry) for 429 (Rate Limit) and 5xx errors.
- **Deadlines & Throttling**: Hard timeouts per request via [`p-timeout`](https://github.com/sindresorhus/p-timeout) and proactive rate limiting with [`p-throttle`](https://github.com/sindresorhus/p-throttle).
- **Strict Validation**: Type safety with Zod for all provider responses.
- **Modern ESM**: First-class support for ES Modules and Node 20+.
- **Standardized Architecture**: All providers share a common factory, ensuring consistent behavior and troubleshooting.

## 🚀 Quick Start

### Installation

```bash
pnpm add omnisearch-sdk
# or
npm install omnisearch-sdk
```

### Basic Usage

The `webSearch` function provides a simplified, aggregate interface for querying multiple providers at once.

```typescript
import { webSearch, createGoogleProvider, createBraveProvider } from 'omnisearch-sdk';

// Initialize providers with your API keys
const google = createGoogleProvider({ apiKey: 'YOUR_API_KEY', cx: 'YOUR_CX' });
const brave = createBraveProvider({ apiKey: 'YOUR_API_KEY' });

async function search() {
  const result = await webSearch({
    query: 'TypeScript functional programming',
    provider: [google, brave],
    maxResults: 10,
  });

  if (result.isOk()) {
    result.value.forEach((res) => {
      console.log(`[${res.provider}] ${res.title} - ${res.url}`);
    });
  } else {
    // webSearch returns an error if ALL providers fail
    console.error('Search failed:', result.error.message);
  }
}
```

## 📋 Response Structure

All providers return a standardized `SearchResult` object:

```typescript
interface SearchResult {
  url: string; // Validated URL of the result
  title: string; // Result title
  snippet?: string; // Short description or snippet
  content?: string; // Full content (if supported by provider, e.g. Exa)
  domain?: string; // Extracted domain name
  publishedDate?: string; // RFC3339 or ISO8601 date string
  provider: string; // Name of the provider (e.g. 'google')
  raw?: any; // The original unmapped response item
}
```

## 🛠️ Supported Providers

| Provider       | Factory Function           | Requirements                    |
| :------------- | :------------------------- | :------------------------------ |
| **Google**     | `createGoogleProvider`     | API Key & CX (Search Engine ID) |
| **Brave**      | `createBraveProvider`      | API Key                         |
| **Exa**        | `createExaProvider`        | API Key                         |
| **Tavily**     | `createTavilyProvider`     | API Key                         |
| **SerpAPI**    | `createSerpApiProvider`    | API Key                         |
| **Perplexity** | `createPerplexityProvider` | API Key                         |
| **SearXNG**    | `createSearXNGProvider`    | Instance URL                    |
| **Arxiv**      | `createArxivProvider`      | None                            |
| **DuckDuckGo** | `createDuckDuckGoProvider` | None (Scraping)                 |
| **Parallel**   | `createParallelProvider`   | API Key                         |

> **Note on Google:** As of Jan 2026, new Programmable Search Engines are restricted to searching specific domains (up to 50). Whole-web search is only available on engines created before this change (until Jan 2027). For general web search, consider Brave, SerpAPI, or DuckDuckGo.

## 🧩 Advanced Usage

### Working with Results (Functional Style)

Internal providers return `ResultAsync` objects. This allows you to handle errors explicitly without `try/catch` blocks.

```typescript
import { createGoogleProvider } from 'omnisearch-sdk';

const google = createGoogleProvider({ apiKey: '...', cx: '...' });
const result = await google.search({ query: 'Hello World' });

if (result.isOk()) {
  console.log('Results:', result.value); // result.value is SearchResult[]
} else {
  // result.error is a standardized Error object
  console.error('Provider error:', result.error.message);
}
```

### Configuration & Retries

All providers support configuration at instantiation and per-request overrides.

```typescript
const google = createGoogleProvider({
  apiKey: '...',
  cx: '...',
  timeout: 5000, // 5s timeout
});

// Request-specific override (e.g. more results, custom retries)
await google.search({ query: '...', maxResults: 20, retries: 5 });
```

### Timeouts & Throttling

Control request deadlines and prevent rate limiting at the source.

```typescript
import { createGoogleProvider } from 'omnisearch-sdk';

const google = createGoogleProvider({
  apiKey: '...',
  cx: '...',
  // Global timeout for all requests to this provider
  timeout: 5000,
  // Proactive rate limiting: 5 requests per 2 seconds
  throttleLimit: 5,
  throttleInterval: 2000,
});

// You can also override timeout per request
await google.search({
  query: 'TypeScript',
  timeout: 2000,
});
```

### Provider-Specific Options

Each provider can have unique options. You can use these by calling the provider's `search` method directly.

```typescript
import { createArxivProvider, createBraveProvider } from 'omnisearch-sdk';

// Arxiv: Search by ID list instead of text query
const arxiv = createArxivProvider();
await arxiv.search({ idList: '2305.02392,2305.02393' });

// Brave: Search news instead of web
const brave = createBraveProvider({ apiKey: '...' });
await brave.search({ query: 'SpaceX', searchType: 'news' });
```

### Debugging

Enable logging to see exactly what's happening under the hood.

```typescript
import { webSearch, createGoogleProvider } from 'omnisearch-sdk';

const google = createGoogleProvider({ apiKey: '...', cx: '...' });

const results = await webSearch({
  query: '...',
  provider: [google],
  debug: {
    enabled: true,
    logResponse: true, // Logs raw responses for troubleshooting
  },
});
```

## 🏗️ Development

```bash
# Install dependencies
pnpm install

# Run unit tests
pnpm test

# Run integration tests (real API calls)
cp .env.example .env   # then edit .env with your API keys
pnpm test -- --run integration

# Build for distribution (CJS, ESM, DTS)
pnpm run build
```

## 📜 License

MIT
