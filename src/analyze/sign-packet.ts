import * as crypto from 'crypto';
import { SignedSuggestionPacket, PacketFormat } from '../types';
import { canonicalize } from './canonicalize-utils';

const IN_TOTO_TYPE = 'https://in-toto.io/Statement/v0.1';
const IN_TOTO_PREDICATE_TYPE = 'https://we4free.dev/attestations/research-suggestion/v1';

/**
 * Fields that the HMAC is computed over.
 * Both sign and verify paths use this exact allowlist so the canonicalJSON
 * byte-for-byte match is guaranteed regardless of packet mutation state.
 *
 * Explicitly STRIPPED (envelope / mutable metadata):
 *   signature, signing_key_id, packet_format  — set by signInToto AFTER signing
 *   _type, subject, predicateType, predicate, verification_material  — in-toto envelope
 */
const SIGNED_PREDICATE_FIELDS: (keyof SignedSuggestionPacket)[] = [
  // SuggestionPacket fields
  'packet_type',
  'target_lane',
  'confidence',
  'source_url',
  'claim',
  'why_it_matters',
  'suggested_change',
  'risk',
  'requires_human_review',
  'created_at',
  'suggestion_action',
  'graph_confidence',
];

export function signPacket(
  packet: Omit<SignedSuggestionPacket, 'signature' | 'signing_key_id' | 'packet_format'>,
  key?: string,
  format: PacketFormat = 'hmac'
): SignedSuggestionPacket {
  const signingKey = key || process.env.SUGGESTION_SIGNING_KEY;
  if (!signingKey) {
    throw new Error('[analyze:sign-packet] SUGGESTION_SIGNING_KEY env var is required. Set it before signing packets.');
  }
  const keyId = key ? 'provided-key' : 'env-key';

  if (format === 'in-toto') {
    return signInToto(packet, signingKey, keyId);
  }

  const unsigned = { ...packet, signature: '', signing_key_id: '' };
  const canonical = canonicalize(unsigned);
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(canonical)
    .digest('hex');

  return { ...(packet as any), signature, signing_key_id: keyId, packet_format: 'hmac' };
}

function buildPredicateForHmac(packet: SignedSuggestionPacket): Record<string, any> {
  return SIGNED_PREDICATE_FIELDS.reduce((acc, key) => {
    if ((packet as any)[key] !== undefined) acc[key] = (packet as any)[key];
    return acc;
  }, {} as Record<string, any>);
}

function signInToto(
  packet: Omit<SignedSuggestionPacket, 'signature' | 'signing_key_id' | 'packet_format'>,
  signingKey: string,
  keyId: string
): SignedSuggestionPacket {
  const predicate = buildPredicateForHmac(packet as SignedSuggestionPacket);
  const canonicalPredicate = canonicalize(predicate);
  const hmacSig = crypto
    .createHmac('sha256', signingKey)
    .update(canonicalPredicate)
    .digest('hex');

  const subjectText = packet.source_url || '';
  const subjectDigest = crypto
    .createHash('sha256')
    .update(subjectText)
    .digest('hex');

  const envelope = {
    _type: IN_TOTO_TYPE,
    subject: [{ name: subjectText, digest: { sha256: subjectDigest } }],
    predicateType: IN_TOTO_PREDICATE_TYPE,
    predicate,
    verification_material: {
      hmac_signature: hmacSig as unknown as string,
      signing_key_id: keyId as unknown as string,
    },
  };

  return {
    ...packet,
    signature: hmacSig,
    signing_key_id: keyId,
    packet_format: 'in-toto',
    verification_material: {
      hmac_signature: hmacSig as unknown as string,
      signing_key_id: keyId as unknown as string,
    },
  } as SignedSuggestionPacket;
}


