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
  - Preserve current rows, external IDs, project/session association and content. Human selected literal-future-crud: compatible future-version stores open and allow reads/writes while skipping startup migrations, matching pinned source. Do not add unrequested future-version rejection or read-only policy; malformed/incompatible data still follows source-backed errors.
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
- Independent verifier muqvs7d5-k-s0n8 returned FAIL: all authorized commands passed (focused 9/9, memory audit, boundary 313 paths, Skills 27, historical Skill parity 12, capability parity 500 IDs/350 P0/6-of-6, typecheck and diff check), but source inspection found substituted repository+URLs and core-source reassignment to the Pi target both accepted. Boundary derives its extra forbidden name from this unanchored repository. Final status showed no unexpected mutation. Green commands do not override this blocking provenance defect.
- Bounded correction is required before any native review: independently pin public repository identity, require all seven core-snapshot source tuples to target core, protect standalone boundary marker derivation and add adversarial regression tests with observed meaningful RED/GREEN. Forecast 50–90 extra diff lines over the 261-line unit, stop/reforecast before 390 combined source churn. Only the existing six candidate paths are eligible; task document remains separate.
- No install, download, global configuration change or dependency upgrade occurred; the existing Pi SDK remains a compiler fixture, not runtime-parity proof.
- Foundation scout muqv4jnn-h-igiw plus one parent source spotcheck confirmed upstream internal schemaVersion=1, unrelated to release major 3. Readable future-version databases conditionally open successfully while startup migrations/repair/stamping are skipped; WAL/instance/file preparation precedes version checking. Public future-version write guards still need inspection. Reject-before-mutation was only a proposed stricter policy and is NOT adopted or equivalent. E3-01b must freeze these distinctions before storage implementation.
- Correction writer muqz7rjz-l-fc9i completed: immutable public repository checksum pin, all seven sources bound to core, boundary validation before marker derivation. Observed semantic RED 3 failures/8 passes then GREEN 11/11; self memory/boundary audits, typecheck and diff check PASS. Six-file source candidate now 302 additions/14 deletions = 316 diff lines. No staging or commits. These are writer checks, not an independent verdict.
- Future CRUD scout muqz9z4q-m-8d4j traced Get/Add/Update/Delete/transaction/sync-queue paths: compatible future-version stores allow reads and writes without schema-version guards. This is source inspection, not runtime proof. Human explicitly selected literal-future-crud (memory decision 13663); synthetic tests only, no real-store operations authorized.
- Independent repeat returned FAIL despite focused 11/11 and all audit/type/diff/status checks PASS: top-level limitations=[] is accepted. Original repository/channel substitutions are now blocked. Independently counted 315 churn (+301/-14), versus worker 316 due final-line counting; preserve this distinction.
- Parent targeted source read also identified inherited target-anchor keys and coercible non-string IDs as narrow regression candidates. Next correction is limited to the validator and its existing test, forecast 25–55 extra diff lines, combined source unit below 390. Observe RED then GREEN and repeat independent review before native freeze. No review transaction is currently bound.
- Next schema correction passed self 12/12 and fixed empty limitations/inherited or non-string IDs. Independent review confirmed those guards, but found coerced array-valued source paths and invalid family titles still accepted. All commands pass; source verdict remains FAIL. Current independent count is 259 new logical lines plus tracked +53/-14 (326 logical churn; worker 328 with final-line differences).
- Complete the same bounded validator/test correction by enforcing primitive canonical source paths and trim-nonempty titles, with regression RED/GREEN; keep combined source unit below 390. Whitespace-only displayed strings need explicit negative controls where the schema promises nonempty content. Empty facts arrays remain allowed.
- Native review follows only after normalization and no blockers. Do not launch another source writer while review is bound to this candidate.
- Final scalar correction observed two targeted test-first failures followed by 12/12 PASS, all self checks PASS. No separate Strict TDD activation exists; worker template activation prose is not lifecycle evidence. Final independent verifier PASS: focused 12/12, memory/boundary/Skills/Skill-parity/capability audits, typecheck, diff check, unchanged status and no severe causal source finding. Current six-file source unit is 337 native diff lines; split-entry counts are not diff counts.
- Native review review-9d31856e1f6c1beb approved the exact six-file candidate, medium, one review-reliability lens. Target sha256:3559e05635e2388893ea7949c22ce2e4589032d7cab2090bee33fe47317912db; tree a662b10686942648999501d205fc48d5cc056b8c. Exact acknowledgement succeeded and burned authority at revision sha256:de2c6b93e50f7fb12f3ca3d093dbb113dd580614bf8900ab2f811dabf9416419. Do not issue further status/review operations for that burned transaction.
- Informational nonblocking follow-ups: R3-null-target-crash (validator line 70) and R3-unpinned-family-claims (lines 103–105). These do not reopen the approved candidate; address in separate later scoped work and keep reference-only prose distinct from verified behavioral evidence.
- Human permission decision `13674` (`authorize-memory-reference-local-commits`) authorized the two local checkpoint commits only, without push/PR/merge. The independently and natively reviewed 337-line E3-01a reference-only source unit is established in commit `d91ff1ff65b6b8483a79ad93092b84d2b8a1d23b` (tree `a662b10686942648999501d205fc48d5cc056b8c`). This checkpoint adds no datastore runtime behavior; native acknowledgement metadata remains distinct from Git history.
- E3-01b1 map mur27hux-t-de98 completed. Eight cases cover absolute path preflight, known remote rejection, unknown filesystem acceptance (not proved local), constructor/pragma/persistent-WAL ordering and retry schedule, internal schema 1 stamping/reopen, future-compatible CRUD with startup skip, migration lock/version reread/generation fencing, and connection cleanup. Structural fixture checks are not ASEN runtime equivalence.
- Fresh source verifier confirmed feature HEAD 44149b8427489240e93985d7906ee50f55375a8a and core cache 15a2f78885d7ad8ced23b2d1d88383e9bb472c17. Five raw byte/hash tuples for store.go, startup_gate_test.go, filesystem_policy.go, generation_fence.go and migration_lock.go are in memory observation 13679 and feed this fixture.
- Initial/final status contains only excluded untracked .codegraph/. Preserve it untouched and uninspected; do not stage it, infer provenance or claim the entire worktree is clean. The verifier performed no mutation.
- Before the sole E3-01b1 writer: reconcile this document, full mirror and TODO. Source edits: new foundation JSON plus scripts/audit-memory-parity.mjs, tests/memory-parity-reference.test.ts and scripts/audit-upstream-boundary.mjs. Reuse the existing command; no package change, new validator program or engine write. Preserve E3-01a guards and all 18 MISSING/PARTIAL statuses. Documentation needs no fake RED; runnable validation guards use observed test-first controls.
- E3-01b1 writer returned partial: structural guards observed RED 3 then GREEN 16/16, type/diff checks PASS; boundary FAIL because the now-tracked task filename contains the forbidden reference token. Independent diagnosis also requires exact per-case source/range citation pins, especially direct CRUD evidence for FND-06. Current source unit 222 additions/4 deletions; task-inclusive candidate 228 additions/5 deletions. No engine changes or native review start.
- Human decision 13687 authorizes bounded local checkpoints for E3-01b1 only. The passive neutral tracker relocation to `odd/tasks/memory-v3-parity.md` preserves Git history and references through the canonical registry and foundation metadata. External project-memory observation `13639` and its stable topic remain unchanged; the parent updates only its mirror locator after this checkpoint. No broad boundary exemptions. Then correct citation guards and repeat independent/native checks before the source checkpoint. No push, PR, merge, main changes or real-store operations.
- This relocation is based on checkpoint parent `44149b8427489240e93985d7906ee50f55375a8a`; its resulting commit identity is recorded externally rather than self-referenced here. The first approved reference source baseline remains `d91ff1ff65b6b8483a79ad93092b84d2b8a1d23b`, with no new runtime behavior. The four-path E3-01b1 foundation source delta remains pending and outside this documentation checkpoint.
- E3-01 remains open. No major source contract family is closed; all 18 matrix families remain MISSING/PARTIAL. Neither this reference-only checkpoint nor the new structural fixture proves full memory parity.

## Latest checkpoint — E3-01b1 foundation slice complete

E3-01b1 is complete as a source-inspected reference slice. The four reviewed source paths are preserved in local commit `c20dc6422696bd5fb99c978007efc083267777be` (parent `e71b5903bf4c79b26f82e6f140562c570f8d8b24`, tree `394e758d42cbe37353a2b9381b608b4c1837b820`). The commit contains 240 insertions and 4 deletions, 244 changed lines total. Human decision `13687` supplied permission for this local checkpoint only; native acknowledgement was review evidence, not Git permission. Human stop instruction `13690` requires saving this checkpoint and doing no further unit today.

Verification of the exact four-path candidate completed before the commit: the focused reference suite passed 16/16; the memory audit, boundary audit over 315 paths, 27-Skill audit, historical Skill parity audit 12, capability audit over 500 IDs and 350 P0 rows with 6-of-6 coverage, typecheck, diff check, and final status all passed without unexpected mutation. The fixture contains eight case facts backed by 21 exact source/range citations and retains the five frozen source hashes recorded in the prior checkpoint. These are structural source-inspection facts, not ASEN runtime-equivalence proof.

Native review `review-b090500595363159` approved the exact four-path, 244-line candidate at tree `394e758d42cbe37353a2b9381b608b4c1837b820`; its recorded target begins `3fb1f141` and consumed revision begins `0008fb55`. The acknowledgement burned that authority. It must not be queried, reopened, recaptured, or treated as permission for another commit.

The boundary failure from the earlier tracker name is resolved by the neutral tracker path at parent `e71b5903bf4c79b26f82e6f140562c570f8d8b24`; original reference identities remain available through registry metadata links and the historical checkpoint records. No broad exception was added. Historical limitations and follow-up advisories remain in force. The selected `literal-future-crud` behavior also remains a source-backed contract decision only: compatible future-version stores permit CRUD while startup migration is skipped, but the minimum runtime fixture and synthetic runtime proof are still pending.

E3-01 is still open. All 18 major matrix families remain MISSING/PARTIAL; this slice closes none of them as a complete behavior family and does not authorize starting the storage engine work.

### Resume handoff

1. First reconcile this tracker with the complete canonical project-memory mirror `13639`; then confirm the expected feature branch, documentation HEAD `5a660190940515e16773bd5dae0194665d630d8b` with source parent `6e37637ad669d40ae6951b3f7197b07865817e02`, unchanged observation-contract source bytes, ignored dependency junction, SDK 0.87 compile-fixture status, and untouched/excluded `.codegraph/` state.
2. Re-run the focused 16-test reference suite, memory and boundary audits, Skill and capability audits, typecheck, and diff/status checks before relying on this checkpoint. Do not install dependencies, inspect real data, migrate a store, use external services, or infer runtime proof from the compile fixture.
3. Map the remaining granular E3-01b tool, API, session, save, retrieval, event, privacy, and transport contract gaps read-only. Choose the smallest next source slice before assigning a writer. Preserve one writer at a time and all MISSING/PARTIAL statuses that lack complete evidence.
4. Only after E3-01 dependencies are closed should planned E3-02 storage work begin. The next runtime evidence must use synthetic stores and include the pending minimum-runtime fixture; no remote grant, live account, publication, or real-data operation is authorized.

No background task or additional unit remains active at this stop. The documentation checkpoint's own commit identity was recorded externally after commit; the resume handoff now identifies it explicitly.

## Controlled acceleration plan

The user authorized deeper acceleration analysis followed by plan adjustment without reducing controls. Settled read-only analysis `mur8yx0a-4-1lkf` identified repeated source interpretation, semantic correction loops and evidence handoff overhead as practical targets. No measured throughput or completion estimate is available; proposed gains remain hypotheses until observed.

### Dependency gates and order

- Retain the full E3-01 source/behavior contract gate before E3-02. Closing individual fixture slices does not close a major behavior family or permit early engine work.
- E3-01b2 is closed only as the independently verified, natively approved source-inspection slice recorded below. Its passive documentation closure is intentionally a separate commit and tree.
- [ ] E3-01b3a — In progress: six retrieval/search source contracts in `registry/parity/memory-retrieval-search-contracts-v1.json`: ID retrieval versus project-filtered search, all/any quoting, short literal LIKE, default/configured limits, preview/full read, and deleted/optional metadata. Extend only the existing memory audit, reference tests and exact boundary entry. Read-only verifier `murb2hbo-e-et7e` confirmed all five canonical Git `commit:path` byte/hash tuples, persisted in record `13720`; use explicit `git_blob` representation and preserve historical checkout pins. Independently anchor exact implementation citations and structured critical facts. Observe semantic guard RED/GREEN; source forecast 270–340 diff lines, task-inclusive below 390, splitting rather than compressing if needed. Whitespace SQLite outcomes, live envelopes and read-side persistent activity remain unproved. No engine mutation, new model choice or FULL promotion.
- [ ] E3-01b3b — Freeze context and timeline contracts only after E3-01b3a. Runtime whitespace, FTS behavior, configuration overrides, live envelopes, and read-side effects remain pending.
- [ ] E3-01b4 — Freeze project-identity contracts for E3-03 after retrieval. Existing read-only maps cover process/config/Git/worktree/child-directory detector source behavior; session/store resolution, binding helper internals and ambiguity recovery remain gaps. These maps do not prove runtime parity or a complete project family. Session registration for E3-04 remains separate.
- After E3-01 closes, the implementation critical path is E3-02 storage, E3-03 projects, E3-04 sessions, E3-05 save, E3-06 retrieval, E3-09 actual work timing, E3-10 Pi lifecycle and E3-11 recovery. E3-07 capture and E3-08 relations retain their dependencies and obligations.
- Keep operational work E3-12 through E3-17 in later dependency-gated lanes: backup/repair after storage and identity; export/import after durable identities, revisions, prompts and relations; Cloud after local queue/export semantics; external interfaces after the core/host lifecycle; views after APIs/retrieval; packaging/platforms after runtime integration. Every lane still feeds comparative closure E3-18.

### Concurrency and reusable handoffs

- At most one repository writer and two read-only scouts, with distinct questions and non-overlapping source regions. Scouts must avoid mutable candidate files belonging to the active writer. Parallel write worktrees require explicit human consent.
- Prepare retrieval and project-identity research in parallel with the current independent review. Consume settled results only; no polling, duplicate mapping, speculative task fan-out or execution of upstream code.
- Each handoff identifies the source commit, exact paths/ranges and hashes, structured critical facts, contradictions, limitations, unresolved inputs, allowed edit surfaces and diff forecast. The writer additionally reports semantic RED/GREEN, actual checks, candidate paths and counts.
- Reuse existing case tables and validation/test helpers where duplication is demonstrated. Do not add a generic framework, compress readable evidence or derive expected anchors from mutable fixture input.

### Checks and unchanged controls

- Every writer performs applicable focused tests, memory and boundary audits, typecheck, diff/status checks and actual risk assessment routing. Meaningful semantic RED must precede GREEN for testable guards; passive documentation has no invented RED.
- Add independent verification whenever native assessment requires it, including high or unassessable risk. Native review is candidate-bound and separate from functional verification and Git permission. Do not re-review a burned exact candidate gratuitously.
- Run broader functional regressions at actual storage, extension, lifecycle and packaging boundaries. Avoid unsafe blanket `check`/pack commands; scoped checks are not evidence for unexecuted integration behavior.
- Maintain readable units below 390 changed lines, exact immutable provenance anchors, one writer, synthetic data, full task/mirror reconciliation and Pi Free for model-backed verification. All 18 major families remain MISSING/PARTIAL until their applicable obligations close.
- No implicit commits, publication, main changes, PR/merge, real-data operations, installations, Cloud enrollment, model changes or provider consent. Optional services and platforms remain included, not silently deferred out of scope.

Success signals are fewer repeated source interpretations and semantic correction loops, complete first handoffs, checks proportionate to actual changed surfaces, no overlapping writers and no hidden pending evidence. No new product decision is needed for this immediate schedule.

## E3-01b2 observation-write checkpoint

E3-01b2 is closed as a source-inspected reference slice in local commit `6e37637ad669d40ae6951b3f7197b07865817e02` (parent `48510c0a18691cb0b089dd5999f6d0011c0fc694`, tree `8e10229615de563d92f66f14ee0ed52f4b639b5a`). Its exact five-path candidate contained 287 insertions and 7 deletions, 294 native changed lines: 249 source lines plus this earlier planning document. The JSON contributes 97 lines and records five cases, three pinned sources, and 24 ordered source/range tuples.

The initial writer observed three semantic guard failures before correction. The citation correction then observed RED 1/21 and GREEN 21/21; independent verification passed 21/21 plus the memory audit, boundary audit over 317 paths, typecheck, diff, and status checks. Native review `review-9bdbb764c9ce79ec` approved the exact five-path tree; acknowledgement consumed revision `67fd72dee9ef96fa0391e19be18119c7640a1a6b6c36e07b95c82a9bfe22bb68`. The burned acknowledgement was review evidence, while human decision `13718` separately authorized the two local checkpoints.

Nonblocking advisory R3-unpinned-narratives at `scripts/audit-memory-parity.mjs:153` remains informational. Narrative text is not an immutable verified fact; a later scoped follow-up may address it without reopening or correcting this candidate.

A helper investigation found `core.autocrlf=true` can expand checkout bytes without mutating Git content: `relations.go` was 61,191 raw bytes versus 59,527 canonical bytes, and the batch helper was 10,116 versus 9,798. External record `13717` retains the exact helper paths/ranges and raw/canonical hashes. Future E3-01b3 work must adopt the canonical Git-blob policy above, freshly hash all five sources, and must not repin old metadata or mix representations.

E3-01 remains open. All 18 major families remain MISSING/PARTIAL, no engine output or FULL claim is promoted, and the source-only critical guards do not prove runtime behavior. The next work is E3-01b3a retrieval/source contracts, then E3-01b3b context/timeline, then E3-01b4 project identity; no new candidate starts in this checkpoint.

## E3-01b3a candidate checkpoint

Worker `murbhxtl-f-75br` completed the six retrieval/search source contracts with five explicit canonical `git_blob` pins and exact immutable evidence/critical guards. The semantic mutation test observed RED 1/23: all 14 altered contracts were initially accepted by a minimal validator stub. GREEN passed 23/23 with zero skips after guard implementation. Focused tests, memory audit, boundary audit (318 paths), typecheck and diff checks passed. The new JSON contains 126 logical LF lines; source churn is 288 and the initial task-inclusive candidate is 294 lines. No engine, database, model or commit changes occurred.

Native assessment was unassessable because untracked scope was undeclared, requiring independent high-risk fallback verification. Verifier `murbxaim-g-e8cf` returned PASS with no candidate-caused severe findings: actual 23/23 tests with zero skips, memory/boundary audits (318 paths), typecheck, diff and unchanged-status checks passed. All five canonical Git-blob pins were independently reproduced; source semantics and immutable guards matched the cited implementations. The verified candidate contains 288 source and 12 tracker diff lines, 300 total. Parent spot-check confirmed canonical source identities, helper citations and explicit unproved outcomes. Native review is next; this is not runtime parity. Whitespace SQLite outcomes, live transport envelopes, configured-limit execution, read-side persistence/privacy and context/timeline remain pending. E3-01b3a is still unchecked until verification, review and separately authorized local closure complete.

## Resume checkpoint

The user's subsequent continuation instruction resumes memory-first work. Read-only verifier `mur899gm-1-vj5j` confirmed the documentation HEAD and source parent above, exact source tree, clean index, and unchanged status containing only excluded `.codegraph/`. Focused tests passed 16/16 with no skips; memory, boundary (316 paths), Skills, Skill-parity and capability audits, typecheck and diff checks all passed. Line-ending warnings produced no tracked changes. This remains source-inspection and compile-fixture evidence, not runtime parity.

Read-only mapper `mur8a4kw-2-qafx` completed the five-case E3-01b2 observation-write map against the three previously pinned core implementation files. The parent selected this bounded reference-only slice; no unresolved product choice was reported. A targeted parent source check confirmed the guarded deletion wrapper coexists with an unguarded library entry point; the fixture must distinguish them and must not imply every library deletion requires an ownership assertion. Queue invocation must also be distinguished from durable enrollment-dependent queue insertion. Source worker `mur8l1wt-3-nrvv` finished E3-01b2: five cases, three pinned sources and 23 exact evidence tuples. Observed semantic RED was 3 failing guard tests with 17 passing; GREEN was 20/20. Writer memory, boundary (317 paths), Skills, Skill-parity and capability audits, typecheck and diff checks passed. Source churn is 238 logical diff lines; the initial task-inclusive count was 249. These are writer checks, not independent approval. Native assessment was unassessable because intended untracked scope was undeclared, requiring high-risk fallback verification. Independent verifier `mur92iyz-5-v8bq` returned FAIL on one exact-citation defect: OBS-05 asserts conditional HTTP authentication, but its route citation at server lines 431–439 omits the implementation at lines 146–180, which also lies outside the declared server range. Other inspected semantics matched; independent 20/20 tests and all scoped checks passed, including the updated plan's boundary/diff checks. The candidate counted 238 source and 41 tracker diff lines, 279 total. The next sole correction writer is limited to the observation JSON, immutable audit anchors and existing reference tests: cite the implementation, expand only the declared source range as needed, and observe missing-helper semantic RED/GREEN. Forecast 15–35 additional source diff lines; no behavior or scope change, and no native START before the blocker closes. No source writer remains active at this recorded transition.

Correction worker `mur9b7n9-8-uj3i` subsequently pinned the authentication implementation at server lines 146–180 while preserving the route tuple and expanding the declared server range to 146–929. Exact evidence tuples increased from 23 to 24. The missing-helper regression observed RED 1/21 followed by GREEN 21/21; missing, altered and out-of-bounds helper citations are rejected. Focused tests, memory/boundary audits (317 paths), typecheck and diff checks passed. The corrected candidate counts 249 source and 290 initial task-inclusive lines. Parent semantic spot-check confirmed the implementation and route citations coexist with unchanged conditional-auth and unguarded-library facts. Fresh independent correction verifier `mur9m2qy-b-ll59` returned PASS: actual 21/21 tests, memory and boundary audits (317 paths), typecheck, diff and status checks passed. The prior unaffected Skill/capability checks remain valid. Source churn is 249; the verified task-inclusive candidate was 294 diff lines. The missing implementation-citation blocker is closed, with all 24 ordered tuples protected. Native review is next; no completion or runtime-parity claim yet.

Previous checkpoint commit permissions are consumed. No new commit, publication or real-data operation is authorized by this progress record.
