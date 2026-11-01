---
id: "T10-WIN-DETECTOR-01"
fase: "F4-correction"
prioridad: "P1"
estado: "pending-verification"
depends_on: ["F4-02"]
sha_base: "5aeafad63a1abdc47039898c4d82ac2cb64b6fc0"
archivos_editables: ["scripts/t10-real-pi-tui-matrix.mjs", "odd/handoffs/hardening-exact-sha-r4-resume.md", "odd/tasks/hardening-exact-sha-r4.md", "odd/tasks/hardening-exact-sha-r4/T10-WIN-DETECTOR-01.md"]
archivos_prohibidos: ["extensions/authority.ts", "src/agents/pi-authority-assets.ts", "src/agents/pi-process-runner.ts", "package.json", "package-lock.json", ".github/workflows/ci.yml"]
red_command: "N/A: correction detected via CI artifact 41291213760/124802716686; original detector expected ASCII dot while truncateForTerminal returns U+2026 ellipsis"
green_command: "node scripts/t10-real-pi-tui-matrix.mjs 120,80,60,40"
regression_commands: ["node --check scripts/t10-real-pi-tui-matrix.mjs", "npm run typecheck", "git diff --check"]
go_criteria: "Local matrix PASS in all 4 widths; CI exact SHA must confirm before promoting F4-02."
nogo_criteria: "Do not claim CI PASS from local evidence; AttachConsole remains open."
horas_estimadas: 0.50
commit_message: "docs(odd): record T10 Windows detector correction"
resultado: "PASS local 2026-11-01, CI unverified"
---

# T10 Windows detector

Root cause demonstrated: `truncateForTerminal` returns U+2026 ellipsis ("…"), while the matrix detector only accepted ASCII `"."`. At CI width 120 the row ended in "…", so it was falsely classified as wrapped even though its visual width (109) fits the terminal budget.

Correction: normalize path representations for comparison and accept either full path or one visible ASEN ellipsis. Added diagnostics (visible width, terminal width, path equivalence, reason).

AttachConsole is logged as possible exception during node-pty child teardown and is not treated as the cause of the failure.
