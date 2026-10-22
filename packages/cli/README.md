# omnisearch-cli

> High-performance command-line interface for multi-provider web search retrieval, powered by [`omnisearch-sdk`](https://www.npmjs.com/package/omnisearch-sdk).

Search across Google, Brave, Bing, DuckDuckGo, Tavily, Perplexity, PubMed, Arxiv, GitHub, and more directly from your terminal or shell scripts.

---

## ⚡ Quick Start

Run directly with `npx` (no installation required):

```bash
# Basic web search (auto-detects configured providers or falls back to DuckDuckGo)
npx omnisearch-cli "autonomous AI agents"

# Search specific engine (e.g. Brave, PubMed, GitHub)
npx omnisearch-cli "CRISPR gene editing" -p pubmed -n 5

# Recent news (past 24h) with JSON output for piping to jq
npx omnisearch-cli "latest AI models" -p brave -f day --type news --json
```

Or install globally:

```bash
npm install -g omnisearch-cli
# or
pnpm add -g omnisearch-cli

omnisearch "quantum computing" -n 5
```

---

## 🔑 Providing API Keys

The CLI supports 3 ways to provide API keys:

### 1. Automatic `.env` File (Recommended)
Place a `.env` file in your current working directory. The CLI will automatically detect and load it on startup without requiring any flags or external dependencies:

```env
# .env template — Fill only the providers you want to use:

# Brave Search
BRAVE_API_KEY=

# Tavily AI Search
TAVILY_API_KEY=

# Google Custom Search (Requires both)
GOOGLE_API_KEY=
GOOGLE_CX=

# Azure Bing Web Search
BING_API_KEY=

# You.com Search
YOU_API_KEY=

# Exa Neural Search
EXA_API_KEY=

# Perplexity AI
PERPLEXITY_API_KEY=

# Parallel Search
PARALLEL_API_KEY=

# SerpAPI
SERPAPI_KEY=

# Self-Hosted SearXNG Instance
SEARXNG_URL=

# GitHub (Optional, increases rate limit)
GITHUB_TOKEN=

# Semantic Scholar (Optional, increases rate limit)
SEMANTIC_SCHOLAR_API_KEY=

# PubMed / NCBI (Optional, increases rate limit)
PUBMED_API_KEY=
```

Then simply run:
```bash
npx omnisearch-cli "latest AI research"
```

### 2. Inline Environment Variable (One-off / CI)
Pass keys directly on the command line:

* **macOS / Linux / WSL / Git Bash:**
  ```bash
  BRAVE_API_KEY="your_key" npx omnisearch-cli "deep learning" -p brave
  ```
* **Windows PowerShell:**
  ```powershell
  $env:BRAVE_API_KEY="your_key"; npx omnisearch-cli "deep learning" -p brave
  ```

### 3. Persistent Shell Profile
Export your keys in your `~/.bashrc`, `~/.zshrc`, or Windows Environment Variables:
```bash
export BRAVE_API_KEY="your_key"
export TAVILY_API_KEY="your_key"
```

> **Zero-Key Mode:** If no API keys are configured, `omnisearch-cli` automatically runs using free public providers (**DuckDuckGo**, **PubMed**, **Arxiv**, and **Semantic Scholar**) with no signup required.

---

## 🛠 Command-Line Options

```text
Usage:
  omnisearch "<query>" [options]

Options:
  -p, --provider <name>     Search provider to use (default: auto-detect)
  -f, --freshness <period>  Filter by recency: day, week, month, year
  -s, --strategy <mode>     Execution mode: parallel, fallback, race (default: parallel)
  -n, --max-results <num>   Maximum results to return (default: 10)
  --type <type>             Search type: web, news (default: web)
  --dedupe                  Enable canonical URL deduplication
  --json                    Output raw JSON (ideal for scripting and jq)
  -h, --help                Show help message
```

---

## 🌐 Supported Providers

The CLI automatically detects providers based on available environment variables:

| Provider Flag | Engine | Requires API Key? | Environment Variables |
| :--- | :--- | :--- | :--- |
| `-p duckduckgo` | DuckDuckGo | **No** (Zero-config) | None |
| `-p pubmed` | PubMed / NCBI | **No** (Zero-config) | None |
| `-p arxiv` | Arxiv Preprints | **No** (Zero-config) | None |
| `-p semanticscholar` | Semantic Scholar | **No** (Zero-config) | None |
| `-p github` | GitHub Search | **Optional** | `GITHUB_TOKEN` |
| `-p brave` | Brave Search | **Yes** | `BRAVE_API_KEY` |
| `-p google` | Google Search | **Yes** | `GOOGLE_API_KEY`, `GOOGLE_CX` |
| `-p bing` | Bing Web Search | **Yes** | `BING_API_KEY` |
| `-p you` | You.com Search | **Yes** | `YOU_API_KEY` |
| `-p tavily` | Tavily Search | **Yes** | `TAVILY_API_KEY` |
| `-p exa` | Exa Neural Search | **Yes** | `EXA_API_KEY` |
| `-p perplexity` | Perplexity AI | **Yes** | `PERPLEXITY_API_KEY` |
| `-p parallel` | Parallel Search | **Yes** | `PARALLEL_API_KEY` |
| `-p serpapi` | SerpAPI | **Yes** | `SERPAPI_API_KEY` |
| `-p searxng` | SearXNG | **Yes** | `SEARXNG_BASE_URL` |

---

## 💡 Examples

### 1. Multi-Engine Cascading Fallback
Try Brave first; if rate-limited or unavailable, gracefully fall back to DuckDuckGo:
```bash
omnisearch "TypeScript 6 release date" --strategy fallback
```

### 2. Live Shell Scripting with `jq`
Fetch the top 3 URLs in JSON:
```bash
omnisearch "Rust memory safety" --json | jq '.[].url'
```

### 3. Academic Paper Discovery
```bash
omnisearch "transformer architecture attention is all you need" -p arxiv -n 3
```

---

## 📄 License

MIT © [OmniSearch SDK Contributors](https://github.com/gbks121/omnisearch-sdk)
