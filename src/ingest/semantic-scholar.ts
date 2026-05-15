import { ResearchArtifact } from '../types';

/**
 * Fetch Semantic Scholar papers for configured topics.
 * Phase 1: Placeholder for Phase 2 integration.
 */
export async function fetchSemanticScholar(topics: string[]): Promise<ResearchArtifact[]> {
  console.log(`[ingest:semantic-scholar] Fetching papers for topics: ${topics.join(', ')}`);
  return [];
}
