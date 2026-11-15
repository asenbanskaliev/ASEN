# ASEN Quick Commands

This is a short, simple guide for daily work. Use these commands instead of memorizing long ones.

## Quick Start

- `/asen-status` -> see current state
- `/asen-commands` -> list all ASEN commands
- `/asen-profiles` -> switch model/work profile
- `/asen-persona` -> professional or neutral
- `/asen-memory` -> save/find project memory
- `/asen-changes` -> see and fix workspace changes
- `/asen-review` -> review scope
- `/asen-doctor` -> health checks

## If You Don't Remember

Run `/asen help` or `/asen-commands` and choose the listed name.

## Daily Checklist

1. Check status
2. Make change
3. Run test
4. Close only when passing

## Primary permission modes

Select permissions in the live primary Pi TUI:

- `/asen-mode status` — show current session mode, user-global default and separate Auto usage
- `/asen-mode normal` — the ordinary confirmation policy
- `/asen-mode auto` — independent model review of eligible tool calls, using the selected model only when its cost is explicitly declared as zero
- `/asen-mode yolo` — routine authorized primary work with scoped reversible non-force delivery; destructive confirmation remains
- `/asen-mode super-yolo` — deliberate high-autonomy primary session; routine and recognized destructive confirmations are waived, **but hard-denied catastrophic commands, private credential access and independent consent are not**
- `/asen-yolo enable | disable | status` — session-only YOLO shortcut
- `/asen-mode default normal | auto | yolo | super-yolo` — save future-session preference, without changing the current session
- `/asen-customize permissions` — use the interactive menu to set session or future default

Only an interactive, identified primary Pi TUI can change mode/default. Headless tools, child agents, repo config and transcripts cannot select elevated mode. A human's explicit restrictions, child Writer authorization, independent result/recovery consent, and hard security boundaries remain in force.

**Auto:** One independent tool-free classifier call evaluates each eligible action. Unknown, nonzero or missing model cost, missing live human intent, private text, provider failure, timeout, changed action/model/mode/session, or malformed verdict means DENY. Extra calls have their own token accounting. The reviewer can read a tiny bounded local script or package manifest as untrusted evidence, not as a grant. This is not an OS sandbox.

**YOLO:** The default waiver is restricted to single or simple compound literal commands whose entire set consists of recognized routine operations (builds/checks, selected Git commits/rebases/feature pushes, and `gh pr create --fill`). A session-owned `mktemp` scratch directory can be removed without a destructive dialog when the host verifies ownership and exact target; other broad deletions still ask or block. No force pushes, main-branch delivery waiver, arbitrary shell wrappers or bypasses through pipes.

**Super YOLO:** Explicitly increases risk. It cannot disable code-level hard denials (`git reset --hard`, forced Git clean/push, deletion of root/home, forced branch deletion), sensitive credential-path protection, or native human-owned consent tools. Shell recognition is lexical and does not provide OS isolation. Use a disposable workspace and scoped credentials for untrusted commands.

See `odd/tasks/asen-permission-modes-2026-11-03.md` for validation gaps and exact parity status.
