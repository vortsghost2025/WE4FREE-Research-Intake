// spec/graph/claim.schema.ts

export interface ClaimSchema {
  id: string;
  text: string;
  sourceArtifactId: string;
  veracity: 'supported' | 'contradicted' | 'unverified' | 'disputed';
  confidence: number;
  topics: string[];
  createdAt: string;
}

export const claimSchemaJSON = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    text: { type: 'string' },
    sourceArtifactId: { type: 'string' },
    veracity: {
      type: 'string',
      enum: ['supported', 'contradicted', 'unverified', 'disputed'],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    topics: { type: 'array', items: { type: 'string' } },
    createdAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'text', 'sourceArtifactId', 'veracity', 'confidence', 'createdAt'],
  additionalProperties: false,
};
