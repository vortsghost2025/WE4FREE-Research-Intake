// spec/artifacts/research-artifact.schema.ts
// Source: src/types.ts — ResearchArtifact

export interface ResearchArtifactSchema {
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
  discoveredAt: string;
}

export const researchArtifactSchemaJSON = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    source: {
      type: 'string',
      enum: ['arxiv', 'github', 'osf', 'openalex', 'semantic-scholar', 'web', 'local'],
    },
    title: { type: 'string' },
    authors: { type: 'array', items: { type: 'string' } },
    url: { type: 'string', format: 'uri' },
    abstract: { type: 'string' },
    claims: { type: 'array', items: { type: 'string' } },
    codeLinks: { type: 'array', items: { type: 'string', format: 'uri' } },
    citations: { type: 'integer', minimum: 0 },
    topics: { type: 'array', items: { type: 'string' } },
    evidenceLevel: {
      type: 'string',
      enum: ['experimental', 'peer-reviewed', 'preprint', 'production', 'specification'],
    },
    license: { type: 'string' },
    discoveredAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'source', 'title', 'url', 'abstract', 'evidenceLevel', 'discoveredAt'],
  additionalProperties: false,
};
