# Final ecosystem parity map

## Purpose

This is the controlling reverse-audit map for final ASEN ecosystem closure; `ecosystem-strict-parity.md` remains the sole execution backlog. A numbered ECO unit is not sufficient evidence by itself. Closure requires every observable Reference A surface to map to an ASEN behavior, an automated/runtime proof, or an honestly disclosed disposition.

The authoritative frozen machine snapshot of Reference A remains pinned to `08de420ca29be16b6f6bee725a30b599b061df16`. The [supplemental extension comparison](reference-extension-parity.md) is a later version of the same Reference A product at `6e681f1d08fff3092273cf305206094d15cacd18`, not a second provider or memory source. It is source analysis only—not an automatic rebaseline, drift adoption, runtime proof or `FULL` claim. Existing registry records and snapshot counts remain untouched. Do not copy branding, artwork, prose, names or provider-private authority.

## Closure rule

For every row use:

`Reference surface -> ASEN surface -> implementation -> deterministic evidence -> host/platform evidence -> status`

Allowed statuses are `FULL`, `PARTIAL`, `MISSING`, `OUT_OF_SCOPE`, and `PARTIAL_BY_ACCEPTED_SCOPE`. No row becomes `FULL` from file presence or a green broad suite alone.

## Route map

| Route | Observable surface | ECO owner | Current state | Closure target |
| --- | --- | --- | --- | --- |
| R01 | install, executable, package root, project/user homes, setup/link | ECO-09 | PARTIAL | clean install, idempotency, rollback, permissions, spaces/Unicode, Windows/macOS/Linux |
| R02 | public commands, arguments, errors and availability | ECO-09/14/15 | PARTIAL | exact command inventory and behavior-backed validation |
| R03 | configuration, settings, precedence and invalid values | ECO-11 | PARTIAL | schema, deterministic precedence, diagnostics, rollback, live/restart semantics |
| R04 | profiles, routing and customization | ECO-11 | PARTIAL | safe overrides/fallbacks and exact routing evidence |
| R05 | actor/owner/session attribution for changes | ECO-10 | PARTIAL | exact actor/session/project/worktree attribution without authority inflation |
| R06 | workspace state/actions and concurrent updates | ECO-10 | PARTIAL | accessible narrow-terminal UI, conflicts, restart and isolation |
| R07 | theme, colors, banner, pretty/quiet and non-TTY presentation | ECO-14 | PARTIAL | ASEN-owned presentation contract; width/color/accessibility snapshots and host evidence |
| R08 | keyboard/interaction/dialog behavior | ECO-03/14 | PARTIAL | choice/question plus applicable shortcuts/actions, cancel/error/unavailable behavior |
| R09 | agent lifecycle/UI/RPC | ECO-05/06 | PARTIAL | ECO-05 child lifecycle independently preserves pinned authority confirmation and exact tool exclusion before dispatch; queue/cancel/continue/status/history/ownership/restart then compose with the later ECO-06 primary orchestrator without making EP-003 a child prerequisite |
| R10 | Todo/plans/replay | ECO-07 | PARTIAL | durable transitions, replay, conflicts, stale plans, crash/session isolation |
| R11 | Skill discovery/registry lifecycle | ECO-08 | PARTIAL | missing/recreated sources and cross-platform startup/restart evidence |
| R12 | tools and authority | ECO-03/04/05/06 | PARTIAL | complete public inventory, fail-closed forbidden calls and no acquired authority; keep ECO-05 child authority/tool exclusion distinct from ECO-06 primary-session safety, with child shell disabled unless separately user-admitted behind its own guards |
| R13 | sessions/resume/recovery | ECO-14 | PARTIAL | startup/restart/corruption recovery and presentation integration |
| R14 | private prompt history | ECO-12 | PARTIAL | explicit opt-in, redact-before-write, retention/search/export/delete/tombstones/recovery |
| R15 | local usage and optional telemetry | ECO-13 | PARTIAL | local-first metrics, explicit one-shot consent/preview, minimization, disable/delete, no hidden send |
| R16 | public package/API/extension exports | ECO-02/15 | PARTIAL | packed artifact and private-path rejection on final candidate/platforms |
| R17 | docs, links, examples, command references and media provenance | ECO-01/15 | PARTIAL | behavior-backed docs and automated link/command/claim/media validation |
| R18 | reverse inventory completeness | ECO-01C/01E/16 | PARTIAL | every frozen command/tool/event/config/asset/reference adjudicated; drift invalidates affected claims |
| R19 | memory integration with ecosystem | MEM R01-R09 + ECO composition | PARTIAL | do not redesign memory; prove only ecosystem-facing composition |
| R20 | failure/recovery/platform matrix | ECO-16 | PARTIAL | positive, rejection, failure, recovery, restart and applicable Windows/macOS/Linux evidence |

## Canonical implementation order

Reverse-inventory preparation remains first so omitted surfaces are visible, but it does not reorder execution. The strict tracker phases control:

1. Prepare/continue reverse inventory R02/R03/R07/R08/R18 under ECO-01C/E and preserve the frozen source baseline.
2. Complete ECO-01 and ECO-02, including the minimal ECO-02A package/host preflight needed before essential runtime.
3. Complete essential runtime ECO-03 through ECO-08.
4. Complete runtime ECO-09 through ECO-14, composing rather than duplicating stores, usage, registry, dispatcher or ODD cores.
5. Complete ECO-15A, ECO-15B and ECO-15C after corresponding shipped behavior exists.
6. Run ECO-16 in both directions: ASEN -> requirements and Reference A -> ASEN, then run exact-candidate platform/host gates.

Nonadopted optional features do not gate adopted-scope closure. Explicit exclusions and deferred Reference A behavior—including the user-excluded NaN provider—remain disclosed limitations, so full-reference parity remains incomplete. Merge, release and source rebaseline remain separate human decisions.

## Audit invariants

- Search existing ASEN implementation and tests before writing anything.
- A missing roadmap row does not make a Reference A behavior optional.
- Memory R01-R09 is not an implementation queue.
- GSP-06 remains closed at the accepted provider-limited scope; do not fabricate provider PASS.
- Model output cannot mint write/review/delivery/merge/release authority.
- ECO-05 child lifecycle does not wait for ECO-06 primary safety: the existing pinned child authority and exact tool exclusion remain mandatory before prompt dispatch. Child shell/background support remains disabled by default and requires a separate user decision plus its own recognizer, destructive-command, wrapper and job constraints.
- Forbidden tools: zero executions. A blocked attempt may be recorded only as an attempt.
- Prefer deterministic/local evidence; use consolidated remote CI only for platform/host boundaries.
- Keep every stable work block independently reviewable. The reconciliation and portable-handoff documentation units are already committed; do not duplicate them. The parent-controlled metadata seal needs no predicted SHA, and delivery authority ends with the feature-branch push. It is not standing authority for later commits or work.

## Task replay ownership and evidence

Current route-by-route evidence and remaining gaps are recorded in `docs/audit/ecosystem-current-state-r03-r10.md`.

These three surfaces have separate responsibilities and do not create competing sources of truth:

| Surface | Responsibility | Durable source |
| --- | --- | --- |
| `src/runtime/task-replay.ts` | Validate ordered task state transitions and reject stale revisions or identity changes. | None by itself; pure validation/projection only. |
| `src/flow/odd-task-tracking.ts` | Mirror the complete bound ODD task document and TODO/resume data; append validated task events to that same record. | Existing project/session `MemoryStore`, under the existing ODD tracking item. |
| `src/tasks/task.ts` (`EngineeringTask`) | Track ASEN's own in-process engineering phase while running. | Process memory only; it is not the user task or its replay log. |

Replay survives close/reopen through the ODD tracking MemoryStore item. A changed task document or mismatched task/project/candidate remains a hard resume rejection. Memory internals are unchanged.

## Current handoff evidence

The current fully observed checkpoint is `bc6160d598dfd4e9a5b369d15177bf0c8d6a17e6`. CI push `37734698587`, PR `37734702290`, Release Gate `37734702429` (Ubuntu/macOS/Windows), Pi `37734702301`, and Architecture `37734702361` passed. Pi Free Smoke `37734702356` was intentionally SKIPPED, not PASS. CI-PREQ-04 implementation and exact-current CI are therefore verified at this checkpoint, without proving permanent elimination of the race class.

Older handoff SHAs and pending-CI statements are historical and no longer control execution. Scanner source commit `95ad615a04c60b6947e1bfa813be77984efb397f` and CodeGraph source commit `7538e8681d4037cc2bce8ef2f483ba0b6fcbc200` retain their recorded source evidence. The current passive ECO-01C-2 U1 metadata candidate inherits no green result; later units must earn exact-candidate evidence before route promotion. Delivery authority remains feature-branch-only and excludes install outside test sandboxes, force updates, merge, release, PR mutation, secrets access, NaN work, or unrelated changes.

## Historical platform defect

Candidate `74defb28a77dd028da56c3870fbd60661818689c` previously failed the recursive Skill-registry watcher test on Windows. This is historical evidence, not a current blocker: at `46c81fa67ce39aee9186c481d278cbd7e398d448`, CI's Windows job completed `npm run check` successfully (run `37523687820`, job `112475190061`). Do not add a second watcher unless a later exact-SHA run reproduces a failure.

## Final definition

Adopted-scope closure is ready only when the reverse inventory finds no adopted observable Reference A behavior without one of:

1. a demonstrated ASEN equivalent;
2. an explicitly permitted branding/prose/artwork/private-authority difference; or
3. an honestly recorded accepted-scope limitation or nonadopted optional disposition.

Optional nonadopted features do not gate adopted scope. They and the explicitly deferred NaN provider still prevent a claim of full Reference A parity. Completing all numbered ECO checkboxes without this reverse proof is not sufficient.
