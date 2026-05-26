# Agent Guide: Omnisearch SDK

This project is a TypeScript SDK for aggregating web search results from multiple providers.

## 🏗 Tech Stack & Conventions
- **Runtime:** Node.js >= 18 (ESM)
- **Language:** TypeScript
- **Error Handling:** Functional style using `neverthrow`. Avoid `throw` for operational errors; return `Result` or `ResultAsync`.
- **Validation:** `zod` for schema definition and runtime validation.
- **Concurrency:** `p-map` for parallel searches, `p-retry` for resilience, `p-throttle` for rate limiting.
- **Testing:** `vitest`. Tests should use mocks for network calls.

## 📁 Project Structure
- `src/index.ts`: Main entry point (`webSearch` function).
- `src/providers/`: Individual search provider implementations (e.g., `google.ts`, `brave.ts`).
- `src/providers/base.ts`: `AbstractSearchProvider` base class with built-in resilience.
- `src/types/index.ts`: Central type definitions and Zod schemas.
- `src/utils/http.ts`: Standardized fetch wrapper.

## 🛠 Adding a Search Provider
1. **Define Types:** Create an interface for the provider-specific configuration and search options if needed.
2. **Implement Provider Class:** Create `src/providers/<name>.ts`.
   - Extend `AbstractSearchProvider` from `./base`.
   - Implement `doSearch` method.
   - Optionally implement `getTroubleshooting` for better error messages.
3. **Export Factory:** Export a `create<Name>Provider` function that returns an instance of your class.
4. **Register Provider:** Export the factory and class from `src/providers/index.ts`.
5. **Add Tests:** Create `src/__tests__/providers.<name>.test.ts` with comprehensive mocks.

## ⚠️ Important Rules
- **No Direct Fetch:** Use `get` or `post` from `src/utils/http.ts` for all network requests.
- **Resilience First:** Always extend `AbstractSearchProvider` to inherit retry, timeout, and throttling logic.
- **Standardized Output:** Ensure all providers return `SearchResult[]` following the `SearchResultSchema`.
- **Type Safety:** Maintain strict TypeScript types. Avoid `any` where possible.

## 🧪 Testing Commands
- `pnpm test`: Run all tests.
- `pnpm test <filename>`: Run a specific test file.
- `pnpm run lint`: Check for linting errors.
- `pnpm run format`: Format code with Prettier.
