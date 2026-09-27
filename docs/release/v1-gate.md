# ASEN v1.0.0 Release Gate

A release tag is permitted only when the exact merge candidate satisfies:

- typecheck and unit/integration tests
- Linux and Windows CI
- architecture independence check
- SQLite memory restart/persistence test
- Pi RPC transport contract test
- package-content audit with npm pack
- packed-install smoke
- real Pi smoke when the Pi executable/package is available to CI
- no high/critical unresolved review finding
- release evidence identifies the exact Git SHA

A fixture proves ASEN's transport contract only. It must never be reported as proof that a real Pi executable accepted the request.

The stable release tag is created from the verified main SHA, never from an unmerged feature branch.
