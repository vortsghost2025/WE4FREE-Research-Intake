# task: spike LangGraph state machine for intake pipeline

## What
Wrap the sequential `runIntake()` function as a LangGraph StateGraph with checkpointing and a quarantine interrupt.

## Phase
design3.txt Phase 2

## Files
- New: `src/daemon/workflow.ts` — LangGraph state machine definition
- New: `src/daemon/workflow.test.ts` — workflow tests
- Modified: `src/cli/research-intake.ts` — add `--workflow` flag
- `package.json` — add `@langchain/langgraph` dependency

## Details
- Define `IntakeState` interface: `{ artifacts, graph, scored, suggestions, settings }`
- Create nodes: `discover`, `normalize`, `score`, `quarantine`, `sign`, `report`
- Each node wraps the existing module function (no logic rewrite)
- Quarantine node uses `Command.RESUME` interrupt for human-in-the-loop
- Checkpointer persists to local file or SQLite
- `--workflow` flag switches between sequential `runIntake()` and LangGraph mode
- Write test: graph runs 3 sequential nodes and state persists

## Verify
- `npm run build`
- Minimal graph runs an intake cycle successfully
- Checkpoint file is written between nodes
- Interrupt pauses graph at quarantine step
