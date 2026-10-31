# ASEN Threat Model (Consolidated)

## In Scope
- local repository writes by agent authority
- session, project, and worktree identity
- credential and token redaction in stored memory
- exact selected version execution and managed rollback
- Git-backed receipt and selected-file publication

## Out of Scope
- external GUI or brand-level startup presentation
- full ecosystem/runtime parity claim
- explicit external provider behavior outside ASEN-owned policy

## Accepted Risks
- inherited transitive dependency advisories (for example, Undici under an optional Pi peer)
- platform-dependent or privilege-dependent filesystem behavior that is explicitly skipped
- self-audit admission where independent third-party review cannot be run
- release-gate evidence remaining pending outside local verification

## Controls
- Primary path blocking and sensitive-path denial
- Exact candidate / exact revision gate on stage and review actions
- Node and CI version pinning where documented
- Release-check as the explicit publication gate
- Redaction of private tags and common secret patterns before persistence

## Open Debt
- Strong cross-OS and release evidence
- Normative source proof if the retained baseline repository is unavailable
- Host-dependent security behavior on non-Windows platforms
