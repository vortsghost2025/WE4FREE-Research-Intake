import * as fs from 'fs';
import * as path from 'path';
import { SignedSuggestionPacket } from '../types';

/**
 * Write signed suggestion packets to quarantine JSONL file.
 * Quarantine ensures no direct autonomous patching without review.
 */
export function writeToQuarantine(packets: SignedSuggestionPacket[], quarantineDir: string): string {
  if (!fs.existsSync(quarantineDir)) {
    fs.mkdirSync(quarantineDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `quarantine-${timestamp}.jsonl`;
  const filepath = path.join(quarantineDir, filename);

  const lines = packets.map(p => JSON.stringify(p));
  fs.writeFileSync(filepath, lines.join('\n') + '\n');

  console.log('');
  console.log('=== QUARANTINE REPORT ===');
  console.log(`Packets written: ${packets.length}`);
  console.log(`File location: ${filepath}`);
  if (packets.length > 0) {
    console.log('');
    packets.forEach((p, i) => {
      console.log(`Packet ${i + 1}:`);
      console.log(` Target Lane: ${p.target_lane}`);
      console.log(` Action: ${p.suggestion_action}`);
      console.log(` Confidence: ${(p.confidence * 100).toFixed(0)}% (graph: ${(p.graph_confidence.finalConfidence * 100).toFixed(0)}%)`);
      console.log(` Risk Level: ${p.risk}`);
      console.log(` Human Review Required: ${p.requires_human_review ? 'YES' : 'NO'}`);
      console.log(` Signing Key: ${p.signing_key_id}`);
      console.log(` Source: ${p.source_url}`);
      console.log('');
    });
  }
  console.log('=== END QUARANTINE REPORT ===');
  console.log('');
  return filepath;
}
