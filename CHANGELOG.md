# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
