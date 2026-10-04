Warning: truncated output (original token count: 30530)
Total output lines: 547

Warning: truncated output (original token count: 30063)
Total output lines: 538

Warning: truncated output (original token count: 47072)
Total output lines: 709

# ASEN memory parity with the pinned upstream v3.0.0

## Goal and authorization

The user explicitly authorized analyzing the pinned upstream v3.0.0 and implementing absolute observable memory parity in ASEN, including what is saved, why, when, how, retrieval, retention, integration, and failure behavior. Memory now takes priority over the unfinished ODD/Skill chain. This changes sequencing, not the evidence standard or publication policy.

Do not equate basic SQLite persistence, installing an upstream plugin, a tool-name match, or green isolated tests with parity. No complete parity claim is valid until every applicable observable obligation has version-bound evidence. Optional features are not silently excluded from the overall target.

## Version ownership and provenance

- Reference identity, owner, repository, and release URL: owner-controlled metadata in `registry/parity/memory-upstream-v3.json` for tag `v3.0.0`.
- Core release published: `2026-10-01T22:30:47Z`.
- Annotated tag object: `fcf2eb5b6fe445c19a2e5568612a0a421f0fd5e1`.
- Exact core commit: `15a2f78885d7ad8ced23b2d1d88383e9bb472c17`.
- GitHub reports the tag unsigned and the release non-immutable. The pinned observed commit is not a verified publisher signature.
- The core binary v3.0.0 and the Pi package named in `registry/parity/memory-upstream-v3.json` at version 0.2.0 have separate release channels. Independently resolved `pi-v0.2.0`: annotated object `8795484df1725315d8bf2b9181afa67de78147b0`, commit `ce51810bd351f397e49728d6a5be81679cf18554`, also unsigned. Compare actual Pi files/published package rather than assuming the later core commit is its package release.
- Primary source cache: `C:/tmp/pi-github-repos/runtime-22jXZn/04c4844dbaf9c76aee10d313520deeac0cfb3c3d9a21f35f130b74092da29e7a`. A fresh verifier confirmed its HEAD equals the exact core commit. The cache is public-source research, not an ASEN candidate or a runtime installation.
- Context7 is a navigation aid and currently points to main. Frozen implementation and tests outrank its snippets, release announcements, or stale prose.
- Prior upstream-memory baseline `3284dcc2f20278ea8d37277350be9d96155697a3` and `odd/tasks/memory-strict-parity.md` remain historical. Their local-first Cloud/sync/TUI deferrals do not narrow this new full target.

## Current work and isolation

- Initial mapping worktree: `../ASEN-skill-parity`, its dedicated skill-parity feature branch, expected HEAD `56600974fe742d862d9e7fc65a1cf9f740a6c81f`.
- Preserve the unrelated six-path V4-01a reference candidate: 279 changed lines, independent scoped PASS, native review not started. Do not combine it with memory changes or call it complete v4 parity.
- Memory worktree prepared: `../ASEN-memory-v3-parity`, on the dedicated memory feature branch identified by checkpoint record `13676`, HEAD `56600974fe742d862d9e7fc65a1cf9f740a6c81f`. Git materialized only the committed baseline; clean status was observed before this tracker was copied. No source edits, commits, stash/reset, network or installation occurred. Never combine the unrelated old-worktree changes with this feature.
- This worktree's task file is canonical. The initial file in ASEN-skill-parity is a staging copy of the research plan, not a second authority. Reconcile this complete file and its full project-memory mirror before the first source writer.
- The first source writer completed a partial reference-only candidate in six allowed paths; no production database migration, installation, server upgrade, Cloud enrollment or host-configuration change has occurred.

## Constraints and acceptance rules

- Preserve ASEN-owned names, `.asen` paths, all 27 static Skill IDs, and existing ASEN memory identities/data. External protocol identifiers and dependency identities are preserved where compatibility requires them; no upstream logos, artwork, protected prose, or private authority copying.
- Do not inspect or alter excluded `.codegraph/`, `asen-0.1.0.tgz`, real user databases, private logs, credentials, or public-repository memory chunks containing unrelated observations.
- Use synthetic isolated stores for comparison, migration and failure tests. Any real data migration or repair requires a preview, backup, exact scope and fresh human authorization.
- Keep one source writer at a time, exact allowed edit surfaces, applicable observed test-first behavior, and readable work units under 400 changed lines. Split rather than compress logic, documentation or tests.
- Preserve unfinished ODD work and its legacy-inspection-only decision. Neither a stored memory nor an authenticated old snapshot grants current file-write, review, delivery or publication permission.
- User-selected Pi Free remains the model-backed verification provider. Deterministic tests, public-source hashing and runtime model journeys are different evidence classes.
- Local storage remains usable without optional Cloud or synchronization. Optional surfaces still need their own proof before full-system parity; unavailable external accounts/platforms remain pending.
- `expected_project` in v3 is an ownership assertion, not authentication or tenant isolation. Keep hook limitations, ID-based reads, and accepted upstream limitations explicit rather than inventing stronger guarantees.
- Distinguish model guidance from code-enforced automation. A protocol instructing the model to save after a fix does not prove the integration automatically observed or saved that fix.
- Memory write outcomes are confirmed, rejected, unknown or unavailable. Unknown outcomes are read back/reconciled, never blindly repeated. Memory failure must not suppress the user's final response.
- Do not silently narrow absolute parity to local CRUD, silently replace the ASEN core with a connector, or claim standalone/platform parity from a Node-only development environment.

## Evidence format

Each behavior needs its owner/version/source path and hash, ASEN candidate identity, input, trigger and event ordering, expected outputs, durable state and side effects, exact runnable command/journey, observed result, and applicable positive, negative, recovery, restart, concurrency, privacy, permission, transport and platform controls.

Record whether proof is source inspection, a deterministic synthetic-store test, process-isolated comparison, real host integration, or live external service. Every FULL claim must identify all applicable evidence; skipped or unavailable cases remain open. ID, time, path and ASEN-name differences require explicit normalization, not hidden removal of a substantive difference.

## Tasks

- [ ] E3-01 — Freeze the full source and behavioral contract.
  - Hash selected implementation, protocol, test and packaging references at the exact core and Pi commits.
  - Inventory complete tool/API/CLI, storage, agent, operational, UI and optional-service surfaces. Create a granular honest comparison matrix without overwriting historical records.
  - Record version ownership and every accepted upstream limitation; verify actual code rather than release claims alone.
  - E3-01a: separate frozen reference manifest plus 18-family baseline matrix and offline audit rejecting unsupported FULL claims. Source identifiers are provenance-only; forecast 280–360 changed lines, split before 390. No data-store mutation or live equality claim.
  - E3-01b: resolve source contradictions, fill precise behavior/event/transport contracts and corresponding fixture evidence. E3-01 remains open until these are validated; a broad family matrix is not the finished contract.
  - E3-01b1: eight source-inspected foundation cases in registry/parity/memory-foundation-contracts-v1.json, validated through the existing audit/reference test plus one exact metadata boundary exception. Four source paths; forecast 220–290 changed lines, entire candidate including tracked task changes below 390. No engine changes or runtime-proof promotion.
  - [x] E3-01b2 — Complete as a SOURCE_INSPECTED reference-only slice: five observation-write contracts in `registry/parity/memory-observation-write-contracts-v1.json` cover new save, topic revision, duplicate collapse, guarded update, and guarded soft/hard deletion. The fixture preserves unguarded library variants, enrollment-dependent queue effects, unknown-write reconciliation, and the distinction between ownership assertions and authentication. This is not engine or runtime-parity evidence.
- [ ] E3-02 — Establish a safe ASEN storage and migration foundation.
  - Derive schema, limits, journal/connection behavior and local-filesystem restrictions from source.
  - Preserve current rows, external IDs, project/session association and content. Per the user's explicit E3-R01 instruction, reject a future schema version before migration or mutation. This intentionally diverges from the pinned source's compatible-future CRUD behavior; document the difference and do not claim parity for that edge. Malformed/incompatible data follows the migration error contract established by tests.
  - Prove transaction rollback, repeated migration, simultaneous opens and restart consistency using synthetic copies.
- [ ] E3-03 — Match project identity and ambiguity handling.
  - Reproduce explicit/config/session/Git/worktree/directory resolution and existing binding reuse. Pinned Git detection preserves percent encoding; explicit Cloud CLI input independently unescapes exactly one layer unless literal mode is selected. Do not implement universal remote-name decoding from the broader release wording.
  - Cover ambiguous project lists/recovery, child projects, malformed config, collisions and explicitly backed cross-project choices.
- [ ] E3-04 — Match session registration, continuation and isolation.
  - Confirm host registration before binding classified writes or prompts; do not invent a session ID from a task name.
  - Preserve ended sessions and atomically allocate/reuse live resume continuations instead of reopening them.
  - Prove directory-conflicting isolated registration fails without changing the original session; cover races, reloads, detached/manual calls and mismatched acknowledgements.
- [ ] E3-05 — Match observation save, update, deletion and revisions.
  - Match normalized content, fields, scopes, type defaults, topic updates, duplicates, revision/last-seen counters, timestamps, pins, and staleness.
  - Match explicit expected-project update/delete results, including missing/invalid input, wrong owner and absent ID, with no rejected mutation to rows, revisions or sync queue.
  - Reproduce soft/hard deletion and privacy behavior without overstating authentication.
- [ ] E3-06 — Match retrieval, search and progressive context.
  - Match ID-based retrieval and response-context selection separately from project-filtered search.
  - Derive FTS matching, ranking, all/any behavior, escaping, short-query handling, limits, previews, timelines and byte budgets from actual code/tests.
- [ ] E3-07 — Match prompts, summaries and curated passive capture.
  - Define exactly what is captured, at which trigger, and with which opt-out/redaction/provenance rules.
  - Preserve prompt inbox and deleted identities across export/import and sync; do not turn curated memory into a raw transcript sink.
- [ ] E3-08 — Match relationships, contradictions and review.
  - Reproduce pending candidates, semantic judgments, direct comparisons, confidence/provenance, stale review and deleted-target behavior.
  - Distinguish model judgment from lexical detection; enforce source-backed cross-project restrictions and idempotency.
- [ ] E3-09 — Integrate memory into actual ASEN work timing.
  - Recover project/history before related work and save significant knowledge at the source-backed triggers.
  - Cover fix/decision/discovery/configuration/pattern/user-constraint events, topic evolution, structured content and explicit versus automated capture.
  - Prove which behavior is enforced by code, which is model guidance, and which requires user action.
- [ ] E3-10 — Match Pi-native tools and host lifecycle.
  - Implement the required ASEN-owned native tools over one authoritative core, with actual host-session binding and isolated explicit project saves.
  - Match server capability negotiation, startup ownership, warnings, prompt/system integration, reload and cleanup. Do not install a legacy MCP adapter or overwrite retained user configuration.
- [ ] E3-11 — Match compaction, close, failures and resumption.
  - Persist/recover handoffs at actual events and reconcile confirmed/unknown/rejected/unavailable outcomes.
  - Prove no blind replay, duplicate summaries, stale-session writes, lost user replies or fake success after restart/timeouts.
- [ ] E3-12 — Match doctor, backup, repair and project merge.
  - Derive diagnostics and preview/apply boundaries, backup-first repairs, orphaned relations, blank-project histories, legacy empty prompts and reserved-project restrictions.
  - Cover failed backups, partial repairs, stale checks and refusal without side effects; no automatic repairs of real stores.
- [ ] E3-13 — Match export, import and Git synchronization.
  - Preserve complete identities, revisions, prompt tombstones, relation/session order, codec and corruption/error behavior.
  - Prove delete/recreate ordering, stale replay, repeated imports, interrupted writes and concurrent processes.
- [ ] E3-14 — Match optional Cloud and autosynchronization.
  - Inventory enrollment, observed token-plus-project-allowlist authentication, project scope, export eligibility, queue/replay acknowledgements, conflict handling and paused/in-progress state. Do not invent tenant isolation or a remote_epoch protocol absent from the pinned source.
  - Validate synthetic/local service cases first. Live account use, credentials, remote changes or publication need separate human authorization; unavailable live proof remains pending.
- [ ] E3-15 — Match remaining agent and external interfaces.
  - Cover source-backed library/CLI/HTTP/MCP profiles and applicable Claude/Codex/OpenCode/other-agent setup and hooks.
  - Keep each host's registration, warning, restoration and configuration preservation behavior distinct. Do not claim a simulated hook proves a live host.
- [ ] E3-16 — Match operational views and optional clients.
  - Inventory TUI, dashboard and Obsidian commands, snapshot handling, rendering/state/interaction and errors using ASEN-owned visual identity.
  - Do not silently defer these while claiming complete pinned-upstream parity; platform/client availability is an explicit pending dimension.
- [ ] E3-17 — Match installation, runtime and platform behavior.
  - Determine standalone-binary versus ASEN package requirements and resolve substantive packaging differences before claiming equality.
  - Verify Windows/Linux/macOS and applicable architectures, installation/migration/uninstall preservation, release checksums and restart behavior where available.
- [ ] E3-18 — Complete independent comparative verification.
  - Run version-bound positive, negative, concurrent, process-isolated, corruption, privacy, restart and real Pi Free journeys on matched synthetic inputs.
  - Promote only closed granular rows, report every remaining difference, and close bounded work units with applicable native review and explicitly authorized delivery actions.

## Initial evidence and research status

- Historical memory plan and its upstream-memory observation `13549` were read. Read-only ASEN mapper `muqqtqzs-8-hvn5` confirmed actual code: only tests use the memory store; no production integration, memory tools, session/project registry, default database path, or ASEN_DATA_DIR exists. Doctor merely checks store presence. All four memory capabilities remain specified.
- Every current store open takes BEGIN IMMEDIATE and completely rewrites FTS. Existing rows use caller-supplied IDs, kinds, project/session strings, timestamps and nullable topics; those fields must survive migration. Search receives raw FTS syntax and limits to 20; get is unscoped by ID. These are implemented facts, not the more complete old plan.
- Local mapper suggested a <=300-line schema/migration foundation in sqlite-store.ts and a new migration test. It remains a candidate, not permission to implement unsourced v3 behavior before contract mapping.
- Pinned source core/API semantics mapper: `muqr2h3c-a-z265`.
- Pinned source memory timing/Pi integration mapper: `muqr4agn-b-vtxm`.
- Pinned source recovery/sync/Cloud/interfaces mapper: `muqraolg-c-5447`.
- Fresh public-cache verifier confirmed exact commit and eight source byte/hash pairs, including `go.mod` (3004 bytes, SHA-256 `7ac194ec9dd670cfd89fd8875d9dc42e630d11032082edeb50b78de25f86a076`). Other complete pairs remain in the verifier result and must enter the provenance manifest before a source-parity claim.
- All three source explorers completed initial maps. Important distinctions: fix/decision save triggers are model policy, while Pi automates prompt/passive/compaction events after confirmed registration. Native capture_prompt is exposed but not forwarded; MCP behaves differently. Privacy tags are not general secret detection. ID-based get is not project-filtered; pins/review are local state. Optional Cloud uses observed token/allowlist controls, not a proved tenant system. Standalone Go packaging differs from ASEN's Node package.
- Source challenge muquxdyd-f-80qh completed: Git detection preserves percent encoding and existing bindings win; Cloud CLI alone decodes one layer unless literal mode. Unknown constants, parser edges and multi-process cases remain explicit contract gaps, not assumed parity.
- Fresh verifier reconfirmed the dedicated memory branch/HEAD and unchanged task-only status. It computed seven implementation/test byte/hash pairs at core commit 15a2f788 (including plugin/pi/index.ts as CORE-snapshot source, not published Pi-package equivalence). These feed E3-01a.
- Writer `muqv1dt3-g-vlc9` returned partial E3-01a: six files, 247 additions/14 deletions (261 source-unit churn), meaningful unsupported-FULL RED followed by focused GREEN 9/9. No staging or commits. Typecheck failed because tsc is unavailable; offline/boundary audits, diff check and final status were not run after the tooling STOP. None of these pending checks is a pass.
- Native ASSESS returned unassessable because untracked paths require declaration, RDD on, unknown outcome and runtime large writer profile. Independent verification remains mandatory; no native approval exists.
- Separate read-only tooling diagnosis confirmed no node_modules in the memory worktree. ASEN-skill-parity has existing dependencies with an exactly matching lock: TypeScript 5.9.3, tsx 4.23.15, Node types 24.19.0 and Pi agent SDK 0.87.1. This is compile-environment evidence, not current Pi runtime or v3 integration compatibility proof. No link, install or dependency upgrade was performed.
- Human explicitly selected reuse-local-dependencies. A separate setup worker created ONLY the local node_modules junction to ASEN-skill-parity after fresh same-Git-clone, real-directory, target-absent and exact-lock checks. Lock SHA-256: b2af22162a593e350ef78909aa6066e3beab0f19c8d798d4fc8f42dde59fac0b. No downloads, installs, upgrades, global changes or dependency-content edits. Junction is ignored by Git; source candidate unchanged.
- This was environment preparation, so behavior test-first was not applicable; it is not evidence that a separate Strict TDD mode was activated or required. Independent functional/type/audit checks remain pending and must use the actual memory worktree.
- Independent verifier muqvs7d5-k-s0n8 returned FAIL: all authorized commands passed (focused 9/9, memory audit, boundary 313 paths, Skills 27, historical Skill …20530 tokens truncated… non-blocking later work. This closes only the SOURCE_INSPECTED slice; it does not establish runtime or FULL parity.

## E3-06a — Observation pin/unpin mutation reference

- [x] Independently reverify the previously scouted canonical store identity, complete pin/unpin boundaries and nonduplication against the post-E3-X1 baseline.
- [x] In isolated writer B after E3-X1, add one SOURCE_INSPECTED pin/unpin fixture/validator/test slice through writer B's static registry only.
- [x] Independently verify preservation and mutation controls, run native review, seal the exact tree and create a local checkpoint.

Writer B surfaces after E3-X1 only: `scripts/memory-parity/writer-b/**`, one new `registry/parity/memory-observation-pin-contracts-v1.json`, and one new `tests/memory-parity-observation-pin.test.ts`. Do not touch writer A, the composition module, monolithic reference test or package scripts. A user-authorized exact historical fetch restored commit `15a2f78885d7ad8ced23b2d1d88383e9bb472c17` to the research clone. Canonical `internal/store/store.go` is mode `100644`, blob `a396d5d8eb91b956a12c23cd5e936a2b74dd7760`, SHA-256 `6c52f5e8f71e8d00e1ff5c5f10361142b89b500786b181c825e1d69ad31ee15e`, 488121 bytes / 13200 LF / zero CR / valid UTF-8 / no BOM / final LF. Complete tuples `(63,63)` and `(3932,3957)` are independently confirmed; ending the latter at 3956 omits the closing brace. The public fetch completed without prompting, but its Bash shell command used ineffective Windows-style credential-control assignments; do not repeat it or claim prompt suppression was proved.

Pin delegates `true`, unpin delegates `false`, mapping to integers 1 and 0. The helper updates only `pinned` by ID where `deleted_at IS NULL`, uses `execHook`, returns execution and `RowsAffected` errors unchanged, returns `ErrObservationNotFound` for zero affected rows and otherwise nil. SOURCE_INSPECTED only; do not claim driver no-op row-count behavior, hook/runtime behavior, SQLite, ownership, authorization, transactions, timestamps, sync, concurrency, Cloud or full-family parity. Hard split before 390 whole-candidate changed lines.

Closure evidence: isolated commit `e8a313abaff46398bee21ef2a8b9d7968e0bc3c9` retained tree `c802232a4ac9213cd7bd8433b290c875736bc7e8`, with native lineage `review-8354fa0d964473da` approved and acknowledged; serial integration produced commit `6c718db9cec13a921d425165308383ac6301a20d`. Final integration correction `fae773733d51317daff7b432a5f81e0be49a035e` retained tree `a5d5bf5d45b78ccdd3d8f474a75db2b1ad4c5194`, with native lineage `review-f2f6733079f9e482` approved and acknowledged. Combined verification passed protocol 7/7, pin 5/5, composition 7/7, reference 60/60, boundary 1/1 and 147 TypeScript files with zero diagnostics; memory, upstream-boundary, behavior-skills, Skill-parity and phase-10 audits also passed. Advisories `R3-dynamic-success-label-oracle` and `R3-writer-b-coverage` remain non-blocking later work.

The transient upstream checkout disappeared after the earlier independent raw pin. Final composite verification reconciled the current fixture against the already recorded immutable commit/blob/SHA/tuple evidence and did not freshly hash raw bytes. Serial integration made the pin commit four paths because the identical generic composition change was already present from protocol; the audit-boundary conflict was minimally combined to copy both fixtures. The claim remains SOURCE_INSPECTED only. Next work is a repository-native Codex handoff/roadmap for runtime implementation, not a FULL parity claim.

## Codex/GitHub continuation after PR #30 update

**Resume action:** query GitHub for PR #30's `headRefName` and head SHA, fetch that ref, check it out, and confirm local `HEAD` equals the fetched remote head. Run `git merge-base --is-ancestor 5a49a261dadfc4ccdd41ff47b51f271f01f5b71d HEAD`, then read this tracker and inspect the repository implementation before writing. The closed checkpoint chain currently reaches `5a49a261dadfc4ccdd41ff47b51f271f01f5b71d`; the handoff commit and fetched head must descend from it, not replace it.

This section is the repository-native continuation view of this canonical tracker, not another plan authority. It is self-contained for Codex operating from GitHub and does not depend on persistent memory, local worktrees, local absolute paths, transient source caches, or `.codegraph`.

### Runtime truth and claim boundary

The current runtime memory core is `src/memory/types.ts`, `src/memory/context.ts`, and `src/memory/sqlite-store.ts`: a small synchronous `MemoryStore`, a context that supplies project/session IDs, and a SQLite table plus FTS save/get/search implementation. `extensions/asen.ts` has no memory tool or lifecycle integration. `src/session/checkpoint.ts`, `src/session/pi-resume.ts`, and `src/lifecycle/doctor.ts` are adjacent existing entry points, not proof of memory integration.

Files under `registry/parity/` and their validators/tests are frozen **SOURCE_INSPECTED** evidence. They can constrain implementation and tests but never prove ASEN runtime behavior, host integration, persistence, security, platform support, or FULL parity. Promote a claim only from an independently observed acceptance scenario at the relevant boundary.

### Portable quick path

1. Derive PR #30's head ref from GitHub; verify fetched-remote/local HEAD equality, checkpoint ancestry, and `git status --short`. Do not inspect or modify `.codegraph`, and keep it outside every candidate.
2. Read this tracker, the three runtime memory files, adjacent entry points named above, relevant tests, `package.json`, and `package-lock.json` before designing changes.
3. Install only according to the checked-in lockfile and project policy (`npm ci` when a clean install is required); do not change dependencies or lockfiles incidentally.
4. Establish the focused baseline: protocol 7/7, pin 5/5, composition 7/7, reference 60/60, boundary 1/1, the 147-file compiler check, and the repository audits. The historical broad `npm test` hit the 180-second timeout; it remains unresolved and must not be reported as passed.
5. Select exactly one work unit below. Observe applicable behavior-level RED before implementation, then GREEN; documentation-only changes may record that no meaningful RED applies.
6. Independently verify the focused behavior, negative/restart cases, typecheck and applicable audits. Keep fixtures classified as source evidence only.
7. Make one Conventional Commit containing the bounded behavior, tests and documentation, then update this same tracker with observed evidence. Codex has no automatic authority to push, merge, release, publish, or modify PR state.

Focused baseline commands are `npm exec -- tsx --test tests/memory-parity-protocol.test.ts`, `npm exec -- tsx --test tests/memory-parity-observation-pin.test.ts`, `npm exec -- tsx --test tests/memory-parity-composition.test.ts`, `npm exec -- tsx --test tests/memory-parity-reference.test.ts`, `npm exec -- tsx --test tests/audit-boundary.test.ts`, `npm run typecheck`, `npm run audit:memory-parity`, `npm run audit:upstream-boundary`, `npm run audit:parity`, `npm run audit:skills`, and `npm run audit:skill-parity`. Report actual counts and failures; do not infer success from this historical baseline.

### Stable dependency order

| Unit | Scope | Depends on |
| --- | --- | --- |
| R01 | Versioned storage and migrations | — |
| R02 | Project/session identity and continuation | R01 |
| R03 | Observation CRUD, revisions, delete, pin and privacy | R02 |
| R04 | Search, timeline, progressive context, relationships, contradictions and review | R03 |
| R05 | Prompt, tool-result and passive-capture timing | R03, R04 |
| R06 | Pi/MCP tools and lifecycle | R02–R05 |
| R07 | Compaction, summary and recovery | R02, R03, R05 |
| R08 | Doctor, backup, repair, import/export and Git sync | R01, R03, R04, R05, R07 |
| R09 | Runtime, cross-platform and final parity | R01–R08 plus the full 18-family matrix |

### Work-unit cards

#### E3-R01 — versioned storage and migrations
- **Entry/surfaces:** `SqliteMemoryStore` construction and `#repairFts` in `src/memory/sqlite-store.ts`; likely `src/memory/sqlite-store.ts`, `src/memory/types.ts`, `tests/memory-persistence.test.ts`, and `tests/memory-durability.test.ts`.
- **Acceptance:** synthetic legacy/current/future stores prove ordered idempotent migration, backup-before-migration, preservation, rollback, restart recovery, concurrent opens, and rejection of future schema versions before mutation. The explicit future-version rejection requirement supersedes the historical source-inspected compatible-future CRUD option; this is an intentional divergence, not parity evidence.
- **Ceiling:** no real-store migration, identity/CRUD-family completion, operational repair, platform, or FULL claim.

#### E3-R02 — project/session identity and continuation
- **First gate/surfaces:** discover and admit the required API before implementation; no callable API or module is assumed beyond existing `MemoryStore.save/get/search/close`. Inspect only `src/memory/**`, `src/session/**`, and existing tests until evidence justifies a narrower admitted surface.
- **Acceptance:** synthetic explicit/configured/repository identity and ambiguous/mismatched cases register before classified writes; ended roots allocate/reuse one live continuation across restart and races without mutating a conflicting session.
- **Ceiling:** no observation semantics, host hook timing, authentication, or full lifecycle claim.

#### E3-R03 — observation CRUD, revisions, delete, pin and privacy
- **First gate/surfaces:** discover and admit the required API before implementation; no callable API or module is assumed beyond existing `MemoryStore.save/get/search/close`. Inspect only `src/memory/**` and existing tests until evidence justifies a narrower admitted surface.
- **Acceptance:** one synthetic project exercises create, duplicate/topic revision, guarded update, soft/hard delete, pin/unpin and private-content exclusion with wrong-owner/no-op negatives and restart proof.
- **Ceiling:** parity fixtures and pin references guide expectations only; no search, transport, general secret detection, authorization, or FULL claim.

#### E3-R04 — search, timeline, progressive context, relationships, contradictions and review
- **First gate/surfaces:** discover and admit the required API before implementation; no callable API or module is assumed beyond existing `MemoryStore.save/get/search/close`. Inspect only `src/memory/**` and existing tests until evidence justifies a narrower admitted surface.
- **Acceptance:** a deterministic synthetic corpus covers project-scoped ID/search distinction, query/ranking/limit/privacy behavior, timeline and byte budgets, plus pending relationships, contradiction judgments, provenance/confidence, stale review and deleted-target behavior across restart.
- **Ceiling:** no model-semantic correctness, capture timing, host integration, remote service, or complete retrieval/relation/review claim beyond observed cases.

#### E3-R05 — prompt, tool-result and passive-capture timing
- **First gate/surfaces:** discover and admit the required API before implementation; no callable API or module is assumed. Inspect only `extensions/asen.ts`, `src/memory/**`, and existing tests until evidence justifies a narrower admitted surface; protocol/passive fixtures are not execution.
- **Acceptance:** a fake host proves registration precedes prompt/tool-result capture, recursive memory tools are excluded, private tags and eligibility gates apply, failures do not suppress the user result, and ordering survives restart where applicable.
- **Ceiling:** no live Pi/MCP, redaction-completeness, model judgment, raw transcript capture, persistence-from-POST, or FULL claim.

#### E3-R06 — Pi/MCP tools and lifecycle
- **First gate/surfaces:** discover and admit the required API before implementation; no callable API or module is assumed. Inspect only `extensions/asen.ts`, `src/memory/**`, `src/session/**`, and existing tests until evidence justifies a narrower admitted surface; no memory tools are currently registered.
- **Acceptance:** fake Pi/MCP adapters prove tool schemas/results, explicit-project isolation, startup registration, reload/cleanup, capability errors and session binding over one authoritative core; each failure returns an honest unavailable/unknown outcome.
- **Ceiling:** no configuration overwrite, legacy adapter install, live-host equivalence, remote delivery, authentication, or FULL claim.

#### E3-R07 — compaction, summary and recovery
- **First gate/surfaces:** discover and admit the required API before implementation; no callable API or module is assumed. Inspect only `src/session/**`, `src/memory/**`, `extensions/asen.ts`, and existing tests until evidence justifies a narrower admitted surface.
- **Acceptance:** synthetic compaction/close/restart scenarios persist one summary at the actual event, reconcile confirmed/unknown/rejected/unavailable writes, avoid blind replay/duplicates/stale-session writes, and always preserve the user response.
- **Ceiling:** checkpoint data is a recovery hint, not verified evidence; no real key/data use, backup/import, remote sync, or FULL claim.

#### E3-R08 — doctor, backup, repair, import/export and Git sync
- **First gate/surfaces:** discover and admit the required API and complete exported state before implementation; no callable API or module is assumed. Inspect only `src/lifecycle/doctor.ts`, `src/memory/**`, `src/session/**`, `extensions/asen.ts`, and existing tests until evidence justifies a narrower admitted surface.
- **Acceptance:** temp-store tests prove diagnosis plus preview-before-apply, backup-before-repair, refusal without side effects, lossless export/import of all admitted R01/R03/R04/R05/R07 state, and interrupted/repeated Git-sync recovery; commands must name synthetic paths only.
- **Ceiling:** no automatic real-store repair, credentials, real user data, network publication, Cloud enrollment, merge/push, or operational-completeness claim outside tested cases.

#### E3-R09 — runtime, cross-platform and final parity
- **First gate/surfaces:** discover and admit the final runtime/package/platform surface; no callable API or module is assumed. Inspect the completed R01–R08 repository state and existing tests first, then edit only surfaces justified by a freshly inspected gap.
- **Acceptance:** all prior focused suites, audits and compiler checks plus authorized process-isolated/runtime journeys must pass where available, **and** every applicable obligation in the full 18-family matrix must close with the required evidence. Report unavailable platforms and the unresolved broad-suite timeout rather than normalizing them away.
- **Ceiling:** commands alone cannot establish final parity; no FULL, standalone, cross-platform, live-service or release claim while any applicable matrix row lacks runtime evidence, and no publish, release, merge or real-data operation.

### Work-unit and GitHub handoff guardrails

- One bounded behavior per commit; keep tests and tracker evidence with that behavior. Pause, reforecast and split before 390 whole-candidate changed lines.
- Native review applies only when the user has enabled and owns the RDD transaction. Codex must not create, infer or consume review authority on its own.
- Never promote fixture/source inspection to runtime or FULL evidence. Use synthetic data only; no secrets, credentials, real user data, publication, or `.codegraph` inspection/modification.
- Before handing PR #30 back: confirm the remote branch contains both code and this tracker update; verify rather than invent exactly one type label and approved issue linkage; report CI state and the unresolved broad-test timeout; do not merge or release.
- The next Codex prompt must name only the first work unit above and no competing lane.

**Next work unit after the completed CI repair:** E3-R01 — versioned storage and migration foundation.

## Cross-platform CI repair — candidate verification

The branch started at `0a88b48e226758c897f151350ef4174f835e2bf5`, matching the requested SHA and GitHub Actions run `37211340841`. Ubuntu and architecture passed; macOS reported 35 failures in 672 tests and Windows was cancelled. The failing path was `coverageRanges` in `src/test/tdd-observation.ts`: Node V8 coverage reports file URLs through the resolved filesystem path while the execution proof retained the temporary-directory alias. The lexical `relative()` check therefore rejected valid scripts from the isolated candidate on macOS. The isolation assertion itself was correct.

The bounded fix captures the isolated worktree's canonical root with `realpathSync` while it exists and uses that root only to interpret coverage file paths after the temporary worktree has been removed. The existing relative-path, absolute-path, and resolved-target checks remain active. `tests/tdd-coverage-path.test.ts` runs a complete coverage observation through an aliased temporary root. Before the fix, the regression failed with `Node coverage script is outside the isolated candidate`; after the fix it passed and verified positive coverage for the candidate behavior file. Existing outside-path rejection checks remain in the adjacent suite.

Observed local evidence: `npm exec -- tsx --test tests/tdd-coverage-path.test.ts tests/tdd-refactor-completion.test.ts tests/tdd-strict-triangulation.test.ts` — 18/18 passed, zero skipped; `npm run typecheck` — PASS; `npm run audit:upstream-boundary` — PASS (332 tracked or exact pre-staging paths); `npm run audit:parity` — PASS (500 IDs, 350 P0 contracts, six-pass 6/6, reverse audit clean). `git diff --check` — PASS. Remote CI run `37212895776` on repair commit `ef5679ec49d7b35d08a4427d3c72603a8dea9ba4`: architecture, Ubuntu, macOS and Windows all completed with `success`. The configured workflow ran `npm run check`; this status records that workflow result and does not relabel the separately recorded historical broad-suite timeout as resolved.

## E3-R01 — versioned storage and migration foundation

Implemented explicit `PRAGMA user_version` schema state and a version-ordered migration list in `SqliteMemoryStore`. Existing database files are snapshotted with SQLite `VACUUM INTO` before each migration. `BEGIN IMMEDIATE` serializes competing openers; the version is re-read while holding the write lock, and migration DDL plus version advancement commit atomically. Failures roll back and close the opening connection. Reopening a migrated store is idempotent. A future version is rejected before schema mutation. Synthetic malformed-schema failure and repair/reopen exercise recovery; two worker threads exercise simultaneous opens and writes.

RED/GREEN: `tests/memory-migrations.test.ts` first failed 3/3 against the prior runtime (missing schema version, accepted future version, and migration DDL left behind on failure). After implementation, the suite passed 4/4, including preserved row/backup checks, restart idempotence, future-version no-mutation, rollback/recovery, and concurrent open serialization. The fixture assertions establish runtime behavior only for these synthetic SQLite cases. `registry/parity/*` remains SOURCE_INSPECTED contract evidence, not runtime proof.

Observed verification: `npm exec -- tsx --test tests/memory-migrations.test.ts tests/memory-persistence.test.ts tests/memory-durability.test.ts tests/memory.test.ts` — 9/9 passed, zero skipped; `npm run typecheck` — PASS; `npm run audit:memory-parity` — PASS and explicitly reports no runtime parity claim; `npm run audit:upstream-boundary` — PASS (333 tracked/exact pre-staging paths). These are focused checks, not a report that the historical broad `npm test` timeout is resolved. No real user store was migrated. E3-R01 is complete; proceed to E3-R02 only after this unit is committed and pushed.
