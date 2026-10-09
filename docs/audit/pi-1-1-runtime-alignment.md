# Pi 1.1 runtime alignment

## Implementation follow-up — 2026-10-09

The original Pi 1.1 candidate now has successful CI and package/install gates on Ubuntu, Windows and macOS after the bounded Ubuntu retry. The user authorized correcting reproduced installed-package/API defects on this same PR. See the [canonical follow-up](../../odd/tasks/pi-1-1-runtime-alignment.md) for exact identities and remaining gates. New source candidates do not inherit earlier CI. U2 and final independent review remain open; B2/ECO-02A and production orchestration integration stay pending. Optional peer `>=0.85.1`, frozen/historical evidence and 16 PARTIAL / 0 FULL remain unchanged.

## Current handoff reconciliation — 2026-10-09

Published branch / OPEN-DRAFT PR #32 head is `4290f7da71c586b3f69509bee959740228a9831f`, 311 ahead / 0 behind main `49129b616c5349fbf323b74860136fc1593f9b2a`. The user authorized push with verification pending and cancelled the full local suite in favor of Actions. Publication occurred; approval did not. The local native review remains incomplete and unapproved.

[Canonical Pi 1.1 handoff and exact Actions evidence](../../odd/tasks/pi-1-1-runtime-alignment.md) records Pi RPC/architecture PASS, macOS CI PASS, Linux/macOS pack/install PASS, Windows still running, and Ubuntu CI dependency-install `ECONNRESET`. No duplicate execution started. U2 remains open; finish the already running gates, then retry only the failed Ubuntu job and complete final review before B2/ECO-02A. Optional peer `>=0.85.1`, frozen/historical evidence and 16 PARTIAL / 0 FULL remain unchanged.

This is the current execution route. Conflicting checkpoints, publication restrictions and dependency statements below are historical; they do not override the present user handoff or create additional backlogs. No new Markdown-only CI dispatch is needed.

The current candidate aligns development and current-runtime CI with Pi 1.1.0 while preserving the optional peer floor. U1 implementation is recorded in local work-unit commit `a413e7e4b1306d3557f0ac1a991f1ecf4eaae885`; complete frozen-candidate validation and publication are still pending.

## Review path

1. Review the version policy and seven workflow pins.
2. Review deterministic RED, focused functional evidence, and compiler receipt quality.
3. Review generated lockfile scope separately from authored changes.
4. Confirm the open gates before treating this as a frozen Pi 1.1 candidate.

Canonical trackers: [Pi 1.1 runtime alignment](../../odd/tasks/pi-1-1-runtime-alignment.md) and [ecosystem strict parity](../../odd/tasks/ecosystem-strict-parity.md).

## Version policy

| Surface | Aligned policy |
| --- | --- |
| Optional peer | `>=0.85.1`, still optional; the compatibility floor is unchanged |
| Development SDK | `^1.1.0`, resolved by the lockfile to exactly `1.1.0` |
| Node.js | `>=22.19.0`, matching published Pi 1.1 metadata |
| Current-runtime CI | Exact Pi pin `1.1.0` in all seven existing workflows |

Before this unit, the development SDK and lockfile resolved 0.87.1 and current-runtime workflows pinned either 0.87.1 or 1.0.0. The project declared Node `>=22`, but SDK 0.87.1 already required `>=22.19.0`; the Node floor change corrects that preexisting declaration mismatch rather than introducing a Pi 1.1-only requirement. The seven aligned jobs are gsp-05e-authenticated-rdd, gsp06-pi-free-parity, memory-openrouter-e2e, memory-pi-free-e2e, pi-1-runtime-evidence, pi-free-smoke, and release-gate.

The `pi-1-runtime-evidence.yml` filename is intentionally unchanged. Its current-runtime name, install step, version assertion, RPC label, and PASS text now say Pi 1.1. Triggers, pull-request filters, permissions, secrets, environment policy, offline/network boundaries, models, jobs, and release policy were not changed.

## Current evidence

- Deterministic RED selected 6 tests: 1 passed and 5 failed because the old SDK metadata, workflow pins, and Pi 1.0 labels remained. There were no loader errors.
- After alignment, the focused contracts passed 20/20, including the Node and unchanged optional-peer checks.
- Local Pi CLI admission reported 1.1.0 and exited successfully. Six real-Pi files then passed 50/50 serially with no failures or skips.
- A direct, shell-free invocation of the local TypeScript compiler with `--noEmit` exited with status 0, `error` undefined, `signal` null, and empty output. The earlier 29 ms npm typecheck receipt lacked explicit child status/error/signal and is not compiler-process proof.
- `npm audit --json` completed successfully with zero advisories.
- Eleven source-path identities were reconciled unchanged before and after verification.

A Windows-only memory-migrations run passed 6/6, including the approximately 30-second live-process lock case. This result neither explains nor fixes the historical CI failure and provides no macOS evidence.

## Lockfile accounting

The lockfile was generated with npm package-lock-only, scripts disabled, and audit disabled; it was not hand-edited.

| Accounting | Result |
| --- | --- |
| Pre-documentation implementation slice | +100 / -16 |
| Generated lockfile | +718 / -1174 |
| Logical packages | 142 to 145 |
| Version-set changes | 38 |
| Lock entries after deduplication | 177 to 150 |
| Added logical packages | `@earendil-works/pi-codemode`, `@earendil-works/pi-mcp`, `quickjs-wasi` |
| Current audit | 0 advisories |

The dependency transition includes Pi-family 0.87.1 to 1.1.0 and broader npm-managed transitive movement. It requires frozen-candidate dependency and runtime scrutiny rather than being treated as formatting noise.

## Historical boundaries

- Source candidate `2b3a839` selected 1,020 tests: 1,017 passed and 3 platform skips on SDK 0.87.1. It is not Pi 1.1 full-suite proof.
- Historical `fcbe905` CI selected 970 tests on Windows: 967 passed, 1 failed, and 2 skipped. The memory helper timed out through a generic 10-second error, so its awaited phase and cause remain unknown.
- The same historical line selected 1,020 tests on macOS: 1,019 passed and 1 failed when the watcher still observed `First` instead of `Second` after eight seconds. The cause remains unknown.
- The new Windows memory pass does not establish a correction for either historical failure. No new native macOS proof exists.
- Ecosystem status remains 16 `PARTIAL` and 0 `FULL`; the frozen baseline and historical evidence are unchanged.

## Pending gates

- [x] Freeze and commit the U1 implementation: `a413e7e4b1306d3557f0ac1a991f1ecf4eaae885` (published through `4290f7d`; U2 remains pending).
- [ ] Run the complete frozen Pi 1.1 validation gate.
- [ ] Build, pack, and verify isolated installation.
- [ ] Complete independent R1/R2/R3/R4 and applicable native review.
- [ ] Obtain required platform evidence, including macOS where applicable.
- [ ] Publish only after parent-controlled reconciliation and approval.

Until these checks pass, this document records alignment evidence only; it does not claim full Pi 1.1 compatibility, all-platform approval, ecosystem `FULL`, or publication readiness.
