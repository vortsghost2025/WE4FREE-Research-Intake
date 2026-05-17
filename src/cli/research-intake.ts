#!/usr/bin/env node

import { Command } from 'commander';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { fetchArxiv } from '../ingest/arxiv';
import { fetchGithub } from '../ingest/github';
import { fetchOsf } from '../ingest/osf';
import { fetchOpenAlex } from '../ingest/openalex';
import { fetchSemanticScholar } from '../ingest/semantic-scholar';
import { fetchWebSearch } from '../ingest/web-search';
import { loadRepoManifests } from '../analyze/repo-map';
import { computeSimilarity } from '../analyze/similarity';
import { generateSuggestions } from '../analyze/upgrade-suggestions';
import { signPacket } from '../analyze/sign-packet';
import { verifyPacket } from '../analyze/verify-packet';
import { requiresHumanReview } from '../analyze/human-review-gate';
import { writeToQuarantine } from '../output/quarantine';
import { generateBriefing } from '../output/briefing';
import { startDaemon } from '../daemon/scheduler';
import { compileIntakeWorkflow, IntakeWorkflowOptions } from '../daemon/workflow';
import { ResearchArtifact, SignedSuggestionPacket, FeedbackOutcome, PacketFormat } from '../types';
import { loadSeenIds, saveSeenIds, deduplicateArtifacts } from '../ingest/dedup';
import { canonicalize } from '../canonicalize/canonicalizer';
import { GraphStore } from '../graph/graph-store';
import { findContradictions, findUnresolved, getStats, findRelatedClaims, findAuthorityChain } from '../graph/graph-queries';
import { exportGraphToFile } from '../graph/graph-export';
import { autoApply, loadApplied } from '../analyze/auto-apply';
import { rollback } from '../analyze/rollback';
import { recordFeedback, loadFeedback } from '../analyze/feedback-loop';
import { updateTrustScores, loadTrustScores, getTrustScore } from '../analyze/trust-score';
import { detectDegradedSuggestions } from '../analyze/self-heal';
import { replay } from '../analyze/replay';

dotenv.config();

const DEFAULT_TOPICS = [
  'autonomous agents',
  'CUDA GPU optimization',
  'knowledge graph',
  'multi-agent coordination',
  'provenance governance',
  'self-organizing systems',
];

const DEFAULT_GRAPH_DIR = process.env.GRAPH_DIR || './output/graph';
const DEFAULT_AUTONOMOUS_DIR = process.env.AUTONOMOUS_DIR || './output/autonomous';

async function runIntake(topics: string[], opts: { quarantineDir: string; briefingDir: string; reposPath: string; graphDir: string; autonomousDir: string; autoApplyFlag: boolean; format?: string; workflow?: boolean }) {
  if (opts.workflow) {
    await runWorkflow(topics, { topics, reposPath: opts.reposPath, format: opts.format });
    return;
  }
  console.log('=== WE4FREE Research Intake (sequential) ===');
  console.log(`Topics: ${topics.join(', ')}`);
  console.log(`Quarantine dir: ${opts.quarantineDir}`);
  console.log(`Briefing dir: ${opts.briefingDir}`);
  console.log('');

  console.log('[phase:ingest] Fetching from sources...');
  const arxivResults = await fetchArxiv(topics);
  const githubResults = await fetchGithub(topics);
  const osfResults = await fetchOsf(topics);
  const openalexResults = await fetchOpenAlex(topics);
  const s2Results = await fetchSemanticScholar(topics);
  const webResults = await fetchWebSearch(topics);

  const allArtifacts: ResearchArtifact[] = [
    ...arxivResults,
    ...githubResults,
    ...osfResults,
    ...openalexResults,
    ...s2Results,
    ...webResults,
  ];
  console.log(`[phase:ingest] Discovered ${allArtifacts.length} artifacts`);

  const seenIds = loadSeenIds(opts.quarantineDir);
  const { newArtifacts, updatedIds } = deduplicateArtifacts(allArtifacts, seenIds);
  console.log(`[phase:ingest] ${newArtifacts.length} new artifacts (${allArtifacts.length - newArtifacts.length} duplicates skipped)`);
  saveSeenIds(opts.quarantineDir, updatedIds);

  console.log('[phase:canonicalize] Building canonical graph...');
  const incomingGraph = canonicalize(newArtifacts);
  const incomingStats = {
    claims: incomingGraph.claims.size,
    evidence: incomingGraph.evidence.size,
    authorityLinks: incomingGraph.authorityLinks.size,
    contradictions: incomingGraph.contradictions.size,
  };
  console.log(`[phase:canonicalize] Extracted ${incomingStats.claims} claims, ${incomingStats.evidence} evidence, ${incomingStats.authorityLinks} authority links, ${incomingStats.contradictions} contradictions`);

  const store = new GraphStore(opts.graphDir);
  store.load();
  const added = store.merge(incomingGraph);
  console.log(`[phase:canonicalize] Merged ${added} new entities into graph`);
  store.save();
  store.appendJSONL();

  const manifests = loadRepoManifests(opts.reposPath);
  const graph = store.get();

  console.log('[phase:analyze] Computing similarity and scoring...');
  const scored = computeSimilarity(newArtifacts, manifests);

  const unsignedSuggestions = generateSuggestions(scored, graph, manifests);
  console.log(`[phase:analyze] Generated ${unsignedSuggestions.length} suggestion packets`);

  const fixedFormat = opts.format === 'hmac' || opts.format === 'in-toto' ? (opts.format as 'hmac' | 'in-toto') : undefined;
  const signedSuggestions: SignedSuggestionPacket[] = unsignedSuggestions.map(p => {
    const signed = signPacket(p, undefined, fixedFormat);
    const needsReview = requiresHumanReview(signed, graph);
    return { ...signed, requires_human_review: needsReview };
  });
  const reviewCount = signedSuggestions.filter(s => s.requires_human_review).length;
  console.log(`[phase:analyze] ${reviewCount} of ${signedSuggestions.length} packets require human review`);

  if (signedSuggestions.length > 0) {
    writeToQuarantine(signedSuggestions, opts.quarantineDir);
  }

  generateBriefing(scored, opts.briefingDir);

  if (opts.autoApplyFlag && signedSuggestions.length > 0) {
    console.log('[phase:autonomous] Auto-applying eligible suggestions...');
    const applied = autoApply(signedSuggestions, opts.autonomousDir, graph);
    console.log(`[phase:autonomous] ${applied.length} packets auto-applied`);
  }

  console.log('');
  console.log('=== Intake run complete ===');
}

async function runWorkflow(topics: string[], opts: { topics: string[]; reposPath: string; format?: string }) {
  console.log('=== WE4FREE Research Intake (LangGraph workflow mode) ===');
  const workflow = compileIntakeWorkflow();

  const fixedFormat = opts.format === 'hmac' || opts.format === 'in-toto' ? (opts.format as 'hmac' | 'in-toto') : undefined;

  const initial = {
    topics,
    reposPath: opts.reposPath,
    signingFormat: fixedFormat || 'hmac',
    artifacts: [],
    manifests: [],
    scoredSuggestions: [],
    unsignedSuggestions: [],
    signedSuggestions: [],
    checkedSuggestions: [],
  };

  console.log('[workflow] Invoking...');
  const result = await workflow.invoke(initial);
  console.log('[workflow] Completed.');
  console.log(`[workflow] Total suggestions: ${result.checkedSuggestions?.length || 0}`);
}

const program = new Command();

program
  .name('research-intake')
  .description('WE4FREE Research Ingestion + Evidence Scoring + Autonomous Patch Suggestion')
  .version('0.2.0');

program
  .command('run')
  .description('Run a single intake cycle')
  .option('-t, --topics <topics>', 'Comma-separated topics', DEFAULT_TOPICS.join(','))
  .option('-q, --quarantine-dir <path>', 'Quarantine output directory', process.env.QUARANTINE_DIR || './output/quarantine')
  .option('-b, --briefing-dir <path>', 'Briefing output directory', process.env.BRIEFING_DIR || './output/briefings')
  .option('-r, --repos-path <path>', 'Path to watched repos manifest', process.env.WATCHED_REPOS_PATH || './watched-repos.json')
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .option('--auto-apply', 'Auto-apply eligible suggestions after intake', false)
  .option('--format <format>', 'Packet signing format: hmac | in-toto', 'hmac')
  .option('--workflow', 'Use LangGraph workflow mode instead of sequential run', false)
  .option('-a, --autonomous-dir <path>', 'Autonomous state directory', DEFAULT_AUTONOMOUS_DIR)
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
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .option('-a, --autonomous-dir <path>', 'Autonomous state directory', DEFAULT_AUTONOMOUS_DIR)
  .option('--format <format>', 'Packet signing format: hmac | in-toto', 'hmac')
  .action(async (opts) => {
    const topics = opts.topics.split(',').map((t: string) => t.trim());
    const interval = parseInt(opts.interval, 10);
    startDaemon(() => runIntake(topics, opts), interval);
  });

const graphCmd = program.command('graph').description('Query and export the canonical graph');

graphCmd
  .command('stats')
  .description('Print graph statistics')
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .action((opts) => {
    const store = new GraphStore(opts.graphDir);
    store.load();
    const stats = store.stats();
    console.log('Graph Statistics:');
    console.log(`  Claims:          ${stats.claims}`);
    console.log(`  Evidence:        ${stats.evidence}`);
    console.log(`  Authority Links: ${stats.authorityLinks}`);
    console.log(`  Contradictions:  ${stats.contradictions}`);
    console.log(`  Artifacts:       ${stats.artifacts}`);
  });

graphCmd
  .command('contradictions')
  .description('List detected contradictions')
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .option('-c, --claim-id <id>', 'Filter by claim ID')
  .action((opts) => {
    const store = new GraphStore(opts.graphDir);
    store.load();
    const graph = store.get();
    const edges = findContradictions(graph, opts.claimId);
    if (edges.length === 0) {
      console.log('No contradictions found.');
      return;
    }
    for (const edge of edges) {
      const claimA = graph.claims.get(edge.claimAId);
      const claimB = graph.claims.get(edge.claimBId);
      console.log(`[${edge.id}] strength=${edge.strength.toFixed(2)} reason="${edge.reason}"`);
      console.log(`  A: ${claimA?.text || edge.claimAId}`);
      console.log(`  B: ${claimB?.text || edge.claimBId}`);
    }
  });

graphCmd
  .command('unresolved')
  .description('List unverified claims without contradictions')
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .action((opts) => {
    const store = new GraphStore(opts.graphDir);
    store.load();
    const claims = findUnresolved(store.get());
    if (claims.length === 0) {
      console.log('No unresolved claims.');
      return;
    }
    for (const claim of claims) {
      console.log(`[${claim.id}] confidence=${claim.confidence.toFixed(2)} "${claim.text.slice(0, 80)}"`);
    }
  });

graphCmd
  .command('related <claimId>')
  .description('Find claims related to a given claim')
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .action((claimId, opts) => {
    const store = new GraphStore(opts.graphDir);
    store.load();
    const related = findRelatedClaims(store.get(), claimId);
    if (related.length === 0) {
      console.log('No related claims found.');
      return;
    }
    for (const c of related) {
      console.log(`[${c.id}] veracity=${c.veracity} confidence=${c.confidence.toFixed(2)} "${c.text.slice(0, 80)}"`);
    }
  });

graphCmd
  .command('authority <artifactId>')
  .description('Trace authority chain from an artifact')
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .option('-d, --depth <n>', 'Traversal depth', '3')
  .action((artifactId, opts) => {
    const store = new GraphStore(opts.graphDir);
    store.load();
    const links = findAuthorityChain(store.get(), artifactId, parseInt(opts.depth, 10));
    if (links.length === 0) {
      console.log('No authority links found.');
      return;
    }
    for (const link of links) {
      console.log(`[${link.id}] ${link.fromArtifactId} --${link.type}(${link.weight.toFixed(2)})--> ${link.toArtifactId}`);
    }
  });

graphCmd
  .command('export')
  .description('Export graph as JSON for Lattice-Deck visualization')
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .option('-o, --output-dir <path>', 'Output directory for exported file', process.env.BRIEFING_DIR || './output/briefings')
  .action((opts) => {
    const store = new GraphStore(opts.graphDir);
    store.load();
    const filePath = exportGraphToFile(store.get(), opts.outputDir);
    console.log(`Graph exported to: ${filePath}`);
  });

program
  .command('verify <file>')
  .description('Verify HMAC signature of a signed suggestion packet JSON file')
  .option('-k, --key <key>', 'Signing key (defaults to SUGGESTION_SIGNING_KEY env or derived default)')
  .action((file, opts) => {
    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(file, 'utf-8');
    const lines = raw.trim().split('\n').filter((l: string) => l.trim());
    let valid = 0;
    let invalid = 0;
    for (const line of lines) {
      try {
        const packet: SignedSuggestionPacket = JSON.parse(line);
        if (verifyPacket(packet, opts.key)) {
          console.log(`VALID  [${packet.signing_key_id}] ${packet.source_url}`);
          valid++;
        } else {
          console.log(`INVALID  ${packet.source_url}`);
          invalid++;
        }
      } catch (err) {
        console.log(`INVALID  (parse error: ${err})`);
        invalid++;
      }
    }
    console.log(`\nResults: ${valid} valid, ${invalid} invalid out of ${lines.length} packets`);
    process.exit(invalid > 0 ? 1 : 0);
  });

program
  .command('auto-apply')
  .description('Auto-apply eligible signed packets from quarantine')
  .option('-q, --quarantine-dir <path>', 'Quarantine directory', process.env.QUARANTINE_DIR || './output/quarantine')
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .option('-a, --autonomous-dir <path>', 'Autonomous state directory', DEFAULT_AUTONOMOUS_DIR)
  .action((opts) => {
    const store = new GraphStore(opts.graphDir);
    store.load();
    const graph = store.get();

    const quarantineFile = path.join(opts.quarantineDir, 'quarantine.jsonl');
    if (!fs.existsSync(quarantineFile)) {
      console.log('No quarantine file found.');
      return;
    }
    const raw = fs.readFileSync(quarantineFile, 'utf-8');
    const lines = raw.trim().split('\n').filter(l => l.trim());
    const packets: SignedSuggestionPacket[] = [];
    for (const line of lines) {
      try { packets.push(JSON.parse(line)); } catch {}
    }
    if (packets.length === 0) {
      console.log('No signed packets in quarantine.');
      return;
    }
    const applied = autoApply(packets, opts.autonomousDir, graph);
    console.log(`Auto-applied ${applied.length} of ${packets.length} packets`);
    for (const a of applied) {
      console.log(`  [${a.packet_id}] ${a.original_packet.suggestion_action} -> ${a.target_repo}`);
    }
  });

program
  .command('rollback <packetId>')
  .description('Roll back an auto-applied or human-approved packet')
  .option('-a, --autonomous-dir <path>', 'Autonomous state directory', DEFAULT_AUTONOMOUS_DIR)
  .option('--reason <reason>', 'Reason for rollback', 'manual rollback')
  .action((packetId, opts) => {
    const record = rollback(packetId, opts.reason, opts.autonomousDir, 'human');
    if (!record) {
      console.log(`Could not roll back packet ${packetId}. Not found or not in rollbackable state.`);
      return;
    }
    console.log(`Rolled back packet ${record.packet_id} at ${record.rolled_back_at}`);
    console.log(`Reason: ${record.reason}`);
  });

const VALID_OUTCOMES: FeedbackOutcome[] = ['success', 'failure', 'partial', 'no_effect', 'pending'];

program
  .command('feedback <packetId> <outcome>')
  .description('Record feedback outcome for an applied packet')
  .option('-a, --autonomous-dir <path>', 'Autonomous state directory', DEFAULT_AUTONOMOUS_DIR)
  .option('--details <details>', 'Optional details string')
  .action((packetId, outcome, opts) => {
    if (!VALID_OUTCOMES.includes(outcome as FeedbackOutcome)) {
      console.error(`Invalid outcome "${outcome}". Must be one of: ${VALID_OUTCOMES.join(', ')}`);
      process.exit(1);
    }
    const entry = recordFeedback(packetId, outcome as FeedbackOutcome, opts.autonomousDir, opts.details);
    console.log(`Recorded ${entry.outcome} for packet ${entry.packet_id}`);
    console.log(`Confidence: ${entry.confidence_before.toFixed(2)} -> ${entry.confidence_after.toFixed(2)}`);
  });

program
  .command('replay')
  .description('Replay autonomous system event log chronologically')
  .option('-a, --autonomous-dir <path>', 'Autonomous state directory', DEFAULT_AUTONOMOUS_DIR)
  .option('--from <timestamp>', 'Filter events from ISO timestamp')
  .action((opts) => {
    const events = replay(opts.autonomousDir, opts.from);
    if (events.length === 0) {
      console.log('No autonomous events found.');
      return;
    }
    for (const e of events) {
      const pkt = e.packet_id ? ` [${e.packet_id}]` : '';
      console.log(`${e.timestamp} ${e.type}${pkt} ${JSON.stringify(e.details)}`);
    }
  });

program
  .command('trust')
  .description('Update and display trust scores for graph entities')
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .option('-a, --autonomous-dir <path>', 'Autonomous state directory', DEFAULT_AUTONOMOUS_DIR)
  .action((opts) => {
    const store = new GraphStore(opts.graphDir);
    store.load();
    const entries = updateTrustScores(store.get(), opts.autonomousDir);
    if (entries.length === 0) {
      console.log('No trust score entries.');
      return;
    }
    for (const t of entries) {
      console.log(`[${t.source_type}] ${t.source_id}: trust=${t.trust_score.toFixed(3)} evidence=${t.evidence_count} contrad=${t.contradiction_count}`);
    }
  });

program
  .command('self-heal')
  .description('Detect and flag degraded autonomous suggestions')
  .option('-g, --graph-dir <path>', 'Graph data directory', DEFAULT_GRAPH_DIR)
  .option('-a, --autonomous-dir <path>', 'Autonomous state directory', DEFAULT_AUTONOMOUS_DIR)
  .action((opts) => {
    const store = new GraphStore(opts.graphDir);
    store.load();
    const degraded = detectDegradedSuggestions(store.get(), opts.autonomousDir);
    if (degraded.length === 0) {
      console.log('No degraded suggestions detected.');
      return;
    }
    console.log(`${degraded.length} degraded suggestions:`);
    for (const d of degraded) {
      console.log(`  [${d.packet_id}] state=${d.state} action=${d.original_packet.suggestion_action} repo=${d.target_repo}`);
    }
  });

program.parse();
