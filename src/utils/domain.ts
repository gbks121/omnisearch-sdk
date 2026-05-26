export function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

export function clampMaxResults(value: number, min = 1, max = 100): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}
