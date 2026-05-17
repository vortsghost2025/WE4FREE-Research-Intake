// Canonical object for all ingested research artifacts
export interface ResearchArtifact {
  id: string;
  source: 'arxiv' | 'github' | 'osf' | 'openalex' | 'semantic-scholar' | 'web' | 'local';
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
  relevanceScore: number;    // 0-1 keyword overlap (backward-compat)
  authorityScore: number;    // 0-1
  noveltyScore: number;      // 0-1
  riskScore: number;         // 0-1
  /** Paper Scout composite — replaces raw relevanceScore for confidence gates */
  compositeScore: number;    // 0-1
  /** Community interest proxy: citation velocity × topic breadth */
  communityActivity: number; // 0-1
  /** Absolute recency position signal (0.05→1.0, distinct from noveltyScore) */
  recency: number;           // 0-1
  implementationCost: 'low' | 'medium' | 'high';
  laneTarget: LaneTarget;
  recommendedAction: 'review' | 'adopt' | 'monitor' | 'discard';
}

// Quarantine packet written to disk
export interface SuggestionPacket {
  packet_type: 'research_suggestion';
  target_lane: LaneTarget;
  confidence: number;
  source_url: string;
  claim: string;
  why_it_matters: string;
  suggested_change: string;
  risk: 'low' | 'medium' | 'high';
  requires_human_review: boolean;
  created_at: string; // ISO timestamp
}

export interface PolicyResult {
  passing: boolean;
  deny_reasons: string[];
  flag_reasons: string[];
}

// Local repo manifest structure
export interface RepoManifest {
  name: string;
  lane: string;
  description: string;
  keywords: string[];
  docsSummary?: string;
}

// ─── Phase B: Ontology / Semantic Graph ───

export type ClaimVeracity = 'supported' | 'contradicted' | 'unverified' | 'disputed';

export interface Claim {
  id: string;
  text: string;
  sourceArtifactId: string;
  veracity: ClaimVeracity;
  confidence: number;
  topics: string[];
  createdAt: string;
}

export interface Evidence {
  id: string;
  claimId: string;
  type: 'citation' | 'doi' | 'url' | 'code_link' | 'experimental_result' | 'peer_review';
  value: string;
  sourceArtifactId: string;
  weight: number;
}

export interface AuthorityLink {
  id: string;
  fromArtifactId: string;
  toArtifactId: string;
  type: 'cites' | 'cited_by' | 'same_author' | 'same_group' | 'supersedes' | 'reproduces';
  weight: number;
}

export interface ContradictionEdge {
  id: string;
  claimAId: string;
  claimBId: string;
  strength: number;
  reason: string;
  detectedAt: string;
}

export interface CanonicalGraph {
  claims: Map<string, Claim>;
  evidence: Map<string, Evidence>;
  authorityLinks: Map<string, AuthorityLink>;
  contradictions: Map<string, ContradictionEdge>;
  artifactIndex: Map<string, string[]>;
}

// ─── Phase C: Controlled Recommendations ───

export type SuggestionAction =
  | 'investigate_contradiction'
  | 'adopt_evidence'
  | 'monitor_development'
  | 'review_authority'
  | 'update_ontology';

export type LaneTarget = 'archivist' | 'library' | 'swarm' | 'kernel' | 'control-plane' | 'research' | 'unknown';

export interface GraphAwareScore {
  baseConfidence: number;
  evidenceBonus: number;
  contradictionPenalty: number;
  authorityBonus: number;
  veracityModifier: number;
  finalConfidence: number;
}

// ─── Phase D: packet signing (WO-01) ───

export type PacketFormat = 'hmac' | 'in-toto';

export interface IntotoAttestation {
  _type: string;
  subject: Array<{ name: string; digest: { sha256: string } }>;
  predicateType: string;
  predicate: Record<string, any>;
}

export interface ConfidentPacketLayer {
  suggestion_action: SuggestionAction;
  graph_confidence: GraphAwareScore;
  signature: string;
  signing_key_id: string;
  packet_format: PacketFormat;
}

export interface SignedSuggestionPacket extends SuggestionPacket, ConfidentPacketLayer {}

// ─── Phase D: Autonomous Evolution ───

export type SuggestionState = 'pending' | 'auto_applied' | 'human_approved' | 'rejected' | 'rolled_back' | 'degraded';

export type FeedbackOutcome = 'success' | 'failure' | 'partial' | 'no_effect' | 'pending';

export interface AppliedPacket {
  packet_id: string;
  original_packet: SignedSuggestionPacket;
  applied_at: string;
  applied_by: 'auto' | 'human';
  state: SuggestionState;
  target_repo: string;
  target_file: string;
  change_description: string;
  pre_state_snapshot: string;
}

export interface RollbackRecord {
  id: string;
  packet_id: string;
  rolled_back_at: string;
  reason: string;
  rolled_back_by: 'auto' | 'human';
  restored_snapshot: string;
}

export interface FeedbackEntry {
  id: string;
  packet_id: string;
  outcome: FeedbackOutcome;
  observed_at: string;
  details: string;
  confidence_before: number;
  confidence_after: number;
}

export interface TrustScoreEntry {
  source_id: string;
  source_type: 'artifact' | 'claim' | 'authority_link';
  trust_score: number;
  evidence_count: number;
  contradiction_count: number;
  last_updated: string;
  decay_factor: number;
  accumulated_weight: number;
}
