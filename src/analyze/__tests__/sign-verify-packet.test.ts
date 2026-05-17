import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
    packet_format: 'hmac',
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

    const tampered: SignedSuggestionPacket = { ...signed, claim: 'maliciously altered claim', packet_format: 'hmac' };
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
});

// ── Audit 1: in-toto envelope generate + verify ────────────────────────────
describe('in-toto envelope', () => {
  it('signs as in-toto and sets packet_format', () => {
    const key = 'intoto-sig-key';
    const packet = makePacket();
    const signed = signPacket(packet, key, 'in-toto');

    expect(signed.packet_format).toBe('in-toto');
    expect(signed.signature).toBeTruthy();
    expect(signed.signing_key_id).toBe('provided-key');
  });

  it('verifies a valid in-toto packet', () => {
    const key = 'intoto-verify-key';
    const packet = makePacket({ source_url: 'https://research.example.org/paper-42' });
    const signed = signPacket(packet, key, 'in-toto');
    expect(verifyPacket(signed, key)).toBe(true);
  });

  it('in-toto verify fails when signature is tampered', () => {
    const key = 'intoto-tamper-key';
    const signed = signPacket(makePacket(), key, 'in-toto');
    const tampered: SignedSuggestionPacket = { ...signed, claim: 'tampered claim', packet_format: 'in-toto' };
    expect(verifyPacket(tampered, key)).toBe(false);
  });

  it('in-toto verify fails when key is wrong', () => {
    const signed = signPacket(makePacket(), 'correct-key', 'in-toto');
    expect(verifyPacket(signed, 'wrong-key')).toBe(false);
  });

  it('in-toto verify fails when verification_material.hmac_signature is missing', () => {
    const key = 'intoto-no-vm-key';
    const packet = makePacket();
    // Manually strip the verification_material — simulates a malformed packet
    const malformed: SignedSuggestionPacket = {
      ...makePacket(),
      packet_format: 'in-toto',
      verification_material: {},
    };
    expect(verifyPacket(malformed, key)).toBe(false);
  });
});

// ── Audit 2: malformed in-toto packet fails verification ───────────────────
describe('malformed in-toto packet', () => {
  it('returns false for a packet with packet_format=in-toto but no verification_material field', () => {
    const key = 'intoto-malformed-key';
    const signed: SignedSuggestionPacket = {
      ...makePacket(),
      packet_format: 'in-toto',
      signature: 'deadbeef',
      signing_key_id: 'fake',
    };
    expect(verifyPacket(signed, key)).toBe(false);
  });

  it('returns false for in-toto packet with empty hmac_signature', () => {
    const key = 'intoto-empty-vm-key';
    const signed: SignedSuggestionPacket = {
      ...makePacket(),
      packet_format: 'in-toto',
      verification_material: { hmac_signature: '', signing_key_id: 'env-key' },
    };
    expect(verifyPacket(signed, key)).toBe(false);
  });

  it('returns false for in-toto packet with completely spoofed predicate content', () => {
    const key = 'intoto-spoof-key';
    const legit = signPacket(makePacket(), key, 'in-toto');
    // Spoof: keep verification_material from legit, but change claim
    const spoofed: SignedSuggestionPacket = {
      ...makePacket({ claim: 'completely different spoofed claim' }),
      packet_format: 'in-toto',
    };
    expect(verifyPacket(spoofed, key)).toBe(false);
  });
});

  it('returns false when no key provided and env var is unset', () => {
    const key = process.env.SUGGESTION_SIGNING_KEY;
    delete process.env.SUGGESTION_SIGNING_KEY;
    const result = verifyPacket(makePacket());
    expect(result).toBe(false);
    if (key) process.env.SUGGESTION_SIGNING_KEY = key;
  });
});
