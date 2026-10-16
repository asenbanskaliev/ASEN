# ECO-01 block 2 — functional evidence matrix (2026-10-16)

Status: **INCOMPLETE.** This matrix records source/ASEN observations with explicit limitations. The 5 CodeGraph scenarios have now been rerun against the authentic dynamic package 1.6.2 and remain INTENTIONAL for the host annotation difference; registration and 136 other planned scenarios remain UNVERIFIED. No equivalence is admitted for the dynamic package.

## Bound identities

- Frozen source: `08de420ca29be16b6f6bee725a30b599b061df16`. CodeGraph package evidence is bound to ASEN code commit `1cae8b74427358e96738b6223aed1583d6e6b361`; Todo core-state evidence is bound to current published tree/commit `b1f028ce2dde27757a901cd8722a4fe5ee27565f`. The latter includes only evidence/matrix/documentation changes over the tested implementation tree. The source checkout is clean; ignored dependency files used for the Todo run did not change tracked source files.
- Frozen source: `08de420ca29be16b6f6bee725a30b599b061df16`; detached source checkout was clean. The verifier confirmed 14 files and 25 mapped line spans against the pinned inventory.
- Runtime host: Linux, Node v24.19.0. The Todo comparison loaded each implementation directly, with Pi TUI versions 0.87.1 (frozen source manifest) and 1.1.0 (ASEN lockfile); it did not instantiate both Pi extension hosts.

## Results

- Inventory: 25 correspondences and 147 scenarios (146 original plus one added duplicate-request scenario).
- Paired observations: 5 CodeGraph cases (10 source/ASEN process runs) against authentic npm package `@colbymchenry/codegraph@1.6.2`. All five are **INTENTIONAL** for the observed host annotation difference; none are EQUIVALENT. The matrix links each row to paired receipts and logs. Earlier controlled-executable observations are retained as historical evidence only. ASEN declares `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`, and `openWorldHint: false`; the frozen source omits annotations. This accurately signals the existing mutating `init` operation and grants no additional authority.
- Status counts: 8 INTENTIONAL, 139 UNVERIFIED, 0 DIVERGENT, 0 NOT_APPLICABLE, 0 EQUIVALENT. The three new Todo INTENTIONAL observations describe deliberate invalid-input signaling, restart blocking, and duplicate-request protection. No functional parity PASS is claimed.
- Source Todo suite: 17/17 passed; ASEN Todo store and Pi tool suites: 34/34 passed. The real CodeGraph package remains a dynamic version, and its test was Linux-only. Todo registration, authorization and full Pi lifecycle are not closed.
- Full local ASEN check: 1,534 tests, 1,521 passed, 13 skipped, 0 failed; all included audits passed. Log SHA-256: `3cab21abdfec25c05950ebff4a821974352a0609ff795bea3c5172f0f15fa46e`.

## Consolidated matrix and raw evidence

The JSON file lists all 147 scenarios with status, exact source spans, command, environment, outputs, receipt hashes, log hashes, differences, and limitations. Controlled CodeGraph receipts and logs are under `docs/audit/evidence/eco01-codegraph-dd28850f8c39d59b12d8227744d61ec65458c09d/codegraph-pair-evidence.json`; each comparison uses source SHA `08de420ca29be16b6f6bee725a30b599b061df16` and ASEN SHA `a98fa1510a30234f4fbd39381d85bab5437f0143` (adapter targets unchanged from `dd28850…`). The pair evidence JSON hash is `5fbe66207a5d51bec8e9857ee1d8ff88916c06b6dd9e755100c1282016e9ec6c`. Source and ASEN focused test log hashes are `f1e1225d85fd89cb56e13945b5d564f008449fef294c9431ee03bfbdd8c329cb` and `6bb296fa7d4b8886782176a72fa9bc485a6b17e4b5909d7f8529c9c1e46fc579`.

## R4 self-review

1. **Requirements:** source checkout identity and 25 edge spans are verified; only 1 of 25 correspondences has a paired adapter experiment. The block is not complete.
2. **Evidence:** receipts recompute SHA-256 over captured process output and bind exact contract, scenario, commits, argv and environment. The fake CodeGraph executable is called out in every receipt; its simulation does not establish actual package behavior. No missing evidence is marked PASS.
3. **Risks/regressions:** the evaluator now rejects arbitrary hashes and wrong commits/scenarios, models INTENTIONAL and NOT_APPLICABLE, and compares stdout, stderr, output, exit status, platform, and Node version. Full local checks and focused upstream/ASEN suites pass.
4. **Boundary regression:** the first CI candidate was rejected by the upstream-boundary audit because the report repeated source repository names and paths outside the provenance registry. The matrix now binds each edge by inventory source ID, reference index, exact commit, and span; raw paired commands use a sanitized checkout path. The boundary audit passes locally after this correction.
5. **Authority:** the registration metadata difference is documented as intentional; no ASEN security policy was weakened. This is implementer self-review, not independent attestation. ECO-01 block 3 remains separate.

## Remaining gate

The other 11 code mappings lack explicit ASEN counterpart paths and normalized behavior contracts. The 3 tracked source references lack an adopted-scope decision. The 10 external/dynamic edges lack exact reproducible fixtures or a bound ASEN counterpart. Continue by adding reviewed crosswalks and real adapters, then run source and ASEN implementations under matching controlled environments. Do not mark ECO-01 block 2 complete until all applicable cells have evidence and required divergences are resolved.

## Revalidation against current PR HEAD (2026-10-16)

- Current PR head verified before execution: `1359d892f177dd1b76501961582ea3a7eedab8f1`; frozen source remains `08de420ca29be16b6f6bee725a30b599b061df16` with tree `9af648106ed75fa270476e9d474bad93aa38af6b`.
- The CodeGraph adapter contract was re-run for normal, invalid-input, denied, partial-failure, and restart fixtures: 5 paired scenarios / 10 process executions. The matrix now points these observations at the exact current ASEN SHA. They remain **INTENTIONAL simulation observations**, not EQUIVALENT and not admitted evidence of real package behavior; the test executable was controlled, and actual CodeGraph package/index semantics and macOS/Windows remain untested.
- Frozen source focused suite: 12/12 passed. ASEN focused suite: 12/12 passed. `npm run typecheck` and `git diff --check`: PASS. Logs and output receipts are stored under `docs/audit/evidence/eco01-codegraph-1359d892f177dd1b76501961582ea3a7eedab8f1/` and bound in the matrix by SHA-256.
- Recomputed scope remains 25 correspondences / 146 scenarios: 5 INTENTIONAL controlled observations, 141 UNVERIFIED, zero EQUIVALENT, zero DIVERGENT, zero NOT_APPLICABLE. Of the 12 code-contract edges, this re-ran one; the other 11 remain without exact counterpart mappings or paired functional evidence. The 3 file references and 10 external/dynamic edges are also unclosed. ECO-01 block 2 remains **INCOMPLETE**.
- R4 self-review: current-head identity and source identity are explicit; the evidence does not inflate a simulation into a parity claim. No source or ASEN implementation behavior was changed. This is implementer verification, not the independent block-3 audit.

## File-reference checks

- The frozen asset-directory reference resolves from its owning source file to `assets/agents/` inside the frozen root. The current inventory reports `outside-root` because the normalized directory retains a trailing slash that the safe-path predicate rejects. This is an inventory classification defect; I recorded it without changing the frozen source manifest or treating the asset set as parity.
- The source's direct-child Markdown discovery returned 10 files on this Linux checkout. Their Git object IDs, content SHA-256 values, byte lengths, and observed discovery order are recorded in the file-reference evidence. Filesystem enumeration order is host-specific; this does not establish cross-platform ordering.
- The frozen telemetry schema is present with an exact Git blob identity; its mapped ASEN path is absent. The mapped asset directory is also absent in ASEN. Both rows remain `UNVERIFIED`: no reviewed scope decision permits `NOT_APPLICABLE`, and no functional counterpart exists to compare.
- Evidence is bound to source `08de420…` and ASEN `1359d89…`; no source files were modified. The 3 file-reference scenarios therefore remain open, and block 2 remains incomplete.
- Added `tests/eco01-file-reference-evidence.test.ts` to recompute the frozen tree, file blob IDs, byte counts, and SHA-256 values from Git objects; it also checks that the mapped ASEN targets are still absent and keeps all three dispositions `UNVERIFIED`. The focused test passed with the exact source checkout. CI will rerun it with the frozen bare repository prepared by the workflow.

## Real CodeGraph package experiment (candidate `1cae8b74427358e96738b6223aed1583d6e6b361`)

- Installed and executed the authentic npm package `@colbymchenry/codegraph@1.6.2`, verified against registry integrity `sha512-hODH/mGnCf3IUMs6rzktv/zbecJIKJfdZAYHZ9mqecb0G7ZkHaA8CZafDVnswANFEL1YFcG+lfAwc5SIXzUH6Q==` and shasum `372b7b4f0190197b07d444116d6692240883a2d5`. Telemetry and package download fallback were disabled. Environment: Linux, Node v24.19.0.
- Exercised 5 paired scenarios across source and ASEN, 10 process runs: normal initialization, invalid input, denied workspace access, corrupt-index partial failure, and restart/reopen. Captured full argv, stdout/stderr, exit codes, filesystem state and hashes in `docs/audit/evidence/eco01-codegraph-live-1.6.2-1cae8b74427358e96738b6223aed1583d6e6b361/codegraph-live-evidence.json` and its raw logs. All five observations are `INTENTIONAL` because the functional CLI behavior matched while host tool annotations differ; none is admitted as EQUIVALENT. The corrupt index remained unchanged after failure; normal and restart observations recorded index hashes.
- This real-package experiment raises confidence for the current Linux runtime, but package version 1.6.2 is dynamic rather than the frozen dependency version, and no macOS or Windows run was made. Overall result remains `UNVERIFIED`; the other code contracts, three file references, and external/dynamic edges remain open. This is implementer self-review only, not an independent audit.
- Revalidation for this evidence batch: the 8 ECO-01 focused tests passed, TypeScript typecheck passed, upstream-boundary audit passed, and `git diff --check` passed. The Actions workflows for the prior published candidate were still running at the time of this update; CI for this batch will be checked after publication.


## Todo core-state comparison (candidate `b1f028ce2dde27757a901cd8722a4fe5ee27565f`)

- Ran five source/ASEN experiments against frozen source `08de420ca29be16b6f6bee725a30b599b061df16` and ASEN tree `ae33a228960d26106984541254cddb00223c3b3d`: normal add/update/replay, invalid title, restart recovery, duplicate request, and whole-list write failure. Evidence is in `docs/audit/evidence/eco01-todo-live-b1f028ce2dde27757a901cd8722a4fe5ee27565f-r3/todo-pair-evidence.json` (SHA-256 `eb3640460b7eca2f944f89549f6302059e0a1d9e6123cb1c4ac6c1867b6940d5`), with side logs and raw state snapshots. The reproducible runner is `scripts/eco01-todo-pair.mjs`.
- Invalid title: both sides preserve an empty task state; the source returns an error result while ASEN rejects the Pi tool call. This deliberate host-visible error distinction is marked INTENTIONAL.
- Restart: source transcript replay leaves its task `in_progress`; ASEN preserves its durable event history and changes interrupted `running` work to `blocked`, requiring explicit review before continuing. Marked INTENTIONAL as a recovery safety difference.
- Duplicate request: two source `add` operations create two tasks; retrying the same ASEN request ID returns the same task and leaves one task. Marked INTENTIONAL to prevent duplicate work.
- Normal add/update remains UNVERIFIED because the state and identity mapping (`in_progress` vs `running`, integer IDs vs opaque session/project/revision-bound IDs) has no accepted normalization. Atomic whole-list failure also remains UNVERIFIED: source supports `write`, while ASEN exposes no direct batch replace/clear counterpart. Registration and denied-context scenarios are still open.
- The frozen checkout has no package lock. I installed its manifest-pinned Pi TUI 0.87.1 with scripts disabled for this probe; `git status` showed no tracked source changes. This limits package-level reproducibility.
- Added a test that recomputes source Git blob identity, evidence/log hashes, and matrix classifications. Latest local focused validation: 9/9 ECO-01 tests passed, typecheck passed, upstream boundary audit passed, and `git diff --check` passed. This remains an implementer comparison, not independent review.
