# ASEN — CI portable baseline reconciliation (2026-11-13)

## Scope and authority

Owner requested a fresh GitHub audit of code, documentation and failing CI, followed by repairs. Exact source head: `12fc65be8dd3974aa7856db313597db760dc82a4`; last prior confirmed green candidate: `a49d8ad939921c5f004c4a71c0774885fd728599`. This separate branch is a *repair candidate*, not feature acceptance, native approval, release or authorization to merge into `main`.

No changes to the upstream Pi fork, P32 font/capture/footer implementation, permissions, private fixtures, provider consent, historical stopped proof, or R4 acceptance status. Do not claim green or FULL without new same-SHA receipts.

## Implemented bounded repairs

- Preserve Pi `(args, ctx)` command signature in scoped `registerData` wrapper, including direct zero-argument test calls, without moving publication guard into `args`.
- Distinguish Markdown path from `#fragment` in documented links; explicitly check the two known handoff section titles.
- Align review/persona help tests with actual public read-only usage; do not claim native review approval.
- Align protected-literal CLI argument fixtures with the one explicitly auto-loaded ASEN package extension. These tests still check the exact forwarded literal tail, without removing denials or parser validation.
- Record the ODD workflow selection distinction without treating agents/modes as authorization.
- Replace a test-only dependency on an intentionally deferred private/design path with a **synthetic, versioned public regression oracle** derived from the checked-in WIP runtime colors. It does not replace real design provenance, color approval, host snapshots or P32 verification.

## Still blocked / not repaired by this batch

- `scripts/audit-upstream-boundary.mjs` flags 27 referenced paths, including external provenance documents and native RDD schema literals. Separate security assessment required before any narrowly allowed exceptions; never disable audit globally.
- P05/P10/P11 stateful frozen test roots, `ASEN_AUDIT_ROOT` and ignored legacy helper `.asen-audit/env-c.sh` need independently admitted, portable isolated test fixtures.
- P32 gauge RED is intentional and `STOPPED_BLOCKED`, not a harmless snapshot mismatch. No normalization or fake GREEN.
- Packed Pi RPC first-command timeout, concurrent Pi process/effort 5-second timeouts, and agent state teardown `ENOTEMPTY` need cause-focused reproductions. Do not just extend deadlines to hide a hang.
- CI test-shard coverage, R4 evidence and T12 integrated security are downstream gates; they cannot be promoted to PASS independently of their inputs.

## Verification and acceptance

Static source review only before publication. Publish on separate feature fix branch, open draft PR *into the existing development branch*, run GitHub CI against its exact head, inspect all relevant checks and follow remaining failures with separate test-first fixes. Do not merge automatically, do not alter the base PR #57 or its head, and do not claim `globalFull:true`.

## Next security-boundary candidate — explicit path/schema treatment

The previous candidate proved that packaged Pi RPC can advance beyond native-menu waits and CLI vector assertions, but Phase0 and the package scan still reject the same exact external wire-schema strings. The next change adds one shared **audit-only** policy helper for 25 historically published, non-executable provenance documents and for exactly three `schema`-property values in `src/review/native-rdd-control.ts` and its test. All unknown paths, executable imports, unmatched strings and suffix mutations continue to fail. The packed-product verifier uses the same schema-masking helper; no production RDD validator or wire format is modified. Tests verify legitimate exact shapes and malicious lookalikes/imports. Documentation exceptions are path-literal, never directory globbing.

This is a **risk-relevant security policy change, IMPLEMENTED_PENDING_INDEPENDENT_REVIEW**: a green automated gate does not establish an independent review, genuine native authority, publisher provenance, real host acceptance or global parity. In particular, grandfathered provenance text must be reviewed before adding new exception paths. Do not promote this candidate to a release or merge without separately evaluating the policy changes and the complete CI results.

## Focused CI repair candidate — November 13, subsequent audit

- Native editor tests now simulate actual `mode=tui`; RPC no-selector tests remain and must stay negative. This fixes the test contract rather than broadening RPC interactive privileges.
- P05/P10/P11/skill-loader public tests now allocate isolated synthetic own roots on demand and remove only those roots. They **do not** confer retrospective parent admission to any frozen private evidence; acceptance remains separately blocked.
- Agent runtime fallback test waits for durable terminal notification before deleting the fixture, preventing teardown racing a background persistence operation. No production result is assumed before persisted terminal.
- The previously RED P32 observed-only status gauge has now been added to the actual formatter, bounded to a complete-width host row; tests still verify byte-for-byte legacy/unknown/narrow outputs. **Visual Windows Consolas glyph proof and owner-deferred capture are NOT made green by this unit change** and remain open for independent review. This new user instruction requested repairing CI errors; no fonts/assets are copied or installed.
- The strict CI matrix/R4 admission is not weakened: technical checks can run on the review PR but global FULL is gated on authentic, same-SHA results and separate visual/independent proof.

## R4 technical candidate run on the review PR

CI conditionals now admit the exact `fix/ci-portable-baseline-20261113` head **only when** the PR base is `feat/t12-integrated-acceptance-merge`. R4 native-input validation separately enforces the same branch/base pair, repository, immutable checkout SHA, and same-run prerequisite statuses. T07 and T12 are enabled for this exact review PR. No secret-dependent R4 independent reviewer and no paid-provider live test is enabled. If a required shard fails, R4 technical **must** emit `R4_TECHNICAL_FAIL` with `globalFull:false`. Automatic `R4_TECHNICAL_PASS`, if eventually achieved, remains neither independent review nor full Shell/ASEN parity.
