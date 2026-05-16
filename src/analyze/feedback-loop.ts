import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  FeedbackEntry,
  FeedbackOutcome,
} from '../types';
import { loadApplied } from './auto-apply';

export function recordFeedback(
  packetId: string,
  outcome: FeedbackOutcome,
  autonomousDir: string,
  details: string = ''
): FeedbackEntry {
  if (!fs.existsSync(autonomousDir)) {
    fs.mkdirSync(autonomousDir, { recursive: true });
  }

  const applied = loadApplied(autonomousDir);
  const target = applied.find(a => a.packet_id === packetId);
  const confidenceBefore = target
    ? target.original_packet.graph_confidence.finalConfidence
    : 0;

  const confidenceAfter = computeAdjustedConfidence(
    packetId,
    outcome,
    confidenceBefore,
    autonomousDir
  );

  const entry: FeedbackEntry = {
    id: `fb-${crypto.randomUUID().slice(0, 12)}`,
    packet_id: packetId,
    outcome,
    observed_at: new Date().toISOString(),
    details,
    confidence_before: confidenceBefore,
    confidence_after: confidenceAfter,
  };

  const filePath = path.join(autonomousDir, 'feedback.jsonl');
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');

  console.log(
    `[phase:feedback] Recorded ${outcome} for packet ${packetId} (confidence: ${confidenceBefore.toFixed(3)} → ${confidenceAfter.toFixed(3)})`
  );
  return entry;
}

export function loadFeedback(autonomousDir: string): FeedbackEntry[] {
  const filePath = path.join(autonomousDir, 'feedback.jsonl');
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  return raw
    .trim()
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as FeedbackEntry);
}

export function adjustConfidence(
  packetId: string,
  autonomousDir: string
): number {
  const feedback = loadFeedback(autonomousDir);
  const packetFeedback = feedback.filter(f => f.packet_id === packetId);

  if (packetFeedback.length === 0) return 0;

  const latest = packetFeedback[packetFeedback.length - 1];
  return latest.confidence_after;
}

function computeAdjustedConfidence(
  packetId: string,
  outcome: FeedbackOutcome,
  currentConfidence: number,
  autonomousDir: string
): number {
  const history = loadFeedback(autonomousDir).filter(f => f.packet_id === packetId);

  let delta = 0;
  switch (outcome) {
    case 'success': delta = 0.1; break;
    case 'failure': delta = -0.2; break;
    case 'partial': delta = 0.02; break;
    case 'no_effect': delta = -0.05; break;
    case 'pending': delta = 0; break;
  }

  const successCount = history.filter(f => f.outcome === 'success').length;
  const failureCount = history.filter(f => f.outcome === 'failure').length;

  if (failureCount > 2) {
    delta -= 0.1;
  }
  if (successCount > 3) {
    delta += 0.05;
  }

  return Math.min(Math.max(currentConfidence + delta, 0), 1);
}
