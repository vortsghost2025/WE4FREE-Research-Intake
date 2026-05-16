import * as crypto from 'crypto';
import { SignedSuggestionPacket } from '../types';
import { canonicalize } from './canonicalize-utils';

export function signPacket(
  packet: SignedSuggestionPacket,
  key?: string
): SignedSuggestionPacket {
  const signingKey = key || process.env.SUGGESTION_SIGNING_KEY;
  if (!signingKey) {
    throw new Error('[analyze:sign-packet] SUGGESTION_SIGNING_KEY env var is required. Set it before signing packets.');
  }
  const keyId = key ? 'provided-key' : 'env-key';

  const unsigned = { ...packet, signature: '', signing_key_id: '' };
  const canonical = canonicalize(unsigned);
  const signature = crypto
    .createHmac('sha256', signingKey)
    .update(canonical)
    .digest('hex');

  return { ...packet, signature, signing_key_id: keyId };
}


