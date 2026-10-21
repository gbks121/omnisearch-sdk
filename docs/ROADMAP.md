# Future Roadmap: OmniSearch SDK

This document outlines strategic areas of development to establish OmniSearch SDK as the standard multi-provider data retrieval layer for TypeScript, AI agents, and RAG pipelines.

---

## 1. Aggregation Intelligence & Ranking
*   **URL Normalization & Deduplication:** Strip query tracking parameters (`utm_*`, `ref`, `gclid`, `fbclid`) and canonicalize URLs across multiple providers.
*   **Reciprocal Rank Fusion (RRF):** Implement a cross-provider consensus scoring algorithm:
    $$RRF\_Score(d) = \sum_{p \in Providers} \frac{1}{k + rank(p, d)}$$
    Combines search engine positions into a single, high-relevance rank list.
*   **Result Streaming (`webSearchStream`):** Provide an `AsyncIterable<SearchResult>` yielding results as each provider resolves instead of waiting for all requests to finish.

## 2. Agent & LLM Integration (Market Fit)
*   **Model Context Protocol (MCP):** Provide a lightweight MCP server export to instantly expose OmniSearch tools (`search`, `list_providers`) to Claude Desktop, Cursor, Antigravity, and other MCP clients.
*   **AI Framework Adapters:** First-class tool definitions for Vercel AI SDK (`ai`), LangChain, and Cloudflare Agents SDK.
*   **Prompt-Optimized Context Formatting:** Built-in formatter utility converting `SearchResult[]` into token-budgeted Markdown or XML context blocks (e.g. `<search_results>`).
*   **Token Estimation:** Lightweight token counting to ensure search results fit within context window constraints before prompt insertion.

## 3. Result Enrichment & Content Hydration
*   **Full Content Extraction:** Optional fetching of result URLs to extract readable article text using Readability or headless scrapers.
*   **Specialized Scrapers & Readers:** First-class integrations with Jina Reader (`r.jina.ai`) and Firecrawl for deep text extraction.
*   **Metadata Normalization:** Consistent extraction of author, published timestamps, and favicon/domain branding.

## 4. Advanced Execution Strategies & Resilience
*   **Fallback & Cascade Chains:** Automatically attempt free/self-hosted providers (e.g., DuckDuckGo, SearXNG, Arxiv) and escalate to premium providers (Brave, Google, Exa, Tavily) only on failure, rate limit, or empty responses.
*   **Race-to-Success ("Fastest N"):** Return as soon as $N$ providers successfully return results, canceling pending requests via `AbortController`.
*   **Pluggable Caching Layer:** Modular cache store (`SearchCacheStore`) with in-memory LRU, Redis, and Cloudflare KV adapters to minimize redundant queries and API billing during agent reasoning loops.
*   **Cost & Quota Telemetry:** Enrich lifecycle hooks (`onResponse`) with remaining rate limit headers, provider credit usage, and latency metrics.

## 5. Platform Neutrality & Universal Runtimes
*   **Edge & Browser Verification:** Maintain zero-Node-dependency core to ensure 100% compatibility with Cloudflare Workers, Vercel Edge, Bun, Deno, and modern browsers (CORS permitting).
*   **Node.js Support:** Built and validated on Node 20+ (ESM & CJS).

## 6. CLI & Ecosystem Tooling
*   **CLI Utility:** Provide an `omnisearch` CLI binary (e.g., `npx omnisearch "query" --provider brave,duckduckgo --json`) for rapid terminal searches and shell automation.
*   **Provider Expansion:**
    *   *Web Search:* Bing Search API, You.com.
    *   *Local/Self-hosted:* Auto-discovery for local SearXNG instances.
    *   *Domain-Specific:* PubMed, Semantic Scholar, GitHub Search.
