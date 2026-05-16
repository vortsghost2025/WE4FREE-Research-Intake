# task: upgrade contradiction detection with SparseCL sparse embeddings

## What
Replace O(n²) pairwise contradiction comparison with SparseCL-style sparse embedding retrieval.

## Phase
design3.txt Phase 5

## Files
- New: `src/analyze/sparse-embed.ts` — sparse embedding utilities (bag-of-concepts, IDF weighting, Hoyer sparsity)
- `src/analyze/contradiction-detect.ts` — replace pairwise loop with top-K sparse retrieval
- `src/analyze/__tests__/contradiction-detect.test.ts` — new tests for sparse retrieval

## Details
- Sparse embedding: bag-of-concepts via lexical tokenization + IDF weighting from corpus statistics
- Similarity: `cosine(a, b) * sparsity_penalty(hoyer(a), hoyer(b))`
- sparsity_penalty = `2 * hoyer(a) * hoyer(b) / (hoyer(a) + hoyer(b) + ε)` (harmonic mean)
- Return top-K (default K=5) most contradictory pairs per claim
- Fall back to O(n²) for n < 50 claims (small graphs don't need optimization)
- Build IDF corpus from all claim texts in the graph

## Verify
- `npm run build`
- `npm test` — contradiction tests pass
- Detection for n=100 claims completes faster than O(n²) baseline
- Sparse embeddings produce deterministic results for same input
