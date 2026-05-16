import * as fs from 'fs';
import * as path from 'path';
import {
  CanonicalGraph,
  Claim,
  Evidence,
  AuthorityLink,
  ContradictionEdge,
} from '../types';

function emptyGraph(): CanonicalGraph {
  return {
    claims: new Map(),
    evidence: new Map(),
    authorityLinks: new Map(),
    contradictions: new Map(),
    artifactIndex: new Map(),
  };
}

function serializeMap<T>(map: Map<string, T>): Record<string, T> {
  const obj: Record<string, T> = {};
  for (const [k, v] of map) obj[k] = v;
  return obj;
}

function deserializeMap<T>(obj: Record<string, T> | undefined): Map<string, T> {
  const map = new Map<string, T>();
  if (obj) {
    for (const [k, v] of Object.entries(obj)) map.set(k, v as T);
  }
  return map;
}

function graphToJSON(g: CanonicalGraph): object {
  return {
    claims: serializeMap(g.claims),
    evidence: serializeMap(g.evidence),
    authorityLinks: serializeMap(g.authorityLinks),
    contradictions: serializeMap(g.contradictions),
    artifactIndex: serializeMap(g.artifactIndex),
  };
}

function jsonToGraph(obj: any): CanonicalGraph {
  return {
    claims: deserializeMap<Claim>(obj.claims),
    evidence: deserializeMap<Evidence>(obj.evidence),
    authorityLinks: deserializeMap<AuthorityLink>(obj.authorityLinks),
    contradictions: deserializeMap<ContradictionEdge>(obj.contradictions),
    artifactIndex: deserializeMap<string[]>(obj.artifactIndex),
  };
}

export class GraphStore {
  private graph: CanonicalGraph;
  private dir: string;
  private lastAppendedCount: number;

  constructor(dir: string) {
    this.dir = dir;
    this.graph = emptyGraph();
    this.lastAppendedCount = 0;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  load(): boolean {
    const filePath = path.join(this.dir, 'graph-snapshot.json');
    if (!fs.existsSync(filePath)) return false;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const obj = JSON.parse(raw);
      this.graph = jsonToGraph(obj);
      console.log(`[phase:graph] Loaded ${this.graph.claims.size} claims from ${filePath}`);
      return true;
    } catch (err) {
      console.error('[phase:graph] Failed to load graph:', err);
      this.graph = emptyGraph();
      return false;
    }
  }

  save(): void {
    const filePath = path.join(this.dir, 'graph-snapshot.json');
    const json = JSON.stringify(graphToJSON(this.graph), null, 2);
    fs.writeFileSync(filePath, json, 'utf-8');
    console.log(`[phase:graph] Saved snapshot to ${filePath}`);
  }

  appendJSONL(): void {
    const currentCount = this.totalEntityCount();
    if (currentCount <= this.lastAppendedCount) return;

    const filePath = path.join(this.dir, 'graph-log.jsonl');
    const delta = this.buildDelta(this.lastAppendedCount);
    const line = JSON.stringify(delta) + '\n';
    fs.appendFileSync(filePath, line, 'utf-8');
    this.lastAppendedCount = currentCount;
  }

  private totalEntityCount(): number {
    return this.graph.claims.size + this.graph.evidence.size
      + this.graph.authorityLinks.size + this.graph.contradictions.size;
  }

  private buildDelta(sinceCount: number): object {
    const allEntities: object[] = [];
    const offset = sinceCount;
    let idx = 0;
    for (const [k, v] of this.graph.claims) {
      if (idx >= offset) allEntities.push({ type: 'claim', key: k, value: v });
      idx++;
    }
    for (const [k, v] of this.graph.evidence) {
      if (idx >= offset) allEntities.push({ type: 'evidence', key: k, value: v });
      idx++;
    }
    for (const [k, v] of this.graph.authorityLinks) {
      if (idx >= offset) allEntities.push({ type: 'authorityLink', key: k, value: v });
      idx++;
    }
    for (const [k, v] of this.graph.contradictions) {
      if (idx >= offset) allEntities.push({ type: 'contradiction', key: k, value: v });
      idx++;
    }
    return { delta: true, entities: allEntities, appendedAt: new Date().toISOString() };
  }

  merge(incoming: CanonicalGraph): number {
    let added = 0;
    for (const [k, v] of incoming.claims) {
      if (!this.graph.claims.has(k)) { this.graph.claims.set(k, v); added++; }
    }
    for (const [k, v] of incoming.evidence) {
      if (!this.graph.evidence.has(k)) { this.graph.evidence.set(k, v); added++; }
    }
    for (const [k, v] of incoming.authorityLinks) {
      if (!this.graph.authorityLinks.has(k)) { this.graph.authorityLinks.set(k, v); added++; }
    }
    for (const [k, v] of incoming.contradictions) {
      if (!this.graph.contradictions.has(k)) { this.graph.contradictions.set(k, v); added++; }
    }
    for (const [k, v] of incoming.artifactIndex) {
      if (!this.graph.artifactIndex.has(k)) {
        this.graph.artifactIndex.set(k, v);
      } else {
        const existing = this.graph.artifactIndex.get(k)!;
        const merged = [...new Set([...existing, ...v])];
        this.graph.artifactIndex.set(k, merged);
      }
    }
    return added;
  }

  get(): CanonicalGraph {
    return this.graph;
  }

  stats(): { claims: number; evidence: number; authorityLinks: number; contradictions: number; artifacts: number } {
    return {
      claims: this.graph.claims.size,
      evidence: this.graph.evidence.size,
      authorityLinks: this.graph.authorityLinks.size,
      contradictions: this.graph.contradictions.size,
      artifacts: this.graph.artifactIndex.size,
    };
  }
}
