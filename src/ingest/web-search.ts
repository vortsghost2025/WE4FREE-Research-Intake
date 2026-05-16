import { ResearchArtifact } from '../types';

const DDG_HTML = 'https://html.duckduckgo.com/html/';

export async function fetchWebSearch(topics: string[]): Promise<ResearchArtifact[]> {
  console.log(`[ingest:web-search] Fetching web results for topics: ${topics.join(', ')}`);
  const allArtifacts: ResearchArtifact[] = [];

  for (const topic of topics) {
    try {
      const body = `q=${encodeURIComponent(topic + ' research paper')}&kl=us-en`;
      const res = await fetch(DDG_HTML, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'WE4FREE-Research-Intake/0.1.0',
        },
        body,
      });

      if (!res.ok) {
        console.error(`[ingest:web-search] HTTP ${res.status} for topic "${topic}"`);
        continue;
      }

      const html = await res.text();
      const results = parseDdgResults(html, topic);
      allArtifacts.push(...results);

      console.log(`[ingest:web-search] Found ${results.length} results for "${topic}"`);
    } catch (err: any) {
      console.error(`[ingest:web-search] Fetch failed for "${topic}": ${err.message}`);
    }
  }

  return allArtifacts;
}

function parseDdgResults(html: string, topic: string): ResearchArtifact[] {
  const results: ResearchArtifact[] = [];
  const resultRegex = /<div class="result__body">([\s\S]*?)<\/div>\s*<\/div>/g;
  let match: RegExpExecArray | null;

  while ((match = resultRegex.exec(html)) !== null) {
    const block = match[1];

    const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/[at]/);
    const hrefMatch = block.match(/class="result__url"[^>]*href="([^"]*)"/);
    const uddgMatch = block.match(/uddg=([^&"]*)/);

    const title = titleMatch ? cleanHtml(titleMatch[1]).trim() : '';
    const snippet = snippetMatch ? cleanHtml(snippetMatch[1]).trim() : '';
    const url = uddgMatch ? decodeURIComponent(uddgMatch[1]) : (hrefMatch ? hrefMatch[1] : '');

    if (!title || !url) continue;

    results.push({
      id: `web-${Buffer.from(url).toString('base64').slice(0, 16)}`,
      source: 'web',
      title,
      authors: [],
      url,
      abstract: snippet,
      claims: [],
      codeLinks: [],
      citations: 0,
      topics: [topic],
      evidenceLevel: 'experimental',
      license: '',
      discoveredAt: new Date().toISOString(),
    });
  }

  return results.slice(0, 10);
}

function cleanHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}
