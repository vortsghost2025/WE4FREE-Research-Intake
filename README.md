# WE4FREE Research Intake

Continuously discover papers, repos, datasets, standards, and governance references; normalize them into a canonical knowledge graph; score and quarantine them; then emit signed, source-backed improvement packets for autonomous lanes.

**Part of the WE4FREE ecosystem** — a self-governing autonomous research organism spanning 8+ interconnected projects.

## Pipeline

```
DISCOVER → NORMALIZE → CANONICALIZE → SCORE → QUARANTINE → SIGN → REVIEW → LANE INBOX
```

| Stage | What happens |
|-------|-------------|
| **Discover** | Fetches from arXiv, GitHub, OSF, OpenAlex, Semantic Scholar, and web search |
| **Normalize** | Parses papers, repos, citations into `ResearchArtifact` objects |
| **Deduplicate** | SHA256 content hashing prevents re-processing seen artifacts |
| **Canonicalize** | Extracts claims, evidence, authority links, and contradictions into a typed graph |
| **Score** | Multi-signal similarity against watched repos + graph-aware confidence scoring |
| **Quarantine** | Writes signed suggestion packets to quarantine JSONL; flags packets needing human review |
| **Sign** | HMAC-SHA256 signs every packet; optional in-toto attestation format |
| **Brief** | Generates plain-text terminal briefing of findings |

## Quick start

```bash
npm install
cp .env.example .env    # configure your API keys
npm run build

# Single intake cycle
npm start -- run

# Run as daemon (hourly cycles)
npm start -- daemon

# Run tests
npm test
```

## CLI reference

| Command | Description |
|---------|-------------|
| `run` | Single intake cycle: fetch → normalize → score → quarantine → brief |
| `daemon` | Periodic intake cycles with configurable interval |
| `graph stats` | Print canonical graph statistics |
| `graph contradictions` | List detected contradictions between claims |
| `graph unresolved` | List unverified claims without contradictions |
| `graph related <claimId>` | Find claims related to a given claim |
| `graph authority <artifactId>` | Trace authority chain from an artifact |
| `graph export` | Export graph as JSON for Lattice-Deck visualization |
| `verify <file>` | Verify HMAC signatures on quarantined packets |
| `auto-apply` | Batch-apply eligible low-risk packets from quarantine |
| `rollback <packetId>` | Roll back an applied packet |
| `feedback <packetId> <outcome>` | Record feedback outcome to adjust trust scores |
| `replay` | Replay autonomous event log chronologically |
| `trust` | Update and display trust scores for graph entities |
| `self-heal` | Detect and flag degraded autonomous suggestions |

## Project structure

```
src/
├── ingest/          # Source adapters (arxiv, github, osf, openalex, semantic-scholar, web-search, dedup)
├── normalize/       # Parsers (paper-parser, repo-parser, citation-extractor)
├── canonicalize/    # Ontology extraction (canonicalizer, claim-extractor, evidence-linker)
├── graph/           # Knowledge graph store, queries, export
├── analyze/         # Scoring, similarity, contradictions, authority, trust, suggestions
├── output/          # Quarantine writer, briefing generator
├── cli/             # Commander-based CLI entry point
├── daemon/          # Scheduler for periodic cycles
└── types.ts         # Canonical type definitions
```

## Design docs

| Doc | Scope |
|-----|-------|
| `design1.txt` | Original pipeline architecture, phases 1–3 |
| `design2.txt` | Ontology-centric shift, research-lane proposal |
| `design3.txt` | External standards integration (in-toto, LangGraph, ClaimTrust, etc.) |

## Tech stack

- **Runtime:** Node.js 25, TypeScript 5.4 (strict mode, ES2022)
- **CLI:** Commander
- **Persistence:** JSONL files, in-memory graph store with disk snapshots
- **Crypto:** HMAC-SHA256 packet signing with timing-safe verification
- **Tests:** Vitest (41 tests across 5 modules)
- **No runtime database required** — all state is file-based

## Requirements

- Node.js >= 20
- npm >= 10
- API keys (optional): GitHub, Semantic Scholar, OSF, arXiv (for higher rate limits)

## Architecture notes

- **Quarantine before action** — no artifact reaches comparison or suggestion without scoring
- **Evidence before assertion** — every suggestion packet cites `source_url` and `why_it_matters`
- **Human review gate** — high-risk or low-evidence packets are flagged and blocked from auto-advance
- **Signed packets only** — all packets carry HMAC-SHA256 signatures; verification required before execution
- **Idempotent ingests** — SHA256 content hashing prevents duplicate processing
- **Never let internet-scraped data directly modify autonomous systems**

## Related projects

- [Archivist-Agent](https://github.com/vortsghost2025/Archivist-Agent) — provenance, evidence, file governance
- [self-organizing-library](https://github.com/vortsghost2025/self-organizing-library) — semantic memory, graph, verification
- [SwarmMind](https://github.com/vortsghost2025/SwarmMind) — multi-agent coordination
- [WE4FREE-Control-Plane](https://github.com/vortsghost2025/WE4FREE-Control-Plane) — orchestration, quarantine, healing
- [kernel-lane](https://github.com/vortsghost2025/kernel-lane) — CUDA/GPU execution infrastructure
- [Lattice-Deck](https://github.com/vortsghost2025/Lattice-Deck) — visualization, authority topology
- [WE4FREE-Ontology](https://github.com/vortsghost2025/WE4FREE-Ontology) — canonical schemas (planned)
