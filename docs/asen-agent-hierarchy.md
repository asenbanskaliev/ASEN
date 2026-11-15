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

## Native Agent navigator integration

The optional native source member is `source.hierarchy: readonly M2AgentHierarchyBinding[]`. Each binding is deeply read-only in use and must satisfy `binding.id === binding.inspection.record.id === binding.hierarchy.id`; its `inspection` is the same object present in `source.agents`. Missing, duplicate, mismatched, orphaned, or cyclic bindings fail closed. When `source.hierarchy` is absent, the legacy flat Agent order, labels, help, selection, and refresh behavior are unchanged. Jobs never read this member.

The entrypoint builds this metadata only from the current scoped `AgentRuntime.list`, `runtime.store.get(fullId, sessionId, projectId)`, and optional `TaskAgentLinkStore.list(identity)` results. Every store entry is narrowed immediately: hierarchy records contain only public identity/role/owner/scope/state/timestamps, lifecycle `id/revision/state/at`, and optional `request.continuationOf`; task links contain only task/agent/scope IDs. Request prompts, results, summaries, model/thinking/process/dedupe fields and transcripts are not read or copied. The original `AgentInspection` object remains bound to the row so existing Stop ownership uses the full opaque record ID rather than rendered labels or hierarchy position.

The navigator renders proven Explorer continuations directly after their parent, while roots retain deterministic projection order. Unresolved lineage stays flat and explicitly marked unresolved. List and detail views add only continuation and task-audit annotations through the existing navigator and `renderAgentInspection`; no second viewer or inspection formatter is introduced.

The read-only modal captures one trusted session/project selection. Existing `panelScope` checks guard the bounded list/get/link collection and UI publication boundaries; a scope switch while collection is pending returns the existing generic scoped result without opening `ui.custom`, dispatching an action, or publishing late output. Stop, direct-ID inspection, select behavior, and their existing freshness checks remain unchanged. Invalid hierarchy refresh metadata retains the prior snapshot and reports generic refresh unavailability.

This is a partial continuation-hierarchy slice only. It adds no Resume key/action, Review wiring, launch, transcript, notification-consumption, consent, ACK, or canonical UI-02 FULL claim.
