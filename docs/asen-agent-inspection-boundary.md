# Agent inspection shows lifecycle metadata, not results

`/asen-agent-inspect <agent-id>` observes an agent owned by the current session
and project. It does not reveal completion output, event summaries, or a full
model transcript. A completed lifecycle state is not proof of delivered results.
The native TUI navigator supports explicit read-only snapshot refresh; output and execution boundaries remain unchanged.

## What the command shows

| Surface | Existing boundary |
| --- | --- |
| Owned agent | Bounded, terminal-sanitized role, state, task ID, project and owner |
| Lifecycle history | Timestamp, state and revision, sorted by revision; at most 40 events |
| Completion and event summaries | Entirely omitted, including successful output |
| Model messages or thread | Explicitly unavailable in this lifecycle store |
| Foreign session/project or unknown ID | The same generic unavailable response, without identity or summary |
| RPC without an ID | Usage response; no interactive selector |
| TUI cancellation | Closed response without inspection details |
| Session/project drift during selection | Scope-changed response; no detail query |

In TUI mode, the native overlay offers owned role/state/ID labels before inspection.
Press `r` to reread lifecycle entries, histories and inspection-only parent-notice
recovery metadata in the original session/project. Host-remapped bindings take
precedence. Tab retains the attention/all filter across refresh. Unique surviving
kind+ID selection and detail follow the entity through reorder/state changes;
removed, capped, filtered or ambiguous entities return to the first visible list
row (or empty list). Only one read is pending; failure retains the snapshot with
a generic message, and close or scope drift discards pending completion.
There is no timer, polling, notification ACK, replay or live-state claim.
Hosts without a custom overlay retain the existing selector/snapshot fallback.
Cancellation does not erase those already displayed labels, but publishes no
agent details. Returned inspection rows and their notification share the same
projection. Inspection does not dispatch work, send an agent message, request
execution consent, run a model, or invent token/cost accounting.

## Why output stays withheld

`AgentRuntime.query` exposes record/history data whose successful summaries can
contain raw runner output. Authenticated completion is not secret redaction.
Terminal control sanitization of displayed metadata is also not a guarantee that
arbitrary output is safe. The inspection renderer therefore omits summary fields
rather than trying to recognize every secret. This command does not borrow
opt-in history consent to reveal agent output.

## Evidence and limits

[`agent-inspect-output-boundary.test.ts`](../tests/agent-inspect-output-boundary.test.ts)
invokes the registered public `asen-agent-inspect` command through
`createAsenExtension`, including its notification wrapper and existing renderer.
It injects a pure in-memory runtime with synthetic completed records and raw
fake-secret, instruction, ANSI, OSC and bidirectional-control summaries. It checks
both returned text and notifications, lifecycle ordering/width, metadata
sanitization, scope denial, RPC selection avoidance, cancellation and scope drift.

That output-boundary suite is **characterization**, not refresh RED/GREEN evidence.
Refresh behavior is covered separately by `m2-f6-native-ui.test.ts` and the
registered custom-overlay tests in `extension-runtime-commands.test.ts`. The fixture models runtime
ownership filtering; it does not prove real-store authentication, restart
durability, or a real successful provider run. Production `createPiExtension`
startup is not exercised: it invokes session lifecycle and persistence paths
outside this in-memory command test. No full transcript, delivered result,
real-host visual proof, independent review, or broader capability completion is
claimed. Existing renderer and lifecycle-scope tests remain separate evidence.
