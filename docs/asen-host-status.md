# Truthful host-status projection

`projectHostStatus` in `src/runtime/host-status-projection.ts` derives display data from public host observations. This is an unwired component for T2b (S1/S4/S6 and master S17/UI-08), not delivered status UI or a complete statusbar.

## Input and output

Pass the current public context directly as `HostStatusInput`. Its optional fields are `model`, `thinkingLevel`, and `getContextUsage()`. The function calls the usage method with its original receiver. Values are validated at runtime; unsupported host versions may leave fields absent.

An optional second argument accepts only public assistant metadata: `role`, `provider`, and `responseModel`. Supply it only from a genuinely observed response in the current session. No transcript scan or responder cache is built in.

| Output | Meaning |
| --- | --- |
| `selectedModel: {provider, model} \| null` | Public active model's provider and ID, not proof of execution |
| `respondingModel: {provider, model} \| null` | Explicit provider-reported `responseModel` on observed assistant metadata; never copied from selected or requested model |
| `effectiveThinking: string \| null` | Public effective `thinkingLevel`, limited to off/minimal/low/medium/high/xhigh/max; no Fast/auto inference |
| `context: {percent, state}` | Current finite percentage in [0,100] or null; state normal/warning/error/unknown |
| `cost`, `subscription`, `quota` | Always the literal `"unavailable"` |

Public labels reuse `sanitizeTerminalText` and `truncateForTerminal`, with a 55-column budget per identity component matching the existing status model budget. They are display labels, not routing keys. Inputs are never mutated. Throwing accessors invalidate only their observation, without returning exception text or unrelated values.

## Context rules

Usage must contain finite nonnegative `tokens`, positive finite `contextWindow`, and finite `percent` in [0,100]. The percentage is not recalculated or rounded. `tokens: null` or `percent: null` after compaction yields `{percent: null, state: "unknown"}` immediately, even after an earlier valid reading. There is no retained percentage and no null-to-zero conversion.

| Percent | State |
| --- | --- |
| 79.999 | normal |
| 80 | warning |
| 94.999 | warning |
| 95 | error |
| null, missing, invalid, or throwing | unknown |

## Accounting limits

Do not sum assistant-only costs. Public accounting also includes tool-reported nested usage, compaction summaries, branch summaries, and separate usage entries such as cache warming. Model price tables, credential type, and response metadata do not prove spend, subscription coverage, balance, or quota. This component deliberately has no accounting input until a documented complete observation path is integrated. Even host-reported session cost would not establish actual billing.

## Later integration contract

T2c owns context-type extension, refresh events, session identity checks, and rendering. The existing local command-context type does not yet declare these public observations; add optional fields matching `HostStatusInput` there rather than inventing a separate host registry.

- Read fresh context on each refresh and replace, never merge with old percentages.
- Label selected versus responding identity explicitly. If responder observations are retained by a future consumer, scope and clear them on session replacement; they do not establish the next response's model.
- Existing panel fields can receive selected `provider/model` as `model`, effective thinking as `effort`, and a known numeric `context.percent` as `contextPercent`. Omit cost and subscription.
- The old renderer cannot express unknown context or warning/error state. A later consumer must explicitly render `?` for unknown and use the unrounded derived state for tone; do not round first or substitute zero.
- Use an additive `ctx.ui.setStatus` key. Do not replace the native footer with `setFooter`. No UI calls occur in this module.

No fallback selection, provider call, connectivity assertion, execution authority, or persistent store is added. Native UI, clickable usage, and integrated refresh behavior remain future work.

## Verify

```sh
node --import tsx --test tests/host-status-projection.test.ts
npm run typecheck
```

The in-memory tests verify derivation only, not provider execution or live UI behavior. Existing consumers in `extensions/asen.ts` and `src/runtime/ide-panel.ts` remain unchanged.
