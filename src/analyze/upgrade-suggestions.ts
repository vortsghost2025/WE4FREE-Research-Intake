import { ScoredArtifact, SuggestionPacket } from '../types';

/**
 * Generate upgrade suggestion packets from scored artifacts.
 */
export function generateSuggestions(scored: ScoredArtifact[]): SuggestionPacket[] {
  return scored
    .filter(s => s.relevanceScore > 0.2 && s.recommendedAction !== 'discard')
    .map(s => ({
      packet_type: 'research_suggestion' as const,
      target_lane: s.laneTarget,
      confidence: s.relevanceScore * s.authorityScore,
      source_url: s.artifact.url,
      claim: s.artifact.abstract.slice(0, 200),
      why_it_matters: `Relevant to ${s.laneTarget} lane with ${(s.relevanceScore * 100).toFixed(0)}% topic overlap`,
      suggested_change: 'Review and evaluate for integration',
      risk: s.riskScore > 0.6 ? 'high' : s.riskScore > 0.3 ? 'medium' : 'low',
      requires_human_review: s.riskScore > 0.3 || s.artifact.evidenceLevel === 'preprint',
      created_at: new Date().toISOString(),
    }));
}
