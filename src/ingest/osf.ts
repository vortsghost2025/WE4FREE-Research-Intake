import { ResearchArtifact } from '../types';

/**
 * Fetch OSF datasets/preprints for configured topics.
 * Phase 1: Uses OSF API v2.
 */
export async function fetchOsf(topics: string[]): Promise<ResearchArtifact[]> {
  // TODO: Implement OSF API client
  console.log(`[ingest:osf] Fetching datasets for topics: ${topics.join(', ')}`);
  return [];
}

export function normalizeOsf(raw: any): Partial<ResearchArtifact> {
  return {
    source: 'osf',
    evidenceLevel: 'peer-reviewed',
  };
}
