import { ResearchArtifact } from '../types';
import { parseRepo } from '../normalize/repo-parser';

const GITHUB_SEARCH_API = 'https://api.github.com/search/repositories';

export async function fetchGithub(topics: string[]): Promise<ResearchArtifact[]> {
  console.log(`[ingest:github] Fetching repos for topics: ${topics.join(', ')}`);
  const allArtifacts: ResearchArtifact[] = [];
  const token = process.env.GITHUB_TOKEN;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  for (const topic of topics) {
    const query = encodeURIComponent(`${topic} sort:updated`);
    const url = `${GITHUB_SEARCH_API}?q=${query}&per_page=10`;

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error(`[ingest:github] HTTP ${res.status} for topic "${topic}"`);
        continue;
      }

      const data = (await res.json()) as { items: any[]; total_count: number };
      const items = data.items || [];

      for (const item of items) {
        const artifact = parseRepo(item);
        if (!artifact.topics.includes(topic)) {
          artifact.topics.push(topic);
        }
        allArtifacts.push(artifact);
      }

      console.log(`[ingest:github] Found ${items.length} repos for "${topic}"`);
    } catch (err: any) {
      console.error(`[ingest:github] Fetch failed for "${topic}": ${err.message}`);
    }
  }

  return allArtifacts;
}

