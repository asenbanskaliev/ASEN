# T12 — Preliminary integrated acceptance candidate

This work integrates T07, T09 and T10 changes from their separately reviewable PRs into one exact candidate. It is not a claim of global functional parity.

## Source provenance

- T07: PR #40 at `b8f5bffb71440987af1fc19e6d8b907916ab6060`, exact-SHA CI 41141549417 SUCCESS on Ubuntu, Windows and macOS, including real CodeGraph CLI.
- T10: PR #41 at `794ee309cae851ebcd48bb27e62cfc0a84a54c5b`, includes opt-in cross-process Pi session metadata, scoped interactive corrections, Git status hardening and integrity pin correction. Individual exact-SHA CI pending.
- T09: PR #42 at `2ffd97a2ad98b6c6c235447d557bca54c04d7a56`, includes defensive uninstall pathname revalidation. Individual exact-SHA CI pending.

## Acceptance scope

The combined `tests/t12-integrated-boundaries.test.ts` exercises a real disposable Git repository, read-only CodeGraph without auto-init, one-use workspace correction with Git status, isolated one-use session metadata consent, and rejection of uninstall for a foreign installation while preserving foreign data. It is an integration smoke, not a substitute for real TUI, live provider interruption, a complete version-pinned reference implementation, hostile same-user filesystem confinement, or independent R4.

## Gates

Exact-SHA CI, release packaged smoke, Pi support matrix on Linux/Windows/macOS, and independent risk review must succeed before a final acceptance claim. T09/T10 can remain PARTIAL even if this integrated smoke passes. This candidate does not authorize merge to main or changes to unrelated user environments.
