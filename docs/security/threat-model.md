# Phase 0 Threat Model

## Protected assets
- source code and Git history
- credentials and provider tokens
- project memory and prompts
- candidate/evidence integrity
- user-controlled publication state
- filesystem outside authorized edit surfaces

## Trust boundaries
Pi runtime, ASEN extension, child agents, shell/tool execution, Git repository, memory store, optional external adapters, and upstream Radar are separate trust boundaries.

## Required controls
- deny destructive Git operations without explicit authority
- least-privilege edit surfaces for delegated writers
- single-writer default
- no secret persistence in memory/evidence
- exact candidate identity for review evidence
- fail closed when risk or authority cannot be determined
- no blind retry of ambiguous non-idempotent writes
- sanitize untrusted upstream/reference content before it can influence execution
- external repository writes require explicit grant
- audit security-sensitive state transitions

## Non-goal
Phase 0 does not claim sandbox isolation. Process/filesystem isolation must be proven by later implementation and tests.
