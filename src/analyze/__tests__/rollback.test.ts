import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'os';
import { rollback, loadRollbacks } from '../rollback';
import { loadApplied, saveApplied } from '../auto-apply';
import { AppliedPacket, CanonicalGraph } from '../../types';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.tmpdir() + '/rollback-test-');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeAppliedPacket(overrides: Partial<AppliedPacket> = {}): AppliedPacket {
  return {
    packet_id: overrides.packet_id || 'pkt-test-001',
    original_packet: {
      packet_type: 'research_suggestion',
      target_lane: 'research',
      confidence: 0.85,
      source_url: 'https://example.com/paper1',
      claim: 'test',
      why_it_matters: 'test',
      suggested_change: 'update X',
      risk: 'low',
      requires_human_review: false,
      created_at: new Date().toISOString(),
      suggestion_action: 'adopt_evidence',
      graph_confidence: {
        baseConfidence: 0.8, evidenceBonus: 0.05, contradictionPenalty: 0, authorityBonus: 0, veracityModifier: 0, finalConfidence: 0.85,
      },
      signature: 'abc123',
      signing_key_id: 'test',
      packet_format: 'hmac',
    },
    applied_at: new Date().toISOString(),
    applied_by: 'auto',
    state: 'auto_applied',
    target_repo: 'WE4FREE-Archivist-Agent',
    target_file: '',
    change_description: 'update X',
    pre_state_snapshot: JSON.stringify({ test: true }),
    ...overrides,
  };
}

describe('rollback', () => {
  it('returns a RollbackRecord for an auto_applied packet', () => {
    const packet = makeAppliedPacket({ packet_id: 'pkt-rollback-ok' });
    saveApplied([packet], tmpDir);

    const record = rollback('pkt-rollback-ok', 'test rollback', tmpDir, 'human');
    expect(record).not.toBeNull();
    expect(record!.packet_id).toBe('pkt-rollback-ok');
    expect(record!.reason).toBe('test rollback');
    expect(record!.rolled_back_by).toBe('human');
    expect(record!.restored_snapshot).toBe(packet.pre_state_snapshot);
  });

  it('updates packet state to rolled_back in applied records', () => {
    const packet = makeAppliedPacket({ packet_id: 'pkt-state-change' });
    saveApplied([packet], tmpDir);

    rollback('pkt-state-change', 'state test', tmpDir, 'human');
    const applied = loadApplied(tmpDir);
    expect(applied[0].state).toBe('rolled_back');
  });

  it('persists rollback record to rollback.jsonl', () => {
    const packet = makeAppliedPacket({ packet_id: 'pkt-persist' });
    saveApplied([packet], tmpDir);

    rollback('pkt-persist', 'persist test', tmpDir, 'human');
    const records = loadRollbacks(tmpDir);
    expect(records.length).toBe(1);
    expect(records[0].packet_id).toBe('pkt-persist');
  });

  it('returns null when packet_id is not found', () => {
    const result = rollback('nonexistent', 'not found', tmpDir);
    expect(result).toBeNull();
  });

  it('returns null when packet is in pending state', () => {
    const packet = makeAppliedPacket({ packet_id: 'pkt-pending', state: 'pending' });
    saveApplied([packet], tmpDir);

    const result = rollback('pkt-pending', 'pending test', tmpDir);
    expect(result).toBeNull();
  });

  it('returns null when packet is already rolled_back', () => {
    const packet = makeAppliedPacket({ packet_id: 'pkt-already', state: 'rolled_back' });
    saveApplied([packet], tmpDir);

    const result = rollback('pkt-already', 'already rolled', tmpDir);
    expect(result).toBeNull();
  });

  it('supports auto-initiated rollback', () => {
    const packet = makeAppliedPacket({ packet_id: 'pkt-auto-rb' });
    saveApplied([packet], tmpDir);

    const record = rollback('pkt-auto-rb', 'auto rollback', tmpDir, 'auto');
    expect(record!.rolled_back_by).toBe('auto');
  });
});
