# R19 free-text RPC admission

Status: **SUPPORTED transport on declared Pi 1.2.0; parent/child query implementation NOT admitted by this witness.**

## Earlier failed fixture (retained evidence)

- Original startup fixture: two failed checks, exits 1; 1 test/0 pass/1 fail each, 15.289 and 6.939 seconds. CLI child exited 0 with no UI frames. This did not prove an unsupported API.
- Static diagnosis confirmed the declared executable bin. RPC startup awaits extension `session_start` binding before attaching its JSONL input reader; awaiting an interactive dialog there is an invalid activation lifecycle. The narrower shutdown/buffering explanation for absent frames was not established.
- No implicit third execution occurred. The owner subsequently selected «Corregir fixture RPC y verificar» in the explicit interactive decision recorded in the runbook L14. Prior failure records were not erased and no native authority/review budget was reset.

## Corrected actual-host observation

- Public witness: `tests/r19-rpc-free-text-admission.test.ts`.
- Observed fixture SHA-256: `1cc996e3719eb3b3e8cc969391dfc7fce363c53f0d77383067825a6c057fb5aa`.
- Command: `node --import tsx --test tests/r19-rpc-free-text-admission.test.ts` in the existing isolated dependency tree.
- Parent execution: exit 0; **1 passed, 0 failed/skipped/cancelled**; Node test duration 4510.308 ms, host interaction 3087.5305 ms.
- Resolved package version asserted exactly **1.2.0**. The actual declared CLI subprocess ran RPC mode with only the owned synthetic extension, no tools/skills/session persistence, and isolated empty-credential state.
- `get_commands` first confirmed exactly one precise owned probe with `source: extension`. Only that known extension command was invoked using the documented RPC command route; the response was successful with `data.disposition: handled`.
- Distinct host-generated input/editor IDs were correlated. A forged input ID did not satisfy the input. The observed value was exactly `PARENT_EXACT_TEXT`; editor cancellation returned `undefined`, recorded as `editorCancelled: true`.
- The result notification and handled-command response were both observed before stdin closed. Child exit was `{code: 0, signal: null}`; owned fixture cleanup completed.
- Observed event counts: `agent_start: 0`, `message_start: 0`, `tool_execution_start: 0`, `providerLike: 0`. No model prompt or provider-backed action was introduced; the RPC `prompt` packet was handled as the pre-discovered extension command.
- Limits retained: test 30 seconds, internal watchdog 20 seconds, input 5 seconds, shutdown 5 seconds, output 100 KiB. The editor uses its public two-argument signature, not an invented timeout option.

## Scope and reproducibility

This is an actual SDK CLI/RPC observation using a synthetic extension fixture, not an ASEN parent-query or native TUI-paint observation. Reconstruct the SDK from tracked package/lock contracts; local caches, installed copies and private memory are not acceptance prerequisites. Request IDs are ephemeral correlation values, not durable authority.

R19 still needs trusted producer/tool-call association, parent-derived task/session/project identity, unique durable links, scoped one-reply CAS, cancellation/timeout/restart/no-replay checks, and separate native consent handling. Neither title/question text nor RPC request IDs authorize an action. Transport write/handled-command success does not establish child/model consumption, approval or UI/GLOBAL FULL.

No production runtime, authority policy/pin, journal or consent state was changed. Persistent memory remains unavailable because repository identity binding could not be created; tracked file evidence preserves continuation.
