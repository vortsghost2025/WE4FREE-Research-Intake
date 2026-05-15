import { ResearchArtifact } from '../types';

/**
 * Calculate authority score based on citations, source, and evidence level.
 * Phase 1: Simple heuristic. Phase 2: PageRank on citation graph.
 */
export function calculateAuthorityScore(artifact: ResearchArtifact): number {
  let score = 0;
  score += Math.min(artifact.citations / 50, 0.5);
  if (artifact.evidenceLevel === 'peer-reviewed') score += 0.3;
  else if (artifact.evidenceLevel === 'production') score += 0.2;
  else if (artifact.evidenceLevel === 'preprint') score += 0.1;
  return Math.min(score, 1);
}
