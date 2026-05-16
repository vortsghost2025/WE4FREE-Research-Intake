import { ResearchArtifact, RepoManifest, CanonicalGraph, LaneTarget } from '../types';

const RESEARCH_LANE_KEYWORDS = [
  'ontology', 'canonicalization', 'claim extraction', 'evidence scoring',
  'contradiction detection', 'knowledge graph', 'semantic graph',
  'provenance', 'trust scoring', 'governance rule',
];

export function routeToLane(
  artifact: ResearchArtifact,
  manifests: RepoManifest[],
  graph: CanonicalGraph
): LaneTarget {
  const keywordScores = computeKeywordScores(artifact, manifests);
  const bestKeyword = bestLane(keywordScores);

  const contradictionRoute = checkContradictionRouting(artifact.id, graph);
  if (contradictionRoute) return contradictionRoute;

  const authorityRoute = checkAuthorityRouting(artifact.id, graph, manifests);
  if (authorityRoute) return authorityRoute;

  const researchRoute = checkResearchLane(artifact);
  if (researchRoute) return 'research';

  return bestKeyword || 'unknown';
}

function computeKeywordScores(
  artifact: ResearchArtifact,
  manifests: RepoManifest[]
): Map<string, number> {
  const scores = new Map<string, number>();
  const artifactTopics = new Set(artifact.topics.map(t => t.toLowerCase()));

  for (const manifest of manifests) {
    const manifestKeywords = new Set(manifest.keywords.map(k => k.toLowerCase()));
    let overlap = 0;
    for (const topic of artifactTopics) {
      if (manifestKeywords.has(topic)) overlap++;
    }
    const score = overlap / Math.max(manifest.keywords.length, 1);
    if (score > 0) {
      scores.set(manifest.lane, score);
    }
  }

  return scores;
}

function bestLane(scores: Map<string, number>): LaneTarget | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const [lane, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = lane;
    }
  }
  return best as LaneTarget | null;
}

function checkContradictionRouting(artifactId: string, graph: CanonicalGraph): LaneTarget | null {
  const claimIds = graph.artifactIndex.get(artifactId) || [];
  for (const claimId of claimIds) {
    for (const [, edge] of graph.contradictions) {
      if (edge.claimAId === claimId || edge.claimBId === claimId) {
        return 'control-plane';
      }
    }
  }
  return null;
}

function checkAuthorityRouting(
  artifactId: string,
  graph: CanonicalGraph,
  manifests: RepoManifest[]
): LaneTarget | null {
  const laneByArtifactId = new Map<string, string>();
  for (const manifest of manifests) {
    laneByArtifactId.set(manifest.name.toLowerCase(), manifest.lane);
  }
  for (const [, link] of graph.authorityLinks) {
    if (link.fromArtifactId === artifactId || link.toArtifactId === artifactId) {
      if (link.weight > 0.5) {
        const peerId = link.fromArtifactId === artifactId
          ? link.toArtifactId
          : link.fromArtifactId;
        const lane = laneByArtifactId.get(peerId.toLowerCase());
        if (lane) return lane as LaneTarget;
      }
    }
  }
  return null;
}

function checkResearchLane(artifact: ResearchArtifact): boolean {
  const topics = new Set(artifact.topics.map(t => t.toLowerCase()));
  const abstractLower = artifact.abstract.toLowerCase();
  for (const kw of RESEARCH_LANE_KEYWORDS) {
    if (topics.has(kw) || abstractLower.includes(kw)) {
      return true;
    }
  }
  return false;
}
