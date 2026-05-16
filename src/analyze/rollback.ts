import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  AppliedPacket,
  RollbackRecord,
} from '../types';
import { loadApplied, saveApplied } from './auto-apply';

/**
 * Roll back a previously applied suggestion packet.
 *
 * **Symbolic-only rollback**: this function updates the packet's state in the
 * JSONL record and writes a RollbackRecord capturing the pre-state snapshot,
 * but it does NOT revert actual changes made to target repositories or
 * production systems. Callers must use `restored_snapshot` from the returned
 * record to manually restore the target system if needed.
 */
export function rollback(
  packetId: string,
  reason: string,
  autonomousDir: string,
  rolledBackBy: 'auto' | 'human' = 'human'
): RollbackRecord | null {
  if (!fs.existsSync(autonomousDir)) {
    fs.mkdirSync(autonomousDir, { recursive: true });
  }

  const applied = loadApplied(autonomousDir);
  const targetIndex = applied.findIndex(a => a.packet_id === packetId);

  if (targetIndex === -1) {
    console.error(`[phase:rollback] Packet ${packetId} not found in applied records`);
    return null;
  }

  const target = applied[targetIndex];

  if (target.state !== 'auto_applied' && target.state !== 'human_approved') {
    console.error(`[phase:rollback] Packet ${packetId} is in state '${target.state}' — cannot rollback`);
    return null;
  }

  const record: RollbackRecord = {
    id: generateRollbackId(),
    packet_id: packetId,
    rolled_back_at: new Date().toISOString(),
    reason,
    rolled_back_by: rolledBackBy,
    restored_snapshot: target.pre_state_snapshot,
  };

  applied[targetIndex] = { ...target, state: 'rolled_back' };
  saveApplied(applied, autonomousDir);

  const rollbackPath = path.join(autonomousDir, 'rollback.jsonl');
  fs.appendFileSync(rollbackPath, JSON.stringify(record) + '\n', 'utf-8');

  console.log(`[phase:rollback] Rolled back packet ${packetId}: ${reason}`);
  return record;
}

export function loadRollbacks(autonomousDir: string): RollbackRecord[] {
  const filePath = path.join(autonomousDir, 'rollback.jsonl');
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  return raw
    .trim()
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as RollbackRecord);
}

function generateRollbackId(): string {
  return `rb-${crypto.randomUUID().slice(0, 12)}`;
}
