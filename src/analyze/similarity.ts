import { ResearchArtifact, RepoManifest, ScoredArtifact } from '../types';

/**
 * Paper Scout weighted composite score (WO-04 scoring upgrade).
 * Five signals, configurable via env on once load.
 *
 * Default weights: keyword=0.30, embedding_proxy=0.30, authority=0.20, community=0.10, recency=0.10
 * Override: SCORE_WEIGHT_KEYWORD, SCORE_WEIGHT_EMBEDDING, SCORE_WEIGHT_AUTHORITY, SCORE_WEIGHT_COMMUNITY, SCORE_WEIGHT_RECENCY
 * Each weight should be 0–1; values outside 0–1 are clamped.
 */
const DEFAULT_WEIGHTS: Record<string, number> = {
  keyword: 0.30,
  embedding: 0.30,
  authority: 0.20,
  community: 0.10,
  recency: 0.10,
};

function getWeight(name: string): number {
  const envKey = `SCORE_WEIGHT_${name.toUpperCase()}`;
  if (!(envKey in process.env)) return 0;   // unset → 0; caller handles normalization/fallback
  const raw = parseFloat(process.env[envKey] || '');
  if (isNaN(raw)) return 0;
  return Math.min(Math.max(raw, 0), 1);
}

function getCompositeWeights(): Record<string, number> {
  const wKeyword = getWeight('keyword');
  const wEmbedding = getWeight('embedding');
  const wAuthority = getWeight('authority');
  const wCommunity = getWeight('community');
  const wRecency = getWeight('recency');
  const total = wKeyword + wEmbedding + wAuthority + wCommunity + wRecency;
  if (total === 0) {
    return { keyword: 0.2, embedding: 0.2, authority: 0.2, community: 0.2, recency: 0.2 };
  }
  return {
    keyword: wKeyword / total,
    embedding: wEmbedding / total,
    authority: wAuthority / total,
    community: wCommunity / total,
    recency: wRecency / total,
  };
}

/**
 * Compute similarity/score between artifacts and manifests.
 * Wrapped on the Paper Scout 5-signal composite formula (WO-04).
 */
export function computeSimilarity(
  artifacts: ResearchArtifact[],
  manifests: RepoManifest[]
): ScoredArtifact[] {
  const weights = getCompositeWeights();

  return artifacts.map(artifact => {
    let bestLane = 'unknown';
    let bestScore = 0;

    for (const manifest of manifests) {
      const basicOverlap = countKeywordOverlap(artifact.topics, manifest.keywords);
      const score = basicOverlap / Math.max(manifest.keywords.length, 1);
      if (score > bestScore) {
        bestScore = score;
        bestLane = manifest.lane;
      }
    }

    // ── Paper Scout 5-signal composite ──────────────────────────────────────
    const keywordScore      = computeKeywordScore(artifact, manifests, bestLane);
    const embeddingProxy    = computeEmbeddingProxy(artifact);
    const authoritySignal   = computeAuthority(artifact);
    const communityActivity = computeCommunityActivity(artifact);
    const recencySignal     = computeRecencySignal(artifact.discoveredAt);

    const compositeScore =
      weights.keyword      * keywordScore +
      weights.embedding    * embeddingProxy +
      weights.authority    * authoritySignal +
      weights.community    * communityActivity +
      weights.recency      * recencySignal;

    // ── Sub-signals preserved fordownstream / debugging ──────────────────────
    const noveltyScore     = computeNovelty(artifact);
    const riskScore        = computeRisk(artifact);

    return {
      artifact,
      relevanceScore: bestScore,          // kept for backward-compat
      authorityScore: authoritySignal,
      noveltyScore,
      riskScore,
      communityActivity,                  // WO-04
      recency: recencySignal,             // WO-04
      compositeScore,                     // WO-04: Paper Scout 5-signal
      implementationCost: 'medium',
      laneTarget: bestLane as ScoredArtifact['laneTarget'],
      recommendedAction: bestScore > 0.3 ? 'review' : 'monitor',
    };
  });
}

// ── Paper Scout individual signals ───────────────────────────────────────────

/**
 * keywordScore — overlap-normalized topic match against lane manifests.
 * Distributes signal across all lane manifest keyword sets by weight.
 */
function computeKeywordScore(
  artifact: ResearchArtifact,
  manifests: RepoManifest[],
  bestLane: string
): number {
  if (manifests.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;
  for (const manifest of manifests) {
    const overlap = countKeywordOverlap(artifact.topics, manifest.keywords);
    const score = overlap / Math.max(manifest.keywords.length, 1);
    const laneBonus = manifest.lane === bestLane ? 2.0 : 1.0;
    weightedSum += score * laneBonus;
    totalWeight += laneBonus;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * embeddingProxy — normalised abstract density; proxy for embedding similarity.
 * Uses abstract length normalised against a 3000-char conference paper target,
 * scaled by unique keywords (treats the unique-word count as a content-complexity proxy).
 */
function computeEmbeddingProxy(artifact: ResearchArtifact): number {
  const abstract = artifact.abstract || '';
  const absLen = abstract.length;
  const uniqueTokens = new Set(abstract.toLowerCase().split(/\s+/).filter(Boolean));
  const density = uniqueTokens.size / Math.max(absLen / 100, 1);
  const lenScore = Math.min(absLen / 3000, 1.0);
  return Math.min(lenScore * 0.6 + Math.min(density, 1) * 0.4, 1);
}

/**
 * communityActivity — proxy for community attention to the artifact.
 * Combines: citation velocity (clamped), topic breadth, and topics-weighted citation density.
 */
function computeCommunityActivity(artifact: ResearchArtifact): number {
  const citations = artifact.citations || 0;
  const topicCount = artifact.topics?.length || 1;
  const topicBonus = Math.min(topicCount * 0.05, 0.5);

  // Exponential scaling: overtakes linear at ~40 citations
  const citationSignal = citations < 40
    ? citations / 80
    : 0.5 + 0.5 * Math.min(1, Math.log10(citations) / Math.log10(200));

  const activity = Math.min(citationSignal * 0.7 + topicBonus, 1);
  return activity;
}

/**
 * recencySignal — independent of noveltyScore; decays as a power function.
 * noveltyScore adds a bonus for new/low-cited work; this is a neutral recency position signal.
 */
function computeRecencySignal(discoveredAt: string): number {
  try {
    const ageMs = Date.now() - new Date(discoveredAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    // Decay: 1.0 at 0d → 0.5 at 30d → 0.2 at 90d → 0.05 at 365d
    if (ageDays < 30)  return 1.0 - 0.5 * (ageDays / 30);
    if (ageDays < 90)  return 0.5 - 0.3 * ((ageDays - 30) / 60);
    if (ageDays < 365) return 0.2 - 0.15 * ((ageDays - 90) / 275);
    return 0.05;
  } catch { return 0; }
}

// ── Existing helpers (unchanged) ─────────────────────────────────────────────

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
  } catch { return 0; }
}
