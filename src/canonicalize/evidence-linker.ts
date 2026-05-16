import * as crypto from 'crypto';
import { ResearchArtifact, Claim, Evidence, AuthorityLink } from '../types';
import { extractCitations } from '../normalize/citation-extractor';

const GITHUB_URL_REGEX = /https?:\/\/github\.com\/[^\s,;)]+/g;
const DOI_PREFIX = 'doi:';

function evidenceType(value: string): Evidence['type'] {
  if (value.startsWith('arxiv:')) return 'citation';
  if (value.startsWith(DOI_PREFIX)) return 'doi';
  if (value.startsWith('http') && /github\.com/.test(value)) return 'code_link';
  if (value.startsWith('http')) return 'url';
  return 'citation';
}

function evidenceWeight(type: Evidence['type'], artifact: ResearchArtifact): number {
  let w = 0.5;
  if (type === 'doi') w = 0.8;
  else if (type === 'peer_review') w = 0.9;
  else if (type === 'code_link') w = 0.6;
  else if (type === 'citation') w = 0.7;
  if (artifact.evidenceLevel === 'peer-reviewed') w += 0.1;
  return Math.min(w, 1);
}

export function linkEvidence(artifact: ResearchArtifact, claims: Claim[]): Evidence[] {
  const text = [artifact.abstract, ...(artifact.claims || [])].join(' ');
  const rawCitations = extractCitations(text);

  const codeLinks = artifact.codeLinks || [];
  const codeCitations = codeLinks.map(link => {
    GITHUB_URL_REGEX.lastIndex = 0;
    if (GITHUB_URL_REGEX.test(link)) return link;
    return `url:${link}`;
  });

  const allEvidenceValues = [...new Set([...rawCitations, ...codeCitations])];

  const evidence: Evidence[] = [];

  for (const claim of claims) {
    for (const value of allEvidenceValues) {
      const type = evidenceType(value);
      const id = 'ev-' + crypto
        .createHash('sha256')
        .update(claim.id + ':' + value)
        .digest('hex')
        .slice(0, 16);

      evidence.push({
        id,
        claimId: claim.id,
        type,
        value,
        sourceArtifactId: artifact.id,
        weight: evidenceWeight(type, artifact),
      });
    }

    if (artifact.evidenceLevel === 'peer-reviewed') {
      const id = 'ev-' + crypto
        .createHash('sha256')
        .update(claim.id + ':peer_review')
        .digest('hex')
        .slice(0, 16);

      evidence.push({
        id,
        claimId: claim.id,
        type: 'peer_review',
        value: `peer-reviewed:${artifact.id}`,
        sourceArtifactId: artifact.id,
        weight: 0.9,
      });
    }
  }

  return evidence;
}

function sharedAuthors(a: ResearchArtifact, b: ResearchArtifact): string[] {
  const setA = new Set(a.authors.map(n => n.toLowerCase().trim()));
  return b.authors.filter(n => setA.has(n.toLowerCase().trim()));
}

function inferGroupOverlap(a: ResearchArtifact, b: ResearchArtifact): boolean {
  const aDomains = new Set(
    a.authors.flatMap(author => {
      const m = author.match(/@([\w.-]+)/);
      return m ? [m[1].toLowerCase()] : [];
    })
  );
  return b.authors.some(author => {
    const m = author.match(/@([\w.-]+)/);
    return m && aDomains.has(m[1].toLowerCase());
  });
}

export function buildAuthorityLinks(artifacts: ResearchArtifact[]): AuthorityLink[] {
  const links: AuthorityLink[] = [];

  for (let i = 0; i < artifacts.length; i++) {
    for (let j = i + 1; j < artifacts.length; j++) {
      const a = artifacts[i];
      const b = artifacts[j];

      const shared = sharedAuthors(a, b);
      if (shared.length > 0) {
        const weight = Math.min(shared.length * 0.3, 1);
        links.push({
          id: 'auth-' + crypto.createHash('sha256').update(`${a.id}:same_author:${b.id}`).digest('hex').slice(0, 16),
          fromArtifactId: a.id,
          toArtifactId: b.id,
          type: 'same_author',
          weight,
        });
      }

      if (inferGroupOverlap(a, b)) {
        links.push({
          id: 'auth-' + crypto.createHash('sha256').update(`${a.id}:same_group:${b.id}`).digest('hex').slice(0, 16),
          fromArtifactId: a.id,
          toArtifactId: b.id,
          type: 'same_group',
          weight: 0.4,
        });
      }

      const aText = [a.abstract, ...a.codeLinks].join(' ');
      const bId = b.url || b.id;
      if (aText.includes(bId) || a.citations > 0 && aText.includes(b.title)) {
        links.push({
          id: 'auth-' + crypto.createHash('sha256').update(`${a.id}:cites:${b.id}`).digest('hex').slice(0, 16),
          fromArtifactId: a.id,
          toArtifactId: b.id,
          type: 'cites',
          weight: 0.7,
        });
        links.push({
          id: 'auth-' + crypto.createHash('sha256').update(`${b.id}:cited_by:${a.id}`).digest('hex').slice(0, 16),
          fromArtifactId: b.id,
          toArtifactId: a.id,
          type: 'cited_by',
          weight: 0.7,
        });
      }
    }
  }

  return links;
}
