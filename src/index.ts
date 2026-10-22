import pMap from 'p-map';
import {
  type DedupeOptions,
  ProviderApiError,
  SearchProviderError,
  type SearchResult,
  type WebSearchOptions,
} from './types';
import { dedupeResults, normalizeUrl } from './utils/url';

export async function webSearch(options: WebSearchOptions): Promise<SearchResult[]> {
  const {
    provider,
    concurrency = 10,
    strategy = 'parallel',
    deduplicate,
    hooks,
    ...searchOptions
  } = options;

  if (!provider || provider.length === 0) {
    throw new Error('At least one search provider is required');
  }

  const query = searchOptions.query || '';
  let finalResults: SearchResult[] = [];

  if (strategy === 'fallback') {
    const errors: string[] = [];

    for (const p of provider) {
      hooks?.onRequest?.(p.name, query);
      const startTime = Date.now();

      try {
        const results = await p.search({ ...searchOptions });
        hooks?.onResponse?.(p.name, results.length, Date.now() - startTime);

        if (results.length > 0) {
          finalResults = results;
          break;
        }
      } catch (err) {
        const error =
          err instanceof SearchProviderError
            ? err
            : new ProviderApiError(p.name, err instanceof Error ? err.message : String(err));
        hooks?.onError?.(p.name, error);
        errors.push(error.message);
      }
    }

    if (finalResults.length === 0 && errors.length === provider.length) {
      throw new Error(`All ${provider.length} provider(s) failed:\n\n${errors.join('\n\n')}`);
    }
  } else if (strategy === 'race') {
    const errors: string[] = [];
    let remaining = provider.length;

    finalResults = await new Promise<SearchResult[]>((resolve, reject) => {
      let resolved = false;

      for (const p of provider) {
        hooks?.onRequest?.(p.name, query);
        const startTime = Date.now();

        p.search({ ...searchOptions })
          .then((results) => {
            hooks?.onResponse?.(p.name, results.length, Date.now() - startTime);
            if (!resolved && results.length > 0) {
              resolved = true;
              resolve(results);
            } else {
              remaining--;
              if (remaining === 0 && !resolved) {
                if (errors.length === provider.length) {
                  reject(
                    new Error(
                      `All ${provider.length} provider(s) failed:\n\n${errors.join('\n\n')}`
                    )
                  );
                } else {
                  resolve([]);
                }
              }
            }
          })
          .catch((err) => {
            const error =
              err instanceof SearchProviderError
                ? err
                : new ProviderApiError(p.name, err instanceof Error ? err.message : String(err));
            hooks?.onError?.(p.name, error);
            errors.push(error.message);
            remaining--;
            if (remaining === 0 && !resolved) {
              if (errors.length === provider.length) {
                reject(
                  new Error(`All ${provider.length} provider(s) failed:\n\n${errors.join('\n\n')}`)
                );
              } else {
                resolve([]);
              }
            }
          });
      }
    });
  } else {
    // Parallel strategy (default)
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

    finalResults = allResults;
  }

  if (deduplicate) {
    const dedupeOpts: DedupeOptions | undefined =
      typeof deduplicate === 'object' ? deduplicate : undefined;
    finalResults = dedupeResults(finalResults, dedupeOpts);
  }

  return finalResults;
}

export async function* webSearchStream(
  options: WebSearchOptions
): AsyncGenerator<SearchResult, void, unknown> {
  const { provider, concurrency = 10, deduplicate, hooks, ...searchOptions } = options;

  if (!provider || provider.length === 0) {
    throw new Error('At least one search provider is required');
  }

  const query = searchOptions.query || '';
  const dedupeOpts: DedupeOptions | undefined =
    typeof deduplicate === 'object' ? deduplicate : undefined;
  const seenUrls = new Set<string>();

  type ProviderBatch = {
    provider: string;
    results: SearchResult[];
    error: SearchProviderError | null;
  };

  const queue: ProviderBatch[] = [];
  let pending = provider.length;
  let notifyNext: (() => void) | null = null;

  pMap(
    provider,
    async (p) => {
      hooks?.onRequest?.(p.name, query);
      const startTime = Date.now();

      try {
        const results = await p.search({ ...searchOptions });
        hooks?.onResponse?.(p.name, results.length, Date.now() - startTime);
        queue.push({ provider: p.name, results, error: null });
      } catch (err) {
        const error =
          err instanceof SearchProviderError
            ? err
            : new ProviderApiError(p.name, err instanceof Error ? err.message : String(err));
        hooks?.onError?.(p.name, error);
        queue.push({ provider: p.name, results: [], error });
      } finally {
        pending--;
        if (notifyNext) {
          notifyNext();
          notifyNext = null;
        }
      }
    },
    { concurrency }
  ).catch(() => {});

  let yieldedCount = 0;
  const errors: string[] = [];

  while (pending > 0 || queue.length > 0) {
    if (queue.length === 0) {
      await new Promise<void>((resolve) => {
        notifyNext = resolve;
      });
    }

    while (queue.length > 0) {
      const batch = queue.shift()!;
      if (batch.error) {
        errors.push(batch.error.message);
      } else {
        for (const item of batch.results) {
          if (deduplicate) {
            const canonical = normalizeUrl(item.url, dedupeOpts);
            const key = canonical || item.url;
            if (seenUrls.has(key)) {
              continue;
            }
            seenUrls.add(key);
          }
          yieldedCount++;
          yield item;
        }
      }
    }
  }

  if (yieldedCount === 0 && errors.length === provider.length) {
    throw new Error(`All ${provider.length} provider(s) failed:\n\n${errors.join('\n\n')}`);
  }
}

export * from './cache';
export * from './providers';
export * from './types';
export * from './utils';
