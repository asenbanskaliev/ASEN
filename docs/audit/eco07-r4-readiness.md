# ECO-07 R4 follow-up: trusted binding boundary

A new TrustedTaskAgentBinder verifies the Todo and the already persisted agent against the same session and project before writing an immutable correlation link. It never dispatches, continues or grants execution rights. A crash before binding leaves the agent unlinked; it does not invent a relationship. Retrying the same link is idempotent.

**Not yet production-complete:** the binder is not called by a production agent-start workflow; the caller must be a trusted integration point, not an exposed unrestricted tool. A separate atomic intent/reconciliation design is still needed to guarantee that a crash between agent enqueue and link creation can be repaired. Cross-store consistency is observational, not transactional.

R4 remains NOT APPROVED pending real Pi end-to-end crash tests, typecheck, tests and multi-platform validation. No CI requested.
