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

## Primary permission modes (reference-mode compatibility — partial)

- `/asen-mode status` — show live mode, saved default and Auto availability
- `/asen-mode normal` — return this primary TUI session to manual permissions
- `/asen-yolo enable` — allow narrowly scoped routine feature-branch pushes without repeated confirmation
- `/asen-yolo disable` — revoke that session's YOLO permission
- `/asen-mode default yolo` — save the preference for eligible future primary TUI sessions (current mode unchanged)
- `/asen-mode default normal` — restore the safe default

Only the live primary Pi TUI can change these permissions. YOLO does **not** waive destructive operations, human restrictions, native Writer consent or agent-child boundaries. `auto` uses an independent check with the selected Pi model, but only when its registered costs are explicitly zero. Without a live human request, a free model, a valid verdict or unchanged session/action, Auto denies the tool. Auto adds model inference overhead and is not yet feature-equivalent to the full upstream classifier. `super-yolo` is not implemented. Neither mode guarantees unattended end-to-end correction today. See `odd/tasks/asen-permission-modes-2026-11-03.md`.
