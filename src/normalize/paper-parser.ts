import { ResearchArtifact } from '../types';

/**
 * Parse raw paper API responses into canonical ResearchArtifact objects.
 */
export function parsePaper(raw: any): ResearchArtifact {
  // TODO: Implement full parsing logic
  return {
    id: `paper-${Date.now()}`,
    source: 'arxiv',
    title: raw.title || 'Untitled',
    authors: raw.authors || [],
    url: raw.url || '',
    abstract: raw.abstract || '',
    claims: [],
    codeLinks: raw.codeLinks || [],
    citations: raw.citations || 0,
    topics: raw.topics || [],
    evidenceLevel: 'preprint',
    license: raw.license || '',
    discoveredAt: new Date().toISOString(),
  };
}
