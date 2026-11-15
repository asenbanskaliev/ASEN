# Truthful host-status projection

`projectHostStatus` in `src/runtime/host-status-projection.ts` derives display data from public host observations. The existing `/asen-panel status`, the composed `asen:host` status row and the `/asen-status` integrations inventory line consume public observations (T2c, S1/S4/S6 and master S17/UI-08). This is bounded public observation wiring, not a complete statusbar.

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

## Integrated behavior

`extensions/asen.ts` declares the public observations as optional context fields. `getPanelSnapshot` reads them fresh, after asynchronous profile/store loading and session/project revalidation. It never scans the transcript or caches a responder: the integrated responding identity remains `?` because no current response metadata reader is used.

In TUI mode with `hasUI` and public `setStatus`, session start (after the permission session applies its trusted default), model/thinking changes, turn end, agent settled, compaction success/failure, tree navigation and an explicit permission-mode change refresh `asen:host`. The row is composed once by `renderAsenStatusLine`: observed workspace state (`branch ±N` or `clean`) and an elevated permission mode (uppercased, never `NORMAL`) appear as segments beside the host identity. A generation guard plus panel-scope and session/project revalidation keep a stale async refresh from overwriting or clearing a newer contribution. Session shutdown or replacement clears the prior contribution; no-UI refresh clears it too. Late refreshes after shutdown do not restore it. Missing `setStatus` is supported. ASEN no longer writes the separate `asen:workspace` Git label or an `asen:permissions` key: each fact is published in exactly one place, matching the reference shell that shows the mode banner only in the status bar while the Integrations rail states its meaning.

Example plain output:

```text
ASEN │ main ±3 │ YOLO │ selected p/m · high │ responding ? │ ctx 80% warning
```

With no observed Git workspace and the normal permission mode, those segments are omitted:

```text
ASEN │ selected p/m · high │ responding ? │ ctx 80% warning
```

The explicit observation field leaves legacy renderer snapshots unchanged:

- Read fresh context on each refresh and replace, never merge with old percentages.
- Label selected versus responding identity explicitly. If responder observations are retained by a future consumer, scope and clear them on session replacement; they do not establish the next response's model.
- Integrated snapshots carry `hostStatus`; selected identity and thinking are labeled separately from responding identity. Cost, subscription and quota are omitted.
- Explicit unknown context renders `ctx ?`, including immediately after compaction returns null. Rounded percentages are display-only: 79.999 displays 80% without warning, 94.999 displays 95% warning, and 95 displays 95% error.
- A supported public `ctx.ui.theme.fg` applies `warning` or `error` to the bounded TUI contribution. Plain command/headless output retains the textual classification and contains no theme escapes.
- Use an additive `ctx.ui.setStatus` key. Do not replace the native footer with `setFooter`. No UI calls occur in this module.

No fallback selection, provider call, connectivity assertion, execution authority, or persistent observation store is added. Real native-session/visual acceptance and clickable usage remain unverified/out of this unit.

## Verify

```sh
node --import tsx --test tests/host-status-projection.test.ts
npm run typecheck
```

Pure tests verify derivation; `tests/panel-observation-integration.test.ts` exercises registered commands and actual lifecycle callbacks with a fake public host and project-owned isolated roots. These are not provider execution, billing, live native-session or visual acceptance evidence.
