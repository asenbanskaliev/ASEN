# t12 message-stage classification: created / sent / enqueued / displayed / consumed / answer-linked (W5-D)

Status: read-only classification of the two real t12 notice producers at remote tip
`4d3bbb8713287659d841ab6d03723d5a315080fc`, using ONLY already-recorded authentic receipts.
Per owner S22 this batch: altered no producer, consumed no model calls to fill missing
evidence, and keeps every unobserved stage at PENDING/BLOCKED. This document implements
nothing new; the code deliverables of W5 are the probe v2 unit (W5-A) and the P3 admission
hardening (W5-C), and both producers already carry their own negative test suites
(`tests/t12-parent-consumption-grade.test.ts`, `tests/t12-real-busy-parent-grade.test.ts`).

## The producers and their exact witness chain

| Producer | Shape | Witness chain |
|---|---|---|
| `scripts/t12-real-parent-consumption.mjs` | Controlled read-only ASEN **fixture** child emitting through the production notice path + real Pi TUI parent | probe `scripts/t12-parent-probe.ts` wraps `pi.sendMessage` and the two real tools; grader `scripts/t12-parent-consumption-grade.mjs`; one-shot gate: exact commit message, `run_attempt==1`, Linux, Pi 1.2.0, pinned Beam, `.github/workflows/asen-real-agent-acceptance.yml:443-517` |
| `scripts/t12-real-child-parent-consumption.mjs` | Real **Pi RPC Explorer child** (`childUsesModel:true`) + real Pi TUI parent, idle and busy routes | probe `scripts/t12-parent-real-child-probe.ts`; grader `scripts/t12-real-child-parent-grade.mjs` (extends the base grader with child request→start→selection→finish ordering and transcript digest binding) |

Production path observed by both: `extensions/asen.ts:516-560` (`sendAgentNotice` → journal
`record()` at `:527`, message construction with `trusted:false, deliveryState:"enqueued"` at
`:543-552`, `pi.sendMessage` at `:552`), journal `src/runtime/agent-notification-journal.ts`
(transitions `pending→attempted→enqueued→acknowledged`, `:92-152`), ack tool
`src/agents/pi-agent-tools.ts:135-160` (inspection-window receipt + CAS +
`evidence:"COORDINATOR_ACTION_ONLY"`).

## Authentic recorded executions (receipts, not forecasts)

| Run | Exact SHA | Route/producer | Recorded verdict (from `odd/tasks/equivalencia-funcional-agentes-full.md`) |
|---|---|---|---|
| `41787200198` | `44c9ad044b7652031e088404c62e5631878fbed7` | fixture child, idle (producer 1, grader as it stood then) | `PASS_REAL_PI_PARENT_BOUNDED`, artifact `13301807519`; observed `result_enqueued → idle_wake → parent_turn_start → status_inspected → acknowledged → parent_turn_end` (UFC :833,:837) |
| `41794096740` | (fixture-acceptance run of the hardened identity witness) | producer 1 after witness hardening | acceptance PASS, explicitly "no prueba un hijo Pi LLM" (UFC :871) |
| `41797370720` | `b47244facefe53a7a72234f84e8694e999a93a44` | producer 2 first attempt | **FAIL before any model call** (SyntaxError, no receipt) — retained, never rewritten as PASS (UFC :900) |
| `41798018569` | `616d2655bbcec263eea9afe6ce823a32697290d5` | real Pi RPC child, idle (producer 2) | `PASS_REAL_PI_PARENT_AND_CHILD_BOUNDED`, artifact `13306048302` (`real-pi-parent-child-wake.json`), `childUsesModel:true`, transcript digest bound (UFC :906) |
| `41815369175` | `0578c3f17150d649f95296819c70a002380d791d` | real Pi RPC child, busy (producer 2) | `PASS_REAL_PI_BUSY_PARENT_AND_CHILD_BOUNDED`, artifact `13313944479`, steer with `triggerTurn:true`, **zero** `idle_wake` (UFC :1053,:1061) |

Caveat kept from the source records: historical receipts do not automatically prove later
hardened grader contracts (UFC :852: the `41787200198` success predates the
`returnedAgentId/taskFound` hardening); each verdict is pinned to its own exact SHA.

## The six stages, classified per witness strength

Definitions follow the durable semantics established in W5-B (Q5–Q6) and the journal's own
labels; "laundering" means never promoting a weaker stage to a stronger one.

### 1. Mensaje creado — OBSERVED (durable, indirect-by-mechanism)

`AgentNotificationJournal.record()` persists the row as `pending` BEFORE any transport
attempt (`agent-notification-journal.ts:92-111`, called at `asen.ts:527`). Receipts prove
creation by the real ledger: the grader re-reads `<privateHome>/.asen/agent-notices.json`
and asserts exactly one entry whose `delivery==="acknowledged"` with matching full-scope
`eventId` (base grader :49-51). The journal parser re-derives and validates the transition
chain on every read, and `acknowledged` is CAS-reachable only from `enqueued`; no direct
observation of the `pending` instant exists, so the stage is proven through the durable
final state plus chain validation, not through a dedicated event.

### 2. Mensaje enviado — OBSERVED (direct host wrap at the call site)

The probes replace `pi.sendMessage` (`t12-parent-probe.ts:24-31`): the `result_enqueued`
event records the exact message `details.eventId` and `options` the production code passed
(`triggerTurn`, `deliverAs`), and only then delegates to the real host call (:31). The
grader requires `deliverAs:"steer"` and route-correct `triggerTurn` values (base grader
:25-39). So "the parent process issued the transport call with these options" is directly
observed.

### 3. Mensaje encolado — OBSERVED (durable, indirect-by-mechanism)

"Pi accepted the enqueue" is marked only after `sendMessage` returned (journal
`markEnqueued`, `agent-notification-journal.ts:124-136`; call site `asen.ts:557`). No probe
event wraps `markEnqueued`; the stage is proven because the final durable `acknowledged`
state can only be reached through the validated `enqueued` predecessor. Per the module's
own label: enqueued is "NOT proof of display, reading or consumption" (:9-11).

### 4. Mensaje mostrado al destinatario — PENDING (never observed, no primitive)

No recorded observation attributes TUI rendering to a single message. The receipts'
`nativeTuiSha256` hashes the entire PTY stream of the session (`t12-real-parent-consumption.mjs:43,51,79`)
— session-scoped, not per-message attributable. Compaction/RPC/headless routes retain
`pending` by design (`asen.ts:528-530`). Display stays PENDING until an observable
per-message display primitive exists on the host; nothing here may upgrade enqueued→displayed.

### 5. Mensaje consumido — SPLIT: coordinator consumption OBSERVED (bounded); human consumption PENDING (never claimed)

Directly observed and bounded to the model coordinator: a real `parent_turn_start` from
`pi.on("agent_start")` occurs after wake/steer in the same turn, then the parent calls the
real tools `asen_agent_status` and `asen_agent_ack` — witnesses record the actual tool
RESPONSES, not arguments (`t12-parent-probe.ts:38-47`: `taskFound` only when the returned
record state is `completed`; `confirmed` only when `details.acknowledged===true`), and the
grader enforces exact identity equality plus the durable CAS to `acknowledged`
(base grader :40-51). This is consumption BY THE AGENT, and the ack itself self-labels
`evidence:"COORDINATOR_ACTION_ONLY"`, `humanReadConfirmed:false`
(`pi-agent-tools.ts:158-159`); both graders hard-code `humanReadConfirmed:false`
(:62 / :48). A human reading the notice has NEVER been durably observed in any receipt;
that stage stays PENDING/BLOCKED — it is exactly the gap W5-B classified as
"consumption is never durably provable" for humans.

### 6. Respuesta vinculada a la pregunta original — SPLIT: notice-flow link OBSERVED; interactive child question→answer BLOCKED

For the terminal-notice flow the binding is fully observed: one `eventId` (hashing the
complete scope `[id, sessionId, projectId, state]`, `agent-notification-journal.ts:42-47`)
is asserted equal across result witness, inspection receipt (windowed
`pi-agent-tools.ts:143-148`), ack request AND ack response, durable journal, and agent/state
identity; `runId/runAttempt` and `GITHUB_RUN_ATTEMPT=="1"` make each receipt one-shot
(`t12-real-child-parent-consumption.mjs:20`). For the R19 case (an interactive child asking
a free-text question mid-run and resuming on the answer) there is NO durable correlation in
any producer — the RPC admission witness only proved ephemeral in-session correlation
(`odd/evidence/r19-rpc-free-text-admission.md:19,26,28`). Answer-link for R19 stays BLOCKED
pending the owner's Option 1/Option 2 decision (`docs/audit/r19-resume-ownership-decision-2026-11-08.md`).

## Boundary table (what each receipt may and may not be read as)

| May be read as | Must NOT be read as |
|---|---|
| durable notice created (ledger chain) | display, human read |
| transport call issued with steer options | display attribution |
| Pi accepted the enqueue (chain-validated) | consumption of any kind |
| coordinator consumed it in-turn (2 real tool actions, exact identities, durable CAS) | human confirmation, writer authorization |
| answer bound to question identity within the notice flow | R19 interactive question/resume capability |
| real child model inference occurred (producer 2, digest-bound transcript) | A/B parity, FULL, `globalFull:false` inverted anywhere |

## W5-D verdict

Producers are classified against authentic receipts only; every unobserved stage is kept
PENDING/BLOCKED with its mechanism named. No CI producer was modified, no provider call was
made or needed in this batch, and no weaker stage is laundered into a stronger one. The two
stages that gate real capability remain exactly where W5-B put them: per-message display has
no host primitive (M4-side observation gap), and human-read/consumption plus R19
question↔answer durability await the owner's Resume decision.
