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