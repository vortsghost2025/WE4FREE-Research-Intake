# task: add Rego policy gate for quarantine

## What
Create a Rego policy file for quarantine evaluation and integrate it into the quarantine output step. This makes human-review-gate rules machine-enforceable via Open Policy Agent.

## Phase
design3.txt Phase 1

## Files
- New: `policies/quarantine-policy.rego` — Rego rules matching human-review-gate.ts logic
- `src/output/quarantine.ts` — optional rego evaluation step when policy file present
- `src/types.ts` — add `PolicyResult` type (pass/fail + reasons array)

## Details
- Rego rules to encode:
  - `risk == "high"` → deny unless manually overridden
  - `graph_confidence.finalConfidence < 0.5` → deny
  - `source_url == ""` → deny
  - `requires_human_review == true` → flag for review (not deny)
- Rego evaluation is optional — if no policy file exists, fall back to current logic
- Use `@open-policy-agent/opa-wasm` or shell out to `opa eval` — prefer WASM for portability

## Verify
- `npm run build`
- `opa eval` against the policy with test inputs passes/fails as expected
- Quarantine step does not crash when no policy file present
