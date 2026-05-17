// spec/graph/evidence.schema.ts

export interface EvidenceSchema {
  id: string;
  claimId: string;
  type: 'citation' | 'doi' | 'url' | 'code_link' | 'experimental_result' | 'peer_review';
  value: string;
  sourceArtifactId: string;
  weight: number;
}

export const evidenceSchemaJSON = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    claimId: { type: 'string' },
    type: {
      type: 'string',
      enum: ['citation', 'doi', 'url', 'code_link', 'experimental_result', 'peer_review'],
    },
    value: { type: 'string' },
    sourceArtifactId: { type: 'string' },
    weight: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['id', 'claimId', 'type', 'value', 'sourceArtifactId', 'weight'],
  additionalProperties: false,
};
