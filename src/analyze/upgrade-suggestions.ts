import {
  ScoredArtifact,
  RepoManifest,
  CanonicalGraph,
  SignedSuggestionPacket,
  SuggestionAction,
  LaneTarget,
} from '../types';
import { scoreConfidence } from './confidence-scorer';
import { routeToLane } from './lane-router';
import { findContradictions, findEvidenceForClaim } from '../graph/graph-queries';

export function generateSuggestions(
  scored: ScoredArtifact[],
  graph: CanonicalGraph,
  manifests: RepoManifest[]
): SignedSuggestionPacket[] {
  return scored
    .filter(s => s.relevanceScore > 0.2 && s.recommendedAction !== 'discard')
    .map(s => buildPacket(s, graph, manifests));
}

function buildPacket(
  scored: ScoredArtifact,
  graph: CanonicalGraph,
  manifests: RepoManifest[]
): SignedSuggestionPacket {
  const graphConfidence = scoreConfidence(scored, graph);
  const lane = routeToLane(scored.artifact, manifests, graph);
  const action = determineAction(scored, graph, manifests);
  const risk = determineRisk(scored, action, graphConfidence);

  return {
    packet_type: 'research_suggestion',
    target_lane: lane,
    confidence: graphConfidence.finalConfidence,
    source_url: scored.artifact.url,
    claim: scored.artifact.abstract.slice(0, 200),
    why_it_matters: buildWhyItMatters(action, scored, graph),
    suggested_change: buildSuggestedChange(action, scored, graph),
    risk,
    requires_human_review: risk === 'high' || scored.artifact.evidenceLevel === 'preprint',
    created_at: new Date().toISOString(),
    suggestion_action: action,
    graph_confidence: graphConfidence,
    signature: '',
    signing_key_id: '',
    packet_format: 'hmac',
  };
}

function determineAction(
  scored: ScoredArtifact,
  graph: CanonicalGraph,
  manifests: RepoManifest[]
): SuggestionAction {
  const artifactId = scored.artifact.id;
  const claimIds = graph.artifactIndex.get(artifactId) || [];

  if (hasContradictedClaims(claimIds, graph)) {
    return 'investigate_contradiction';
  }

  if (hasStrongEvidence(claimIds, graph) && hasSupportedVeracity(claimIds, graph)) {
    return 'adopt_evidence';
  }

  if (hasNewAuthorityLinks(artifactId, graph)) {
    return 'review_authority';
  }

  if (isNovelTopic(scored, manifests)) {
    return 'update_ontology';
  }

  return 'monitor_development';
}

function hasContradictedClaims(claimIds: string[], graph: CanonicalGraph): boolean {
  for (const claimId of claimIds) {
    const claim = graph.claims.get(claimId);
    if (claim && (claim.veracity === 'contradicted' || claim.veracity === 'disputed')) {
      return true;
    }
    if (findContradictions(graph, claimId).length > 0) {
      return true;
    }
  }
  return false;
}

function hasStrongEvidence(claimIds: string[], graph: CanonicalGraph): boolean {
  if (claimIds.length === 0) return false;
  let totalEvidence = 0;
  let totalWeight = 0;
  for (const claimId of claimIds) {
    const evidence = findEvidenceForClaim(graph, claimId);
    totalEvidence += evidence.length;
    totalWeight += evidence.reduce((sum, e) => sum + e.weight, 0);
  }
  return totalEvidence >= 2 && (totalWeight / Math.max(totalEvidence, 1)) > 0.5;
}

function hasSupportedVeracity(claimIds: string[], graph: CanonicalGraph): boolean {
  if (claimIds.length === 0) return false;
  const supported = claimIds.filter(id => {
    const claim = graph.claims.get(id);
    return claim && claim.veracity === 'supported';
  });
  return supported.length / claimIds.length >= 0.5;
}

function hasNewAuthorityLinks(artifactId: string, graph: CanonicalGraph): boolean {
  let count = 0;
  for (const [, link] of graph.authorityLinks) {
    if (link.fromArtifactId === artifactId || link.toArtifactId === artifactId) {
      count++;
    }
  }
  return count >= 2;
}

function isNovelTopic(scored: ScoredArtifact, manifests: RepoManifest[]): boolean {
  if (scored.noveltyScore < 0.6) return false;
  const artifactTopics = new Set(scored.artifact.topics.map(t => t.toLowerCase()));
  for (const manifest of manifests) {
    for (const kw of manifest.keywords) {
      if (artifactTopics.has(kw.toLowerCase())) return false;
    }
  }
  return true;
}

function determineRisk(
  scored: ScoredArtifact,
  action: SuggestionAction,
  graphConfidence: { finalConfidence: number; contradictionPenalty: number }
): 'low' | 'medium' | 'high' {
  if (action === 'investigate_contradiction') return 'high';
  if (graphConfidence.contradictionPenalty > 0.15) return 'high';
  if (scored.riskScore > 0.6) return 'high';
  if (action === 'adopt_evidence' && graphConfidence.finalConfidence > 0.7) return 'low';
  if (scored.riskScore > 0.3 || scored.artifact.evidenceLevel === 'preprint') return 'medium';
  return 'low';
}

function buildWhyItMatters(
  action: SuggestionAction,
  scored: ScoredArtifact,
  graph: CanonicalGraph
): string {
  const artifactId = scored.artifact.id;
  const claimIds = graph.artifactIndex.get(artifactId) || [];

  switch (action) {
    case 'investigate_contradiction': {
      const edges: string[] = [];
      for (const cid of claimIds) {
        for (const edge of findContradictions(graph, cid)) {
          edges.push(edge.reason);
        }
      }
      const reason = edges[0] || 'contradicting claims detected';
      return `Contradiction in graph requires resolution: ${reason}. Artifact "${scored.artifact.title}" contains claims that conflict with existing evidence.`;
    }
    case 'adopt_evidence':
      return `Strong evidence supports claims in "${scored.artifact.title}" (${claimIds.length} claims, confidence ${(scored.relevanceScore * 100).toFixed(0)}%). Ready for integration into target lane.`;
    case 'monitor_development':
      return `Preprint or early-stage research in "${scored.artifact.title}" with novelty score ${(scored.noveltyScore * 100).toFixed(0)}%. Monitor for peer review and additional evidence.`;
    case 'review_authority':
      return `New authority links discovered for "${scored.artifact.title}". Citation chain or co-authorship suggests this artifact is connected to trusted sources in the graph.`;
    case 'update_ontology':
      return `Novel topic detected in "${scored.artifact.title}" not covered by any existing lane manifest. Ontology may need extension to capture topics: ${scored.artifact.topics.slice(0, 3).join(', ')}.`;
  }
}

function buildSuggestedChange(
  action: SuggestionAction,
  scored: ScoredArtifact,
  graph: CanonicalGraph
): string {
  const artifactId = scored.artifact.id;
  const claimIds = graph.artifactIndex.get(artifactId) || [];

  switch (action) {
    case 'investigate_contradiction':
      return `Review contradiction edges for claims [${claimIds.slice(0, 3).join(', ')}] and determine which claim is supported by stronger evidence. Do not adopt until resolved.`;
    case 'adopt_evidence':
      return `Integrate supported claims from "${scored.artifact.title}" into the target lane knowledge base. Verify evidence weights before applying.`;
    case 'monitor_development':
      return `Add to watchlist. Re-evaluate when evidence level changes from "${scored.artifact.evidenceLevel}" or when new citations appear (current: ${scored.artifact.citations}).`;
    case 'review_authority':
      return `Trace authority chain for artifact ${artifactId}. Verify that linked artifacts maintain consistent claims and update trust scores accordingly.`;
    case 'update_ontology':
      return `Extend lane manifests or create new ontology entries for topics: ${scored.artifact.topics.slice(0, 5).join(', ')}. Consider adding to research-lane scope.`;
  }
}
