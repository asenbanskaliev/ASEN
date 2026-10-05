# PR #30 Pi Free-only verification

## Goal

Make Pi Free the sole current model-backed pull-request check while preserving historical OpenRouter evidence and the existing capability limitations.

## Constraints

- Do not merge PR #30, force-push, or modify `main`.
- Preserve historical OpenRouter results as historical evidence.
- Do not change `CAP-TST-001` or `CAP-SKL-001` from `specified`.
- Keep the 27 Pi-native Skills unchanged.
- Leave `.codegraph/` and `asen-0.1.0.tgz` untouched.
- Continue requiring Phase 0 Architecture, CI, Release Gate, and Pi Free Smoke on the exact published SHA.

## Tasks

- [x] PR30-FREE-01 — Remove the automatic OpenRouter workflow without changing Pi Free behavior.
  - Deleted `.github/workflows/pi-authenticated.yml`.
  - Repository boundary and Skill audits pass without that workflow; Pi Free and capability records are unchanged.
- [x] PR30-FREE-02 — Reconcile current verification policy and historical evidence.
  - Pi Free is now documented as the sole current model-backed PR check.
  - Prior OpenRouter results remain intact and are explicitly historical records for their stated SHAs, not current policy.
  - All architectural limitations remain recorded; `CAP-TST-001` and `CAP-SKL-001` remain `specified`.
- [x] PR30-FREE-03 — Verify, publish, and inspect the exact candidate.
  - Repository-defined local gates and package verification passed.
  - Branch, HEAD, status, remote PR head, and `origin/main` were checked before commit and push.
  - Commit `b839fc42f0b31770949c0cdcbd32b1315a835ddd` was pushed without force after confirming no remote advancement.
  - Phase 0 Architecture, CI, Release Gate, and Pi Free Smoke all passed on that exact SHA.

## Acceptance criteria

- No automatically triggered OpenRouter workflow remains.
- Pi Free remains the only model-backed PR workflow.
- Historical evidence remains available and clearly labeled.
- Local checks pass and the four current workflow families are inspected on one exact SHA.
- PR #30 remains open and unmerged.

## Evidence

- Current starting SHA: `319e3f3641160840fb98fb0a562daa9c15021c4e`.
- Read-only mapping recommended deleting `.github/workflows/pi-authenticated.yml`; Pi Free already covers role probes, structured artifacts, recovery, lifecycle, tests, and typecheck.
- After workflow deletion, `node scripts/audit-upstream-boundary.mjs`: `tracked boundary: PASS (232 paths)`.
- `node scripts/audit-behavior-skills.mjs`: `behavior skills: 27 PASS`.
- Current-policy search found no requirement to run ASEN Authenticated Pi Audit; remaining matches are explicit retirement statements or historical evidence for named SHAs.
- `git diff --exit-code -- .github/workflows/pi-free-smoke.yml 'registry/capabilities/*.yaml'` passed with no output, confirming Pi Free Smoke and all capability YAMLs are unchanged.
- Repository settings check: the `main` branch protection endpoint reports that the branch is not protected, and no repository ruleset requires the retired check. No external required-check cleanup is currently needed.
- Independent verification passed: 203/203 tests, parity 6/6, 27 Skills, boundary 232 paths, package verification 61 files, and no changes to Pi Free or either capability record.
- Exact published SHA `b839fc42f0b31770949c0cdcbd32b1315a835ddd`: Phase 0 Architecture run `36582598990`, CI run `36582598838`, Release Gate run `36582598882`, and Pi Free Smoke run `36582598867` all completed successfully. Exactly four workflow families ran; the retired OpenRouter workflow did not run.
- PR #30 remained open and unmerged after publication.
