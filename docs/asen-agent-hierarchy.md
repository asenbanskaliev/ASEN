# Agent continuation hierarchy view model

`projectAgentHierarchy` in `src/runtime/agents-panel.ts` is a pure, read-only UI-02 projection. It accepts an already scoped and narrowed snapshot; it does not read stores, render terminal text, inspect Pi messages, or expose actions.

## Input boundary

The parent-owned adapter must supply only agent identity, role, owner attribution, session/project identity, lifecycle state and timestamps, lifecycle events (`id`, `revision`, `state`, `at`), optional `continuationOf`, and exact task audit links. It must scope store reads first and rebuild this DTO rather than spreading persistent entries. Requests, prompts, results, summaries, model/thinking data, process metadata, and transcripts must never enter the view input.

## Output contract

Each deterministic row preserves the opaque agent ID and contains:

- `depth` and `lineage` (`root`, `proven`, or `unresolved`);
- a copied, revision-sorted lifecycle history;
- owner attribution, which is never interpreted as parentage;
- `association`, either `none` or an exact task ID audit badge.

Only a same-scope Explorer `continuationOf` chain proves ancestry. Missing parents, role mismatches, and cycles remain flat and unresolved. Duplicate records, conflicting continuation branches, duplicate/conflicting task links, and foreign links fail closed. Task association grants no authority and Todo dependencies are not agent relationships.

This is a partial continuation-hierarchy slice only. Existing inspection/status formatters and parent-owned UI integration remain responsible for display. The projection makes no launch, cancellation, resume, transcript, notification-consumption, consent, ACK, or canonical UI-02 FULL claim.
