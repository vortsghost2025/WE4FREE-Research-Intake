import { ResearchArtifact } from '../types';
import { parsePaper } from '../normalize/paper-parser';

const ARXIV_API = 'https://export.arxiv.org/api/query';

export async function fetchArxiv(topics: string[]): Promise<ResearchArtifact[]> {
  console.log(`[ingest:arxiv] Fetching papers for topics: ${topics.join(', ')}`);
  const allArtifacts: ResearchArtifact[] = [];

  for (const topic of topics) {
    const query = encodeURIComponent(topic);
    const url = `${ARXIV_API}?search_query=all:${query}&start=0&max_results=10&sortBy=submittedDate&sortOrder=descending`;

    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/atom+xml' },
      });
      if (!res.ok) {
        console.error(`[ingest:arxiv] HTTP ${res.status} for topic "${topic}"`);
        continue;
      }

      const xml = await res.text();
      const entries = parseArxivEntries(xml);

      for (const entry of entries) {
        const artifact = parsePaper({
          title: entry.title,
          authors: entry.authors,
          url: entry.id,
          abstract: entry.summary,
          codeLinks: entry.links.filter(l => l.type === 'application/pdf').map(l => l.href),
          citations: 0,
          topics: [topic],
          license: 'arXiv-1.0',
          source: 'arxiv',
          evidenceLevel: 'preprint',
          id: entry.id,
        });
        allArtifacts.push(artifact);
      }

      console.log(`[ingest:arxiv] Found ${entries.length} papers for "${topic}"`);
    } catch (err: any) {
      console.error(`[ingest:arxiv] Fetch failed for "${topic}": ${err.message}`);
    }
  }

  return allArtifacts;
}

interface ArxivEntry {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  links: { href: string; type: string }[];
  published: string;
}

function parseArxivEntries(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(xml)) !== null) {
    const block = match[1];

    const id = extractTag(block, 'id') || '';
    const title = cleanWhitespace(extractTag(block, 'title') || 'Untitled');
    const summary = cleanWhitespace(extractTag(block, 'summary') || '');
    const published = extractTag(block, 'published') || '';

    const authors: string[] = [];
    const authorRegex = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRegex.exec(block)) !== null) {
      authors.push(authorMatch[1].trim());
    }

    const links: { href: string; type: string }[] = [];
    const linkRegex = /<link\s+([^>]*)\/>/g;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(block)) !== null) {
      const attrs = linkMatch[1];
      const href = extractAttr(attrs, 'href') || '';
      const type = extractAttr(attrs, 'type') || '';
      if (href) links.push({ href, type });
    }

    entries.push({ id, title, authors, summary, links, published });
  }

  return entries;
}

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractAttr(attrs: string, name: string): string | null {
  const regex = new RegExp(`${name}="([^"]*)"`, 'i');
  const match = attrs.match(regex);
  return match ? match[1] : null;
}

function cleanWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

