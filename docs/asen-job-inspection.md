# Inspect owned Jobs metadata

Use `/asen-job-inspect [id]` to inspect a background job owned by the current Pi session and canonical project. This is metadata-only observation, not execution control.

## Quick path

1. Open `/asen-panel jobs` for bounded IDs, mode and state, without command previews.
2. Run `/asen-job-inspect` to select an owned job (up to 100 choices), or supply its full ID. Without a selection-capable UI, supply an ID.
3. In the native overlay, press `r` to explicitly reread the owned snapshot; there is no polling or live view. Use Tab for attention/all and Enter for detail. Host-remapped bindings take precedence over `r`.
4. Read the observation provenance before interpreting state or counts. Long IDs are truncated for display. The selector retains original internal identity; the native overlay uses bounded metadata IDs and returns to the list if that identity is ambiguous.

## What the view means

| Source | Interpretation |
| --- | --- |
| In-process registry | Observed at inspection; `running` is not live follow or a fresh process-health probe. |
| Recovered journal | Historical metadata; current execution is unknown. Counts may be stale. |
| Interrupted | Outcome uncertain; not resumed. No automatic replay is implied. |
| Exit code | A recorded observed code, or unknown; state alone never fabricates success. |

The allowlisted DTO contains only bounded ID, enumerated mode/state, normalized creation/update timestamps, observed exit code, event/retained-line counts and coarse provenance. It never includes command, arguments, working directory, log lines, persistence/delivery errors or authorization fields. Logs are explicitly withheld because no secret-safe log projection exists. Terminal text uses the existing sanitizer and width truncation.

Unknown and foreign IDs receive the same generic unavailable response. Reader failure is distinct from an empty owned list. Cancellation closes inspection; session, manager, project or lifecycle drift invalidates it. Selection refreshes the scoped list before display. Native refresh keeps the filter and selected ID/detail only if the same unique entity remains visible within the 100-row cap; otherwise it returns to the first visible row (or empty list). Only one refresh is pending at a time. Failed reads retain the snapshot with a generic message; closed or scope-invalidated reads cannot publish results. Inspection does not stop, retry, start, dispatch, request consent or alter delivery state. The existing journal reader can create its private parent directory: this is not a zero-filesystem-write promise.

## Verification and limits

Tests cover the public renderer and registered command through `createPiExtension` with a mocked Pi host, plus in-memory registry start/append/finish without process execution. They do not establish real-host visual parity, connectivity, consent or process liveness. Existing non-Jobs renderer branches and observation integration remain covered by focused regressions.

Shared consumers intentionally affected: panel Jobs content, its native overlay, Jobs active counts in panel/work-row, and catalog-derived help/palette/preflight inventory. Historical jobs do not inflate active counts. Other sections and status behavior are unchanged. Broader base/current differential evidence remains unavailable from the earlier integration unit; these tests do not replace it.

UI-05 remains partial: no log viewing, follow mode, execution controls or visual parity claim. Privacy/shared-renderer risk assessment belongs with the parent’s change review; automated writer checks are not independent verification.
