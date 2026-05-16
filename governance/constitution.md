# WE4FREE Constitution

Layer 1 governance — supersedes all project-level AGENTS.md files. Derived from the 7 Universal Laws (S:\GLOBAL_GOVERNANCE.md), design1.txt, design2.txt, and design3.txt.

## Article 1 — Quarantine before action

No artifact, claim, or suggestion reaches comparison, recommendation, or execution without passing through quarantine scoring. This is not a code convention — it is a structural invariant.

## Article 2 — Evidence before assertion

Every SuggestionPacket must cite `source_url` and `why_it_matters`. Assertions without attributable evidence are discarded. Trust scores propagate through the evidence graph; un-evidenced claims decay to zero.

## Article 3 — Human review gate

If a packet requires human review (`requires_human_review == true`), it must not auto-advance. No autonomous path may bypass this gate. The gate may only be opened by a verified human or a cryptographically signed override from the control plane.

## Article 4 — Signed packets only

All packets moving between lanes must carry a verifiable signature. Unsigned packets are rejected at lane boundaries. Phase D autonomous actions additionally require in-toto attestation format with provenance chain.

## Article 5 — Lane isolation

- **research-lane**: discovers, validates, compares, contradicts, recommends. Never executes patches or mutates production systems.
- **kernel-lane**: executes approved changes. Never originates research or recommendations.
- **control-plane**: orchestrates, quarantines, heals. The only lane that can override gates.
- Execution lanes inherit isolation from control plane; they do not grant it to themselves.

## Article 6 — Evidence integrity

- All evidence is timestamped and attributed to a source artifact.
- Contradictions are tracked as first-class graph entities, not deleted.
- Rollback preserves pre-state snapshots. Every mutation is reversible.
- Trust scores decay over time. No claim is trusted indefinitely without refresh.

## Article 7 — Self-modification threshold

This system is approaching the threshold where it becomes self-modifying, recursively optimizing, and ontology-generating. Governance is the only mechanism preventing collapse into chaos, hallucination, runaway complexity, or unverifiable state.

Do not weaken governance controls to accelerate feature delivery.

## Article 8 — Ontology stability

Canonical type definitions live in `WE4FREE-Ontology`, not in implementation repos. No project may define its own overlapping canonical types. Schema drift between repos is a governance violation, not a code issue.

## Article 9 — Failure transparency

- All autonomous actions are logged to an append-only event log.
- All rollbacks produce a RollbackRecord with reason and restored snapshot.
- The replay command can reconstruct any previous system state.
- Silent failures are treated as integrity violations.

## Article 10 — Amendment

This constitution may only be amended by:
1. A signed governance packet from the control plane, or
2. A human with repository admin access, documented with rationale.
