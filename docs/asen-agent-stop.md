# Agent Stop in the native Agents view

`/asen-agent-inspect` opens the Pi-native Agents navigator when the current Pi session has a TUI custom-overlay surface. The navigator remains an inspection view, with one explicit local action for a currently owned agent.

## Control availability

- Press `s` to request **Stop** only when the selected authoritative record is uniquely identified, belongs to the captured current Pi session and canonical project, and is `queued` or `running`.
- Pi-native remapped bindings take precedence. If Pi binds `s` to a native action, ASEN does not use it as the local Stop shortcut.
- In the Agents navigator, widths 1–11 retain Close-only behavior and do not expose Stop. The shared Jobs navigator keeps its existing minimum width of 12.
- Stop is withheld when the runtime is unavailable, the row is missing, duplicated, terminal, stale, outside scope, or the view has closed.
- Refresh remains available when no Stop request is in flight. Stop and refresh never overlap on the same unstable snapshot.

The navigator keeps the complete immutable agent ID from the inspected record. Display truncation is never parsed back into an ID. Immediately before calling the existing `AgentRuntime.cancel(id, identity)` contract, the extension rechecks the current Pi session, canonical project, exact record, ownership, and active lifecycle state. The runtime and dispatcher remain the final cancellation authority.

## Meaning of the result

`Stop requested` means only that the existing runtime accepted the cancellation request. It does **not** mean that the process is already stopped, that the task completed, that edits were reverted, or that authority, review, acknowledgement, or model consumption was granted. The durable lifecycle remains authoritative and can be refreshed after the request settles.

Failures are shown generically. Private runtime errors, agent output, transcripts, commands, arguments, and logs are not exposed. Closing the view suppresses late UI publication; it does not undo an already accepted explicit cancellation request.

## Exclusions

This slice does not add Resume, Follow, Job Stop, automatic cancellation, confirmation policy, a cancellation store, provider execution, or changes to the public headless/read-only inspection command. Partial agent edits remain in place for review and recovery.
