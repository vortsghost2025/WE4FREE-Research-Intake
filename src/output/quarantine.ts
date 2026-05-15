import * as fs from 'fs';
import * as path from 'path';
import { SuggestionPacket } from '../types';

/**
 * Write suggestion packets to quarantine JSONL file.
 * Quarantine ensures no direct autonomous patching without review.
 */
export function writeToQuarantine(packets: SuggestionPacket[], quarantineDir: string): string {
  if (!fs.existsSync(quarantineDir)) {
    fs.mkdirSync(quarantineDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `quarantine-${timestamp}.jsonl`;
  const filepath = path.join(quarantineDir, filename);

  const lines = packets.map(p => JSON.stringify(p));
  fs.writeFileSync(filepath, lines.join('\n') + '\n');

  console.log(`[output:quarantine] Wrote ${packets.length} packets to ${filepath}`);
  return filepath;
}
