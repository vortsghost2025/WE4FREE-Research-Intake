import { SignedSuggestionPacket, CanonicalGraph } from '../types';
import { findContradictions, findEvidenceForClaim } from '../graph/graph-queries';

export function requiresHumanReview(
  packet: SignedSuggestionPacket,
  graph: CanonicalGraph
): boolean {
  if (packet.risk === 'high') return true;
  if (packet.requires_human_review) return true;
  if (packet.suggestion_action === 'investigate_contradiction') return true;
  if (hasLowEvidence(packet, graph)) return true;
  if (hasContradictedClaimsInGraph(packet, graph)) return true;
  if (isHighConfidenceSuggestion(packet)) return false;
  return true;
}

function hasLowEvidence(
  packet: SignedSuggestionPacket,
  graph: CanonicalGraph
): boolean {
  const sourceUrl = packet.source_url;
  let totalEvidence = 0;
  for (const [, claim] of graph.claims) {
    const artifact = [...graph.artifactIndex.entries()]
      .find(([, ids]) => ids.includes(claim.id));
    if (artifact && graph.artifactIndex.has(sourceUrl)) {
      totalEvidence += findEvidenceForClaim(graph, claim.id).length;
    }
  }
  return totalEvidence === 0 && graph.claims.size > 0;
}

function hasContradictedClaimsInGraph(
  packet: SignedSuggestionPacket,
  graph: CanonicalGraph
): boolean {
  if (graph.contradictions.size === 0) return false;
  for (const [, claim] of graph.claims) {
    if (claim.veracity === 'contradicted' || claim.veracity === 'disputed') {
      const edges = findContradictions(graph, claim.id);
      if (edges.length > 0) return true;
    }
  }
  return false;
}

function isHighConfidenceSuggestion(packet: SignedSuggestionPacket): boolean {
  return packet.graph_confidence.finalConfidence > 0.8 &&
    packet.suggestion_action === 'adopt_evidence';
}
