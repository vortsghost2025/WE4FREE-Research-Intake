# Phase A — Stable Ingestion

> Make the pipeline produce real output. Currently all 5 ingest adapters return `[]`, normalizers are unwired, `loadRepoManifests()` ignores the actual file, and novelty is hardcoded at 0.5.

## Pre-conditions

- Node 20+ installed (global `fetch` available)
- `GITHUB_TOKEN` in `.env` (optional but recommended for rate limits)
- No new dependencies needed — use native `fetch`, `fs`, `crypto`

## Tasks

### Task 1: Fix `loadRepoManifests()` to read `watched-repos.json`

**File:** `src/analyze/repo-map.ts`

**Why:** Currently returns 5 hardcoded manifests instead of reading the actual JSON file. The file exists at `watched-repos.json` with format `{ repos: RepoManifest[] }`.

**Replace entire file with:**

```typescript
import * as fs from 'fs';
import { RepoManifest } from '../types';

export function loadRepoManifests(reposPath: string): RepoManifest[] {
  console.log(`[analyze:repo-map] Loading repo manifests from ${reposPath}`);
  try {
    const raw = fs.readFileSync(reposPath, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.repos)) {
      console.error('[analyze:repo-map] Invalid format: expected { repos: [...] }');
      return [];
    }
    console.log(`[analyze:repo-map] Loaded ${data.repos.length} manifests`);
    return data.repos;
  } catch (err: any) {
    console.error(`[analyze:repo-map] Failed to load manifests: ${err.message}`);
    return [];
  }
}
```

**Verify:** `npx tsc --noEmit`

---

### Task 2: Implement arXiv API client

**File:** `src/ingest/arxiv.ts`

**Why:** arXiv Atom API at `http://export.arxiv.org/api/query` requires no key. Returns Atom XML. Need to parse `<entry>` elements into `ResearchArtifact` objects.

**Add dependency for XML parsing:** We'll use a lightweight regex-based parser to avoid adding a dependency. The arXiv Atom feed has a predictable structure.

**Replace entire file with:**

```typescript
import { ResearchArtifact } from '../types';
import { parsePaper } from '../normalize/paper-parser';

const ARXIV_API = 'http://export.arxiv.org/api/query';

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

export function normalizeArxiv(raw: any): Partial<ResearchArtifact> {
  return {
    source: 'arxiv',
    evidenceLevel: 'preprint',
    license: 'arXiv-1.0',
  };
}
```

**Verify:** `npx tsc --noEmit`

---

### Task 3: Implement GitHub Search API client

**File:** `src/ingest/github.ts`

**Why:** GitHub REST Search API returns JSON. Use `GITHUB_TOKEN` for rate limits (60 req/hr unauthenticated vs 5000/hr authenticated).

**Replace entire file with:**

```typescript
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

export function normalizeGithub(raw: any): Partial<ResearchArtifact> {
  return {
    source: 'github',
    evidenceLevel: 'production',
  };
}
```

**Verify:** `npx tsc --noEmit`

---

### Task 4: Implement OpenAlex adapter

**File:** `src/ingest/openalex.ts` (NEW)

**Why:** OpenAlex provides open scholarly metadata with no API key required. Using `mailto` parameter puts us in the polite pool (faster responses).

**Create new file:**

```typescript
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
```

**Verify:** `npx tsc --noEmit`

---

### Task 5: Implement Semantic Scholar API client

**File:** `src/ingest/semantic-scholar.ts`

**Why:** Semantic Scholar provides citation-rich metadata. The `SEMANTIC_SCHOLAR_API_KEY` is optional but increases rate limits.

**Replace entire file with:**

```typescript
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
```

**Verify:** `npx tsc --noEmit`

---

### Task 6: Implement basic web search adapter (DuckDuckGo HTML scrape)

**File:** `src/ingest/web-search.ts`

**Why:** No API key needed. DuckDuckGo HTML endpoint provides search results. This is lightweight and avoids adding a search API dependency.

**Replace entire file with:**

```typescript
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
```

**Verify:** `npx tsc --noEmit`

---

### Task 7: Wire normalizers into `parsePaper` and `parseRepo`

**File:** `src/normalize/paper-parser.ts`

**Why:** `parsePaper` currently hardcodes `source: 'arxiv'`. It needs to accept the source from the caller, and handle both arXiv, OpenAlex, and Semantic Scholar inputs.

**Replace entire file with:**

```typescript
import { ResearchArtifact } from '../types';

export function parsePaper(raw: any): ResearchArtifact {
  return {
    id: raw.id || `paper-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: raw.source || 'arxiv',
    title: raw.title || 'Untitled',
    authors: Array.isArray(raw.authors) ? raw.authors.filter((a: any) => typeof a === 'string') : [],
    url: raw.url || '',
    abstract: raw.abstract || '',
    claims: raw.claims || [],
    codeLinks: Array.isArray(raw.codeLinks) ? raw.codeLinks.filter((l: any) => typeof l === 'string') : [],
    citations: typeof raw.citations === 'number' ? raw.citations : 0,
    topics: Array.isArray(raw.topics) ? raw.topics.filter((t: any) => typeof t === 'string') : [],
    evidenceLevel: raw.evidenceLevel || 'preprint',
    license: raw.license || '',
    discoveredAt: new Date().toISOString(),
  };
}
```

**File:** `src/normalize/repo-parser.ts`

**Why:** `parseRepo` works but could be more defensive. Minor hardening.

**Replace entire file with:**

```typescript
import { ResearchArtifact } from '../types';

export function parseRepo(raw: any): ResearchArtifact {
  return {
    id: raw.id ? `repo-${raw.id}` : `repo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: 'github',
    title: raw.full_name || raw.name || 'Untitled',
    authors: raw.owner?.login ? [raw.owner.login] : [],
    url: raw.html_url || '',
    abstract: raw.description || '',
    claims: [],
    codeLinks: raw.html_url ? [raw.html_url] : [],
    citations: typeof raw.stargazers_count === 'number' ? raw.stargazers_count : 0,
    topics: Array.isArray(raw.topics) ? raw.topics.filter((t: any) => typeof t === 'string') : [],
    evidenceLevel: 'production',
    license: raw.license?.spdx_id || '',
    discoveredAt: new Date().toISOString(),
  };
}
```

**Verify:** `npx tsc --noEmit`

---

### Task 8: Wire new adapters into CLI pipeline

**File:** `src/cli/research-intake.ts`

**Why:** Currently only calls `fetchArxiv`, `fetchGithub`, `fetchOsf`. Need to add `fetchOpenAlex`, `fetchSemanticScholar`, `fetchWebSearch` to the pipeline.

**Changes:**

1. Add imports for the 3 new adapters
2. Call them in `runIntake()`
3. Add `'openalex'` to the `ResearchArtifact.source` union type

**Replace the import block (lines 7-16) with:**

```typescript
import { fetchArxiv } from '../ingest/arxiv';
import { fetchGithub } from '../ingest/github';
import { fetchOsf } from '../ingest/osf';
import { fetchOpenAlex } from '../ingest/openalex';
import { fetchSemanticScholar } from '../ingest/semantic-scholar';
import { fetchWebSearch } from '../ingest/web-search';
import { loadRepoManifests } from '../analyze/repo-map';
import { computeSimilarity } from '../analyze/similarity';
import { generateSuggestions } from '../analyze/upgrade-suggestions';
import { writeToQuarantine } from '../output/quarantine';
import { generateBriefing } from '../output/briefing';
import { startDaemon } from '../daemon/scheduler';
import { ResearchArtifact } from '../types';
```

**Replace the ingest block (lines 37-47) with:**

```typescript
  console.log('[phase:ingest] Fetching from sources...');
  const arxivResults = await fetchArxiv(topics);
  const githubResults = await fetchGithub(topics);
  const osfResults = await fetchOsf(topics);
  const openalexResults = await fetchOpenAlex(topics);
  const s2Results = await fetchSemanticScholar(topics);
  const webResults = await fetchWebSearch(topics);

  const allArtifacts: ResearchArtifact[] = [
    ...arxivResults,
    ...githubResults,
    ...osfResults,
    ...openalexResults,
    ...s2Results,
    ...webResults,
  ];
  console.log(`[phase:ingest] Discovered ${allArtifacts.length} artifacts`);
```

**Verify:** `npx tsc --noEmit`

---

### Task 9: Add `'openalex'` to `ResearchArtifact.source` union type

**File:** `src/types.ts`

**Why:** OpenAlex is a new source not in the union type.

**Change line 4 from:**

```typescript
  source: 'arxiv' | 'github' | 'osf' | 'semantic-scholar' | 'web' | 'local';
```

**to:**

```typescript
  source: 'arxiv' | 'github' | 'osf' | 'openalex' | 'semantic-scholar' | 'web' | 'local';
```

**Verify:** `npx tsc --noEmit`

---

### Task 10: Fix novelty scoring

**File:** `src/analyze/similarity.ts`

**Why:** `noveltyScore` is hardcoded `0.5`. Should vary based on artifact characteristics: low citations + recent = more novel; high citations + older = less novel.

**Replace line 28:**

```typescript
      noveltyScore: 0.5, // TODO: Implement novelty detection
```

**with:**

```typescript
      noveltyScore: computeNovelty(artifact),
```

**Add new function after `computeRisk`:**

```typescript
function computeNovelty(artifact: ResearchArtifact): number {
  const citationPenalty = Math.min(artifact.citations / 200, 0.5);
  const recencyBonus = computeRecencyBonus(artifact.discoveredAt);
  const novelty = 1.0 - citationPenalty + recencyBonus;
  return Math.min(Math.max(novelty, 0), 1);
}

function computeRecencyBonus(discoveredAt: string): number {
  try {
    const ageMs = Date.now() - new Date(discoveredAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 30) return 0.3;
    if (ageDays < 90) return 0.2;
    if (ageDays < 365) return 0.1;
    return 0;
  } catch {
    return 0;
  }
}
```

**Verify:** `npx tsc --noEmit`

---

### Task 11: Add idempotent ingest deduplication

**File:** `src/ingest/dedup.ts` (NEW)

**Why:** Re-running the daemon should not duplicate quarantined artifacts. Need a simple hash-based seen set.

**Create new file:**

```typescript
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ResearchArtifact } from '../types';

const SEEN_DIR = '.seen';

export function artifactId(artifact: ResearchArtifact): string {
  const raw = `${artifact.source}:${artifact.url}:${artifact.title}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function loadSeenIds(outputDir: string): Set<string> {
  const seenPath = path.join(outputDir, SEEN_DIR, 'seen.json');
  try {
    if (fs.existsSync(seenPath)) {
      const data = JSON.parse(fs.readFileSync(seenPath, 'utf-8'));
      return new Set(Array.isArray(data) ? data : []);
    }
  } catch {
    // ignore corrupt file
  }
  return new Set();
}

export function saveSeenIds(outputDir: string, ids: Set<string>): void {
  const seenDir = path.join(outputDir, SEEN_DIR);
  if (!fs.existsSync(seenDir)) {
    fs.mkdirSync(seenDir, { recursive: true });
  }
  const seenPath = path.join(seenDir, 'seen.json');
  fs.writeFileSync(seenPath, JSON.stringify([...ids], null, 2));
}

export function deduplicateArtifacts(
  artifacts: ResearchArtifact[],
  seenIds: Set<string>
): { newArtifacts: ResearchArtifact[]; updatedIds: Set<string> } {
  const updatedIds = new Set(seenIds);
  const newArtifacts: ResearchArtifact[] = [];

  for (const artifact of artifacts) {
    const id = artifactId(artifact);
    if (!seenIds.has(id)) {
      newArtifacts.push(artifact);
      updatedIds.add(id);
    }
  }

  return { newArtifacts, updatedIds };
}
```

**Wire into CLI:** Update `src/cli/research-intake.ts`

**Add import at top:**

```typescript
import { loadSeenIds, saveSeenIds, deduplicateArtifacts } from '../ingest/dedup';
```

**After line `const allArtifacts: ResearchArtifact[] = [...]` and before the manifests line, insert:**

```typescript
  const seenIds = loadSeenIds(opts.quarantineDir);
  const { newArtifacts, updatedIds } = deduplicateArtifacts(allArtifacts, seenIds);
  console.log(`[phase:ingest] ${newArtifacts.length} new artifacts (${allArtifacts.length - newArtifacts.length} duplicates skipped)`);
  saveSeenIds(opts.quarantineDir, updatedIds);
```

**Change `computeSimilarity` call to use `newArtifacts` instead of `allArtifacts`:**

```typescript
  const scored = computeSimilarity(newArtifacts, manifests);
```

**Verify:** `npx tsc --noEmit`

---

### Task 12: Implement basic citation extraction

**File:** `src/normalize/citation-extractor.ts`

**Why:** Stub returns `[]`. Basic regex can extract arXiv IDs, DOI references, and URL citations from abstracts.

**Replace entire file with:**

```typescript
const ARXIV_ID_REGEX = /\b(\d{4}\.\d{4,5}(?:v\d+)?)\b/g;
const DOI_REGEX = /\b(10\.\d{4,}\/[^\s,;]+)\b/g;
const URL_REGEX = /https?:\/\/[^\s,;)]+/g;

export function extractCitations(text: string): string[] {
  const citations = new Set<string>();

  let match: RegExpExecArray | null;

  ARXIV_ID_REGEX.lastIndex = 0;
  while ((match = ARXIV_ID_REGEX.exec(text)) !== null) {
    citations.add(`arxiv:${match[1]}`);
  }

  DOI_REGEX.lastIndex = 0;
  while ((match = DOI_REGEX.exec(text)) !== null) {
    citations.add(`doi:${match[1]}`);
  }

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    citations.add(match[1]);
  }

  return [...citations];
}
```

**Verify:** `npx tsc --noEmit`

---

### Task 13: Delete dead code — `authority-score.ts`

**File:** `src/analyze/authority-score.ts`

**Why:** This file duplicates `computeAuthority()` logic already in `similarity.ts`. Nothing imports it.

**Delete the file.**

**Check no imports exist:** Search codebase for `authority-score` imports — there are none.

**Verify:** `npx tsc --noEmit`

---

### Task 14: Implement OSF API client

**File:** `src/ingest/osf.ts`

**Why:** OSF API v2 provides preprints and datasets. Requires `OSF_API_KEY` for authenticated access.

**Replace entire file with:**

```typescript
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

export function normalizeOsf(raw: any): Partial<ResearchArtifact> {
  return {
    source: 'osf',
    evidenceLevel: 'peer-reviewed',
  };
}
```

**Verify:** `npx tsc --noEmit`

---

### Task 15: Update `.env.example` with OpenAlex mailto

**File:** `.env.example`

**Add new entries:**

```
# OpenAlex (no key required, but mailto gets polite pool)
OPENALEX_MAILTO=research@we4free.dev

# Seen-artifacts directory (for dedup)
SEEN_DIR=.seen
```

**Verify:** no TypeScript impact

---

### Task 16: Full build and smoke test

**Commands:**

```bash
npx tsc --noEmit
npm run build
```

**Smoke test (dry run, no network):**

Verify the build compiles with zero errors. Network calls will be tested manually after the plan is executed.

---

## Execution Order

Tasks are ordered by dependency:

1. **Task 9** — Add `'openalex'` to types (no deps, tiny change)
2. **Task 7** — Fix normalizers (no deps, pure refactoring)
3. **Task 12** — Implement citation extractor (no deps)
4. **Task 13** — Delete dead code (no deps)
5. **Task 1** — Fix `loadRepoManifests()` (no deps)
6. **Task 10** — Fix novelty scoring (no deps)
7. **Task 11** — Add dedup module (no deps, but needed before wiring)
8. **Task 2** — Implement arXiv client (depends on Task 7)
9. **Task 3** — Implement GitHub client (depends on Task 7)
10. **Task 4** — Implement OpenAlex adapter (depends on Tasks 7, 9)
11. **Task 5** — Implement Semantic Scholar client (depends on Task 7)
12. **Task 6** — Implement web search adapter (no normalizer dependency)
13. **Task 14** — Implement OSF client (depends on Task 7)
14. **Task 15** — Update .env.example (no deps)
15. **Task 8** — Wire all adapters into CLI (depends on Tasks 2-6, 11, 14)
16. **Task 16** — Full build + verify

## Estimated Time

~2-3 hours for an experienced developer working sequentially. Subagent-driven execution could parallelize Tasks 1-7 and 9-14.

## Success Criteria

- `npx tsc --noEmit` passes with zero errors
- `npm run build` produces `dist/` output
- `node dist/cli/research-intake.js run` makes real API calls and discovers artifacts
- Quarantine JSONL files contain real suggestion packets
- Briefing text files show real titles, URLs, and scores
- Re-running does not produce duplicate quarantine entries
