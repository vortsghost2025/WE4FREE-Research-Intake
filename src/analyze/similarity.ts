import { ResearchArtifact, RepoManifest, ScoredArtifact } from '../types';

/**
 * Compute similarity between artifacts and local repo manifests.
 * Phase 1: Keyword overlap heuristic. Phase 2: Embeddings.
 */
export function computeSimilarity(
  artifacts: ResearchArtifact[],
  manifests: RepoManifest[]
): ScoredArtifact[] {
  return artifacts.map(artifact => {
    let bestLane = 'unknown';
    let bestScore = 0;

    for (const manifest of manifests) {
      const overlap = countKeywordOverlap(artifact.topics, manifest.keywords);
      const score = overlap / Math.max(manifest.keywords.length, 1);
      if (score > bestScore) {
        bestScore = score;
        bestLane = manifest.lane;
      }
    }

    return {
      artifact,
      relevanceScore: bestScore,
      authorityScore: computeAuthority(artifact),
      noveltyScore: computeNovelty(artifact),
      riskScore: computeRisk(artifact),
      implementationCost: 'medium',
      laneTarget: bestLane as ScoredArtifact['laneTarget'],
      recommendedAction: bestScore > 0.3 ? 'review' : 'monitor',
    };
  });
}

function countKeywordOverlap(a: string[], b: string[]): number {
  const setB = new Set(b.map(k => k.toLowerCase()));
  return a.filter(k => setB.has(k.toLowerCase())).length;
}

function computeAuthority(artifact: ResearchArtifact): number {
  // Heuristic: citations + evidence level
  const citationScore = Math.min(artifact.citations / 100, 1);
  const levelBonus = artifact.evidenceLevel === 'peer-reviewed' ? 0.3 :
                     artifact.evidenceLevel === 'production' ? 0.2 : 0;
  return Math.min(citationScore + levelBonus, 1);
}

function computeRisk(artifact: ResearchArtifact): number {
  let risk = 0.3;
  if (artifact.evidenceLevel === 'preprint' || artifact.evidenceLevel === 'experimental') risk += 0.3;
  if (!artifact.license || artifact.license === '') risk += 0.2;
  return Math.min(risk, 1);
}

function computeNovelty(artifact: ResearchArtifact): number {
  const citationPenalty = Math.min(artifact.citations / 200, 0.5);
  const recencyBonus = computeRecencyBonus(artifact.discoveredAt);
  const novelty = 1.0 - citationPenalty + recencyBonus;
  return Math.min(Math.max(novelty, 0), 1);
}

function computeRecencyBonus(discoveredAt: string): number {
  try {
    const ageMs = Date.now() - new Date(discoveredAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 30) return 0.3;
    if (ageDays < 90) return 0.2;
    if (ageDays < 365) return 0.1;
    return 0;
  } catch {
    return 0;
  }
}
