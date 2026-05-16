import { ResearchArtifact } from '../types';
import { parsePaper } from '../normalize/paper-parser';

const OPENALEX_API = 'https://api.openalex.org/works';

export async function fetchOpenAlex(topics: string[]): Promise<ResearchArtifact[]> {
  console.log(`[ingest:openalex] Fetching works for topics: ${topics.join(', ')}`);
  const allArtifacts: ResearchArtifact[] = [];
  const mailto = process.env.OPENALEX_MAILTO || 'research@we4free.dev';

  for (const topic of topics) {
    const query = encodeURIComponent(topic);
    const url = `${OPENALEX_API}?search=${query}&per_page=10&sort=publication_date:desc&mailto=${mailto}`;

    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) {
        console.error(`[ingest:openalex] HTTP ${res.status} for topic "${topic}"`);
        continue;
      }

      const data = (await res.json()) as { results: any[]; meta: { count: number } };
      const results = data.results || [];

      for (const work of results) {
        const authors = work.authorships?.map((a: any) => a.author?.display_name).filter(Boolean) || [];
        const concepts = work.concepts?.map((c: any) => c.display_name).filter(Boolean) || [];
        const openAccessPdf = work.open_access?.oa_url || '';

        const artifact = parsePaper({
          id: work.id,
          title: work.title || 'Untitled',
          authors,
          url: work.doi || work.id || '',
          abstract: reconstructAbstract(work.abstract_inverted_index),
          codeLinks: openAccessPdf ? [openAccessPdf] : [],
          citations: work.cited_by_count || 0,
          topics: [...concepts.slice(0, 5), topic],
          license: work.open_access?.oa_status || '',
          source: 'openalex',
          evidenceLevel: work.type === 'article' ? 'peer-reviewed' : 'preprint',
        });
        allArtifacts.push(artifact);
      }

      console.log(`[ingest:openalex] Found ${results.length} works for "${topic}"`);
    } catch (err: any) {
      console.error(`[ingest:openalex] Fetch failed for "${topic}": ${err.message}`);
    }
  }

  return allArtifacts;
}

function reconstructAbstract(invertedIndex: Record<string, number[]> | null | undefined): string {
  if (!invertedIndex) return '';

  const wordPositions: { word: string; pos: number }[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      wordPositions.push({ word, pos });
    }
  }

  wordPositions.sort((a, b) => a.pos - b.pos);
  return wordPositions.map(w => w.word).join(' ');
}