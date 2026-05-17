// spec/graph/authority.schema.ts

export interface AuthorityLinkSchema {
  id: string;
  fromArtifactId: string;
  toArtifactId: string;
  type: 'cites' | 'cited_by' | 'same_author' | 'same_group' | 'supersedes' | 'reproduces';
  weight: number;
}

export const authorityLinkSchemaJSON = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    fromArtifactId: { type: 'string' },
    toArtifactId: { type: 'string' },
    type: {
      type: 'string',
      enum: ['cites', 'cited_by', 'same_author', 'same_group', 'supersedes', 'reproduces'],
    },
    weight: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['id', 'fromArtifactId', 'toArtifactId', 'type', 'weight'],
  additionalProperties: false,
};
