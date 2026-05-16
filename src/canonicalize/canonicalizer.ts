import { ResearchArtifact, Claim, Evidence, AuthorityLink, ContradictionEdge, CanonicalGraph } from '../types';
import { extractClaims } from './claim-extractor';
import { linkEvidence, buildAuthorityLinks } from './evidence-linker';
import { detectContradictions } from '../analyze/contradiction-detect';

export function canonicalize(artifacts: ResearchArtifact[]): CanonicalGraph {
  const claims = new Map<string, Claim>();
  const evidence = new Map<string, Evidence>();
  const authorityLinks = new Map<string, AuthorityLink>();
  const contradictions = new Map<string, ContradictionEdge>();
  const artifactIndex = new Map<string, string[]>();

  const allClaims: Claim[] = [];

  for (const artifact of artifacts) {
    const artifactClaims = extractClaims(artifact);
    const artifactEvidence = linkEvidence(artifact, artifactClaims);

    const claimIds: string[] = [];
    for (const claim of artifactClaims) {
      claims.set(claim.id, claim);
      allClaims.push(claim);
      claimIds.push(claim.id);
    }
    artifactIndex.set(artifact.id, claimIds);

    for (const ev of artifactEvidence) {
      evidence.set(ev.id, ev);
    }
  }

  const authLinks = buildAuthorityLinks(artifacts);
  for (const link of authLinks) {
    authorityLinks.set(link.id, link);
  }

  const contradictionEdges = detectContradictions(allClaims);
  for (const edge of contradictionEdges) {
    contradictions.set(edge.id, edge);
  }

  return { claims, evidence, authorityLinks, contradictions, artifactIndex };
}
