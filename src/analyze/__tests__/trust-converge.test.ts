import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'os';
import { updateTrustScores, loadTrustScores, getTrustScore } from '../trust-score';
import { CanonicalGraph } from '../../types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.tmpdir() + '/trust-converge-test-');
});
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeGraph(overrides: Partial<CanonicalGraph> = {}): CanonicalGraph {
  return {
    claims: new Map(),
    evidence: new Map(),
    authorityLinks: new Map(),
    contradictions: new Map(),
    artifactIndex: new Map(),
    ...overrides,
  };
}

// ── Audit 6a — ClaimTrust convergence and deterministic trust propagation ─────

describe('Audit 6 — ClaimTrust propagation converges and is deterministic', () => {
  it('computes entry for every claim in the graph', () => {
    const g = makeGraph({ claims: new Map([
      ['c-1-a', { id: 'c-1-a', text: 'A', sourceArtifactId: 'a1', veracity: 'supported', confidence: 1, topics: [], createdAt: new Date().toISOString() }],
      ['c-1-b', { id: 'c-1-b', text: 'B', sourceArtifactId: 'a1', veracity: 'supported', confidence: 1, topics: [], createdAt: new Date().toISOString() }],
    ]) });
    const entries = updateTrustScores(g, tmpDir);
    expect(entries.length).toBe(2);
  });

  it('same graph produces the same trust scores each call (determinism)', () => {
    const g = makeGraph({
      claims: new Map([
        ['c-claim1', { id: 'c-claim1', text: 'delta motivated by inference', sourceArtifactId: 'a1', veracity: 'supported', confidence: 0.9, topics: [], createdAt: new Date().toISOString() }],
        ['c-claim2', { id: 'c-claim2', text: 'integration is correct', sourceArtifactId: 'a1', veracity: 'supported', confidence: 0.85, topics: [], createdAt: new Date().toISOString() }],
      ]),
      evidence: new Map([
        ['ev2', { id: 'ev2', claimId: 'c-claim2', type: 'doi' as const, value: 'doi:10.1/delta', sourceArtifactId: 'a2', weight: 0.75 }],
      ]),
    });

    const r1 = updateTrustScores(g, tmpDir);
    // Clear state directory to force a fresh load (no previous scores from r1 leak)
    const tmpDir2 = fs.mkdtempSync(path.tmpdir() + '/trust-converge2-');
    const r2 = updateTrustScores(g, tmpDir2);
    afterEach(() => { try { fs.rmSync(tmpDir2, { recursive: true, force: true }); } catch {} });

    const s1 = Object.fromEntries(r1.map(e => [e.source_id, e.trust_score]));
    const s2 = Object.fromEntries(r2.map(e => [e.source_id, e.trust_score]));
    for (const [id, score] of Object.entries(s1)) {
      expect(s2[id]).toBeCloseTo(score, 3);
    }
  });

  it('starts new claims at 0.5 even with no evidence', () => {
    const g = makeGraph({ claims: new Map([
      ['c-start', { id: 'c-start', text: 'unknown', sourceArtifactId: 'a1', veracity: 'unverified', confidence: 0.5, topics: [], createdAt: new Date().toISOString() }],
    ]) });
    const entries = updateTrustScores(g, tmpDir);
    expect(entries[0].trust_score).toBeCloseTo(0.5, 1);
  });

  it('increases trust score when strong evidence is present (ClaimTrust signal)', () => {
    const g = makeGraph({
      claims: new Map([
        ['c-evid', { id: 'c-evid', text: 'well-evidenced claim', sourceArtifactId: 'a1', veracity: 'supported', confidence: 0.9, topics: [], createdAt: new Date().toISOString() }],
      ]),
      evidence: new Map([
        ['e1', { id: 'e1', claimId: 'c-evid', type: 'doi' as const, value: 'doi:10.1/delta', sourceArtifactId: 'a2', weight: 1.0 }],
        ['e2', { id: 'e2', claimId: 'c-evid', type: 'peer_review' as const, value: 'review', sourceArtifactId: 'a2', weight: 1.0 }],
      ]),
    });
    const entries = updateTrustScores(g, tmpDir);
    expect(entries[0].trust_score).toBeGreaterThan(0.6);
    expect(entries[0].evidence_count).toBe(2);
  });

  it('decreases trust score when contradictions are present', () => {
    const g = makeGraph({
      claims: new Map([
        ['c-ctr', { id: 'c-ctr', text: 'contradicted claim', sourceArtifactId: 'a1', veracity: 'contradicted', confidence: 0.3, topics: [], createdAt: new Date().toISOString() }],
        ['c-peer', { id: 'c-peer', text: 'opposing claim', sourceArtifactId: 'a2', veracity: 'contradicted', confidence: 0.4, topics: [], createdAt: new Date().toISOString() }],
      ]),
      contradictions: new Map([
        ['e1', { id: 'e1', claimAId: 'c-ctr', claimBId: 'c-peer', strength: 0.8, reason: 'opposing result', detectedAt: new Date().toISOString() }],
      ]),
    });
    const entries = updateTrustScores(g, tmpDir);
    const ctr = entries.find(e => e.source_id === 'c-ctr');
    expect(ctr!.trust_score).toBeLessThan(0.5);
    expect(ctr!.contradiction_count).toBe(1);
  });

  it('persists to disk and reloads', () => {
    const g = makeGraph({
      claims: new Map([
        ['c-persist', { id: 'c-persist', text: 'persisted', sourceArtifactId: 'a1', veracity: 'supported', confidence: 0.8, topics: [], createdAt: new Date().toISOString() }],
      ]),
    });
    updateTrustScores(g, tmpDir);
    const loaded = loadTrustScores(tmpDir);
    expect(loaded.some(e => e.source_id === 'c-persist')).toBe(true);
  });
});
