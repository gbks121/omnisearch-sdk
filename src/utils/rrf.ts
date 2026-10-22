import type { SearchResult } from '../types';
import { normalizeUrl } from './url';

export interface RrfOptions {
  /**
   * Smoothing constant k (default 60, as recommended in information retrieval literature).
   */
  k?: number;
  /**
   * Whether to deduplicate documents using canonical URL normalization (default true).
   */
  deduplicate?: boolean;
  /**
   * Whether to strip leading www during URL canonicalization (default false).
   */
  stripWww?: boolean;
}

export function reciprocalRankFusion(
  resultsLists: SearchResult[][],
  options?: RrfOptions
): SearchResult[] {
  if (!resultsLists || resultsLists.length === 0) return [];

  const k = options?.k ?? 60;
  const deduplicate = options?.deduplicate !== false;
  const stripWww = options?.stripWww ?? false;

  const scores = new Map<string, number>();
  const documents = new Map<string, SearchResult>();

  for (const list of resultsLists) {
    if (!list || list.length === 0) continue;

    for (let rankIndex = 0; rankIndex < list.length; rankIndex++) {
      const item = list[rankIndex];
      const rank = rankIndex + 1; // 1-based rank

      const key = deduplicate
        ? normalizeUrl(item.url, { stripWww }) || item.url
        : `${item.provider}:${item.url}:${rankIndex}`;

      const currentScore = scores.get(key) ?? 0;
      const addedScore = 1 / (k + rank);
      scores.set(key, currentScore + addedScore);

      if (!documents.has(key)) {
        documents.set(key, { ...item });
      } else {
        // Merge richer snippets/content if available
        const existing = documents.get(key)!;
        if (!existing.snippet && item.snippet) {
          existing.snippet = item.snippet;
        }
        if (!existing.content && item.content) {
          existing.content = item.content;
        }
        if (!existing.publishedDate && item.publishedDate) {
          existing.publishedDate = item.publishedDate;
        }
      }
    }
  }

  // Sort by descending RRF score
  const sortedKeys = Array.from(scores.keys()).sort((a, b) => {
    return (scores.get(b) ?? 0) - (scores.get(a) ?? 0);
  });

  return sortedKeys.map((key) => {
    const doc = documents.get(key)!;
    const score = scores.get(key)!;
    return {
      ...doc,
      raw:
        typeof doc.raw === 'object' && doc.raw !== null
          ? { ...doc.raw, rrfScore: score }
          : { rrfScore: score, originalRaw: doc.raw },
    };
  });
}
