import { ResearchArtifact } from '../types';

/**
 * Fetch relevant GitHub repos/releases for configured topics.
 * Phase 1: Uses GitHub REST API. GITHUB_TOKEN env var recommended.
 */
export async function fetchGithub(topics: string[]): Promise<ResearchArtifact[]> {
  // TODO: Implement GitHub search API client
  console.log(`[ingest:github] Fetching repos for topics: ${topics.join(', ')}`);
  return [];
}

export function normalizeGithub(raw: any): Partial<ResearchArtifact> {
  return {
    source: 'github',
    evidenceLevel: 'production',
  };
}
