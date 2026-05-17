import * as crypto from 'crypto';
import { Claim, ContradictionEdge, ContradictionEdge as CE } from '../types';

// ── Existing rule-based detection helpers (preserved) ──────────────────────

const ANTAGONIST_PAIRS: [RegExp, RegExp, string][] = [
  [/improves?/i, /degrades?|worsens?|deteriorates?/i, 'opposing improvement direction'],
  [/increases?|raises?|elevates?/i, /decreases?|reduces?|lowers?|diminishes?/i, 'opposing magnitude direction'],
  [/outperforms?/i, /underperforms?|inferior|worse than/i, 'opposing performance comparison'],
  [/faster|speeds? up|accelerat/i, /slower|slows? down|decelerat/i, 'opposing speed direction'],
  [/higher|superior|greater/i, /lower|inferior|lesser/i, 'opposing quality comparison'],
  [/supports?|validates?|confirms?/i, /contradicts?|refutes?|disputes?|challenges?/i, 'support vs contradiction'],
  [/enables?|facilitates?|allows?/i, /prevents?|blocks?|inhibits?|hinders?/i, 'enable vs inhibit'],
  [/stable|robust|reliable/i, /unstable|fragile|unreliable|brittle/i, 'stability opposition'],
  [/simplif|reduces? complexity/i, /complicat|increases? complexity/i, 'complexity opposition'],
  [/converges?/i, /diverges?/i, 'convergence opposition'],
  [/generaliz/i, /overfits?|memoriz/i, 'generalization opposition'],
  [/scal/i, /does not scale|unscalable/i, 'scalability opposition'],
];

const SHARED_TOPIC_MIN = 1;

// ── Sparse embedding layer ───────────────────────────────────────────────────

const DEFAULT_K = 5;

// Tokenise a claim text into lowercase concept tokens.
function tokenizeClaim(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

// Build an inverse-document-frequency map from the full corpus.
function buildIdf(corpus: string[][]): Map<string, number> {
  const idf = new Map<string, number>();
  const n = corpus.length;
  for (const tokens of corpus) {
    const seen = new Set(tokens);
    for (const t of seen) {
      idf.set(t, (idf.get(t) ?? 0) + 1);
    }
  }
  for (const [t, df] of idf) {
    idf.set(t, Math.log(n / (df + 1) + 1));
  }
  return idf;
}

// Compute Hoyer sparsity for a sparse vector: sqrt(n)
// - uniformly distributed across axes → sparsity = 1/sqrt(n) (dense)
// - concentrated on few nonzeros → approaches 1 (sparse)
function hoyerSparsity(vec: Map<string, number>): number {
  const n = vec.size;
  if (n <= 1) return 0;
  const values = [...vec.values()];
  const s1 = values.reduce((a, b) => a + Math.abs(b), 0);
  const s2 = values.reduce((a, b) => a + b * b, 0);
  if (s1 === 0) return 0;
  return (Math.sqrt(n) - s1 / Math.sqrt(s2)) / (Math.sqrt(n) - 1);
}

// sparsityPenalty  — harmonic mean sparsity × sparsity on both embeddings
// High penalty means embeddings share tokens across many axes (compensates for this degeneracy)
// Low penalty means distinct, non-overlapping tokens.
function sparsityPenalty(sA: number, sB: number): number {
  const denom = sA + sB;
  if (denom === 0) return 0;
  return (2 * sA * sB) / denom;
}

function dotSparse(a: Map<string, number>, b: Map<string, number>): number {
  let sum = 0;
  for (const [k, va] of a) {
    const vb = b.get(k);
    if (vb !== undefined) sum += va * vb;
  }
  return sum;
}

function normSparse(v: Map<string, number>): number {
  return Math.sqrt([...v.values()].reduce((a, b) => a + b * b, 0));
}

// Build a shared IDF map across any number of claim token lists.
function buildSharedIdf(corpusTokens: string[][]): Map<string, number> {
  return buildIdf(corpusTokens);
}

// Build a sparse embedding vector for a single claim using shared-IDF weighting.
function sparseEmbed(
  tokens: string[],
  idf: Map<string, number>
): Map<string, number> {
  const vec: Map<string, number> = new Map();
  // Count term frequency
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  // Multiply by IDF and normalise against the max TF-IDF possible
  const maxTf = Math.max(...tf.values(), 0);
  const maxIdf = Math.max(...idf.values(), 0);
  const maxTfidf = Math.max(maxTf * maxIdf, 1);
  for (const [t, freq] of tf) {
    const weight = (freq * (idf.get(t) ?? 0)) / Math.max(maxTfidf, 1e-9);
    vec.set(t, weight);
  }
  return vec;
}

// Cosine similarity for two sparse vectors
function sparseCosine(a: Map<string, number>, b: Map<string, number>): number {
  const na = normSparse(a);
  const nb = normSparse(b);
  if (na === 0 || nb === 0) return 0;
  return dotSparse(a, b) / (na * nb);
}

// computeSparseSim: weighted cosine × degeneracy-adjusted penalty
export function computeSparseSim(
  embA: Map<string, number>,
  embB: Map<string, number>
): number {
  const cosine = sparseCosine(embA, embB);
  const sA = hoyerSparsity(embA);
  const sB = hoyerSparsity(embB);
  const penalty = sparsityPenalty(sA, sB);
  // Similarity × (1 − penalty) — penalty reduces similarity when degeneration is high
  return cosine * Math.max(1 - penalty, 0);
}

// Signature-level fuzzy-similarity for the scoring overlap step
export function tokenOverlapRatio(textA: string, textB: string): number {
  const tokensA = new Set(tokenizeClaim(textA));
  const tokensB = new Set(tokenizeClaim(textB));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  return intersection / Math.min(tokensA.size, tokensB.size);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * findContradictions — detect contradicting/opposing claim pairs.
 *
 * Hybrid: apply top-K sparse-retrieval candidates first; for each candidate apply
 * the rule-based ANTAGONIST_PAIRS filter; fall back to O(n²) full scan for smaller
 * graphs (n < 50 claims).
 *
 * @param graph  canonical graph (claims authorityMap)
 * @param claimId optional single-claim filter — returns contradictions where
 *                claimAId or claimBId matches when set
 * @return top-K most-contradictory ContradictionEdge[] for the graph or claimId filter
 */
export function findContradictions(
  graph: { claims: Map<string, Claim> },
  claimId?: string
): ContradictionEdge[] {
  const claims = [...graph.claims.values()];

  if (claims.length < SHARED_TOPIC_MIN) return [];

  // Filter to single-claim scope when claimId is provided
  const scope = claimId
    ? claims.filter(c => c.id === claimId || c.sourceArtifactId === graph.claims.get(claimId)?.sourceArtifactId)
    : claims;

  if (scope.length < 2) return [];

  // Fall back to O(n²) bucket-based scan for smaller graphs
  if (scope.length < 50) {
    return detectContradictions(claims, claimId);
  }

  return findTopKContradictions(scope, claimId, DEFAULT_K);
}

/**
 * detectContradictions — original O(n²) bucket-based algorithm.
 * Preserved as fallback for n < 50 claims.
 */
export function detectContradictions(
  claims: Claim[],
  claimId?: string
): ContradictionEdge[] {
  const allClaims = claimId
    ? claims.filter(c => c.id === claimId)
    : claims;

  const edges: ContradictionEdge[] = [];

  const byTopic = new Map<string, Claim[]>();
  for (const claim of allClaims) {
    for (const topic of claim.topics) {
      const key = topic.toLowerCase();
      let bucket = byTopic.get(key);
      if (!bucket) { bucket = []; byTopic.set(key, bucket); }
      bucket.push(claim);
    }
  }

  const seen = new Set<string>();
  for (const bucket of byTopic.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const pairKey = bucket[i].id < bucket[j].id
          ? `${bucket[i].id}:${bucket[j].id}`
          : `${bucket[j].id}:${bucket[i].id}`;
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);
        const edge = detectPair(bucket[i], bucket[j]);
        if (edge) edges.push(edge);
      }
    }
  }

  return edges;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function topicOverlap(a: Claim, b: Claim): number {
  const setA = new Set(a.topics.map(t => t.toLowerCase()));
  return b.topics.filter(t => setA.has(t.toLowerCase())).length;
}

function detectPair(a: Claim, b: Claim): ContradictionEdge | null {
  if (topicOverlap(a, b) < SHARED_TOPIC_MIN) return null;
  if (a.sourceArtifactId === b.sourceArtifactId) return null;

  for (const [posRe, negRe, reason] of ANTAGONIST_PAIRS) {
    const aPos = posRe.test(a.text);
    const aNeg = negRe.test(a.text);
    const bPos = posRe.test(b.text);
    const bNeg = negRe.test(b.text);

    if ((aPos && bNeg) || (aNeg && bPos)) {
      const strength = Math.min(a.confidence, b.confidence);
      return {
        id: 'contra-' + crypto
          .createHash('sha256')
          .update(`${a.id}:${b.id}:${reason}`)
          .digest('hex')
          .slice(0, 16),
        claimAId: a.id,
        claimBId: b.id,
        strength,
        reason,
        detectedAt: new Date().toISOString(),
      };
    }
  }

  return null;
}

// ── Sparse retrieval ─────────────────────────────────────────────────────────

interface ScoredPair {
  claimA: Claim;
  claimB: Claim;
  score: number;
}

function findTopKContradictions(
  scope: Claim[],
  claimId?: string,
  k: number = DEFAULT_K
): ContradictionEdge[] {
  // 1. Build shared-IDF sparse embeddings
  const corporaTokens: string[][] = scope.map(c => tokenizeClaim(c.text));
  const idf = buildSharedIdf(corporaTokens);
  const embeddings = scope.map(c => ({ claim: c, emb: sparseEmbed(tokenizeClaim(c.text), idf) }));

  // 2. Compute sparse similarity for all pairs (O(n²) — still required for dense similarity,
  //    but we abort early after selecting top-K rated candidates)
  const candidates: ScoredPair[] = [];
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      if (claimId && embeddings[i].claim.id !== claimId && embeddings[j].claim.id !== claimId) continue;
      // Rate pairs by sparse similarity first — only claim pairs with high content similarity
      // are worth the rule-based antagonist test.
      const sparseSim = computeSparseSim(embeddings[i].emb, embeddings[j].emb);
      if (sparseSim < 0.05) continue; // too dissimilar to be contradictory
      candidates.push({ claimA: embeddings[i].claim, claimB: embeddings[j].claim, score: sparseSim });
    }
  }

  // 3. Select the claim pairs most likely to contain contradiction
  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, k * 4);

  // 4. Apply the ANTAGONIST_PAIRS rule-based filter to the top candidates
  const edges: ContradictionEdge[] = [];
  for (const { claimA, claimB, score } of topCandidates) {
    if (edges.length >= k) break;
    const edge = detectPair(claimA, claimB);
    if (edge) {
      // nudge strength slightly by sparse-similarity signal
      edge.strength = Math.min(edge.strength * (0.7 + 0.3 * score), 1);
      edges.push(edge);
    }
  }

  return edges;
}
