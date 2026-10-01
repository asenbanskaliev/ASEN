# Upstream Skills strict behavioral parity

## Goal

Implement observable, automated behavioral parity for all 12 frozen upstream Skills while preserving ASEN naming, Pi-native execution, and honest capability status.

## Source baseline

- Upstream repository, commit, exact paths, and hashes are confined to `registry/parity/skill-sources-v1.json` under the provenance-only boundary exception.
- The included Skill IDs are the exact 12 entries declared by that frozen source manifest.
- Referenced upstream support contracts, including `_shared/review-ledger-contract.md`, are part of the comparison boundary.
- Existing audit result: 11 partial mappings and one intentionally different registry; the user has rejected the registry exception and requires strict 12/12 behavioral parity.

## Decisions and constraints

- Match observable behavior, gates, outputs, and negative cases; internal ASEN names may differ.
- Use `.asen/skill-registry.md`, never `.atl`.
- `skill-registry` must support multi-source discovery, deterministic precedence/deduplication, caching, and configured memory persistence when available.
- Keep `CAP-SKL-001` and affected parity rows non-final until automated evidence supports promotion.
- Use Pi Free as the sole model-backed verification provider.
- Preserve all 27 existing ASEN Skills unless a reviewed mapping explicitly replaces one without capability loss.
- Do not modify or merge PR #30; this work is a feature branch chain based on exact PR #30 SHA `bdcbe7a714a9d2f3a801afc221f1476ec9d45237`.
- Use one honest slicing pass; target reviewable slices near or below 400 authored changed lines, without code-golf or deleting evidence.
- Do not push or open chained PRs without a separate delivery decision.

## Delivery strategy

Feature Branch Chain based on PR #30:

```text
PR #30 audited baseline
  └─ Slice 1A: source manifest, contract matrix, and style guide 📍
      └─ Slice 1B: parity validator and negative tests
          └─ Slice 2: communication and documentation
              └─ Slice 3: Skill authoring and registry
                  └─ Slice 4: delivery workflows
                      └─ Slice 5: orchestration and review
                          └─ Slice 6: final parity verification
```

The tracker remains draft/no-merge if PRs are later created. Each child targets the immediate parent branch.

## Tasks

- [x] GSP-01 — Freeze contracts and build the 12/12 parity harness.
  - [x] Slice 1A: added the frozen 12-Skill/support source manifest, strict behavioral matrix, normative ASEN Skill style guide, authoring/audit references, and path-scoped provenance boundary test.
  - [x] Slice 1B: added deterministic validation for missing contracts, undocumented differences, unsupported FULL claims, invalid source references, exact source identity, and the ASEN registry path.
  - Slice 1A is 482 authored lines excluding this feature document after one honest split. The maintainer explicitly accepted `size:exception`; content was not compressed or weakened.
- [x] GSP-02 — Align communication and documentation Skills.
  - `asen-doc-design`: review path, out-of-scope section, checklist/template behavior, and automated quality checks.
  - `asen-collaboration-message`: context language, warm/direct tone, 1–3 paragraph default, no em dash, and anti-pile-on priority.
  - RED: the focused communication test failed 6/6 against missing metadata, activation exclusions, contract markers, and matrix evidence.
  - GREEN/REFACTOR: focused tests pass 7/7, including runtime activation routing through `selectSkills`; Skill audit passes 27/27; parity, upstream-boundary, typecheck, and diff checks pass.
  - Matrix rows remain PARTIAL pending Pi Free positive and negative generated-output probes in GSP-06.
  - Commit: `7f085db`.
- [x] GSP-03 — Align Skill authoring, improvement, and registry.
  - [x] Slice 3A: strict discovery parsing and document audit, normalized authoring/audit contracts, runtime route tests, and deterministic matrix evidence.
  - [x] Slice 3B: multi-source discovery and deterministic precedence/deduplication.
    - Strict RED proved the discovery module absent; GREEN/REFACTOR passes focused discovery tests, typecheck, all three required audits, and diff check.
    - Discovery now rejects duplicate source IDs before I/O; deterministically orders traversal and diagnostics; prevents canonical directory cycles; and fingerprints traversal observations, diagnostics, canonical candidate paths, and candidate bytes without timestamps.
    - Broken or racing paths are isolated as typed `unreadable-path` diagnostics, canonical escapes remain rejected before target-content reads, exact resolution and first-wins precedence remain fail-closed, and directory-link regressions cover outside-target invalidation and cycles.
    - Focused discovery verification passes 10 tests with the direct file-symlink escape test skipped only because Windows returned `EPERM`; an injected canonical-path regression proves escaping `SKILL.md` targets produce `path-outside-source` without invoking the content-read callback, while Windows junction regressions pass. The static 27-Skill registry and parity matrix remain unchanged.
    - Commit: `3398f55`.
  - [x] Slice 3C: generated registry, cache, mirror, and configured persistence behavior.
    - [x] Slice 3C1: reusable atomic text persistence with deterministic failure and cleanup coverage. Commit: `6fbf191`.
    - [x] Slice 3C2: registry generator, cache, mirror, and configured persistence behavior. Commit: `f6104ed`.
      - Strict RED proved the generated-registry module absent; GREEN/REFACTOR passes 10 focused tests, typecheck, all three required audits, and diff check.
      - Deterministic injection-safe Markdown and exact schema-1 cache validation bind the current discovery fingerprint, rendered content, and registry SHA-256; project or renderer changes regenerate, while valid hits avoid writes and still use current scan results.
      - Output paths are limited to the inspected real `.asen` directory under the canonical project root. Dynamic discovered paths are rendered data only and never enter static write-target candidate authority.
      - Optional mirroring is attempted after successful hit or regeneration, uses the exact bounded payload, and degrades to sanitized `failed` or `unavailable` persistence without rejecting local refresh.
    - [x] Slice 3C3: Skill normalization and automated evidence. Commit: `6005595`.
      - Strict RED failed 5 contract tests against missing strict metadata, activation boundaries, semantic markers, complete output, and honest matrix evidence.
      - GREEN/REFACTOR normalized the registry Skill, added static runtime-route and contract evidence, and promoted SRC-SKILL-011 to PARTIAL with one bounded GSP-06 gap.
      - CAP-SKL-001 remains specified; GSP-03 and Slice 3D remain pending.
  - [x] Slice 3D: Pi route and generated-output evidence.
    - Strict RED: the focused extension test failed because `createAsenExtension` was not exported.
    - GREEN/REFACTOR: `/asen-skill-registry refresh` now canonicalizes project identity, scans four precedence-ordered and path-deduplicated roots, invokes the real generated-registry refresh, reports exact cache/diagnostic/mirror state, preserves `/asen`, and keeps dynamic entries outside static selection authority.
    - Behavioral evidence covers exact output bytes, cache files, unchanged hit bytes/mtime, content invalidation, empty output, usage/no-write behavior, sanitized rethrown failures, mirror states on misses and hits, the static 27-Skill boundary, and non-mutating Pi command registration.
    - Deterministic gates pass: focused registry suite 32 passed/1 Windows symlink-permission skip; extension regression 1/1; typecheck; full suite 284 passed/1 Windows symlink-permission skip; 27-Skill audit; 12-Skill parity audit; 250-path upstream-boundary audit; diff check; and Pi extension E2E. Pack verification remains deferred to GSP-06 as required.
    - Commit: `637a0bc`.
  - Enforce exact frontmatter and 180–450 target / 1000 hard body budget.
  - Preserve long material under local `references/` or `assets/`.
  - Implement `.asen/skill-registry.md`, multi-source scanning, project precedence, deterministic deduplication, cache behavior, and configured memory persistence when available.
  - Provide automated positive and negative tests for discovery, duplicates, empty registries, refresh, and cache invalidation.
  - Slice 3A RED: focused test failed because `src/skills/document.ts` did not exist.
  - Slice 3A GREEN/REFACTOR: focused tests pass 15/15; typecheck, 27-Skill audit, 12-Skill parity audit, 241-path upstream-boundary audit, and diff check pass.
  - Final bounded hardening adds the distinct >700 recommended-ceiling issue and rejects metadata children outside the exact `metadata` hierarchy.
  - Slice 3A rows remain PARTIAL pending Pi Free positive and negative generated-output probes in GSP-06; the static 27-Skill runtime registry is unchanged.
  - Slice 3A commit: `ecd3c77`.
- [x] GSP-04 — Align issue, branch, chained-PR, and work-unit behavior.
  - [x] GSP-04A: exact-target remote-operation authority and protected-label mutation policy.
    - Strict RED failed because `src/repository/operation-policy.ts` did not exist.
    - GREEN/REFACTOR adds provenance-checked, normalized exact-binding authority; duplicate-live issuance prevention; one-use mutation and remote-read execution; immutable callback targets; sanitized one-attempt/readback outcomes; and deterministic case-insensitive protected-label plans.
    - Focused evidence covers normalized/trailing-dot hosts, immutable authority and callback bindings, duplicate issuance and post-consumption reissuance, forgery/mismatch/wrong-executor/second-use zero-call rejection, exact callback arguments, sanitized sync and async remote-read failures, explicit ambiguous 5xx/accepted unchanged outcomes, confirmed timeout/error outcomes with exact intended readback, array non-mutation, and case-variant label bypass attempts.
    - Verification passes: focused tests 11/11, typecheck, 27-Skill audit, 12-Skill parity audit, 251-path upstream-boundary audit, and diff check. Authored implementation and test files total 233 lines, within the sub-400 slice budget.
    - Pre-C2 hardening aligns protected-label authorization with the frozen Issue contract: only MAINTAIN/ADMIN pass; WRITE and lower permissions fail closed, with NFC/case and size-exception rationale regressions preserved. The combined repository-operation, issue-publication, and Issue Skill regression command passes 29/29.
    - Commits: `569b3a6`, `da26253`.
  - [x] GSP-04B: issue preparation, publication, and evidence.
    - [x] GSP-04B1: deterministic Issue Form selection/validation, duplicate-search decisions, and privacy-safe issue materialization.
      - Strict RED failed because `src/issues/issue-preparation.ts` did not exist.
      - GREEN/REFACTOR adds pure typed form selection, exact-schema answer rendering with safe dynamic fences, reviewed order-independent redaction, expanded final privacy scanning, NFC-stable SHA-256 identity, and complete fail-closed duplicate decisions.
      - Independent-review hardening rejects non-plain or inherited inputs, malformed title/label metadata, single/multi-select violations, first-person bypasses, unsafe redactions, sensitive path/credential families, malformed evidence identities, and multiple duplicate classifications without mutating failure inputs.
      - Final verifier hardening includes declared labels in reviewed redaction and generic sensitive-material rejection, revalidates redacted labels and fully materialized single-line titles, and binds normalized duplicate issue URLs to the searched host/owner/repository (with `github.com` as the documented `owner/repository` shorthand host).
      - Adversarial Unicode/redaction hardening rejects U+2028/U+2029 title bypasses, detects first-person checkbox labels through rendered Markdown/emoji/zero-width prefixes, canonicalizes equivalent issue URLs before uniqueness and duplicate identity decisions, normalizes reviewed redaction values and all final output fields to NFC before identity hashing, and detects occurrence/overlap field-by-field without synthetic separators or input mutation.
      - Focused tests pass 15/15; typecheck, 27-Skill audit, 12-Skill parity audit, 253-path upstream-boundary audit, and diff check pass. Current authored scope is 196 changed lines; the Issue Skill and parity matrix remain unchanged for GSP-04B3.
      - Commit: `2b8a887`.
    - [x] GSP-04B2: one-shot issue publication and atomic post-publication mutation using shared repository authority.
      - Strict RED failed because `src/issues/issue-publication.ts` did not exist.
      - GREEN/REFACTOR adds immutable provenance-checked publication/mutation plans, canonical remote-label authorization, one-shot creation with observed exact-target classification, genuine confirmed-result lineage, deterministic mutation baselines, authorized pre-read gating, and one combined add/remove attempt with one readback and no retry.
      - Focused evidence covers canonical inventory/protected-label/rationale/duplicate gates; exact immutable callbacks; authority forgery, binding, action, and one-use failures; confirmed/no-write/unknown transport and readback outcomes; malformed, mismatched, absent, and multiple publication snapshots; forged later results; zero-mutation baseline drift; unrelated-label preservation; atomic add/remove; sanitized errors; and caller-input non-mutation.
      - Independent-review hardening makes publication and mutation plans one-shot before authority use, binds conditional mutation to the exact baseline hash, rejects noncanonical issue URLs and inexact snapshot records, closes NFC label-identity bypasses, and requires B1-issued duplicate-decision provenance.
      - Final verifier hardening binds every genuine duplicate decision to normalized repository, query, and materialized candidate evidence; rejects cross-candidate and cross-repository reuse; and rebuilds publication bindings as exact plain frozen data without credentials, extras, symbols, accessors, inherited fields, or structured-field separators.
      - Verification passes: focused tests 37/37, typecheck, 27-Skill audit, 12-Skill parity audit, 256-path upstream-boundary audit, and diff check. The complete 04B2 candidate remains within the sub-400 addition budget. The Issue Skill and parity matrix remain unchanged for GSP-04B3.
      - Commit: `ce270e8`.
    - [x] GSP-04B3: Issue Skill normalization, parity-matrix promotion, and generated behavioral evidence.
      - Normalized `asen-issue-workflow` to the strict frontmatter, ordered-section, and 180–450 body-token contract while preserving ASEN naming and adding exact activation exclusions, fail-closed preparation, one-attempt publication, and atomic post-publication gates.
      - Added parser- and runtime-selection-backed evidence for positive issue activation, negative delivery/docs activation, style, semantic obligations, prohibited fallbacks, and matrix integrity.
      - Combined focused verification passes 44/44: 7 Skill-contract checks plus the existing 15 preparation, 11 publication, and 11 repository-operation checks.
      - SRC-SKILL-006 remains PARTIAL with only Pi Free positive and negative generated-output probes pending GSP-06; GSP-04 remains open for the branch, chain, and work-unit slices.
      - Typecheck, 27-Skill audit, 12-Skill parity audit, 258-path upstream-boundary audit, and diff check pass.
      - Commit: `1ab2508`.
  - [x] GSP-04C: branch and pull-request delivery behavior.
    - [x] GSP-04C1: exact-target policy inspection and pure branch/PR preparation.
      - Implementation and focused evidence are complete: exact one-shot authorized inspection validates a closed plain snapshot against ASEN-owned patterns, and genuine unused evidence prepares an immutable non-executing branch/PR plan.
      - Focused C1 tests pass 18/18 with repository-operation regressions; the combined Issue/C1 command passes 25/25. Typecheck, 27-Skill audit, 12-Skill parity audit, 259-path upstream-boundary audit, and diff check all pass.
      - The runtime negative assertion remains intact while constructing the forbidden brand pattern without storing its contiguous literal in tracked source.
      - The C1 implementation and focused test files total 108 authored additions, within the sub-400 slice budget; no remote calls or repository mutations are performed.
      - Commit: `f0da789`.
    - [x] GSP-04C2: separately authorized local branch and commit execution.
      - Genuine C1 plans are claimed once to prepare immutable local plans with exact base/tree SHA identities; opaque one-use progression gates one authorized branch creation and sequential, separately authorized commits.
      - Exact frozen payload/readback contracts bind repository, worktree session, branch, base/parent, ordered message, and tree. Verified intended state confirms progress; authoritative rejection plus absence/unchanged state is `no_write`; every other outcome is `unknown` and blocks later steps.
      - Focused evidence covers two-commit transcripts, provenance forgery/reuse, target/action/session mismatch, per-stage reuse, rejection/timeout/drift/malformed/throw classifications, callback/input immutability, sanitized failures, and the absence of push/PR/merge callbacks.
      - Verification passes: focused C2/C1/repository tests 26/26, typecheck, 27-Skill audit, 12-Skill parity audit, 261-path upstream-boundary audit, and diff check. No Git or remote operation implementation is present.
      - Commit: `b0d989f`.
    - [x] GSP-04C3: one-shot push, PR publication, and label mutation; merge remains separately authorized.
      - [x] GSP-04C3a: one-shot push and PR publication with exact readbacks.
        - Genuine final C2 evidence now carries private C1/local-plan provenance into one immutable, one-use remote plan; exact one-attempt push and PR-open ports classify only verified intended state as confirmed, authoritative rejection plus verified absence as `no_write`, and every ambiguity as `unknown`.
        - Focused evidence covers the positive push-to-PR transcript, frozen exact payloads, forgery/reuse/cross-target and authority mismatch rejection, transport/readback classifications, canonical PR URLs, exact title/body/issue/policy/head state, an explicit empty initial-label contract with candidate labels reserved for C3b, sanitized failures, caller-input preservation, and absence of label or merge callbacks.
        - Verification passes: focused C3a/C2/C1/repository tests 34/34, typecheck, 27-Skill audit, 12-Skill parity audit, 263-path upstream-boundary audit, and diff check. The complete C3a slice is 83 authored additions including tracker evidence, within the sub-400 budget; no Git or network implementation is present.
        - Commit: `769444c`.
      - [x] GSP-04C3b: conditional PR label mutation and pending-merge evidence.
        - Genuine C3a publication evidence is claimed exactly once into an immutable C3b plan carrying the exact PR, policy, candidate-label, permission, and required-check facts; forged, reused, cross-target, malformed, and mismatched authority data fail closed before mutation.
        - Execution performs one authorized exact-shape snapshot read, one conditional combined protected-label mutation, and one readback with no retry. It preserves unrelated labels, binds an immutable baseline SHA-256 token, requires exact NFC/case-sensitive policy check identities while retaining NFC/case-insensitive label identities, reports canonical required and exact successful/missing checks, and emits only pending/stopped merge evidence without merge authority or callbacks.
        - Focused C3b/C3a/repository verification passes 31/31, including required/successful check case-drift regressions; typecheck, 27-Skill audit, 12-Skill parity audit, 265-path upstream-boundary audit, and diff check pass. The complete C3b slice remains below 400 authored additions including this tracker evidence; no network, Git, merge, or delivery-authorization implementation is present.
        - Commit: `e94e1e7`.
    - [x] GSP-04C4: Delivery Branch Skill normalization, matrix evidence, and generated behavioral checks.
      - Normalized `asen-delivery-branch` to the strict frontmatter, ordered-section, and 427-word body contract with delivery-stage activation boundaries, exact candidate/policy facts, separate one-use remote-read and mutation authority, exact readback outcomes, empty-label PR publication, conditional label mutation, exact-case required checks, and pending merge authority.
      - Added parser- and runtime-selection-backed positive/negative activation evidence, semantic/prohibited contract checks, and exact SRC-SKILL-001 matrix assertions without storing the forbidden upstream brand literal.
      - Combined focused verification passes 38/38: 7 Skill-contract checks plus 7 C1 preparation, 6 C2 local delivery, 8 C3a remote publication, and 10 C3b label/check behaviors. Typecheck, 27-Skill audit, 12-Skill parity audit, 267-path upstream-boundary audit, and diff check pass.
      - SRC-SKILL-001 remains PARTIAL solely for Pi Free positive and negative generated-output probes in GSP-06. GSP-04C is complete; GSP-04D, GSP-04E, and parent GSP-04 remain open.
      - Commit: `2ed5733`.
   - [x] GSP-04D: chained pull-request policy and behavioral evidence.
     - [x] GSP-04D1: deterministic chain strategy, slicing, dependency, and clean-diff planning.
       - [x] GSP-04D1a: core chain strategy and evidence planning.
         - Added a readable pure exact-data planner for one cohesive slicing pass, authored 400-line/60-minute budgets, deterministic single/stacked-main/feature-chain/exception selection, clean diffs, dependency diagrams, complete verification/docs/rollback/state/fact preservation, tracker planning, and pending publication/merge statuses without issuing authority.
         - Added isolated evidence for every strategy, focus/cohesion, exact slicing pass, commit partitions, authored totals, dependencies, clean diffs, complete immutable slice evidence, malformed facts, and absent readiness/mutation surfaces.
         - Commit: `e75dbc8`.
       - [x] GSP-04D1b: path-bound generated-artifact and changed-line accounting.
         - Genuine D1a plans are claimed once before exact path-bound accounting; forged or reused plans, malformed plain data, path partition failures, authored relabeling, generated artifact mismatches, and incomplete totals fail closed without mutation or authority.
         - Immutable per-slice and candidate snapshots retain generated identities and classification evidence, include generated lines in complete budgets, and require replanning above 400 while publication and merge remain pending.
         - Focused D1b/D1a verification passes 23/23, including isolated rejection of an otherwise valid-length uppercase SHA-256 identity; typecheck, 27-Skill audit, 12-Skill parity audit, 270-path upstream-boundary audit, and diff check pass. The D1b implementation and focused test files total 265 lines before the narrow D1a provenance and tracker additions, keeping the complete slice below 400 additions.
         - Commit: `602e72c`.
     - [x] GSP-04D2: Delivery Chain Skill normalization, matrix evidence, and generated behavioral checks.
       - Normalized `asen-delivery-chain` to strict metadata, ordered sections, and the 180–450 body-word contract while preserving ASEN naming and the committed D1a/D1b behavior.
       - Added parser- and runtime-selection-backed evidence for activation boundaries, one-pass slicing, complete authored/generated budgets, explicit strategy and base rules, dependency diagrams, clean diffs, stop conditions, pending authority, and prohibited fallbacks.
       - SRC-SKILL-002 remains PARTIAL solely for Pi Free positive and negative generated-output probes in GSP-06; its evidence now names deterministic D1a, D1b, and Skill-contract paths without volatile counts.
       - Focused chain verification, typecheck, 27-Skill audit, 12-Skill parity audit, 272-path upstream-boundary audit, and diff check pass. GSP-04 remains open for GSP-04E.
       - Commit: `377dfbc`.
    - [x] GSP-04E: work-unit commit and review-boundary policy and behavioral evidence.
      - [x] GSP-04E1: deterministic work-unit boundary, evidence, commit, and review-candidate planning.
        - [x] GSP-04E1a: deterministic boundary classification and opaque ready provenance.
          - Added readable pure exact-data validation and deterministic immutable branch, split, 401-line chain, and genuine opaque ready decisions with explicit branch facts, one-to-one behavior/rollback facts, canonical task-path scope, and no completion or authority surface.
          - Focused verification passes 11/11; typecheck, 27-Skill audit, 12-Skill parity audit, 273-path upstream-boundary audit, and diff check pass. The implementation and focused tests total 281 lines; the complete E1a slice is 288 additions.
          - Commit: `b04aefa`.
        - [x] GSP-04E1b: completed evidence and review-candidate recording.
          - [x] GSP-04E1b1: completed work-unit commit and evidence recording.
            - Added first-attempt opaque boundary claiming and immutable complete work-unit evidence for exact task, repository, commit, tree freeze, changed-path partitions, boundary-authorized generated identities, authored totals, focused/runtime/docs results, rollback, and task-document commit identity without exposing readiness, candidate, verdict, authority, or mutation surfaces.
            - Independent focused verification passes 18/18, including all-40/all-64 Git object snapshots and isolated mixed-width rejection; typecheck, 27-Skill audit, 12-Skill parity audit, 275-path upstream-boundary audit, and diff check pass. The complete readable E1b1 slice remains below 400 additions.
            - Commit: `7287942`.
          - [x] GSP-04E1b2: bind a review candidate to a genuine completed record.
            - Genuine completed records now carry first-attempt claim provenance into an immutable exact commit or repository-bound PR-slice candidate; malformed, forged, reused, cross-task, cross-repository, and commit/tree mismatch attempts fail closed and burn the completed provenance.
            - Independent focused verification passes 28/28 with E1a/E1b1 regressions, including accessor-safe exact shapes, canonical PR identities, chain provenance, deep freeze, input preservation, and absence of verdict, readiness, authority, publication, merge, mutation, Git, or network surfaces. Typecheck, 27-Skill audit, 12-Skill parity audit, 277-path upstream-boundary audit, and diff check pass. GSP-04E2 remained the final GSP-04 work item.
            - Commit: `eaae342`.
      - [x] GSP-04E2: Work Unit Skill normalization, matrix evidence, and generated behavioral checks.
        - Normalized `asen-work-unit` to strict metadata, ordered sections, imperative ASEN-owned prose, and the 180–450 body-word contract while preserving the committed E1a/E1b boundary, evidence, commit-freeze, and review-candidate behavior.
        - Added actual parser and runtime-selection evidence for implementation triggers, meaningful positive and negative phases, semantic obligations, prohibited fallbacks, and exact SRC-SKILL-012 matrix state without storing the contiguous forbidden upstream brand literal.
        - SRC-SKILL-012 remains PARTIAL solely for Pi Free positive and negative generated-output probes in GSP-06; deterministic evidence paths remain count-free.
        - Focused work-unit verification passes 37/37; typecheck, 27-Skill audit, 12-Skill parity audit, 279-path upstream-boundary audit, and diff check pass. GSP-04E and GSP-04 are complete.
        - Commits: `086d3d6`, `f0888b4`.
  - Approved-issue gate, credential/session gate, protected labels, one-attempt/unknown outcomes, and atomic post-publication behavior.
  - Branch/commit naming, exactly one `type:*` label, protected-label behavior, size exception, templates/checks, and remote authorization before reads.
  - 400-line/60-minute chain policy, one slicing pass, delivery strategy, tracker/draft semantics, dependency diagrams, and base validation.
  - Conventional work-unit commits, feature-task commit identity, and native review candidate boundaries.
- [ ] GSP-05 — Align orchestration, RDD, and Judgment Day behavior.
  - [x] GSP-05A: derived ODD facts and opaque one-use route decisions.
    - [x] GSP-05A1: exact request-fact derivation and deterministic one-use route planning.
      - Exact plain request records now derive immutable scope, write, session, testing, review, uncertainty, risk, and routing facts without caller-supplied counts, routes, risk, or verification.
      - Genuine facts plan once into deterministic SHA-256-identified decisions; genuine decisions claim once for A2, while structural forgeries and reuse fail closed without authority or execution surfaces.
      - Focused new and legacy ODD verification passes 16/16; typecheck, 27-Skill audit, 12-Skill parity audit, and 280-path upstream-boundary audit pass. The implementation and focused tests total 287 lines, below the 400-addition slice budget.
      - Commit: `0f10118`.
    - [x] GSP-05A2: enforce genuine route provenance in orchestration and evidence admission.
      - [x] GSP-05A2a: require genuine task-bound route decisions for orchestration plans.
        - Orchestration now claims a genuine A1 route decision immediately on entry, then enforces exact task and repository identity; malformed orchestration, cross-task, and cross-repository first attempts burn the decision, while legacy decisions, structural clones, forgeries, and reuse fail closed.
        - Plans retain the claimed immutable decision and preserve existing agent, candidate, and Skill behavior without issuing route evidence, authority, verdicts, or mutation callbacks. Focused verification passes 34/34; typecheck, 27-Skill audit, 12-Skill parity audit, 282-path upstream-boundary audit, and diff check pass. A2b remained the final GSP-05A item.
        - Commit: `f5fa872`.
      - [x] GSP-05A2b: admit only orchestration-issued route evidence for mutation gates.
        - Candidate-bound orchestration plans now issue deeply frozen one-use route provenance carrying the exact task, repository, candidate id/revision, decision, route, risk, and verification facts without authority, readiness, verdict, or mutation surfaces.
        - Generic evidence admission rejects every manual route-decision status. Dedicated admission claims genuine provenance before exact candidate and accessor-safe metadata validation, so reuse, binding mismatches, malformed metadata, clones, and forgeries fail closed and first-attempt failures burn genuine proofs.
        - Focused verification passes 58/58, including mutation-gate contribution, all provenance and metadata negatives, fixed evidence fields, and signed recovery. Typecheck, 27-Skill audit, 12-Skill parity audit, and 283-path upstream-boundary audit pass. The complete readable additions remain below 400 lines.
        - Commit: `00164d2`.
  - [x] GSP-05B: optional structured-lifecycle applicability before lifecycle entry.
    - [x] GSP-05B1: candidate-bound organic/structured/blocked applicability decision.
      - [x] GSP-05B1a: orchestration-authentic claimed route context and exact candidate binding.
        - Successful candidate-bound orchestration privately records immutable original route facts and exact candidate identity. The read-only context rejects unclaimed, forged, cloned, candidate-less, failed, and rebound decisions without exposing authority.
        - Focused ODD/orchestration verification passes 23/23; typecheck, 27-Skill audit, 12-Skill parity audit, 285-path upstream-boundary audit, and diff check pass. The readable slice is below 400 additions.
        - Commit: `239a980`.
      - [x] GSP-05B1b: candidate/fact-bound organic/structured/blocked applicability.
        - Genuine candidate-bound route decisions now produce immutable organic, structured, or blocked applicability derived only from original ODD facts, exact caller bindings, and explicit lifecycle inputs; first-attempt and B2 claim provenance are one-use without phase or execution authority.
        - Focused ODD/orchestration/applicability verification passes 32/32; typecheck, 27-Skill audit, 12-Skill parity audit, 285-path upstream-boundary audit, and diff check pass. The readable slice is 281 additions.
        - Commit: `f9fb0b5`.
    - [x] GSP-05B2: require genuine applicability before lifecycle construction.
      - Fresh lifecycle construction immediately claims genuine structured B1 applicability and binds the initial nine-phase state to its exact task and candidate; organic, blocked, malformed, cloned, forged, and reused inputs fail closed, with genuine failed attempts burned.
      - Module-private one-use construction requests never escape through a public/static minting surface. Signed `loadLifecycle` remains the only verified-recovery path and the only source of pending-authority reissue eligibility.
      - Independent focused verification passes 60/60; typecheck, 27-Skill audit, 12-Skill parity audit, 287-path upstream-boundary audit, and diff check pass. The readable slice is 163 additions.
      - Commit: `57cefdb`.
  - [ ] GSP-05C: runtime-enforced conditional TDD triangulation.
    - [x] GSP-05C1: derive an opaque, exact candidate-bound TDD obligation from genuine B1 write and testing facts; behavior/testing contradictions block before any cycle authority.
      - Exact ordered behavior writes plus required testing derive a deeply immutable, deterministic candidate/applicability-bound obligation; non-behavior writes remain not applicable; and behavior plus testing N/A blocks before explicit structured or high-risk selection without granting lifecycle, phase, cycle, mutation, review, or delivery authority.
      - Independent focused verification passes 43/43; typecheck, 27-Skill audit, 12-Skill parity audit, 288-path upstream-boundary audit, and diff check pass. The readable slice is 190 additions.
      - Commit: `1b990d5`.
    - [x] GSP-05C2: require a genuine one-use obligation and structured stable test observation for an honest deterministic RED.
      - A fixed local Node test/TAP command runs in the exact detached candidate, derives assertion observations from bounded captured output, and admits them through a factory-only strict RED cycle without changing legacy `TddCycle` or evidence-store behavior.
      - Independent focused verification passes 28/28 and covers repeatable parsed assertions, executed strict-convention test-only direct-child Git lineage, provenance/burn semantics, discovery/runtime rejection, revision/candidate mismatches, construction hardening, and authority exclusion; raw runner output is not retained. Typecheck, 27-Skill audit, 12-Skill parity audit, 289-path upstream-boundary audit, and diff check pass. The readable slice is 315 additions.
      - Commit: `8647a67`.
    - [x] GSP-05C3: enforce same-test minimum GREEN, materially distinct multi-path triangulation or narrow single-path N/A, and an explicit non-TDD alternative when meaningful RED is impossible.
      - [x] GSP-05C3a: bind immutable decision-path plans and require direct-child minimum GREEN with unchanged RED tests and behavior-only production changes.
        - Exact canonical planned decision vectors and policy enter the frozen cycle identity, then one genuine direct-child GREEN is admitted only after the fixed runner passes every RED case with unchanged test blobs/modes and an exact behavior-path-only diff. Passing observations and RED/GREEN provenance are opaque, one-use, burn on first attempt, deeply frozen, and grant no lifecycle, evidence, mutation, review, or delivery authority.
        - Independent focused verification passes 34/34; typecheck, 27-Skill audit, 12-Skill parity audit, 292-path upstream-boundary audit, and diff check pass. The readable slice is 178 additions.
        - Commit: `16b763d`.
      - [x] GSP-05C3b: require runner-derived per-case coverage for materially distinct multi-path triangulation or exact single-path N/A.
        - Exact test-only direct-child triangulation is derived from bounded harness-captured per-case Node/V8 byte ranges, or from the bound structural single-path N/A, without granting authority. Coverage reads reject oversized, growing, shrinking, truncated, non-regular, missing, ambiguous, and outside-repository data before public admission.
        - Independent focused verification passes 42/42; typecheck, 27-Skill audit, 12-Skill parity audit, 293-path upstream-boundary audit, and diff check pass. The readable slice is 162 additions.
        - Commit: `5a56bdf`.
      - [x] GSP-05C3c: admit a baseline-proven non-TDD alternative without reporting RED or granting generic authority.
        - A separate factory-only, one-use controller competes with strict-cycle obligation claiming and verifies an exact already-passing baseline against its direct behavior-only child using genuine runner-derived per-case V8 observations.
        - Independent focused verification passes 51/51 and covers exact canonical plans, unchanged test blobs/modes, fixed runner identity, positive materially distinct decision coverage on both revisions, provenance burn semantics, immutable descriptive output, and authority/RED terminology exclusion. Typecheck, 27-Skill audit, 12-Skill parity audit, 294-path upstream-boundary audit, and diff check pass. The readable slice is 96 additions.
        - Commit: `b8d52fe`.
    - [x] GSP-05C4: require triangulation/N/A before performed-or-not-needed refactor completion and bind lifecycle revision promotion to the exact completion.
      - [x] GSP-05C4a: issue exact strict completion only after performed or explicitly unnecessary refactoring preserves planned behavior.
        - One exact performed/not-needed finalization follows genuine C3b terminal provenance and fresh runner-derived coverage, preserves planned cases and terminal tests, and exposes only one-use completion facts for C4b.
        - Independent focused verification passes 51/51; typecheck, 27-Skill audit, 12-Skill parity audit, 296-path upstream-boundary audit, and diff check pass. The readable slice is 60 additions.
        - Commit: `c934e77`.
      - [x] GSP-05C4b: promote TDD-required lifecycle candidates only from genuine strict completion or the exact verified non-TDD alternative; defer persisted authority to C5.
        - Fresh lifecycles bind their exact live TDD obligation, burn genuine strict or alternative results before validation, validate honest direct-parent chains, and leave verify as the next phase without granting broader authority. Promoted state carries an explicit pending-persistence marker; C4 save/load fail closed while ordinary signed recovery remains available.
        - Independent focused verification passes 51/51; typecheck, 27-Skill audit, 12-Skill parity audit, 297-path upstream-boundary audit, and diff check pass. The readable slice is 119 additions.
        - Commit: `db6ac11`.
    - [ ] GSP-05C5: persist and verify exact requirement-bound TDD completion with fail-closed legacy migration and recovery.
      - [ ] GSP-05C5a: derive canonical strict/alternative completion records with exact plan, execution, obligation, and revision semantics.
        - Implementation and bounded runtime evidence are complete: genuine strict and verified-alternative flows privately retain schema-1 deeply immutable records; exact parsing recomputes obligation and domain-separated identities, validates canonical plans/execution, discriminator-specific shapes, and direct-parent semantic revisions, and grants no live completion authority. The independent exact-union-shape blocker is corrected; pending independent re-PASS, with C5b–C5d open.
      - [ ] GSP-05C5b: persist lifecycle v2 completion records and recover verify/archive continuation while legacy behavior-changing v1 requires migration.
      - [ ] GSP-05C5c: persist evidence v2 exact completions while legacy generic TDD remains audit-only.
      - [ ] GSP-05C5d: require exact completion at the asen-tdd verification gate and document integrity versus rollback limits.
    - [ ] GSP-05C6: normalize the TDD Skill and record positive, negative, recovery, and authority-exclusion evidence.
  - [ ] GSP-05D: RDD issue, current-base, conflict, invariant, flow, worktree, journey, and budget intake.
  - [ ] GSP-05E: ordinary native review controller bound to genuine work-unit candidates.
  - [ ] GSP-05F: one bounded correction, validation, recovery, and strict delivery separation.
  - [ ] GSP-05G: Judgment Day immutable ledger and exactly-two blind dispatch.
  - [ ] GSP-05H: Judgment Day bounded fix/re-judgment controller and terminal outcomes.
  - [ ] GSP-05I: normalize ODD, defect, and adversarial-review Skills and matrix evidence.
  - Preserve explicit limits where authenticated principal, trust-root independence, or OS isolation remain unavailable.
- [ ] GSP-06 — Verify strict parity and prepare delivery slices.
  - Run focused tests per work unit, full local gates, package verification, and independent verification.
  - Run Pi Free behavioral probes for the affected Skill families.
  - Recompute the 12/12 matrix; promote only rows with observable automated evidence.
  - Record commit identities, exact changed-line counts, rollback boundaries, and dependency diagrams for every slice.

## Acceptance criteria

- Every upstream Skill has a complete ASEN contract mapping and automated positive/negative evidence.
- No FULL claim is based only on file presence, frontmatter, or exact Skill loading.
- `.asen/skill-registry.md` provides the required registry behavior without `.atl` naming.
- ODD, SDD selection, TDD triangulation, RDD, and adversarial review claims match runtime enforcement.
- All repository-defined checks and Pi Free verification pass for each deliverable slice.
- Each completed task closes with a Conventional Commit and records its commit identity here.

## Initial evidence

- Read-only audit: 11 Skills partial; `skill-registry` intentionally different before the strict-parity decision.
- Frozen upstream baseline for contract work: `08de420ca29be16b6f6bee725a30b599b061df16`. The referenced upstream `skills/_shared/skill-resolver.md` is absent at that baseline and must be recorded as `absent-at-baseline`, never fabricated.
- Structural checks currently prove 27 Skill files and exact Pi loading, not detailed 12/12 behavior.
- Current feature branch starts at PR #30 head `bdcbe7a714a9d2f3a801afc221f1476ec9d45237`.
- Slice 1A commit: `4a0107b`.
- Slice 1A verification: manifest and matrix parse; all 17 present upstream documents match exact bytes and SHA-256; the missing resolver is confirmed absent; boundary test 1/1, Skill audit 27/27, tracked boundary 233 paths, TypeScript typecheck, and diff check all pass.
- Independent verification found only `.codegraph/.gitignore` outside the change scope; it existed before verification and remains an excluded local runtime artifact.
- Slice 1B RED: focused tests failed because the validator module did not exist; the later missing-source-commit mutation also reproduced an acceptance gap.
- Slice 1B commit: `e14142e`.
- Slice 1B GREEN: 17/17 focused tests pass; `audit:skill-parity` passes for 12 Skills; typecheck, 27-Skill audit, 237-path boundary audit, and diff check pass. The checked-in matrix now binds the exact frozen source commit.
