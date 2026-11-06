# R19 free-text RPC admission

Status: **UNPROVEN / bounded fixture attempts exhausted**. This is not evidence that the public API is unsupported.

## Observed evidence

- New local witness: `tests/r19-rpc-free-text-admission.test.ts`; held untracked, not part of Todo/guide delivery candidates. Preserve it; do not run it through a full suite or silently skip/remove it.
- Isolated command: `node --import tsx --test tests/r19-rpc-free-text-admission.test.ts` from `.cache/shell-rea-verification`.
- Attempt 1: exit 1; 1 test, 0 passed, 1 failed; 15.289 seconds.
- One bounded correction attempt: exit 1; 1 test, 0 passed, 1 failed; 6.939 seconds.
- Resolved declared SDK version: exactly 1.2.0. CLI child exit 0, signal null; bounded stderr empty. No input/editor/result RPC rows were observed. No model/provider events were observed; the fixture issued no model prompt.
- Owned fixture cleanup succeeded. No production runtime, authority policy, pin, journal, or consent changes were made.

## Static diagnosis (no third execution)

The SDK package metadata maps `pi` to `dist/bundle/cli.js`. The witness resolves that exact bin. Its wrapper loads `cli-runtime.js`, which invokes `main(process.argv.slice(2))`; this is not a passive library entrypoint. The failure remains a probe activation/lifecycle issue, not a demonstrated missing RPC capability.

A subsequent run requires a new explicit owner decision after the exhausted bound. Do not change executable, install/upgrade the SDK, substitute another verifier, or reset the run budget. Diagnose activation statically before proposing the smallest correction.

## Boundaries retained

Even a passing input/editor witness would prove only transport. R19 still needs trusted producer association, parent-derived task/session/project ownership, unique durable links, scoped reply CAS, cancellation/timeout/restart/no-replay checks, and separate native consent handling. RPC request IDs and title/question text are correlation, never authority. Enqueue/write acceptance is not child/model consumption.

Persistent memory could not record this update: repository identity binding unavailable. This tracked evidence path is the portable continuation record; no cache or private memory state is an acceptance prerequisite.
