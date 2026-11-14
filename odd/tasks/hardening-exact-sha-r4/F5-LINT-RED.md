---
id: "F5-LINT-RED"
fase: "F5"
prioridad: "P0"
estado: "in_progress"
depends_on: ["F5-01"]
sha_base: "8fd4f8b25f3fe88eea7d6f40ef44820f3cc4b413"
archivos_editables: [".github/workflows/gsp-05e-authenticated-rdd.yml",".github/workflows/pi-free-smoke.yml",".github/workflows/release-gate.yml","tests/f5-exact-sha-gates.test.ts","odd/tasks/hardening-exact-sha-r4/F5-LINT-RED.md","odd/tasks/hardening-exact-sha-r4/F5-01.md","odd/tasks/hardening-exact-sha-r4.md","odd/handoffs/hardening-exact-sha-r4-resume.md"]
archivos_prohibidos: ["extensions/asen.ts","extensions/authority.ts","src/agents/pi-authority-assets.ts","src/agents/pi-process-runner.ts","package.json","package-lock.json"]
---
# F5-LINT-RED — Corregir los cuatro avisos reales sin apagar actionlint

## RED demostrado

CI F5 exact-SHA static verification run 41311756034, job 124863417768 sobre SHA 8fd4f8b25f3fe88eea7d6f40ef44820f3cc4b413: authority-pin SUCCESS, actionlint FAILURE. actionlint real v1.7.12 instalado y ejecutado; exactamente cuatro hallazgos ShellCheck en tres workflows:
- .github/workflows/gsp-05e-authenticated-rdd.yml:22 — SC2266, tubería git status hacia test que no comprueba fiablemente el estado; se sustituye por test -z con sustitución de comando, para fallar ante un árbol sucio.
- .github/workflows/pi-free-smoke.yml:76 — dos SC2155, separar export y asignación de ASEN_RECOVERY_FILE y ASEN_RECOVERY_KEY, preservando valores y cleanup.
- .github/workflows/release-gate.yml:44 — SC2016, plantilla JS con signo de dólar dentro de una orden node -e entre comillas simples; sustituir únicamente por concatenación JS equivalente.

## Condiciones de aceptación

No desactivar ShellCheck ni usar ignore/continue-on-error, no modificar admisión de proveedores, secretos ni triggers. Mantener la versión de Pi 1.2.0, la seguridad y los límites existentes.
Test de regresión en tests/f5-exact-sha-gates.test.ts. GREEN solo con job actionlint real SUCCESS en nuevo SHA y CI/Release Gate normales PASS. No FULL sin auditor R4 externo.

Evidencia RED: run 41311756034, authority-pin SUCCESS, actionlint FAILURE. GREEN en nuevo SHA: PENDIENTE. Ningún modelo/proveedor usado, sin merge ni release.
