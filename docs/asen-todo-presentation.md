# ASEN Todo presentation

ASEN presents Todo state from the existing authoritative Todo store. The presentation layer is read-only: it does not create tasks, change task state, dispatch agents, or grant permissions.

## State wording

- `succeeded` means execution finished and review is still pending.
- `done` means the task is completed.
- `cancelled` remains cancelled and is not rewritten as completed or failed.
- `blocked` remains paused and includes its recorded reason when the terminal width permits.
- Internal task, request, dependency, session, and project identifiers are not displayed.

## Terminal safety

Status rows and the compact progress widget use the shared terminal text policy from `src/runtime/responsive-layout.ts`.

- Control and unsafe formatting characters are replaced before display.
- Rows are measured in terminal columns rather than JavaScript string length.
- CJK characters and emoji use their visible terminal width.
- Truncation preserves grapheme clusters, including combining marks, variation sequences, and zero-width-joiner emoji.
- The ellipsis is added only when the decorated row actually exceeds its column budget.

The status-row width is supplied by its existing caller and retains its public minimum-width contract. The registered Pi Todo widget passes the actual sanitized host content width, while the pure widget keeps its 100-column default for other callers.
