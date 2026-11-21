# ASEN contributor guidance

**Lectura mínima según la tarea:** para el flujo de agentes de la PR #61 y las fases CTX, empieza por el [índice ODD operativo](odd/tasks/INDEX.md). Abre solamente el plan, el código y las pruebas que necesite la tarea actual. No cargues por defecto todos los archivos de `odd/tasks/`, `docs/audit/` ni `odd/archive/`; consulta el histórico únicamente para comprobar una evidencia concreta.

Para el trabajo general de capacidades de Pi, instalación o recuperación, utiliza cuando proceda el [plan de continuación remota](docs/remote-continuation.md) y el [ODD de capacidades](odd/tasks/pi-capability-completion.md). El registro ODD aplicable sigue siendo la referencia de decisiones y bloqueos, pero hay que contrastarlo con el código, el CI y el SHA actuales. No declares trabajo terminado a partir de resúmenes antiguos ni pruebas omitidas. Se mantienen todas las reglas de autorización, revisión y seguridad indicadas a continuación.

- Explore and reuse existing implementation, tests, stores, and contracts before adding code.
- Use proportional ODD: keep small work small, but record substantial or multi-step work against the canonical plan.
- Use available coding subagents when they reduce risk or context load. Give parallel workers disjoint edit surfaces and keep integration ownership explicit.
- Work test-first where a meaningful behavior test exists. Isolate stateful tests with project-owned home, config, cache, data, and temporary roots.
- Require a separate risk review for explicitly named security, data-integrity, concurrency, installation, or shared-contract changes. In PR #45 only, the owner explicitly substitutes the external/independent R4 gate with deterministic automated self-audit. Label its evidence `SELF_AUDIT_ONLY` and `NOT independent`; do not claim a human/independent reviewer, security certification or Reference Shell parity. Fail closed on missing tests or exact-SHA receipts.
- Keep missing capability or evidence marked blocked/partial. Never invent native review, provider consent, approval, reference parity, or a successful command.
- Do not require local RefMem state, caches, installed SDK copies, private sessions, or machine-specific absolute paths. Reconstruct from tracked repository sources.
- Do not merge, release, publish packages, mutate provider state, or perform destructive actions without explicit owner consent.
