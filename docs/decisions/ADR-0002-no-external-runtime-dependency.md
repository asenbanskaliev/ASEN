# ADR-0002: No External runtime dependency

Status: Accepted (Phase 0)

## Decision
ASEN will not depend at runtime on Reference A, Reference B, or Reference C.

## Rationale
They are reference implementations. Runtime coupling would prevent ASEN from evolving independently and would blur authority boundaries.

## Verification
CI will include architecture checks that reject prohibited production dependencies/imports. Optional adapters must implement ASEN-owned interfaces.
