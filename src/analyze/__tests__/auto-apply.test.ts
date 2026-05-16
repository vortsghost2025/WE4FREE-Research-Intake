import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'os';
import { autoApply, isEligible, loadApplied } from '../auto-apply';
import { SignedSuggestionPacket, CanonicalGraph } from '../../types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.tmpdir() + '/autoapply-test-');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makePacket(overrides: Partial<SignedSuggestionPacket> = {}): SignedSuggestionPacket {
  return {
    packet_type: 'research_suggestion',
    target_lane: 'research',
    confidence: 0.9,
    source_url: 'https://example.com/paper1',
    claim: 'test claim',
    why_it_matters: 'testing',
    suggested_change: 'update X',
    risk: 'low',
    requires_human_review: false,
    created_at: new Date().toISOString(),
    suggestion_action: 'adopt_evidence',
    graph_confidence: {
      baseConfidence: 0.85,
      evidenceBonus: 0.05,
      contradictionPenalty: 0,
      authorityBonus: 0,
      veracityModifier: 0,
      finalConfidence: 0.9,
    },
    signature: 'sig123',
    signing_key_id: 'test',
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

describe('isEligible', () => {
  it('returns false when requires_human_review is true', () => {
    expect(isEligible(makePacket({ requires_human_review: true }))).toBe(false);
  });

  it('returns false when risk is medium', () => {
    expect(isEligible(makePacket({ risk: 'medium' }))).toBe(false);
  });

  it('returns false when risk is high', () => {
    expect(isEligible(makePacket({ risk: 'high' }))).toBe(false);
  });

  it('returns false when suggestion_action is not adopt_evidence', () => {
    expect(isEligible(makePacket({ suggestion_action: 'monitor_development' }))).toBe(false);
  });

  it('returns false when confidence is below 0.8 threshold', () => {
    expect(isEligible(makePacket({
      graph_confidence: { baseConfidence: 0.5, evidenceBonus: 0, contradictionPenalty: 0, authorityBonus: 0, veracityModifier: 0, finalConfidence: 0.7 },
    }))).toBe(false);
  });

  it('returns true for a fully eligible packet', () => {
    expect(isEligible(makePacket())).toBe(true);
  });
});

describe('autoApply', () => {
  it('returns empty array when no packets are eligible', () => {
    const packets = [makePacket({ requires_human_review: true })];
    const result = autoApply(packets, tmpDir, emptyGraph());
    expect(result).toEqual([]);
  });

  it('refuses unsafe packets by skipping ineligible ones', () => {
    const good = makePacket({ signature: 'good-sig' });
    const unsafe = makePacket({
      risk: 'high',
      requires_human_review: true,
      signature: 'unsafe-sig',
    });
    const packets = [good, unsafe];

    const result = autoApply(packets, tmpDir, emptyGraph());
    expect(result.length).toBe(1);
    expect(result[0].original_packet.signature).toBe('good-sig');
  });

  it('refuses unreviewed packets (requires_human_review)', () => {
    const unreviewed = makePacket({
      requires_human_review: true,
      signature: 'unreviewed-sig',
    });
    const result = autoApply([unreviewed], tmpDir, emptyGraph());
    expect(result).toEqual([]);
  });

  it('persists applied packets to applied.jsonl', () => {
    const packets = [makePacket({ signature: 'persist-sig' })];
    autoApply(packets, tmpDir, emptyGraph());

    const applied = loadApplied(tmpDir);
    expect(applied.length).toBe(1);
    expect(applied[0].original_packet.signature).toBe('persist-sig');
    expect(applied[0].state).toBe('auto_applied');
  });

  it('does not duplicate already-applied packets', () => {
    const packet = makePacket({ signature: 'dup-sig' });
    autoApply([packet], tmpDir, emptyGraph());
    autoApply([packet], tmpDir, emptyGraph());

    const applied = loadApplied(tmpDir);
    expect(applied.length).toBe(1);
  });

  it('records target_repo from target_lane', () => {
    const packet = makePacket({ signature: 'repo-sig', target_lane: 'kernel' });
    const result = autoApply([packet], tmpDir, emptyGraph());
    expect(result[0].target_repo).toBe('kernel');
  });
});
