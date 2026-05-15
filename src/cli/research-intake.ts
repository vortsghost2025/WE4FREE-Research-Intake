#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { fetchArxiv } from '../ingest/arxiv';
import { fetchGithub } from '../ingest/github';
import { fetchOsf } from '../ingest/osf';
import { loadRepoManifests } from '../analyze/repo-map';
import { computeSimilarity } from '../analyze/similarity';
import { generateSuggestions } from '../analyze/upgrade-suggestions';
import { writeToQuarantine } from '../output/quarantine';
import { generateBriefing } from '../output/briefing';
import { startDaemon } from '../daemon/scheduler';
import { ResearchArtifact } from '../types';

dotenv.config();

const DEFAULT_TOPICS = [
  'autonomous agents',
  'CUDA GPU optimization',
  'knowledge graph',
  'multi-agent coordination',
  'provenance governance',
  'self-organizing systems',
];

async function runIntake(topics: string[], opts: { quarantineDir: string; briefingDir: string; reposPath: string }) {
  console.log('=== WE4FREE Research Intake ===');
  console.log(`Topics: ${topics.join(', ')}`);
  console.log(`Quarantine dir: ${opts.quarantineDir}`);
  console.log(`Briefing dir: ${opts.briefingDir}`);
  console.log('');

  // 1. Ingest
  console.log('[phase:ingest] Fetching from sources...');
  const arxivResults = await fetchArxiv(topics);
  const githubResults = await fetchGithub(topics);
  const osfResults = await fetchOsf(topics);

  const allArtifacts: ResearchArtifact[] = [
    ...arxivResults,
    ...githubResults,
    ...osfResults,
  ];
  console.log(`[phase:ingest] Discovered ${allArtifacts.length} artifacts`);

  // 2. Load local repo manifests
  const manifests = loadRepoManifests(opts.reposPath);

  // 3. Compare and score
  console.log('[phase:analyze] Computing similarity and scoring...');
  const scored = computeSimilarity(allArtifacts, manifests);

  // 4. Generate suggestions
  const suggestions = generateSuggestions(scored);
  console.log(`[phase:analyze] Generated ${suggestions.length} suggestion packets`);

  // 5. Write quarantine packets
  if (suggestions.length > 0) {
    writeToQuarantine(suggestions, opts.quarantineDir);
  }

  // 6. Generate plain-text briefing
  generateBriefing(scored, opts.briefingDir);

  console.log('');
  console.log('=== Intake run complete ===');
}

const program = new Command();

program
  .name('research-intake')
  .description('WE4FREE Research Ingestion + Evidence Scoring + Autonomous Patch Suggestion')
  .version('0.1.0');

program
  .command('run')
  .description('Run a single intake cycle')
  .option('-t, --topics <topics>', 'Comma-separated topics', DEFAULT_TOPICS.join(','))
  .option('-q, --quarantine-dir <path>', 'Quarantine output directory', process.env.QUARANTINE_DIR || './output/quarantine')
  .option('-b, --briefing-dir <path>', 'Briefing output directory', process.env.BRIEFING_DIR || './output/briefings')
  .option('-r, --repos-path <path>', 'Path to watched repos manifest', process.env.WATCHED_REPOS_PATH || './watched-repos.json')
  .action(async (opts) => {
    const topics = opts.topics.split(',').map((t: string) => t.trim());
    await runIntake(topics, opts);
  });

program
  .command('daemon')
  .description('Run as a daemon with periodic intake cycles')
  .option('-i, --interval <ms>', 'Interval in milliseconds', '3600000')
  .option('-t, --topics <topics>', 'Comma-separated topics', DEFAULT_TOPICS.join(','))
  .option('-q, --quarantine-dir <path>', 'Quarantine output directory', process.env.QUARANTINE_DIR || './output/quarantine')
  .option('-b, --briefing-dir <path>', 'Briefing output directory', process.env.BRIEFING_DIR || './output/briefings')
  .option('-r, --repos-path <path>', 'Path to watched repos manifest', process.env.WATCHED_REPOS_PATH || './watched-repos.json')
  .action(async (opts) => {
    const topics = opts.topics.split(',').map((t: string) => t.trim());
    const interval = parseInt(opts.interval, 10);
    startDaemon(() => runIntake(topics, opts), interval);
  });

program.parse();
