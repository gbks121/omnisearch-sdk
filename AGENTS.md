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
- `src/types/index.ts`: Central type definitions and Zod schemas.
- `src/utils/provider.ts`: Base logic for creating providers with built-in resilience.
- `src/utils/http.ts`: Standardized fetch wrapper.

## 🛠 Adding a Search Provider
1. **Define Config Schema:** If the provider requires new config fields, update `ProviderConfig` in `src/types/index.ts`.
2. **Implement Provider:** Create `src/providers/<name>.ts`.
   - Use `createBaseProvider` from `src/utils/provider.ts`.
   - Map raw API response to `SearchResult[]` (defined in `src/types/index.ts`).
3. **Register Provider:** Export the new provider from `src/providers/index.ts`.
4. **Add Tests:** Create `src/__tests__/providers.<name>.test.ts` with comprehensive mocks.

## ⚠️ Important Rules
- **No Direct Fetch:** Use `httpClient` from `src/utils/http.ts` for all network requests.
- **Resilience First:** Always wrap search logic in `createBaseProvider` to inherit retry and timeout logic.
- **Standardized Output:** Ensure all providers return `SearchResult[]` following the `SearchResultSchema`.
- **Type Safety:** Maintain strict TypeScript types. Avoid `any`.

## 🧪 Testing Commands
- `pnpm test`: Run all tests.
- `pnpm test <filename>`: Run a specific test file.
- `pnpm run lint`: Check for linting errors.
- `pnpm run format`: Format code with Prettier.
