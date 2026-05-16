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

export function updateTrustScores(
  graph: CanonicalGraph,
  autonomousDir: string
): TrustScoreEntry[] {
  if (!fs.existsSync(autonomousDir)) {
    fs.mkdirSync(autonomousDir, { recursive: true });
  }

  const existing = loadTrustScores(autonomousDir);
  const existingMap = new Map(existing.map(e => [e.source_id, e]));

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

    const hoursSinceUpdate = (Date.now() - new Date(prev.last_updated).getTime()) / (1000 * 60 * 60);
    const decayedScore = prev.trust_score * Math.pow(prev.decay_factor, hoursSinceUpdate);

    const evidenceDelta = (evidenceCount - prev.evidence_count) * EVIDENCE_WEIGHT;
    const contradictionDelta = (contradictionCount - prev.contradiction_count) * CONTRADICTION_WEIGHT;

    const newScore = Math.min(
      Math.max(decayedScore + evidenceDelta + contradictionDelta, MIN_TRUST),
      MAX_TRUST
    );

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

export function saveTrustScores(entries: TrustScoreEntry[], autonomousDir: string): void {
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
