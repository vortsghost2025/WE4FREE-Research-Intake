import { CanonicalGraph, ScoredArtifact, GraphAwareScore } from '../types';

/**
 * scoreConfidence — graph-aware confidence scoring (confidence-scorer.ts)
 *
 * WO-04 scoring upgrade: baseConfidence now anchors on compositeScore
 * (Paper Scout 5-signal) instead of the old relevance × authority product.
 *
 * All remaining signal modifiers are graph-derived (they do not duplicate the
 * compositeScore dimensions, which are artefact-intrinsic):
 *   evidenceBonus      — claims backed by evidence in the canonical graph
 *   contradictionPenalty — max contradiction strength touching any claim of this artefact
 *   authorityBonus     — number of authority links touching the artefact
 *   veracityModifier   — average veracity of claims (supported +, contradicted -, disputed -)
 *   communityBoost     — communityActivity × recency product (degeneracy guard when > 0.5)
 */
export function scoreConfidence(
  scored: ScoredArtifact,
  graph: CanonicalGraph
): GraphAwareScore {
  // WO-04: baseConfidence replaces old relevanceScore × authorityScore
  const baseConfidence = (scored.compositeScore || scored.relevanceScore) * scored.authorityScore;

  const artifactClaims = getArtifactClaims(scored.artifact.id, graph);
  const evidenceBonus = computeEvidenceBonus(artifactClaims, graph);
  const contradictionPenalty = computeContradictionPenalty(artifactClaims, graph);
  const authorityBonus = computeAuthorityBonus(scored.artifact.id, graph);
  const veracityModifier = computeVeracityModifier(artifactClaims, graph);
  // Community activity cross-bred with recency: healthy signals amplify baseConfidence
  const communityBoost = (scored.communityActivity ?? 0) * (scored.recency ?? 0);

  const finalConfidence = Math.min(
    Math.max(
      baseConfidence
        + evidenceBonus
        - contradictionPenalty
        + authorityBonus
        + veracityModifier
        + communityBoost,
      0
    ),
    1
  );

  return {
    baseConfidence: round(baseConfidence),
    evidenceBonus: round(evidenceBonus),
    contradictionPenalty: round(contradictionPenalty),
    authorityBonus: round(authorityBonus),
    veracityModifier: round(veracityModifier),
    finalConfidence: round(finalConfidence),
  };
}

function getArtifactClaims(artifactId: string, graph: CanonicalGraph): string[] {
  return graph.artifactIndex.get(artifactId) || [];
}

function computeEvidenceBonus(claimIds: string[], graph: CanonicalGraph): number {
  if (claimIds.length === 0) return 0;
  let totalWeight = 0;
  let evidenceCount = 0;
  for (const claimId of claimIds) {
    for (const [, ev] of graph.evidence) {
      if (ev.claimId === claimId) {
        totalWeight += ev.weight;
        evidenceCount++;
      }
    }
  }
  if (evidenceCount === 0) return 0;
  const avgWeight = totalWeight / evidenceCount;
  const coverageRatio = Math.min(evidenceCount / claimIds.length, 1);
  return avgWeight * coverageRatio * 0.2;
}

function computeContradictionPenalty(claimIds: string[], graph: CanonicalGraph): number {
  let maxStrength = 0;
  for (const claimId of claimIds) {
    for (const [, edge] of graph.contradictions) {
      if (edge.claimAId === claimId || edge.claimBId === claimId) {
        if (edge.strength > maxStrength) {
          maxStrength = edge.strength;
        }
      }
    }
  }
  return maxStrength * 0.3;
}

function computeAuthorityBonus(artifactId: string, graph: CanonicalGraph): number {
  let linkCount = 0;
  for (const [, link] of graph.authorityLinks) {
    if (link.fromArtifactId === artifactId || link.toArtifactId === artifactId) {
      linkCount++;
    }
  }
  if (linkCount === 0) return 0;
  return Math.min(linkCount * 0.05, 0.2);
}

function computeVeracityModifier(claimIds: string[], graph: CanonicalGraph): number {
  if (claimIds.length === 0) return 0;
  let modifier = 0;
  for (const claimId of claimIds) {
    const claim = graph.claims.get(claimId);
    if (!claim) continue;
    switch (claim.veracity) {
      case 'supported':  modifier += 0.05; break;
      case 'contradicted': modifier -= 0.1; break;
      case 'disputed':   modifier -= 0.05; break;
      case 'unverified': break;
    }
  }
  return modifier / claimIds.length;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
