import * as crypto from 'crypto';
import { ResearchArtifact } from '../types';

export function parsePaper(raw: any): ResearchArtifact {
  const id = raw.id || `paper-${crypto.createHash('sha256').update((raw.url || '') + (raw.source || '')).digest('hex').slice(0, 16)}`;
  return {
    id,
    source: raw.source || 'arxiv',
    title: raw.title || 'Untitled',
    authors: Array.isArray(raw.authors) ? raw.authors.filter((a: any) => typeof a === 'string') : [],
    url: raw.url || '',
    abstract: raw.abstract || '',
    claims: raw.claims || [],
    codeLinks: Array.isArray(raw.codeLinks) ? raw.codeLinks.filter((l: any) => typeof l === 'string') : [],
    citations: typeof raw.citations === 'number' ? raw.citations : 0,
    topics: Array.isArray(raw.topics) ? raw.topics.filter((t: any) => typeof t === 'string') : [],
    evidenceLevel: raw.evidenceLevel || 'preprint',
    license: raw.license || '',
    discoveredAt: new Date().toISOString(),
  };
}