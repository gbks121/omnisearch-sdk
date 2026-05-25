# OmniSearch SDK

A unified, high-performance TypeScript SDK for web search providers.

Inspired by [PlustOrg/search-sdk](https://github.com/PlustOrg/search-sdk), this version is a **complete overhaul and redesign** focused on enterprise-grade reliability, functional error handling, and robust concurrency.

## ✨ Key Enhancements

- **Functional Error Handling**: Powered by [`neverthrow`](https://github.com/supermacro/neverthrow) for type-safe error paths without unexpected exceptions.
- **Smart Retries**: Integrated exponential backoff via [`p-retry`](https://github.com/sindresorhus/p-retry) for 429 (Rate Limit) and 5xx errors.
- **Deadlines & Throttling**: Hard timeouts per request via [`p-timeout`](https://github.com/sindresorhus/p-timeout) and proactive rate limiting with [`p-throttle`](https://github.com/sindresorhus/p-throttle).
- **Strict Validation**: Type safety with Zod for all provider responses.
- **Modern ESM**: First-class support for ES Modules and Node 18+.
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
import { webSearch, google, brave } from 'omnisearch-sdk';

// Configure providers with your API keys
google.configure({ apiKey: 'YOUR_GOOGLE_API_KEY', searchEngineId: 'YOUR_CX' });
brave.configure({ apiKey: 'YOUR_BRAVE_API_KEY' });

async function search() {
  try {
    const results = await webSearch({
      query: 'TypeScript functional programming',
      provider: [google, brave],
      maxResults: 10,
    });

    console.log(results);
  } catch (error) {
    // webSearch throws if ALL providers fail
    console.error('Search failed:', error.message);
  }
}
```

## 🛠️ Supported Providers

| Provider | Export | Requirements |
| :--- | :--- | :--- |
| **Google** | `google` | API Key & Search Engine ID |
| **Brave** | `brave` | API Key |
| **Exa** | `exa` | API Key |
| **Tavily** | `tavily` | API Key |
| **SerpAPI** | `serpapi` | API Key |
| **Perplexity** | `perplexity` | API Key |
| **SearXNG** | `searxng` | Instance URL |
| **Arxiv** | `arxiv` | None |
| **DuckDuckGo** | `duckduckgo` | None (Scraping) |
| **Parallel** | `parallel` | Meta-provider |

## 🧩 Advanced Usage

### Working with Results (Functional Style)

Internal providers return `ResultAsync` objects. This allows you to handle errors explicitly without `try/catch` blocks.

```typescript
import { google } from 'omnisearch-sdk';

const result = await google.search({ query: 'Hello World' });

if (result.isOk()) {
  console.log('Results:', result.value); // result.value is SearchResult[]
} else {
  // result.error is a standardized Error object
  console.error('Provider error:', result.error.message);
}
```

### Configuration & Retries

All providers support a global configuration and per-request overrides.

```typescript
google.configure({
  apiKey: '...',
  retries: 3, // Defaults to 2
  maxResults: 5,
});

// Request-specific override
await google.search({ query: '...', maxResults: 10 });
```

### Timeouts & Throttling

Control request deadlines and prevent rate limiting at the source.

```typescript
import { google } from 'omnisearch-sdk';

google.configure({
  apiKey: '...',
  // Global timeout for all requests to this provider
  timeout: 5000, 
  // Proactive rate limiting: 5 requests per 2 seconds
  throttleLimit: 5,
  throttleInterval: 2000 
});

// You can also override timeout per request
await google.search({ 
  query: 'TypeScript', 
  timeout: 2000 
});
```

### Debugging

Enable logging to see exactly what's happening under the hood.

```typescript
import { webSearch } from 'omnisearch-sdk';

const results = await webSearch({
  query: '...',
  provider: [google],
  debug: {
    enabled: true,
    logResponse: true // Logs raw responses for troubleshooting
  }
});
```

## 🏗️ Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build for distribution (CJS, ESM, DTS)
pnpm run build
```

## 📜 License

MIT
