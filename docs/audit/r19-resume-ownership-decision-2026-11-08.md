# R19 Resume ownership map and owner decision document (W5-B)

Status: **R19 remains BLOCKED. This document implements nothing, fabricates no human consent and
does not unlock R19.** It answers the eight W5 §3 ownership questions from the real code at
candidate `4d3bbb8713287659d841ab6d03723d5a315080fc`, names the actual state owners (S15: no second
store, no new authority), and puts the remaining real decision in front of the owner.

All path:line citations were read from the tree, not inferred. Test coverage for every guardrail
cited here already exists (`trusted-task-agent-binder.test.ts`, `m2-05-journal-state-contract.test.ts`,
`task-agent-recovery-chain.test.ts`, `agent-notification-journal/-multiprocess/-restart-process.test.ts`,
`retry-routing.test.ts`, `interrupted-explorer-continuation.test.ts`, `eco07-launch-recovery.test.ts`),
which is why W5-B adds read-only analysis rather than speculative tests against working, tested code.

## Actual state owners (there are exactly four durable stores and one launch gateway)

| Concern | Owner | Durable location | Construction site |
|---|---|---|---|
| Agent lifecycle state machine | `PersistentAgentStore` | `<home>/.asen/agents.json` | `extensions/asen.ts:269` |
| Terminal-notice delivery ledger | `AgentNotificationJournal` | `<home>/.asen/agent-notices.json` | `extensions/asen.ts:219` |
| Task↔agent audit links | `TaskAgentLinkStore` | `<home>/.asen/task-agent-links.json` | `extensions/asen.ts:273` |
| Todo state/reason/revision | `SessionTodoStore` | todo store (same `.asen` home) | `extensions/asen.ts` todoStorePromise |
| The ONLY launch gateway | `TrustedTaskAgentBinder` | stateless guard over todos+agents+links | `extensions/asen.ts:397`, `src/runtime/plan-dispatcher.ts:125,149` |

Any R19 Resume implementation MUST route through these owners. A fifth store or a second launch
authority is out of contract (S15).

## The eight answers

### 1. Which component reliably knows an agent has finished?

`PersistentAgentStore` is the only reliable knower; `AgentRuntime` only attests to it.

- The store owns a validated, revision-numbered, HMAC-receipted state machine
  (`src/runtime/agent-store.ts:49-53`): `queued→running|interrupted|cancelled|failed`,
  `running→interrupted|cancelled|failed|completed`, `interrupted→cancelled` only,
  `cancelled|failed→∅`, and `completed→interrupted` ONLY with the exact summary
  "Unverified completion after restart; explicit review is required" (`agent-store.ts:52`).
- `AgentRuntime.#publishTerminal` notifies observers only after re-reading the PERSISTED record,
  and only when its durable state is `completed|failed|cancelled`; a failed storage read "must never
  produce a success notification" (`src/agents/agent-runtime.ts:30-40`).
- On process start, `#recover()` reclassifies orphaned `running`/`queued` records to `interrupted`
  when the owner process is dead, with an honest summary that resume "requires explicit
  authorization" (`agent-store.ts:189-190`, `:46-48` for `processIsAlive`).
- Everything else is downstream opinion: the journal tracks DELIVERY, not agent state; the reconciler
  maps agent truth onto Todo state but can never promote success
  (`src/runtime/task-agent-reconciler.ts:72-80`); the Pi parent model "knows" only if a steer-triggered
  turn actually consumes a notice (see Q6 — never durably proven).

### 2. Where is that completion currently recorded?

Five durable, layered records — one owner each:

1. Agent record + full event history: `agents.json` via `PersistentAgentStore` (`asen.ts:269`), with
   per-transition events (`agent-store.ts:52`).
2. Todo outcome + reason + revision: `SessionTodoStore.update` from the reconciler
   (`task-agent-reconciler.ts:26,47,60,90`) — including the deliberate non-promotions: reviewer/verifier
   completion always lands as `blocked` with reason "Linked review result requires explicit user
   acceptance" (`task-agent-reconciler.ts:86-87`).
3. Notification ledger row: `agent-notices.json`; `record()` writes `pending` BEFORE any transport
   attempt (`src/runtime/agent-notification-journal.ts:92-111`; called at `asen.ts:527`).
4. Audit link: `task-agent-links.json`, created only inside the binder's `#bindOwned`
   (`trusted-task-agent-binder.ts:84`).
5. Transcript copy: `pi.sendMessage({customType:"asen.agent.result", display:true, details:{eventId,
   sessionId, projectId, agentId, state, trusted:false, deliveryState:"enqueued", deliveryConfirmed:false}})`
   with the summary passed through `untrustedAgentText` (`asen.ts:543-552`).

### 3. Who has authority to re-activate a finished agent?

**Nobody. No code path exists, and the state machine forecloses it.**

- `cancelled` and `failed` have no outgoing transitions (`agent-store.ts:51`).
- The binder rejects any dispatch whose agent record is not freshly `queued`
  (`trusted-task-agent-binder.ts:48-49`) and any reuse of an already-linked agent id (`:44-45`),
  "A task-agent link is an audit record, not a renewable launch permit" (`:42-43`).
- The only two legitimate "start again" routes create a NEW identity through the same gateway:
  - `asen_agent_continue` → `continueInterruptedExplorer`: interrupted-role-explorer only, exact
    session+project (`src/agents/interrupted-explorer-continuation.ts:38-39`), admitted only via the
    store's `resumable()` which mints `${id}:continue:${n}` and refuses when a continuation already
    exists (`agent-store.ts:192-195`, `:163`), with the linked Todo required to be `blocked` with a
    restart/session-ended/interrupted reason (`interrupted-explorer-continuation.ts:43-44`).
  - `asen_agent_retry`: failed read-only agent only; requires blocked Todo with exact persisted
    instruction (`pi-agent-tools.ts:173-174`), single prior attempt (`:175`), role/skill-phase
    re-validation (`:176-179`), a live `ctx.ui.confirm` (`:180`), post-dialog identity re-check
    (`:181`), fresh-state re-check (`:182-183`), revision-CAS'd Todo reason set to the exact constant
    `CONFIRMED_FAILED_READ_ONLY_RETRY_REASON` (`:184`, `trusted-task-agent-binder.ts:7`), then
    `launchConfirmedFailedRetry` under the Todo launch lock with the exact failed predecessor and
    expected revision (`pi-agent-tools.ts:186`; `trusted-task-agent-binder.ts:29-41,67-72,92-98`).
- `completed→interrupted` exists ONLY as the unverified-completion-after-restart demotion
  (`agent-store.ts:52`) — a safety downgrade, never a re-activation.

R19 consequence: a future Resume cannot "wake" a terminal agent. Its only conforming shape is the
retry pattern above: new identity, one-use, lock-serialized, CAS'd, exact-predecessor-verified.

### 4. How is the original session unambiguously identified?

- Live origin: `sessionIdentity(ctx)` = `ctx.sessionManager.getSessionId()` plus realpath-canonicalized
  `ctx.cwd` (`asen.ts:281`).
- Pinned at launch: request carries `isolationKey=sessionId`, `repository=projectId`,
  `ownerProcessId` (`agent-runtime.ts:53`; `agent-store.ts:40`).
- Every read enforces the pair: `agent.sessionId===identity.sessionId &&
  sameWorkspaceIdentityPath(agent.projectId,identity.projectId)` (reconciler `:13,17`; binder `:23-25`;
  journal `sameScope` `:78-80`), with `workspaceIdentityPathKey` normalizing Windows case/8.3 aliases
  (`agent-notification-journal.ts:62-64`).
- Identity is re-asserted across every await seam: `validateIdentity()` before and after binding and
  before dispatch (`binder:88,96,105`), `matches()` twice around claim and enqueue (`asen.ts:526-542`),
  post-confirm re-read in retry and ack (`pi-agent-tools.ts:154-156,181-183`).
- The journal event id hashes the FULL scope — `[id, sessionId, projectId, state]` — "so identical task
  ids from two sessions cannot alias" (`agent-notification-journal.ts:42-47`), and is re-derived on every
  parse (`:60`), making tampering a hard validation failure.

### 5. How is a question related to its answer?

Proven today (terminal-notice flow only), as a two-stage correlation:

1. Message↔ledger: the notice embeds `details.eventId/agentId/state/scope` (`asen.ts:550-551`);
   `asen_agent_status` (list or exact query in a live TUI) records an in-memory inspection receipt
   `{eventId → agentId,state,scope,timestamp}` (`pi-agent-tools.ts:103-114`).
2. Answer↔question: `asen_agent_ack(eventId)` accepts ONLY if (a) that exact eventId was inspected
   within `INSPECTION_WINDOW_MS` under the same scope and agent/state
   (`pi-agent-tools.ts:143-148`), (b) the durable agent record still matches
   (`:149-152`), (c) the session/project did not change during the call (`:154-156`), and (d) the
   journal CAS `enqueued→acknowledged` with exact agentId+state (`agent-notification-journal.ts:139-152`).
   The result self-labels: `evidence:"COORDINATOR_ACTION_ONLY"`, `humanReadConfirmed:false`,
   `writerAuthorized:false` (`pi-agent-tools.ts:158-159`).

Free-text question→answer (the R19 case): **there is no durable correlation today.** The RPC admission
witness proved only transient, in-session correlation: "Distinct host-generated input/editor IDs were
correlated. A forged input ID did not satisfy the input" and "Request IDs are ephemeral correlation
values, not durable authority" (`odd/evidence/r19-rpc-free-text-admission.md:19,26`). That witness
explicitly lists what is still missing — trusted producer/tool-call association, parent-derived
task/session/project identity, unique durable links, scoped one-reply CAS, cancellation/timeout/
restart/no-replay checks (`:28`). Those are exactly the primitives the four stores above already
implement in other shapes; R19's open question is whether to reuse them (see Alternatives), not to
invent new ones.

### 6. What evidence proves the message was consumed and not merely enqueued?

**None exists in the durable layer, and every layer honestly says so:**

- `markEnqueued`: "Pi accepted an enqueue call; NOT proof of display, reading or consumption"
  (`agent-notification-journal.ts:124-136`).
- `acknowledge`: "Explicit Pi coordinator acknowledgement, not a human-read or UI-consumption proof"
  (`:137-152`).
- `recoveryReview` hard-codes `modelConsumedProven:false, writerAuthorized:false` on every row
  (`:26-30,160-173`).
- The only physically observable consumption is a steer-triggered parent turn actually running with
  the notice in context: `deliverAs:"steer", triggerTurn:true` when the route is `run`, and
  `requestAgentWake` when `idle` (`asen.ts:552,559`). Nothing records that such a turn happened,
  still less that it read the message.
- Crash-safety proves the ledger refuses to lie: `attempted` is "an uncertain crash or transport
  boundary: never auto-replay it" (`agent-notification-journal.ts:9-11,162-167`); a mid-delivery route
  change leaves the row `attempted` with an explicit user-visible uncertainty message
  (`asen.ts:537-542`); a failed `markEnqueued` after a successful send announces an uncertain ledger
  and returns false rather than fabricating enqueue (`asen.ts:557-558`).

This is the same boundary W5-D classifies for the t12 producers (created/sent/enqueued/displayed/
consumed/answer-linked). Any Resume design that treats `enqueued` or `acknowledged` as "the human read
it" is the laundering this project forbids.

### 7. What human-confirmation mechanism does Pi offer?

- `ctx.ui.confirm(title,message,{signal})`: the durable-relevant mechanism. Used with deny-closed
  gates for retry (`pi-agent-tools.ts:180`: requires `context?.hasUI===true` AND
  `typeof context?.ui?.confirm==="function"`, else throw) and for writer authorization
  (`asen.ts:409-410`, `pi-agent-tools.ts:195`).
- `ctx.ui.input`/editor (two-argument public signature) and `select`: R19's corrected fixture proved
  exact free-text round-trip and honest cancellation (`undefined` → `editorCancelled:true`) on the
  declared host (`odd/evidence/r19-rpc-free-text-admission.md:19,22`).
- `ui.notify`, widgets, overlays: informational only, never confirmation.

Critical structural fact: **a confirm returns a value into a live call; it writes no durable receipt.**
The only way the current codebase makes a human confirmation auditable is the retry pattern — capture
the confirmation, then durably CAS the Todo into `running` with the exact constant reason string, which
the binder (`trusted-task-agent-binder.ts:29-41`) and reconciler (`task-agent-reconciler.ts:35-43`)
independently re-validate before anything may launch. An R19 Resume either adopts this pattern or the
owner accepts knowingly weaker auditability.

### 8. How are duplicate or out-of-context resumptions prevented?

Existing, tested primitives (any Resume must compose these, not re-implement them):

- Todo launch lock: `withAgentLaunch` serializes claim + bind + enqueue + dispatch under the exact
  Todo, with snapshot-identity compare (`sameSnapshot`) and `TodoLaunchConflictError` on any change
  (`trusted-task-agent-binder.ts:15,99-113`); plan-level `advancingPlans` session+project guard
  (`asen.ts:403`).
- Fresh-identity + link uniqueness: only `queued` dispatches (`binder:48-49`); never a linked agent id
  again (`:44-45`); never while a linked agent is still `queued|running` (`:63-66`); a linked-but-
  planned Todo requires explicit reconciliation before another launch (`:57-60`).
- One-use budgets: exactly one retry link (`binder:32`, `pi-agent-tools.ts:175`); one continuation per
  interrupted parent (`agent-store.ts:163`); ad-hoc explorer hash dedupe
  (`agent-runtime.ts:57-63`).
- Revision CAS: retry binds against `expectedRunningRevision` matching the confirmed reason
  (`binder:29-31`); Todo updates in the reconciler pass the observed revision and tolerate only
  revision-conflict as a benign race (`task-agent-reconciler.ts:26-27,90-92`).
- Delivery CAS ledger: `pending→attempted→enqueued→acknowledged`, each transition claimed exactly once
  and scope-checked; duplicate terminal outcomes for one agent+scope are a corruption error
  (`agent-notification-journal.ts:112-152,54-64,102-103`).
- Cross-boundary identity re-checks (Q4).
- Recovery-chain refusal: inconsistent histories go to `blocked` for explicit review, never
  auto-revival (`task-agent-reconciler.ts:44-65`); interrupted predecessors must match plan role
  (`:44-45`).

## Decision needed from the owner (R19 stays locked until this is answered)

The transport works (R19 witness, corrected fixture, `1cc996e3…`). The missing piece is the
**authority design for a child agent asking a question of its parent session and being resumed on the
answer.** The real choice:

- **Option 1 — extend the existing four-owner topology (no new store).** Model the Resume exactly on
  `launchConfirmedFailedRetry`: parent `ui.confirm`/editor answer → durable CAS'd Todo reason constant
  (new exact string, e.g. an `ANSWER_LINKED_RESUME` analogue) → new agent identity bound under
  `withAgentLaunch` with one-use semantics, full-scope event hash for question↔answer correlation, and
  `enqueued≠consumed` preserved (the answer link is parent-TUI-observed, never claimed from RPC write
  success). Cost: new reason constant + binder route + correlation rows in the EXISTING link store or
  journal (schema revisions), plus negative tests mirroring `trusted-task-agent-binder.test.ts`.
  Risk surface: moderate, all inside tested lock/CAS machinery. This is the only option consistent
  with S15 ("no second store, no new authority").
- **Option 2 — keep M2-03b blocked; no Resume.** Zero implementation risk; interrupted explorers keep
  the single continuation path, questions keep flowing through the existing notice/ack chain. Cost:
  interactive child agents (questions mid-run) stay impossible.
- **Rejected by existing evidence (do not re-propose as-is):** anything that treats journal
  `enqueued`/`acknowledged` or RPC `handled` as human consumption or consent (Q6/Q7 — every layer in
  the code explicitly refuses that reading); a fifth durable store or bypassing
  `TrustedTaskAgentBinder` (S15); replaying `attempted` notices
  (`agent-notification-journal.ts:162-167`).

What this document deliberately did NOT do (per W5 §3 / S15): implement Resume, generate or simulate
human consent, mark R19 unlocked, add a second store or authority, or invent a new durable "consumed"
claim. M2-03b remains BLOCKED pending the owner's Option 1 / Option 2 choice; if Option 1 is chosen,
the next authorized slice would be a spec + tasks for the CAS'd answer-link route above.

## Coverage note for the "implement authorized improvements, not only documentation" rule

W5-A delivered code+tests (probe v2, receipts, `b3712a85`). For W5-B, the authorized scope is
exclusively the ownership analysis and this decision document; the four state owners and the launch
gateway are already pinned by the named test files, and no demonstrable functional gap exists whose
RED could be honestly observed — manufacturing one would add tests for behavior the user never asked
to change. W5-C/W5-D/W5-E carry the remaining authorized code work (P3 negative tests, producer
classification, reconciliation).
