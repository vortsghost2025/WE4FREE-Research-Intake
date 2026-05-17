import * as crypto from 'crypto';
import { SignedSuggestionPacket } from '../types';
import { canonicalize } from './canonicalize-utils';

const IN_TOTO_PREDICATE_TYPE = 'https://we4free.dev/attestations/research-suggestion/v1';

/**
 * Allowed fields for HMAC predicate canonicalisation.
 * MUST stay in lock-step with SIGNED_PREDICATE_FIELDS in sign-packet.ts.
 */
const SIGNED_PREDICATE_FIELDS: (keyof SignedSuggestionPacket)[] = [
  'packet_type', 'target_lane', 'confidence', 'source_url',
  'claim', 'why_it_matters', 'suggested_change',
  'risk', 'requires_human_review', 'created_at',
  'suggestion_action', 'graph_confidence',
];

export function verifyPacket(
  packet: SignedSuggestionPacket,
  key?: string
): boolean {
  const signingKey = key || process.env.SUGGESTION_SIGNING_KEY;
  if (!signingKey) {
    console.error('[analyze:verify-packet] SUGGESTION_SIGNING_KEY env var is required. Cannot verify packet.');
    return false;
  }

  if (packet.packet_format === 'in-toto') {
    return verifyInToto(packet, signingKey);
  }

  return verifyHmac(packet, signingKey);
}

function verifyHmac(packet: SignedSuggestionPacket, signingKey: string): boolean {
  const unsigned = { ...packet, signature: '', signing_key_id: '' };
  const canonical = canonicalize(unsigned);
  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(canonical)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(packet.signature, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * buildPredicateForHmac — shared allowlist predicate builder (matches sign-packet.ts).
 * Strips only the in-toto / signature-envelope fields that must not be part of
 * the signed canonical form.
 */
function buildPredicateForHmac(packet: SignedSuggestionPacket): Record<string, any> {
  return SIGNED_PREDICATE_FIELDS.reduce((acc, key) => {
    const val = (packet as any)[key];
    if (val !== undefined) acc[key] = val;
    return acc;
  }, {} as Record<string, any>);
}

function verifyInToto(packet: SignedSuggestionPacket, signingKey: string): boolean {
  // Read the HMAC that was embedded by signInToto
  const payloadHmacSig = packet.verification_material?.hmac_signature as string | undefined;
  const subjectText = packet.source_url || '';

  const predicate = buildPredicateForHmac(packet);
  const canonicalPredicate = canonicalize(predicate);
  const expectedHmacSig = crypto
    .createHmac('sha256', signingKey)
    .update(canonicalPredicate)
    .digest('hex');

  if (!payloadHmacSig) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHmacSig, 'hex'),
      Buffer.from(payloadHmacSig, 'hex')
    );
  } catch {
    return false;
  }
}
