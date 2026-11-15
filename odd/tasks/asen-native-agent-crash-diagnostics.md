# ASEN native agent crash diagnostics
Add bounded, sanitized startup-failure evidence without retrying failed agents or exposing private process output.
Branch: `feat/t12-integrated-acceptance-merge`; incident exit: `3221226505` (`0xC0000409`).

## Specs

1. **S1 — Preserve incident history.** "La prueba anterior seguirá registrada como fallida; no se repetirá." Two verifier agents failed before model consumption or writes with exit `3221226505`; neither attempt may be replayed, promoted, or treated as successful.
2. **S2 — Authorized diagnostic change.** User selected: "Añadir diagnóstico seguro" with effect: "Implementar pruebas y registro sanitizado de fase, código hexadecimal y presencia de stderr; sin reintentar el agente todavía."
3. **S3 — Bounded output.** Native child-process failures must expose only bounded, sanitized diagnostic facts needed for diagnosis: lifecycle phase, decimal exit code, hexadecimal Windows-style code when available, signal, and whether bounded stderr was present. Do not expose credentials, environment values, session content, model output, or unbounded stderr.
4. **S4 — Preserve behavior and authority.** The change must not retry an agent, grant writer authority, claim model consumption, alter provider routing, or convert a native failure into success. Existing normal failures and successful agents must retain their observable contracts except for additive sanitized diagnostic detail on native process failure.
5. **S5 — Verification.** Observe RED then GREEN through the public runner/result boundary. Cover Windows-style `0xC0000409`, no-stderr and stderr-present cases, bounded redaction, existing nonzero-exit behavior, and successful execution regression. Run focused runner tests, typecheck, applicable full suite, `git diff --check`, and independent verification because the runner is a shared contract.

## Tasks

- T1 (S1-S4) — Route: parent + sequential writer. Add tested sanitized native-exit diagnostics to `PiProcessRunner`. Commit: pending.
- T2 (S5) — Route: parent checks + independent verifier. Verify behavior and record exact evidence. Commit: pending.

## Log

- L1 — User report, verbatim: "HICE ESTO EN ASEN" followed by two real verifier attempts that each ended with `pi process exited with code 3221226505`, `modelConsumedProven:false`, `writerAuthorized:false`, and no report or project files created.
- L2 — User decision, verbatim: "Añadir diagnóstico seguro".
- L3 — Read-only diagnosis: decimal `3221226505` is unsigned Windows status `0xC0000409`. Node is `v24.15.0`, bundled Pi is `1.2.0`, and the selected home is `C:\Users\asenb\.asen\agent`. No matching Windows Application/WER event or persisted bounded stderr was available. Root cause remains unproven.
- L4 — T1 implementation: `PiProcessRunner` now adds fixed sanitized native-exit facts (phase, decimal code, optional unsigned Windows hex status, signal, and stderr-presence boolean) without child output. Writer RED observed 73 pass / 2 expected failures; GREEN observed 75/75 pass; typecheck and `git diff --check` passed. The parent focused rerun timed out after 30 seconds with 25 passes and no observed failure; it is not counted as a PASS.
- L5 — Independent T2 verifier `mwi0ynrh-d-p6e0` could not verify the candidate because its own Pi child exited with the same `3221226505` before `agent_settled`. No real ASEN agent was replayed. T2 is BLOCKED; the diagnostic change is implemented but not independently approved, and it does not fix the underlying native crash.
