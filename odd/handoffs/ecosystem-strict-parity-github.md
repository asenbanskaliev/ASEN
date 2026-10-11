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

Current follow-up correction splits the Windows ordinary test bucket into bounded `remaining-*` chunks of at most 50 files while preserving the exact file set and the serial `process-heavy` group. Hosted Windows then reached the serial group and failed only on the 1,200 s overall deadline, so the follow-up raises the default overall budget to 1,800 s while preserving the 600 s per-chunk limit. Local evidence passed focused runner RED/GREEN, typecheck, retained-source `npm test` 1217/1217, parity/skills/skill-parity/memory audits, retained-source ecosystem audit, and upstream-boundary audit. This resolves the local blocker only; exact new-SHA CI, native review and later FULL-1b witness work remain pending.

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

- **FULL-3:** execute the finite 24-cell matrix: dev-only `node-pty@1.1.0`; Pi `0.85.1` and `1.1.0` × `tui`/`rpc`/`json`/`print` × Linux/Windows/macOS. Require natural exit, no credentials, and no model calls. The source-supported stock print selection `openai/gpt-4o` with no built-in tools avoids a startup credential gap; it is not runtime PASS.
- **FULL-4:** run the semantic gate before the candidate and produce eight actual candidate-bound receipt kinds: positive, negative, failure, recovery, Linux, Windows, macOS, and Pi host.
- **FULL-5:** reconcile drift, claim bytes, and a metadata-only overlay. Resolve the conflict between a post-candidate ODD tracker commit and final promotion before publishing claims.
- Keep all 16 ecosystem rows `PARTIAL` until every gate passes. `LOCAL-4` (ECO-03–14), `LOCAL-5` (ECO-15), and `LOCAL-6` (ECO-16) remain pending.

Commit this passive documentation as a separate unit after the source commit, then non-force push and add a concise Spanish WIP checkpoint comment to PR #32. The parent records the actual published head there after the remote update; do not claim functional PASS, review approval, feature completion, merge, or release.
