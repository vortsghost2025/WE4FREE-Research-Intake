# System Audit — 2026-05-16

## Scope

Full audit of WE4FREE-Research-Intake after initial implementation of Phases A–D (design1 + design2) and external standards research (design3).

## Current state

### What exists

- **6 ingest adapters**: arXiv, GitHub, OSF, OpenAlex, Semantic Scholar, web search
- **Deduplication**: SHA256 content hashing, persistent seen-id tracking
- **Canonicalization**: claim extraction, evidence linking, authority link building, contradiction detection
- **Graph persistence**: JSONL-based graph store with merge, snapshot, and export
- **Scoring pipeline**: similarity computation, confidence scoring, lane routing, upgrade suggestion generation
- **Signed packets**: HMAC-SHA256 signing with timing-safe verification
- **Quarantine**: JSONL output with human-review gate
- **Autonomous modules**: auto-apply, rollback, feedback loop, trust scoring, self-heal, replay
- **CLI**: 14 commands via Commander, including `run`, `daemon`, `graph *`, `verify`, `auto-apply`, `rollback`, `feedback`, `replay`, `trust`, `self-heal`
- **Tests**: Vitest, 41 tests across 5 modules
- **Governance**: constitution, quarantine rules, autonomy thresholds
- **Design docs**: design1.txt, design2.txt, design3.txt

### What compiles

TypeScript strict mode, zero errors, clean build.

### Bugs found and fixed

| Bug | Location | Fix |
|-----|----------|-----|
| `artifactIndex.has(sourceUrl)` compared artifact IDs against URL string | `human-review-gate.ts:26` | Replaced with per-claim evidence iteration against graph |

### What is fragile

| Area | Risk | Notes |
|------|------|-------|
| **Normalize layer** (paper-parser, repo-parser, citation-extractor) | Stub implementations (~20 lines each). Will parse but not extract depth. | Blocking semantic quality. |
| **Contradiction detection** | O(n²) pairwise comparison. Adequate for small graphs, fails at scale. | SparseCL integration (design3 Phase 5) addresses this. |
| **Trust scoring** | Linear delta math (evidence adds, contradictions subtracts). No propagation. | ClaimTrust integration (design3 Phase 3) addresses this. |
| **Auto-apply safety perimeter** | Depends entirely on signature chain + quarantine gate. No sandbox verification. | design3 Phase 1 (in-toto/Witness) hardens this. |
| **Ontology schema drift** | Types are in `src/types.ts`. No external ontology repo. | design3 Phase 4 extracts to WE4FREE-Ontology. |
| **Ingest error handling** | Individual fetch failures are caught but may leave partial state. | No systematic rollback of partial ingest cycles. |

### What is robust

| Module | Assessment |
|--------|-----------|
| CLI | Production-quality. 14 commands, sensible defaults, env var integration. |
| Sign/verify | Clean HMAC-SHA256 with timing-safe comparison. Documented key management. |
| Dedup | Deterministic SHA256 hashing, persistent state. |
| Rollback | State machine correctness (pending/rejected states cannot rollback). Pre-state snapshots preserved. |
| Graph store | Merge, snapshot, JSONL append, stats, query. Sufficient for current scale. |
| Human review gate | Correct logic after bug fix. Six conditions evaluated. |

## Priority recommendations

| Priority | Action | Expected impact |
|----------|--------|-----------------|
| **P0** | in-toto/Witness packet format spike (design3 P1) | Hardens the safety perimeter for all autonomous mutation |
| **P1** | LangGraph workflow spike (design3 P2) | Makes the pipeline durable with checkpointing and crash recovery |
| **P1** | WE4FREE-Ontology extraction (design3 P4) | Prevents schema drift across 8+ repos |
| **P2** | Scoring upgrade (design3 P3) | Replaces linear trust math with iterative propagation |
| **P2** | Deepen normalize layer | Unlocks semantic quality; currently the shallowest part of the pipeline |
| **P3** | SparseCL contradiction retrieval (design3 P5) | Required before graph scales beyond ~100 claims |
| **P3** | Sandbox verification for auto-apply | Required before autonomous mutation operates without human oversight |

## Key metric

**41 tests, 0 failures, 0 compilation errors.** The system is architecturally sound. The remaining work is hardening depth and semantic quality — not scaffolding.

## References

- design1.txt — original pipeline architecture
- design2.txt — ontology-centric shift
- design3.txt — external standards integration plan
- governance/constitution.md — governing principles
- governance/quarantine-rules.json — machine-readable quarantine thresholds
- governance/autonomy-thresholds.json — autonomous mutation limits
