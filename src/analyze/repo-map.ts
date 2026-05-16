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