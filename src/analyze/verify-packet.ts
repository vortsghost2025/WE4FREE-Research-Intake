import * as crypto from 'crypto';
import { SignedSuggestionPacket } from '../types';
import { canonicalize } from './canonicalize-utils';

export function verifyPacket(
  packet: SignedSuggestionPacket,
  key?: string
): boolean {
  const signingKey = key || process.env.SUGGESTION_SIGNING_KEY;
  if (!signingKey) {
    console.error('[analyze:verify-packet] SUGGESTION_SIGNING_KEY env var is required. Cannot verify packet.');
    return false;
  }

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
