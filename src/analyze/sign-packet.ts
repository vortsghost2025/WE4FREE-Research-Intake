import * as crypto from 'crypto';
import { SignedSuggestionPacket, PacketFormat } from '../types';
import { canonicalize } from './canonicalize-utils';

const IN_TOTO_TYPE = 'https://in-toto.io/Statement/v0.1';
const IN_TOTO_PREDICATE_TYPE = 'https://we4free.dev/attestations/research-suggestion/v1';

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

function signInToto(
  packet: Omit<SignedSuggestionPacket, 'signature' | 'signing_key_id' | 'packet_format'>,
  signingKey: string,
  keyId: string
): SignedSuggestionPacket {
  const predicate = buildPredicate(packet);
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
      hmac_signature: hmacSig,
      signing_key_id: keyId,
    },
  };

  const claimHash = crypto
    .createHash('sha256')
    .update(packet.claim || '')
    .digest('hex');

  return {
    ...packet,
    signature: hmacSig,
    signing_key_id: keyId,
    packet_format: 'in-toto',
  } as SignedSuggestionPacket;
}

function buildPredicate(packet: any): Record<string, any> {
  const { _type, subject, predicateType, ...rest } = packet as any;
  return rest;
}


