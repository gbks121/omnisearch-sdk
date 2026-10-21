# Future Roadmap: OmniSearch SDK

This document outlines strategic areas of development prioritized to establish OmniSearch SDK as the premier data retrieval layer for autonomous AI content pipelines, RAG systems, and Edge environments.

---

## 🎯 Tier 1: Core Pipeline Reliability & News Freshness (High Priority)
*Immediate reliability and ingestion quality improvements for automated discovery pipelines.*

### 1. Fallback & Cascade Execution (`strategy: 'fallback'`)
*   **The Need:** When a single provider hits rate limits (HTTP 429), quota exhaustion, or returns 0 results, pipelines should not drop the query.
*   **Implementation:** Support `strategy: 'parallel' | 'fallback' | 'race'`. In `'fallback'` mode, providers execute sequentially in defined priority order (e.g., Brave -> Tavily -> Perplexity) until one succeeds with non-empty results.

### 2. Canonical URL Normalization & Smart Deduplication
*   **The Need:** Cross-syndicated articles often slip past naive deduplication due to tracking parameters, protocol variants, or trailing slashes, causing redundant downstream AI processing.
*   **Implementation:**
    *   Strip marketing/analytics query params (`utm_*`, `ref`, `fbclid`, `gclid`, `mc_eid`, etc.).
    *   Normalize protocol (`https`), lowercase host, strip `www.`, and normalize trailing slashes.
    *   Expose deduplication helper `dedupeResults(results)` and an optional `{ deduplicate: true }` flag in `webSearch`.

### 3. Unified Freshness & News Search Mode
*   **The Need:** Automated newsrooms require breaking/recent content (past 24h) rather than evergreen documentation.
*   **Implementation:**
    *   Standardize `freshness: 'day' | 'week' | 'month' | 'year'` across providers (mapping to Brave `freshness`, Perplexity `searchRecencyFilter`, Google `dateRestrict`, Tavily `timeRange`, DuckDuckGo `df`).
    *   Standardize `searchType: 'news' | 'web'` across supported providers (Brave, DuckDuckGo, Google, SerpAPI).

### 4. Domain Filtering & Spam Exclusion (`excludeDomains` / `includeDomains`)
*   **The Need:** News pipelines frequently need to exclude content farms, paywalled domains, social media scrapers, or specific low-signal sites.
*   **Implementation:** Add `excludeDomains: string[]` and `includeDomains: string[]` to `SearchQuery`. Providers pass native API filters where available, with base-class fallback filtering in `AbstractSearchProvider`.

### 5. Normalized Temporal Metadata (ISO 8601 Timestamps)
*   **The Need:** Providers return published dates in disparate formats (relative text like "2 hours ago", epoch numbers, or unparsed strings), complicating sorting and recency scoring.
*   **Implementation:** Parse and normalize `publishedDate` to guaranteed ISO 8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`) across all providers.

---

## ⚡ Tier 2: Edge Cost Optimization & Content Hydration
*Reducing API spend and feeding high-signal content into downstream AI summarizers.*

### 6. Pluggable Edge Caching (Cloudflare KV & Memory Store)
*   **The Need:** Scheduled discovery jobs frequently evaluate similar queries across intervals. Caching responses on Cloudflare Workers edge nodes saves API budget.
*   **Implementation:**
    *   Define a lightweight `SearchCacheStore` interface (`get`, `set`, `has`).
    *   Provide zero-dependency built-in adapters: `MemoryCacheStore` (LRU) and `CloudflareKvCacheStore`.
    *   Per-provider or global TTL configuration.

### 7. Content Hydration & Full Article Extraction
*   **The Need:** 100-character search snippets are insufficient for accurate AI summarization and translation, forcing pipelines to guess or hallucinate.
*   **Implementation:**
    *   Optional `{ extractContent: true }` flag utilizing clean text extractors or external reader proxies (e.g., Jina Reader `r.jina.ai` / Firecrawl).
    *   Populate `result.content` with clean, readable Markdown while preserving `result.snippet` for quick previews.

### 8. Quota & Rate State Telemetry
*   **The Need:** Pipelines tracking daily quotas across providers need visibility into remaining requests and usage.
*   **Implementation:** Enrich `onResponse` and provider instances with quota telemetry (parsed from rate-limit response headers such as `x-ratelimit-remaining`, `retry-after`).

---

## 🧠 Tier 3: Advanced Retrieval & Intelligence
*Consensus scoring and multi-model agentic integration.*

### 9. Reciprocal Rank Fusion (RRF) Cross-Engine Consensus
*   **The Need:** When querying multiple engines concurrently, rank ordering should reflect consensus across diverse indices.
*   **Implementation:**
    $$RRF\_Score(d) = \sum_{p \in Providers} \frac{1}{k + rank(p, d)}$$
    Merge and re-rank multi-provider results based on reciprocal rank scoring.

### 10. Result Streaming (`webSearchStream`)
*   **The Need:** High-latency search providers (e.g., Perplexity or deep scraping) block faster providers (e.g., Brave).
*   **Implementation:** Provide an `AsyncIterable<SearchResult>` yielding results as each provider resolves so downstream processing (AI workflows, UI feeds) can start immediately.

### 11. Search-to-LLM Prompt Formatting
*   **The Need:** Converting search results into token-budgeted prompt blocks for LLMs.
*   **Implementation:** Built-in formatter utility to convert `SearchResult[]` into clean XML (`<search_results>`) or Markdown blocks with token truncation options.

---

## 🌐 Tier 4: Platform Neutrality & Ecosystem Tooling
*Broader developer reach and ecosystem integration.*

### 12. Strict Edge Runtime Verification
*   Maintain zero-Node-dependency core verified across Cloudflare Workers, Vercel Edge, Bun, and Deno.
*   Continuous integration smoke tests targeting Cloudflare Workerd / Miniflare environment.

### 13. Provider Expansion
*   *News & General:* Bing Search API, You.com.
*   *Academic & Domain:* PubMed, Semantic Scholar, GitHub Search.
*   *Local:* Auto-discovery for self-hosted SearXNG instances.

### 14. Model Context Protocol (MCP) & Agent Adapters
*   Expose a ready-to-run MCP server export (`@omnisearch/mcp`) for Claude Desktop, Cursor, and Antigravity.
*   Standardized tool adapters for Vercel AI SDK (`tool({ ... })`) and Cloudflare Agents SDK.

### 15. Standalone CLI Utility
*   Provide an `omnisearch` CLI binary (e.g. `npx omnisearch "news query" --provider brave --freshness day --json`) for terminal querying and shell scripts.
