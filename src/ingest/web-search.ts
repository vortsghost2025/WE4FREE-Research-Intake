import { ResearchArtifact } from '../types';

/**
 * Fetch general web search results for configured topics.
 * Phase 1: Placeholder for Phase 2 integration.
 */
export async function fetchWebSearch(topics: string[]): Promise<ResearchArtifact[]> {
  console.log(`[ingest:web-search] Fetching web results for topics: ${topics.join(', ')}`);
  return [];
}
