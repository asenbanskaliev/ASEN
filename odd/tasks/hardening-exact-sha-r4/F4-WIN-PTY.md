---
id: "F4-WIN-PTY"
fase: "F4"
prioridad: "P0"
estado: "done"
depends_on: ["F4-01"]
sha_base: "bb0510b3197d87fa1f30e1cc2a048e00d9b7b380"
archivos_editables: ["scripts/t10-real-pi-tui-matrix.mjs","scripts/t10-pty-shutdown.mjs","tests/t10-pty-shutdown.test.ts","odd/tasks/hardening-exact-sha-r4/F4-WIN-PTY.md","odd/tasks/hardening-exact-sha-r4/F4-02.md"]
archivos_prohibidos: ["extensions/asen.ts","src/runtime/responsive-layout.ts","extensions/authority.ts","src/agents/pi-authority-assets.ts","src/agents/pi-process-runner.ts","package.json","package-lock.json",".github/workflows/ci.yml"]
---
# F4-WIN-PTY — Cierre limpio del host Pi en la matriz T10

## Evidencia exacta de partida
Run 41302984068, job 124837596746, SHA bb0510b3197d87fa1f30e1cc2a048e00d9b7b380: pruebas T12 cancel/apply PASS; T10_REAL_PI_TUI_MATRIX_PASS para 120,80,60,40; node-pty emitió AttachConsole failed y el trabajo resultó CANCELLED tras el límite de 5 minutos. El registro no demuestra cuál de los recursos mantuvo abierto el job.

## Hipótesis y corrección de test
T10 llamaba child.kill() al terminar cada escenario y no esperaba onExit. T12 cerraba el host solicitando ctx.shutdown() desde Pi y esperando salida con código cero. Se instala un marcador temporal por ancho, que el probe de session_start detecta para solicitar ctx.shutdown(); el harness exige onExit(exitCode=0 y sin señal) en 15 segundos. Una salida forzada, error, timeout o ausencia de confirmación devuelve FAIL, no PASS.
El tiempo máximo de Actions no se aumenta; no se cambian producción, permisos, dependencias, proveedores, secrets ni los anchos de prueba.

## Verificación
Las seis pruebas unitarias puras de petición/cierre superaron node --experimental-strip-types --test con Node 22.16.0 en el entorno de este chat. No se dispone de la instalación Pi/nativa de Windows para demostrar el comportamiento ConPTY en local. Pendientes: CI exact-SHA en Windows sin CANCELLED, prueba Pi real, suite Node 22.19.0 y revisión independiente. El error AttachConsole no se silencia ni se atribuye como resuelto.
Estado F4-02: BLOCKED hasta los gates reales PASS.

## Cierre documentado de F4-WIN-PTY

- Evidencia final SHA `0b85676c0a879366051bf8c6e616101f73bdaa94`, CI 41307948302, job Windows `124852136544` SUCCESS. T12 cancel/apply PASS y T10 matrix PASS cuatro anchos con cierre `ctx.shutdown()` y espera `onExit`.
- No se observa `AttachConsole failed` en ese log. Esto prueba que la ejecución finalizó correctamente, aunque no demuestra de forma aislada la causa interna del error ConPTY histórico.
- **Resultado: DONE técnico**, con historial de fallos conservado. La independencia de la auditoría es un gate F5, no se declara aquí.
