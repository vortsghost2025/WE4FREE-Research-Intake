import { CanonicalGraph, Claim, Evidence, ContradictionEdge, AuthorityLink } from '../types';

export function findRelatedClaims(graph: CanonicalGraph, claimId: string): Claim[] {
  const related: Claim[] = [];
  const artifactId = graph.claims.get(claimId)?.sourceArtifactId;
  if (!artifactId) return related;

  const claimIds = graph.artifactIndex.get(artifactId) || [];
  for (const id of claimIds) {
    if (id !== claimId) {
      const c = graph.claims.get(id);
      if (c) related.push(c);
    }
  }

  for (const [, link] of graph.authorityLinks) {
    let linkedArtifactId: string | null = null;
    if (link.fromArtifactId === artifactId) linkedArtifactId = link.toArtifactId;
    else if (link.toArtifactId === artifactId) linkedArtifactId = link.fromArtifactId;

    if (linkedArtifactId) {
      const ids = graph.artifactIndex.get(linkedArtifactId) || [];
      for (const id of ids) {
        const c = graph.claims.get(id);
        if (c && c.id !== claimId && !related.some(r => r.id === c.id)) {
          related.push(c);
        }
      }
    }
  }

  return related;
}

export function findContradictions(graph: CanonicalGraph, claimId?: string): ContradictionEdge[] {
  if (claimId) {
    return [...graph.contradictions.values()].filter(
      e => e.claimAId === claimId || e.claimBId === claimId
    );
  }
  return [...graph.contradictions.values()];
}

export function findAuthorityChain(graph: CanonicalGraph, artifactId: string, depth: number = 3): AuthorityLink[] {
  const visited = new Set<string>();
  const result: AuthorityLink[] = [];
  const queue: string[] = [artifactId];

  let currentDepth = 0;
  while (queue.length > 0 && currentDepth < depth) {
    const size = queue.length;
    for (let i = 0; i < size; i++) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const [, link] of graph.authorityLinks) {
        if (link.fromArtifactId === current && !visited.has(link.toArtifactId)) {
          result.push(link);
          queue.push(link.toArtifactId);
        } else if (link.toArtifactId === current && !visited.has(link.fromArtifactId)) {
          result.push(link);
          queue.push(link.fromArtifactId);
        }
      }
    }
    currentDepth++;
  }

  return result;
}

export function findUnresolved(graph: CanonicalGraph): Claim[] {
  const contradictedClaimIds = new Set<string>();
  for (const [, edge] of graph.contradictions) {
    contradictedClaimIds.add(edge.claimAId);
    contradictedClaimIds.add(edge.claimBId);
  }

  return [...graph.claims.values()].filter(
    c => c.veracity === 'unverified' && !contradictedClaimIds.has(c.id)
  );
}

export function findEvidenceForClaim(graph: CanonicalGraph, claimId: string): Evidence[] {
  return [...graph.evidence.values()].filter(e => e.claimId === claimId);
}

export function getStats(graph: CanonicalGraph): Record<string, number> {
  return {
    claims: graph.claims.size,
    evidence: graph.evidence.size,
    authorityLinks: graph.authorityLinks.size,
    contradictions: graph.contradictions.size,
    artifacts: graph.artifactIndex.size,
  };
}
