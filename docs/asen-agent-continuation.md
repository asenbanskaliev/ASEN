# Interrupted Explorer continuation core

`continueInterruptedExplorer` in `src/agents/interrupted-explorer-continuation.ts` is the reusable CORE boundary for the existing `asen_agent_continue` behavior.

It preserves the current contract:

- only an interrupted read-only Explorer owned by the resolved Pi session and project may continue;
- the runtime creates the fresh child identity and enforces the one-continuation claim;
- no confirmation dialog, UI scope, provider route, or new authority is introduced;
- a linked Todo must already represent the matching blocked interrupted Explorer;
- the Todo running claim is persisted before continuation enqueue, and the trusted binder links the child before dispatch;
- a failed dispatch restores a still-running Todo to the existing blocked review-required state.

The Pi tool remains responsible for validating arguments and resolving the trusted active identity. Resume UI, keybindings, shared entrypoints, stores, policies, and persisted schemas are outside this extraction.
