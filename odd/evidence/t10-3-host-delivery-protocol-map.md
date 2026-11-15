# Host delivery and informational-query capability map
R18 documentary admission; base `68fe5ca33cb885f8b687846273c2c9935f767919`.
Identity/query primitives, host delivery, consumption, consent and native review authority are separate.

## Query and ownership primitives

| Capability | State | Evidence / boundary |
|---|---|---|
| Session/project identity | SUPPORTED | AgentSessionIdentity and scoped list/query/cancel/continue in `src/agents/agent-runtime.ts:14-28,110-123`; alias normalization in `src/runtime/agent-store.ts:105-108`. |
| Agent and task ownership | SUPPORTED | PublicAgentRecord owner in `src/runtime/agent-lifecycle.ts:4-8`; durable binding in `src/runtime/task-agent-link-store.ts:28-47`. Metadata grants no authority. |
| One-shot child RPC correlation | SUPPORTED primitive | PiProcessRunner prompt request ID and same-ID response check in `src/agents/pi-process-runner.ts:323-324,337-342`; bounded timeout/cancel at :256,358-365. Not a finished child-query channel. |
| Durable result | SUPPORTED | Existing HMAC-bound result/lifecycle receipts in `src/runtime/agent-store.ts:16-18,54-55,177-180`; restart tests in tests/agent-store.test.ts. |
| Single-use query reply | PARTIAL | Existing lock/CAS/terminal notice primitives in `src/runtime/agent-notification-journal.ts:92-151`; no completed informational-query state machine or duplicate-reply API. |
| Restart/cancel/continuation | SUPPORTED primitives | Attempted notice transport never replays; journal :153-173 and store :154-169,189-204. Query-specific disposition still needs implementation. |
| Finished informational query feature | NOT IMPLEMENTED | No public query/reply row/tool currently exists. This is bounded R19 design/implementation work, not by itself proof of an unavailable external capability. |
| Read-only child authority | SUPPORTED boundary | Child has no writer grant; opaque authority is not persisted. `src/runtime/agent-store.ts:22-37,90`; `src/agents/dispatcher.ts:13-16`. |

## Host and coordinator observations

| Observation | State | Evidence / meaning |
|---|---|---|
| Parent route selection | SUPPORTED | agentParentRoute run/idle/hold/headless, `src/runtime/agent-terminal-delivery.ts:10-29`. |
| Host enqueue call | SUPPORTED producer | Tracked public sendMessage(display:true), `extensions/asen.ts:92,514-558`. Return is not display/read/consumption proof. |
| Enqueue receipt | PARTIAL | markEnqueued at journal :124-135 records accepted call only; no native receipt token. |
| Widget request | SUPPORTED request; shown UNPROVEN | Projection explicitly unconfirmed, `src/runtime/notification-projection.ts:4-11,62-69`; no host ACK channel. |
| Parent consumption | PARTIAL | Existing actual-host grader can observe an ordered scenario but humanReadConfirmed=false; `scripts/t12-parent-consumption-grade.mjs:8-22,40-72`. No new current-SHA run here. |
| Coordinator notice ACK | SUPPORTED separate operation | asen_agent_ack requires exact prior status inspection/authenticated terminal state; `src/agents/pi-agent-tools.ts:92-159`. It is not UI/human read. |
| Native display/read ACK | UNSUPPORTED by evidenced contract | journal :20-29,137-150 exposes modelConsumedProven=false; do not infer consumption from ACK/enqueue. |
| Native review ACK | SEPARATE authority | Never satisfied by host notification or informational reply; review controller/provider continuations remain authoritative. |

## Ready design work and action boundaries

- R18 is complete as a capability map. R19 may enter bounded design after R07/R11 prerequisites: existing identity, ownership, request/result, timeout/CAS and cancellation primitives support investigation of the missing query feature.
- Before a writer is admitted, the parent must freeze an exact trusted producer/consumer binding and edit surfaces. A child-supplied ID alone is not authority. Existing one-shot prompt/result correlation does not automatically prove trusted mid-run child-to-parent request routing.
- Prefer existing journal/runtime/tool owners: src/runtime/agent-notification-journal.ts, src/agents/agent-runtime.ts, src/runtime/agent-store.ts and src/agents/pi-agent-tools.ts. No competing bus/store or durable grant. Shared extensions/asen.ts remains the sole integration-owner surface.
- Agent Stop exists through asen_agent_cancel; Resume exists narrowly for interrupted read-only Explorer through asen_agent_continue. Agent Follow is currently bounded status, not a public live stream. Job Stop exists through asen_background_stop; internal subscribeScoped is not a public Follow tool.
- Every action still needs its own identity/consent/negative tests. No model/provider action or delivery authority follows from this map.
- Missing host display ACK blocks only affected shown/read/consumption claims, not an informational-query implementation whose actual correlation/ownership requirements are established.

## Evidence and unresolved checks

Source inspection only: no query/reply, agent/job execution, test, provider call, install, replay, ACK or host probe occurred. Query transport design, one-use/restart tests and applicable independent risk verification remain future work. No old unavailable verifier was retried or satisfied. No canonical task or FULL counter changed.
