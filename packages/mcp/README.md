# omnisearch-mcp

> Model Context Protocol (MCP) server for multi-provider web search retrieval, powered by [`omnisearch-sdk`](https://www.npmjs.com/package/omnisearch-sdk).

Give Claude Desktop, Cursor, and MCP-compatible AI agent runtimes real-time search across 15+ search providers (Brave, Google, Bing, DuckDuckGo, Tavily, Perplexity, PubMed, Arxiv, GitHub, and more) with automatic fallback and canonical deduplication.

---

## ⚡ Quick Setup

### 1. Claude Desktop Setup

Add to your `claude_desktop_config.json`:

* **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
* **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "omnisearch": {
      "command": "npx",
      "args": ["-y", "omnisearch-mcp"],
      "env": {
        "BRAVE_API_KEY": "YOUR_BRAVE_API_KEY",
        "TAVILY_API_KEY": "YOUR_TAVILY_API_KEY"
      }
    }
  }
}
```

> **Note:** If no API keys are provided in `env`, the server automatically defaults to zero-config public providers (DuckDuckGo, PubMed, Arxiv, Semantic Scholar). If you run the server locally, it also automatically loads any `.env` file present in your current working directory.

---

### 2. Cursor IDE Setup

In Cursor Settings -> **Features** -> **MCP Servers** -> **Add New MCP Server**:

* **Name:** `omnisearch`
* **Type:** `command`
* **Command:** `npx -y omnisearch-mcp`

---

## 🛠 Available MCP Tools

The server automatically registers two tools:

### `web_search`
Search the live web across multiple engines with automatic multi-provider fallback, canonical deduplication, and domain filtering.

| Argument | Type | Description |
| :--- | :--- | :--- |
| `query` | `string` | The search query string (**required**). |
| `maxResults` | `number` | Maximum number of results to return (default: `10`). |
| `freshness` | `string` | Recency filter: `'day'`, `'week'`, `'month'`, `'year'`. |
| `includeDomains` | `string[]` | Whitelist specific domains (e.g. `["github.com", "arxiv.org"]`). |
| `excludeDomains` | `string[]` | Blacklist specific domains (e.g. `["pinterest.com"]`). |
| `deduplicate` | `boolean` | Enable intelligent canonical URL deduplication (default: `true`). |

### `news_search`
Search breaking news and recent journalistic coverage across supported news providers.

| Argument | Type | Description |
| :--- | :--- | :--- |
| `query` | `string` | The news query string (**required**). |
| `maxResults` | `number` | Maximum number of results to return (default: `10`). |
| `freshness` | `string` | Recency filter: `'day'`, `'week'`, `'month'` (default: `'week'`). |

---

## 🌐 Supported Provider Environment Variables

Configure any combination of API keys:

* `BRAVE_API_KEY` - Brave Search API
* `TAVILY_API_KEY` - Tavily Search API
* `GOOGLE_API_KEY` & `GOOGLE_CX` - Google Custom Search API
* `BING_API_KEY` - Azure Bing Search API
* `YOU_API_KEY` - You.com Search API
* `EXA_API_KEY` - Exa Neural Search API
* `PERPLEXITY_API_KEY` - Perplexity Search API
* `PARALLEL_API_KEY` - Parallel Search API
* `SERPAPI_KEY` (or `SERPAPI_API_KEY`) - SerpAPI
* `SEARXNG_URL` (or `SEARXNG_BASE_URL`) - Self-hosted SearXNG endpoint
* `GITHUB_TOKEN` - GitHub API Token (optional, raises rate limits)
* `SEMANTIC_SCHOLAR_API_KEY` - Semantic Scholar API Key (optional)
* `PUBMED_API_KEY` - PubMed / NCBI API Key (optional)

---

## 📄 License

MIT © [OmniSearch SDK Contributors](https://github.com/gbks121/omnisearch-sdk)
