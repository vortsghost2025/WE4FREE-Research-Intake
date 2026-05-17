import * as fs from 'fs';
import * as path from 'path';
import { SignedSuggestionPacket, PolicyResult } from '../types';

const DEFAULT_QUARANTINE_FILE = 'quarantine.jsonl';
const POLICY_EVAL_TOOL = 'opa'; // shell out to `opa eval` on the classpath

/**
 * Write signed suggestion packets to quarantine JSONL file.
 * Quarantine ensures no direct autonomous patching without review.
 *
 * @returns path to the created quarantine JSONL file
 */
export function writeToQuarantine(packets: SignedSuggestionPacket[], quarantineDir: string): string {
  if (!fs.existsSync(quarantineDir)) {
    fs.mkdirSync(quarantineDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `quarantine-${timestamp}.jsonl`;
  const filepath = path.join(quarantineDir, filename);

  // Optional Rego policy evaluation — graceful when policy file or opa is absent
  const policyFile = path.join(quarantineDir, '..', '..', 'policies', 'quarantine-policy.rego');
  if (fs.existsSync(policyFile)) {
    evaluateRegoPolicy(packets, policyFile);
  }

  const lines = packets.map(p => JSON.stringify(p));
  fs.writeFileSync(filepath, lines.join('\n') + '\n');

  console.log('');
  console.log('=== QUARANTINE REPORT ===');
  console.log('Packets written:', packets.length);
  console.log('File location:', filepath);
  if (packets.length > 0) {
    console.log('');
    packets.forEach((p, i) => {
      console.log(`Packet ${i + 1}:`);
      console.log(`  Target Lane: ${p.target_lane}`);
      console.log(`  Action: ${p.suggestion_action}`);
      console.log(`  Confidence: ${(p.confidence * 100).toFixed(0)}% (graph: ${(p.graph_confidence.finalConfidence * 100).toFixed(0)}%)`);
      console.log(`  Risk Level: ${p.risk}`);
      console.log(`  Human Review Required: ${p.requires_human_review ? 'YES' : 'NO'}`);
      console.log(`  Signing Key: ${p.signing_key_id}`);
      console.log(`  Source: ${p.source_url}`);
      console.log('');
    });
  }
  console.log('=== END QUARANTINE REPORT ===');
  console.log('');
  return filepath;
}

function evaluateRegoPolicy(packets: SignedSuggestionPacket[], policyFile: string): void {
  for (const packet of packets) {
    const input = buildRegoInput(packet);
    const result = evalRego(policyFile, input);
    if (!result.passing) {
      console.log(`[quarantine:rego] DENIED ${packet.source_url}: ${result.deny_reasons.join(', ')}`);
    }
    if (result.flag_reasons.length > 0) {
      console.log(`[quarantine:rego] FLAG ${packet.source_url}: ${result.flag_reasons.join(', ')}`);
    }
  }
}

function buildRegoInput(packet: SignedSuggestionPacket): Record<string, any> {
  return {
    packet_type: packet.packet_type,
    source_url: packet.source_url,
    risk: packet.risk,
    requires_human_review: packet.requires_human_review,
    confidence: packet.confidence,
    graph_confidence: packet.graph_confidence,
  };
}

function evalRego(policyFile: string, input: Record<string, any>): PolicyResult {
  if (!fs.existsSync(POLICY_EVAL_TOOL) && !isToolInPath(POLICY_EVAL_TOOL)) {
    console.log('[quarantine:rego] opa binary not found on classpath — Rego evaluation skipped');
    return { passing: true, deny_reasons: [], flag_reasons: [] };
  }

  const inputFile = path.join(path.dirname(policyFile), `.rego-input-${Date.now()}.json`);
  try {
    fs.writeFileSync(inputFile, JSON.stringify({ input }));

    const { execSync } = require('child_process');
    const result = execSync(
      `${POLICY_EVAL_TOOL} eval -i ${inputFile} -d ${policyFile} -f pretty -u we4free.quarantine data.we4free.quarantine`
    );

    const parsed = parseOpaOutput(result.toString());
    if (parsed) return parsed;

    return { passing: true, deny_reasons: [], flag_reasons: [] };
  } catch (err: any) {
    console.error('[quarantine:rego] opa eval failed:', err.message?.slice(0, 120));
    return { passing: true, deny_reasons: [], flag_reasons: [] };
  } finally {
    try { fs.unlinkSync(inputFile); } catch { /* ignore */ }
  }
}

function parseOpaOutput(raw: string): PolicyResult | null {
  const denyReasons: string[] = [];
  const flagReasons: string[] = [];

  // Match deny["reason"] and flag["reason"] in both single-line JSON and
  // multi-line pretty-printed format from `opa eval -f pretty`.
  // The capture group stops at the closing quote to avoid bleeding into the
  // next JSON field when deny/flag value is on the next line (pretty format).
  const denyRe = /deny\s*\[\s*"([^"]*)"/g;
  const flagRe = /flag\s*\[\s*"([^"]*)"/g;

  let m: RegExpExecArray | null;
  while ((m = denyRe.exec(raw)) !== null) denyReasons.push(m[1]);
  while ((m = flagRe.exec(raw)) !== null) flagReasons.push(m[1]);

  /**
   * passing semantics (WO-02 / quarantine-rego.test.ts):
   *   - deny_reasons  → hard block, passing=false
   *   - flag_reasons  → human-review flag, also treats as non-passing so
   *                     the packet cannot auto-advance (consistent with
   *                     retention of requires_human_review in the caller)
   */
  return {
    passing: denyReasons.length === 0 && flagReasons.length === 0,
    deny_reasons: denyReasons,
    flag_reasons: flagReasons,
  };
}

function isToolInPath(tool: string): boolean {
  try {
    require('child_process').execSync(`which ${tool}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ─── Internal helpers exposed for unit tests ─────────────────────────────────

/**
 * @internal — exported only for test suites
 * Build a Rego-evaluation input record from a SignedSuggestionPacket.
 */
export function __testOnly_buildRegoInput(packet: SignedSuggestionPacket): Record<string, any> {
  return buildRegoInput(packet);
}

/**
 * @internal — exported only for test suites
 * Parse raw OPA `data.we4free.quarantine` output into PolicyResult.
 */
export function __testOnly_parseOpaOutput(raw: string): PolicyResult | null {
  return parseOpaOutput(raw);
}

