# ASEN Architecture Principles

## Product boundary
ASEN is a Pi-native engineering harness. Pi remains the model/runtime host, provider/auth layer, base session system, TUI, built-in tool host, extension host, and native Skills platform.

ASEN adds deterministic engineering workflow, orchestration policy, evidence, verification, persistent project memory, lifecycle controls, and upstream intelligence.

## Non-negotiable invariants
1. ASEN MUST NOT replace Pi or implement an independent LLM runtime.
2. ASEN MUST NOT require Gentle Shell, Gentle AI, or Engram at runtime.
3. Upstream projects are behavioral references, not runtime authorities.
4. Model statements are not evidence. Verification consumes observable artifacts/results.
5. Evidence is bound to an exact candidate identity; a changed candidate invalidates prior verification.
6. Writes are single-writer by default. Parallel writers require explicit isolation.
7. Agent writes MUST be bounded by explicit edit surfaces.
8. Unknown risk fails closed to high-risk verification.
9. Ambiguous non-idempotent writes MUST NOT be blindly retried.
10. Human authorization remains required for destructive Git operations, publication, release, and other irreversible actions.
