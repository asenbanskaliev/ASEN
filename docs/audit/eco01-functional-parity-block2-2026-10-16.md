# ECO-01 block 2 — functional evidence matrix (2026-10-16)

Status: **INCOMPLETE.** This matrix records one source/ASEN registration comparison under a controlled external executable. The actual CodeGraph package remains untested, and 141 of 146 planned scenarios remain UNVERIFIED; five simulation-only observations are marked INTENTIONAL but are not admitted as proof of actual CodeGraph parity.

## Bound identities

- ASEN base checkout tested: `dd28850f8c39d59b12d8227744d61ec65458c09d` on `feat/strict-parity-prerequisites`. The CodeGraph implementation files were unmodified from this commit. All five paired adapter observations and the focused source/ASEN CodeGraph tests are bound to this SHA. The evidence/evaluator batch was committed separately after those executions; that commit does not retroactively change their tested identity.
- Frozen source: `08de420ca29be16b6f6bee725a30b599b061df16`; detached source checkout was clean. The verifier confirmed 14 files and 25 mapped line spans against the pinned inventory.
- Runtime host: linux; Node v24.19.0. ASEN's Pi 1.1.0 runtime is checked separately by CI, but this adapter comparison did not instantiate the Pi host.

## Results

- Inventory: 25 correspondences and 146 planned cases.
- Paired observations: 5 CodeGraph cases (10 source/ASEN process runs). All five are **INTENTIONAL** for the observed registration metadata difference; none are EQUIVALENT. Their normalized behavior, command arguments, errors, and outputs match using a temporary controlled executable. ASEN declares `readOnlyHint: false`, `destructiveHint: true`, `idempotentHint: false`, and `openWorldHint: false`; the frozen source omits annotations. This accurately signals the existing mutating `init` operation and grants no additional authority.
- Remaining: 141 scenarios UNVERIFIED; five simulation-only scenarios are INTENTIONAL; 0 DIVERGENT, 0 NOT_APPLICABLE, 0 EQUIVALENT. No functional parity PASS is claimed.
- The frozen source's own CodeGraph tests: 12/12 passed. ASEN's CodeGraph tests: 12/12 passed. The paired tests do **not** execute the real CodeGraph package, inspect its actual index, or cover Windows/macOS. The related dynamic package-discovery edge remains unverified.
- Full local ASEN check: 1,534 tests, 1,521 passed, 13 skipped, 0 failed; all included audits passed. Log SHA-256: `3cab21abdfec25c05950ebff4a821974352a0609ff795bea3c5172f0f15fa46e`.

## Consolidated matrix and raw evidence

The JSON file lists all 146 planned cases with status, exact source spans, command, environment, outputs, receipt hashes, log hashes, differences, and limitations. Controlled CodeGraph receipts and logs are under `docs/audit/evidence/eco01-codegraph-dd28850f8c39d59b12d8227744d61ec65458c09d/codegraph-pair-evidence.json`; each comparison uses source SHA `08de420ca29be16b6f6bee725a30b599b061df16` and ASEN SHA `dd28850f8c39d59b12d8227744d61ec65458c09d`. The summary JSON hash is `9ee0e0bdafcb2bd6b6de1371f5f9aaa46b98ff4e783e0819497003871890c1f9`. Source and ASEN focused test log hashes are `f1e1225d85fd89cb56e13945b5d564f008449fef294c9431ee03bfbdd8c329cb` and `6bb296fa7d4b8886782176a72fa9bc485a6b17e4b5909d7f8529c9c1e46fc579`.

## R4 self-review

1. **Requirements:** source checkout identity and 25 edge spans are verified; only 1 of 25 correspondences has a paired adapter experiment. The block is not complete.
2. **Evidence:** receipts recompute SHA-256 over captured process output and bind exact contract, scenario, commits, argv and environment. The fake CodeGraph executable is called out in every receipt; its simulation does not establish actual package behavior. No missing evidence is marked PASS.
3. **Risks/regressions:** the evaluator now rejects arbitrary hashes and wrong commits/scenarios, models INTENTIONAL and NOT_APPLICABLE, and compares stdout, stderr, output, exit status, platform, and Node version. Full local checks and focused upstream/ASEN suites pass.
4. **Authority:** the registration metadata difference is documented as intentional; no ASEN security policy was weakened. This is implementer self-review, not independent attestation. ECO-01 block 3 remains separate.

## Remaining gate

The other 11 code mappings lack explicit ASEN counterpart paths and normalized behavior contracts. The 3 tracked source references lack an adopted-scope decision. The 10 external/dynamic edges lack exact reproducible fixtures or a bound ASEN counterpart. Continue by adding reviewed crosswalks and real adapters, then run source and ASEN implementations under matching controlled environments. Do not mark ECO-01 block 2 complete until all applicable cells have evidence and required divergences are resolved.
