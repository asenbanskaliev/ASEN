# Portable GitHub/Codex strict-parity handoff

## Windows timeout observation and initialized public host — 2026-10-09

Published baseline `227ff7a352d904b951e1fd16b88c24f617840fc3` is the direct descendant of `be209b98f9d8df4b4cba34f38657a9cf38d7bdf9`; its exact local full verification selected 1,040 tests: 1,039 passed, one known local `ps: fatal library error, lookup self` observation failed, zero skipped/cancelled. Typecheck, six audits and real packed installation passed. Four independent scoped reviewers bound the correction SHA/tree without remaining blocking findings in that delta; this is not native approval or closure of global U2.

Actions at this exact baseline: CI push [37983845132](https://github.com/asenbanskaliev/ASEN/actions/runs/37983845132) succeeded; CI PR [37983854830](https://github.com/asenbanskaliev/ASEN/actions/runs/37983854830) failed Windows job `114000806978`. Its core group passed 948/949 with one skip; serial passed 89/91 with one failure and one skip. The failure was `execution timeout terminates spawned descendants`: “descendant did not start before the timeout.” Linux/macOS CI passed. Release Gate `37983854926`, architecture `37983854837` and Pi 1.1 `37983854908` succeeded, including applicable matrices; Pi Free `37983854875` intentionally skipped, not provider PASS. These results grant no PASS to this follow-on.

The test's independent two-second descendant-readiness poll began before checkout/wrapper preparation, whereas the actual execution timeout is three seconds. A deterministic 2,100 ms POSIX child startup reproduced the old assertion failure before correction. The corrected fixture observes readiness until the actual execution settles, still fails if no descendant starts, and retains the unchanged 3,000 ms deadline. A post-cleanup probe requires the independent live sibling to publish its marker while the contained descendant must not; startup timestamps bound the entire unchanged 1,500 ms observation before its original ten-second natural exit. Nine execution/containment tests passed, zero skips. This repairs observation; it does not prove the historical Windows root cause or Windows success before fresh Actions. Production containment and test selection are unchanged.

Real packed Pi 1.1 verification now reads public `ExtensionContext.mode`, `hasUI`, `getCommands()` and `getAllTools()` only in `session_start`, after host initialization. The isolated RPC observation reported mode `rpc`, `hasUI: true`, seven canonical commands each bound to the real installed `extensions/asen.ts` path, and zero configured tools under retained `--no-tools`. An initial incorrect expectation of two visible interaction tools failed; the verifier now asserts the actual disabled-tool contract rather than claiming interaction evidence. Packed installation retained 28 exports, seven visible RPC results, zero model calls and `PACK_ENV_BOUNDARY_PASS`. No production registration was changed.

These initialized inventories do not exist at the synchronous factory boundary. They prove the effective isolated command map, not prevention of overwritten registration collisions, authoritative admission flags, complete minimum-version/platform compatibility, TUI or production ODD integration. ECO-02A and native U2 remain open; ECO-03 is not admitted. GitHub native reviews were absent at the prior observation; no authentication, acknowledgement, burn or native approval is manufactured from agent review. Preserve 16 PARTIAL / 0 FULL, optional peer `>=0.85.1`, private child authority and all historical evidence. The ecosystem tracker remains the only queue.

Final materialized-candidate full suite, audits, pack and independent SHA-bound review precede one non-force update of the authorized branch. Actual results are reported at delivery; the known local process-observer failure is never converted into PASS. No workflow rerun, manual dispatch or model/provider execution is used. Rollback is limited to the timeout fixture, public-host verifier and reconciliation notes/claim wording.

## Independent review and bounded security correction — 2026-10-09

Exact baseline `be209b98f9d8df4b4cba34f38657a9cf38d7bdf9` passed CI push `37978830550`, CI PR `37978837772`, Release Gate `37978838031`, Pi 1.1 `37978837808` and architecture `37978837871`, including every applicable matrix job. Pi Free `37978837952` intentionally skipped, not provider PASS. Release Gate selected 1,033 tests per platform: Linux/macOS passed 1,030 with three retained-source skips; Windows passed 1,028 with five disclosed skips across core/serial. These results do not transfer to the correction.

Four independent read-only agents covered all 177 changed PR paths: runtime/entry 28, authority/core 26, build/scripts/workflows 30, tests/documentation/registries/skills 93. Generated frozen manifests received semantic/structural inspection, not a claim to re-execute all frozen reference semantics or media. The baseline review required changes despite green CI: history retained complete recognized `sk-*` credentials; organic writer admission could expand original paths and drop original defect intent. The latter two are composition-authority defects, not observed production Pi exploits. No CodeRabbit, providers, paid models, native acknowledgement or delivery-authority burn was used.

The bounded correction removes complete recognized credential values before new opt-in history writes; real persistence/search/export negatives verify absence, and repeat redaction is stable. It does not scrub pre-existing files: older entries may retain previously captured secrets; existing confirmed project deletion/reset remains available. Organic admission now accepts only exact members/subsets of its immutable original declared paths and privately preserves original defect intent. Rejection still burns before retries; an issued context is checked before reading defect, avoiding getters/proxies. Structured lifecycle admission and private hash-pinned child policy are unchanged. The actual offline interaction Pi child uses the existing verifier environment allowlist and reports absent synthetic credential names, without exposing values or invoking models.

Semantic RED: five new history/scope/defect/RPC checks failed before correction. Independent prereview caught an untrusted context read; three further forged/getter/proxy negatives failed before its fix. Final focused verification passed 70/70 with zero skips. The earlier provisional full run was interrupted (exit 130) after that new finding and is not counted as completed verification. A provisional full frozen-baseline run selected 1,040 tests: 1,038 passed, two failed, zero skipped/cancelled. One failure was the known local process observer (`ps: fatal library error, lookup self`); the other was an existing D5 fixture widening `src/a.ts` to `src/`. The fixture now uses its exact declared file while preserving intake/recovery/burn assertions. Final materialized-candidate verification is required before the branch update; its actual result is reported at delivery without inheriting these counts. Typecheck, all six audits and real packed installation passed; pack retained 28 exports, seven visible RPC commands, zero models and `PACK_ENV_BOUNDARY_PASS`.

Machine claims and the canonical ECO-02A row now distinguish implemented public version/capability admission and exact historical host evidence from unsupported factory-time mode/inventories/collisions and the incomplete minimum-version/platform matrix. ECO-11 distinguishes internal persistence tests from missing production profile routing; prototype-named missing roles remain a confirmed limitation. Keep ECO-02A open and do not admit ECO-03.

Outstanding read-only findings remain explicit: setup's lexical home containment follows symlink parents; the internal profile resolver accepts inherited role names; historical manual provider workflows install unpinned Pi Free and selected authenticated probes pass ambient environments. Those future/manual surfaces were neither executed nor changed in this correction; no repository-wide credential-isolation claim is made. The prior native review remains incomplete. Final independent review must bind the materialized correction SHA; neither these notes nor old CI grant native authority, U2 approval or production parity.

One writer and one non-force branch update include source, semantic tests and reconciliation together. Rollback is limited to this correction's history redactor, organic admission provenance, RPC environment/test fixtures, claim wording and these notes. Preserve frozen objects/evidence, optional peer `>=0.85.1`, 16 PARTIAL / 0 FULL and the ecosystem tracker as the sole queue.

## Verified platform checkpoint and packed-verifier boundary — 2026-10-09

The exact remote candidate `1cc7e6aae7433f6c4892b0bc5d36d56254c1db02` passed all applicable jobs, including every Ubuntu/macOS/Windows matrix entry:

| Gate | Exact Actions run | Conclusion |
| --- | --- | --- |
| CI push | [37974542058](https://github.com/asenbanskaliev/ASEN/actions/runs/37974542058) | completed/success |
| CI pull_request | [37974550002](https://github.com/asenbanskaliev/ASEN/actions/runs/37974550002) | completed/success |
| Release Gate | [37974550029](https://github.com/asenbanskaliev/ASEN/actions/runs/37974550029) | completed/success |
| Phase 0 architecture | [37974549961](https://github.com/asenbanskaliev/ASEN/actions/runs/37974549961) | completed/success |
| Pi 1.1 runtime | [37974550127](https://github.com/asenbanskaliev/ASEN/actions/runs/37974550127) | completed/success |
| Pi Free Smoke | [37974549935](https://github.com/asenbanskaliev/ASEN/actions/runs/37974549935) | intentionally skipped; not provider PASS |

This resolves the preceding Windows scheduling/environment checkpoint for this SHA only. PR #32 remains open/draft. Native GitHub reviews were empty on observation; the earlier independent review remains incomplete. CI PASS is not U2 approval. Earlier headers and pending-gate statements below are historical checkpoints, not the current candidate's gate state.

The next source delta fixes a reproduced R2 gap: `verify:pack` previously launched `verify-pi-package.mjs` with inherited credentials before its SDK/resource loader imported the packed extension. A real packed-install negative witness failed with `verifier must receive an explicit environment`. The launch now reuses `createPiVerifierEnvironment`; the existing `npm run verify:pack` executes a reusable synthetic-credential witness that intercepts the actual launch, requires one invocation and rejects OpenRouter/LLM7/Groq/GitHub credentials. The verifier stays offline and telemetry-disabled; no workflow permissions/secrets, provider probes, paid models or dependencies changed. RPC verification continues through the real installed package, not a facade-only substitute.

Local evidence for this delta: 17 focused preflight/environment/test-plan tests passed; typecheck passed. The frozen-baseline full suite executed 1,033 tests: 1,032 passed, one failed, zero skipped/cancelled. The sole failure was `Pi cancellation settles its process tree and policy cleanup before returning`: `ps could not observe process ... (exit 1: fatal library error, lookup self)`. This is a local observation failure, not PASS. All six audits passed separately; no frozen sources were refreshed. Real packed installation passed with 28 exports, seven visible RPC commands, zero model invocations and `PACK_ENV_BOUNDARY_PASS`; diff hygiene passed. New source requires its own automatic exact-SHA Actions and inherits none of the table's gates.

Own R1/R2/R3/R4 inspection covers the explicit launch boundary, negative-before-fix evidence, runtime allowlist reuse, preserved real host checks, unchanged test selection/timeouts and honest evidence binding. It does not complete independent/native review. U2 and ECO-02A remain open: factory-time mode/inventories/collision admission and a complete minimum-version/platform matrix are unproven. Production ODD/TUI integration is not established by these RPC checks. ECO-03 is not admitted; retain 16 PARTIAL / 0 FULL, optional peer `>=0.85.1`, private hash-pinned child authority and historical evidence. The ecosystem tracker remains the sole queue. Rollback is bounded to `package.json`, `scripts/verify-pack.mjs`, `scripts/verify-pack-environment.mjs` and these reconciliation notes.

## Exact baseline candidate observation — 2026-10-09

Before this follow-on, remote PR #32 HEAD was `90515eb76f9ac3d21e04a97bee0bbcbad4db3e5f`, 315 commits ahead and 0 behind `main` `49129b616c5349fbf323b74860136fc1593f9b2a`. CI push/PR, Release Gate, Pi 1.1 runtime, and Phase 0 Architecture succeeded for that exact SHA; Pi Free Smoke was intentionally SKIPPED. No GitHub native reviews exist, and the prior independent review remained incomplete. Those gates and review observations do not transfer to the follow-on candidate.

The authorized B2 evidence now includes a peerless packed ASEN install and real Pi `0.85.1` Linux RPC smoke (seven commands; zero model calls). Mode, factory-time inventories/collisions, other minimum-version platforms, production ODD integration, and TUI journeys remain unproven; ECO-02A stays open and ECO-03 is not admitted.

## Prior checkpoint: Windows CI repair batch — 2026-10-09

Published HEAD `b977e55` passed Pi, architecture and three-platform package/install gates, but both CI events failed the Windows evidence/TDD timeout. The bounded candidate moves that file into the existing serial Windows contained-process group without raising timeouts or omitting tests. See the [exact CI and repair evidence](pi-1-1-runtime-alignment.md). One publication includes source, tests and metadata; no Markdown-only CI dispatch. U2, independent review and B2/ECO-02A remain open; 16 PARTIAL / 0 FULL is unchanged.

## Historical implementation follow-up — 2026-10-09

The original Pi 1.1 candidate now has successful CI and package/install gates on Ubuntu, Windows and macOS after the bounded Ubuntu retry. The user authorized correcting reproduced installed-package/API defects on this same PR. See the [canonical follow-up](pi-1-1-runtime-alignment.md) for exact identities and remaining gates. New source candidates do not inherit earlier CI. U2 and final independent review remain open; B2/ECO-02A and production orchestration integration stay pending. Optional peer `>=0.85.1`, frozen/historical evidence and 16 PARTIAL / 0 FULL remain unchanged.

## Prior handoff reconciliation (superseded) — 2026-10-09

Published branch / OPEN-DRAFT PR #32 head is `4290f7da71c586b3f69509bee959740228a9831f`, 311 ahead / 0 behind main `49129b616c5349fbf323b74860136fc1593f9b2a`. The user authorized push with verification pending and cancelled the full local suite in favor of Actions. Publication occurred; approval did not. The local native review remains incomplete and unapproved.

[Canonical Pi 1.1 handoff and exact Actions evidence](pi-1-1-runtime-alignment.md) records Pi RPC/architecture PASS, macOS CI PASS, Linux/macOS pack/install PASS, Windows still running, and Ubuntu CI dependency-install `ECONNRESET`. No duplicate execution started. U2 remains open; finish the already running gates, then retry only the failed Ubuntu job and complete final review before B2/ECO-02A. Optional peer `>=0.85.1`, frozen/historical evidence and 16 PARTIAL / 0 FULL remain unchanged.

This is the current execution route. Conflicting checkpoints, publication restrictions and dependency statements below are historical; they do not override the present user handoff or create additional backlogs. No new Markdown-only CI dispatch is needed.

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

The current fully observed checkpoint is `bc6160d598dfd4e9a5b369d15177bf0c8d6a17e6`. CI push `37734698587`, PR `37734702290`, Release Gate `37734702429` (Ubuntu/macOS/Windows), Pi `37734702301`, and Architecture `37734702361` passed; Pi Free Smoke `37734702356` was intentionally SKIPPED, not PASS. CI-PREQ-04 implementation and current exact CI are verified at that checkpoint without proving permanent elimination of the race class. Earlier local/unpushed and red-remote statements are historical; native review evidence remains bound only to its recorded immutable targets.

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

CI-PREQ-04 and exact-current CI are verified at checkpoint `bc6160d`; those results do not transfer to the current uncommitted passive metadata candidate. **ECO-01C-2** is now open with canonical U1 checkpoint/byte-proof reconciliation IN PROGRESS and later U2/U3 work still pending. Real adjudication must recover exact frozen bytes first; then ECO-01E completes invalidation coverage for verified mappings.

The canonical order is:

```text
ECO-01C-2 U1 -> U2 -> U3
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

This document changes no runtime behavior. Validate this annotation only with ordinary structural checks and diff hygiene. Checkpoint `bc6160d` has exact-current CI and CI-PREQ-04 verification, but that evidence does not transfer to this uncommitted passive U1 metadata candidate; U1 remains incomplete until parent independent checks and committed identity are observed. No install, force, merge, release, PR mutation, secrets access, NaN work or unrelated delivery is authorized.
