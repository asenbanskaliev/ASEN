# T09 — Plan de ejecución autónoma y cierre verificable

## Estado y alcance

Este plan se fija sobre PR #37, rama `feat/t09-managed-update-stage`, HEAD remoto observado `3635ca8e2ef0a206ac2cbe74f5f098486c28a09c`. En ese SHA los workflows observados (CI, Release Gate, Phase 0 Architecture y Pi 1.2 runtime evidence) terminaron en éxito; Pi Free Smoke fue omitido por condición. Esos resultados no prueban el ciclo de mantenimiento ni corrigen el histórico de Windows.

T09 permanece **PARTIAL** hasta demostrar instalación limpia de paquete real, autenticidad y adquisición, actualización/rollback, backup/restauración, desinstalación con preservación de datos, navegador real donde corresponda, plataformas requeridas, auditoría R4 y CI verde en el SHA final. Este plan no autoriza merge a `main`, releases, mutaciones de instalaciones personales, cambios de permisos para forzar tests ni debilitamiento de validaciones.

## Reglas de ejecución

1. Trabajar únicamente en la rama y PR existentes. Antes de cada tanda, reconciliar HEAD remoto con el árbol local y preservar cambios concurrentes.
2. Mantener paquetes, homes, datos, claves de prueba, SQLite y temporales bajo directorios desechables del propio test. No usar credenciales reales ni claves privadas de producción.
3. Primero reproducir; después corregir la causa mínima; conservar prueba de regresión que falle con el comportamiento previo y pase tras el arreglo.
4. No elevar timeouts como remedio sin evidencia de que el límite era incorrecto. No ampliar permisos ni eliminar controles de seguridad.
5. Hacer commits coherentes con código, regresiones y actualización de evidencia. Evitar commits de documentación aislados y no lanzar workflows manuales repetidamente.
6. Usar Work para inspección, implementación y pruebas disponibles localmente; CI para Windows/Linux/macOS. Una prueba HTTP no se contabiliza como apertura real de navegador.
7. No volver a ejecutar un job fallido hasta revisar logs, artefactos y causa probable; reintentar solo tras una corrección o demostrar fallo transitorio del runner.

## Fase 0 — Baseline del candidato

**Work:** leer `AGENTS.md`, `docs/remote-continuation.md`, el ODD canónico, mapa de paridad, `docs/installation.md`, package scripts y workflows. Comparar código, tests y recibos con el HEAD remoto; identificar si las 14 pruebas Windows siguen fallando, los nombres exactos, jobs, comandos y último punto observado.

**Criterio:** tabla de requisitos T09 con estado `demostrado`, `pendiente` o `bloqueado`, SHA y evidencia asociada. Las entradas históricas se conservan; la evidencia de otro SHA no se atribuye al candidato actual.

## Tanda A — Windows y estabilidad

### A1. Diagnóstico reproducible

En el log original, enumerar las 14 pruebas y operación que realizan. Revisar spawn/exec, cierre de stdout/stderr, hijos y descendientes, handles abiertos, temporales, canonicalización de rutas, rutas 8.3, permisos, limpieza y coste de arranque de Pi/tsx/runner. No asumir causa por el mero uso de nombres cortos.

Si no hay Windows local, instrumentar solo las pruebas implicadas con etapas y duraciones, ruta temporal absoluta/canónica, PID, eventos de salida/cierre y resultado de cleanup; evitar datos sensibles. Ejecutar una vez el job Windows controlado para capturar diagnóstico completo.

### A2. Corrección causal y regresión

Crear primero el caso mínimo que reproduce el bloqueo, corregir el origen más pequeño (CLI, test harness, proceso hijo o fixture) y añadir regresión con rutas relevantes: 8.3/canónica, espacios y caracteres soportados, además de control de fin del proceso y ausencia de residuos. Mantener los mismos límites salvo que mediciones repetibles justifiquen otro valor. Confirmar que no hay handles/streams que mantengan vivo al proceso.

### A3. Validación local enfocada

Ejecutar las 14 pruebas y su familia, tests de procesos/CLI relacionados, typecheck, build y `git diff --check`. Revisar efectos de filesystem y cleanup incluso cuando el test falla. Adjuntar una nota de causa con tiempos observados antes/después.

**Salida de Tanda A:** causa respaldada por logs, regresión reproducible, corrección probada localmente y job Windows verde. Si el runner revela un bloqueo externo, conservar el log y declarar el impedimento concreto; no atribuir PASS.

## Tanda B — ciclo funcional y seguridad

### B1. Paquete e instalación

Desde el checkout limpio y lockfile, generar el paquete real y guardar su SHA. En un home temporal vacío, instalar con el flujo soportado; verificar manifiestos/recibos, archivos, precedencia de config, permisos esperados, espacios/Unicode y arranque con Pi 1.2.0. Repetir instalación para idempotencia. Interrumpir una instalación desechable en puntos seguros y verificar recuperación sin adoptar archivos ajenos. Diferenciar `verify:pack`/fixtures del test de instalación ejecutada.

### B2. Confianza y actualización

Usar una clave de prueba Ed25519 generada para el test y anclaje de confianza explícito. Verificar manifiesto y bytes del paquete antes de ejecutar o activar. Cubrir firma inválida, bytes alterados, clave desconocida/revocada, manifiesto inconsistente y descarga truncada. Instalar versión A, adquirir/verificar versión B por el canal real admitido, preparar y activar B, ejecutar y comprobar identidad/versión. Inducir fallo controlado y verificar rollback a A, no replay/ejecución duplicada y datos invariantes. No confundir staging, selección, activación, readiness ni rollback de versión con restore de datos.

### B3. Backup y restauración

Poblar datos no sensibles identificables; crear backup con SQLite activo mediante estrategia definida (API de backup/snapshot consistente o cierre coordinado comprobado); verificar formato, integridad y hashes/manifest según diseño. Restaurar a instalación limpia y comparar registros/archivos antes-después. Probar truncamiento/corrupción, espacio/permiso insuficiente e interrupción durante copia/commit. Exigir que el destino previo siga válido o que el estado parcial quede claramente recuperable; ninguna restauración debe seguir enlaces/rutas sustituidas fuera de la raíz permitida.

### B4. Desinstalación

Instalar bajo raíz temporal que incluya vecinos ajenos y datos personales ficticios. Desinstalar y comparar inventario: desaparece únicamente el componente propio reconocido por identidad/recibo; permanecen configuración personal, proyectos y datos que el contrato conserva. Probar interrupción/reanudación, symlink/junction, renombrado/reemplazo entre validación y borrado y carrera de mismo usuario. Ante identidad incierta, fallar cerrado y conservar desconocidos. No cambiar ACLs para facilitar limpieza; restaurar fixtures solo con identidad y propiedad positivas.

### B5. Asistente de navegador

Automatizar consentimiento permitido/denegado, cancelación, cierre, expiración, error y puerto ocupado; comprobar callback de interfaz local prevista, validación anti-CSRF/state, no exposición de secretos, límite de espera y limpieza del listener. Registrar claramente que son pruebas HTTP automatizadas. En host interactivo, hacer recorrido adicional que confirme apertura real del navegador, consentimiento, retorno/cancelación y estado resultante. Si no existe host gráfico, queda pendiente esa evidencia, no se simula.

### B6. Auditoría R4 independiente

Revisar en código y pruebas: Ed25519 y trust anchors; formato/fijación/rotación/revocación de claves; autenticidad y bytes descargados; no ejecución antes de validar; symlinks, junctions, traversal y carreras; límites de propiedad/desinstalación; atomicidad, integridad y recuperación de backup; cierre SQLite; rollbacks y datos; comportamiento POSIX/Windows/macOS; duplicidad y complejidad accidental. Cada hallazgo se registra con severidad, escenario, impacto y prueba; Critical/High debe corregirse antes de aceptación. Diferenciar hallazgos de código de falta de evidencia de host.

## Validación final y CI

1. Ejecutar primero tests enfocados por cambio; luego `npm run typecheck`, `npm run build`, suite `npm test`, auditorías del proyecto, `npm run verify:pack`, `npm run verify:pi-matrix` y controles aplicables declarados en `package.json`/workflow.
2. Publicar código, regresiones, docs de comportamiento y recibos reales en un commit coherente del PR existente.
3. Ejecutar la ronda final de workflows obligatorios una sola vez sobre ese SHA. Confirmar CI y Release Gate en Windows, Linux y macOS, además de Architecture y Pi 1.2 runtime evidence. Pi Free Smoke omitido por condición se registra como omitido, no como aprobado.
4. Para fallos, inspeccionar logs/artifacts/step output antes de actuar; corregir y volver a ejecutar solo validación afectada y la ronda necesaria para el nuevo SHA final.
5. Actualizar el ODD canónico, el mapa y `docs/installation.md` solo con resultados comprobables y SHA/artefacto. No tocar el preámbulo binario del ODD como texto UTF-8: preservar bytes o usar una edición binaria controlada y validada.

## Evidencia mínima de entrega

| Requisito | Evidencia necesaria |
|---|---|
| Windows | Lista de 14 pruebas, causa soportada, regresión y job Windows verde en SHA final |
| Instalación | Artefacto real con SHA, instalación limpia ejecutada, arranque y reinstalación |
| Confianza/actualización | Firmas y bytes validados, versión B ejecutada, rechazo negativo y rollback probado |
| Backup/restore | Backup íntegro y SQLite consistente, restore en entorno limpio y comparación de datos; corrupción/interrupción cubiertas |
| Desinstalación | Inventario antes/después, datos conservados, interrupción/reanudación y sustitución/race probadas |
| Navegador | Tests automatizados identificados y recorrido de apertura real en host interactivo |
| Plataformas | CI obligatorio verde en Windows, Linux y macOS sobre SHA final |
| R4 | Informe ligado al candidato y sin Critical/High pendientes |

Si cualquiera de estos elementos no se puede ejecutar o falla sin resolver, mantener T09 **PARTIAL** y nombrar el requisito pendiente. Solo todos los criterios demostrados permiten proponer `FULL`; CI verde por sí solo no basta.

## Límites de autorización

Autopiloto permite implementar, probar y publicar una tanda en el PR #37 existente. No permite merge a `main`, release, instalar/desinstalar software del host, usar claves de producción, elevar permisos, limpiar rutas no identificadas ni omitir pruebas requeridas. Las operaciones de mantenimiento se limitan a entornos desechables creados por la prueba.

## Evidencia obtenida al iniciar la ejecución

El log del workflow CI `40403608285`, SHA `037f17317631e1231d161b130d83e9667336fba1`, confirma que el job `test (windows-latest)` falló durante `Full test suite`. Catorce casos de ejecución CLI administrada agotaron aproximadamente 10 segundos; el reporte de observación mostraba un único intento, `SIGKILL` y streams vacíos, y un caso no llegó a crear su marcador `READY`. Los casos fueron:

- `concurrent CLI probes serialize actual package execution`
- `release uncertainty never erases already executed CLI output`
- `managed CLI output overflow is capped and remains ambiguous`
- `managed CLI cancellation after program readiness closes without a false observation`
- `managed CLI post-execution drift is ambiguous and changed data is not repaired`
- `managed CLI retains unknown temporary bytes while observing only the CLI version`
- `managed CLI observes exact version and fixed private invocation` (incluida variante Unicode)
- `managed CLI refuses version-mismatch`, `stderr-not-empty` y `exit-mismatch`
- `public managed run launches the exact selected owned CLI once with protected argv and empty child streams`
- `a successful prior probe is one inert trace, not selection or launch permission`
- `one public child close followed by uncertain lease release is exact ambiguous evidence and never retries`

El historial muestra dos defectos del camino de lanzamiento de Windows. **Causa principal:** `spawnContainedWithInheritedPolicy` delegaba en PowerShell y un puente C# `Add-Type` para lanzar el proceso suspendido bajo Job Object. En hosted runners ese puente podía quedarse esperando con el hijo suspendido; la operación administrada no llegaba a ejecutar su CLI y alcanzaba su deadline normal de 10 s. El arreglo evita el puente PowerShell en ese camino y usa `spawn` nativo de Node con `shell:false`, `detached:false` y el entorno/política heredados; los llamadores siguen esperando el cierre y terminan el árbol al cancelar o agotar el deadline (`5223c83`, `72cebf0`, `6ffd848`). No se elevó el timeout ni se añadió un fallback de shell. **Defecto secundario:** `realpath` podía devolver alias DOS 8.3 usados como `cwd`/argv; el código conserva el path físico para validar ownership y usa el absoluto léxico para lanzar (`edcaad4`). El bootstrap mínimo de entorno Windows (`SystemRoot`, `ComSpec`, PATH del sistema) y comparación case-insensitive de sus claves se preservan donde corresponde (`973de8b`, `71656e3`). Así que sí hubo un bloqueo real en el puente de proceso, no un deadlock de la lógica del CLI; los logs muestran que el script administrado no arrancaba y que el test no llegaba a crear `READY`. El límite de 10 s sigue siendo una protección válida, no un remedio que haya que ampliar. El test de deadline de 7 s es un caso negativo deliberado y separado.

En el CI de PR del SHA `3635ca8e2ef0a206ac2cbe74f5f098486c28a09c` (run `40571444978`), Windows terminó con éxito. Los mismos escenarios relevantes pasaron en ese host: probes/ejecución normalmente entre ~0,1 y 1,6 s; el test deliberado de deadline tardó ~7,2 s. Esto es evidencia Windows real de la corrección, aunque aún se añade abajo una aserción dedicada para la ruta léxica.

En entorno Linux, `node --import tsx --test tests/managed-*.test.ts` pasó 272/272 y `tests/t09-lifecycle.test.ts` pasó 24/24. `npm run typecheck`, `npm run build`, `git diff --check` y `npm run verify:pack` pasaron en el árbol cuyo código coincide con el tree del SHA `3635ca8`; verify-pack instaló el paquete npm real y validó 28 exports, 11 comandos y 16 herramientas. También se ejecutó `npm pack`, instalación npm desechable y `scripts/t09-real-package-smoke.mjs`: `PACKED_PACKAGE_SMOKE_PASS`, con firma Ed25519 efímera explícita, instalación, doctor, CLI, backup/verificación, restore limpio, uninstall y conservación de datos.

La ejecución nueva de `npm ci` en worktree limpio no se completó: la compilación nativa de `node-pty` falló al extraer headers de Node con `TAR_ENTRY_ERROR EINVAL: invalid argument, fchown`. No se alteró el lockfile ni se omitieron scripts para convertirlo en un falso PASS. Después se extrajeron los headers de Node al directorio temporal usando `tar --no-same-owner`, y `npm_config_nodedir=/tmp/nodehdr npm ci` completó con los scripts normales (124 paquetes); el fallo inicial fue específico de `fchown` en este contenedor. En Linux, la regresión específica de alias 8.3 añadida al test se omite intencionadamente por no ser Windows; requiere CI Windows.

Estas pruebas de ciclo y del paquete son evidencia real en directorios desechables, pero no demuestran apertura real de navegador, adquisición remota TLS en host, ni la matriz del candidato final después de la regresión nueva. Por eso T09 sigue PARTIAL.

## Exact candidate audit update — 2026-10-28

Initial remote HEAD: `c0d5caa0dbe7e4da835af5681b7396d2307fb532`. Diagnostic candidate: `c3da3bd40faf644a897241580b751e882dae4e91` (one commit on the existing PR branch). The Windows `package (windows-latest)` failure was in `verify:package-receipts -- stateful-evidence`: the Pi verifier child remained open after stdin EOF past the unchanged 5-second grace, was killed, and triggered the intended forced-shutdown assertion. The available original artifact lacks process/stream lifecycle events, so the lower-level reason (Pi/extension cleanup versus runner timing) cannot be distinguished.

The candidate adds bounded failure diagnostics (process/stream lifecycle and opt-in static shutdown-stage names) and a regression that proves forced kill cannot become natural-exit evidence. Release Gate on the exact candidate passed the real packed Pi package install/restart/cross-session jobs on Windows, Linux and macOS, with three natural process exits. The adjacent real-package smoke passed local signed install, doctor/CLI, backup verification, clean-target data/config restore, managed uninstall and sample user-data preservation on all three OSes (artifacts `12802685497`, `12802520922`, `12801479491`; Node 22.23.3 Ubuntu/macOS, 22.23.4 Windows; Pi 1.2.0). No shutdown behavior or timeout was changed, so classify the historical failure as **not reproduced**, not fixed. Local Linux verification on the candidate passed `npm run check`, `npm run verify:pack`, and the four Linux Pi 1.2 matrix host cells (TUI, RPC, JSON, print). CI was still running at `40657477741` when this note was prepared; replace this provisional status only after querying the exact SHA.

R4 review of this diagnostic delta: architecture reuses the existing verifier settlement helper; security output is limited to static lifecycle stage names and process/stream state; failure remains fail-closed; no retry or timeout extension was added; instrumentation is opt-in and bounded. No critical/high finding identified in this delta. Medium residual: the underlying Windows close delay was not reproduced and remains unexplained.

The real packed-package smoke also executes a local signed install with a disposable Ed25519 key and explicit trust anchor, doctor/installed CLI checks, backup/integrity verification, clean-target restore with byte comparison, and managed uninstall while preserving user data on Windows/Linux/macOS. It does not acquire over HTTPS or upgrade/activate/rollback between versions. SQLite-active consistency, corrupt/interrupted restore recovery, symlink and concurrent-route uninstall protection, signature rejection/rotation or revocation, and real interactive browser opening remain outstanding or lack admitted evidence. Keep T09 PARTIAL; do not modify T05/T10/T11 status from this review.

R4 dependency audit residual: `npm audit --json` reports 1 moderate and 1 high finding under the disposable development/test host dependency `@earendil-works/pi-coding-agent@1.2.0` → `undici@8.10.2`, including TLS certificate validation bypass GHSA-2m5v-pch6-74hx. Pi imports Undici's HTTP dispatcher; the dependency is not bundled in the packed ASEN artifact because Pi is an optional peer. npm suggests Pi `0.75.3` as a major downgrade, which does not satisfy the required 1.2.0 baseline. No override or Pi substitution was used to hide this inherited host risk. Keep T09 PARTIAL pending a supported Pi-side remediation and exact-candidate verification.

## Continuation checkpoint — 2026-10-28

Remote HEAD was reconfirmed as `425170f02db2fa69327d4cc415b059a09ce004ec`; the tree was clean before this continuation. Added public CLI loopback coverage for signed A→B HTTPS acquisition, activation and rollback with user-data preservation, plus a real child-process check that rejects an untrusted TLS root without installation effects and succeeds when the test CA is explicitly trusted. The TLS key and certificate are test-only fixtures and are not package-signing credentials.

Local evidence on the candidate worktree: `tests/t09-lifecycle.test.ts` passed 26/26; the full suite passed 2,211 with 19 conditional skips and 0 failures; `npm run typecheck`, `npm run build`, `npm run verify:pack`, `npm run check`, and `git diff --check` passed. `verify:pack` installed and inspected the actual packed ASEN artifact (361 files, 28 public exports, 11 RPC commands, 16 tools). This smoke does not claim full installation/update/restore on Windows or macOS. The independent real-package lifecycle smoke remains the prior exact-candidate CI evidence and only covers local signed install, backup/verify, restore and uninstall, not network upgrade.

R4 note: the test Pi 1.2.0 dependency graph still reports one moderate and one high Undici advisory. The observed `http-dispatcher.js` configuration does not pass a function-valued TLS option relevant to GHSA-2m5v-pch6-74hx's stated bypass condition; the inherited high advisory remains unresolved, and no Pi downgrade/override was applied. This does not establish exploitability in every Pi request path or resolve the second advisory.

T09 remains **PARTIAL**, not FULL. Outstanding evidence includes exact-SHA CI after these tests, real-package HTTPS A→B rollback on each supported OS, backup/restore interruption and corrupt-state recovery, SQLite-active consistency, uninstall symlink/concurrent-substitution attacks, actual browser opening, and supported Pi-side resolution/assessment of the inherited dependency advisory. Do not promote T05, T10 or T11 from this checkpoint.

## Real packed lifecycle follow-up — 2026-10-28

Extended `scripts/t09-real-package-smoke.mjs` to exercise the actual npm tarball through public signed acquisition, not only a package fixture. It installs the tarball in a disposable project, creates a versioned copy of that exact packed product tree (only `package.json` and the two compiled CLI version literals change), signs it with an ephemeral Ed25519 key, and serves declared bytes from loopback HTTPS using the test CA with normal TLS verification. The installed package upgrades 0.1.0→0.1.1, reports the new CLI version, preserves user data, and rolls back to 0.1.0. The same smoke tests a corrupt-backup restore with no target effects, retries with a valid backup to the same clean target, compares data/config, uninstalls and confirms data remains.

The initial real-tarball attempt exposed a test-harness deadlock: `execFileSync` held the parent event loop while its HTTPS server needed that loop to answer the child download. The managed CLI correctly reported acquisition failure; changing the harness to asynchronous `execFile` made the unchanged HTTPS contract pass. A second fixture issue was corrected by updating both compiled `--version` and lifecycle version constants; the managed candidate probe correctly rejected the inconsistent fixture before this correction. No production timeout or trust validation was changed.

Evidence: actual npm-packed ASEN tarball, Linux, Node 24.22.1; signed A→B HTTPS upgrade, selected CLI identity, rollback, data preservation, backup verification, corrupt restore no-effects and valid restore recovery all passed. `npm run typecheck`, `npm run build`, `npm run verify:pack` and the prior full `npm run check` passed; this script-only change is now in the worktree and requires exact-SHA CI. The new real-package cycle has not yet run on Windows/macOS. T09 remains PARTIAL pending that matrix, interrupted restore/SQLite evidence, concurrent-route uninstall assessment, real browser opening and the inherited Pi dependency risk.

### Release Gate follow-up diagnosis — 2026-10-28

Exact candidate `2d50f464bc054045d7ef57146f0f9dee9fc239d6` passed Phase 0 and Pi runtime evidence; Release Gate failed only in its real packed smoke on Ubuntu before reaching macOS/Windows. Full job logs showed `ENOENT` for `tests/fixtures/t09-loopback-test-key.pem`: the workflow invokes the smoke after changing `cwd` to its disposable npm project, while the script had resolved fixture paths relative to `cwd`. This is a test-harness path bug, independent of TLS validation/product behavior. The script now derives fixture paths from `import.meta.url`; the smoke passes locally when invoked with that same temporary cwd. The failed run is preserved; exact-SHA cross-platform Release Gate must be rerun on the corrected candidate. CI remained in progress at this note. Do not infer macOS/Windows result from the cancelled jobs.


## SQLite backup and handled-restore checkpoint — 2026-10-28

On PR #37 candidate base `9a235e15ce523c610cc7a5a726c77e8601fe2c13`, the T09 whole-home backup path now takes a bounded SQLite `VACUUM INTO` snapshot from a read-only connection. The regression keeps a live WAL open, proves a committed row remains in WAL, verifies that the backup contains only the consolidated database, and proves a later write is absent after restore while `PRAGMA integrity_check` returns `ok`. A second regression injects a handled staging failure, verifies the pre-existing target and its data survive, verifies owned staging is removed, then retries successfully and verifies the moved-aside target remains intact.

Evidence: focused lifecycle tests 4/4; full local suite 2,214 passed, 0 failed, 19 conditional skips; `npm run typecheck`, `npm run build`, and `npm run verify:pack` passed. `npm run check` and `npm run verify:pack` passed after the final source-path identity guard and child-process version regression; the full suite completed 2,214 passed, 0 failed, 19 conditional skips. The package smoke is synthetic for these API tests; it is not yet cross-platform real-package evidence for SQLite or abrupt interruption. The hook models a caught failure, not `SIGKILL`/power loss; publication-crash recovery remains an open criterion. T09 stays **PARTIAL** pending exact-candidate CI, abrupt restore interruption/recovery, real package/platform lifecycle evidence and other open R4 requirements. T05/T10/T11 are unchanged.


### Exact-candidate CI finding — 2026-10-28

First publication `49aa9e9c61cd01e82e4f78b724e4d8673b87fed3` passed Phase 0, Pi 1.2 runtime evidence, Linux packed restart/cross-session receipts and real Pi install smoke, but Release Gate's Ubuntu real-package lifecycle stopped during the initial version probe with `stderr-not-empty`. The log proves Node 22 emitted `ExperimentalWarning: SQLite is an experimental feature` because `node:sqlite` was eagerly imported by the whole-home backup module. CI's Linux and Windows full suites independently showed the same warning breaking 50 assertions that require a clean CLI stderr. The fix changes the runtime import to lazy loading after SQLite header detection; a child-process CLI version regression now checks zero stderr. This is a product module initialization side effect, not a timeout/runner failure. The first candidate's incomplete/cancelled platform jobs are not treated as passes; the corrected exact-candidate matrix is required.

## Follow-up execution — 2026-10-28

On the lazy-SQLite-import candidate, the exact Release Gate logs show Linux and Windows packed real-package smokes passing while macOS `managed upgrade` was killed by the harness at 60 seconds with empty streams. The product acquisition deadline is also 60 seconds, so the outer process was terminating at the same boundary before the inner timeout could report/clean up. This identifies the observed failure as a smoke-harness timeout collision; the reason macOS reached the inner deadline remains unproven. The smoke now gives that one child 75 seconds (60-second product bound plus bounded reporting/cleanup margin), and records loopback request paths and server TLS/client errors on failure. It does not increase the product timeout or retry the operation.

Local Linux proof on the actual npm tarball: signed HTTPS upgrade 0.1.0→0.1.1 and rollback, preserved user data, consistent backup while SQLite WAL is live, integrity-checked restore with snapshot-time rows only, corrupt restore with no effects and retry, managed uninstall retaining data. The lifecycle suite passed 30/30, including forced child termination during restore staging; this verifies the old target remains intact and retry succeeds, while explicitly exposing that a private unpublished stage can remain after SIGKILL. `npm run typecheck`, full `npm run check`, `npm run build`, `npm run verify:pack`, and final exact-candidate CI remain required before status changes. T09 remains PARTIAL pending the cross-platform receipts and other documented contract/R4 gaps.

## CI matrix follow-up — 2026-10-28

Release Gate on `12e3f08d57810bdb34aded2df3193699750d9c36` passed all real packed lifecycle jobs on Ubuntu, macOS and Windows. Phase 0 and Pi runtime passed; Pi support receipts passed all three OSes; Ubuntu's complete CI suite passed. macOS's full CI suite failed because the runner planned every test file as one `all` chunk. Its existing chunk watchdog expired at 600,183 ms / 600,000 ms, confirmed cleanup, and returned 124; no individual test assertion failed. RED reproduced the plan defect: 121 synthetic macOS test files incorrectly produced one run instead of three. GREEN now plans deterministic 50-file macOS chunks, preserving every test exactly once and leaving chunk/global watchdog limits unchanged. Focused planner tests passed 21/21. Re-run the complete local check and publish one corrective candidate; Windows full-suite result is still pending. Do not claim final CI until corrected SHA checks finish.

The same `12e3f08` Windows suite exposed a portability bug in the new SIGKILL regression: a drive-letter path was interpolated as an ESM module specifier, and Node 22 returned `ERR_UNSUPPORTED_ESM_URL_SCHEME` before the child reached staging. The regression now constructs a `file:` URL with `pathToFileURL`; the isolated lifecycle test passes on Linux. The planner regression also received explicit TypeScript types after the first validation pass stopped at typecheck. Re-run the consolidated validation on the corrected worktree; publish only after it passes.

Corrected worktree validation completed locally: `npm run check` passed 2,216 tests, 0 failures, 19 conditional skips; all declared parity/skills/memory/upstream-boundary audits passed, with ecosystem normative source proof explicitly NOT ADMITTED because the retained source repository is unavailable. `npm run typecheck`, `npm run build`, `npm run verify:pack` and `git diff --check` passed. The actual tarball smoke passed Linux Node 24.22.1 previously on the same package source; the current changes affect only test planning and regression portability. Exact corrective-candidate CI is still required.
