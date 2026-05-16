# task: extract WE4FREE-Ontology repo

## What
Create `WE4FREE-Ontology` GitHub repo and move canonical type definitions from `src/types.ts` into it. This project imports from the new package instead.

## Phase
design3.txt Phase 4

## Files
- New repo: `github.com/vortsghost2025/WE4FREE-Ontology`
- `spec/artifacts/research-artifact.schema.ts`
- `spec/graph/claim.schema.ts`
- `spec/graph/evidence.schema.ts`
- `spec/graph/authority.schema.ts`
- `spec/graph/contradiction.schema.ts`
- `spec/packets/suggestion-packet.schema.ts`
- `spec/scoring/graph-aware-score.schema.ts`
- `spec/scoring/trust-score-entry.schema.ts`
- `spec/lanes/lane-target.schema.ts`
- `spec/lanes/repo-manifest.schema.ts`
- New: `scripts/generate-json-schema.ts` — emit JSON Schema from TypeScript types
- This repo: `src/types.ts` — replace inline types with `export * from '@we4free/ontology'`
- This repo: `package.json` — add `@we4free/ontology` dependency (local path or npm)

## Details
- Follow UOR Framework pattern: spec/ is the source of truth, everything else is generated
- Each schema file exports both TypeScript type + JSON Schema object
- Generate JSON Schema via `ts-json-schema-generator` or manual mapping
- Publish as npm package or use GitHub package registry
- This repo should work with both the published package and a local `file:` reference for development

## Verify
- `npm run build` in this repo with imported types
- All existing tests pass with imported types
- JSON Schema export generates valid `.schema.json` files
- `WE4FREE-Ontology` repo has clean `spec/` structure
