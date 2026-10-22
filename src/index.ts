import pMap from 'p-map';
import { AbstractSearchProvider } from './providers/base';
import {
  type DedupeOptions,
  ProviderApiError,
  type SearchHooks,
  SearchProviderError,
  type SearchQuery,
  type SearchResult,
  type WebSearchOptions,
} from './types';
import { dedupeResults, normalizeUrl } from './utils/url';

function toProviderError(provider: string, err: unknown): SearchProviderError {
  return err instanceof SearchProviderError
    ? err
    : new ProviderApiError(provider, err instanceof Error ? err.message : String(err));
}

/**
 * Runs one provider and guarantees lifecycle hooks fire exactly once:
 * AbstractSearchProvider implementations own onRequest/onResponse/onError via
 * the hooks passed into search(); plain SearchProvider implementations get
 * manual fallback firing from here.
 */
async function invokeProvider(
  p: { name: string; search(options: SearchQuery): Promise<SearchResult[]> },
  searchOptions: SearchQuery,
  hooks?: SearchHooks
): Promise<SearchResult[]> {
  if (p instanceof AbstractSearchProvider) {
    return p.search({ ...searchOptions, hooks });
  }

  hooks?.onRequest?.(p.name, searchOptions.query || '');
  const startTime = Date.now();
  try {
    const results = await p.search({ ...searchOptions });
    hooks?.onResponse?.(p.name, results.length, Date.now() - startTime);
    return results;
  } catch (err) {
    hooks?.onError?.(p.name, toProviderError(p.name, err));
    throw err;
  }
}

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

  let finalResults: SearchResult[] = [];

  if (strategy === 'fallback') {
    const errors: string[] = [];

    for (const p of provider) {
      try {
        const results = await invokeProvider(p, searchOptions, hooks);

        if (results.length > 0) {
          finalResults = results;
          break;
        }
      } catch (err) {
        errors.push(toProviderError(p.name, err).message);
      }
    }

    if (finalResults.length === 0 && errors.length === provider.length) {
      throw new Error(`All ${provider.length} provider(s) failed:\n\n${errors.join('\n\n')}`);
    }
  } else if (strategy === 'race') {
    const errors: string[] = [];
    let remaining = provider.length;

    const raceController = new AbortController();
    const callerSignal = searchOptions.signal;
    const raceSignal = callerSignal
      ? AbortSignal.any([callerSignal, raceController.signal])
      : raceController.signal;

    finalResults = await new Promise<SearchResult[]>((resolve, reject) => {
      let resolved = false;

      for (const p of provider) {
        invokeProvider(p, { ...searchOptions, signal: raceSignal }, hooks)
          .then((results) => {
            if (!resolved && results.length > 0) {
              resolved = true;
              raceController.abort();
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
            if (resolved) {
              // Losing providers aborted by the race are not failures.
              return;
            }
            errors.push(toProviderError(p.name, err).message);
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
        try {
          const results = await invokeProvider(p, searchOptions, hooks);
          return { provider: p.name, results, error: null as SearchProviderError | null };
        } catch (err) {
          return {
            provider: p.name,
            results: [] as SearchResult[],
            error: toProviderError(p.name, err),
          };
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
      try {
        const results = await invokeProvider(p, searchOptions, hooks);
        queue.push({ provider: p.name, results, error: null });
      } catch (err) {
        queue.push({ provider: p.name, results: [], error: toProviderError(p.name, err) });
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
            yieldedCount++;
            yield canonical ? { ...item, url: canonical } : item;
          } else {
            yieldedCount++;
            yield item;
          }
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
