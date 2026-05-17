// spec/scoring/graph-aware-score.schema.ts

export interface GraphAwareScoreSchema {
  baseConfidence: number;
  evidenceBonus: number;
  contradictionPenalty: number;
  authorityBonus: number;
  veracityModifier: number;
  finalConfidence: number;
}

export const graphAwareScoreSchemaJSON = {
  type: 'object',
  properties: {
    baseConfidence: { type: 'number', minimum: 0, maximum: 1 },
    evidenceBonus: { type: 'number', minimum: 0 },
    contradictionPenalty: { type: 'number', minimum: 0 },
    authorityBonus: { type: 'number', minimum: 0 },
    veracityModifier: { type: 'number' },
    finalConfidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['baseConfidence', 'evidenceBonus', 'contradictionPenalty', 'authorityBonus', 'veracityModifier', 'finalConfidence'],
  additionalProperties: false,
};
