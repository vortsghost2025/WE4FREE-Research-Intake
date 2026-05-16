import * as fs from 'fs';
import * as path from 'path';
import {
  AppliedPacket,
  CanonicalGraph,
} from '../types';
import { loadApplied, saveApplied } from './auto-apply';
import { loadTrustScores } from './trust-score';

const DEGRADED_TRUST_THRESHOLD = 0.3;
const DEGRADED_CONFIDENCE_THRESHOLD = 0.4;

export function detectDegradedSuggestions(
  graph: CanonicalGraph,
  autonomousDir: string
): AppliedPacket[] {
  const applied = loadApplied(autonomousDir);
  const trustScores = loadTrustScores(autonomousDir);
  const trustMap = new Map(trustScores.map(e => [e.source_id, e.trust_score]));

  const degraded: AppliedPacket[] = [];

  for (let i = 0; i < applied.length; i++) {
    const packet = applied[i];
    if (packet.state !== 'auto_applied' && packet.state !== 'human_approved') {
      continue;
    }

    if (isDegraded(packet, graph, trustMap)) {
      applied[i] = { ...packet, state: 'degraded' };
      degraded.push(applied[i]);
    }
  }

  if (degraded.length > 0) {
    saveApplied(applied, autonomousDir);
    logDegraded(degraded, autonomousDir);
  }

  console.log(`[phase:self-heal] Detected ${degraded.length} degraded suggestions`);
  return degraded;
}

function isDegraded(
  packet: AppliedPacket,
  graph: CanonicalGraph,
  trustMap: Map<string, number>
): boolean {
  const currentConfidence = computeCurrentConfidence(packet, graph, trustMap);
  if (currentConfidence < DEGRADED_CONFIDENCE_THRESHOLD) return true;

  const artifactId = packet.original_packet.source_url;
  const trustScore = trustMap.get(artifactId);
  if (trustScore !== undefined && trustScore < DEGRADED_TRUST_THRESHOLD) return true;

  const claimIds = getRelatedClaimIds(packet, graph);
  for (const claimId of claimIds) {
    const claim = graph.claims.get(claimId);
    if (claim && (claim.veracity === 'contradicted' || claim.veracity === 'disputed')) {
      return true;
    }
  }

  return false;
}

function computeCurrentConfidence(
  packet: AppliedPacket,
  graph: CanonicalGraph,
  trustMap: Map<string, number>
): number {
  let confidence = packet.original_packet.graph_confidence.finalConfidence;

  const claimIds = getRelatedClaimIds(packet, graph);
  for (const claimId of claimIds) {
    const trust = trustMap.get(claimId);
    if (trust !== undefined) {
      confidence *= (0.5 + trust * 0.5);
    }

    for (const [, edge] of graph.contradictions) {
      if (edge.claimAId === claimId || edge.claimBId === claimId) {
        confidence -= edge.strength * 0.15;
      }
    }
  }

  return Math.min(Math.max(confidence, 0), 1);
}

function getRelatedClaimIds(
  packet: AppliedPacket,
  graph: CanonicalGraph
): string[] {
  const sourceUrl = packet.original_packet.source_url;
  return graph.artifactIndex.get(sourceUrl) || [];
}

function logDegraded(degraded: AppliedPacket[], autonomousDir: string): void {
  if (!fs.existsSync(autonomousDir)) {
    fs.mkdirSync(autonomousDir, { recursive: true });
  }
  const filePath = path.join(autonomousDir, 'self-heal.jsonl');
  const line = JSON.stringify({
    detected_at: new Date().toISOString(),
    degraded_count: degraded.length,
    packet_ids: degraded.map(d => d.packet_id),
  }) + '\n';
  fs.appendFileSync(filePath, line, 'utf-8');
}
