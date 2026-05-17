#!/usr/bin/env node
/**
 * scripts/generate-json-schema.ts
 *
 * Reads each spec file under spec/ and emits a .schema.json alongside it.
 * Run: npx ts-node scripts/generate-json-schema.ts   (in WE4FREE-Ontology/)
 *
 * Convention: every spec/*.schema.ts exports a `*SchemaJSON` constant.
 */

import * as fs from 'fs';
import * as path from 'path';

const SPEC_DIR = path.resolve(__dirname, '..', 'spec');

const specFiles = [
  // artifacts
  'artifacts/research-artifact.schema.ts',
  // graph
  'graph/claim.schema.ts',
  'graph/evidence.schema.ts',
  'graph/authority.schema.ts',
  'graph/contradiction.schema.ts',
  // packets
  'packets/suggestion-packet.schema.ts',
  // scoring
  'scoring/graph-aware-score.schema.ts',
  'scoring/trust-score-entry.schema.ts',
  // lanes
  'lanes/lane-target.schema.ts',
  'lanes/repo-manifest.schema.ts',
];

function jsonConstName(specFileName: string): string {
  const base = path.basename(specFileName, '.schema.ts');
  const words = base
    .split(/[-_]/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  return `${words}JSON`;
}

function outputFileName(specFileName: string): string {
  return path.basename(specFileName, '.ts') + 'on';
}

for (const file of specFiles) {
  const srcPath = path.join(SPEC_DIR, file);
  const outName = outputFileName(file);
  const outPath = path.join(SPEC_DIR, path.dirname(file), outName);

  if (!fs.existsSync(srcPath)) {
    console.error(`[schema-gen] Source not found: ${srcPath}`);
    continue;
  }

  // Read source and extract the JSON Schema const assignment
  const src = fs.readFileSync(srcPath, 'utf-8');
  const constName = jsonConstName(file);
  const regex = new RegExp(`export\\s+const\\s+${constName}\\s*=\\s*(\\{[\s\\S]*?\\});`);
  const match = src.match(regex);

  if (!match) {
    console.error(`[schema-gen] Could not find const ${constName} in ${srcPath}`);
    continue;
  }

  const jsonStr = match[1];
  try {
    // Validate it is proper JSON (it is JS — may have trailing commas)
    const cleaned = jsonStr.replace(/,\s*([\]}])/g, '$1');
    const parsed = JSON.parse(cleaned);
    fs.writeFileSync(outPath, JSON.stringify(parsed, null, 2) + '\n');
    console.log(`[schema-gen] ${outName} ← ${path.basename(file)}`);
  } catch (err: any) {
    console.error(`[schema-gen] JSON parse error in ${path.basename(file)}: ${err.message}`);
  }
}

console.log('[schema-gen] Done.');
