import { ResearchArtifact } from '../types';
import { parsePaper } from '../normalize/paper-parser';

const S2_API = 'https://api.semanticscholar.org/graph/v1/paper/search';

export async function fetchSemanticScholar(topics: string[]): Promise<ResearchArtifact[]> {
  console.log(`[ingest:semantic-scholar] Fetching papers for topics: ${topics.join(', ')}`);
  const allArtifacts: ResearchArtifact[] = [];
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const fields = 'paperId,title,authors,abstract,url,openAccessPdf,citationCount,publicationTypes,fieldsOfStudy';

  for (const topic of topics) {
    const query = encodeURIComponent(topic);
    const url = `${S2_API}?query=${query}&limit=10&fields=${fields}`;

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        console.error(`[ingest:semantic-scholar] HTTP ${res.status} for topic "${topic}"`);
        continue;
      }

      const data = (await res.json()) as { data: any[]; total: number };
      const papers = data.data || [];

      for (const paper of papers) {
        const authors = paper.authors?.map((a: any) => a.name).filter(Boolean) || [];
        const topics = paper.fieldsOfStudy || [];

        const artifact = parsePaper({
          id: paper.paperId,
          title: paper.title || 'Untitled',
          authors,
          url: paper.url || '',
          abstract: paper.abstract || '',
          codeLinks: paper.openAccessPdf?.url ? [paper.openAccessPdf.url] : [],
          citations: paper.citationCount || 0,
          topics: [...topics, topic],
          license: '',
          source: 'semantic-scholar',
          evidenceLevel: paper.publicationTypes?.includes('JournalArticle') ? 'peer-reviewed' : 'preprint',
        });
        allArtifacts.push(artifact);
      }

      console.log(`[ingest:semantic-scholar] Found ${papers.length} papers for "${topic}"`);
    } catch (err: any) {
      console.error(`[ingest:semantic-scholar] Fetch failed for "${topic}": ${err.message}`);
    }
  }

  return allArtifacts;
}
