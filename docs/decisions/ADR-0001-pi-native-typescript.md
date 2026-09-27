# ADR-0001: Pi-native TypeScript architecture

Status: Accepted (Phase 0)

## Decision
ASEN's Pi integration and orchestration layer will be implemented in TypeScript using Pi's extension surface.

## Rationale
ASEN is designed to extend Pi, not compete with it. TypeScript keeps the runtime layer native to Pi's extension ecosystem and avoids recreating provider, model, session, TUI, tool, and Skill infrastructure.

## Consequences
Core contracts must remain separable from adapters. A future helper service may use another language where justified, but Pi-facing authority remains in the ASEN extension.
