import { ResearchArtifact } from '../types';
import { parsePaper } from '../normalize/paper-parser';

const OSF_API = 'https://api.osf.io/v2';

export async function fetchOsf(topics: string[]): Promise<ResearchArtifact[]> {
  console.log(`[ingest:osf] Fetching datasets for topics: ${topics.join(', ')}`);
  const allArtifacts: ResearchArtifact[] = [];
  const apiKey = process.env.OSF_API_KEY;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.api+json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  for (const topic of topics) {
    const query = encodeURIComponent(topic);
    const url = `${OSF_API}/search/?q=${query}&page[size]=10`;

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error(`[ingest:osf] HTTP ${res.status} for topic "${topic}"`);
        continue;
      }

      const data = (await res.json()) as { data: any[] };
      const items = data.data || [];

      for (const item of items) {
        const attrs = item.attributes || {};
        const links = item.links || {};

        const artifact = parsePaper({
          id: item.id,
          title: attrs.title || 'Untitled',
          authors: attrs.contributors?.map((c: any) => c.embeds?.users?.data?.attributes?.full_name).filter(Boolean) || [],
          url: links.html || links.self || '',
          abstract: attrs.description || '',
          codeLinks: [],
          citations: 0,
          topics: [topic],
          license: attrs.node_license?.name || '',
          source: 'osf',
          evidenceLevel: attrs.date_published ? 'peer-reviewed' : 'preprint',
        });
        allArtifacts.push(artifact);
      }

      console.log(`[ingest:osf] Found ${items.length} items for "${topic}"`);
    } catch (err: any) {
      console.error(`[ingest:osf] Fetch failed for "${topic}": ${err.message}`);
    }
  }

  return allArtifacts;
}

