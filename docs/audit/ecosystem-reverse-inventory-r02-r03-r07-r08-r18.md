# Reverse inventory: R02, R03, R07, R08, R18

## Scope and method

Reference A is pinned at `08de420ca29be16b6f6bee725a30b599b061df16` in `registry/parity/ecosystem-sources-v1.json`. This audit uses extension registrations and observable user-facing behavior only; it does not treat upstream internals as requirements. ASEN evidence is the candidate tree at audit time, deterministic tests, and the exact-SHA host workflows. Source presence alone is not closure evidence.

The baseline snapshot at `registry/parity/ecosystem-sources-v1.json` pins the source commit and records 167 files, 127 event references, 16 tool references, 24 command references, 147 assets, 76 documents, 570 imports, and 27 command references. Its static reference resolver still reports 164 unresolved, absent, or outside-root references. These counts describe scanner output, not adjudicated parity; the resolver is not yet sufficient to prove a complete semantic inventory.

## R02 — commands, arguments, errors, availability

Reference A exposes 26 commands from its extension registrations, including names generated from bounded registration loops. The functional inventory is: agent view; animation setting; background-agent policy; banner; banner color; workspace changes; command inventory; customization; development binary selection; diagnostics; double-Escape cancellation; delegated setup for two roles; model selection; persona selection; profile selection; review mode; review-session permission; status; telemetry; usage; editor mode; history; and skill-registry refresh. This inventory deliberately records behavior without importing upstream command names or identity.

ASEN's shipped command catalog is `src/runtime/command-catalog.ts`; the Pi registrations are in `extensions/asen.ts`, `extensions/authority.ts`, `src/lifecycle/workflow-selection.ts`, and `src/review/ordinary-review-command.ts`. `asen-authority-status` was registered publicly but omitted from the catalog. The candidate fixes that inventory omission and adds a deterministic host-double check that catalogued implemented commands equal the commands actually registered by the extension plus authority policy. This is inventory consistency evidence, not command-behavior equivalence.

| Reference behavior | ASEN mapping | Evidence and disposition |
| --- | --- | --- |
| Skill registry refresh | `/asen-skill-registry` | Implemented; command arguments/errors and source recreation remain to be checked against the full contract. |
| Doctor and status | `/asen-doctor`, `/asen-status` | Bounded local projections; absent providers fail closed. No full behavior equivalence claim. |
| Commands inventory | `/asen-commands` | ASEN-owned inventory; registration/catalog equality now has a deterministic test. |
| Agents and changes views | `/asen-agents`, `/asen-changes` | Bounded attributed projections; no equivalent interactive overlay, controls, or cross-session transport claim. |
| Profiles/models/persona | `/asen-profiles` | Read-only profile listing; profile editing/model selection/routing behavior is not represented by this command. |
| Remaining visual, history, usage, review-mode and permission controls | No equivalent public behavior demonstrated | `PARTIAL`; do not infer equivalence from internal helpers or similarly named code. |

ASEN-specific workflow, review, and authority diagnostics remain ASEN surfaces; their existence does not close unmatched Reference A behavior. R02 stays `PARTIAL`.

## R03 — configuration and settings

ASEN's launcher contract is implemented in `src/runtime/launcher.ts`: CLI home selection overrides `~/.asen/config.json`, which overrides `ASEN_HOME` and the default; Pi-owned configuration stays with Pi. The strict profile schema and scope precedence are implemented in `src/runtime/profiles.ts` and persistence in `src/runtime/profile-store.ts`. Production extension wiring does not yet establish the full effective session > project > global > default profile routing chain or apply model/thinking to the actual Pi router. `asen-profiles` currently reads the configured profile file and reports names; it is not a routing control.

Reference A's observable settings span its agent/config home and environment overrides, project/global agent configuration, profile and exported-profile files, banner and visual settings, quiet-tool preferences, history policy/tombstones, double-Escape behavior, command shortcuts, and runtime feature toggles. ASEN's launcher and profile tests establish local schema/precedence behavior only; they do not establish compatible user journeys or live/restart semantics for those Reference A controls. No provider/model is hard-coded. R03 remains `PARTIAL`; profile-to-router integration belongs to R04 and needs deterministic Pi-host routing evidence before status changes.

## R07 — presentation

ASEN has a pure policy helper in `src/runtime/presentation.ts` for pretty/quiet, color auto/always/never, banner gating, theme validation, non-TTY behavior, width, and compact rendering, with deterministic helper tests. There is no demonstrated registration that applies this policy to Pi's banner, theme, or output renderers. `src/runtime/shortcuts.ts` is also a validation/resolution helper, not an active keybinding integration.

Reference A exposes startup banner controls, pretty/quiet renderers, theme/color choices, quiet-tool summaries, terminal resizing, and narrow-terminal layouts. Branding and artwork may differ by design, but the behavior must still be mapped. ASEN lacks integrated TTY snapshots and Pi host tests for width, color, accessibility, and startup/shutdown rendering. R07 remains `PARTIAL`.

## R08 — interaction and shortcuts

ASEN registers `asen_ask_choice` and `asen_ask_question` through `src/interaction/pi-tools.ts`; deterministic and offline Pi RPC tests cover validation, unavailable UI, cancellation, and timeout. The reference's keyboard inventory includes agents collapse/view/stop (`ctrl+shift+a`, `alt+a`, `alt+s`, each environment-overridable), TODO collapse (`ctrl+shift+t`), history (`ctrl+shift+r`), changes (`alt+g`), usage (`alt+u`), and command palette (`alt+k`, configurable/off). The reference also has double-Escape cancellation behavior.

ASEN currently has no registered shortcut consumer in `extensions/asen.ts`; `ASEN_SHORTCUTS` entries for palette, agents, and workspace are unavailable, while the dialog cancel entry is only a resolver declaration. There is no equivalent demonstrated for the reference actions above. Preserve ASEN's own naming and key choices if later integration is justified; this inventory does not authorize copying commands or branding. R08 remains `PARTIAL`.

## R18 — inventory completeness and remaining work

The source baseline correctly pins Reference A, but its unresolved static-reference set and incomplete semantic adjudication prevent claiming complete reverse inventory. The registrations reviewed here cover extension commands, tools, host events, shortcuts, config and user-facing assets; internal Node events and extension-private events must not be confused with public Pi host events. The 147 upstream assets were inventoried by metadata; none are copied into ASEN. Logo/banner artwork and upstream prose are permitted identity differences, while diagrams and screenshots still need explicit per-asset disposition against the documentation contract.

| Route | Current status | Remaining proof |
| --- | --- | --- |
| R02 | PARTIAL | Per-command argument, invalid-input, unavailable-dependency, and error behavior mapping; close the unmatched public controls or justify each accepted-scope difference. |
| R03 | PARTIAL | Effective production scope precedence, invalid/corrupt config fail-closed behavior, rollback/restart, and integration evidence. |
| R07 | PARTIAL | Apply presentation policy in Pi and record deterministic TTY/non-TTY, width, color, theme, and accessibility snapshots. |
| R08 | PARTIAL | Decide and implement only mapped interaction/shortcut behaviors; test conflict, invalid binding, cancellation, unavailable UI, and host registration. |
| R18 | PARTIAL | Resolve or explicitly adjudicate all 164 scanner references, classify all 127 event / 16 tool / 24 command references, and disposition every asset/document/claim in both directions. |

None of these routes is promoted to `FULL` by this audit or the catalog fix. ECO claims and the controlling route map remain `PARTIAL` pending the listed evidence.
