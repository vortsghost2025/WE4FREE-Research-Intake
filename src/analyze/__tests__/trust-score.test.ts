import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'os';
import * as crypto from 'crypto';
import { updateTrustScores, loadTrustScores, getTrustScore } from '../trust-score';
import { CanonicalGraph } from '../../types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.tmpdir() + '/trust-test-');
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

describe('updateTrustScores', () => {
  it('returns entries for all claims in the graph', () => {
    const graph = makeGraph({
      claims: new Map([
        ['c1', { id: 'c1', text: 'claim 1', sourceArtifactId: 'a1', veracity: 'supported', confidence: 0.8, topics: [], createdAt: new Date().toISOString() }],
        ['c2', { id: 'c2', text: 'claim 2', sourceArtifactId: 'a1', veracity: 'unverified', confidence: 0.5, topics: [], createdAt: new Date().toISOString() }],
      ]),
    });

    const entries = updateTrustScores(graph, tmpDir);
    expect(entries.length).toBe(2);
    expect(entries.map(e => e.source_type)).toEqual(['claim', 'claim']);
  });

  it('starts new claims at a trust score of 0.5', () => {
    const graph = makeGraph({
      claims: new Map([
        ['c1', { id: 'c1', text: 'fresh claim', sourceArtifactId: 'a1', veracity: 'unverified', confidence: 0.5, topics: [], createdAt: new Date().toISOString() }],
      ]),
    });

    const entries = updateTrustScores(graph, tmpDir);
    expect(entries[0].trust_score).toBeCloseTo(0.5, 1);
  });

  it('increases trust score when evidence exists for a claim', () => {
    const graph = makeGraph({
      claims: new Map([
        ['c1', { id: 'c1', text: 'evidenced claim', sourceArtifactId: 'a1', veracity: 'supported', confidence: 0.8, topics: [], createdAt: new Date().toISOString() }],
      ]),
      evidence: new Map([
        ['e1', { id: 'e1', claimId: 'c1', type: 'citation', value: 'doi:10.1234/x', sourceArtifactId: 'a2', weight: 1 }],
        ['e2', { id: 'e2', claimId: 'c1', type: 'experimental_result', value: 'test data', sourceArtifactId: 'a3', weight: 1 }],
      ]),
    });

    const entries = updateTrustScores(graph, tmpDir);
    expect(entries[0].trust_score).toBeGreaterThan(0.5);
    expect(entries[0].evidence_count).toBe(2);
  });

  it('decreases trust score when contradictions exist', () => {
    const graph = makeGraph({
      claims: new Map([
        ['c1', { id: 'c1', text: 'contradicted claim', sourceArtifactId: 'a1', veracity: 'contradicted', confidence: 0.3, topics: [], createdAt: new Date().toISOString() }],
      ]),
      contradictions: new Map([
        ['edge1', { id: 'edge1', claimAId: 'c1', claimBId: 'c2', strength: 0.9, reason: 'opposite result', detectedAt: new Date().toISOString() }],
      ]),
    });

    const entries = updateTrustScores(graph, tmpDir);
    expect(entries[0].trust_score).toBeLessThan(0.5);
    expect(entries[0].contradiction_count).toBe(1);
  });

  it('persists scores to disk and loadTrustScores retrieves them', () => {
    const graph = makeGraph({
      claims: new Map([
        ['c1', { id: 'c1', text: 'persistent claim', sourceArtifactId: 'a1', veracity: 'supported', confidence: 0.8, topics: [], createdAt: new Date().toISOString() }],
      ]),
      evidence: new Map([
        ['e1', { id: 'e1', claimId: 'c1', type: 'citation', value: 'doi:10.1234/x', sourceArtifactId: 'a2', weight: 1 }],
      ]),
    });

    updateTrustScores(graph, tmpDir);
    const loaded = loadTrustScores(tmpDir);
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded.some(e => e.source_id === 'c1')).toBe(true);
  });

  it('getTrustScore returns the score for a known claim', () => {
    const graph = makeGraph({
      claims: new Map([
        ['c1', { id: 'c1', text: 'known claim', sourceArtifactId: 'a1', veracity: 'supported', confidence: 0.8, topics: [], createdAt: new Date().toISOString() }],
      ]),
      evidence: new Map([
        ['e1', { id: 'e1', claimId: 'c1', type: 'citation', value: 'doi:10.1234/x', sourceArtifactId: 'a2', weight: 1 }],
      ]),
    });

    updateTrustScores(graph, tmpDir);
    const score = getTrustScore('c1', tmpDir);
    expect(score).not.toBeNull();
    expect(typeof score).toBe('number');
  });

  it('getTrustScore returns null for unknown source', () => {
    const score = getTrustScore('nonexistent', tmpDir);
    expect(score).toBeNull();
  });
});
