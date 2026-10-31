# Gentle Shell vs ASEN command and feature matrix

This matrix is intentionally operational. It maps Gentle Shell command names to ASEN surfaces so the equivalence claim can be audited instead of inferred from README tone.

## Legend

- `MATCH`: same functional capability with an ASEN-shaped command or flow
- `CONSOLIDATED`: same behaviour is owned by another ASEN command, not missing
- `GAP`: no equivalent ASEN surface yet (intentionally or incidentally gone)
- `ASEN-STRONGER`: ASEN surface goes further in evidence or transactionality

## Command mapping

| Gentle Shell | ASEN surface | Status | Evidence |
|---|---|---|---|
| gentle:changes | asen-changes | MATCH | extensions/asen.ts (`registerData`) |
| gentle:agents | asen-agents | MATCH | extensions/asen.ts, docs/runtime-tools.md |
| gentle-sdd-init | asen-workflow + SDD skills | CONSOLIDATED | src/lifecycle/workflow-selection.ts, skills/asen-*/SKILL.md |
| gentle-sdd-status | asen-status, asen-workflow | CONSOLIDATED | src/runtime/status.ts |
| gentle-sdd-continue | asen-workflow / artifact phases | CONSOLIDATED | odd workflow, orchestrator extensions |
| gentle:models | asen-profiles | CONSOLIDATED | src/runtime/profiles.ts |
| gentle:profiles | asen-profiles | MATCH | src/runtime/profile-store.ts |
| gentle:persona | asen-persona | MATCH | src/runtime/command-catalog.ts |
| gentle:doctor | asen-doctor | MATCH | src/runtime/doctor.ts |
| gentle:status | asen-status | MATCH | docs/runtime-tools.md |
| gentle:review-session-permission | asen-authority-status | CONSOLIDATED | extensions/authority.ts |
| gentle:review-mode | asen-review + native review controls | CONSOLIDATED | src/review/ordinary-review-command.ts |
| gentle:telemetry | asen-telemetry (new read-only hub) | MATCH | extensions/asen.ts, src/runtime/usage-command.ts |
| gentle:background-subagents | asen-agents + background delivery notifications | CONSOLIDATED | src/runtime/background-jobs.ts |
| command palette / startup banner | asen-commands, catalog | GAP / surface-less | src/runtime/command-catalog.ts shows only catalog data; no full banner toggle or wizard |
| gentle-live-research-probe | no equivalent command | GAP (optional) | only gentle test probes; no ASEN opt-in probe |
| skill-registry:refresh | asen-skill-registry | MATCH | src/skills/registry-lifecycle.ts |

## Flow closing

Gentle only advertises complete feature breadth through command catalog and preflight windows.
ASEN has strong equivalence for orchestration and evidence but explicit gaps remain for:
- dedicated command palette rich UI
- startup banner controls
- standalone live-research opt-in command

These are now explicit tracked parity tasks and are not silent omissions.
