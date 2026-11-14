# Inspect task recovery without dispatching work

`TaskAgentCoordinator.snapshot()` appends `recoveryDisposition` to each task;
`task()` includes it alongside history. This is a read-only advisory, not an
execution supervisor. Existing task state, readiness, agent ordering and other
projection fields are unchanged.

## Read the state, then the suggested next action

Every disposition contains `advisory: true`, `automaticDispatch: false` and
`grantsAuthority: false`. Neither `ready` nor a suggested next action grants
permission to launch, retry, write, accept a result or replay an earlier grant.

| Status | Observed evidence | Suggested next action |
|---|---|---|
| `active` | Latest matching linked agent queued/running; all predecessors interrupted | `observe` |
| `reconciliation` | Missing/contradictory agent evidence, absent/live predecessor, uncertain planned dispatch or terminal task with unfinished work | `reconcile-linked-evidence` |
| `manual-continuation` | Matching interrupted Explorer | `request-explicit-continuation` |
| `fresh-confirmation` | Matching failed Explorer, Reviewer or Verifier | `request-fresh-read-only-confirmation` |
| `manual-worker-reconciliation` | Interrupted/failed Worker or uncertain planned Worker dispatch | `reconcile-worker-manually` |
| `inspect-result` | Completed/cancelled attempt consistent with task state | `inspect-result-and-acceptance` |
| `unknown` | No matching journal link, unknown task identity/state or unsupported recovery distinction | `inspect-task-and-links` |

## Evidence boundaries

- The task's current session/project and task ID must match. Agent identity,
  role, state and every link in journal order must agree. A task role hint alone
  is never evidence of an executed attempt. Without a plan only linked Explorer
  evidence is recognized; legacy ID coincidence does not establish recovery.
- Missing, duplicated, foreign or conflicting linked agent evidence needs
  reconciliation. A latest result cannot hide an absent or live predecessor.
- Failed-predecessor retry consent is not available in these public records.
  Such chains conservatively need reconciliation, even if a separate authority
  could validate them. Interrupted non-Explorer continuation is unknown.
- A linked ID does not prove dispatch or provider contact. A completed Worker
  does not prove task acceptance; existing review/acceptance rules still apply.
- Store reads are not an atomic multi-store transaction. Recheck authoritative
  state and obtain explicit authorization through existing guarded operations.

## Availability and limits

The advisory is available to direct coordinator callers. The existing
`/asen-task-agents` command selects its previous fields explicitly and does not
expose this new field; no command or interface behavior is changed here.

No stores are changed by the projection. No automatic restart, retry budget,
spend controller, queue, daemon, provider call or permission mechanism is added.
In-memory projection tests do not prove real process recovery or supervision.
