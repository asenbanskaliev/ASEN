# Find registered commands without running them

Use `/asen-commands [query]` for a list, or `/asen-palette [query]` to select a command and read manual invocation guidance. Both search the current public host inventory, not a static list of promised capabilities.

## Quick path

1. Enter `/asen-palette review` (or any name, description or group fragment).
2. Select a command row to inspect its public description.
3. If you want to invoke it, type the command yourself with its required arguments. Selection does not run it or insert text into the editor.

Queries are trimmed and case-insensitive. An empty query lists the inspected inventory. Groups come from ASEN catalog metadata for matching names; other rows use the public `extension`, `prompt`, or `skill` category, or `unknown`. Group membership is not an ownership claim.

## Output contract

| Situation | Result |
|---|---|
| Reader reports registrations | List only reported, valid command names and public descriptions |
| Reader reports an empty array | Empty list; palette says no registered commands reported |
| Query has no matches | Empty list; palette says no matching commands in the inspected inventory |
| Reader is missing, throws, or returns an invalid container | Explicit unavailable; never a static catalog fallback |
| Cancelled or unrecognized selection | No detail display and no action |
| Session/project changes while selecting | Reject stale display |
| Headless host or missing selector | Bounded text summary instead of opening a dialog |

`/asen-commands` retains its array result when inventory is available, including `name`, `group`, and `implemented: true`, with an added bounded `description`. Here `implemented` means reported registration, **not** verified functionality. Intentionally changed: no-match/empty results are `[]`, not a synthetic `asen-help` row; missing/failed inventory returns `{state: "unavailable", message: ...}`. Limited views emit an additional diagnostic before the array. The internal facade returns results; the production Pi adapter publishes via notifications and discards handler return values. Print/JSON hosts may ignore notifications: no stdout or model-message fallback is introduced.

## Limits and nonexecution

- Pi's `getCommands()` covers extension commands, prompt templates and skills. Built-in interactive commands are absent. This is not a complete command inventory or full native palette parity.
- Each call inspects at most 512 rows and displays at most 64 matches. Invalid/duplicate names and scan/output caps produce a limited-view notice. Narrow the query to search within that scan window.
- Names must be 1–96 ASCII letters/digits or `_.:-`, starting with a letter/digit. Names are not shortened. Public descriptions are sanitized from at most 2,048 code units and bounded to 120 terminal columns. Labels preserve the exact name and remain at most 240 columns; selection uses exact label identity, never text parsing.
- Source paths, URLs/auth fields outside descriptions, and raw reader errors are not inspected or displayed. Public descriptions are display metadata, not instructions or a secret-redaction guarantee.
- No handler execution, user-message dispatch, editor insertion, reload, model call, configuration write, or shortcut registration occurs. Existing `ctrl+p` unavailable reporting is unchanged; no effective binding or collision claim is made.
- Missing-reader behavior is supported by the internal facade. The production host preflight independently requires public inventory methods; this change does not relax that preflight.

Tests cover the projection and production `createPiExtension` registration with a receiver-sensitive live reader. Real terminal/visual proof, rebinding, global equivalence and inherited differential evidence remain outside this unit.
