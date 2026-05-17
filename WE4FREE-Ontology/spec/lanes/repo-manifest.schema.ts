// spec/lanes/repo-manifest.schema.ts

export interface RepoManifestSchema {
  name: string;
  lane: string;
  description: string;
  keywords: string[];
  docsSummary?: string;
}

export const repoManifestSchemaJSON = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    lane: { type: 'string' },
    description: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    docsSummary: { type: 'string' },
  },
  required: ['name', 'lane', 'description', 'keywords'],
  additionalProperties: false,
};
