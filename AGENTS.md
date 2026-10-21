# Agent Guide: Omnisearch SDK

This project is a TypeScript SDK for aggregating web search results from multiple providers.

## 🏗 Tech Stack & Conventions
- **Runtime:** Node.js >= 20.0.0 (ESM)
- **Language:** TypeScript (strict mode, bundled via `tsup` into ESM & CJS)
- **Error Handling:** Structured error hierarchy (`SearchProviderError` subclasses). Throw `ProviderApiError`, `RateLimitError`, `TimeoutError`, `NetworkError`, or `SearchValidationError` — never raw `Error` from providers. Consumers use try/catch.
- **Validation:** `zod` for schema definition and runtime validation (`SearchResultSchema`).
- **Resilience & Concurrency:** `p-map` for parallel searches, `p-retry` for exponential backoff, `p-throttle` for rate limiting, `p-timeout` for per-request deadlines.
- **Testing:** `vitest`. Unit tests mock network calls via `src/utils/http.ts`.
- **Tooling:** Biome (`@biomejs/biome`) for linting, formatting, and import sorting.

## 📁 Project Structure
- `src/index.ts`: Main entry point (`webSearch` function, re-exports).
- `src/providers/`: Individual search provider implementations (e.g., `google.ts`, `brave.ts`).
- `src/providers/base.ts`: `AbstractSearchProvider` base class with built-in resilience.
- `src/types/index.ts`: Central type definitions, error classes, and Zod schemas.
- `src/utils/`: Shared utilities (`http.ts` for standardized fetch, `domain.ts` for URL/domain parsing and result clamping).

## 🛠 Adding a Search Provider
1. **Define Types:** Create an interface for the provider-specific configuration extending `ProviderConfig` if needed.
2. **Implement Provider Class:** Create `src/providers/<name>.ts`.
   - Extend `AbstractSearchProvider` from `./base`.
   - Implement `doSearch(options: SearchQuery): Promise<SearchResult[]>`.
   - Optionally implement `getTroubleshooting(error: Error, statusCode?: number)` for actionable error messages.
3. **Export Factory:** Export a `create<Name>Provider` function that returns an instance of your class.
4. **Register Provider:** Export the factory, provider class, and config type from `src/providers/index.ts`.
5. **Add Tests:** Create `src/__tests__/providers.<name>.test.ts` with comprehensive mocks.

## ⚠️ Important Rules
- **No Direct Fetch:** Use `get` or `post` from `src/utils/http.ts` for all network requests.
- **Resilience First:** Always extend `AbstractSearchProvider` to inherit retry, timeout, and throttling logic.
- **Standardized Output:** Ensure all providers return `SearchResult[]` conforming to `SearchResultSchema`.
- **Type Safety:** Maintain strict TypeScript types. Avoid `any` where possible.

## 🧪 Commands
- `pnpm test`: Run all unit tests (`vitest run`).
- `pnpm test <filename>`: Run a specific test file.
- `pnpm run test:coverage`: Run tests with coverage report.
- `pnpm run type-check`: Type-check code without emitting (`tsc --noEmit`).
- `pnpm run lint`: Check for linting errors with Biome.
- `pnpm run format`: Format code with Biome.
- `pnpm run check`: Run Biome formatter, linter, and import sorting.
- `pnpm run build`: Build ESM, CJS, and TypeScript definitions with `tsup`.
