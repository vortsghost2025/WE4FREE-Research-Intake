import * as crypto from 'crypto';
import { ResearchArtifact, Claim } from '../types';

const SENTENCE_SPLIT = /[.!?]+\s+/g;

const HEDGING = new Set([
  'may', 'might', 'could', 'suggests', 'indicates', 'appears',
  'likely', 'possibly', 'potentially', 'seems', 'proposed',
  'hypothesized', 'speculated', 'conjectured', 'estimated',
]);

const CLAIM_INDICATORS = [
  /we (show|demonstrate|prove|find|observe|present|propose|introduce|develop)/i,
  /this (paper|work|study|method|approach|system) (shows|demonstrates|proves|achieves|enables|provides|improves)/i,
  /results? (show|indicate|demonstrate|suggest|confirm|reveal)/i,
  /our (method|approach|system|framework|model) (outperforms|achieves|improves|reduces|increases)/i,
  /significantly (better|worse|faster|slower|higher|lower|improved|reduced)/i,
  /outperforms? (the|existing|current|prior|previous|baseline|state-of-the-art)/i,
  /improves? (upon|over|by|performance|accuracy|efficiency)/i,
];

function isClaimSentence(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (trimmed.length < 20) return false;
  for (const pattern of CLAIM_INDICATORS) {
    if (pattern.test(trimmed)) return true;
  }
  const words = trimmed.split(/\s+/);
  const hedgeCount = words.filter(w => HEDGING.has(w.toLowerCase())).length;
  if (hedgeCount >= 2 && words.length > 8) return true;
  return false;
}

function inferVeracity(artifact: ResearchArtifact, claimText: string): Claim['veracity'] {
  if (artifact.evidenceLevel === 'peer-reviewed') return 'supported';
  if (artifact.evidenceLevel === 'production') return 'supported';
  if (artifact.evidenceLevel === 'preprint') return 'unverified';
  if (artifact.evidenceLevel === 'experimental') return 'unverified';
  if (/contradict|refute|dispute|challenge/i.test(claimText)) return 'disputed';
  return 'unverified';
}

function inferConfidence(artifact: ResearchArtifact, claimText: string): number {
  let conf = 0.5;
  if (artifact.evidenceLevel === 'peer-reviewed') conf += 0.3;
  else if (artifact.evidenceLevel === 'production') conf += 0.2;
  else if (artifact.evidenceLevel === 'preprint') conf += 0.1;
  if (artifact.citations > 50) conf += 0.1;
  if (artifact.citations > 200) conf += 0.1;
  if (/prove|demonstrate|confirm|establish/i.test(claimText)) conf += 0.05;
  if (/may|might|could|suggest/i.test(claimText)) conf -= 0.05;
  return Math.min(Math.max(conf, 0), 1);
}

export function extractClaims(artifact: ResearchArtifact): Claim[] {
  const explicitClaims = artifact.claims || [];
  const sentences = artifact.abstract.split(SENTENCE_SPLIT).filter(Boolean);
  const implicitClaims = sentences.filter(isClaimSentence);

  const allClaimTexts = [...new Set([...explicitClaims, ...implicitClaims])];

  return allClaimTexts.map(text => {
    const id = 'claim-' + crypto
      .createHash('sha256')
      .update(artifact.id + ':' + text)
      .digest('hex')
      .slice(0, 16);

    return {
      id,
      text: text.trim(),
      sourceArtifactId: artifact.id,
      veracity: inferVeracity(artifact, text),
      confidence: inferConfidence(artifact, text),
      topics: artifact.topics,
      createdAt: artifact.discoveredAt,
    } as Claim;
  });
}
