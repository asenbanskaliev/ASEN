# ASEN contributor guidance

Start with the portable [remote continuation plan](docs/remote-continuation.md) and the canonical [capability completion ODD](odd/tasks/pi-capability-completion.md). The ODD log is the source of truth for current admission and blockers; do not infer completion from stale summaries or cached receipts.

- Explore and reuse existing implementation, tests, stores, and contracts before adding code.
- Use proportional ODD: keep small work small, but record substantial or multi-step work against the canonical plan.
- Use available coding subagents when they reduce risk or context load. Give parallel workers disjoint edit surfaces and keep integration ownership explicit.
- Work test-first where a meaningful behavior test exists. Isolate stateful tests with project-owned home, config, cache, data, and temporary roots.
- Require an independent check for explicitly named security, data-integrity, concurrency, installation, or shared-contract risk.
- Keep missing capability or evidence marked blocked/partial. Never invent native review, provider consent, approval, reference parity, or a successful command.
- Do not require local Engram state, caches, installed SDK copies, private sessions, or machine-specific absolute paths. Reconstruct from tracked repository sources.
- Do not merge, release, publish packages, mutate provider state, or perform destructive actions without explicit owner consent.
