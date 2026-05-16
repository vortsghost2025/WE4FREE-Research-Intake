# task: spike in-toto attestation packet format

## What
Add optional in-toto predicate attestation output format to sign-packet.ts. Existing HMAC signing stays as default.

## Phase
design3.txt Phase 1

## Files
- `src/types.ts` — add `IntotoAttestation` envelope type with `predicateType`, `subject[]` (name + digest), `predicate` fields
- `src/analyze/sign-packet.ts` — add `format: 'hmac' | 'in-toto'` param; when `'in-toto'`, wrap packet in in-toto envelope structure instead of HMAC-signing inline
- `src/analyze/verify-packet.ts` — add verification path for in-toto envelope format
- `src/cli/research-intake.ts` — add `--format` flag to `run` and `daemon` commands

## Details
- `predicateType` = `"https://we4free.dev/attestations/research-suggestion/v1"`
- `subject[0].name` = `packet.source_url`
- `subject[0].digest.sha256` = hash of `packet.claim`
- `predicate` = all remaining SuggestionPacket fields
- New types should coexist with existing `SignedSuggestionPacket`
- HMAC remains default; in-toto activates via `--format in-toto`

## Verify
- `npm run build`
- `npm test` — existing sign/verify tests still pass
- New test: in-toto envelope round-trip
