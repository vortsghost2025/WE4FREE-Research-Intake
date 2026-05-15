import { RepoManifest } from '../types';

/**
 * Map local repos to their lane targets and keywords.
 */
export function loadRepoManifests(path: string): RepoManifest[] {
  // TODO: Load and parse watched-repos.json
  console.log(`[analyze:repo-map] Loading repo manifests from ${path}`);
  return [
    {
      name: 'Archivist-Agent',
      lane: 'archivist',
      description: 'Governance artifacts, provenance, journal, file chaos, evidence',
      keywords: ['provenance', 'governance', 'journal', 'evidence'],
      docsSummary: '',
    },
    {
      name: 'self-organizing-library',
      lane: 'library',
      description: 'Memory graph, verification, docs, graph',
      keywords: ['memory', 'verification', 'graph', 'docs'],
      docsSummary: '',
    },
    {
      name: 'SwarmMind',
      lane: 'swarm',
      description: 'Multi-agent coordination, optimization',
      keywords: ['multi-agent', 'coordination', 'optimization'],
      docsSummary: '',
    },
    {
      name: 'kernel-lane',
      lane: 'kernel',
      description: 'CUDA/GPU/headless performance',
      keywords: ['cuda', 'gpu', 'performance', 'headless'],
      docsSummary: '',
    },
    {
      name: 'WE4FREE-Control-Plane',
      lane: 'control-plane',
      description: 'Orchestration, quarantine, autonomous healing',
      keywords: ['orchestration', 'quarantine', 'healing', 'autonomous'],
      docsSummary: '',
    },
  ];
}
