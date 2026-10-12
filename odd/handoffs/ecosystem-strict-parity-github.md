# Continue ecosystem strict parity on GitHub

This passive handoff prepares the human-authorized publication of a known BLOCKED WIP checkpoint to existing draft [PR #32](https://github.com/asenbanskaliev/ASEN/pull/32) on `feat/strict-parity-prerequisites` against `main`. The canonical queue and evidence remain in [the ecosystem strict parity task](../tasks/ecosystem-strict-parity.md). Publication is not approval, an RDD bypass, merge authorization, or a claim that unpublished commits are already remote.

## Resume safely

```bash
git fetch origin
git switch feat/strict-parity-prerequisites
git status --short --branch
```

Preserve the stash, `.codegraph/`, and unrelated changes. Keep one writer and one intensive suite at a time, retain reviewable units at or below 400 changed lines, and use only non-force pushes. Do not reset, force-push, delete stashes, merge, or release.

## Publish a blocked WIP checkpoint

The WIP candidate adds a portable test-runner watchdog: 600 s per chunk, 1,200 s overall, positive validated overrides no greater than Node's `2,147,483,647` ms timer maximum, exit `124` that is never PASS, bounded TERM/KILL cleanup, an honest unconfirmed-cleanup result, and late-error guards. On Windows only, the retained baseline test moves into the existing serialized process-heavy bucket; global concurrency, other operating systems, and exactly-once file selection are unchanged.

- Writer classification: RED 15/16, GREEN 16/16.
- Independent Phase 1 `mv4cxlnm-2c-huys`: runner 16/16 PASS in 391.2254 ms; typecheck 18 s; 509-path boundary audit 2 s; diff hygiene PASS.
- Corrected plan: 157 unique files = 144 `remaining` + 13 serialized process-heavy; the baseline appears only in process-heavy.
- Corrected retained-source full run: **BLOCKED**, exit 124 after 602297 ms wall time. `remaining` (144 files, no baseline) timed out at 600082/600000 ms with cleanup confirmed; 317 partial PASS markers, zero FAIL/SKIP markers and no TAP summary. Process-heavy never started and all 43 baseline tests were not run. Portable log basename: `asen-corrected-full-Y2H3gf.log`.
- Historical pre-correction run remains distinct: 145 files, exit 124, 353 partial PASS markers and no TAP summary.
- Isolated diagnostic: 2/2 PASS, 88.7 s versus 346.6 s under whole-suite load. Resource sensitivity is supported, but moving the baseline did not resolve the suite and the whole cause is unproven.

Code review evidence and functional PASS are separate gates. This checkpoint is WIP: the full suite is BLOCKED, FULL-1b remains unchecked, and Pi/OS/package evidence is pending.

- Source work unit: `182deca348ddeb7aca1e1cf48401a5ab307bddff` (`fix(test): checkpoint bounded runner and Windows fixture isolation`), based on `658225849c18a8e5a4755d43ab5b2808e05b7bcb`; four files, +384/-12 (396 changed lines).
- Native committed-only review: `review-24fb23d5e025249c`, one `reliability_review/pi_host_relay`, state `correction_required`. CRITICAL `R3-default-chunk-timeout` reports that the new 600 s default cuts the documented normal 144-file Windows `remaining` chunk, returns 124 before completion, and prevents the serial group. There is no approval, acknowledgement, authority consumption, or submitted correction plan.
- Full-suite result: **BLOCKED**, as recorded above; focused checks do not override it.
- Published remote head: read the Git remote and the final PR checkpoint comment after publication. This guide does not assert push success or a remote SHA.

Current follow-up correction splits the Windows ordinary test bucket into bounded `remaining-*` chunks of at most 50 files while preserving the exact file set. Hosted Windows then reached the serial group and failed first on the 1,200 s overall deadline, so the follow-up raised the default overall budget to 1,800 s while preserving the 600 s per-chunk limit. The next hosted CI proved the overall budget but showed the whole serial group can itself exceed 600 s, so `process-heavy` is also split into serial chunks of at most four files, each still using `--test-concurrency=1`. Local evidence passed focused runner RED/GREEN, typecheck, retained-source `npm test` 1217/1217, parity/skills/skill-parity/memory audits, retained-source ecosystem audit, and upstream-boundary audit. This resolves the local blocker only; exact new-SHA CI, native review and later FULL-1b witness work remain pending.

The original frozen review remains intact; do not reset, recover, abandon, or disable review authority to manufacture green status. A fresh workspace or clone must inspect native authority locally. The review lineage identifier above is historical context, not portable authority.

Do not transfer old CI/package PASS to this source candidate. These passive docs are not a final FULL source/evidence-overlay candidate and remain outside claim-promotion proof. Strict TDD RED is N/A because they change no behavior; structural and readback checks are the applicable evidence.

## Recreate and verify the retained source

CI creates the pinned bare repository through `.github/scripts/prepare-frozen-ecosystem-baseline.mjs`, then exports `ECOSYSTEM_BASELINE_REPOSITORY` through `GITHUB_ENV`. `RUNNER_TEMP` and `GITHUB_ENV` are CI-only inputs: read the helper before adapting it locally; do not present its raw invocation as a supported local command.

After obtaining the same pinned retained bare repository and setting the placeholder to its portable path, run:

```bash
node --import tsx --test tests/test-runner.test.ts
ECOSYSTEM_BASELINE_REPOSITORY=/portable/path/to/retained-ecosystem.git npm test
```

The full run must include actual retained-source proof. Missing source, blanket environment ignores, omitted checks, or skips are not PASS.

## Next atomic work

On GitHub continuation, first inspect native authority locally and preserve the CRITICAL review state; no correction plan has been submitted. Then perform bounded **read-only** diagnosis of the corrected 144-file `remaining` log, not the baseline. Resolve the functional blocker before witness implementation; this handoff authorizes no further local suite or correction.

Later, add `.github/scripts/run-retained-ecosystem-source-witness.mjs` with `tests/retained-ecosystem-source-witness.test.ts`, wrapping the existing public `runTestPlan` contract. Before launch, reject a missing, empty, or whitespace-only `ECOSYSTEM_BASELINE_REPOSITORY`; preserve exit `0`, nonzero exits, signals, and `124`; include an import guard. This unit is planned only—nothing here claims it is implemented or executed.

In another separate later unit, add the macOS workflow tee/status/artifact witness. The commit `cf430e030ddbb5b0abf93d22962f4752f3646cd9` is only the pin for `actions/upload-artifact@v7.0.2`, whose action runtime uses Node 24 while the project uses Node 22. Do not infer or suggest `actions/checkout` or `actions/setup-node` versions without separate proof, and do not combine this with the witness-script unit.

## Remaining gates

### Batched continuation, 12 October 2026

The human requested one publication/hosted verification after a larger phase. Local reviewable commits accumulate before advancing the branch once. No merge or release is authorized.

- Predecessor `0babe0c5122e42b6728e3106aeb325902510e0b7`: CI Windows/Linux and Release Gate passed. macOS full suite passed but the separate retained-source witness failed 41/43 at fixture `git hash-object -w --stdin`, with `ETIMEDOUT` after 30 seconds. Its artifact was retained. This is not a 600-second runner timeout.
- Mutation fixtures now write standard SHA-1 loose Git blobs directly, preserving real Git reads and all mutation assertions. Empty/binary/Unicode round trips are checked against real Git. No deadline increased. Local retained-source plus round-trip tests: 44/44 PASS, zero skips. macOS proof and the environmental cause of slow Git writes remain pending.
- The 24-cell packed-host plan is implemented: two pinned Pi versions, four modes, three operating systems. `node-pty@1.1.0` is dev-only. Each host has a fresh home, stripped credentials, no built-in tools or prompts, exact packed-source digest, public registration observations, observed session shutdown and natural exit. Forced termination, timeout, missing inventory or model start is FAIL. Linux on local source candidate `5e9ab6d10d86a5c4d429de916c59a6c8f57c3880`: 8/8 PASS. This does not prove Windows/macOS or every supported semver.
- Semantic admission checks and evidence recording are implemented. Positive/negative/failure/recovery receipts cover only named preflight contracts; OS and Pi-host receipts require eight completed cells with verified log digests. Three hosted OS jobs can supply eight requested kinds. Six kinds were generated locally for Linux. Artifacts do not automatically promote claims or prove independent execution authenticity; restart/cross-session and final overlay obligations remain separate.
- Focused runner/preflight/host/matrix/receipt/claim checks: 92/92 PASS. Typecheck and six audits PASS with retained source. Full local check: 1,224 tests, 1,222 PASS, two FAIL, zero skips, both reporting `ps ... fatal library error, lookup self` in descendant-process observations. A later direct `ps` passed; root cause is unproven. No full-suite PASS is claimed; those tests remain intact for hosted verification.
- Native review policy remains enabled; no native provider/current portable authority binding was available here. Historical `correction_required` review is preserved. FULL-1b/3/4/5 remain unchecked and 16 claims remain PARTIAL. Next: inspect final hosted cells/logs/artifacts, reconcile exact candidate/source evidence and obtain outstanding review without reusing historical authority.

- **FULL-3:** execute the finite 24-cell matrix: dev-only `node-pty@1.1.0`; Pi `0.85.1` and `1.1.0` × `tui`/`rpc`/`json`/`print` × Linux/Windows/macOS. Require natural exit, no credentials, and no model calls. The source-supported stock print selection `openai/gpt-4o` with no built-in tools avoids a startup credential gap; it is not runtime PASS.
- **FULL-4:** run the semantic gate before the candidate and produce eight actual candidate-bound receipt kinds: positive, negative, failure, recovery, Linux, Windows, macOS, and Pi host.
- **FULL-5:** reconcile drift, claim bytes, and a metadata-only overlay. Resolve the conflict between a post-candidate ODD tracker commit and final promotion before publishing claims.
- Keep all 16 ecosystem rows `PARTIAL` until every gate passes. `LOCAL-4` (ECO-03–14), `LOCAL-5` (ECO-15), and `LOCAL-6` (ECO-16) remain pending.

Commit this passive documentation as a separate unit after the source commit, then non-force push and add a concise Spanish WIP checkpoint comment to PR #32. The parent records the actual published head there after the remote update; do not claim functional PASS, review approval, feature completion, merge, or release.

## Local work while the batched CI is running

The pending local reconciliation unit `7d9e6fe` validates exactly 24 cells, per-OS packed-byte identity, exact candidate/frozen-source bindings, eight receipt kinds and every log/reference digest. Synthetic adversarial tests validate consistency only; real execution authenticity remains a hosted-provenance/review gate. The source-pinned drift report was re-derived against `08de420ca29be16b6f6bee725a30b599b061df16` itself: zero changes/invalidations; this does not inspect a newer upstream snapshot.

Hosted candidate `b4e3489` now passed macOS retained-source witness and all eight Linux matrix cells. macOS matrix passed RPC/JSON/print for both versions; both TUI cells failed immediately with `posix_spawnp failed`, as confirmed in artifact `11737190704` (archive SHA-256 `77b5e0d1a19436c548d121ace9d7ddb2ed5b159ea8c92d33e50109c6a34856c5`). The pinned dependency locally includes macOS prebuilt `spawn-helper` files with mode 0644; a bounded dev-only correction adds owner execution to the actual native helper, preserves bytes and leaves other operating systems untouched. This is a supported diagnosis and pending macOS verification, not hosted PASS.

Local combined admission/preparation/claim checks: 24/24 PASS, zero skips; typecheck, diff hygiene and 522-path boundary PASS. Both new units remain local, with no second publication/CI. All FULL gates and native-review requirements remain unchanged.

## Further local restart and session-isolation verification

Source unit `22bdd974b53756100ee3fc3145e227ebd34cac4f` replaces forced successful verifier shutdowns with EOF and bounded observed natural-zero exits. Cleanup on verifier failure remains bounded, and forced/unconfirmed shutdown is never accepted as natural exit. The installed-package witness now opens a third real RPC session against the same project, checks its own Todo/workspace projections and rejects exposure of the first session's interrupted agent or task. This reuses existing production stores and commands; no second recovery core was added.

Local `npm run verify:pack` PASS: 243 packed files, 28 public exports, nine visible commands, eleven canonical tools, zero model invocations, same-session reopen and foreign-session isolation verified, three natural process exits, environment boundary PASS. This proves recovery of seeded interrupted state and read projections; it does not prove interruption of a live model task, every Pi version/mode/platform, candidate-bound hosted receipts or native approval. Combined focused checks: 28/28 PASS, zero skips; typecheck, 524-path upstream boundary and diff integrity PASS. Changes remain local; no publication or extra CI.

## Batched CI completion and next source publication

Candidate `b4e34892dd950ad7205f855580324720f993c49b` completed general CI tests on all three operating systems and Release Gate successfully. Linux matrix completed 8/8 with receipts. macOS completed six cells but both TUI cells failed as recorded above. Windows reported all eight cells PASS by 09:12 UTC, then its matrix controller remained open until job cancellation at 09:26:57 UTC; receipt generation was not reached. This canceled controller is not a complete matrix PASS. Artifact `11737619843`, ZIP digest `888fe3bb66b287e7a4ca6f4b4262b6dd266fcf303231a5594e748c45de049d8d`, retains those cell observations.

Local unit `d49867d` isolates workspace removal in a 30-second bounded cleanup subprocess and logs its start/completion. The verifier controller explicitly exits only after final cell admission and successful cleanup, flushing logs first; this does not replace natural-exit requirements for any real Pi child. The exact prior Windows stall location (recursive removal versus outstanding native controller handles) is not proven; the new markers bound and distinguish those stages. Focused admission/lifecycle checks 30/30 and local Linux real-host matrix 8/8 PASS with cleanup/controller completion. The semantic CI gate now includes these new checks before host launch.

The earlier single batched CI has finished. Authorization for publication after a substantially advanced phase permits one further branch update containing the local reconciliation, macOS dev-helper correction, real package restart/session isolation and bounded controller work, with no intermediate CI. Hosted verification of these repairs and native approval remain pending; all claims stay PARTIAL.
