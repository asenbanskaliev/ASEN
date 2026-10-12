# ASEN runtime tools and registry lifecycle

These interfaces are registered by the shipped primary extension (`asen/extensions`). They are bounded implementations, not complete ecosystem parity. The current claim registry remains authoritative; local fixtures do not establish all-platform host behavior.

## User interaction

`asen_ask_choice` accepts a question, optional header, and two to four options. Each option has a label, optional description/preview and a unique value. `ask_user_choice` is the canonical compatibility alias: it uses the same strict input checks, excludes `preview`, and reports the selection index starting at one. The ASEN-named tool keeps its existing zero-based index.

`asen_ask_question` accepts one to four questions. Each has a question, header and two to four labeled options; `multiSelect` is optional. `ask_user_question` is registered as a compatibility name and currently uses this ASEN input and result shape; exact canonical result translation is still pending. A cancelled questionnaire discards all partial answers. Custom free text, where explicitly enabled by the choice contract, is validated and remains data. Neither tool issues permissions or a write grant.

The native Pi select/input primitives carry interaction. Offline Linux RPC choice/cancellation has been tested with zero model turns. Full TUI/questionnaire presentation and integration with genuine human-only mutation consumers remain open. Timed-out hosts that ignore abort stay quarantined until the old dialog settles.

## Code intelligence

The canonical `codegraph` tool matches the upstream extension contract. It accepts `operation` (`init`, `query` or `explore`), an optional integer `limit` from 1 to 20 (default 10), and a nonempty query of at most 2,000 characters for query/explore. `init` is the only operation that may create or update `.codegraph`, and it runs only when explicitly requested; query/explore never initialize or retry automatically.

`asen_code_intelligence` remains the read-only compatibility contract. It accepts only `query` or `explore`, requires the query, preserves its existing bounded statuses, and cannot initialize an index. Both tools require the current working directory to be the canonical Git project root. Home/temp roots and nested working directories are rejected. Both check existing `.codegraph` entries with `lstat`; symbolic links and non-directories are rejected without reading index contents.

Both names share hardened execution. The host resolves an installed CodeGraph executable; on Windows, npm package metadata resolves a contained JavaScript entry through Node rather than executing cmd/PowerShell shims. Processes use separate arguments, a constrained environment, no shell, bounded duration and bounded output. Queries follow `--`, so they remain one literal argument. Canonical output is truncated with an explicit marker; canonical failures include operation, workspace and fallback metadata. Compatibility failures remain sanitized and do not expose subprocess error output.

Tests use injected subprocesses and disposable Git fixture projects, including spaces/Unicode paths, hostile queries and unsafe synthetic index entries. No canonical `init` is invoked against an ambient workspace. Real CLI/version compatibility, initialization against a disposable real-CLI project, and cross-platform host behavior remain open. The installed CLI is trusted local code; this is not OS confinement. Existing authority gates still determine whether a tool may execute.

## Skill registry lifecycle

Startup refresh reuses `.asen/skill-registry.md`, its existing cache and optional memory mirror. Source precedence remains project, user, then package scope. Discovery does not alter mandatory behavior-Skill selection.
Repeated activation through the same loaded module and Pi host registers only one startup hook; separate copies loaded through different module paths still require real-host validation.

Interactive hosts watch existing source roots recursively, debounce changes and serialize writes per canonical project. Changes during refresh coalesce into a follow-up refresh. Project switching/shutdown invalidates old callbacks; shutdown closes watchers, cancels scheduled refresh and waits for in-flight work. Unsupported watchers produce a diagnostic and leave manual refresh available. Missing or recreated source roots may require manual refresh or restart.

Disable automatic startup/watch with either of:

- environment variable `ASEN_NO_SKILL_REGISTRY=1` (`true`, `yes` and `on` also apply);
- Pi `--no-skills` or `-ns`.

ASEN does not register a separate CLI flag because Pi's public extension API has no complete flag inventory for collision checks.

`/asen-skill-registry refresh` remains an explicit manual command. Startup/watch failure is diagnostic; it does not cancel the user's final response. Local native Linux watch invalidation, restart generation, shutdown, disable and project isolation are tested. Real all-platform Pi startup/restart journeys remain open.

## Primary installation and child policy

The Pi package manifest selects `extensions/asen.ts` explicitly. `extensions/authority.ts` is a private, hash-pinned policy loaded explicitly by the existing child runner; ordinary installation must not apply it to the primary session. `verify:pack` installs the actual tarball with the optional peer omitted, asserts that the peer is absent, then loads the tarball through the real Pi SDK resource loader and rejects accidental child-policy activation. This offline registration check does not execute tools or models, and does not prove complete ecosystem integration.

## Public Pi command boundary

The production factory accepts the declared Pi range `>=0.85.1 <2.0.0` and validates its public registration APIs before adding a bootstrap session handler. Pi does not provide mode or initialized command/tool inventories to the factory, so ASEN follows the normal delayed-activation policy: at the first `session_start`, after Pi initializes those public inventories, ASEN validates the execution mode and complete command/tool snapshot before its first command or tool mutation. Missing, malformed or initially colliding inventories fail closed and may retry on a later session; a host error after partial registration leaves those handlers inert and requires a Pi reload. This preserves ASEN's initial collision preflight, not an arbitrary late-registration veto.

After that initial snapshot, foreign extensions that register duplicate names are governed by Pi's native precedence and disambiguation behavior. Pi exposes no public registration interception or complete flag inventory, so ASEN neither guarantees a late sibling veto nor registers a private CLI flag. Command, tool and event handlers still validate the public execution context mode (`tui`, `rpc`, `json` or `print`) before running. Prior packed-artifact checks on Linux exercised real Pi `0.85.1` and `1.1.0` CLIs with seven visible RPC commands, four canonical tools, and zero model calls; the current candidate's expanded command list is verified separately by `verify:pack`. Windows/macOS, clean exit across all four modes, and representative coverage of the full supported version range still need real-host validation.

The data commands publish through `ctx.ui.notify`; their production handlers fulfill Pi's `Promise<void>` contract. Internal `createAsenExtension` handlers retain their returned data for composition/tests. `/asen-route` accepts an exact JSON ODD fact record, binds the repository identity to the active canonical project, and displays a read-only route preview; it does not dispatch agents or issue write permission. `verify:pack` verifies actual installed registration and nine visible command results through offline Pi RPC with zero model invocations. It also seeds isolated Todo/workspace data, recovers a running Todo on session start, reads both projections, then starts a second real Pi process with the same named session and verifies the state and session filters remain intact. This installed-package restart journey passed on Linux; Windows/macOS runs remain required. Missing status, diagnostics, agents or changes providers remain explicitly unavailable; visible output does not establish automatic prompt-to-orchestration or full production ODD integration.

`/asen-changes` is filtered to the current session, canonical project and worktree. It flags a potential conflict when successive successful change records for one relative path name different actors. Windows and macOS comparisons fold path case to catch common case-insensitive collisions; this can conservatively report distinct names on a case-sensitive macOS volume. The append-only store has no content snapshots, so this is a review signal only: it does not prove a lost update, select a winner, clear a conflict, or authorize a write. The command does not inspect another session's changes. Authorized resolution and broader workspace actions are not implemented.

`asen_todo_update` requires an active Pi UI confirmation before moving a restart-blocked Todo back to `running`. A missing UI or declined prompt leaves the task blocked; an accepted transition records a fixed confirmation reason in the durable task history. This does not restart an external execution by itself; the user must still start or continue the corresponding work through its owning runtime.

Agent task delivery and project access: `asen_agent_status` accepts an optional `id` to return that owned task's durable state and history without its prompt or execution authority. Terminal notifications are scoped to the active owning session/project; old outcomes are not replayed at restart. The four agent tools accept optional absolute `root`. Launching in a different project requires affirmative Pi UI consent; subsequent status/cancel/continue calls need the same live permission. Session-manager changes and shutdown remove it, and continuation never reconstructs permission from saved records. Public tasks remain read-only; existing internally authorized write agents keep their separate pinned authority and attribution boundary. Session shutdown cancels owned active tasks across all projects launched by this runtime.

ODD task mirrors preserve their saved history: initial registration creates a record only when its task/candidate identity is absent. Re-registering that identity is rejected; resume the saved task or choose a fresh identity. Replay events use conditional memory writes so a newer saved record cannot be overwritten by an older plan. Neither operation restores execution permission.
