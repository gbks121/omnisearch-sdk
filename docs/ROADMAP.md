# Future Roadmap: OmniSearch SDK

This document outlines strategic areas of development prioritized to establish OmniSearch SDK as a reliable, standardized multi-provider search abstraction layer for AI agents, workflows, and edge environments.

---

## 🎯 Tier 1: Core Pipeline Reliability & Normalization (Immediate Priority)
*Foundational resilience, deduplication, and standard metadata needed for production multi-provider retrieval.*

### 1. Fallback & Cascade Execution (`strategy: 'fallback'`) - ✅ *Implemented in v4.2.0*
*   **The Need:** When a single provider hits rate limits (HTTP 429), quota exhaustion, or temporary upstream failures, retrieval pipelines should gracefully degrade rather than fail.
*   **Implementation:** Support `strategy: 'parallel' | 'fallback' | 'race'`. In `'fallback'` mode, providers execute sequentially in defined priority order (e.g., Brave -> Tavily -> Google) until one succeeds with non-empty results. In `'race'` mode, providers execute concurrently and return results from the first non-empty response.

### 2. Canonical URL Normalization & Smart Deduplication - ✅ *Implemented in v4.2.0*
*   **The Need:** Cross-syndicated search results frequently slip past naive string deduplication due to tracking parameters, protocol variants, or trailing slashes, causing duplicate downstream LLM ingestion.
*   **Implementation:**
    *   Strip marketing/analytics query params (`utm_*`, `ref`, `fbclid`, `gclid`, `mc_eid`, etc.).
    *   Normalize protocol (`https`), lowercase host, and normalize trailing slashes.
    *   Support configurable options (e.g., `{ stripWww?: boolean }`, defaulting to `false` to avoid breaking host-dependent routing).
    *   Expose deduplication helper `dedupeResults(results, options?)` and an optional `{ deduplicate: true }` flag in `webSearch` and `webSearchStream`.

### 3. Unified Freshness & News Search Mode - ✅ *Implemented in v4.2.0*
*   **The Need:** Real-time information discovery requires breaking/recent content (past 24h) rather than evergreen documentation.
*   **Implementation:**
    *   Standardize `freshness: 'day' | 'week' | 'month' | 'year'` across providers (mapping to Brave `freshness`, Perplexity `searchRecencyFilter`, Google `dateRestrict`, Tavily `timeRange`, DuckDuckGo `df`, SerpAPI `tbs: qdr:*`, Exa `start_published_date`, Parallel `after_date`).
    *   Standardize `searchType: 'news' | 'web'` across supported providers (Brave, DuckDuckGo, Google, SerpAPI, Tavily).

### 4. Domain Filtering (`excludeDomains` / `includeDomains`) - ✅ *Implemented in v4.2.0*
*   **The Need:** Downstream pipelines frequently need to exclude content farms, low-signal domains, or focus on specific whitelist sources.
*   **Implementation:** Add `excludeDomains: string[]` and `includeDomains: string[]` to `SearchQuery`. Providers pass native API filters where supported (Tavily, Exa, Perplexity, Google, Parallel), with deterministic fallback post-filtering in `AbstractSearchProvider`.

### 5. Normalized Temporal Metadata (ISO 8601 Timestamps) - ✅ *Implemented in v4.2.0*
*   **The Need:** Providers return published dates in disparate formats (relative strings like "2 hours ago", epoch integers, or unparsed date strings), complicating downstream sorting and recency scoring.
*   **Implementation:** Parse and normalize `publishedDate` to guaranteed ISO 8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`) across all providers via `src/utils/date.ts`.

---

## ⚡ Tier 2: Performance & Telemetry (Medium Priority)
*Reducing API spend and surfacing provider health.*

### 6. Pluggable Cache Interface (`SearchCacheStore`) - ✅ *Implemented in v4.2.0*
*   **The Need:** Recurring scheduled queries evaluate similar terms within short intervals. Caching responses reduces latency and API costs.
*   **Implementation:**
    *   Define a lean, provider-agnostic `SearchCacheStore` interface (`get`, `set`, `has`, `delete`).
    *   Ship a zero-dependency in-memory LRU store (`MemoryCacheStore`) built-in.
    *   Keep external storage (Cloudflare KV, Redis, Upstash) cleanly decoupled via the interface, allowing users to supply their own adapter without bloating the core bundle.
    *   Support per-query and global TTL configuration via `cache?: boolean | { ttlMs?: number; key?: string }`.

### 7. Quota & Rate Limit Telemetry - ✅ *Implemented in v4.2.0*
*   **The Need:** Multi-provider orchestrators need visibility into remaining requests and quota resets across providers.
*   **Implementation:** Enrich `onResponse` callbacks and provider telemetry with normalized rate-limit metadata parsed from response headers (`x-ratelimit-remaining`, `retry-after`, `x-ratelimit-reset`, etc.) attached to `HttpError`, `RateLimitError`, and `ProviderHooks.onResponse`.

---

## 🧠 Tier 3: Advanced Retrieval (Selective & Non-Breaking)
*Low-complexity consensus and low-latency consumption.*

### 8. Result Streaming (`webSearchStream`) - ✅ *Implemented in v4.2.0*
*   **The Need:** High-latency search providers (e.g., LLM-augmented engines like Perplexity) can block faster providers (e.g., Brave).
*   **Implementation:** Provide a lightweight `AsyncIterable<SearchResult>` yielding results as each provider resolves, with optional real-time deduplication across incoming provider result chunks.

### 9. Reciprocal Rank Fusion Utility (RRF) - ✅ *Implemented in v4.2.0*
*   **The Need:** When querying multiple engines concurrently, rank ordering should reflect consensus across diverse indices.
*   **Implementation:** Expose an optional, pure utility function `reciprocalRankFusion(resultsLists: SearchResult[][], options?: { k?: number }): SearchResult[]`. Implements $RRF\_Score(d) = \sum \frac{1}{k + r_m(d)}$.

---

## 🌐 Tier 4: Ecosystem & Tooling (Downstream Packages)
*Separate packages and platform verification.*

### 10. Strict Edge Runtime Verification - ✅ *Implemented in v4.2.0*
*   Maintain zero-Node-dependency core verified across Cloudflare Workers, Vercel Edge, Bun, and Deno.
*   Continuous integration tests in `src/__tests__/edge.test.ts` verifying no Node-only module imports in the core bundle.

### 11. Provider Expansion - ✅ *Implemented in v4.2.0*
*   *News & General:* Bing Web Search API (`bing`), You.com (`you`).
*   *Academic & Domain:* PubMed (`pubmed`), Semantic Scholar (`semantic-scholar`), GitHub Search (`github`).
*   *Self-Hosted:* Support custom SearXNG endpoints via explicit base URL configuration.

### 12. Separate Tooling Packages - ✅ *Implemented in v4.2.0*
*   `@omnisearch/mcp`: Standalone Model Context Protocol server exposing OmniSearch tools (`web_search`, `news_search`) to Claude Desktop, Cursor, and agent runtimes. Located in `packages/mcp`.
*   `@omnisearch/cli`: Lightweight command-line utility for interactive testing and shell scripts. Located in `packages/cli`.

---

## 🚫 Explicit Non-Goals

To maintain high reliability, maintainability, and clean architectural boundaries, the following capabilities are explicitly out of scope for the core SDK:

1. **Web Scraping & Full Content Extraction:** OmniSearch is a search discovery layer, not a web crawler or scraper. Extracting full DOM content, handling paywalls, bypassing anti-bot challenges, or running headless browsers belongs in dedicated extraction tools (e.g., Jina Reader, Firecrawl, Puppeteer).
2. **LLM Prompt Formatting:** Formatting results into model-specific prompts (token budgeting, XML tags, conversational templates) belongs in LLM orchestration libraries (e.g., Vercel AI SDK, LangChain). OmniSearch provides clean, structured data objects.
3. **Vector / Embedding Search & RAG Orchestration:** OmniSearch aggregates live web indices. Chunking, embedding generation, and vector index retrieval are the responsibility of dedicated vector databases and RAG pipelines.

---

## 🧪 Testing & Reliability Strategy

*   **Mock Unit Tests:** Fast, deterministic Vitest suite mocking network transport via `src/utils/http.ts` for 100% offline verification in CI.
*   **Contract Schema Tests:** Ensure provider responses validate against `SearchResultSchema` with all edge-case fields (null snippets, strange timestamps, empty result arrays).
*   **Live Integration Smoke Tests:** Separate, opt-in suite running against real provider APIs with secrets enabled in CI on a nightly or manual schedule to proactively detect upstream schema drift.

---

## 📦 Versioning & Deprecation Policy

*   **SemVer Compliance:** Strict adherence to Semantic Versioning (`MAJOR.MINOR.PATCH`).
*   **Pre-1.0 Iteration:** Minor releases (`0.x.0`) may introduce breaking changes with explicit migration notes in release changelogs.
*   **Post-1.0 Stability:** No breaking changes without a major version bump and at least one minor release cycle with deprecation warnings.
