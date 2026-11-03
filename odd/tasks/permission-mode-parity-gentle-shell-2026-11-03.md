# ASEN — Gentle Shell permission-mode parity

Status: **PARTIAL IMPLEMENTATION / DO NOT CLAIM FULL PARITY** (2026-11-03). Branch: `feat/t12-integrated-acceptance-merge`, PR #45. Reference: `Gentleman-Programming/gentle-shell`, `docs/permission-modes.md`, `docs/yolo-mode.md`, `lib/permission-mode-policy.ts`, `lib/yolo-session-policy.ts`, and `lib/auto-permission-runtime.ts` inspected from the public main branch. This task does not grant permission to merge main, spend inference credits or waive independent Pi Writer consent.

## Reference contract

Gentle Shell currently documents Normal, Auto, YOLO and Super YOLO. Auto requires a separate, tool-free model verdict on eligible calls, bound to live human intent and current session/model/action; invalid/unavailable/stale verdicts deny. YOLO supplies live primary standing permission for ordinary already-scoped operations including reversible non-force feature delivery; explicit restrictions, destructive operations and native consent remain independent. Super YOLO has a distinct high-risk contract but still blocks sensitive paths and catastrophic commands. Subagents do not inherit elevated primary modes. Global defaults are user-owned; repository settings and transcripts are not permission authority.

## Delivered in this bounded batch

- **Mode selection and status**: primary human command `/asen-mode status|normal|auto|yolo|default <mode>`, plus `/asen-yolo enable|disable|status`. Normal is default. Changes require a trusted live Pi TUI with a session ID and canonical workspace identity; RPC/headless calls cannot enable modes. Mode is per extension instance, revoked on identity drift and session replacement; do not persist live grants in conversation metadata.
- **Private versioned user preference**: `~/.asen/permission-mode.json` (or resolved ASEN home), strict `asen.permission-mode/v1` schema, private atomic replacement and fail-closed malformed/symlink handling. Saving a default is a separate human action; an elevated default only applies to an eligible new primary TUI.
- **Primary YOLO shell admission**: existing hard denies and sensitive-path controls execute first. Only an explicitly scoped, single, literal `git push origin feat/...|feature/...|fix/...|chore/...|docs/...|test/...` (optionally `-u` or `--set-upstream`) waives its routine confirmation. No command chaining, other remotes, forced/ref-deletion commands, main branch, path redirection, shell wrappers, ambiguous credentials or destinations. Recognized data-loss commands still ask or hard-block. This is a deliberately narrow safe subset of Gentle Shell YOLO; ordinary in-workspace file actions continue under ASEN's existing native policy.
- **Independent child authority untouched**: `extensions/authority.ts`, Plan/Writer single-use grant, Pi native acceptance, and recovery/replay guards are unchanged. The user's authorization for one session's ordinary activity is not automatically a new Writer or external delivery grant for a child.
- **Auto fail-closed adapter**: the hook accepts a separately injected independent reviewer for explicit integration/testing and checks immutable tool-call identity, bounded serialized arguments, current mode and cancellation before an allow. There is **no production independent inference adapter yet**; `/asen-mode auto` and `/asen-mode default auto` refuse to activate without one. The primary hook also blocks eligible Auto calls if independent review is missing, stale or denies. No inference is performed by this batch.
- **Security tests and CI**: tests cover malformed/symlink defaults, identity drift, reload/revoke, headless/RPC denial, safe and unsafe Git delivery, destructive command confirmation, Auto reviewer cancellation/argument mutation, no accidental custom-tool consent, and command registration. Run in provider-free T12 acceptance.

## Parity gaps — next implementation units

1. **P-AUTO**: wire an independent, tool-free classifier to Pi's active model with live-human input provenance, bounded metadata/inspection, strict timeouts/usage accounting, no paid-provider fallback, and stale verdict revocation. Until genuinely available, Auto is blocked, not approximated by a heuristic.
2. **P-YOLO**: extend reversible routine shell delivery from the minimal single-push safe subset to compound commands, non-force PR creation and scoped builds/commits with literal segment classification, explicit denial precedence, fixture-based adversarial tests and fresh scope snapshots; do not remove native Writer consent.
3. **P-SUPER**: **not enabled or available**. Requires explicit decision, hard-deny auditing and full cross-platform tests before shipping a deliberately higher-risk mode.
4. **P-UI**: native menu and status widget parity (including Customize) and reload/selection lifecycle tests.
5. **P-FULL**: real Pi primary-session tool-event tests across Linux/Windows/macOS, a genuine Auto classifier inference, concurrent changes and real guarded work. No `FULL` label until those gates pass.

## Non-goals and explicit non-claims

A mode is not a sandbox, blanket permission, independent reviewer, substitute for user intent or privilege escalation for children. A green provider-free CI proves only bounded implementation behavior. No real-model inference, authorized Writer execution, independent R4 audit or main merge in this batch.
