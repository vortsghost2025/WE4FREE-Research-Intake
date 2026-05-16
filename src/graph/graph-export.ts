import * as fs from 'fs';
import * as path from 'path';
import { CanonicalGraph } from '../types';

export interface ExportNode {
  id: string;
  type: 'claim' | 'artifact';
  label: string;
  veracity?: string;
  confidence?: number;
  topics?: string[];
}

export interface ExportEdge {
  source: string;
  target: string;
  type: string;
  weight?: number;
  reason?: string;
}

export interface ExportGraph {
  nodes: ExportNode[];
  edges: ExportEdge[];
  metadata: {
    exportedAt: string;
    totalClaims: number;
    totalEvidence: number;
    totalAuthorityLinks: number;
    totalContradictions: number;
  };
}

export function exportGraph(graph: CanonicalGraph): ExportGraph {
  const nodes: ExportNode[] = [];
  const edges: ExportEdge[] = [];
  const artifactIds = new Set<string>();

  for (const [, claim] of graph.claims) {
    nodes.push({
      id: claim.id,
      type: 'claim',
      label: claim.text.length > 80 ? claim.text.slice(0, 77) + '...' : claim.text,
      veracity: claim.veracity,
      confidence: claim.confidence,
      topics: claim.topics,
    });
    artifactIds.add(claim.sourceArtifactId);
  }

  for (const artifactId of artifactIds) {
    nodes.push({
      id: artifactId,
      type: 'artifact',
      label: artifactId,
    });
  }

  for (const [, claim] of graph.claims) {
    edges.push({
      source: claim.sourceArtifactId,
      target: claim.id,
      type: 'has_claim',
      weight: claim.confidence,
    });
  }

  for (const [, ev] of graph.evidence) {
    edges.push({
      source: ev.id,
      target: ev.claimId,
      type: `evidence:${ev.type}`,
      weight: ev.weight,
    });
  }

  for (const [, link] of graph.authorityLinks) {
    edges.push({
      source: link.fromArtifactId,
      target: link.toArtifactId,
      type: link.type,
      weight: link.weight,
    });
  }

  for (const [, contra] of graph.contradictions) {
    edges.push({
      source: contra.claimAId,
      target: contra.claimBId,
      type: 'contradiction',
      weight: contra.strength,
      reason: contra.reason,
    });
  }

  return {
    nodes,
    edges,
    metadata: {
      exportedAt: new Date().toISOString(),
      totalClaims: graph.claims.size,
      totalEvidence: graph.evidence.size,
      totalAuthorityLinks: graph.authorityLinks.size,
      totalContradictions: graph.contradictions.size,
    },
  };
}

export function exportGraphToFile(graph: CanonicalGraph, dir: string): string {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const data = exportGraph(graph);
  const filePath = path.join(dir, `graph-export-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return filePath;
}
