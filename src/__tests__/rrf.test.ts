import { describe, expect, it } from 'vitest';
import type { SearchResult } from '../types';
import { reciprocalRankFusion } from '../utils/rrf';

describe('reciprocalRankFusion', () => {
  it('should return empty array for empty input', () => {
    expect(reciprocalRankFusion([])).toEqual([]);
    expect(reciprocalRankFusion([[]])).toEqual([]);
  });

  it('should compute RRF scores and order by consensus rank', () => {
    const docA: SearchResult = {
      url: 'https://example.com/a',
      title: 'Doc A',
      provider: 'brave',
    };
    const docB: SearchResult = {
      url: 'https://example.com/b',
      title: 'Doc B',
      provider: 'brave',
    };
    const docC: SearchResult = {
      url: 'https://example.com/c',
      title: 'Doc C',
      provider: 'google',
    };

    // List 1 (Brave): [A, B] -> rank 1, rank 2
    // List 2 (Google): [B, C] -> rank 1, rank 2
    // Doc B appears in both lists: score = 1/(60+2) + 1/(60+1) = 1/62 + 1/61 ~= 0.016129 + 0.016393 = 0.032522
    // Doc A appears once: score = 1/(60+1) = 1/61 ~= 0.016393
    // Doc C appears once: score = 1/(60+2) = 1/62 ~= 0.016129
    // Expected order: B, A, C

    const fused = reciprocalRankFusion(
      [
        [docA, docB],
        [docB, docC],
      ],
      { k: 60 }
    );

    expect(fused).toHaveLength(3);
    expect(fused[0].url).toBe('https://example.com/b');
    expect(fused[1].url).toBe('https://example.com/a');
    expect(fused[2].url).toBe('https://example.com/c');

    const scoreB = (fused[0].raw as { rrfScore: number }).rrfScore;
    const scoreA = (fused[1].raw as { rrfScore: number }).rrfScore;
    expect(scoreB).toBeGreaterThan(scoreA);
  });

  it('should merge richer snippet/content when deduplicating', () => {
    const doc1: SearchResult = {
      url: 'https://example.com/item',
      title: 'Item Short',
      provider: 'engine1',
    };
    const doc2: SearchResult = {
      url: 'https://example.com/item?utm_source=feed',
      title: 'Item Detailed',
      snippet: 'Rich snippet text',
      content: 'Full article body',
      provider: 'engine2',
    };

    const fused = reciprocalRankFusion([[doc1], [doc2]], { deduplicate: true });
    expect(fused).toHaveLength(1);
    expect(fused[0].snippet).toBe('Rich snippet text');
    expect(fused[0].content).toBe('Full article body');
  });

  it('should respect custom k smoothing parameter', () => {
    const docA: SearchResult = {
      url: 'https://example.com/a',
      title: 'Doc A',
      provider: 'engine1',
    };
    const fused = reciprocalRankFusion([[docA]], { k: 10 });
    // rank 1 with k=10 -> 1/(10+1) = 1/11 ~= 0.090909
    const score = (fused[0].raw as { rrfScore: number }).rrfScore;
    expect(score).toBeCloseTo(1 / 11, 5);
  });
});
