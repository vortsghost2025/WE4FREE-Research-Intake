import { ResearchArtifact } from '../types';

/**
 * Fetch latest arXiv papers for configured topics.
 * Phase 1: Uses arXiv RSS / API. Requires no key for basic use.
 */
export async function fetchArxiv(topics: string[]): Promise<ResearchArtifact[]> {
  // TODO: Implement arXiv API client
  // For Phase 1 scaffold, return empty array
  console.log(`[ingest:arxiv] Fetching papers for topics: ${topics.join(', ')}`);
  return [];
}

export function normalizeArxiv(raw: any): Partial<ResearchArtifact> {
  return {
    source: 'arxiv',
    evidenceLevel: 'preprint',
    license: 'arXiv-1.0',
  };
}
