# Pi 1.1 runtime alignment

## Windows worker and spawned-environment batch — 2026-10-09

Exact baseline `5265f0ece6076d496a80dc1bb970f11d6eebbc72` failed Windows PR CI `37971613716` in the migration holder/opener worker phase; push CI `37971606226` and Release Gate `37971614050` failed the environment fixture on HOMEDRIVE. Linux/macOS CI and package/install, Pi 1.1 and architecture passed. Pi Free stayed SKIPPED. No prior PASS is transferred to the follow-on.

Node 22.19.0's [libuv Windows process implementation](https://github.com/nodejs/node/blob/v22.19.0/deps/uv/src/win/process.c) declares eleven required runtime variables and inserts absent values when constructing a child environment. The environment test still asserts that excluded names are absent from the supplied env, and still rejects provider/unrelated-secret inheritance. Only known OS/libuv-added runtime names are compared against a second subprocess with the same runtime-only env and no credentials; macOS's generated encoding variable uses the same control. Production filtering and provider configuration are unchanged.

Migration and session-identity files use worker threads with bounded startup phases and internal concurrent opens. Fourteen worker tests passed in isolation. Both files join the existing serial Windows group, preserving their worker concurrency, wait windows and timeouts. Exact test selection remains covered by the runner regression; the Windows timeout cause remains unproven pending the new Actions. No migration/store/lock implementation was changed.

Validation: 14 isolated worker tests PASS; final environment/runner tests 14/14 PASS with zero skips; typecheck PASS. The full frozen-baseline suite selected 1,033 tests: 1,032 PASS, one FAIL, zero skips/cancellations. The sole failure is the known local `ps: fatal library error, lookup self` process-cancellation observation; it is not PASS. All six audits passed separately after the suite blocked npm run check. Diff hygiene passed. No pack/install surface changed and no provider/model or manual workflow ran.

Own code/test review covers the test env boundary, Windows/POSIX selection and preserved internal concurrency, not independent/native approval. U2/ECO-02A stay open, ECO-03 is not admitted, and claims remain 16 PARTIAL / 0 FULL. Rollback is limited to the two worker filenames in the test plan/selection fixture, environment test assertions and these notes. New exact-SHA Actions must establish platform results.

## Windows environment and History batch — 2026-10-09

Baseline `1ac4feecdaefcc8575493b56e8a9eb75c521d4e5` passed Linux/macOS CI and package/install, Pi 1.1 and architecture, but Windows CI push `37967700255` and PR `37967705877` failed the environment fixture (`SYSTEMROOT` compared with undefined). Windows Release Gate `37967705883` failed the History 40-write lock timeout. Pi Free stayed SKIPPED.

Plain copies of Windows process.env lose its case-insensitive property lookup. The runtime-only allowlist now normalizes source names on Windows, preserving mixed-case Path/SystemRoot/ComSpec while still excluding provider and unrelated secrets. POSIX remains case-sensitive. A platform-injected regression covers both behaviors; the subprocess test compares canonical runtime values and continues asserting secret exclusion.

History's existing 40 concurrent writes and multiprocess tests are retained. The file joins the existing serial Windows group so unrelated test files do not compete for filesystem operations. The test additionally asserts that the canonical lock is absent after the 40 writes. The exact-selection regression passes. The Windows timeout cause is not established; this bounded scheduling intervention requires new Windows Actions and does not change the lock protocol or timeouts.

Validation of this batch: 41 focused tests passed with zero skips; typecheck passed. Full frozen-baseline suite selected 1,033 tests: 1,032 PASS, 1 FAIL, zero skips/cancellations. The sole failure is the existing local process-observation error `ps: fatal library error, lookup self` in `Pi cancellation settles its process tree and policy cleanup before returning`; it is not PASS. Environment, History, RPC and the three formerly skipped frozen-baseline cases passed. All six audits passed separately after `npm run check` stopped at the suite failure. Packed-install verification passed (28 exports, seven visible RPC commands, zero model invocations); diff hygiene passed.

Own code/test review checked requirements, credential filtering, POSIX/Windows regression boundaries and exact test selection. It is not independent/native approval. New exact-SHA CI remains required. U2/ECO-02A remain open, ECO-03 is not admitted, and 16 PARTIAL / 0 FULL remains unchanged. Rollback is limited to the environment helper/declaration, focused fixtures, History scheduling/lock assertion and these evidence notes.

## Follow-on CI fixture repair — 2026-10-09

The nine-commit follow-on was transferred without rewriting from the Copilot branch to PR #32 at `f69d56d327dcf6a7d777a669c34e5909451a6fe9`. Its exact CI push (`37964631169`) and PR (`37964638499`) failed on macOS and Windows; Release Gate (`37964638533`) failed on macOS and cancelled Windows. Linux, Pi 1.1 and architecture passed. Pi Free was SKIPPED, not provider PASS.

The new environment test replaced Windows system paths with nonexistent fixture paths, causing Node CSPRNG initialization to abort. macOS synthesized `__CF_USER_TEXT_ENCODING` in the child even though it was excluded from the supplied environment. The bounded correction preserves actual runtime paths, asserts exclusion on the exact supplied environment, and allows only that macOS-generated non-secret variable in child observations. Provider and unrelated-secret exclusion remains asserted in the real subprocess; production filtering and timeouts are unchanged.

Local checks: 13 focused environment/test-runner tests passed; the final environment fixture passed 5/5. With the existing frozen-object preparation mechanism, baseline/environment tests passed 28/28 with zero skips, including the three previously omitted baseline tests. Typecheck, all six audits, packed installation (28 exports, seven visible RPC commands, zero model invocations), and diff hygiene passed. The full suite was started with the frozen baseline available; its overall result must be reported separately. Its offline interaction RPC test timed out at 15 seconds, then passed when isolated; this is not a full-suite PASS.

CodeRabbit installation was blocked by automatic security review of an unverified PostHog telemetry request. No independent approval or native review is claimed. New-source CI must be observed for its exact SHA. U2, ECO-02A and independent review stay open; ECO-03 remains gated and ecosystem claims stay 16 PARTIAL / 0 FULL.

## Exact baseline candidate observation — 2026-10-09

Before this follow-on, PR #32's remote HEAD was `90515eb76f9ac3d21e04a97bee0bbcbad4db3e5f`; full history confirmed 315 commits ahead and 0 behind `main` `49129b616c5349fbf323b74860136fc1593f9b2a`. Exact-SHA GitHub Actions reported:

| Gate | Run | Result |
| --- | --- | --- |
| CI push | `37953616675` | PASS |
| CI pull request | `37953624466` | PASS: Ubuntu, macOS, Windows, architecture |
| Release Gate | `37953624370` | PASS: Ubuntu, macOS, Windows package jobs |
| Pi 1.1 runtime | `37953624367` | PASS: real RPC, no model run |
| Phase 0 Architecture | `37953624363` | PASS |
| Pi Free Smoke | `37953624492` | SKIPPED, not provider PASS |

The GitHub native-review list was empty; the earlier independent review was incomplete and is not approval. This baseline green does not transfer to follow-on commits. The follow-on is allowed to correct the base R2 finding and document/prove the publicly supported B2 scope, but ECO-03 remains gated.

The exact published Pi `0.85.1` package exports the public `VERSION` and extension loader APIs. A locally packed ASEN tarball installed with the optional peer omitted loaded in the real Pi `0.85.1` CLI on Linux; its seven RPC commands were visible and no model was invoked. This is one real-host minimum-version observation, not a full compatibility or platform matrix. `verify:pack` now asserts the peer is absent from the installed artifact before its Pi-host checks.

## Windows CI repair batch — 2026-10-09

Published HEAD `b977e55` passed Pi, architecture and three-platform package/install gates, but both CI events failed the Windows evidence/TDD timeout. The bounded candidate moves that file into the existing serial Windows contained-process group without raising timeouts or omitting tests. See the [exact CI and repair evidence](../../odd/tasks/pi-1-1-runtime-alignment.md). One publication includes source, tests and metadata; no Markdown-only CI dispatch. U2, independent review and B2/ECO-02A remain open; 16 PARTIAL / 0 FULL is unchanged.

## Historical implementation follow-up — 2026-10-09

The original Pi 1.1 candidate now has successful CI and package/install gates on Ubuntu, Windows and macOS after the bounded Ubuntu retry. The user authorized correcting reproduced installed-package/API defects on this same PR. See the [canonical follow-up](../../odd/tasks/pi-1-1-runtime-alignment.md) for exact identities and remaining gates. New source candidates do not inherit earlier CI. U2 and final independent review remain open; B2/ECO-02A and production orchestration integration stay pending. Optional peer `>=0.85.1`, frozen/historical evidence and 16 PARTIAL / 0 FULL remain unchanged.

## Prior handoff reconciliation (superseded) — 2026-10-09

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

## Historical U1 evidence

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

## Historical U1 pending-gate snapshot

- [x] Freeze and commit the U1 implementation: `a413e7e4b1306d3557f0ac1a991f1ecf4eaae885` (published through `4290f7d`; U2 remains pending).
- [ ] Run the complete frozen Pi 1.1 validation gate.
- [ ] Build, pack, and verify isolated installation.
- [ ] Complete independent R1/R2/R3/R4 and applicable native review.
- [ ] Obtain required platform evidence, including macOS where applicable.
- [ ] Publish only after parent-controlled reconciliation and approval.

Until these checks pass, this document records alignment evidence only; it does not claim full Pi 1.1 compatibility, all-platform approval, ecosystem `FULL`, or publication readiness.
