# Job Stop in the native Jobs view

`/asen-job-inspect` reads owned Job metadata. Its Pi-native Jobs navigator additionally offers one explicit Stop request for a currently owned live ASEN background-job handle.

## Availability and identity

- Press `s` only when the selected row is a unique, registry-observed `queued` or `running` job in the captured current Pi session and canonical project.
- Pi-native remapped bindings take precedence. If the host binds `s`, ASEN does not use it for Stop.
- The Jobs navigator retains its existing minimum width of 12. Narrower widths remain invalid rather than gaining the Agents Close-only fallback.
- Missing, terminal, recovered, historical, host-only, off-scope, duplicated, stale, closed, or ambiguous rows cannot request Stop.
- Stop and refresh are single-flight and do not overlap.

Rendered IDs are capped and are never action authority. Each view or completed refresh creates an ephemeral object-identity association between the frozen public metadata row and a minimal immutable fingerprint of the original scoped registry snapshot. Immediately before Stop, ASEN rechecks the current context and requires one fresh registry snapshot with the exact full ID, session, project, creation identity, command, mode, working directory, arguments, registry provenance, and active state. It then calls the existing synchronous `BackgroundJobRegistry.stopScoped(fullId, sessionId, projectId)` guard without an intervening await.

A refresh replaces the association. Metadata objects from an earlier snapshot grant no action, including after removal/recreation or a truncated display-ID collision. The association never exposes command output, stdout, tail lines, private logs, or process identifiers.

## Meaning of Stop requested

`Stop requested` means only that the existing owned registry accepted the cancellation request. It does not assert that the process has already exited, that exit code is zero, that a Todo or task completed, that partial edits were reverted, or that review, consent, approval, acknowledgement, or model consumption occurred. The registry lifecycle remains authoritative and may be refreshed after the request.

Errors are generic. Closing or changing scope suppresses late UI publication, but does not roll back an already accepted explicit request. A scope-change closing message disables further actions without claiming that earlier Stop requests never happened.

## Exclusions

This slice adds no CLI Stop argument, tool, backend, store, process-ID kill path, native-host private manager access, Follow action, log viewer, Resume action, provider execution, or automatic cancellation. Headless, RPC, direct-ID, and selection-based metadata inspection remain read-only. Recovered jobs have unknown current execution and are uncontrollable from this view.
