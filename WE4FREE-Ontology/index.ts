// index.ts — stub for WE4FREE-Ontology package
// During development (WE4FREE-Ontology/) this file re-exports from ./spec
// In production the package is published to npm as @we4free/ontology
//
// NOTE: This stub provides an interim shim so src/types.ts can import from 'WE4FREE-Ontology'
// and typecheck against the shared ontology without a full npm publish.

export {
  // artifacts
  type ResearchArtifactSchema,
  researchArtifactSchemaJSON,
  // graph
  type ClaimSchema,
  claimSchemaJSON,
  type EvidenceSchema,
  evidenceSchemaJSON,
  type AuthorityLinkSchema,
  authorityLinkSchemaJSON,
  type ContradictionEdgeSchema,
  contradictionEdgeSchemaJSON,
  // packets
  type SuggestionPacketSchema,
  suggestionPacketSchemaJSON,
  // scoring
  type GraphAwareScoreSchema,
  graphAwareScoreSchemaJSON,
  type TrustScoreEntrySchema,
  trustScoreEntrySchemaJSON,
  // lanes
  type LaneTargetSchema,
  laneTargetSchemaJSON,
  type RepoManifestSchema,
  repoManifestSchemaJSON,
  // convenience
  type CanonicalGraphSchema,
  schemaRegistry,
} from './spec';
