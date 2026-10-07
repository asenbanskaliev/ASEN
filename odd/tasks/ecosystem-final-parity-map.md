# Final ecosystem parity map

## Purpose

This is the controlling reverse-audit map for the final ASEN ecosystem closure. It complements `ecosystem-strict-parity.md`: a numbered ECO unit is not sufficient evidence by itself. Final parity requires every observable Reference A surface to map to an ASEN behavior, an automated/runtime proof, or an explicit permitted difference.

Reference A remains pinned to `08de420ca29be16b6f6bee725a30b599b061df16`. Do not copy branding, artwork, prose, names or provider-private authority.

## Closure rule

For every row use:

`Reference surface -> ASEN surface -> implementation -> deterministic evidence -> host/platform evidence -> status`

Allowed statuses are `FULL`, `PARTIAL`, `MISSING`, `OUT_OF_SCOPE`, and `PARTIAL_BY_ACCEPTED_SCOPE`. No row becomes `FULL` from file presence or a green broad suite alone.

## Route map

| Route | Observable surface | ECO owner | Current state | Closure target |
| --- | --- | --- | --- | --- |
| R01 | install, executable, package root, project/user homes, setup/link | ECO-09 | PARTIAL | clean install, idempotency, rollback, permissions, spaces/Unicode, Windows/macOS/Linux |
| R02 | public commands, arguments, errors and availability | ECO-09/14/15 | PARTIAL | exact command inventory and behavior-backed validation |
| R03 | configuration, settings, precedence and invalid values | ECO-11 | MISSING | schema, deterministic precedence, diagnostics, rollback, live/restart semantics |
| R04 | profiles, routing and customization | ECO-11 | PARTIAL | safe overrides/fallbacks and exact routing evidence |
| R05 | actor/owner/session attribution for changes | ECO-10 | PARTIAL | exact actor/session/project/worktree attribution without authority inflation |
| R06 | workspace state/actions and concurrent updates | ECO-10 | PARTIAL | accessible narrow-terminal UI, conflicts, restart and isolation |
| R07 | theme, colors, banner, pretty/quiet and non-TTY presentation | ECO-14 | PARTIAL | ASEN-owned presentation contract; width/color/accessibility snapshots and host evidence |
| R08 | keyboard/interaction/dialog behavior | ECO-03/14 | PARTIAL | choice/question plus applicable shortcuts/actions, cancel/error/unavailable behavior |
| R09 | agent lifecycle/UI/RPC | ECO-05/06 | PARTIAL | queue/cancel/continue/status/history/ownership/restart and orchestrator composition |
| R10 | Todo/plans/replay | ECO-07 | PARTIAL | durable transitions, replay, conflicts, stale plans, crash/session isolation |
| R11 | Skill discovery/registry lifecycle | ECO-08 | PARTIAL | missing/recreated sources and cross-platform startup/restart evidence |
| R12 | tools and authority | ECO-03/04/05/06 | PARTIAL | complete public inventory, fail-closed forbidden calls, no acquired authority |
| R13 | sessions/resume/recovery | ECO-14 | PARTIAL | startup/restart/corruption recovery and presentation integration |
| R14 | private prompt history | ECO-12 | PARTIAL | explicit opt-in, redact-before-write, retention/search/export/delete/tombstones/recovery |
| R15 | local usage and optional telemetry | ECO-13 | PARTIAL | local-first metrics, explicit one-shot consent/preview, minimization, disable/delete, no hidden send |
| R16 | public package/API/extension exports | ECO-02/15 | PARTIAL | packed artifact and private-path rejection on final candidate/platforms |
| R17 | docs, links, examples, command references and media provenance | ECO-01/15 | PARTIAL | behavior-backed docs and automated link/command/claim/media validation |
| R18 | reverse inventory completeness | ECO-01C/01E/16 | PARTIAL | every frozen command/tool/event/config/asset/reference adjudicated; drift invalidates affected claims |
| R19 | memory integration with ecosystem | MEM R01-R09 + ECO composition | COVERED/PARTIAL integration | do not redesign memory; prove only ecosystem-facing composition |
| R20 | failure/recovery/platform matrix | ECO-16 | PARTIAL | positive, rejection, failure, recovery, restart and applicable Windows/macOS/Linux evidence |

## Dependency-optimized implementation order

1. Stabilize the current candidate on Linux, macOS and Windows.
2. Complete reverse inventory R02/R03/R07/R08/R18 before adding broad runtime so omitted surfaces are found early.
3. Foundation batch: ECO-09 + ECO-11, including command/configuration inventory.
4. Workspace batch: ECO-10 plus missing public agent ownership/status composition from ECO-05/06.
5. User-state batch: ECO-12 + ECO-13 without changing the admitted memory core.
6. Presentation batch: ECO-14, explicitly including theme/colors/banner/pretty/quiet/non-TTY/width/accessibility and applicable interaction/shortcut inventory.
7. Reconcile remaining ECO-03..08 gaps found by the reverse audit.
8. ECO-15A/B/C only after shipped behavior exists.
9. ECO-16 runs both directions: ASEN -> requirements and Reference A -> ASEN.
10. Final exact-SHA platform/release gates; no merge or release without separate authorization.

## Audit invariants

- Search existing ASEN implementation and tests before writing anything.
- A missing roadmap row does not make a Reference A behavior optional.
- Memory R01-R09 is not an implementation queue.
- GSP-06 remains closed at the accepted provider-limited scope; do not fabricate provider PASS.
- Model output cannot mint write/review/delivery/merge/release authority.
- Forbidden tools: zero executions. A blocked attempt may be recorded only as an attempt.
- Prefer deterministic/local evidence; use consolidated remote CI only for platform/host boundaries.
- Every stable work block is committed and pushed before beginning another large block.

## Task replay ownership and evidence

Current route-by-route evidence and remaining gaps are recorded in `docs/audit/ecosystem-current-state-r03-r10.md`.

These three surfaces have separate responsibilities and do not create competing sources of truth:

| Surface | Responsibility | Durable source |
| --- | --- | --- |
| `src/runtime/task-replay.ts` | Validate ordered task state transitions and reject stale revisions or identity changes. | None by itself; pure validation/projection only. |
| `src/flow/odd-task-tracking.ts` | Mirror the complete bound ODD task document and TODO/resume data; append validated task events to that same record. | Existing project/session `MemoryStore`, under the existing ODD tracking item. |
| `src/tasks/task.ts` (`EngineeringTask`) | Track ASEN's own in-process engineering phase while running. | Process memory only; it is not the user task or its replay log. |

Replay survives close/reopen through the ODD tracking MemoryStore item. A changed task document or mismatched task/project/candidate remains a hard resume rejection. Memory internals are unchanged.

## Historical platform defect

Candidate `74defb28a77dd028da56c3870fbd60661818689c` previously failed the recursive Skill-registry watcher test on Windows. This is historical evidence, not a current blocker: at `46c81fa67ce39aee9186c481d278cbd7e398d448`, CI's Windows job completed `npm run check` successfully (run `37523687820`, job `112475190061`). Do not add a second watcher unless a later exact-SHA run reproduces a failure.

## Final definition

Overall parity is ready only when the reverse inventory finds no observable Reference A behavior without one of:

1. a demonstrated ASEN equivalent;
2. an explicitly permitted branding/prose/artwork/private-authority difference; or
3. an honestly recorded accepted-scope limitation.

Completing all numbered ECO checkboxes without this reverse proof is not sufficient.
