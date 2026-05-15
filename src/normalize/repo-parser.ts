import { ResearchArtifact } from '../types';

/**
 * Parse raw GitHub API responses into canonical ResearchArtifact objects.
 */
export function parseRepo(raw: any): ResearchArtifact {
  // TODO: Implement full parsing logic
  return {
    id: `repo-${raw.id || Date.now()}`,
    source: 'github',
    title: raw.full_name || 'Untitled',
    authors: raw.owner ? [raw.owner.login] : [],
    url: raw.html_url || '',
    abstract: raw.description || '',
    claims: [],
    codeLinks: [raw.html_url],
    citations: raw.stargazers_count || 0,
    topics: raw.topics || [],
    evidenceLevel: 'production',
    license: raw.license?.spdx_id || '',
    discoveredAt: new Date().toISOString(),
  };
}
