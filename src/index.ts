import pMap from 'p-map';
import { SearchResult, WebSearchOptions } from './types';
import { debug } from './utils/debug';

/**
 * Main search function that queries one or more web search providers and returns standardized results
 *
 * @param options Search options including provider(s), query and other parameters
 * @returns Promise that resolves to an array of search results from all providers
 */
export async function webSearch(options: WebSearchOptions): Promise<SearchResult[]> {
  const { provider, debug: debugOptions, concurrency = 10, ...searchOptions } = options;

  // Validate required options
  if (!provider || provider.length === 0) {
    throw new Error('At least one search provider is required');
  }

  // Validate that at least one provider supports the search query
  const hasArxivProvider = provider.some((p) => p.name === 'arxiv');
  const trimmedQuery = options.query?.trim();
  if (!trimmedQuery && !(hasArxivProvider && options.idList)) {
    throw new Error('A search query or ID list (for Arxiv) is required');
  }

  // Log search parameters if debugging is enabled
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

  // Execute searches in parallel using p-map for concurrency control
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

  // Collect all successful results
  const allResults: SearchResult[] = [];
  const errors: string[] = [];

  for (const { provider: providerName, results, error } of searchResults) {
    if (error) {
      errors.push(error.message);
      debug.log(debugOptions, `Provider ${providerName} failed`, { error: error.message });
    } else {
      allResults.push(...results);
    }
  }

  // Log summary
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

  // If all providers failed, throw an error with all the error messages
  if (allResults.length === 0 && errors.length > 0) {
    throw new Error(`All ${provider.length} provider(s) failed:\n\n${errors.join('\n\n')}`);
  }

  return allResults;
}

// Export type definitions
export * from './types';

// Export providers
export * from './providers';

// Export debug utilities
export { debug } from './utils/debug';
