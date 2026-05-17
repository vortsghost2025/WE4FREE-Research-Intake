import { Annotation, StateGraph, Command, END, START, MemorySaver } from '@langchain/langgraph';
import { ResearchArtifact, SignedSuggestionPacket } from '../types';
import { loadRepoManifests } from '../analyze/repo-map';
import { computeSimilarity } from '../analyze/similarity';
import { generateSuggestions } from '../analyze/upgrade-suggestions';
import { requiresHumanReview } from '../analyze/human-review-gate';
import { signPacket } from '../analyze/sign-packet';

/**
 * LangGraph IntakeState — shared state passed between nodes.
 * Each node returns a Partial<IntakeState>, which LangGraph merges.
 */
const IntakeState = Annotation.Root({
  /** Raw discovered artifacts */
  artifacts: Annotation<ResearchArtifact[]>({ reducer: (a: ResearchArtifact[], b: ResearchArtifact[]) => a.concat(b) }),
  /** Topic strings used for discovery */
  topics: Annotation<string[]>({ reducer: (a: string[], b: string[]) => a.concat(b) }),
  /** Path to watched-repos manifest */
  reposPath: Annotation<string>,
  /** Manifests loaded from watched-repos.json */
  manifests: Annotation<any[]>(),

  // ── normalized / scored ──
  scoredSuggestions: Annotation<any[]>({ reducer: (a: any[], b: any[]) => a.concat(b) }),
  unsignedSuggestions: Annotation<SignedSuggestionPacket[]>({ reducer: (a: SignedSuggestionPacket[], b: SignedSuggestionPacket[]) => a.concat(b) }),
  signedSuggestions: Annotation<SignedSuggestionPacket[]>({ reducer: (a: SignedSuggestionPacket[], b: SignedSuggestionPacket[]) => a.concat(b) }),

  // ── quarantine gate ──
  checkedSuggestions: Annotation<SignedSuggestionPacket[]>({ reducer: (a: SignedSuggestionPacket[], b: SignedSuggestionPacket[]) => a.concat(b) }),

  // ── CLI options ──
  signingFormat: Annotation<string>(),
});

export interface IntakeWorkflowOptions {
  reposPath: string;
  signingFormat?: string;
}

/**
 * Build a LangGraph StateGraph wrapping the research-intake pipeline.
 *
 * Nodes:
 *   discover     — fetch from all sources (placeholder artifacts stage)
 *   normalize    — load manifests, compute similarity, generate unsigned suggestions
 *   quarantine   — sign suggestions, run human-review gate
 *   sign_and_report — sign + human-review (continues after interrupt resume)
 *   end          — terminal
 *
 * Quarantine node pauses for human-in-the-loop via interrupt.
 * After review, call `workflow.resume(commandId, "review:approved")` to continue.
 */
export function buildIntakeGraph() {
  const graph = new StateGraph(IntakeState)
    .addNode('discover', nodeDiscover)
    .addNode('normalize', nodeNormalize)
    .addNode('quarantine', nodeQuarantine)
    .addNode('sign_and_report', nodeSignAndReport)

    .addEdge(START, 'discover')
    .addEdge('discover', 'normalize')
    .addEdge('normalize', 'quarantine')
    .addEdge('sign_and_report', END);

  return graph;
}

/** Build and compile the workflow with an in-memory checkpoint saver. */
export function compileIntakeWorkflow() {
  const graph = buildIntakeGraph();
  return graph.compile({ checkpointer: new MemorySaver() });
}

// ── Node implementations ──────────────────────────────────────────────
// Each node takes the current state slice and returns a Partial state update.

async function nodeDiscover(state: typeof IntakeState.State): Promise<Partial<typeof IntakeState.State>> {
  const topics = state.topics;
  console.log(`[workflow:discover] Topics: ${topics.join(', ')}`);

  const { fetchArxiv } = await import('../ingest/arxiv');
  const { fetchGithub } = await import('../ingest/github');
  const { fetchOsf } = await import('../ingest/osf');
  const { fetchOpenAlex } = await import('../ingest/openalex');
  const { fetchSemanticScholar } = await import('../ingest/semantic-scholar');
  const { fetchWebSearch } = await import('../ingest/web-search');
  const { deduplicateArtifacts, loadSeenIds, saveSeenIds } = await import('../ingest/dedup');

  const [arxiv, github, osf, openalex, s2, web] = await Promise.all([
    fetchArxiv(topics),
    fetchGithub(topics),
    fetchOsf(topics),
    fetchOpenAlex(topics),
    fetchSemanticScholar(topics),
    fetchWebSearch(topics),
  ]);

  const combined: ResearchArtifact[] = [];
  combined.push(...arxiv, ...github, ...osf, ...openalex, ...s2, ...web);
  console.log(`[workflow:discover] Discovered ${combined.length} raw artifacts`);

  const seenIds = loadSeenIds('./output/quarantine');
  const { newArtifacts, updatedIds } = deduplicateArtifacts(combined, seenIds);
  console.log(`[workflow:discover] ${newArtifacts.length} new (${combined.length - newArtifacts.length} duplicates skipped)`);
  saveSeenIds('./output/quarantine', updatedIds);

  return {
    artifacts: newArtifacts,
  } as Partial<typeof IntakeState.State>;
}

async function nodeNormalize(state: typeof IntakeState.State): Promise<Partial<typeof IntakeState.State>> {
  const { canonicalize } = await import('../canonicalize/canonicalizer');
  const { GraphStore } = await import('../graph/graph-store');

  console.log('[workflow:normalize] Canonicalizing and scoring...');

  const graph = new GraphStore('./output/graph');
  graph.load();
  const incoming = canonicalize(state.artifacts);
  const _added = graph.merge(incoming);
  graph.save();
  graph.appendJSONL();

  const manifests = loadRepoManifests(state.reposPath);
  const scored = computeSimilarity(state.artifacts, manifests);
  const unsigned = generateSuggestions(scored, graph.get(), manifests);

  console.log(`[workflow:normalize] ${scored.length} scored, ${unsigned.length} suggestions`);

  return {
    manifests,
    scoredSuggestions: scored,
    unsignedSuggestions: unsigned,
  } as Partial<typeof IntakeState.State>;
}

async function nodeQuarantine(state: typeof IntakeState.State): Promise<Partial<typeof IntakeState.State> | Command<any, any, any>> {
  const { GraphStore } = await import('../graph/graph-store');
  const store = new GraphStore('./output/graph');
  store.load();
  const graph = store.get();

  console.log('[workflow:quarantine] Signing and gating...');

  const signed = state.unsignedSuggestions.map((p: SignedSuggestionPacket) =>
    signPacket(p, undefined, state.signingFormat as any)
  );

  const checked = signed.map((p: SignedSuggestionPacket) => {
    const needsReview = requiresHumanReview(p, graph);
    return { ...p, requires_human_review: needsReview };
  });

  const flagged = checked.filter((p: SignedSuggestionPacket) => p.requires_human_review);
  console.log(`[workflow:quarantine] ${flagged.length} flagged, ${checked.length - flagged.length} cleared`);

  if (flagged.length > 0) {
    console.log('[workflow:quarantine] INTERRUPT: human review required for', flagged.length, 'packets');
    return new Command({
      update: { checkedSuggestions: checked },
      resume: { action: 'review_required', flagged_count: flagged.length },
    });
  }

  return { checkedSuggestions: checked } as Partial<typeof IntakeState.State>;
}

async function nodeSignAndReport(state: typeof IntakeState.State): Promise<Partial<typeof IntakeState.State>> {
  const { writeToQuarantine } = await import('../output/quarantine');
  const { generateBriefing } = await import('../output/briefing');

  console.log('[workflow:sign_and_report] Writing quarantine and briefing...');

  const packets = state.checkedSuggestions;
  if (packets.length > 0) {
    writeToQuarantine(packets, './output/quarantine');
  }

  generateBriefing(state.scoredSuggestions, './output/briefings');

  return {} as Partial<typeof IntakeState.State>;
}
