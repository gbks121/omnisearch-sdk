import type { DedupeOptions, SearchResult } from '../types';

const DEFAULT_TRACKING_PARAMS = new Set([
  'ref',
  'fbclid',
  'gclid',
  'mc_eid',
  'yclid',
  '_hsenc',
  '_hsmi',
  'msclkid',
  'twclid',
  'igshid',
  's_kwcid',
  'dclid',
  'zanpid',
  'wbraid',
  'gbraid',
  'gad_source',
]);

function isTrackingParam(name: string, customParams?: string[]): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith('utm_')) return true;
  if (DEFAULT_TRACKING_PARAMS.has(lower)) return true;
  if (customParams?.some((p) => p.toLowerCase() === lower)) {
    return true;
  }
  return false;
}

export function normalizeUrl(rawUrl: string, options?: DedupeOptions): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return rawUrl.trim();
  }

  // Normalize protocol to https
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    parsed.protocol = 'https:';
  }

  // Lowercase hostname
  let hostname = parsed.hostname.toLowerCase();
  if (options?.stripWww && hostname.startsWith('www.')) {
    hostname = hostname.slice(4);
  }
  parsed.hostname = hostname;

  // Normalize trailing slash in pathname (preserve root '/')
  if (options?.normalizeTrailingSlash !== false) {
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
  }

  // Query parameter normalization
  if (options?.stripQueryParams) {
    parsed.search = '';
  } else if (options?.stripTrackingParams !== false) {
    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      if (isTrackingParam(key, options?.customTrackingParams)) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();
  } else {
    parsed.searchParams.sort();
  }

  // Remove fragment/hash
  parsed.hash = '';

  return parsed.toString();
}

export function dedupeResults(results: SearchResult[], options?: DedupeOptions): SearchResult[] {
  if (!results || results.length === 0) return [];

  const seen = new Set<string>();
  const deduped: SearchResult[] = [];

  for (const item of results) {
    const normalized = normalizeUrl(item.url, options);
    const key = normalized || item.url;

    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(normalized ? { ...item, url: normalized } : item);
    }
  }

  return deduped;
}
