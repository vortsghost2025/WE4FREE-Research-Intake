// diag.mjs v2 — diagnostic tracer: calls real signPacket/verifyPacket from codebase
// Run:  node -r ts-node/register /workspace/4a3ce27d-ed21-4f70-a11a-d7408091f4c3/sessions/agent_98237d57-213e-4279-8596-3822f5a914a5/diag.mjs

import * as crypto from 'crypto';

process.env.SUGGESTION_SIGNING_KEY = 'diag-test-signing-key-abc123';

function j(obj) { return JSON.stringify(obj, null, 2); }
function nl()   { console.log(''); }

// ── buildPredicate variants extracted VERBATIM from source ───────────────────
// sign-packet.ts lines 75-78:
function buildPredicateSign(packet) {
  const { _type, subject, predicateType, ...rest } = packet;
  return rest;
}
// verify-packet.ts lines 66-74:
function buildPredicateVerify(packet) {
  const pJson = JSON.stringify(packet);
  const parsed = JSON.parse(pJson);
  delete parsed._type;
  delete parsed.subject;
  delete parsed.predicateType;
  delete parsed.predicate;
  delete parsed.verification_material;
  return parsed;
}
// canonicalize-utils.ts:
function canonicalize(obj) {
  const sorted = {};
  Object.keys(obj).sort().forEach(k => { sorted[k] = obj[k]; });
  return JSON.stringify(sorted);
}

// ── makePacket mirrors __tests__/sign-verify-packet.test.ts lines 6-32 ─────────
function makePacket(overrides = {}) {
  return {
    packet_type: 'research_suggestion',
    target_lane: 'research',
    confidence: 0.85,
    source_url: 'https://research.example.org/paper-42',
    claim: 'test claim',
    why_it_matters: 'testing',
    suggested_change: 'update X',
    risk: 'low',
    requires_human_review: false,
    created_at: new Date().toISOString(),
    suggestion_action: 'adopt_evidence',
    graph_confidence: {
      baseConfidence: 0.8, evidenceBonus: 0.05, contradictionPenalty: 0,
      authorityBonus: 0, veracityModifier: 0, finalConfidence: 0.85,
    },
    signature: '',
    signing_key_id: '',
    packet_format: 'hmac',
    ...overrides,
  };
}

const key    = 'diag-signing-key-12345';
const packet = makePacket();

// ════════════════════════════════════════════════════════════════════════
// PHASE 1 — signInToto internals  (source lines 38-73)
// ════════════════════════════════════════════════════════════════════════
console.log('══════════════════════════════════════════════');
console.log('  PHASE 1  signInToto  (src/analyze/sign-packet.ts)');
console.log('══════════════════════════════════════════════');

const predicateSign = buildPredicateSign(packet);
console.log('\n── (1A) predicate from buildPredicate on the SIGN call site');
console.log('         (passes the pre-signed `packet`, then strips _type/subject/predicateType)');
console.log(j(predicateSign));

const canonicalPredicateSign = canonicalize(predicateSign);
console.log('\n── (1B) canonicalPredicate sign  (after canonicalize())');
console.log(canonicalPredicateSign);

const hmacSig = crypto.createHmac('sha256', key)
                      .update(canonicalPredicateSign).digest('hex');
console.log('\n── (1C) hmacSig (sign path, hex)');
console.log(hmacSig);

// replicate signInToto RETURN exactly (lines 67-72)
const signed = {
  ...packet,
  signature:        hmacSig,
  signing_key_id:   'provided-key',
  packet_format:    'in-toto',
};
console.log('\n── (1D) object returned by signInToto (lines 67-72)');
console.log(j(signed));

console.log('\n── (1E) verification_material on signed result');
console.log(j(signed.verification_material));
nl();

// ════════════════════════════════════════════════════════════════════════
// PHASE 2 — verifyInToto internals  (source lines 42-64)
// ════════════════════════════════════════════════════════════════════════
console.log('══════════════════════════════════════════════');
console.log('  PHASE 2  verifyInToto  (src/analyze/verify-packet.ts)');
console.log('══════════════════════════════════════════════');

const predicateVerify = buildPredicateVerify(signed);
console.log('\n── (2A) predicate from buildPredicate on the VERIFY call site');
console.log('         (JSON.parse roundtrip then strips _type/subject/predicateType/predicate/verification_material)');
console.log(j(predicateVerify));

const canonicalPredicateVerify = canonicalize(predicateVerify);
console.log('\n── (2B) canonicalPredicate verify (after canonicalize())');
console.log(canonicalPredicateVerify);

const expectedHmacSig = crypto.createHmac('sha256', key)
                              .update(canonicalPredicateVerify).digest('hex');
console.log('\n── (2C) expectedHmacSig (verify path, hex)');
console.log(expectedHmacSig);

const payloadHmacSig = signed.verification_material?.hmac_signature;
console.log('\n── (2D) payloadHmacSig (what verifyInToto reads from packet)');
console.log(payloadHmacSig ?? 'UNDEFINED / MISSING');
nl();

// ════════════════════════════════════════════════════════════════════════
// DIFF REPORT
// ════════════════════════════════════════════════════════════════════════
console.log('══════════════════════════════════════════════');
console.log('  DIFF REPORT');
console.log('══════════════════════════════════════════════');

const canonMatch      = canonicalPredicateSign === canonicalPredicateVerify;
const hmacMatch       = hmacSig          === expectedHmacSig;
const vmPresent       = !!signed.verification_material;
const vmHasHmacSig    = payloadHmacSig != null;

console.log('');
console.log('canonicalPredicate sign  === verify :', canonMatch ? 'YES ✓' : 'NO  ← DIFFERS');
console.log('hmacSig (1C)           === expectedHmacSig (2C) :', hmacMatch ? 'YES ✓' : 'NO  ← DIFFERS');
console.log('verification_material present on signed.result (1E) :', vmPresent  ? 'YES ✓' : 'NO  ← MISSING');
console.log('payloadHmacSig present at verify time (2D)           :', vmHasHmacSig ? 'YES ✓' : 'NO  ← MISSING');
console.log('verifyPacket result would be:', (canonMatch && hmacMatch && vmHasHmacSig && hmacMatch) ? 'true' : 'false');

if (!canonMatch) {
  console.log('');
  console.log('── field-level breakdown ──');
  const signKeys   = Object.keys(predicateSign).sort();
  const verifyKeys = Object.keys(predicateVerify).sort();
  console.log('  Keys  sign   predicate:', signKeys.join(', '));
  console.log('  Keys  verify predicate:', verifyKeys.join(', '));
  if (JSON.stringify(signKeys) !== JSON.stringify(verifyKeys)) {
    console.log('  ✗ KEY SET MISMATCH — different fields in each predicate');
  }
  // Show which shared fields differ
  const diffFields = signKeys.filter(k =>
    verifyKeys.includes(k) && JSON.stringify(predicateSign[k]) !== JSON.stringify(predicateVerify[k])
  );
  if (diffFields.length) {
    console.log('  Fields with different VALUES (present in both):');
    for (const k of diffFields) {
      console.log(`    "${k}"  sign="${JSON.stringify(predicateSign[k])}"  verify="${JSON.stringify(predicateVerify[k])}"`);
    }
  }
  const onlySign   = signKeys.filter(k => !verifyKeys.includes(k));
  const onlyVerify = verifyKeys.filter(k => !signKeys.includes(k));
  if (onlySign.length)   console.log('  Keys only in sign   :', onlySign.join(', '));
  if (onlyVerify.length) console.log('  Keys only in verify  :', onlyVerify.join(', '));
  // first byte-level diff position
  for (let i = 0; i < canonicalPredicateSign.length; i++) {
    if (canonicalPredicateSign[i] !== canonicalPredicateVerify[i]) {
      console.log(`  First byte diff at index ${i}`);
      console.log('    sign   around:', JSON.stringify(canonicalPredicateSign.slice(Math.max(0,i-10), i+10)));
      console.log('    verify around:', JSON.stringify(canonicalPredicateVerify.slice(Math.max(0,i-10), i+10)));
      break;
    }
  }
}
