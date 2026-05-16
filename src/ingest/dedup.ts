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