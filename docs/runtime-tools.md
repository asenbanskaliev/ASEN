# ASEN runtime tools and registry lifecycle

These interfaces are registered by the shipped primary extension (`asen/extensions`). They are bounded implementations, not complete ecosystem parity. The current claim registry remains authoritative; local fixtures do not establish all-platform host behavior.

## User interaction

`asen_ask_choice` accepts a question, optional header, and two to four options. Each option has a label, optional description/preview and a unique value. An answered result contains the selected option; cancellation, timeout, unavailable host, invalid response and host failure have separate statuses.

`asen_ask_question` accepts one to four questions. Each has a question, header and two to four labeled options; `multiSelect` is optional. A cancelled questionnaire discards all partial answers. Custom free text, where explicitly enabled by the choice contract, is validated and remains data. Neither tool issues permissions or a write grant.

The native Pi select/input primitives carry interaction. Offline Linux RPC choice/cancellation has been tested with zero model turns. Full TUI/questionnaire presentation and integration with genuine human-only mutation consumers remain open. Timed-out hosts that ignore abort stay quarantined until the old dialog settles.

## Read-only code intelligence

`asen_code_intelligence` accepts `operation` (`query` or `explore`), a nonempty query of at most 2,000 characters and an integer `limit` from 1 to 20 (default 10). The current working directory must be the canonical Git project root. Home/temp roots and nested working directories are rejected.

The host resolves an installed CodeGraph executable. On Windows, npm package metadata resolves a contained JS entry through Node rather than executing cmd/PowerShell shims. Process arguments are passed separately, with the query after `--`; the model cannot set a path, executable, initialization or permissions. Output and duration are bounded. Missing CLI, stale/error exit, timeout, cancellation and oversized output return bounded status results; failures do not trigger indexing or retries.

Tests use synthetic subprocesses, including spaces/Unicode paths and hostile queries. No real index was inspected. Real CLI/version compatibility, permitted initialization lifecycle and cross-platform host behavior remain open. The installed CLI is trusted local code; this is not OS confinement. Existing authority gates still determine whether a tool may execute.

## Skill registry lifecycle

Startup refresh reuses `.asen/skill-registry.md`, its existing cache and optional memory mirror. Source precedence remains project, user, then package scope. Discovery does not alter mandatory behavior-Skill selection.

Interactive hosts watch existing source roots recursively, debounce changes and serialize writes per canonical project. Changes during refresh coalesce into a follow-up refresh. Project switching/shutdown invalidates old callbacks; shutdown closes watchers, cancels scheduled refresh and waits for in-flight work. Unsupported watchers produce a diagnostic and leave manual refresh available. Missing or recreated source roots may require manual refresh or restart.

Disable automatic startup/watch with any of:

- Pi flag `--asen-no-skill-registry`;
- environment variable `ASEN_NO_SKILL_REGISTRY=1` (`true`, `yes` and `on` also apply);
- Pi `--no-skills` or `-ns`.

`/asen-skill-registry refresh` remains an explicit manual command. Startup/watch failure is diagnostic; it does not cancel the user's final response. Local native Linux watch invalidation, restart generation, shutdown, disable and project isolation are tested. Real all-platform Pi startup/restart journeys remain open.
