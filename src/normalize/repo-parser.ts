import * as crypto from 'crypto';
import { ResearchArtifact } from '../types';

export function parseRepo(raw: any): ResearchArtifact {
  const id = raw.id ? `repo-${raw.id}` : `repo-${crypto.createHash('sha256').update((raw.html_url || '') + 'github').digest('hex').slice(0, 16)}`;
  return {
    id,
    source: 'github',
    title: raw.full_name || raw.name || 'Untitled',
    authors: raw.owner?.login ? [raw.owner.login] : [],
    url: raw.html_url || '',
    abstract: raw.description || '',
    claims: [],
    codeLinks: raw.html_url ? [raw.html_url] : [],
    citations: 0, // Repos have no citation data; stargazers_count is popularity, not citations
    topics: Array.isArray(raw.topics) ? raw.topics.filter((t: any) => typeof t === 'string') : [],
    evidenceLevel: 'production',
    license: raw.license?.spdx_id || '',
    discoveredAt: new Date().toISOString(),
  };
}