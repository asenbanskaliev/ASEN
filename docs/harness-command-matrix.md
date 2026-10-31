# Comparator Shell vs ASEN command and feature matrix

This matrix is intentionally operational. It maps Comparator Shell command names to ASEN surfaces so the equivalence claim can be audited instead of inferred from README tone.

## Legend

- `MATCH`: same functional capability with an ASEN-shaped command or flow
- `CONSOLIDATED`: same behaviour is owned by another ASEN command, not missing
- `GAP`: no equivalent ASEN surface yet (intentionally or incidentally gone)
- `ASEN-STRONGER`: ASEN surface goes further in evidence or transactionality

## Command mapping

| Comparator Shell | ASEN surface | Status | Evidence |
|---|---|---|---|
| comparator:changes | asen-changes | MATCH | extensions/asen.ts (`registerData`) |
| comparator:agents | asen-agents | MATCH | extensions/asen.ts, docs/runtime-tools.md |
| comparator-sdd-init | asen-workflow + SDD skills | CONSOLIDATED | src/lifecycle/workflow-selection.ts, skills/asen-*/SKILL.md |
| comparator-sdd-status | asen-status, asen-workflow | CONSOLIDATED | src/runtime/status.ts |
| comparator-sdd-continue | asen-workflow / artifact phases | CONSOLIDATED | odd workflow, orchestrator extensions |
| comparator:models | asen-profiles | CONSOLIDATED | src/runtime/profiles.ts |
| comparator:profiles | asen-profiles | MATCH | src/runtime/profile-store.ts |
| comparator:persona | asen-persona | MATCH | src/runtime/command-catalog.ts |
| comparator:doctor | asen-doctor | MATCH | src/runtime/doctor.ts |
| comparator:status | asen-status | MATCH | docs/runtime-tools.md |
| comparator:review-session-permission | asen-authority-status | CONSOLIDATED | extensions/authority.ts |
| comparator:review-mode | asen-review + native review controls | CONSOLIDATED | src/review/ordinary-review-command.ts |
| comparator:telemetry | asen-telemetry (new read-only hub) | MATCH | extensions/asen.ts, src/runtime/usage-command.ts |
| comparator:background-subagents | asen-agents + background delivery notifications | CONSOLIDATED | src/runtime/background-jobs.ts |
| command palette / startup banner | asen-commands, catalog | GAP / surface-less | src/runtime/command-catalog.ts shows only catalog data; no full banner toggle or wizard |
| comparator-live-research-probe | no equivalent command | GAP (optional) | only comparator test probes; no ASEN opt-in probe |
| skill-registry:refresh | asen-skill-registry | MATCH | src/skills/registry-lifecycle.ts |

## Flow closing

Comparator only advertises complete feature breadth through command catalog and preflight windows.
ASEN has strong equivalence for orchestration and evidence but explicit gaps remain for:
- dedicated command palette rich UI
- startup banner controls
- standalone live-research opt-in command

These are now explicit tracked parity tasks and are not silent omissions.


## Notes on presentation-only surfaces

`asen-commands` is the supported functional equivalent of a command palette: it lists implemented and missing public surfaces by group (`core`, `workflow`, `review`, `skills`, `configuration`, `session`, `memory`, `diagnostics`). It is delivered through the Pi-facing command surface and registered in `extensions/asen.ts`. The remaining gap is visual shell richness (a full interactive palette/panel), not inventory/discovery. Likewise, startup banner and telemetry are consolidated into `asen-status` and `asen-usage`; they are not separately branded controls. These are deliberate bounded surfaces rather than accidental missing functionality.
