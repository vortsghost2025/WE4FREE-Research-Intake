# Work Orders

Pre-written task descriptions for batch processing. Drop `.md` files here when you think of work items, then point me at the directory and I'll process them in parallel.

## Format

```markdown
# task: short-name

## What
One sentence describing what to do.

## Files
- path/to/file.ts — what to change

## Details
Specific instructions, edge cases, constraints.

## Verify
- `npm run build`
- `npm test`
```

## Rules
- One file per task. Keep it small.
- Reference design docs by number (design1.txt, design3.txt).
- If it needs research (web search, API docs), say so.
- If it needs multiple phases, split into separate files.
