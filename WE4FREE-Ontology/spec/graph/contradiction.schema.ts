// spec/graph/contradiction.schema.ts

export interface ContradictionEdgeSchema {
  id: string;
  claimAId: string;
  claimBId: string;
  strength: number;
  reason: string;
  detectedAt: string;
}

export const contradictionEdgeSchemaJSON = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    claimAId: { type: 'string' },
    claimBId: { type: 'string' },
    strength: { type: 'number', minimum: 0, maximum: 1 },
    reason: { type: 'string' },
    detectedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'claimAId', 'claimBId', 'strength', 'reason', 'detectedAt'],
  additionalProperties: false,
};
