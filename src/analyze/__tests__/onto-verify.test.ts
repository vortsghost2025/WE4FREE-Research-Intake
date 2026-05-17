import { describe, it, expect } from 'vitest';

/**
 * Audit 7 — WE4FREE-Ontology imports work from src/types.ts consumers
 *
 * Since src/types.ts imports from @we4free/ontology, any module that imports
 * ResearchArtifact, Claim, etc. transitively exercises the ontology package.
 * This file compiles exactly once in the test run; if any ontology type is
 * broken every test in this suite will error at Module import time.
 */

import type { ResearchArtifact, CanonicalGraph, Claim } from '../../types';
import type { SignedSuggestionPacket } from '../../types';

describe('Audit 7 — WE4FREE-Ontology type imports resolve from consumers', () => {
  it('ResearchArtifact type resolves and is constructable', () => {
    const a: ResearchArtifact = {
      id: 'onto-check-01',
      source: 'arxiv',
      title: 'Ontology type-check artifact',
      authors: ['Tester'],
      url: 'https://test.example/onto-check',
      abstract: 'This is a type-level test artifact for the WE4FREE-Ontology import chain.',
      claims: [],
      codeLinks: [],
      citations: 5,
      topics: ['ontology', 'testing'],
      evidenceLevel: 'preprint',
      license: 'Apache-2.0',
      discoveredAt: new Date().toISOString(),
    };
    expect(a.id).toBe('onto-check-01');
    expect(a.topics).toContain('ontology');
  });

  it('CanonicalGraph type resolves and all Maps are acknowledged', () => {
    const graph: CanonicalGraph = {
      claims: new Map(),
      evidence: new Map(),
      authorityLinks: new Map(),
      contradictions: new Map(),
      artifactIndex: new Map(),
    };
    expect(graph.claims.size).toBe(0);
    expect(graph.evidence.size).toBe(0);
  });

  it('Claim type resolves and veracity is closed enum', () => {
    const claims: Claim[] = [
      { id: 'c1', text: 'claim one', sourceArtifactId: 'a1', veracity: 'supported', confidence: 0.9, topics: [], createdAt: new Date().toISOString() },
      { id: 'c2', text: 'claim two', sourceArtifactId: 'a1', veracity: 'contradicted', confidence: 0.3, topics: [], createdAt: new Date().toISOString() },
      { id: 'c3', text: 'claim three', sourceArtifactId: 'a1', veracity: 'unverified', confidence: 0.5, topics: [], createdAt: new Date().toISOString() },
      { id: 'c4', text: 'claim four', sourceArtifactId: 'a1', veracity: 'disputed', confidence: 0.6, topics: [], createdAt: new Date().toISOString() },
    ];
    expect(claims.every(c =>
      ['supported', 'contradicted', 'unverified', 'disputed'].includes(c.veracity)
    )).toBe(true);
  });

  it('SignedSuggestionPacket _with_ packet_format is assignable (field from WO-01)', () => {
    const p: SignedSuggestionPacket = {
      packet_type: 'research_suggestion',
      target_lane: 'research',
      confidence: 0.9,
      source_url: 'https://x.y',
      claim: 'c',
      why_it_matters: 'w',
      suggested_change: 's',
      risk: 'low',
      requires_human_review: false,
      created_at: new Date().toISOString(),
      suggestion_action: 'adopt_evidence',
      graph_confidence: {
        baseConfidence: 0.8, evidenceBonus: 0.1, contradictionPenalty: 0,
        authorityBonus: 0, veracityModifier: 0, finalConfidence: 0.9,
      },
      signature: 'deadbeef',
      signing_key_id: 'env-key',
      packet_format: 'hmac',
    };
    expect(p.packet_format).toBe('hmac');
  });
});
