// Canonical object for all ingested research artifacts
export interface ResearchArtifact {
  id: string;
  source: 'arxiv' | 'github' | 'osf' | 'semantic-scholar' | 'web' | 'local';
  title: string;
  authors: string[];
  url: string;
  abstract: string;
  claims: string[];
  codeLinks: string[];
  citations: number;
  topics: string[];
  evidenceLevel: 'experimental' | 'peer-reviewed' | 'preprint' | 'production' | 'specification';
  license: string;
  discoveredAt: string; // ISO timestamp
}

// Scoring output for a compared artifact
export interface ScoredArtifact {
  artifact: ResearchArtifact;
  relevanceScore: number;    // 0-1
  authorityScore: number;    // 0-1
  noveltyScore: number;      // 0-1
  riskScore: number;         // 0-1
  implementationCost: 'low' | 'medium' | 'high';
  laneTarget: 'archivist' | 'library' | 'swarm' | 'kernel' | 'control-plane' | 'unknown';
  recommendedAction: 'review' | 'adopt' | 'monitor' | 'discard';
}

// Quarantine packet written to disk
export interface SuggestionPacket {
  packet_type: 'research_suggestion';
  target_lane: string;
  confidence: number;
  source_url: string;
  claim: string;
  why_it_matters: string;
  suggested_change: string;
  risk: 'low' | 'medium' | 'high';
  requires_human_review: boolean;
  created_at: string; // ISO timestamp
}

// Local repo manifest structure
export interface RepoManifest {
  name: string;
  lane: string;
  description: string;
  keywords: string[];
  docsSummary: string;
}
