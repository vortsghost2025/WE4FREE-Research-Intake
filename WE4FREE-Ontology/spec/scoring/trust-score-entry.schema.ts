// spec/scoring/trust-score-entry.schema.ts

export interface TrustScoreEntrySchema {
  source_id: string;
  source_type: 'artifact' | 'claim' | 'authority_link';
  trust_score: number;
  evidence_count: number;
  contradiction_count: number;
  last_updated: string;
  decay_factor: number;
  accumulated_weight: number;
}

export const trustScoreEntrySchemaJSON = {
  type: 'object',
  properties: {
    source_id: { type: 'string' },
    source_type: { type: 'string', enum: ['artifact', 'claim', 'authority_link'] },
    trust_score: { type: 'number', minimum: 0, maximum: 1 },
    evidence_count: { type: 'integer', minimum: 0 },
    contradiction_count: { type: 'integer', minimum: 0 },
    last_updated: { type: 'string', format: 'date-time' },
    decay_factor: { type: 'number', minimum: 0, maximum: 1 },
    accumulated_weight: { type: 'number', minimum: 0 },
  },
  required: ['source_id', 'source_type', 'trust_score', 'last_updated'],
  additionalProperties: false,
};
