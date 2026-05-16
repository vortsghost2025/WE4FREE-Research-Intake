# task: upgrade scoring to Paper Scout composite formula + ClaimTrust propagation

## What
Replace current ad-hoc scoring with Paper Scout's 5-signal weighted composite and ClaimTrust's iterative trust propagation.

## Phase
design3.txt Phase 3

## Files
- `src/types.ts` — add `compositeScore`, `communityActivity`, `recency` to ScoredArtifact
- `src/analyze/similarity.ts` — implement composite score with configurable weights from env
- `src/analyze/trust-score.ts` — replace linear delta math with PageRank-style iterative propagation
- `src/analyze/confidence-scorer.ts` — integrate composite score into graph confidence
- `.env.example` — add SCORE_WEIGHT_* env vars with defaults

## Details
- Default weights: embedding=0.45, keyword=0.15, authority=0.20, community=0.10, recency=0.10
- ClaimTrust: `trust(claim) = α * base + (1-α) * Σ(w * trust(neighbor))`, iterate max 20 rounds, converge at Δ < 0.001
- Supporting edges = positive weight, contradicting = negative weight
- Persist converged scores with iteration count metadata
- Existing trust-score tests must be updated for new behavior (not deleted)

## Verify
- `npm run build`
- `npm test` — update existing tests, verify composite math
- Composite score with default weights matches expected ranges
- Trust propagation increases score with supporting evidence, decreases with contradictions
