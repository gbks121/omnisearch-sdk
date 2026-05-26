import pMap from 'p-map';
import { SearchResult, WebSearchOptions, SearchProviderError, ProviderApiError } from './types';

export async function webSearch(options: WebSearchOptions): Promise<SearchResult[]> {
  const { provider, concurrency = 10, hooks, ...searchOptions } = options;

  if (!provider || provider.length === 0) {
    throw new Error('At least one search provider is required');
  }

  const query = searchOptions.query || '';

  const searchResults = await pMap(
    provider,
    async (p) => {
      hooks?.onRequest?.(p.name, query);
      const startTime = Date.now();

      try {
        const results = await p.search({ ...searchOptions });
        hooks?.onResponse?.(p.name, results.length, Date.now() - startTime);
        return { provider: p.name, results, error: null as SearchProviderError | null };
      } catch (err) {
        const error =
          err instanceof SearchProviderError
            ? err
            : new ProviderApiError(p.name, err instanceof Error ? err.message : String(err));
        hooks?.onError?.(p.name, error);
        return { provider: p.name, results: [] as SearchResult[], error };
      }
    },
    { concurrency }
  );

  const allResults: SearchResult[] = [];
  const errors: string[] = [];

  for (const { results, error } of searchResults) {
    if (error) {
      errors.push(error.message);
    } else {
      allResults.push(...results);
    }
  }

  if (allResults.length === 0 && errors.length > 0) {
    throw new Error(`All ${provider.length} provider(s) failed:\n\n${errors.join('\n\n')}`);
  }

  return allResults;
}

export * from './types';

export * from './providers';
