import { describe, it, expect } from 'vitest';
import { signPacket } from '../sign-packet';
import { verifyPacket } from '../verify-packet';
import { SignedSuggestionPacket } from '../../types';

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
    ...overrides,
  };
}

describe('signPacket', () => {
  it('returns a packet with a non-empty signature and key id', () => {
    const key = 'test-signing-key-12345';
    const packet = makePacket();
    const signed = signPacket(packet, key);

    expect(signed.signature).toBeTruthy();
    expect(signed.signing_key_id).toBe('provided-key');
    expect(typeof signed.signature).toBe('string');
    expect(signed.signature.length).toBeGreaterThan(0);
  });

  it('signing the same packet twice produces the same signature', () => {
    const key = 'static-key';
    const packet = makePacket();
    const a = signPacket(packet, key);
    const b = signPacket(packet, key);

    expect(a.signature).toBe(b.signature);
  });

  it('different keys produce different signatures', () => {
    const packet = makePacket();
    const a = signPacket(packet, 'key-a');
    const b = signPacket(packet, 'key-b');

    expect(a.signature).not.toBe(b.signature);
  });

  it('throws if no key provided and env var is unset', () => {
    const key = process.env.SUGGESTION_SIGNING_KEY;
    delete process.env.SUGGESTION_SIGNING_KEY;
    expect(() => signPacket(makePacket())).toThrow('SUGGESTION_SIGNING_KEY');
    if (key) process.env.SUGGESTION_SIGNING_KEY = key;
  });
});

describe('verifyPacket', () => {
  it('returns true for a validly signed packet', () => {
    const key = 'verify-test-key';
    const packet = makePacket();
    const signed = signPacket(packet, key);
    const result = verifyPacket(signed, key);
    expect(result).toBe(true);
  });

  it('returns false when signature is tampered', () => {
    const key = 'tamper-test-key';
    const packet = makePacket();
    const signed = signPacket(packet, key);

    const tampered: SignedSuggestionPacket = { ...signed, claim: 'maliciously altered claim' };
    const result = verifyPacket(tampered, key);
    expect(result).toBe(false);
  });

  it('returns false when signed with a different key', () => {
    const packet = makePacket();
    const signed = signPacket(packet, 'correct-key');
    const result = verifyPacket(signed, 'wrong-key');
    expect(result).toBe(false);
  });

  it('returns false when signature is empty string', () => {
    const key = 'empty-sig-key';
    const packet = signPacket(makePacket(), key);
    const noSig: SignedSuggestionPacket = { ...packet, signature: '' };
    const result = verifyPacket(noSig, key);
    expect(result).toBe(false);
  });

  it('returns false when no key provided and env var is unset', () => {
    const key = process.env.SUGGESTION_SIGNING_KEY;
    delete process.env.SUGGESTION_SIGNING_KEY;
    const result = verifyPacket(makePacket());
    expect(result).toBe(false);
    if (key) process.env.SUGGESTION_SIGNING_KEY = key;
  });
});
