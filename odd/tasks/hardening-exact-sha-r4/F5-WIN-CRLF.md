---
id: "F5-WIN-CRLF"
fase: "F5"
prioridad: "P0"
estado: "in_progress"
depends_on: ["F5-01"]
sha_base: "032934527afca2c238cfe7cdee47d3757a666fcd"
archivos_editables: ["tests/f5-exact-sha-gates.test.ts","odd/tasks/hardening-exact-sha-r4/F5-WIN-CRLF.md"]
archivos_prohibidos: ["src/","extensions/","package.json","package-lock.json",".github/workflows/"]
---
# F5-WIN-CRLF — Regresión de finales de línea Windows

- Evidencia RED exact-SHA: CI 41312104530, job Windows 124864516091, SHA `032934527afca2c238cfe7cdee47d3757a666fcd`, test 31 `F5 shellcheck corrections preserve branch cleanliness and provider-safe workflow semantics` FAIL, AssertionError `ASEN_RECOVERY_FILE=...\\n\\s+export`; contenido real con CRLF. 510 PASS / 1 FAIL / 1 SKIP en ese grupo. La comprobación `actionlint` y `authority-pin` ha sido SUCCESS en run 41312104555; T07 CLI tres SO PASS run 41312104546.
- Causa: el test compara LF literal mientras Git aplica CRLF a workflow YAML en Windows. Corrección mínima `\\r?\\n` y regresión para LF/CRLF y contenido incorrecto.
- Evidencia local focalizada del patrón: 2/2 LF/CRLF PASS Node 22.16.0. No se ejecutó la suite completa de ASEN localmente; CI nuevo SHA pendiente.
- Sin cambio de workflow de producción, proveedores, permisos, PIN ni auth. Estado IN_PROGRESS hasta CI Windows real. R4 independiente aplazado por instrucción del propietario, nunca PASS.
