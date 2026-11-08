# M5-06 consumption contract — from captured observations to admissible verdicts

Status: PREPARED, NOT WIRED. This document exists for owner approval before any step below is
connected to the canonical acceptance workflow. The code and tests landed locally; the workflow
diff is intentionally absent until this contract is approved.

## What ships here (pure, CI-independent)

- `observationsFromC01Report({report,readiness,artifactPath})` in `scripts/shell-asen-parity.mjs`:
  converts one graded C01 beam report (`asen-r4-c01-two-real-pi-inferences/v1`) into the
  `asen-shell-asen-observations/v1` pair that `compareShellAsenClaims` already consumes.
  Identity gates run first: candidate/reference SHA equality against the readiness, frozen
  reference commit, plausible `runId`/`runAttempt`, exactly two distinct sources, a canonical
  non-symlink artifact path, and artifact bytes that deep-equal the report. A report that already
  carries promotion state (`certifiedFullCases≠0`, `globalFull`, `independentReviewPerformed`) is
  refused. `execution:"real"` is emitted only from the bounded agent-start proof.
- `attestC01Comparison({comparison,consentReceipt,reviewRecord,runContext})`: with no inputs it
  returns the comparison byte-identical (verdicts stay `*_CLAIM_UNATTESTED`); a partial pair
  (consent without review, or review without consent) fails closed; with both genuine inputs only
  the per-case claim status upgrades to `*_CLAIM_ATTESTED` for exactly one run identity. The
  certified counters stay zero and `globalFull` stays false in every path — registry stage
  advancement remains owned by CI assembly and independent acceptance.
- `validateParityConsentReceipt` / `validateParityReviewRecord`: the UFC-M5-02 execution schema.
  Consent: owner identity, exact candidate SHA, decision fixed to
  `consumption-and-attestation-wiring`, run-bound so replay into another run throws.
  Review: reviewer identity must not carry the owner prefix, approved verdict only, non-empty
  findings, same SHA/run binding. The reviewers and grants live outside the repository; nothing
  here fabricates either input.

## What is NOT wired (requires owner approval)

1. A workflow step that runs `observationsFromC01Report` + `compareShellAsenClaims` +
   `attestC01Comparison` over the uploaded C01 artifacts of the acceptance job, emitting a
   `consumption.json` artifact. Until it exists, every genuine beam report stays inert by design
   and every remaining case honestly reports UNATTESTED/BLOCKED.
2. The §Q8(2) zero-state precondition swap in the assembler. It is sequenced strictly behind the
   first genuine consumption in one CI unit; no part of it ships in this batch.
3. Any attestation issuer. Consent and independent review inputs are human artifacts; the
   validators define the shape, the CI wiring (if approved) will only ever verify.

## Invariants preserved

- Comparator rules unchanged: foreign SHA, duplicates and non-real observations are still rejected
  inside `compareShellAsenClaims` (proven by the pre-existing tests, which were not modified).
- `globalFull` logic untouched; `registry/parity` files untouched; no hand-edited registries.
- Local CLI behavior unchanged: outside a real GitHub run `node scripts/shell-asen-parity.mjs`
  still fails closed with `SHELL_ASEN_R4_REJECTED`.

## Approval questions for the owner

- Approve adding the consumption step (read uploaded C01 artifact → emit `consumption.json`) to
  the acceptance workflow, and in which job ordering?
- Who are the admissible `grantedBy` owner identities and `reviewerId` independent identities, and
  how are those receipts delivered into the runner (path, not repository, is suggested)?
- Confirm the §Q8(2) precondition swap stays out of scope until the first genuine consumption is
  observed in CI.
