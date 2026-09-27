# Testing Strategy

Verification layers:
1. static/type checks
2. unit tests
3. contract tests
4. integration tests
5. Pi integration tests
6. end-to-end tests
7. architecture invariants
8. security checks
9. behavioral parity/reference checks

A PASS is meaningful only for the exact candidate tested.

Initial CI targets Linux and Windows. macOS is added before stable release. Windows is a first-class platform, not a post-release compatibility task.

Strict TDD evidence, when enabled, must prove RED -> GREEN -> REFACTOR/GREEN from executed commands rather than narrative claims.
