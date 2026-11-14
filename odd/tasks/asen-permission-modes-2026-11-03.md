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


## Permission-mode consolidation — 2026-11-03 / grouped P-AUTO, P-YOLO, P-SUPER, P-UI

Implementation:

- P-AUTO: independent selected-model inference in the primary Pi tool pre-admission pipeline, zero-declared-cost-only models, no tool calling, current human interactive input provenance, first-task/recent restriction window, live action/model/mode/session revalidation and mode epoch, explicit denial for missing/error/invalid/timeout classifier, separate usage accounting and cancellation. Safe registered-tool descriptions are projected with 8 KiB/512 JSON-node/12-level limits, no getters, toJSON or custom serializers. Host-only bounded source inspection of literal local node scripts/package.json (8 KiB, no symlink, secret check, no execution) augments the context. Child native consent remains independent.
- P-YOLO: live session standing grant for a narrow literal subset of ordinary compound code/check/feature delivery, including recognized commits, checks, fetch/rebase, non-force branch push, PR creation; no shell pipes, substitutions, arbitrary destinations or forced ref deletion. Only recursive removal of own exact mktemp scratch can waive data-loss dialog if ownership and temporary root pass. All other destructive confirmations/hard denials apply.
- P-SUPER: human-only primary mode and optional trusted user-global default. Existing ordinary shell confirmation outcomes are bypassed, but immutable hard-denied destructive commands, sensitive credential shell/file paths, private permission config and independent native human consents remain outside its authority. Child workers are never given the primary mode. A standalone shell lexer is NOT an OS sandbox.
- P-UI: `/asen-mode` supports Normal, Auto, YOLO, Super YOLO and distinct defaults. `/asen-customize permissions` supplies a native primary-session selection menu with identity revalidation after choice; no menu preview or cancellation grants authority. Slash mode status exposes Auto usage. Same-session repeated startup cannot silently reapply an elevated saved default after explicit Normal revocation.
- P-CI: fixed exact public command catalog regression that was the common CI test failure across Ubuntu, Windows and macOS at `b54ffaf`. Provider-free tests cover hard denies, cross-mode epoch drift, Super Yolo, compound shell authorization, owned scratch removal, mode menu spoofing, tool metadata safety, long-session first/last instructions, and read-only script inspection. Successful provider-free fixtures are NOT live remote verifier evidence.

**Remaining before reporting full validated parity:** repeat exact-SHA CI on all three OS after this grouped commit; run a real primary Pi TUI with each mode, selected-model independent Auto inference, native Customize and host answers, and verify model quotas/errors, dynamic guardrail configuration, background commands and OS containment boundaries. Confirm per-tool plugin/adaptor semantics and user-global preference ownership under Windows. Super YOLO is intrinsically higher-risk and cannot be certified as safe by lexical tests alone. Do not confuse mode implementation with T12 Writer FULL or independent R4. No provider inference was started by the grouped patch; no merge to main.


## Focused CI audit and hardening (same grouped batch)

- At `675fa88` the first focal run found a strict TypeScript path narrowing problem; `1e55eb4` corrected it. The next focal run found **two real safety defects**, not environmental CI issues: unsafe top-level registered-tool descriptions were not being screened like their parameter schemas, and the Super YOLO lexical check missed nested `secrets/` paths. The follow-up security patch fixes both and expands checks for `.ssh/config`, `.aws/credentials` and token-like fields.
- A user-visible live mode status indicator is published to Pi via an optional status UI, including revocation to Normal. Repeated same-session start events cannot re-enable a revoked default.
- These test-driven changes do not authorize Writer, bypass independent native consent, or assert successful live model calls. Exact-SHA checks must complete before parity can be claimed.
