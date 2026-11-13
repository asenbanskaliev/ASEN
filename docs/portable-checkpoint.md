# Continue the portable WIP checkpoint

This is an unfinished-work snapshot, **not acceptance, a release or a production fix**. Publication is still parent-controlled. The candidate manifest is an ownership proposal, not staging or secret-safety approval.

## New-machine quick path

1. Clone the owner-confirmed repository and select `feat/t12-integrated-acceptance-merge` at the eventual published checkpoint SHA. No commit or push is recorded here; `a49d8ad9` is the preparation HEAD, not approval of the dirty worktree.
2. Read [AGENTS](../AGENTS.md), [current portable handoff](remote-continuation.md), the latest [canonical capability ODD](../odd/tasks/pi-capability-completion.md), then the selected owning ODD. Latest logs override historical active-worker instructions.
3. Read tracked `package.json` and `package-lock.json`. Use Git and Node **>=22.19.0**, compatible npm and the locked dependencies. No minimum npm version is asserted. Native dependencies such as `node-pty` require host-compatible prerequisites; verify these before any installation. Installed SDK copies from another machine are not inputs.
4. Only after fresh user authorization, use `npm ci` against the lockfile in isolated project-owned roots. It was **not run for this checkpoint**. Resolve host prerequisites without changing dependencies or weakening guards.
5. Select one explicitly admitted ODD successor with exact paths, fixtures, commands and stop conditions. Do not run a blanket test suite or replay stopped historical checks.

No Engram/RefMem, prior local cache, old receipts, private helper, personal configuration or earlier C-drive permission is needed to read and plan continuation. Execution requires its own valid admission.

## Setup only: isolated synthetic state

The existing [isolated setup](remote-continuation.md#portable-isolated-powershell-setup) is background, not permission to execute its install step. After authorization, create a **new, previously absent project-owned** root and separate `home`, `config`, `cache`, `data`, `state`, `tmp` and `pi-agent` directories. Never reuse private/current-user state.

| Purpose | Explicit environment bindings before imports |
| --- | --- |
| Home/config | `HOME`, `USERPROFILE`; `XDG_CONFIG_HOME`, `APPDATA` to fresh config |
| Cache/data/state | `XDG_CACHE_HOME`, `npm_config_cache`; `XDG_DATA_HOME`, `LOCALAPPDATA`; `XDG_STATE_HOME` to fresh state |
| Temporary/agent | `TMPDIR`, `TMP`, `TEMP`; `PI_CODING_AGENT_DIR` |
| npm configuration | `npm_config_userconfig` to a fresh owned config path, never copied user configuration |
| Dedicated tests, only if later admitted | Distinct fresh `P10_FIXTURE_ROOT`, `P11_FIXTURE_ROOT`, `P05_STATE`, `ASEN_AUDIT_ROOT` |

Prove hard-link support on the chosen owned storage **before stateful tests**. Unsupported storage is a blocker, not a reason to weaken locking. If no suitable project-owned storage is available, stop and request a scoped host-specific location; old external-drive grants do not transfer.

These directories/variables are **not complete fixtures**. Read the selected public test header and its owning ODD before preparing dependencies, phase inputs or a runner. In particular, [skill launcher resources](../tests/skill-launcher-resources.test.ts) still names a legacy ignored audit helper: **PENDING portability gap**. Do not read, copy or fake that helper, and do not assume roots alone reproduce its environment. This guide supplies no new fixture engine or production CLI.

## Honest continuation state

| Workstream | State transferred, not new verification |
| --- | --- |
| [P32](../odd/tasks/p32-context-gauge.md) | S7/L19 owner chose `checkpoint_with_font_blocked`: **STOPPED BLOCKED**. Actual RED was 15 tests: 13 PASS, 2 missing-gauge FAIL. Formatter unchanged. Capture01 environment guard failed before app/graphics; capture02 collected 30 cases, lacked U+25B0, produced zero PNGs. G1 blocked; G2–G4 pending. **No more fonts, captures, ASCII change or G2 edit.** |
| [P10](../odd/tasks/p10-fallback-editor.md) | Historical bounded global-parent editor 17/17 plus separate technical check and parent final 17/17; not whole-profile/host/native approval. |
| [P11](../odd/tasks/p11-child-fallback-wiring.md) | Historical parent and separate 7/7; required later parent check timed out, executed progress unknown. G3 blocked/G4 pending. |
| [P05](../odd/tasks/p05-home-selectors.md) / [P19](../odd/tasks/p19-parent-red-checkpoint.md) | H3 missing executable independent evidence / transport FAIL-STOP. No replacement or retry inferred. |
| [Parity roadmap](../odd/tasks/asen-gentle-shell-parity-implementation.md) | K9, R3b, T3c2b and EQ09–EQ14 freezes remain. P38 manual guidance is adopted DIFFERENT, not selected-command execution or host/visual parity. |
| [Publication](../odd/tasks/github-portable-continuation.md) | Old T3 verifier failed with SyntaxError before all checks, DROPPED/no relaunch or substitute. New structural checks do not close it. Unverified four-line `.gitignore` change deferred untouched. |

[Portable provenance](../odd/evidence/portable-checkpoint-evidence.json) records public sources and missing proof. Raw local receipts/admissions are excluded and unavailable on a fresh machine; do not reconstruct authority, old records or approvals. Font bytes and live-session permission do not transfer. Dirty-byte hashes do not certify an approved Git SHA or EOL identity.

## Parent publication checklist

- Inspect the [exact-path manifest](../odd/evidence/portable-checkpoint-manifest.json), candidate content and dependency closure; do not stage directories wholesale.
- Keep code, matching tests and owning docs together. Shared extension/runtime-doc hunks are aggregate, not invented per-hunk authorship. Report over-400-line groups rather than truncate history.
- Resolve actual repository/native delivery controls; no hook bypass or proof waiver. Unknown root PNGs, design assets, raw annexes, private state/cache/fonts/SDK/binaries stay out of this proposal.
- Parent alone chooses slices, stages the exact reviewed allowlist, inspects the actual index, commits and performs a normal authorized feature push. Record actual commit/push SHA afterwards. This writer provides **no staging approval**.
