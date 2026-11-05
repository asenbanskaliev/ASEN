# Inspect current Changes safely

Use `/asen-changes-view` for a bounded, read-only Git preview in the current workspace. The Changes panel points to this existing command; no new command or viewer framework is added.

## Quick path

- In interactive TUI mode, choose a changed file. Each row has a unique ordinal and a terminal-safe, width-bounded label. The exact returned label maps to the original Git path; display text is never parsed into a filename.
- If more than 100 changes exist, the selector title explicitly says **100 of N, partial choice set**. Only the first 100 status entries are offered.
- An explicit repository-relative path continues to use the existing preview. Without a selector or in headless mode, no-path invocation continues to show the bounded status index.

## Safety boundaries

| Boundary | Behavior |
|---|---|
| Cancellation | Cancelled or unknown selections produce no diff. Aborted signals reject inspection, including before the initial read and after selection. |
| Scope | Existing panel lifecycle, manager identity, session and project checks invalidate pending inspection. Shutdown/restart with the same session string is not continuity. The same invocation guard also runs synchronously immediately before notification, covering drift after the async handler returns. |
| Directory | Existing workspace directory identity is captured before selection and checked afterward, rejecting same-path replacement. The preview independently captures its root and rechecks current status membership. |
| Freshness | Selection does not freeze contents. Preview reads current content; a file no longer in current status is unavailable. |
| Errors | Read failures use generic messages. Invalidated scope rejects with a generic error and does not publish a command notification into the replacement scope. |
| Bounds | Existing 256 KiB input and 150 diff-line limits remain unchanged; output remains terminal-width bounded. |

This correction does not expand which file contents may be previewed or add sensitive-file authorization. Existing previews are not secret-redaction guarantees. It performs no editor, consent, model, dispatch, Git mutation, review, Writer, retry or cancellation action. Extension startup can still initialize existing local runtime state; this is not a zero-filesystem-write guarantee for the host lifecycle.

## Evidence and remaining proof

`tests/changes-view-isolation.test.ts` uses the production `createPiExtension` registration and command notification boundary. Fresh state stays in owned `D:/Asen/.cache/changes-view-*` directories and is retained, not cleaned up.

- Executed non-Git paths: pre-abort, abort/session/project/manager/lifecycle drift during identity await, missing/throwing session readers, unavailable Git state, shared same-path directory replacement, narrow renderer bounds and the actual panel hint. The standalone root-identity case is **not** evidence of successful public Git selection.
- Final-publication race: five public-command regressions deterministically queued abort/session/project/manager/shutdown drift after the last handler scope read, before Promise publication. RED reproduced one stale generic Git notification in each case (0/5); GREEN suppressed all five (5/5). This exercises the missing-session error path, not a successful Git diff. Only the fixture's context reader is observed; no global monkeypatch or production injection is used.
- The publication capability is opt-in only for Changes and stores its guard per invocation. Other commands keep their existing handler arguments, notification behavior and return values; the two exact legacy consumers and palette/panel/Jobs integration checks passed separately.
- Genuine public Git cases are present for sanitized-name collisions and original-path selection, cancellation/invalid selection, selector errors, selection-time drift/root replacement, current contents/removed membership, partial 100-entry choices, preview bounds and explicit/headless/index behavior. They remain **UNRUN locally** because isolated Git ownership is already known to be unavailable; no safe-directory exception or alternate storage is used. Control-character filename coverage is POSIX-only.
- Existing pure porcelain parser and panel/catalog/native-panel tests are separate preservation checks, not visual proof or runtime Git equivalence.

Risk: **item2 — wrong-file or stale-scope content disclosure**. Independent verification is owned by the parent after self-check. Native/visual/provider proof and the previously exhausted shared-consumer differential remain unavailable; this unit does not establish UI-04 or global FULL completion.
