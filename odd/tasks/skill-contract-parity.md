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
- [ ] GSP-02 — Align communication and documentation Skills.
  - `asen-doc-design`: review path, out-of-scope section, checklist/template behavior, and automated quality checks.
  - `asen-collaboration-message`: context language, warm/direct tone, 1–3 paragraph default, no em dash, and anti-pile-on priority.
- [ ] GSP-03 — Align Skill authoring, improvement, and registry.
  - Enforce exact frontmatter and 180–450 target / 1000 hard body budget.
  - Preserve long material under local `references/` or `assets/`.
  - Implement `.asen/skill-registry.md`, multi-source scanning, project precedence, deterministic deduplication, cache behavior, and configured memory persistence when available.
  - Provide automated positive and negative tests for discovery, duplicates, empty registries, refresh, and cache invalidation.
- [ ] GSP-04 — Align issue, branch, chained-PR, and work-unit behavior.
  - Approved-issue gate, credential/session gate, templates/forms, privacy, duplicate checks, protected labels, one-attempt/unknown outcomes, and atomic post-publication behavior.
  - Branch/commit naming, exactly one `type:*` label, protected-label behavior, size exception, templates/checks, and remote authorization before reads.
  - 400-line/60-minute chain policy, one slicing pass, delivery strategy, tracker/draft semantics, dependency diagrams, and base validation.
  - Conventional work-unit commits, feature-task commit identity, and native review candidate boundaries.
- [ ] GSP-05 — Align orchestration, RDD, and Judgment Day behavior.
  - Non-bypassable ODD fact derivation and routing.
  - Optional SDD applicability selection before lifecycle entry.
  - Runtime-enforced conditional TDD triangulation.
  - RDD issue/current-main/conflict/worktree/size/journey/receipt contracts.
  - Judgment Day schemas, immutable ledger, bounded sweep/fix rounds, hash-bound dispatch, informational rows, and dedicated controller.
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
- Slice 1B GREEN: 17/17 focused tests pass; `audit:skill-parity` passes for 12 Skills; typecheck, 27-Skill audit, 237-path boundary audit, and diff check pass. The checked-in matrix now binds the exact frozen source commit.
