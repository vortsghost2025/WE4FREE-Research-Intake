# AGENTS.md — WE4FREE Research Intake

> Project-level agent instructions. Read `S:\GLOBAL_GOVERNANCE.md` first — universal laws supersede everything here.

## Project Overview

Research Ingestion + Evidence Scoring + Autonomous Patch Suggestion daemon. TypeScript/Node.js CLI that discovers, normalizes, scores, and quarantines research artifacts before they reach any autonomous system.

**Never let internet-scraped data directly modify the autonomous system.**

## Build / Run / Test

```bash
npm run build          # tsc (strict, ES2022, commonjs)
npm start              # node dist/cli/research-intake.js
npm run dev            # ts-node src/cli/research-intake.ts (DO NOT run directly — background it)
```

### No test or lint framework yet

- No test runner, no eslint, no prettier configured
- **Recommend:** add `vitest` for tests, `eslint` + `prettier` for lint/format
- Until then: verify with `npx tsc --noEmit` after changes

### Blocking command policy (from global governance)

Never run `npm run dev`, `npm start`, or any long-lived process in foreground. Background it and curl-verify. After 2 failed attempts, generate a PROJECT SUMMARY BRIEF and escalate.

## Architecture & Pipeline

Per `design1.txt`, the pipeline is:

```
DISCOVER → NORMALIZE → SCORE → QUARANTINE → COMPARE → HUMAN/AGENT REVIEW → SIGNED PACKET → LANE INBOX → AUTONOMOUS SYSTEM MAY ACT
```

### Key constraint: Quarantine-first

All scraped data must pass through quarantine before any comparison or suggestion generation. Never bypass the quarantine step. See `src/output/quarantine.ts`.

### Original phases (design1.txt)

1. **Phase 1** — Minimal daemon (current): ingest, normalize, score, quarantine, brief
2. **Phase 2** — Lane integration: connect to WE4FREE-Lattice-Deck lanes
3. **Phase 3** — Autonomous upgrade loop: signed packets trigger lane actions

### Updated roadmap (design2.txt)

1. **Phase A — Stable ingestion** — arXiv, GitHub, OpenAlex ingest; quarantine; similarity scoring; repo matching. No autonomy yet.
2. **Phase B — Semantic graph** — Claim graph, authority graph, contradiction graph. Lattice-Deck visualization becomes useful here.
3. **Phase C — Controlled recommendation engine** — Patch suggestions, architecture suggestions, governance warnings, dependency risks, missing research areas. Still no auto-patching.
4. **Phase D — Autonomous evolution** — Only after: signatures, provenance, rollback, contradiction thresholds, trust scoring, replay capability, sandbox verification.

### Source layout

| Directory | Purpose |
|-----------|---------|
| `src/cli/` | CLI entry point (commander) |
| `src/ingest/` | Source adapters: arxiv, github, osf, semantic-scholar, web-search |
| `src/normalize/` | Parsers: paper-parser, repo-parser, citation-extractor |
| `src/analyze/` | Scoring: repo-map, similarity, contradiction-detect, authority-score, upgrade-suggestions |
| `src/output/` | Briefing + quarantine writers |
| `src/daemon/` | Scheduler (systemd timer target) |
| `src/types.ts` | Canonical type definitions |

## Design2 Addendum — Ontology-Centric Direction

Per `design2.txt`, this project is shifting from repo-centric to ontology-centric architecture.

### Primary objects (not repos)

- Claim
- Evidence
- Capability
- GovernanceRule
- ExecutionPattern
- AuthorityLink
- Contradiction
- ResearchArtifact

Repositories are **implementations** of ontology objects, not the source of truth. The ontology is the source of truth.

### research-lane (proposed 5th lane)

| Action | Allowed |
|--------|---------|
| Discover | Yes |
| Validate | Yes |
| Compare | Yes |
| Contradict | Yes |
| Recommend | Yes |
| Execute patches | **No** |
| Mutate production | **No** |

Execution remains with existing controlled lanes and the Control Plane. `research-lane` must NEVER execute patches or mutate production systems.

### Canonicalization is critical

Without canonicalization: you only have documents. With it: you get reasoning. Every ingested artifact must be normalized into canonical graph entities before comparative cognition or suggestion synthesis.

### Suggested new repo: WE4FREE-Ontology

Consider creating `WE4FREE-Ontology` to centralize schemas currently spread implicitly across repos:
- Canonical entity schemas
- Packet schemas
- Lane schemas
- Governance schemas
- Authority edge definitions
- Contradiction types
- Evidence standards
- Trust scoring

### Self-modification threshold warning

This system is approaching the threshold where it becomes self-modifying, recursively optimizing, and ontology-generating. Governance is the only mechanism preventing collapse into chaos, hallucination, runaway complexity, or unverifiable state. **Do not weaken governance controls to accelerate feature delivery.**

## Code Style

### TypeScript config

- `strict: true`, `target: ES2022`, `module: commonjs`
- `esModuleInterop`, `forceConsistentCasingInFileNames`, `skipLibCheck`
- `declaration: true`, `declarationMap: true`, `sourceMap: true`
- Root: `./src`, Out: `./dist`

### Imports

```typescript
import { X } from 'module'           // named exports
import * as fs from 'fs'              // namespace imports for node builtins
import * as path from 'path'
import * as dotenv from 'dotenv'
import { ResearchArtifact } from '../types'  // relative with ../
```

### Naming conventions

| Kind | Convention | Example |
|------|-----------|---------|
| Functions, variables | camelCase | `fetchPapers`, `scoreMap` |
| Types, Interfaces | PascalCase | `ResearchArtifact`, `ScoredArtifact` |
| Files | kebab-case | `citation-extractor.ts`, `authority-score.ts` |
| SuggestionPacket keys | **snake_case** | `packet_type`, `target_lane`, `requires_human_review` |

The `SuggestionPacket` snake_case convention matches the design1.txt JSON packet format and is intentional — do not convert these to camelCase.

### Logging

```typescript
console.log('[phase:module] message')
console.error('[ingest:arxiv] fetch failed:', err)
```

Always prefix with `[phase:module]` bracketed tag.

### Error handling

- Scheduler uses `.catch(err => console.error(...))` pattern
- Ingest modules should wrap fetch calls in try/catch and log phase-prefixed errors
- Never silently swallow errors — at minimum, log them
- Never let a failed ingest crash the daemon

### Async patterns

- Top-level fetch functions are `async`, return `Promise<T[]>`
- Use `await` inside async functions; `.catch()` at the scheduler boundary

### Comments

- JSDoc `/** */` on exported functions
- `// TODO:` markers for incomplete implementations
- No inline noise comments

### Types

All canonical interfaces live in `src/types.ts`:
- `ResearchArtifact` — raw scraped data
- `ScoredArtifact` — after scoring
- `SuggestionPacket` — outbound patch suggestion (snake_case keys)
- `RepoManifest` — watched repo configuration

Do not define duplicate interfaces elsewhere. Import from `../types`.

## Environment & Config

- `.env.example` lists all required/optional keys: `ARXIV_API_KEY`, `GITHUB_TOKEN`, `OSF_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY`
- `WATCHED_REPOS_PATH=./watched-repos.json` — lane manifests
- `QUARANTINE_DIR=./output/quarantine`, `BRIEFING_DIR=./output/briefings`
- `/output/` is gitignored runtime data — never commit it
- `src/output/` is source code — do not gitignore

## Project-Specific Rules

1. **Quarantine before action** — no artifact reaches comparison or suggestion without quarantine scoring
2. **Evidence before assertion** — every SuggestionPacket must cite `source_url` and `why_it_matters`
3. **Human review gate** — if `requires_human_review === true`, the packet must not auto-advance
4. **Signed packets only** — Phase 3 autonomous actions require cryptographically signed evidence
5. **Idempotent ingests** — re-running the daemon should not duplicate quarantined artifacts
6. **No Cursor rules / no Copilot rules** found in this project — none to inherit

## References

- `design1.txt` — full architecture, pipeline phases, packet format
- `design2.txt` — ontology-centric direction, updated roadmap, research-lane proposal
- `S:\GLOBAL_GOVERNANCE.md` — 7 Universal Laws (Layer 1, supersedes this file)
- `S:\.global\` — extended governance and architecture documents
- `watched-repos.json` — active lane manifests
