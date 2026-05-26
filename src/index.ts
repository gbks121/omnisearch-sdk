import pMap from 'p-map';
import { ResultAsync, errAsync } from 'neverthrow';
import { SearchResult, WebSearchOptions } from './types';
import { debug } from './utils/debug';

/**
 * Main search function that queries one or more web search providers and returns standardized results
 *
 * @param options Search options including provider(s), query and other parameters
 * @returns ResultAsync that resolves to Ok with search results, or Err with an Error
 */
export function webSearch(options: WebSearchOptions): ResultAsync<SearchResult[], Error> {
  const { provider, debug: debugOptions, concurrency = 10, ...searchOptions } = options;

  if (!provider || provider.length === 0) {
    return errAsync(new Error('At least one search provider is required'));
  }

  return ResultAsync.fromPromise(
    (async () => {
      debug.log(
        debugOptions,
        `Performing search with ${provider.length} provider(s): ${provider
          .map((p) => p.name)
          .join(', ')}`,
        {
          query: options.query,
          maxResults: options.maxResults,
          providers: provider.map((p) => p.name),
        }
      );

      const searchResults = await pMap(
        provider,
        async (p) => {
          const result = await p.search({ ...searchOptions, debug: debugOptions });

          if (result.isOk()) {
            const results = result.value;
            debug.logResponse(debugOptions, `Received ${results.length} results from ${p.name}`);
            return { provider: p.name, results, error: null };
          } else {
            const error = result.error;
            debug.log(debugOptions, `Search error with provider ${p.name}`, {
              error: error.message,
              provider: p.name,
              query: options.query,
            });
            return { provider: p.name, results: [], error };
          }
        },
        { concurrency }
      );

      const allResults: SearchResult[] = [];
      const errors: string[] = [];

      for (const { provider: providerName, results, error } of searchResults) {
        if (error) {
          errors.push(error.message);
          debug.log(debugOptions, `Provider ${providerName} failed`, {
            error: error.message,
          });
        } else {
          allResults.push(...results);
        }
      }

      debug.log(
        debugOptions,
        `Search complete: ${allResults.length} total results from ${
          searchResults.filter((r) => !r.error).length
        }/${provider.length} providers`,
        {
          totalResults: allResults.length,
          successfulProviders: searchResults.filter((r) => !r.error).length,
          failedProviders: errors.length,
        }
      );

      if (allResults.length === 0 && errors.length > 0) {
        throw new Error(`All ${provider.length} provider(s) failed:\n\n${errors.join('\n\n')}`);
      }

      return allResults;
    })(),
    (e) => (e instanceof Error ? e : new Error(String(e)))
  );
}

// Export type definitions
export * from './types';

// Export providers
export * from './providers';

// Export debug utilities
export { debug } from './utils/debug';
