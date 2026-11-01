# ASEN — Handoff de reanudación hardening exact-SHA R4

## Estado inicial

**PREPARADO, SOLO DOCUMENTACIÓN.** No ejecutar F0-02 ni implementación hasta confirmación posterior del propietario. Fuente global: `AGENTS.md`, `docs/remote-continuation.md`, `odd/tasks/pi-capability-completion.md`; plan específico: `odd/tasks/hardening-exact-sha-r4.md`.

- Repo `asenbanskaliev/ASEN`, rama `feat/t12-integrated-acceptance-merge`.
- SHA antes del único commit de preparación: `dc47d8d9b2ead9423a0a613e5cad6ce6ca5233f1`; obtener **nuevo HEAD** tras publicar docs, no volver a suponer que el anterior es HEAD.
- CI anterior: CI/Release Gate/Phase 0/Pi runtime PASS; jobs especializados T07/T12 SKIPPED; no se han ejecutado tests nuevos ni proveedores en preparación.
- Working tree local y Node/npm/Pi en el host: NO VERIFICADOS, primer trabajo de F0-01.
- Ningún subagente independiente ejecutado en esta preparación; la revisión del código para la matriz fue estática.

## Algoritmo seguro del próximo ejecutor

1. Leer en este orden AGENTS, remote-continuation, ODD canónico, plan hardening y esta hoja.
2. Comprobar confirmación del owner y recoger HEAD remoto/local, árbol limpio, versiones y estado PR.
3. Primera tarea `F0-01` (pending), después primera `pending` con todas dependencias `done|noop`; usar microarchivo con frontmatter como allowlist.
4. Reconciliar SHA del microarchivo con nuevo HEAD documentado (SHA inicial es histórico), no continuar ante deriva de terceros.
5. Aplicar ODD+TDD: defecto → RED causal → mínimo GREEN → regresión; caracterización ya GREEN → NO-OP justificado.
6. A0 único integrador; A1/A2/A3 lectura, A4 escritor con allowlist, A5 revisor independiente separado. Si no disponible, self-audit documentado y gate independiente BLOCKED.
7. `git diff --check`, no archivos fuera de allowlist, no repin ni cambio de authority/Dispatcher/store sin tarea nueva.
8. Un commit por microtarea con cambios de estado, evidencia y handoff; consolidar CI por tandas y validar jobs sobre SHA exacto; no merges, release, proveedor ni cuotas.

## Decisiones congeladas

- F0-02: `tests/provider-scope.test.ts` añade `assert.doesNotMatch(workflow, /==\\s*"[^"]+"/)`; RED antes de corregir solo las comillas en GSP-06, GREEN y actionlint disponible. No cambiar trigger, expected_sha ni ramas permitidas.
- F0-03: test nuevo `tests/ci-specialized-gates.test.ts` caracteriza reglas vigentes y debe GREEN; F0-04 introduce expectativa nueva RED, modifica `ci.yml` y logra GREEN.
- F0-04: añadir rama exacta `feat/t12-integrated-acceptance-merge` en jobs T07 integrado y T12 security/TUI conservando `github.event_name == 'pull_request'` y same-repo; requiere PR real; jamás `startsWith` ni fork.
- F1: cinco regresiones históricas, GREEN esperado; NO-OP si ya cubierto.
- F2: DAG y grants/leases solo pruebas o NO-OP, sin refactor producción.
- F3: seis PARTIAL R4-06/08/10/11/18/20, con archivo test exacto, no duplicar.
- F4: T07 `workflow_dispatch` CLI 3 OS con head_sha y **también** T07 ASEN/Pi integrado; T12 security Ubuntu y TUI 3 OS, más CI general 3 OS.
- F5: typecheck/build/check/check:authority-pin/verify:pack, Phase 0/CI/Release/Pi evidence, auditor independiente y 14 criterios FULL; skipped/waived nunca PASS.

## Campos a actualizar por A0 (en el siguiente commit de microtarea)

| Elemento | Estado |
|---|---|
| Estado global | F0-01 DONE (baseline remoto), F0-02 pendiente de GREEN exacto |
| Próxima microtarea | F0-02, autorización del owner recibida en este turno; GREEN exacto obligatorio |
| SHA original fuente | `dc47d8d9b2ead9423a0a613e5cad6ce6ca5233f1` |
| SHA del commit documental | consultar HEAD remoto inmediatamente después de publicación |
| SHA último ejecutado | a2a4765d1c7a4b577d63b3794bfa2fe7abebcfdc (baseline remoto, sin test local) |
| Tests de implementación ejecutados esta sesión | ninguno |
| Trabajos de proveedor ejecutados | ninguno |
| Editor de `odd/tasks/pi-capability-completion.md` | no autorizado en este plan salvo ampliar allowlist futura |
| Bloqueo | Solo avanzar si tests focalizados GREEN con Node/tsx compatibles y sin archivos fuera de allowlist; aquí no hay checkout ni tsx |

**STOP/BLOCKED**: árbol sucio ajeno, SHA desconocido, RED inesperado, GREEN fallido, cambio de hashes/authority, necesidad de múltiples subsistemas, PR inexistente para gate, cuota/proveedor, merge/release o consentimiento pendiente. Conservar la causa; no convertirlo en PASS o WAIVED.

## Registro de reanudación — 2026-11-01: entorno BLOCKED

El propietario autorizó ejecutar F0 y reanclar las tareas. GitHub compare `dc47d8d..f2d8d238940a0a08be78a9d17a8e35eb1cb09aa8` confirmó **3 commits / 22 archivos añadidos solo bajo `odd/`**. PR #45 abierto, head de rama `feat/t12-integrated-acceptance-merge` en `f2d8d238940a0a08be78a9d17a8e35eb1cb09aa8` antes de este cambio documental. Se reanclaron los 21 microarchivos mediante `sha_base=f2d8d238940a0a08be78a9d17a8e35eb1cb09aa8` como base histórica, no resultado de pruebas.

**F0-02 BLOCKED:** sin checkout completo porque `git ls-remote` y `git clone` no resuelven `github.com`; Node disponible `22.16.0` no cumple `.nvmrc=22.19.0` ni engines `>=22.19.0`; `nvm install` no encuentra versión por falta de acceso remoto; instalación `actionlint` vía Go falla por DNS `proxy.golang.org`. `npm ci`, el test oficial RED/GREEN y typecheck NO SE EJECUTARON. La prueba aislada previa queda sin validez de evidencia. Actionlint se registra BLOCKED auxiliar, no PASS.

**Estado:** F0-01 DONE histórico; F0-02 **BLOCKED por entorno**; F0-03 y F0-04 PENDING; F1–F5 no iniciadas. Ningún workflow, proveedor o CI lanzado y ningún archivo de código, YAML o test cambiado. Este commit es solo actualización del ODD. Al reanudar: comprobar el HEAD nuevo, preparar checkout, Node >=22.19.0, npm ci; ejecutar F0-02 oficial antes de F0-03/F0-04. Los tres commits funcionales deben seguir separados.
## Registro F1 - 2026-11-01

- F1-01 NOOP: tests/orchestrator (27 pass), plan-dispatcher-role-boundaries (12 pass).
- F1-02 NOOP: authority-pin (2 pass), check:authority-pin (7 files), pi-process-runner (46 pass). Hashes intactos.
- F1-03 NOOP: memory-migrations + memory-session-identity (14 pass).
- F1-04 NOOP: background-job-delivery + session-notifications (9 pass), extension-runtime-commands (12 pass + 1 skip POSIX en Windows).
- F1-05 NOOP: t12-integrated-boundaries (1 pass), typecheck PASS.
- Node v24.15.0. Sin push, sin proveedores, sin CI.
## Registro F2 - 2026-11-01

- F2-01 NOOP: tests/orchestrator (27 pass), instruction-triage + plan-dispatcher-role-boundaries (19 pass).
- F2-02 NOOP: dispatcher (41 pass), workspace-writer-lease (5 pass), plan-dispatcher-role-boundaries (12 pass), pi-process-runner (46 pass).
- Brechas destinadas a F3 permanecen: R4-06/R4-08/R4-10/R4-11/R4-18/R4-20 ya registradas en plan.
- Sin push, sin CI ni proveedores; Node v24.15.0.
## Registro F3 - 2026-11-01

- F3-01 NOOP: tests/dispatcher (36 pass), plan-dispatcher-role-boundaries (12 pass). Grant ajeno a otra sesion/proyecto se rechaza sin runner ni escritura.
- F3-02 NOOP: tests/pi-process-runner (46 pass), check:authority-pin (7 files), pi-authority-temp-load (1 pass). No se mutaron archivos reales ni pins.
- F3-03 NOOP/BLOCKED: materializeExecutablePlan impone dependencias worker+ambos revisores; no existe entrada pública para omitir un reviewer sin internals.
- F3-04 NOOP: IDs reviewer/reviewer:2 existen y son únicos; contextos independientes; no se permite inyección de duplicado en API pública.
- F3-05 NOOP: background-job-delivery (9 pass), session-notifications (9 pass), extension-runtime-commands (12 pass + 1 skip POSIX). Terminal único y dedupe por identidad demostrados.
- F3-06 NOOP: code-intelligence (27 pass), incluyendo absent executable ENOENT -> unavailable, no init ni false PASS. No se instaló CodeGraph.
- actionlint no disponible: BLOCKED/WAIVED parcial, no PASS.
- Node v24.15.0. Sin push, sin CI ni proveedores.
## Registro F4 - 2026-11-01
- F4-01 done con CI 41291213760 + T07 probe 41291781415.
- F4-02 bloqueado por fallo windows TUI T12 y test ubuntu/general pendiente/fallando.
- No push, no CI adicional, no proveedores.
## Correccion quirurgica - 2026-11-01
- A: commit 2ef5724, prueba CLI GREEN.
- B: Windows TUI FAIL exacto CI, PASS local; AttachConsole + row wrap, causa no resuelta.
## Correccion detector - 2026-11-01
- Trigger: el analisis debe corregir la clasificacion de la fila y la comparacion normalizada de rutas. La evidencia nueva muestra que el sufijo de la linea no era solo un problema ASCII.
- Cambio: scripts/t10-real-pi-tui-matrix.mjs con comparación normalizada y diagnósticos.
- Validacion local: matrix PASS 120/80/60/40, node --check PASS, typecheck PASS.
- Nota: el fallo de AttachConsole no se ha demostrado como causa.

## Reanudación actualizada — 2026-11-01: F4 DONE técnico, F5 abierto

- Último SHA completamente probado antes del commit de cierre documental: `0b85676c0a879366051bf8c6e616101f73bdaa94`. PR #45 abierto, base main, no merge.
- CI 41307948302 SUCCESS: pruebas generales y TUI 3 SO, CodeGraph integrado 3 SO, Pi support 3 SO y seguridad dedicada Ubuntu. Windows TUI job 124852136544 SUCCESS y T10 120/80/60/40 PASS.
- Release Gate 41307948290, Phase 0 41307948301, Pi runtime 41307948294: SUCCESS. F4-02 pasa a DONE técnico; F4-01 histórico DONE.
- F5-01 IN_PROGRESS; bloqueos: (a) acción T07 CLI manual PASS solo en SHA 7a497e5, falta en SHA final; (b) `actionlint` no acreditado; (c) no consta auditor externo/A5 independiente en el PR; (d) `check:authority-pin` explícito del SHA final pendiente; (e) un commit de documentación cambia el SHA y requiere validación posterior. F5-02 PENDING, no FULL.
- Nota R4: F3-03 y F3-04 NOOP no equivalen a demostrar inyección adversarial de reviewers; revisión independiente requerida. Live NVIDIA, Pi Free Smoke y T05 audit SKIPPED, nunca PASS.
- Sin cambios de producción ni de `odd/tasks/pi-capability-completion.md`, sin ejecución de proveedores, sin merge ni release. Siguiente ejecutor debe reconciliar HEAD remoto real y no usar SHAs históricos como evidencia de HEAD nuevo.
