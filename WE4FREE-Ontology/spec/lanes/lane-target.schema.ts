// spec/lanes/lane-target.schema.ts

export interface LaneTargetSchema {
  name: 'archivist' | 'library' | 'swarm' | 'kernel' | 'control-plane' | 'research' | 'unknown';
  description: string;
}

export const laneTargetSchemaJSON = {
  type: 'string',
  enum: ['archivist', 'library', 'swarm', 'kernel', 'control-plane', 'research', 'unknown'],
};
