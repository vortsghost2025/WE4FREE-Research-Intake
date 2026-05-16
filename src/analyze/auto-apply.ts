import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  SignedSuggestionPacket,
  AppliedPacket,
  CanonicalGraph,
} from '../types';

const MIN_CONFIDENCE = 0.8;
const ALLOWED_ACTION: SignedSuggestionPacket['suggestion_action'] = 'adopt_evidence';

export function autoApply(
  signedPackets: SignedSuggestionPacket[],
  autonomousDir: string,
  graph: CanonicalGraph
): AppliedPacket[] {
  if (!fs.existsSync(autonomousDir)) {
    fs.mkdirSync(autonomousDir, { recursive: true });
  }

  const existingApplied = loadApplied(autonomousDir);
  const existingIds = new Set(existingApplied.map(a => a.packet_id));

  const eligible = signedPackets.filter(p => {
    if (existingIds.has(packetId(p))) return false;
    return isEligible(p);
  });

  const applied: AppliedPacket[] = eligible.map(p => ({
    packet_id: packetId(p),
    original_packet: p,
    applied_at: new Date().toISOString(),
    applied_by: 'auto',
    state: 'auto_applied',
    target_repo: extractTargetRepo(p),
    target_file: '',
    change_description: p.suggested_change,
    pre_state_snapshot: capturePreState(p, graph),
  }));

  if (applied.length > 0) {
    const filePath = path.join(autonomousDir, 'applied.jsonl');
    const lines = applied.map(a => JSON.stringify(a));
    fs.appendFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
  }

  console.log(`[phase:autonomous] Auto-applied ${applied.length} of ${signedPackets.length} packets`);
  return applied;
}

export function isEligible(packet: SignedSuggestionPacket): boolean {
  if (packet.requires_human_review) return false;
  if (packet.risk !== 'low') return false;
  if (packet.suggestion_action !== ALLOWED_ACTION) return false;
  if (packet.graph_confidence.finalConfidence < MIN_CONFIDENCE) return false;
  return true;
}

export function loadApplied(autonomousDir: string): AppliedPacket[] {
  const filePath = path.join(autonomousDir, 'applied.jsonl');
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  return raw
    .trim()
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as AppliedPacket);
}

export function saveApplied(applied: AppliedPacket[], autonomousDir: string): void {
  if (!fs.existsSync(autonomousDir)) {
    fs.mkdirSync(autonomousDir, { recursive: true });
  }
  const filePath = path.join(autonomousDir, 'applied.jsonl');
  const lines = applied.map(a => JSON.stringify(a));
  fs.writeFileSync(filePath, lines.join('\n') + '\n', 'utf-8');
}

function packetId(packet: SignedSuggestionPacket): string {
  return crypto
    .createHash('sha256')
    .update(packet.signature)
    .digest('hex')
    .slice(0, 16);
}

function extractTargetRepo(packet: SignedSuggestionPacket): string {
  const lane = packet.target_lane;
  return lane || 'unknown';
}

function capturePreState(
  packet: SignedSuggestionPacket,
  graph: CanonicalGraph
): string {
  const snapshot = {
    captured_at: new Date().toISOString(),
    packet_confidence: packet.graph_confidence.finalConfidence,
    graph_stats: {
      claims: graph.claims.size,
      evidence: graph.evidence.size,
      contradictions: graph.contradictions.size,
    },
  };
  return JSON.stringify(snapshot);
}
