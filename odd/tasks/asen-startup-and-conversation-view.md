# ASEN — single startup view and agent conversation view

Objective: adapt two Gentle Shell 4.8.0 capabilities to ASEN by reusing existing modules — one readable startup sequence backed by one CLI usage table, and one honest conversation view for an owned agent. Visibility only.
Branch: `feat/asen-startup-and-conversation-view` (from `feat/t12-integrated-acceptance-merge` @ `f4bc7a90`)
Delivery: `ask-on-risk` · single PR while under budget
Test runner: `npm test` (`node scripts/run-tests.mjs`) · typecheck: `npm run typecheck`

## Specs

S1. `asen startup` prints the ASEN startup sequence as an ordered, read-only projection. The sequence is declared once, as data, in `src/runtime/startup-flow.ts`, and reflects the real order of `runAsen` in `src/cli.ts`. It executes nothing and says so.

S2. The CLI usage text is generated from one data table (`ASEN_CLI_USAGE`) and every entry in that table appears in `ASEN_HELP`. The `startup` entry appears in `--help` because it appears in the table, not because it was typed twice.

S3. `renderStartupFlow(width)` returns frozen, terminal-sanitized rows bounded by `width`, rejects an out-of-range width, and carries an explicit note that the projection is descriptive only.

S4. `asen-agent-inspect <agent-id> --conversation` renders the durable agent record: the submitted prompt, the persisted state events, the authenticated result output (when present), and the pending question (when present). It is labelled "durable record, not the model transcript".

S5. The conversation view never fabricates content. A missing result, a missing pending question, or an empty event list produces an explicit notice, never an implied value.

S6. `asen-agent-inspect <agent-id>` without `--conversation` renders exactly what it renders today.

S7. No approval, publication or delivery authority is introduced. The view reports stored facts; it grants nothing. Existing `tests` and `npm run typecheck` stay green.

S8. Reuse only: the projection follows `src/runtime/agent-inspect.ts` conventions (`sanitizeTerminalText`, `truncateForTerminal`, frozen rows) and reads the pending question through the store's own validator. No Gentle Shell source is copied.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S8 | inline | done | `startup-flow.ts` + `agent-conversation.ts` reuse `responsive-layout` (`sanitizeTerminalText`, `truncateForTerminal`, `visibleWidth`); `agent-conversation.ts` follows `agent-inspect.ts` conventions; pending question read through `pendingQuestionValue` |
| T2 | S1, S3 | inline | done | `src/runtime/startup-flow.ts` (`ASEN_STARTUP_PHASES`, `renderStartupFlow`); `tests/startup-flow.test.ts` 5 cases, RED observed first (module-not-found), GREEN after |
| T3 | S2 | inline | done | `src/runtime/cli-usage.ts` (`ASEN_CLI_USAGE`, `renderCliUsage`); `ASEN_HELP=renderCliUsage()`; `tests/cli.test.ts` parity case |
| T4 | S1 | inline | done | `parseAsenArgs` accepts `startup`; `runAsen` renders it and refuses extra args with exit 2 |
| T5 | S4, S5, S8 | inline | done | `pendingAgentQuestion` in `agent-store.ts`; `src/runtime/agent-conversation.ts`; `tests/agent-conversation.test.ts` 6 cases RED→GREEN |
| T6 | S4, S6 | inline | done | `AgentRuntime.entry`; `--conversation` branch in `asen-agent-inspect`; existing uninspected output preserved (see L6) |
| T7 | S7 | inline | done | `npm run typecheck` clean; `npm test` exit 0 |

## Log

### L1 — user request (verbatim)

> ADELANTE

(preceded by the approved proposal: adapt, never clone, starting with the two highest-value items — single startup with a single catalog, and the assistant conversation view.)

### L2 — scope decision

Feature A does not reorder the real dispatch in `cli.ts`. The cascade in `runAsen` is a delivery and flag-contract surface; reordering it is high risk for no user-visible gain. Instead the sequence is declared as data and rendered, and the one real desync — `ASEN_HELP` being typed by hand while the command set lives elsewhere — is removed by generating the usage text from `ASEN_CLI_USAGE`.

### L3 — honest limits of feature B

The durable store holds the submitted prompt, the state events, the authenticated result output and the pending question. It does not hold the child model's live reasoning or tool stream. The view says this on its face rather than implying a transcript it cannot see.

### L4 — differential check on existing help output

The old `ASEN_HELP` was extracted from `git show HEAD:src/cli.ts` and compared line by line against the generated text: **1 line added, 0 lines removed, 13 → 14 lines**. The only change is the new `asen startup` row.

### L5 — regression the full suite caught, and the fix

`tests/agent-inspect-output-boundary.test.ts` asserts the exact no-id usage string. Extending it to mention `--conversation` was a real behavior change to existing output, so it was reverted: the usage line is byte-identical to before. The flag stays discoverable through the command description and the rendered view itself, not by rewriting an asserted message.

### L6 — first full-suite failure was a staging artifact, not a defect

`tests/asen-reachability-audit.test.ts` classifies only `git ls-files` output. New source files are imported by `src/cli.ts` but were untracked, so the audit failed closed. Staging the new files resolved it; the audit is unchanged and still fails closed on genuinely unresolvable imports.

### L7 — verification

`npm run typecheck` clean. `npm test` exit 0 (four full-suite runs: the first caught L5 and the staging artifact, the remaining three are clean).

### L8 — verifier availability, stated plainly

The independent verifier could not run: subagent delegation is denied in this session (`permission.rejected`). No PASS is claimed on its behalf. The closest available substitute was run instead and is labelled honestly:

`SELF_AUDIT_ONLY` · `NOT independent` · not a human or external review, and not a substitute for one.

The self-audit executed these probes against the real modules:
- `asen startup` → exit 0, 33 lines, first line `ASEN startup · 10 ordered phases · read-only projection`, empty stderr.
- `asen startup --apply` → exit 2, `Unsupported ASEN startup command. Expected: asen startup.`, empty stdout.
- `--conversation` matching: an agent id containing the substring (`agent--conversation`, `agent-conversation`) is **not** treated as the flag; only a standalone token is. The flag-token path also collapses repeated whitespace so a malformed double id cannot become a different id.
- Extreme widths (12 and 1000) with a 32 000-char prompt and a 1 MB output: 23 rows, zero rows over width, zero control characters, zero embedded newlines, no throw.
- Differentials: help gained exactly 1 line and lost 0; `renderStartupFlow` is deterministic and frozen; widths 11, 1001 and 80.5 are rejected; every usage row appears in the help.

The probes are a copy of the logic under review, not an outside judgment of it. The declaration order was checked against `runAsen`'s source by hand while writing the table, and no separate reader re-derived it.

Risk: item 3 — `parseAsenArgs` now claims the bare word `startup`, which previously reached Pi as an argument. Additive to the CLI, but it is a shared parser other behavior uses, so it is named rather than waved through.


