# Authority Model

Authority is explicit and scoped.

## Parent
May plan, read broadly within the active project, delegate, and aggregate results. It does not grant a child more authority than it possesses.

## Child agent
Receives task, project/repository identity, read scope, write surfaces, tool policy, and lifecycle limits. Missing write scope means read-only.

## Reviewer/verifier
Must not silently mutate the candidate it is verifying. Corrections create a new candidate requiring re-verification.

## Human-only gates
Destructive Git history changes, release/publication, credential changes, and other irreversible external actions remain explicit authorization boundaries.

## Foreign targets
Writes to another repository/project require a target-specific grant; grants do not transfer between targets.
