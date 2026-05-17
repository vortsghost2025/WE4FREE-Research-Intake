import * as crypto from 'crypto';
import { SignedSuggestionPacket } from '../types';
import { canonicalize } from './canonicalize-utils';

const IN_TOTO_PREDICATE_TYPE = 'https://we4free.dev/attestations/research-suggestion/v1';

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

function verifyInToto(packet: SignedSuggestionPacket, signingKey: string): boolean {
  const enclosing = packet as any;
  const payloadHmacSig = enclosing.verification_material?.hmac_signature;
  const subjectText = packet.source_url || '';

  const predicate = buildPredicate(packet);
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

function buildPredicate(packet: any): Record<string, any> {
  const pJson = JSON.stringify(packet);
  const parsed = JSON.parse(pJson);
  delete parsed._type;
  delete parsed.subject;
  delete parsed.predicateType;
  delete parsed.predicate;
  delete parsed.verification_material;
  return parsed;
}
