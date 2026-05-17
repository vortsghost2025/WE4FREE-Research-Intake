import { describe, it, expect } from 'vitest';
import { findContradictions, detectContradictions } from '../contradiction-detect';
import { Claim } from '../../types';

/** Build N claims, alternating between two buckets. */
function makeClaims(n: number, sharedTopicA: string, sharedTopicB: string): Claim[] {
  const now = new Date().toISOString();
  return Array.from({ length: n }, (_, i) => ({
    id: `c-${i}`,
    text: i % 2 === 0
      ? `Our method improves performance over baselines on task ${i}`
      : `Our method reduces latency compared to baselines on task ${i}`,
    sourceArtifactId: `aid-${Math.floor(i / 3)}`,
    veracity: 'unverified' as const,
    confidence: 0.6 + (i % 11) * 0.03,
    topics: [sharedTopicA, sharedTopicB],
    createdAt: now,
  }));
}

describe('Audit 8 — Sparse contradiction mode n >= 50 vs O(n²) fallback', () => {
  /**
   * For n < 50 claims: `detectContradictions` (O(n²) bucket scan) and
   * `findContradictions` must produce the same set of edges.
   * Vary the input to cover multiple claim-counts and topic configurations.
   */
  const smallSizes = [2, 5, 10, 20, 30, 49];

  for (const n of smallSizes) {
    it(`Agrees with fallback at n=${n} claims`, () => {
      const claims = makeClaims(n, 'test-a', 'test-b');

      const edgesA = findContradictions({ claims: new Map(claims.map((c, i) => [c.id, c])) });
      const edgesB = detectContradictions(claims);

      // Both return the same edges for the same initial config
      const keysA = new Set(edgesA.map(e => e.claimAId + ':' + e.claimBId + ':' + e.reason).sort());
      const keysB = new Set(edgesB.map(e => e.claimAId + ':' + e.claimBId + ':' + e.reason).sort());
      expect(keysA).toEqual(keysB);
    });
  }

  it('at n=2 claims produces no contradiction when topics do not match antagonist patterns', () => {
    const claims = [{
      id: 'c0', text: 'all good', sourceArtifactId: 'a1', veracity: 'unverified', confidence: 0.5, topics: ['safe-topic-x'], createdAt: new Date().toISOString(),
    }, {
      id: 'c1', text: 'also good', sourceArtifactId: 'a2', veracity: 'unverified', confidence: 0.5, topics: ['safe-topic-y'], createdAt: new Date().toISOString(),
    }] as Claim[];
    const edgesA = findContradictions({ claims: new Map(claims.map(c => [c.id, c])) });
    const edgesB = detectContradictions(claims);
    expect(edgesA).toHaveLength(0);
    expect(edgesB).toHaveLength(0);
  });

  it('both paths detect same contradiction for matching antagonist pair (n < 50)', () => {
    const claims: Claim[] = [{
      id: 'c0', text: 'Our approach improves speed significantly', sourceArtifactId: 'a1', veracity: 'unverified', confidence: 0.8, topics: ['perf'], createdAt: new Date().toISOString(),
    }, {
      id: 'c1', text: 'Our approach reduces throughput significantly', sourceArtifactId: 'a2', veracity: 'unverified', confidence: 0.7, topics: ['perf'], createdAt: new Date().toISOString(),
    }] as Claim[];
    const edgesA = findContradictions({ claims: new Map(claims.map(c => [c.id, c])) });
    const edgesB = detectContradictions(claims);
    expect(edgesA.length).toBeGreaterThan(0);
    expect(edgesB.length).toBeGreaterThan(0);
    const keysA = new Set(edgesA.map(e => `${e.claimAId}:${e.claimBId}`));
    const keysB = new Set(edgesB.map(e => `${e.claimAId}:${e.claimBId}`));
    expect(keysA).toEqual(keysB);
  });

  it('returns top-k limited edges for n >= 50 (verify upper bound)', () => {
    const n = 200;
    // 100 claim pairs in bucket top-5 is reached
    const claims = makeClaims(n, 'sparse-bucket', 'sparse-sibling');
    const edges = findContradictions({ claims: new Map(claims.map(c => [c.id, c])) });
    expect(edges.length).toBeLessThanOrEqual(50);
  });
});
