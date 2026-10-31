# T12 — Preliminary integrated acceptance candidate

This work integrates T07, T09 and T10 changes from their separately reviewable PRs into one exact candidate. It is not a claim of global functional parity.

## Source provenance

- T07: PR #40 at `b8f5bffb71440987af1fc19e6d8b907916ab6060`, exact-SHA CI 41141549417 SUCCESS on Ubuntu, Windows and macOS, including real CodeGraph CLI.
- T10: PR #41 at `efa007d28d036094fe1c77b58fa613ce5d22b5d4`, includes opt-in cross-process Pi session metadata, scoped interactive corrections, Git status hardening and integrity pin correction. Individual exact-SHA CI pending.
- T09: PR #42 at `2ffd97a2ad98b6c6c235447d557bca54c04d7a56`, includes defensive uninstall pathname revalidation. Individual exact-SHA CI pending.

## Acceptance scope

The combined `tests/t12-integrated-boundaries.test.ts` exercises a real disposable Git repository, read-only CodeGraph without auto-init, one-use workspace correction with Git status, isolated one-use session metadata consent, and rejection of uninstall for a foreign installation while preserving foreign data. It is an integration smoke, not a substitute for real TUI, live provider interruption, a complete version-pinned reference implementation, hostile same-user filesystem confinement, or independent R4.

## Gates

Exact-SHA CI, release packaged smoke, Pi support matrix on Linux/Windows/macOS, and independent risk review must succeed before a final acceptance claim. T09/T10 can remain PARTIAL even if this integrated smoke passes. This candidate does not authorize merge to main or changes to unrelated user environments.

### Exact proof correction
The integration security job at SHA `881c7c0ce61951df767750a953c60e5a9fc40375` observed a missing session-discovery step in the new T12 scenario; this test-only sequence was fixed in `27564ea2dfb59eab9b35b4727116209a4b32c8bd`. That candidate's provider-free T12 security job passed. Subsequent T10 same-process session recovery fixes are incorporated here, and require independent exact-SHA revalidation before any closure. Historical failed receipts are preserved.


### Adversarial TUI and publication follow-up — next exact candidate

The Pi host matrix now drives an actual `/asen-changes` command using native PTY keyboard input for all three OS TUI cells. Admission requires both public ASEN output markers, no model call, and natural Pi shutdown. This is a keyboard/command-routing test, **not** a test of the selection/editor/confirmation widgets. An isolated session claim race test demonstrates a second publisher cannot be replaced by a stale first publisher after it checked an empty record; new records use atomic hard-link publication. Existing recorded session restart is still supported, but adversarial same-user file tampering is outside OS isolation.

For the manual workspace correction, the post-write verification is now explicit: if the exact file has already been renamed but another actor changes the workspace immediately afterward, ASEN persists the user's edit and warns about the failed post-publication verification rather than reporting a false no-write failure. The new test injects a real Git modification immediately after rename. None of these additions is considered validated until an exact-SHA CI passes.


### T12 native interactive Pi TUI completion candidate — 2026-10-31

A genuine Pi 1.2.0 TUI job (`t12-real-pi-tui-dialog`) on Ubuntu passed at source candidate `fddecd76188c0f0fd4b3c2dd33a98090e700682f`: a disposable Git repository, seeded session-attributed same-path conflict, public `/asen-changes resolve` keyboard submission, real conflict selector, editor Escape cancellation, unchanged tracked file/HEAD and no model calls, followed by natural shutdown. This is genuine native interaction, not a mocked host. The result closes the prior selector/editor cancellation visibility gap for Linux only.

The next exact candidate expands the identical cancellation journey to Windows and macOS and adds a **separate affirmative journey** to edit a tracked file, submit the native editor, approve the exact candidate in Pi's confirmation dialog, require observable success, and verify that Git shows only an uncommitted allowed file change. Each OS preserves isolated receipts and enforces natural process shutdown, no model calls, and the exact SHA. The affirmative UI and other operating systems are **UNVERIFIED** until their jobs succeed. A hosted green result does not prove OS-level confinement, external-reference parity, or a provider-backed workflow.


### Pinned public Pi-native baseline comparison — 2026-10-31

A newly inspected public main revision, `14f44d11cacbb0e39b73a172113a86b1e3cbfc58`, exposes an additional CodeGraph Git hygiene behavior previously absent from ASEN: exclude its generated `.codegraph/` index via the repository-local `info/exclude`, not the tracked `.gitignore`. This candidate adds a bounded, no-follow, Git-common-directory-identity-checked exclusion for **explicitly approved init/sync only**; query/explore stay read-only. Real CLI integration now requires a clean Git status immediately after index initialization, and deterministic tests cover cancellation, repetition, symlink exclusion, and linked worktrees. No public baseline source is copied or executed in ASEN. These changes are UNVERIFIED until exact-SHA CI; this does not by itself prove complete CodeGraph parity, Windows mapped-drive equivalence or large-index timeout behavior.
