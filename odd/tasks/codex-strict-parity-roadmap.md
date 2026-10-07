# Portable GitHub/Codex strict-parity handoff

## Purpose

This document is a portable continuation route, not a backlog. `odd/tasks/ecosystem-strict-parity.md` is the sole execution backlog and owns every ECO checkbox. Do not recreate GSP, MEM, ECO, or `EP-*` tasks here; contradictory historical instructions remain available through Git history.

The branch is `feat/strict-parity-prerequisites`. The historical pre-seal checkpoint is `35127605b20a46f4653259c9513718f298f2dd0f`. The metadata-seal commit SHA is intentionally not predicted; after synchronization, run `git rev-parse HEAD` and treat its output as the authoritative current identity.

## Current truth

- The GSP shell/orchestration track is closed through GSP-06 at the explicitly accepted provider-limited scope. The provider probe was unavailable, Pi Free was skipped, and no provider PASS may be inferred.
- All 12 frozen Skill rows remain `PARTIAL` where generated-output evidence is absent. GSP closure does not promote them to `FULL`.
- Local memory R01-R09 is closed for the admitted local core. `MEM-01..09` is an audit map, not an implementation queue; do not rebuild the memory architecture.
- The checked-in ecosystem claim registry is 16 `PARTIAL`, 0 `MISSING`, 0 `FULL`.
- The frozen Reference A manifest is 167 tracked regular Git blobs, 46 roots, and 988 persisted reference records at `08de420ca29be16b6f6bee725a30b599b061df16`.
- The comparison at `6e681f1d08fff3092273cf305206094d15cacd18` is a supplemental version of the same Reference A product. It is not a second provider/memory source, refreeze, source adoption, runtime proof, or `FULL` evidence.
- NaN/EP-030 is excluded until explicit reauthorization. Transcript import, telemetry, HERDR, third-party presentation, and similar privacy/product/security/license choices remain future gates; do not infer consent.

### Completed and pending evidence

ECO-01C-1 is closed at source commit `95ad615a04c60b6947e1bfa813be77984efb397f`. That commit contains exactly:

- `scripts/ecosystem-baseline.mjs`
- `tests/ecosystem-baseline.test.ts`

Recorded evidence is focused 16/16, claims 5/5, manifest audit 167 objects, claim audit 16 `PARTIAL`/0 `FULL`, and approved native review with authority burned. This is historical evidence for that exact commit, not a claim that current or future candidates passed.

CodeGraph's canonical `init`/`query`/`explore` tool and read-only compatibility alias are committed at `7538e8681d4037cc2bce8ef2f483ba0b6fcbc200` (4 files, 353 additions / 46 deletions), with the same four blobs as the prior approved candidate. Pre-push verification reran 11/11 plus extension registration 6/6. Exact committed-range review `review-093f38eea8f16cb4` approved and acknowledged; authority burned for `sha256:6d320e0e09873df6d1708ad4909830a2bbafebbc5fc571497b86d2ff1812dcc9`. The old review and its nine advisories remain historical evidence; five new advisories in the same classes are nonblocking and do not reopen approval. Real CLI/index lifecycle, restart, host, and platform evidence remain open.

The latest bounded CI repair chain is local and unpushed: `7246966cb2d3aef6ad95f4317a96eba3a7f076b9` (source compatibility plus probes), `37faf7022fd0e6b8a563bbf7d920fd6e6934b46e` (neutral documentation boundary plus audit), and current HEAD `1237e3d81705886203fead7785c4ff32daece99a` (workflow plus YAML contract). Remote `e11b6a4` remains red. Native combined review `review-7dc163635532f99f` approved the immutable `7246966..1237e3d` slice; exact acknowledgement succeeded and burned authority for target `sha256:3e1dd3fee1113a8dc5b92c798cac012791a4955eea944629bd0845cbb8222792` at revision `88d498d557d2173797e2d036e6866c8bd22440f2f0a751806dd09502f72e7ce6`. Review `review-7078f73f836ff282` remains historically approved but unacknowledged; no old-target burn is claimed. The latest review's link-coverage, policy-coupling, source-locator and relative-link advisories are nonblocking; only relative ASEN links are corrected here.

The 23-page user-provided product brief (`SHA-256 143bf702ea5150c2a100679806097e8aadd52a367c7dcca8aad741b8a47782c0`) contributes only prioritization/evidence metadata to existing ECO owners. Pages 9 and 21 describe v4.0.0 while this repository tracks unreleased main; one-to-three-run performance figures are directional, and Windows end-to-end behavior remains unverified. It is not a frozen source, refreeze, installed-feature inventory, `FULL` proof, or authority source.

## Canonical source-of-truth route

| Read in order | Authority |
| --- | --- |
| `odd/tasks/ecosystem-strict-parity.md` | Sole execution backlog, dependency order, acceptance, status, and ECO closure evidence. |
| `odd/tasks/ecosystem-final-parity-map.md` | Reverse audit of 20 observable routes, R01-R20; every adopted surface needs implementation, deterministic evidence, host/platform evidence, or an honest disposition. |
| `registry/parity/ecosystem-sources-v1.json` | Frozen source/object/hash/reference identities for `08de420...`. |
| `registry/parity/ecosystem-media-v1.json` | Frozen media identities and inspection metadata. |
| `registry/parity/ecosystem-claims-v1.json` | Machine-checked current claims; currently 16 `PARTIAL`, 0 `MISSING`, 0 `FULL`. |
| [`reference-extension-parity.md`](reference-extension-parity.md) | Supplemental 25-file comparison from a later Reference A version and `EP-*` design aliases only; no execution checkboxes. |
| `odd/tasks/skill-contract-parity.md` | GSP-06 accepted provider-limited closure and the still-`PARTIAL` 12-Skill evidence boundary. |
| `odd/tasks/memory-strict-parity.md` and `odd/tasks/memory-v3-parity.md` | MEM audit map and canonical R01-R09 implementation/evidence record. |

For each of the final map's 20 routes, preserve the chain:

`reference surface -> ASEN surface -> implementation -> deterministic evidence -> host/platform evidence -> status`

Keep implementation, production wiring, and evidence separate. Source presence or unit-tested implementation does not prove wiring; wiring does not prove host/platform behavior; scanner output does not establish normative semantics.

## Dependency route

The next gate is **CI-PREQ-04 plus exact-HEAD required CI**; native review of the committed CI slice is closed and acknowledged. Only after those remaining gates are green may **ECO-01C-2** recover exact frozen bytes and adjudicate remaining optional, generated, external, command/tool/event, computed, and other unresolved reference semantics. Then complete ECO-01E invalidation coverage for the verified mappings.

The canonical order is:

```text
CI-PREQ-04 + exact-HEAD CI -> ECO-01C-2
-> complete ECO-01E -> complete remaining ECO-01/ECO-02
-> ECO-03..ECO-08 -> ECO-09..ECO-14
-> ECO-15A -> ECO-15B -> ECO-15C -> ECO-16
```

Do not reorder runtime work ahead of reference closure and invalidation. Do not create another queue. ECO-01C-2 may classify an edge only after recovering bytes from the exact frozen public Git object and verifying object identity plus SHA-256 against the manifest. Then inspect the actual surrounding contract and adjudicate semantics. Scanner guesses, a current checkout, a newer snapshot, a matching filename, or file presence are insufficient.

Do not change the frozen manifest merely to fit scanner output. A baseline/refreeze occurs only after explicit human review and authorization. ECO-01E must invalidate every affected claim for verified dependency/reference/anchor changes and must never auto-adopt a candidate source.

## Portable clean-clone bootstrap

Run in an ordinary clone with an `origin` remote. This sequence refuses dirty state and local divergence; it never resets, cleans, rebases, forces, or discards work.

```bash
set -eu
branch=feat/strict-parity-prerequisites
test -z "$(git status --porcelain)" || { echo "dirty worktree: stop" >&2; exit 1; }
git fetch --no-tags origin "refs/heads/$branch:refs/remotes/origin/$branch"
if git show-ref --verify --quiet "refs/heads/$branch"; then
  git switch "$branch"
  test -z "$(git status --porcelain)" || { echo "dirty worktree after switch: stop" >&2; exit 1; }
  git merge --ff-only "origin/$branch"
else
  git switch --track -c "$branch" "origin/$branch"
fi
test "$(git rev-parse HEAD)" = "$(git rev-parse "origin/$branch")" || {
  echo "local/remote divergence: stop" >&2; exit 1;
}
git status --short --branch
git rev-parse HEAD
```

If any guard fails, stop for a human decision. Never repair with `reset`, `clean`, force push, or automatic conflict resolution.

## Execution and evidence rules

- Before a write, read the canonical tracker and current implementation, derive the exact smallest edit paths, print them, and keep all writes inside the explicitly authorized list. Preserve all unrelated tracked and untracked files.
- Recover Reference A only through public Git objects addressed by the frozen commit/blob IDs. Verify bytes and hashes before semantic inspection. Do not use machine caches, persistent memory state, absolute user paths, temp-file evidence, or a pre-existing worktree as authority.
- Start behavior work with the smallest meaningful failing semantic test. Resolution, loader, fixture, setup, or source-availability failures are not semantic RED. Documentation-only work has no meaningful RED; use ordinary structural checks.
- Derive every available runner from the checked-out `package.json`. Execute in a clean, explicitly bounded environment. Do not invent commands from an old handoff, install dependencies, or treat unavailable local runners as passing.
- Obtain independent verification of the exact candidate. RDD/native review is allowed only when the user owns/enables that mode and the provider's public review capability is actually available. Codex must not fabricate Pi-only tools, review authority, acknowledgements, or provider results.
- Freeze or promote evidence only after explicit review. Record exact candidate identity, command, observed result, limitations, changed paths, and rollback boundary; never transfer a result from another SHA.
- No secrets, credentials, real user data, private repositories, package installation, or new dependencies without a separate explicit grant.
- Delivery authority is bounded to the parent-controlled metadata-seal commit and push of `feat/strict-parity-prerequisites`. It is not standing authority for ECO-01C-2, later commits, or autonomous delivery. No merge, release, publication, PR mutation, force operation, or unrelated remote change is authorized.

## Copy-ready Codex prompt: ECO-01C-2 only

> Work only on **ECO-01C-2** in `feat/strict-parity-prerequisites`. Read `odd/tasks/ecosystem-strict-parity.md`, `odd/tasks/ecosystem-final-parity-map.md`, `registry/parity/ecosystem-sources-v1.json`, and the current baseline implementation/tests. Record `git rev-parse HEAD` and dirty state. Before writing, recover the exact `08de420ca29be16b6f6bee725a30b599b061df16` public Git objects named by the frozen manifest, verify each object ID and SHA-256, inspect the bytes, and derive the smallest exact edit-path list from repository evidence. Print that list and stop for authorization if it differs from the authorized surfaces; preserve unrelated files.
>
> Add the smallest semantic tests first for the remaining optional/generated/external/reference adjudication. A scanner guess, current-source presence, or the supplemental `6e681f...` snapshot is not semantic evidence. Keep implementation, production wiring, and evidence distinct; do not refreeze, promote a claim, start ECO-01E/runtime work, or add an `EP-*` queue. Derive runners from the checked-out `package.json` and use only available clean-environment commands; do not install dependencies or claim unavailable checks passed. Obtain independent exact-candidate verification. Use RDD/native review only if the user enabled that mode and a public provider capability is available; do not invent Pi tools or authority in Codex.
>
> Do not access secrets or real user data. Do not use machine caches, persistent-memory state, absolute user paths, or temporary files as evidence. Do not commit, push, mutate a PR, merge, publish, release, or begin a later unit without a new explicit human grant. Report observed RED/GREEN where meaningful, exact commands/results, paths, candidate identity, limits, and rollback boundary.

## Handoff boundary

This document changes no runtime behavior. Validate this annotation only with ordinary structural checks and diff hygiene. Native review is closed, but exact-HEAD required CI must be green before any feature-branch push or ECO continuation; CI-PREQ-04 remains pending. No install, force, merge, release, PR mutation, secrets access, NaN work or unrelated delivery is authorized.
