import * as fs from 'fs';
import * as path from 'path';
import {
  AppliedPacket,
  RollbackRecord,
  FeedbackEntry,
  TrustScoreEntry,
} from '../types';
import { loadApplied } from './auto-apply';
import { loadRollbacks } from './rollback';
import { loadFeedback } from './feedback-loop';
import { loadTrustScores } from './trust-score';

export interface ReplayEvent {
  timestamp: string;
  type: 'applied' | 'rollback' | 'feedback' | 'trust_update';
  packet_id?: string;
  details: Record<string, any>;
}

export function replay(
  autonomousDir: string,
  fromTimestamp?: string
): ReplayEvent[] {
  const events = collectAllEvents(autonomousDir);

  const sorted = events.sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  if (fromTimestamp) {
    const fromMs = new Date(fromTimestamp).getTime();
    return sorted.filter(e => new Date(e.timestamp).getTime() >= fromMs);
  }

  return sorted;
}

function collectAllEvents(autonomousDir: string): ReplayEvent[] {
  const events: ReplayEvent[] = [];

  const applied = loadApplied(autonomousDir);
  for (const a of applied) {
    events.push({
      timestamp: a.applied_at,
      type: 'applied',
      packet_id: a.packet_id,
      details: {
        state: a.state,
        applied_by: a.applied_by,
        target_repo: a.target_repo,
        confidence: a.original_packet.graph_confidence.finalConfidence,
        action: a.original_packet.suggestion_action,
      },
    });
  }

  const rollbacks = loadRollbacks(autonomousDir);
  for (const r of rollbacks) {
    events.push({
      timestamp: r.rolled_back_at,
      type: 'rollback',
      packet_id: r.packet_id,
      details: {
        reason: r.reason,
        rolled_back_by: r.rolled_back_by,
      },
    });
  }

  const feedback = loadFeedback(autonomousDir);
  for (const f of feedback) {
    events.push({
      timestamp: f.observed_at,
      type: 'feedback',
      packet_id: f.packet_id,
      details: {
        outcome: f.outcome,
        confidence_before: f.confidence_before,
        confidence_after: f.confidence_after,
        feedback_details: f.details,
      },
    });
  }

  const trustScores = loadTrustScores(autonomousDir);
  for (const t of trustScores) {
    events.push({
      timestamp: t.last_updated,
      type: 'trust_update',
      details: {
        source_id: t.source_id,
        source_type: t.source_type,
        trust_score: t.trust_score,
        evidence_count: t.evidence_count,
        contradiction_count: t.contradiction_count,
      },
    });
  }

  return events;
}
