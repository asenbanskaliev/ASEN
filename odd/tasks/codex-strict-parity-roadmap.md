# Codex strict-parity continuation after GSP-05D2

## Purpose and current truth

Active continuation is ecosystem, not GSP-05D3. GSP-06 retains its explicit provider-limited closure and admitted memory R01–R09 remain closed. Current implementation comparison: `odd/tasks/ecosystem-reconciliation.md`; current claims: `registry/parity/ecosystem-claims-v1.json`; current work queue: `odd/tasks/ecosystem-strict-parity.md`. The original protocol/bootstrap/copy-ready D3 prompt below is historical and superseded by these current trackers and the user's large-batch instructions.

This is the portable continuation map for the remaining strict-parity program. The canonical branch is `feat/strict-parity-prerequisites`.

| Boundary | Exact identity |
| --- | --- |
| Merged-main base | `e67d2618f466ecee757a519e1b68049588a2db1e` |
| Sealed handoff baseline | `57cd2b791e1bd611f9114d1a4e7c4a712fed2b7d` |
| GSP-05D2 source | `909aef32e10025f477c53e6a87d732b706a12486` |
| GSP-05D1b source | `09e38b8d09c8c0bcb724360c186b2f012a003f24` |

The roadmap commit is later than the sealed handoff baseline. After checking out the remote canonical branch, `git rev-parse HEAD` is therefore the authoritative continuation identity; do not expect HEAD to equal the sealed baseline.

The active tracker is `odd/tasks/skill-contract-parity.md`. The next program trackers are `odd/tasks/memory-strict-parity.md` and `odd/tasks/ecosystem-strict-parity.md`. Read tracker state and the current implementation before planning. Do not infer evidence, paths, APIs, authority, or completion from this map.

## Dependency route and gates

The canonical remainder is exactly:

```text
GSP-05D3 -> GSP-05D4 -> GSP-05D5 -> GSP-05E -> GSP-05F
-> GSP-05G -> GSP-05H -> GSP-05I2-B -> GSP-05I3 -> GSP-05I4
-> GSP-06
-> MEM-01 -> MEM-02 -> MEM-03 -> MEM-04 -> MEM-05 -> MEM-06 -> MEM-07 -> MEM-08 -> MEM-09
-> ECO-01A -> ECO-01B -> ECO-01C -> ECO-01D -> ECO-01E
-> ECO-02A -> ECO-02B -> ECO-02C
-> ECO-03 -> ECO-04 -> ECO-05 -> ECO-06 -> ECO-07 -> ECO-08
-> ECO-09 -> ECO-10 -> ECO-11 -> ECO-12 -> ECO-13 -> ECO-14
-> ECO-15A -> ECO-15B -> ECO-15C -> ECO-16
```

Do not skip, merge, or reorder units.

Gates between every arrow:

1. Close only the current unit's tracker acceptance criteria with observed evidence.
2. Keep the whole review candidate under **390 changed lines**. Split before writing if the cohesive candidate cannot fit; do not compress evidence or take an exception.
3. Use applicable semantic RED/GREEN. A loader, import, fixture, or setup failure is not semantic RED.
4. Obtain independent **HIGH** verification for the exact candidate.
5. Native review may occur only through user-owned RDD. Codex must not self-issue, infer, or bypass review authority.
6. Commit source/test closure and tracker closure separately, using Conventional Commits. Record exact commit identities in the owning tracker.
7. Start the next unit only after the current unit is closed. GSP-06 gates all memory work; MEM-09 gates ECO-01A.

## First and only immediate unit: GSP-05D3

### Entry criteria

- The checked-out remote branch is `feat/strict-parity-prerequisites`, the worktree status is understood, and current HEAD is recorded.
- `odd/tasks/skill-contract-parity.md` still names GSP-05D3 as the next open D unit.
- D1b and D2 evidence is read from the tracker and checked against the current implementation.
- Exact source and test surfaces are derived read-only from the tracker and current implementation **before any write**. They are intentionally not listed here because they remain unknown.
- The planned whole candidate, including tests and source closure, forecasts fewer than 390 changed lines.

### Deliverables

Bind, as one reviewable behavior unit:

- the applicable RDD invariants;
- operator flows and their fail-closed transitions;
- actual runtime journey evidence, clearly distinguished from fixtures, prose, and source inspection;
- a specific rollback boundary and procedure; and
- a forecast budget covering candidate lines, verification effort, and remaining uncertainty.

Add semantic positive and negative evidence for each applicable binding. Preserve exact candidate/revision provenance and existing one-use/fail-closed boundaries. Update the active tracker only in the separate tracker-closure commit after source/test closure and required verification.

### Non-goals

GSP-05D3 does not:

- implement or begin D4, D5, E, F, G, H, I, GSP-06, memory, or ecosystem work;
- guess source paths, tests, APIs, runtime calls, labels, branches, authority, or missing evidence;
- promote fixture output, prose, `SOURCE_INSPECTED`, file presence, or mocked shape to runtime evidence or `FULL`;
- claim Pi Free, packaging, platform, typecheck, review, delivery, persistence, or rollback resistance without direct applicable evidence;
- change the 27 static Skill IDs or touch PR #30.

### Exit criteria

GSP-05D3 is closed only when all of the following are true:

- invariant and operator-flow bindings have executable positive and negative evidence;
- an actual runtime journey was observed and recorded with its exact command, result, candidate identity, and limitations;
- rollback and forecast budget are explicit, bounded, and consistent with the implementation;
- applicable semantic RED and GREEN are recorded honestly;
- every focused required check passes, except a precisely disclosed environmental limitation;
- independent HIGH verification passes for the exact candidate;
- native review, if required, was performed only through user-owned RDD;
- source/test closure and tracker closure are separate Conventional Commits; and
- exact diff, changed-line count, and SHA-256 identities are recorded without claiming broader parity.

## Repeatable per-unit protocol

Use this protocol for D3 and then repeat it for each later unit only after its predecessor closes.

1. **Synchronize and inspect:** check out the remote canonical branch, record authoritative HEAD and clean/dirty status, then read the owning tracker and relevant current implementation. Preserve unrelated tracked and untracked files.
2. **Derive scope:** identify the smallest exact source/test surfaces and acceptance boundaries from repository evidence. Do not reuse a stale local worktree, cache, external memory, temporary directory, or undocumented path list.
3. **Budget:** forecast all candidate additions and deletions. Stop and split before writes if the whole candidate could reach 390 changed lines.
4. **RED:** for behavior changes, add the smallest semantic test and observe the intended behavior failure. Do not relabel resolution, fixture, prose, or harness failures as RED.
5. **GREEN and triangulate:** implement the minimum behavior, pass the focused test, then exercise material negative, alternate, failure, recovery, and provenance cases.
6. **Verify:** run focused checks first. Run broader checks only when authorized and available. Preserve exact commands and observed results.
7. **Independent check:** submit the exact candidate for independent HIGH verification. Treat findings as evidence; correct only within the same bounded unit.
8. **Review boundary:** use native review only when the user exercises the RDD path. No model or local artifact may create review authority.
9. **Close source:** inspect the exact diff and line count, compute relevant SHA-256 identities, then create one Conventional Commit for source/tests.
10. **Close tracker:** update only the owning tracker with honest evidence, limits, counts, and source commit identity; create a separate Conventional Commit for tracker closure.
11. **Delivery decision:** do not merge or release. Push is currently allowed only for `feat/strict-parity-prerequisites`; every future push remains a human decision.

## Verification limitations and standing constraints

- Broad `npm test` has an unresolved historical timeout. Do not present it as a passing gate; use focused commands and report the limitation exactly.
- Claim typecheck only when the runner is available and the command actually passes. Missing local `tsc`, typings, or runner support is an environmental limitation, not a pass.
- Runtime and `FULL` claims require applicable observed runtime evidence. Fixtures, prose, source inspection, `SOURCE_INSPECTED`, mocked registration, and file presence are insufficient.
- Do not inspect or alter `.codegraph`; do not read secrets or real user data; do not install packages; and do not change unrelated configuration.
- Do not merge, release, or touch unrelated PR #30.
- Do not infer authenticated principals, trust-root independence, OS isolation, rollback resistance, crash durability, platform coverage, Pi Free behavior, or delivery authority.

## Final reconciliation audit — 2026-10-06

This roadmap's original strict arrow-by-arrow sequencing is historical for the current branch state. The repository subsequently completed the admitted local memory R01-R09 work and reconciled it into `odd/tasks/memory-strict-parity.md`. On 2026-10-06 the user also explicitly accepted closure of GSP-06 without another model-provider execution. That decision does not fabricate Pi Free/provider evidence and does not promote PARTIAL Skill rows to FULL.

Current exact candidate at the start of this audit: `8111c4819e87b0f06c7e3c48487e6b2666cea07d`, 157 commits ahead of and 0 behind merged-main base `e67d2618f466ecee757a519e1b68049588a2db1e`. PR #32 is open, draft, unmerged and reported mergeable. The PR-wide diff is 62 files, 2229 additions and 94 deletions; this aggregate is not a single work-unit candidate and must not be misrepresented as satisfying the historical per-unit 390-line rule.

Exact-head observation after the documentation closures: Phase 0 Architecture PASS. CI and Release Gate were still running when this audit was recorded. GSP-06 Pi Free parity again reached and passed its deterministic gate, then failed only at the generated-output provider step; Pi Free Smoke was skipped. Per the user's accepted scope, neither result reopens GSP-06, but neither may be called provider PASS.

Final pre-main gate: do not merge while CI or Release Gate for the exact final HEAD is pending or failed. Green CI is necessary, but insufficient: the ecosystem comparison identifies genuine unimplemented features and PARTIAL evidence. Finish the accepted ecosystem runtime and verification scope before declaring a merge candidate. No extra GSP-06 provider run is required by the accepted scope. Historical CI PASS must not be transferred to newer checkpoint SHAs.

## Historical portable Codex bootstrap (superseded)

Run from a normal repository clone. These commands use the remote canonical branch and make no assumption about a local worktree, cache, external memory state, or temporary path.

```bash
git fetch --no-tags origin refs/heads/feat/strict-parity-prerequisites:refs/remotes/origin/feat/strict-parity-prerequisites
if git show-ref --verify --quiet refs/heads/feat/strict-parity-prerequisites; then
  git switch feat/strict-parity-prerequisites
else
  git switch --track -c feat/strict-parity-prerequisites origin/feat/strict-parity-prerequisites
fi
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/feat/strict-parity-prerequisites)"
git status --short --branch
git rev-parse HEAD
git rev-parse e67d2618f466ecee757a519e1b68049588a2db1e
git rev-parse 57cd2b791e1bd611f9114d1a4e7c4a712fed2b7d
git rev-parse 909aef32e10025f477c53e6a87d732b706a12486
git rev-parse 09e38b8d09c8c0bcb724360c186b2f012a003f24
git diff --check
git diff --stat
```

Then read, without writing:

```bash
python - <<'PY'
from pathlib import Path
for name in (
    "odd/tasks/skill-contract-parity.md",
    "odd/tasks/memory-strict-parity.md",
    "odd/tasks/ecosystem-strict-parity.md",
):
    print(f"\n===== {name} =====")
    print(Path(name).read_text(encoding="utf-8"))
PY

git grep -n -E 'GSP-05D(1b|2|3)|RDD|runtime journey|rollback|forecast budget' -- \
  odd/tasks/skill-contract-parity.md src test tests extensions
```

If a listed search root does not exist, remove only that nonexistent root and rerun. Derive exact D3 source/test paths from the tracker hits and current implementation before editing. Do not inspect `.codegraph`.

## Historical copy-ready Codex instruction (superseded)

> Continue **GSP-05D3 only** on `feat/strict-parity-prerequisites`: read `odd/tasks/skill-contract-parity.md` and the current D1b/D2 implementation, derive exact source/test surfaces read-only before writes, then bind invariants, operator flows, actual runtime journey evidence, rollback, and forecast budget. Keep the whole candidate under 390 changed lines, use honest applicable semantic RED/GREEN, obtain independent HIGH verification, and leave every later unit untouched.
