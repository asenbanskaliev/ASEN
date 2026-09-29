# Upstream memory strict behavioral parity

## Goal

Implement local-first persistent memory parity for ASEN after the Skill parity chain, using ASEN-owned names and paths while matching observable storage, project/session isolation, retrieval, lifecycle, recovery, relationship, and operational behavior.

## Sequencing

- Finish GSP-02 through GSP-06 before memory source implementation.
- Memory planning and frozen provenance may proceed now; runtime implementation starts only after the Skill chain is complete and verified.
- Memory work is a separate feature branch chain based on the final Skill-parity slice.

## Product decisions

- Local SQLite is authoritative; cloud is never required for local operation.
- Default database: `~/.asen/memory.db` (Windows: `%USERPROFILE%\.asen\memory.db`).
- Optional absolute override: `ASEN_DATA_DIR`.
- Project identity config: nearest `.asen/config.json` inside the enclosing Git root.
- Support `project`, `personal`, and `global` scopes; default to `project`.
- Preserve existing ASEN memory IDs and data through versioned migrations.
- Persist curated observations, prompts, sessions, summaries, relationships, lifecycle metadata, and provenance; do not persist raw transcripts or arbitrary tool output by default.
- Redact private content before hashing, size limits, indexing, or persistence.
- Include local core, Pi-native tools, library API, minimal CLI, local HTTP/MCP adapters, doctor, and export/import in strict local parity.
- Defer TUI, Git synchronization, and cloud replication until local parity is complete; they never gate local memory correctness.
- Use Pi Free for model-backed lifecycle and compaction verification.
- External source identifiers belong only in a dedicated provenance manifest covered by a narrow boundary exception.

## Current ASEN baseline

- `src/memory/sqlite-store.ts`: SQLite WAL, project/session columns, basic ID upsert, FTS triggers, restart repair, project-filtered content search.
- `src/memory/context.ts`: basic remember/search wrapper, not a full context API.
- Tests cover restart persistence, basic project search isolation, ownership mismatch by ID, and FTS update/rebuild.
- CAP-MEM-001 and CAP-MEM-002 remain `specified`.

## Tasks

- [ ] MEM-01 — Freeze the upstream local-memory contract and add an honest parity matrix.
  - Record exact source commit, local core documents, hashes, public tool contracts, and intentional cloud/TUI deferrals.
  - Replace broad memory parity claims with observable FULL/PARTIAL/MISSING evidence.
  - Add a validator that rejects unsupported FULL claims.
- [ ] MEM-02 — Add schema v1, versioned migrations, connection safety, and compatibility import.
  - Tables: projects, sessions, observations, observation FTS, user prompts, prompt FTS, relations, and schema metadata.
  - Reject future schemas without mutation; make migrations idempotent and transactional.
  - Preserve current ASEN rows, IDs, project/session association, and content.
  - Add WAL/local-filesystem checks, busy timeout, bounded writer retry, and concurrent-open tests.
- [ ] MEM-03 — Implement canonical project identity and persistent sessions.
  - Resolve validated explicit project, existing session, nearest `.asen/config.json`, stable Git/worktree binding, child project, then basename fallback.
  - Fail closed on ambiguity, invalid config, collisions, or unwritable binding.
  - Start/end sessions with canonical directory, ownership, lease, summary, and terminal state.
  - Reject non-mutating cross-project and missing-session writes.
- [ ] MEM-04 — Implement observation lifecycle and privacy.
  - Structured title/content/type/scope/topic/provenance fields.
  - Topic-key upsert with revision count; exact duplicate suppression.
  - Partial update, soft delete, hard delete, pin/unpin, and typed failure envelopes.
  - Private redaction and UTF-8 byte limits before persistence and indexing.
- [ ] MEM-05 — Implement retrieval and context.
  - Weighted FTS over title/topic/content, safe query parsing, all/any matching, short-term fallback, filters, previews, and limits.
  - Project-scoped get/search by default; explicit all-project reads only.
  - Context, timeline, recent items, pins, prompts, stale-review state, and total UTF-8 context budget.
- [ ] MEM-06 — Implement relationships and memory review.
  - Conflict candidates after save; pending relationship records.
  - Judge/compare with related, compatible, scoped, conflicts-with, supersedes, and not-conflict outcomes.
  - Cross-project guard, provenance, stale review, mark-reviewed, and deleted-target rendering.
- [ ] MEM-07 — Integrate ASEN and Pi lifecycle.
  - Pi-native save/search/context/get/update/delete/session/summary/timeline/pin/review/judge/compare/doctor tools.
  - Bind writes to the actual Pi runtime session; never trust a model-supplied replacement session ID.
  - Curated passive capture from explicit key learnings; no transcript sink.
  - Prompt capture is best-effort and separately stored; automated artifacts can disable it.
- [ ] MEM-08 — Implement compaction recovery and operational safety.
  - Persist structured session summary exactly once before/after compaction according to confirmed/failed/unknown/unavailable outcomes.
  - Unknown outcomes never replay blindly.
  - Memory failure must not suppress the user's final response.
  - Doctor/repair, integrity and FTS checks, backup, atomic versioned export/import, and safe rollback.
- [ ] MEM-09 — Add local interfaces and complete strict verification.
  - Thin library, minimal CLI, local HTTP, and MCP adapters over one memory core.
  - Unit, migration, integration, multi-process, security, restart, corruption, and Pi Free lifecycle tests.
  - Promote CAP-MEM-001/002 and parity rows only after exact automated evidence; keep cloud/TUI/sync deferrals explicit.

## Required adversarial evidence

- New, legacy, repeated, concurrent, and future-schema startup.
- FTS consistency after every mutation, migration, restart, and repair.
- Ambiguous/colliding projects, worktrees, child projects, corrupt configs, and cross-project writes.
- Missing/ended/foreign sessions and competing live leases.
- Duplicate and topic-key races.
- Invalid search syntax, short terms, scope filters, and total context budget.
- Private content in prompts, observations, passive capture, and compaction summaries.
- Relationship and review attempts across project boundaries.
- Failed, unknown, and interrupted writes/imports/compaction without blind replay.

## Acceptance criteria

- Every write resolves and validates canonical project and runtime session before mutation.
- Search/context are project-scoped by default and progressively disclose full content.
- Migrations preserve existing ASEN memory and never partially apply.
- Local memory remains usable without cloud, Git sync, TUI, MCP, or HTTP processes.
- Pi Free proves session start, curated save, search, summary, shutdown, restart, and compaction recovery.
- Capability and parity claims match exact evidence rather than table/file presence.

## Audit evidence

- Frozen upstream analysis identified SQLite/FTS as local authority with sessions, observations, prompts, relationships, topic upserts, dedupe, scopes, lifecycle review, project detection, compaction hooks, doctor, and multiple thin interfaces.
- ASEN currently implements only the basic SQLite/FTS persistence subset; project detection, persistent sessions, full context, relations, compaction integration, operational repair, and public interfaces remain partial or missing.
