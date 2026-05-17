import { describe, it, expect } from 'vitest';
import { requiresHumanReview } from '../human-review-gate';
import { CanonicalGraph, SignedSuggestionPacket } from '../../types';

function makePacket(overrides: Partial<SignedSuggestionPacket> = {}): SignedSuggestionPacket {
  return {
    packet_type: 'research_suggestion',
    target_lane: 'research',
    confidence: 0.85,
    source_url: 'https://example.com/paper1',
    claim: 'test claim',
    why_it_matters: 'testing',
    suggested_change: 'update X',
    risk: 'low',
    requires_human_review: false,
    created_at: new Date().toISOString(),
    suggestion_action: 'adopt_evidence',
    graph_confidence: {
      baseConfidence: 0.8,
      evidenceBonus: 0.05,
      contradictionPenalty: 0,
      authorityBonus: 0,
      veracityModifier: 0,
      finalConfidence: 0.85,
    },
    signature: '',
    signing_key_id: '',
    packet_format: 'hmac',
    ...overrides,
  };
}

function emptyGraph(): CanonicalGraph {
  return {
    claims: new Map(),
    evidence: new Map(),
    authorityLinks: new Map(),
    contradictions: new Map(),
    artifactIndex: new Map(),
  };
}

describe('requiresHumanReview', () => {
  it('returns true for high risk packets', () => {
    const result = requiresHumanReview(makePacket({ risk: 'high' }), emptyGraph());
    expect(result).toBe(true);
  });

  it('returns true when requires_human_review is explicitly set', () => {
    const result = requiresHumanReview(makePacket({ requires_human_review: true }), emptyGraph());
    expect(result).toBe(true);
  });

  it('returns true for contradiction investigation actions', () => {
    const result = requiresHumanReview(makePacket({ suggestion_action: 'investigate_contradiction' }), emptyGraph());
    expect(result).toBe(true);
  });

  it('returns false for high-confidence adopt_evidence with no low evidence', () => {
    const graph = emptyGraph();
    graph.claims.set('c1', {
      id: 'c1',
      text: 'test claim',
      sourceArtifactId: 'a1',
      veracity: 'supported',
      confidence: 0.9,
      topics: ['test'],
      createdAt: new Date().toISOString(),
    });
    graph.evidence.set('e1', {
      id: 'e1',
      claimId: 'c1',
      type: 'citation',
      value: 'doi:10.1234/test',
      sourceArtifactId: 'a1',
      weight: 1,
    });
    graph.artifactIndex.set('a1', ['c1']);

    const packet = makePacket({
      risk: 'low',
      suggestion_action: 'adopt_evidence',
      graph_confidence: {
        baseConfidence: 0.85,
        evidenceBonus: 0.05,
        contradictionPenalty: 0,
        authorityBonus: 0,
        veracityModifier: 0,
        finalConfidence: 0.9,
      },
    });
    const result = requiresHumanReview(packet, graph);
    expect(result).toBe(false);
  });

  it('returns true when no claims have supporting evidence (low evidence)', () => {
    const graph = emptyGraph();
    graph.claims.set('c1', {
      id: 'c1',
      text: 'unsupported claim',
      sourceArtifactId: 'a1',
      veracity: 'unverified',
      confidence: 0.5,
      topics: ['test'],
      createdAt: new Date().toISOString(),
    });
    graph.artifactIndex.set('a1', ['c1']);

    const packet = makePacket({
      risk: 'low',
      suggestion_action: 'adopt_evidence',
      graph_confidence: {
        baseConfidence: 0.8,
        evidenceBonus: 0,
        contradictionPenalty: 0,
        authorityBonus: 0,
        veracityModifier: 0,
        finalConfidence: 0.8,
      },
    });
    const result = requiresHumanReview(packet, graph);
    expect(result).toBe(true);
  });

  it('returns false when graph has no claims', () => {
    const result = requiresHumanReview(makePacket({
      risk: 'low',
      suggestion_action: 'adopt_evidence',
      graph_confidence: {
        baseConfidence: 0.85,
        evidenceBonus: 0.05,
        contradictionPenalty: 0,
        authorityBonus: 0,
        veracityModifier: 0,
        finalConfidence: 0.9,
      },
    }), emptyGraph());
    expect(result).toBe(false);
  });
});
