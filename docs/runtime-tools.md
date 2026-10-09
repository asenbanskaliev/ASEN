# ASEN runtime tools and registry lifecycle

These interfaces are registered by the shipped primary extension (`asen/extensions`). They are bounded implementations, not complete ecosystem parity. The current claim registry remains authoritative; local fixtures do not establish all-platform host behavior.

## User interaction

`asen_ask_choice` accepts a question, optional header, and two to four options. Each option has a label, optional description/preview and a unique value. An answered result contains the selected option; cancellation, timeout, unavailable host, invalid response and host failure have separate statuses.

`asen_ask_question` accepts one to four questions. Each has a question, header and two to four labeled options; `multiSelect` is optional. A cancelled questionnaire discards all partial answers. Custom free text, where explicitly enabled by the choice contract, is validated and remains data. Neither tool issues permissions or a write grant.

The native Pi select/input primitives carry interaction. Offline Linux RPC choice/cancellation has been tested with zero model turns. Full TUI/questionnaire presentation and integration with genuine human-only mutation consumers remain open. Timed-out hosts that ignore abort stay quarantined until the old dialog settles.

## Code intelligence

The canonical `codegraph` tool matches the upstream extension contract. It accepts `operation` (`init`, `query` or `explore`), an optional integer `limit` from 1 to 20 (default 10), and a nonempty query of at most 2,000 characters for query/explore. `init` is the only operation that may create or update `.codegraph`, and it runs only when explicitly requested; query/explore never initialize or retry automatically.

`asen_code_intelligence` remains the read-only compatibility contract. It accepts only `query` or `explore`, requires the query, preserves its existing bounded statuses, and cannot initialize an index. Both tools require the current working directory to be the canonical Git project root. Home/temp roots and nested working directories are rejected. Both check existing `.codegraph` entries with `lstat`; symbolic links and non-directories are rejected without reading index contents.

Both names share hardened execution. The host resolves an installed CodeGraph executable; on Windows, npm package metadata resolves a contained JavaScript entry through Node rather than executing cmd/PowerShell shims. Processes use separate arguments, a constrained environment, no shell, bounded duration and bounded output. Queries follow `--`, so they remain one literal argument. Canonical output is truncated with an explicit marker; canonical failures include operation, workspace and fallback metadata. Compatibility failures remain sanitized and do not expose subprocess error output.

Tests use injected subprocesses and disposable Git fixture projects, including spaces/Unicode paths, hostile queries and unsafe synthetic index entries. No canonical `init` is invoked against an ambient workspace. Real CLI/version compatibility, initialization against a disposable real-CLI project, and cross-platform host behavior remain open. The installed CLI is trusted local code; this is not OS confinement. Existing authority gates still determine whether a tool may execute.

## Skill registry lifecycle

Startup refresh reuses `.asen/skill-registry.md`, its existing cache and optional memory mirror. Source precedence remains project, user, then package scope. Discovery does not alter mandatory behavior-Skill selection.

Interactive hosts watch existing source roots recursively, debounce changes and serialize writes per canonical project. Changes during refresh coalesce into a follow-up refresh. Project switching/shutdown invalidates old callbacks; shutdown closes watchers, cancels scheduled refresh and waits for in-flight work. Unsupported watchers produce a diagnostic and leave manual refresh available. Missing or recreated source roots may require manual refresh or restart.

Disable automatic startup/watch with any of:

- Pi flag `--asen-no-skill-registry`;
- environment variable `ASEN_NO_SKILL_REGISTRY=1` (`true`, `yes` and `on` also apply);
- Pi `--no-skills` or `-ns`.

`/asen-skill-registry refresh` remains an explicit manual command. Startup/watch failure is diagnostic; it does not cancel the user's final response. Local native Linux watch invalidation, restart generation, shutdown, disable and project isolation are tested. Real all-platform Pi startup/restart journeys remain open.

## Primary installation and child policy

The Pi package manifest selects `extensions/asen.ts` explicitly. `extensions/authority.ts` is a private, hash-pinned policy loaded explicitly by the existing child runner; ordinary installation must not apply it to the primary session. `verify:pack` now loads the installed tarball through the real Pi SDK resource loader and rejects accidental child-policy activation. This offline registration check does not execute tools or models, and does not prove complete ecosystem integration.

## Public Pi command boundary

The production factory validates the SDK version and callable registration/event/flag API before registering anything. This preserves the declared `>=0.85.1` minimum; it is not proof of a full minimum-version runtime matrix. Preflight does not query tool/command inventories that Pi initializes later.

The seven data commands publish through `ctx.ui.notify`; their production handlers fulfill Pi's `Promise<void>` contract. Internal `createAsenExtension` handlers retain their returned data for composition/tests. `verify:pack` verifies actual installed registration and seven visible command results through offline Pi RPC with zero model invocations. Missing status, diagnostics, agents or changes providers remain explicitly unavailable; visible output does not establish production provider or ODD integration.
