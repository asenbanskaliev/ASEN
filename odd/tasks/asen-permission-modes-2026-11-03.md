# ASEN — reference permission-mode compatibility

Status: **PARTIAL IMPLEMENTATION / DO NOT CLAIM FULL PARITY** (2026-11-03). Branch: `feat/t12-integrated-acceptance-merge`, PR #45. Reference: `public upstream project`, `docs/permission-modes.md`, `docs/yolo-mode.md`, `lib/permission-mode-policy.ts`, `lib/yolo-session-policy.ts`, and `lib/auto-permission-runtime.ts` inspected from the public main branch. This task does not grant permission to merge main, spend inference credits or waive independent Pi Writer consent.

## Reference contract

upstream project currently documents Normal, Auto, YOLO and Super YOLO. Auto requires a separate, tool-free model verdict on eligible calls, bound to live human intent and current session/model/action; invalid/unavailable/stale verdicts deny. YOLO supplies live primary standing permission for ordinary already-scoped operations including reversible non-force feature delivery; explicit restrictions, destructive operations and native consent remain independent. Super YOLO has a distinct high-risk contract but still blocks sensitive paths and catastrophic commands. Subagents do not inherit elevated primary modes. Global defaults are user-owned; repository settings and transcripts are not permission authority.

## Delivered in this bounded batch

- **Mode selection and status**: primary human command `/asen-mode status|normal|auto|yolo|default <mode>`, plus `/asen-yolo enable|disable|status`. Normal is default. Changes require a trusted live Pi TUI with a session ID and canonical workspace identity; RPC/headless calls cannot enable modes. Mode is per extension instance, revoked on identity drift and session replacement; do not persist live grants in conversation metadata.
- **Private versioned user preference**: `~/.asen/permission-mode.json` (or resolved ASEN home), strict `asen.permission-mode/v1` schema, private atomic replacement and fail-closed malformed/symlink handling. Saving a default is a separate human action; an elevated default only applies to an eligible new primary TUI.
- **Primary YOLO shell admission**: existing hard denies and sensitive-path controls execute first. Only an explicitly scoped, single, literal `git push origin feat/...|feature/...|fix/...|chore/...|docs/...|test/...` (optionally `-u` or `--set-upstream`) waives its routine confirmation. No command chaining, other remotes, forced/ref-deletion commands, main branch, path redirection, shell wrappers, ambiguous credentials or destinations. Recognized data-loss commands still ask or hard-block. This is a deliberately narrow safe subset of upstream project YOLO; ordinary in-workspace file actions continue under ASEN's existing native policy.
- **Independent child authority untouched**: `extensions/authority.ts`, Plan/Writer single-use grant, Pi native acceptance, and recovery/replay guards are unchanged. The user's authorization for one session's ordinary activity is not automatically a new Writer or external delivery grant for a child.
- **Auto independent inference adapter**: production Pi wiring now captures only `source=interactive` human input in the live primary TUI (no transcript/extension messages) and calls the selected session model through `ctx.modelRegistry.streamSimple(...).result()` with `tools:[]`, `toolChoice:none`, bounded JSON and a single 20-second attempt. Inference requires all model prices explicitly reported as zero; unknown or paid model pricing means DENY without a call. Invalid response, scope drift, changed model/args, cancellation, concurrent unfinished checks and missing trusted requests deny. Calls/tokens/cost are accounted for separately in memory. No real-provider Auto acceptance receipt exists yet; mock-provider tests are not real-model parity.
- **Security tests and CI**: tests cover malformed/symlink defaults, identity drift, reload/revoke, headless/RPC denial, safe and unsafe Git delivery, destructive command confirmation, Auto reviewer cancellation/argument mutation, no accidental custom-tool consent, and command registration. Run in provider-free T12 acceptance.

## Parity gaps — next implementation units

1. **P-AUTO**: deepen the newly wired independent reviewer with full registered-tool context, bounded optional file inspection, resilient interactive answer capture, robust usage accounting and long-session restriction preservation, and verify against a real free-model provider. Until those gates pass, Auto is an experimental, fail-closed subset rather than complete reference parity.
2. **P-YOLO**: extend reversible routine shell delivery from the minimal single-push safe subset to compound commands, non-force PR creation and scoped builds/commits with literal segment classification, explicit denial precedence, fixture-based adversarial tests and fresh scope snapshots; do not remove native Writer consent.
3. **P-SUPER**: **not enabled or available**. Requires explicit decision, hard-deny auditing and full cross-platform tests before shipping a deliberately higher-risk mode.
4. **P-UI**: native menu and status widget parity (including Customize) and reload/selection lifecycle tests.
5. **P-FULL**: real Pi primary-session tool-event tests across Linux/Windows/macOS, a genuine Auto classifier inference, concurrent changes and real guarded work. No `FULL` label until those gates pass.

## Non-goals and explicit non-claims

A mode is not a sandbox, blanket permission, independent reviewer, substitute for user intent or privilege escalation for children. A green provider-free CI proves only bounded implementation behavior. No real-model inference, authorized Writer execution, independent R4 audit or main merge in this batch.


## Additional Auto wiring and policy self-protection (same feature continuation)

- The production primary extension supplies a fresh `AsenAutoPermissionReviewer` and registers an `input` event observer. Only live interactive human text provides trusted classifier intent. No model tool, repository config or chat transcript can switch the permission mode.
- The reviewer uses only explicitly zero-cost selected Pi models and one tool-free independent request with a bounded timeout; missing prices, credentials, provider errors, malformed/denied results, concurrent calls and changed session/model/action all DENY. There is no invisible paid fallback. Additional inference can occur only after a human explicitly selects Auto (or saves an eligible default).
- The normal primary safety hook now protects the private permission-mode preference file and its config directory from model `write`/`edit` operations, and blocks literal shell references to the mode configuration. Only user-owned command handling may save defaults.
- New offline tests use mocked model replies and synthetic credentials. These are deterministic checks, **not** proof of actual Auto model behavior, remote service resilience or complete bypass resistance.
