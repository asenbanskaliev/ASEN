---
id: "F4-WIN-T10"
fase: "F4"
prioridad: "P0"
estado: "blocked"
depends_on: ["F4-01"]
sha_base: "149f3d90c9549f99c898c464a8a16b6590948762"
archivos_editables: ["scripts/t10-real-pi-tui-matrix.mjs","scripts/t10-git-row-validation.mjs","tests/t10-git-row-validation.test.ts","odd/tasks/hardening-exact-sha-r4/F4-WIN-T10.md","odd/tasks/hardening-exact-sha-r4/F4-02.md"]
archivos_prohibidos: ["extensions/authority.ts","src/agents/pi-authority-assets.ts","src/agents/pi-process-runner.ts","package.json","package-lock.json","extensions/asen.ts","src/runtime/responsive-layout.ts"]
---
# F4-WIN-T10 — Comparación segura de rutas del detector Git

## Evidencia inicial
CI 41297286880, job 124820680870, SHA 149f3d90c9549f99c898c464a8a16b6590948762: t12-real-pi-tui Windows CANCELLED tras registrar T10_REAL_PI_TUI_MATRIX_WRAPPED; fila changes/git de ancho visible 109 sobre terminal de 120, pathEquivalent=false, reason=path_shape_mismatch. El proceso node-pty emitió AttachConsole failed en varias ocasiones. La causa precisa de la divergencia de rutas NO se ha demostrado todavía.

## Cambio candidato acotado
El detector anterior comparaba el sufijo de la línea completa con la ruta de proyecto. La normalización anterior sustituía únicamente parejas de barras invertidas y no contemplaba las diferencias de mayúsculas de Windows. Se introduce la extracción explícita de la ruta mostrada, la comparación sensible a plataforma y, como alternativa, la comprobación de destino canónico mediante realpathSync; las rutas verdaderamente distintas y los excesos de ancho siguen rechazados. Se añaden diagnósticos del primer carácter distinto sin publicar rutas completas adicionales.

No se ha modificado la representación de ASEN, los anchos de la matriz ni los límites de permisos. Esta corrección es una HIPÓTESIS respaldada por tests deterministas, no una demostración del origen del fallo remoto.

## Evidencias y cierre
- 5 pruebas deterministas puras: PASS local con Node 22.16.0; no equivale a la suite oficial Node >=22.19.0.
- Matriz completa Pi 1.2.0 Windows en este candidato: NO EJECUTADA localmente en este entorno.
- Nueva CI exact-SHA Windows: PENDIENTE.
- AttachConsole failed: incidencia independiente pendiente de aislamiento; no se silencia.
- F4-02 permanece BLOCKED. No FULL sin resultado exact-SHA y auditoría independiente.

## Revisión del bloqueo en SHA 289e27c — Windows 8.3

CI exacta 41300749078, job 124830945008, CANCELLED. El detector registró una línea de 109 columnas para un terminal de 120 y `path_shape_mismatch`. La ruta visible tenía 70 caracteres, la ruta esperada 67; primera diferencia en posición 15: `a` frente a `~`. Esto es coherente con el alias Windows 8.3, pero la identidad del directorio requiere prueba real en el runner.

**Corrección mínima:** el validador del renglón Git compara primero texto normalizado, luego `realpathSync.native`, y después `statSync({bigint:true})`. Se exige que ambos destinos sean directorios con `dev`, `ino` no cero y `birthtimeNs` coincidentes; si no se puede probar, el resultado sigue siendo rechazo. No se modifica `extensions/asen.ts`, el presupuesto de ancho, los permisos, la política de authority ni las dependencias. La tarea correctiva depende de F4-01; F4-02 continúa bloqueada hasta que el runner la verifique.

**Pruebas aisladas**: nueve casos con Node 22.16.0, 9 PASS, incluyendo falso positivo 8.3 mediante simulación de metadatos, carpetas distintas, datos no fiables, ruta ausente, desbordamiento auténtico y plataformas POSIX. No constituye prueba de Windows real sobre el nuevo SHA.

**Incidencia separada:** `node-pty: AttachConsole failed` persiste en la ejecución remota previa. No se cambia ni se silencia; diagnosticar por separado. Revisión independiente pendiente.
