import * as fs from 'fs';
import * as path from 'path';
import {
  CanonicalGraph,
  TrustScoreEntry,
} from '../types';

const DEFAULT_DECAY_FACTOR = 0.995;
const EVIDENCE_WEIGHT = 0.05;
const CONTRADICTION_WEIGHT = -0.1;
const MIN_TRUST = 0;
const MAX_TRUST = 1;
const PROPAGATION_ALPHA = 0.60;     // how much to trust an evidence-neighbor
const PROPAGATION_ITERATIONS = 20;   // max iterations
const PROPAGATION_EPSILON = 0.001;   // convergence threshold

type ClaimId = string;
type ArtifactId = string;

/**
 * updateTrustScores — WO-04 scoring upgrade.
 *
 * Uses iterative ClaimTrust propagation over the claim evidence graph rather
 * than the naive linear delta approach.  The propagation step connects claims
 * through shared evidence, so a claim supported by evidence pointing to a
 * high-trust claim accumulates more trust.
 *
 * Evidence graph construction: for each pair of claims sharing ≥1 evidence
 * edge, emit aEvidence weight as the edge weight and treat claims without
 * raw evidence weights as weight=0.5.
 *
 * After propagation converges, apply the existing decay step on top so scores
 * still age appropriately.
 */
export function updateTrustScores(
  graph: CanonicalGraph,
  autonomousDir: string
): TrustScoreEntry[] {
  // ── Load existing scores (for decay from last_updated) ────────────────────
  const existing = loadTrustScores(autonomousDir);
  const existingMap = new Map(existing.map(e => [e.source_id, e]));

  // ── Build initial raw trust from evidence count (no graph traversal yet) ──
  const qcMap = buildRawClaimTrusts(graph);

  // ── Iterate over the evidence shared-claim graph (ClaimTrust) ──────────────
  const trustMap = propagateEvidenceTrust(graph, qcMap);

  // ── Apply decay + per-claim evidence/contradiction bookkeeping ────────────
  const updated: TrustScoreEntry[] = [];
  const now = new Date().toISOString();

  for (const [id, claim] of graph.claims) {
    const prev = existingMap.get(id) || {
      source_id: id,
      source_type: 'claim' as const,
      trust_score: 0.5,
      evidence_count: 0,
      contradiction_count: 0,
      last_updated: now,
      decay_factor: DEFAULT_DECAY_FACTOR,
      accumulated_weight: 0,
    };

    let evidenceCount = 0;
    for (const [, ev] of graph.evidence) {
      if (ev.claimId === id) evidenceCount++;
    }

    let contradictionCount = 0;
    for (const [, edge] of graph.contradictions) {
      if (edge.claimAId === id || edge.claimBId === id) contradictionCount++;
    }

    // Decay from last-known score (hours since last update)
    const hoursSinceUpdate = (Date.now() - new Date(prev.last_updated).getTime()) / (1000 * 60 * 60);
    const decayedScore = prev.trust_score * Math.pow(prev.decay_factor, hoursSinceUpdate);

    // Linear deltas on top of decayed score (kept; evidence differences still matter)
    const evidenceDelta = (evidenceCount - prev.evidence_count) * EVIDENCE_WEIGHT;
    const contradictionDelta = (contradictionCount - prev.contradiction_count) * CONTRADICTION_WEIGHT;

    const propagatedTrust = trustMap.get(id) ?? decayedScore;

    // Final score: evidence-delifted propagated score, capped
    const rawFinal = propagatedTrust + evidenceDelta + contradictionDelta;
    const newScore = Math.min(Math.max(decayedScore + (rawFinal - 0.5) * PROPAGATION_ALPHA, MIN_TRUST), MAX_TRUST);

    const newAccumulatedWeight = prev.accumulated_weight + Math.abs(evidenceDelta) + Math.abs(contradictionDelta);

    updated.push({
      source_id: id,
      source_type: 'claim',
      trust_score: Math.round(newScore * 1000) / 1000,
      evidence_count: evidenceCount,
      contradiction_count: contradictionCount,
      last_updated: now,
      decay_factor: prev.decay_factor,
      accumulated_weight: Math.round(newAccumulatedWeight * 1000) / 1000,
    });
  }

  // Authority links — decay only (no propagation for links themselves)
  for (const [id, link] of graph.authorityLinks) {
    const prev = existingMap.get(id) || {
      source_id: id,
      source_type: 'authority_link' as const,
      trust_score: link.weight,
      evidence_count: 0,
      contradiction_count: 0,
      last_updated: now,
      decay_factor: DEFAULT_DECAY_FACTOR,
      accumulated_weight: 0,
    };

    const hoursSinceUpdate = (Date.now() - new Date(prev.last_updated).getTime()) / (1000 * 60 * 60);
    const decayedScore = prev.trust_score * Math.pow(prev.decay_factor, hoursSinceUpdate);

    updated.push({
      source_id: id,
      source_type: 'authority_link',
      trust_score: Math.round(Math.min(Math.max(decayedScore, MIN_TRUST), MAX_TRUST) * 1000) / 1000,
      evidence_count: prev.evidence_count,
      contradiction_count: prev.contradiction_count,
      last_updated: now,
      decay_factor: prev.decay_factor,
      accumulated_weight: prev.accumulated_weight,
    });
  }

  saveTrustScores(updated, autonomousDir);

  console.log(`[phase:trust] Updated ${updated.length} trust scores`);
  return updated;
}

// ── Raw claim trust from own evidence count ───────────────────────────────────

function buildRawClaimTrusts(graph: CanonicalGraph): Map<ClaimId, number> {
  const map = new Map<ClaimId, number>();
  for (const [id, claim] of graph.claims) {
    map.set(id, claim.veracity === 'supported' ? 0.75
         : claim.veracity === 'contradicted' ? 0.15
         : claim.veracity === 'disputed' ? 0.35
         : 0.5);
  }
  return map;
}

// ── Iterative ClaimTrust propagation ─────────────────────────────────────────

function propagateEvidenceTrust(
  graph: CanonicalGraph,
  raw: Map<ClaimId, number>
): Map<ClaimId, number> {
  // Build the evidence-shared-claim adjacency
  const edges = buildEvidenceGraph(graph);

  let qc = new Map(raw); // current iteration trust
  for (let iter = 0; iter < PROPAGATION_ITERATIONS; iter++) {
    const qcNew = new Map<ClaimId, number>();

    let maxDelta = 0;

    for (const [claimId, baseTrust] of raw) {
      let weightedSum = 0;
      let totalWeight = 0;

      for (const nb of edges.get(claimId) ?? []) {
        const nbTrust = qc.get(nb.from) ?? 0.5;
        weightedSum += (nb.weight ?? 0.5) * PROPAGATION_ALPHA * nbTrust;
        totalWeight += nb.weight ?? 0.5;
      }

      const neighbourBoost = totalWeight > 0
        ? (1 - PROPAGATION_ALPHA) * (weightedSum / totalWeight)
        : 0;

      const qcPrev = qc.get(claimId) ?? 0.5;
      const qcNewVal = baseTrust + neighbourBoost;
      qcNew.set(claimId, qcNewVal);

      maxDelta = Math.max(maxDelta, Math.abs(qcNewVal - qcPrev));
    }

    qc = qcNew;

    if (maxDelta < PROPAGATION_EPSILON) {
      console.log(`[phase:trust] Converged after ${iter + 1} iterations (Δ=${maxDelta.toFixed(5)})`);
      break;
    }
  }

  return qc;
}

interface EvidenceEdge {
  from: ClaimId;
  to: ClaimId;
  weight: number;      // net evidence weight linking the two claims
  supports: boolean;
}

/**
 * buildEvidenceGraph — infer shared-claim edges from shared evidence tokens.
 *
 * For every pair of claims citing the same source artifact, emit an edge
 * weighted by the number of shared evidence tokens.
 */
function buildEvidenceGraph(graph: CanonicalGraph): Map<ClaimId, EvidenceEdge[]> {
  const edges = new Map<ClaimId, EvidenceEdge[]>();

  const claimArtifactMap = new Map<ArtifactId, ClaimId[]>();
  for (const [claimId, claim] of graph.claims) {
    const list = claimArtifactMap.get(claim.sourceArtifactId) || [];
    list.push(claimId);
    claimArtifactMap.set(claim.sourceArtifactId, list);
  }

  // This is a simple heuristic linking — in a full implementation this would
  // use contradiction-detection and evidence-token overlap.
  for (const [_artifactId, claimIds] of claimArtifactMap) {
    for (let i = 0; i < claimIds.length; i++) {
      for (let j = i + 1; j < claimIds.length; j++) {
        const a = claimIds[i];
        const b = claimIds[j];
        const edge: EvidenceEdge = { from: a, to: b, weight: 0.5, supports: true };

        edges.get(a) ? edges.get(a)!.push(edge) : edges.set(a, [edge]);
        edges.get(b) ? edges.get(b)!.push(edge) : edges.set(b, [{ ...edge, from: b, to: a }]);
      }
    }
  }

  return edges;
}

// ── Persistence (unchanged) ───────────────────────────────────────────────────

export function loadTrustScores(autonomousDir: string): TrustScoreEntry[] {
  const filePath = path.join(autonomousDir, 'trust-scores.jsonl');
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  return raw
    .trim()
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as TrustScoreEntry);
}

function saveTrustScores(entries: TrustScoreEntry[], autonomousDir: string): void {
  if (!fs.existsSync(autonomousDir)) {
    fs.mkdirSync(autonomousDir, { recursive: true });
  }
  const filePath = path.join(autonomousDir, 'trust-scores.jsonl');
  const lines = entries.map(e => JSON.stringify(e));
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
}

export function getTrustScore(sourceId: string, autonomousDir: string): number | null {
  const scores = loadTrustScores(autonomousDir);
  const entry = scores.find(e => e.source_id === sourceId);
  return entry ? entry.trust_score : null;
}
