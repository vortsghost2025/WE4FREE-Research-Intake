import * as crypto from 'crypto';
import { Claim, ContradictionEdge } from '../types';

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

export function detectContradictions(claims: Claim[]): ContradictionEdge[] {
  const edges: ContradictionEdge[] = [];

  const byTopic = new Map<string, Claim[]>();
  for (const claim of claims) {
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
