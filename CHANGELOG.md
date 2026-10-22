# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.1] - 2026-10-22

### ⚠️ Breaking Changes & Migration Guide (Upgrading from 4.1.0)

1. **Node.js Runtime Requirement:**
   - Minimum Node.js version is now `>=24.0.0` (upgraded from `>=18.0.0`). Ensure your deployment runtime and CI environments are updated to Node.js 24+.
2. **Guaranteed ISO 8601 UTC Timestamps:**
   - `publishedDate` in `SearchResult` is now strictly normalized to guaranteed ISO 8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`) across all providers. If you relied on raw provider date strings or relative dates, update any custom parsers to expect standard ISO 8601 timestamps.

#### Upgrading Dependencies
```bash
pnpm add omnisearch-sdk@^5.0.1
# or
npm install omnisearch-sdk@^5.0.1
```

---

### Added

- **Multi-Engine Execution Strategies (`strategy`):**
  - Added `'fallback'` mode: Cascades sequentially through providers until one succeeds with non-empty results.
  - Added `'race'` mode: Resolves concurrently with the fastest provider to return results.
  - Retained `'parallel'` (default) with bounded concurrency via `p-map`.
- **Result Streaming (`webSearchStream`):**
  - Lightweight `AsyncIterable<SearchResult>` yielding results incrementally as each engine responds, with live cross-provider deduplication.
- **Canonical URL Deduplication (`deduplicate: true`):**
  - Automatic stripping of marketing/tracking query parameters (`utm_*`, `ref`, `fbclid`, `gclid`, `mc_eid`, etc.), protocol/path normalization, and configurable `stripWww`.
  - Exported standalone `normalizeUrl` and `dedupeResults` utilities.
- **Unified Freshness & News Search Mode:**
  - Standardized `freshness: 'day' | 'week' | 'month' | 'year'` across providers.
  - Standardized `searchType: 'web' | 'news'` mapping to native provider endpoints where available.
- **Deterministic Domain Filtering:**
  - Added `includeDomains` and `excludeDomains` to `SearchQuery` with native provider parameters and guaranteed fallback post-filtering.
- **Pluggable Caching Interface (`SearchCacheStore`):**
  - Lean cache contract with zero-dependency built-in in-memory LRU cache (`MemoryCacheStore`) and per-query TTL overrides.
- **Telemetry & Rate Limit Visibility:**
  - Automatic parsing of vendor and standard rate-limit headers (`x-ratelimit-remaining`, `retry-after`, etc.) attached to `HttpError`, `RateLimitError`, and `ProviderHooks.onResponse`.
- **Reciprocal Rank Fusion (`reciprocalRankFusion`):**
  - Standalone utility function to combine and consensus-rank result lists from multiple engines using $RRF(d) = \sum \frac{1}{k + r_m(d)}$.
- **5 New Search Providers:**
  - `createBingProvider` (Azure Bing Web Search v7)
  - `createYouProvider` (You.com Search)
  - `createPubMedProvider` / `createPubmedProvider` (NCBI PubMed Biomedical search)
  - `createSemanticScholarProvider` (Semantic Scholar academic paper graph)
  - `createGitHubProvider` / `createGithubProvider` (GitHub code and repository search)
- **Downstream Tooling Packages:**
  - `omnisearch-cli` (v1.0.1): Command-line utility for interactive terminal search and shell scripting.
  - `omnisearch-mcp` (v1.0.1): Model Context Protocol server exposing `web_search` and `news_search` tools to Claude Desktop, Cursor, and agentic workflows.
- **Licensing:**
  - Added official root MIT `LICENSE` file.


## [4.0.0] - 2026-05-26

### Breaking Changes

- **Removed `neverthrow` from the public API.** `webSearch()` now returns `Promise<SearchResult[]>` and throws structured errors instead of returning `ResultAsync<SearchResult[], Error>`. Consumers who prefer `neverthrow` can wrap calls with `fromPromise()`.
- **`SearchQuery` replaces `SearchOptions`.** The unified `SearchQuery` type is now the single input type for all search operations, replacing the previous `SearchOptions` and provider-specific option types (`DuckDuckGoSearchOptions`, `ArxivSearchOptions`).
- **`DebugOptions` removed.** Replaced by the new `SearchHooks` interface (`onRequest`, `onResponse`, `onError`).
- **Provider `search()` methods now throw** instead of returning `Result`. Direct provider usage must use try/catch.

### Added

- **Structured error hierarchy** with abstract `SearchProviderError` base class and concrete subclasses:
  - `ProviderApiError` — general API failures
  - `RateLimitError` — HTTP 429 responses
  - `TimeoutError` — request timeouts
  - `NetworkError` — connection failures
  - `SearchValidationError` — invalid search results
  - All errors include `code`, `provider`, `statusCode`, and `retryable` fields
- **Lifecycle hooks** via `SearchHooks` interface:
  - `onRequest(provider, query)` — called before each provider request
  - `onResponse(provider, results)` — called after successful response
  - `onError(provider, error)` — called on provider errors
- **Unified `SearchQuery` type** with `[key: string]: unknown` index signature for provider-specific options

### Removed

- `neverthrow` dependency
- `DuckDuckGoSearchOptions` type
- `ArxivSearchOptions` type
- `DebugOptions` type
- `src/utils/debug.ts` utility

### Changed

- `src/utils/http.ts` — `makeRequest`, `get`, `post` now return `Promise<T>` and throw `HttpError` instead of `ResultAsync`
- `AbstractSearchProvider.search()` returns `Promise<SearchResult[]>`, throws structured errors, calls hooks
- All 10 providers refactored to use unified `doSearch(options: SearchQuery)` signature
- `webSearch()` catches provider errors, wraps non-`SearchProviderError` as `ProviderApiError`, aggregates errors if all providers fail

## [3.0.0] - 2025-05-18

### Added

- Zod runtime validation for all search results
- Shared utility extraction for common provider patterns
- Comprehensive error handling refactor

## [2.2.0] - 2025-05-15

### Changed

- Version bump and linting/type error fixes

## [2.0.0] - 2025-05-10

### Added

- Multi-provider search aggregation
- 10 search providers: Google, Brave, Exa, Tavily, SerpAPI, Perplexity, SearXNG, Arxiv, DuckDuckGo, Parallel
- Retry, timeout, and throttling via `AbstractSearchProvider` base class
- Integration test suite with env-file support
