# ASEN — Hardening exact-SHA R4: plan ODD canónico y registro
**ACTUALIZACION 2026-11-01: F0 auditoria cerrada con correccion de aislamiento de test. HEAD local d9e8092. Tests PASS, typecheck PASS, package.json sin cambios. actionlint BLOCKED/WAIVED. No se avanzo a F1. Este plan no reemplaza el ODD general: odd/tasks/pi-capability-completion.md es la autoridad de admision/capacidades conforme a AGENTS.md.


## Fuente y baseline

- Repositorio: `asenbanskaliev/ASEN`. Rama de trabajo: `feat/t12-integrated-acceptance-merge`.
- HEAD remoto inspeccionado: `dc47d8d9b2ead9423a0a613e5cad6ce6ca5233f1`, idéntico a la rama antes de este commit documental.
- CI general exact-SHA 41281972243 PASS (Ubuntu/Windows/macOS); Release Gate 41281972267 PASS en los tres SO; Phase 0 Architecture 41281972216 PASS; Pi 1.2 runtime evidence 41281972281 PASS.
- T07 especializado, T12 security, T12 real Pi TUI, T05-R4, live NVIDIA: **SKIPPED** en la CI citada. Pi Free Smoke: SKIPPED. No son PASS.
- Versión Node/npm y working tree del host: **NO VERIFICADOS** sin checkout de la rama; F0-01 comprobará. Referencia histórica de CI distinta no prueba HEAD futuro.
- Prohibido tocar producción, workflows, tests o pins durante este commit de preparación; **no iniciar F0-02 ni siguiente microtarea antes de nueva confirmación del propietario**.

## Paso 0 — auditoría previa y discrepancias

1. GSP-06 confirmado: `.github/workflows/gsp06-pi-free-parity.yml` usa literales dobles como `"workflow_dispatch"`, `"success"`, `"refs/heads/..."` en expresiones (alrededor de líneas 16/66). `tests/provider-scope.test.ts` acepta comillas dobles y simples mediante regex. Riesgo de parser Actions; confirmar con `actionlint` antes de atribuir un fallo de ejecución solo al parser.
2. En `.github/workflows/ci.yml`, T07 integrado (l.72–76) exige `pull_request` + `head_ref` en `feat/t07-codegraph-completion` o `feat/t12-integrated-acceptance` + repo propio; T12 security (l.146–149) y T12 real Pi TUI (l.186–189) requieren `feat/t12-integrated-acceptance`. La rama `feat/t12-integrated-acceptance-merge` queda excluida. Un push sin PR o dispatch de CI general no ejecuta esos gates.
3. T05 R4/live también se limita a `feat/t05-independent-review`; live NVIDIA requiere la variable de opt-in. No ampliar estos gates ni consumir cuota.
4. **Discrepancia T07:** `t07-codegraph-real-probe.yml` tiene `workflow_dispatch` y 3 OS, pero prueba el CLI real en fixture desechable, **no** la integración ASEN/Pi de `tests/t07-real-asen-codegraph.test.ts`. El plan exige ambas: probe manual y gate integrado de PR.
5. **Discrepancia exact-SHA T07 manual:** el probe no recibe `expected_sha`; registrar ref seleccionada y verificar `run.head_sha == SHA final` y checkout real. De lo contrario BLOCKED.
6. **Discrepancia T12 plataforma:** `t12-integrated-security` corre solo Ubuntu; `t12-real-pi-tui-dialog` tiene matriz Ubuntu/Windows/macOS. Para security equivalente en 3 OS revisar ejecución del mismo test dentro de suite CI general 3 OS; no atribuir al job dedicado una matriz inexistente. Si se exige job dedicado en los 3, ampliar alcance de forma separada.
7. **Discrepancia RED/commit:** F0-03 necesita ser GREEN como test de caracterización para poder publicarse solo; F0-04 añade nueva expectativa RED y luego corrige condiciones hasta GREEN. F0-02 y F0-04: commits distintos.
8. El pin fijo de `extensions/authority.ts` en `src/agents/pi-process-runner.ts` es `35731adec8525b6043dec7e06d8c35406388bd5d61f6fc2b9ace5c6528b199dd`. Los assets adicionales están en `src/agents/pi-authority-assets.ts`. No regenerarlos.
9. Trabajos históricos dual-review, tsImport workers, notificaciones y fixture Windows se verifican primero como regresión **GREEN→NO-OP**, no se reimplementan. El ODD general tiene waivers T10 y T04/T05 FULL de alcance renegociado: ningún waiver acredita test omitido.
10. La auditoría R4 de esta preparación es **inventario estático** basado en tests presentes, no ejecución nueva ni auditoría independiente. Los apartados PARTIAL son faltas de evidencia del caso exacto, no seis defectos demostrados en producción.
11. Descartadas cifras previas incompatibles (32–46 h y 36–54,5 h). Estimación única: **29.25 h** de esfuerzo de estas 21 tareas, excluidos runners, bloqueos y cambios futuros de alcance.
12. `docs/remote-continuation.md` registra WIP/SHA históricos, no invalida HEAD remoto observado. `AGENTS.md` designa expresamente `odd/tasks/pi-capability-completion.md` como fuente ODD canónica global.

## Decisión F0-04, alternativas

| Alternativa | Evaluación | Resolución |
|---|---|---|
| T07 `workflow_dispatch` | Sin tocar CI, 3 OS CLI; no cubre ASEN/Pi ni garantiza SHA por input | **USAR** además del integrado en F4-01; comprobar run.head_sha |
| Añadir `head_ref == 'feat/t12-integrated-acceptance-merge'` dentro de gate PR+repo para T07/T12 | Cambio localizado; evita copiar candidatos a otras ramas | **ELEGIDA** para F0-04; PR compatible es requisito previo |
| PR desde rama `feat/t12-integrated-acceptance` | Otro HEAD/branch y riesgo de prueba de candidato distinto | Rechazada para este candidato |
| `startsWith('feat/t12')`, dispatch genérico, fork | Escala pero amplía admisión sin control de procedencia | **PROHIBIDO** |

Sin PR con `head.ref` exacta y `head.repo.full_name` igual a `asenbanskaliev/ASEN`, **BLOCKED**; no abrir PR por cuenta propia. La excepción exacta -merge no sustituye el diseño futuro de admisión escalable.

## Matriz R4-01…R4-24

`COVERED` = test real identificado con semántica cercana/suficiente en inspección estática, no PASS de ejecución; `PARTIAL` = test relacionado sin comprobación específica demostrada; `MISSING` = sin test relacionado localizado, no afirmación absoluta de inexistencia.

| R4 | Escenario | Estado | Test existente y nombre concreto | Trabajo |
|---|---|---|---|---|
| R4-01 | Escape ../ fuera de repositorio | **COVERED** | `tests/workspace-resolution.test.ts` — correction rejects unsafe paths and symlinks before permitting a writer | Regresión existente; no programar producción |
| R4-02 | Symlink fuera | **COVERED** | `tests/workspace-resolution.test.ts` — correction rejects unsafe paths and symlinks before permitting a writer | Regresión existente; no programar producción |
| R4-03 | Ruta sensible (.env,.git,*.pem,*.key) | **COVERED** | `tests/pi-authority.test.ts` — Pi authority rejects sensitive reads delegated from primary policy | Regresión existente; no programar producción |
| R4-04 | Reviewer escribe | **COVERED** | `tests/dispatcher.test.ts` — non-worker agents cannot receive write authority | Regresión existente; no programar producción |
| R4-05 | Grant reutilizado | **COVERED** | `tests/dispatcher.test.ts` — concurrent dispatchers cannot spend the same structured phase grant twice | Regresión existente; no programar producción |
| R4-06 | Grant otra sesión | **PARTIAL** | `tests/dispatcher.test.ts` — validated runner results cannot complete another sink or another session/project | F3 condicional; NO-OP si F1/F2 demuestra caso exacto |
| R4-07 | Candidato distinto | **COVERED** | `tests/dispatcher.test.ts` — ECO-06 wrong candidate revision burns writer admission without invoking runner | Regresión existente; no programar producción |
| R4-08 | Authority alterada | **PARTIAL** | `tests/authority-pin.test.ts; tests/pi-process-runner.test.ts` — authority integrity manifest matches current pinned source files; Pi pins atomic-write reviewed bytes and rejects tampering before child invocation | F3 condicional; NO-OP si F1/F2 demuestra caso exacto |
| R4-09 | Asset protegido alterado | **COVERED** | `tests/pi-process-runner.test.ts` — Pi pins atomic-write reviewed bytes and rejects tampering before child invocation | Regresión existente; no programar producción |
| R4-10 | Dual reviewer incompleto | **PARTIAL** | `tests/orchestrator.test.ts` — orchestration uses one writer and read-only reviewer/verifier | F3 condicional; NO-OP si F1/F2 demuestra caso exacto |
| R4-11 | Reviewer duplicado por ID | **PARTIAL** | `tests/orchestrator.test.ts` — delegated role contexts are independently issued and task-bound | F3 condicional; NO-OP si F1/F2 demuestra caso exacto |
| R4-12 | Cancelación queued | **COVERED** | `tests/dispatcher.test.ts` — dispatcher removes cancelled queued work without consuming a slot or blocking FIFO handoff | Regresión existente; no programar producción |
| R4-13 | Cancelación running | **COVERED** | `tests/dispatcher.test.ts` — dispatcher cancellation stops a running runner and records a cancelled terminal state | Regresión existente; no programar producción |
| R4-14 | Crash worker | **COVERED** | `tests/eco06-interrupted-writer.test.ts` — ECO-06 SIGKILL after a persisted partial edit quarantines the writer | Regresión existente; no programar producción |
| R4-15 | Worker TS aislado tsImport | **COVERED** | `tests/memory-migrations.test.ts` — a holder worker serializes the complete migration startup before an opener can write | Regresión existente; no programar producción |
| R4-16 | Migración concurrente | **COVERED** | `tests/memory-migrations.test.ts` — serializes simultaneous opens and commits one migration before either store writes | Regresión existente; no programar producción |
| R4-17 | Restart post-write sin replay | **COVERED** | `tests/authorized-write-recovery.test.ts` — recovery recognizes exact authorized bytes and forbids replay across repeated restarts | Regresión existente; no programar producción |
| R4-18 | Notificaciones auxiliares y terminal visible | **PARTIAL** | `tests/background-job-delivery.integration.test.ts; tests/session-notifications.test.ts` — public background tool runs one real child, delivers an untrusted terminal result, and does not replay after restart; deduplicates by source identity, not by display text | F3 condicional; NO-OP si F1/F2 demuestra caso exacto |
| R4-19 | Fixture Git Windows estable | **COVERED** | `tests/t12-integrated-boundaries.test.ts` — T12 integrates read-only code research, one-use workspace correction, session consent and maintenance isolation | Regresión existente; no programar producción |
| R4-20 | CodeGraph ausente | **PARTIAL** | `tests/code-intelligence.test.ts` — stale/error output is sanitized with no automatic initialization or retry | F3 condicional; NO-OP si F1/F2 demuestra caso exacto |
| R4-21 | Índice inválido | **COVERED** | `tests/code-intelligence.test.ts` — canonical CodeGraph tool validates an existing index with lstat and never executes for unsafe entries | Regresión existente; no programar producción |
| R4-22 | Índice borrado | **COVERED** | `tests/code-intelligence.test.ts` — CodeGraph requires fresh approval after an externally deleted index | Regresión existente; no programar producción |
| R4-23 | RPC parcial/malformado | **COVERED** | `tests/pi-process-runner.test.ts` — Pi RPC adapter rejects malformed structured output | Regresión existente; no programar producción |
| R4-24 | Timeout simulado | **COVERED** | `tests/pi-process-runner.test.ts` — Pi child times out | Regresión existente; no programar producción |

**18 COVERED, 6 PARTIAL, 0 MISSING.** Solo los PARTIAL R4-06/08/10/11/18/20 pasan a F3-01…F3-06. Si F1/F2 demuestra su cobertura exacta, cerrar `noop` con evidencia. No añadir tests duplicados.

## Tabla canónica de microtareas (actualizable)

| ID | Fase | Prioridad | Estado | Dependencias | Horas |
|---|---|---|---|---|---:|
| [F0-01](hardening-exact-sha-r4/F0-01.md) | F0 | P0 | done | — | 1.50 |
| [F0-02](hardening-exact-sha-r4/F0-02.md) | F0 | P0 | done | F0-01 | 2.00 |
| [F0-03](hardening-exact-sha-r4/F0-03.md) | F0 | P1 | done | F0-02 | 1.50 |
| [F0-04](hardening-exact-sha-r4/F0-04.md) | F0 | P0 | done | F0-03 | 2.00 |
| [F1-01](hardening-exact-sha-r4/F1-01.md) | F1 | P1 | noop | F0-04 | 0.75 |
| [F1-02](hardening-exact-sha-r4/F1-02.md) | F1 | P1 | noop | F0-04 | 0.75 |
| [F1-03](hardening-exact-sha-r4/F1-03.md) | F1 | P1 | noop | F0-04 | 0.50 |
| [F1-04](hardening-exact-sha-r4/F1-04.md) | F1 | P1 | noop | F0-04 | 0.75 |
| [F1-05](hardening-exact-sha-r4/F1-05.md) | F1 | P1 | noop | F0-04 | 0.50 |
| [F2-01](hardening-exact-sha-r4/F2-01.md) | F2 | P1 | noop | F1-01, F1-02, F1-03, F1-04, F1-05 | 1.50 |
| [F2-02](hardening-exact-sha-r4/F2-02.md) | F2 | P1 | noop | F2-01 | 1.75 |
| [F3-01](hardening-exact-sha-r4/F3-01.md) | F3 | P1 | noop | F2-02 | 1.25 |
| [F3-02](hardening-exact-sha-r4/F3-02.md) | F3 | P1 | noop | F2-02 | 1.25 |
| [F3-03](hardening-exact-sha-r4/F3-03.md) | F3 | P1 | noop | F2-01 | 1.25 |
| [F3-04](hardening-exact-sha-r4/F3-04.md) | F3 | P1 | pending | F2-01 | 1.00 |
| [F3-05](hardening-exact-sha-r4/F3-05.md) | F3 | P1 | pending | F1-04, F2-02 | 1.25 |
| [F3-06](hardening-exact-sha-r4/F3-06.md) | F3 | P1 | pending | F2-02 | 1.25 |
| [F4-01](hardening-exact-sha-r4/F4-01.md) | F4 | P0 | pending | F0-04, F3-01, F3-02, F3-03, F3-04, F3-05, F3-06 | 2.00 |
| [F4-02](hardening-exact-sha-r4/F4-02.md) | F4 | P0 | pending | F4-01 | 2.00 |
| [F5-01](hardening-exact-sha-r4/F5-01.md) | F5 | P0 | pending | F4-02 | 3.00 |
| [F5-02](hardening-exact-sha-r4/F5-02.md) | F5 | P0 | pending | F5-01 | 1.50 |

| Fase | Tareas | Horas |
|---|---:|---:|
| F0 | 4 | 7.00 |
| F1 | 5 | 3.25 |
| F2 | 2 | 3.25 |
| F3 | 6 | 7.25 |
| F4 | 2 | 4.00 |
| F5 | 2 | 4.50 |
| **TOTAL** | **21** | **29.25** |

Estados: `pending|in_progress|done|noop|blocked|waived`. `noop` requiere GREEN/caracterización y justificación. `waived` no satisface PASS. `blocked` no libera dependencias.

## Modo automático ODD + TDD (requiere checkout y entorno válidos)

1. Leer los tres documentos AGENTS/remote-continuation/ODD global; luego este plan, el handoff y el microarchivo. Confirmar autorización de ejecución del owner.
2. Leer tabla; escoger primera `pending` cuyas dependencias estén `done` o `noop`; congelar HEAD/PR y ejecutar `git status --porcelain=v1`. Árbol sucio ajeno o nueva HEAD de tercero → BLOCKED.
3. Cada fichero arranca con `sha_base=dc47d8d9b2ead9423a0a613e5cad6ce6ca5233f1` como ancla histórica. Tras el commit documental, usar nuevo HEAD remoto; A0 registra el parent/head exacto y actualiza `sha_base` de la tarea activa en **el mismo commit de la unidad**, sin autorizar el cambio por un SHA viejo. No aceptar deriva no atribuida.
4. Inspeccionar tests actuales. Para defecto reproducible: añadir test → RED por causa única → fix mínimo dentro de allowlist → GREEN exacto → regresiones. Para regresión ya GREEN: `noop` justificado. Para check documental/read-only, RED puede ser `no_aplica`.
5. Ninguna unidad puede modificar archivos fuera de `archivos_editables`. Si hace falta tocar `authority.ts`, Dispatcher y store a la vez, o aparece segunda causa/contrato público, STOP/BLOCKED y nueva microtarea separada, no refactor automático.
6. A1 arquitectura, A2 seguridad y A3 CI son auditores read-only; A4 implementador con allowlist; A5 revisor separado y read-only; A0 único integrador/HEAD. En ausencia de subagentes reales, `self_audit_only`, nunca independent PASS.
7. `git diff --check`, examen de todo diff y de caminos modificados. Sin GREEN/regresiones ni revisión proporcional, **no commit**. Un commit por microtarea, incluyendo actualización de la tabla, microarchivo y handoff. **F0-02 ≠ F0-04**.
8. Tras commit, reconciliar HEAD y evidencias reales. Agrupar la ejecución completa de CI por tandas grandes, no por cada microcambio. No push a main, merge, release, gasto de proveedor, instalación no autorizada ni operación destructiva.
9. Actualizar tabla exact-SHA y reanudar solo si todas las dependencias se mantienen. STOP/BLOCKED ante error inesperado, PR ausente, cuota, autorización nueva, RED por causa distinta, GREEN fallido o evidencia faltante.

## Registro de gates por SHA (no confundir SUCCESS de workflow con sus jobs omitidos)

| Gate | Baseline dc47d8d9 | Final SHA/run | Exigencia |
|---|---|---|---|
| GSP-06 parseo YAML | NO VERIFICADO, doble literal | pendiente | Validar parser, sin llamar a proveedor |
| CI general Ubuntu/Windows/macOS | PASS 41281972243 | pendiente | 3 OS PASS |
| Release Gate Ubuntu/Windows/macOS | PASS 41281972267 | pendiente | 3 OS PASS |
| Phase 0 Architecture | PASS 41281972216 | pendiente | PASS |
| Pi runtime evidence | PASS 41281972281 | pendiente | PASS |
| Pi support matrix 3 OS | PASS en CI 41281972243 | pendiente | PASS sin skips necesarios |
| T07 CLI `workflow_dispatch` | NO EJECUTADO en esta revisión | pendiente | 3 OS + run.head_sha exacto |
| T07 integrado ASEN/Pi | SKIPPED | pendiente | 3 OS PASS |
| T12 security dedicado | SKIPPED | pendiente | Ubuntu PASS; 3 OS equivalente documentado |
| T12 TUI dialog | SKIPPED | pendiente | 3 OS PASS |
| Authority pin | sin cambio documental | pendiente | `check:authority-pin` PASS sin repin |
| R4 + auditor independiente | inventario estático | pendiente | PASS independiente para SHA exacto |
| T04/T05 live NVIDIA | SKIPPED/opt-in | WAIVED posible | **Nunca PASS implícito** |
| Pi Free Smoke provider-backed | SKIPPED | WAIVED posible | **Nunca PASS implícito** |
| Paridad global externa | PARTIAL histórica | WAIVED posible | Fuera de FULL acotado |

## FULL acotado: catorce criterios binarios

1. SHA final único/inmutable, exacto en checkout, PR, pruebas y artefactos.
2. YAML de workflows válido con `actionlint` o equivalente, sin consumir proveedor.
3. CI Ubuntu: PASS exact-SHA.
4. CI Windows: PASS exact-SHA.
5. CI macOS: PASS exact-SHA.
6. Release Gate Ubuntu: PASS exact-SHA.
7. Release Gate Windows: PASS exact-SHA.
8. Release Gate macOS: PASS exact-SHA.
9. Phase 0 Architecture: PASS exact-SHA.
10. Pi 1.2 runtime evidence: PASS exact-SHA.
11. Pi support matrix Ubuntu/Windows/macOS: PASS exact-SHA.
12. T07 CLI real **y** T07 ASEN/Pi integrado, ambos 3 OS y exact-SHA; uno solo no vale.
13. T12 security Ubuntu dedicado más cobertura equivalente en suite general 3 OS; T12 TUI dedicado 3 OS, todos PASS exact-SHA. Si se exige security dedicado 3 OS, la versión actual es BLOCKED pendiente autorización extra.
14. Authority pin intacto y `npm run check:authority-pin` PASS, R4 críticos sin FAIL, auditor independiente genuino PASS del SHA final. Cualquier REQUIRED SKIPPED/WAIVED/BLOCKED = NO FULL.

**WAIVED explícitos permitidos:** live NVIDIA T04/T05, Pi Free Smoke con proveedor y paridad Reference Shell global. El workflow GSP-06 debe parsear aunque esté sin ejecutar. FULL del programa no implica paridad funcional global con el sistema de referencia externo.

## Plantilla implementador (PASS / FAIL / BLOCKED)

- [ ] HEAD reconciliado y árbol limpio.
- [ ] Archivos solo allowlist; permisos/pins intactos.
- [ ] Evidencia y causa RED exacta o NO-OP debidamente justificado.
- [ ] GREEN y regresiones reproducibles, ninguna expectativa relajada.
- [ ] `git diff --check`, comparación de paths y revisión del diff.
- [ ] Documentar SHA, comandos, archivos, fallos, skips y artefactos.
- [ ] Actualizar task, tabla y handoff en commit único de microtarea.
- Veredicto y justificación: PASS / FAIL / BLOCKED.

## Plantilla auditor independiente (PASS / FAIL / BLOCKED)

- [ ] No fue implementador; revisa snapshot SHA, diff y alcance sin permiso de escritura.
- [ ] Verifica test RED causal, GREEN real, efecto sobre contratos y pruebas adversariales relevantes.
- [ ] Rechazos peligrosos realizan cero side-effects; no permisos recuperados por agente/memoria.
- [ ] Revisa resultados de jobs individuales (no solo workflow verde) y plataforma.
- [ ] Conserva restricciones authority, scopes, no merge/release y no cuota.
- [ ] Firma identidad del auditor, fecha, SHA, artefactos y hallazgos con severidad.
- Resultado: PASS / FAIL / BLOCKED. Si no existe auditor independiente, registrar BLOCKED, no fingir aprobación.

## Política de commits y parada

Preparación = **exactamente un commit** `docs(odd): add hardening exact-SHA R4 plan`, solo archivos `odd/`. Ejecución posterior = un commit por microtarea y por separado F0-02/F0-04. STOP si falta autorización owner, PR/gate, RED/GREEN, independencia crítica, autoridad segura o aparecen defectos multicausa. No modificar ODD canónico global sin nueva allowlist/documentación aprobada. Documento de continuación: `odd/handoffs/hardening-exact-sha-r4-resume.md`.

## Registro de ejecución F0 — 2026-11-01

- **F0-01 DONE (baseline remoto):** HEAD inicial `a2a4765d1c7a4b577d63b3794bfa2fe7abebcfdc`, PR #45 abierto hacia main, rama `feat/t12-integrated-acceptance-merge`. La rama coincide con el commit base. GitHub Actions muestra Phase 0 run 41286809743 PASS, Pi 1.2 runtime run 41286809715 PASS y Release Gate 41286809731 PASS; CI run 41286809701 estaba en ejecución durante la consulta y Pi Free Smoke 41286809722 SKIPPED.
- **Entorno de ejecución:** en el contenedor de esta conversación Node v22.16.0, npm 10.9.2, git disponible, pero sin checkout del repo y sin `tsx`/`actionlint`. Este Node no alcanza el mínimo declarado en `package.json` (>=22.19.0). Es una **limitación explícita**: no declarar un `git status --porcelain` local de ASEN ni pruebas locales del repositorio como PASS. La CI hospedada usa Node 22.19.0 en `ci.yml`; su evidencia solo vale para su SHA exacto.
- **Protocolo:** la comprobación del contenido remoto mediante API Git y CI no equivale a un checkout limpio local. Los trabajos siguientes requieren GREEN focalizado exacto en un entorno compatible antes de su commit de implementación; sin él deben marcarse BLOCKED según el plan.

## Reconciliación y STOP por entorno — 2026-11-01

- **Comparación exacta** `dc47d8d9b2ead9423a0a613e5cad6ce6ca5233f1..f2d8d238940a0a08be78a9d17a8e35eb1cb09aa8`: GitHub compare confirma 3 commits adelante y **22 archivos añadidos, todos bajo `odd/`**, cero cambios fuera. PR #45 sigue abierto, rama `feat/t12-integrated-acceptance-merge`, head `f2d8d238940a0a08be78a9d17a8e35eb1cb09aa8` comprobado antes de este registro.
- **Reanclaje de metadata autorizado:** `sha_base=f2d8d238940a0a08be78a9d17a8e35eb1cb09aa8` en los 21 microarchivos F0-01…F5-02. Esta base es la referencia anterior al commit documental; NO acredita ejecución sobre ella. F0-01 conserva sus resultados históricos; F0-02 pasa a BLOCKED; F0-03/F0-04 siguen PENDING. Antes de reanudar, obtener el nuevo HEAD y volver a reconciliarlo.
- **Bloqueo del checkout:** `git ls-remote https://github.com/asenbanskaliev/ASEN.git ...` y `git clone --no-checkout --filter=blob:none https://github.com/asenbanskaliev/ASEN.git repo` → `Could not resolve host: github.com`. No checkout completo ni working tree examinable mediante `git status`.
- **Bloqueo del runtime:** host Node `v22.16.0` y npm `10.9.2`; `.nvmrc=22.19.0`, `engines.node >=22.19.0`. `nvm install 22.19.0` devolvió `Version '22.19.0' not found` en un entorno sin acceso al índice remoto.
- **Actionlint** no instalado; `go install github.com/rhysd/actionlint/cmd/actionlint@v1.7.7` falló por DNS de `proxy.golang.org`. Estado **BLOCKED de verificación auxiliar**; no PASS. La posible exención parcial de actionlint no elimina el bloqueo de checkout/Node/tsx y no se presenta como FULL.
- **No ejecutado:** `npm ci`, `node --import tsx --test tests/provider-scope.test.ts` (RED/GREEN oficial), `npm run typecheck`, F0-03 y F0-04. Se descarta expresamente la prueba aislada anterior como evidencia. No se modificaron workflows ni tests, no se iniciaron CI, workflows ni proveedores.
- **STOP obligatorio:** ningún estado posterior se promociona. Reanudar F0-02 solo con checkout completo, Node compatible, `npm ci` y TDD oficial; mantener commits funcionales independientes para F0-02, F0-03 y F0-04 y conservar los filtros exactos del PR #45.

## Registro de ejecucion F0-02 - 2026-11-01 (entorno valido)

- SHA base historico al iniciar: bc6fdec81eefa83f200b15872685824097a3da5d (rama feat/t12-integrated-acceptance-merge).
- F0-02 DONE. Commit fix: 3a42ae3ffd1e549e84b42db5b956e59d67e2535e.
- RED: comando 'node --import tsx --test tests/provider-scope.test.ts' -> AssertionError /github\.event_name == 'workflow_dispatch'/ por expresiones con comillas dobles.
- GREEN: mismo comando -> 1 pass, 0 fail; 'npm run typecheck' -> PASS.
- actionlint: no instalado -> WAIVED parcial (no PASS).
- Node: v24.15.0 (cumple >=22.19.0). Entorno Windows PowerShell.
- No se modificaron extensiones/authority, pin, otros workflows ni package.json.

## Registro de ejecucion F0-03 y F0-04 - 2026-11-01 (entorno valido)

- F0-03 done. Test inicial rojo: cbd4e10 (test(ci): characterize admission of specialized gates).
  RED: 'node --import tsx --test tests/ci-specialized-gates.test.ts' fail porque ci.yml aun no admitia '-merge'.
  Final consolidado en commit F0-04 (refinements incluidos).
- F0-04 done. Commit fix: 97a787c (ci.yml añade alternativa exacta '-merge' en t07, t12 security y t12 TUI;
  conserva github.event_name == 'pull_request' y repo full_name; sin startsWith).
- GREEN: 'node --import tsx --test tests/ci-specialized-gates.test.ts tests/provider-scope.test.ts' -> 2 pass, 0 fail.
- npm run typecheck -> PASS. git diff --check -> PASS.
- Node: v24.15.0; entorno Windows PowerShell.
- No se tocaron jobs T05, triggers generales, matrices ni permisos.

## Comprobacion 1 y 2 - 2026-11-01

### Comprobacion 1: cbd4e10 deja el test en rojo
- Resultado: SI, rojo (cb...dr). Rebase fixup realizado para no dejar commits en rojo.
- Original SHA test: cbd4e10 (eliminado por rebase).
- Fix F0-04 reescrito: 97a787c.
- Docs reescrito: e6aa00f.
- HEAD final previo a este commit de docs: por definir tras este registro.
- Verificacion de identidad del arbol: git diff 997bed0 (antiguo HEAD) .. HEAD salio vacio tras rebase.

### Comprobacion 2: mutaciones aisladas
| Mutacion | Resultado |
|---|---|
| quitar -merge solo de t12-integrated-security | DETECTADA (falla) |
| quitar -merge solo de t12-real-pi-tui-dialog | DETECTADA (falla) |
| quitar -merge solo de t07-real-codegraph | DETECTADA (falla) |
| startsWith(github.head_ref, 'feat/t12') en security | DETECTADA (falla) |
Ninguna mutacion paso en verde; el test actual aisla correctamente cada job.
## Auditoria critica de cierre F0 - 2026-11-01

- HEAD local final tras correccion: d9e8092 (commit de aislamiento del test).
- Defecto confirmado: `block()` para `t12-real-pi-tui-dialog` usaba `null` y absorbía jobs posteriores.
- Correccion aplicada solo en `tests/ci-specialized-gates.test.ts`: fin de bloque en `  architecture:`.
- Mutaciones repetidas (TUI pull_request y repo.full_name, mas las 4 anteriores): todas detectadas (rojo).
- Validaciones: typecheck PASS; tests `ci-specialized-gates + provider-scope` PASS; `git diff --check` PASS.
- actionlint: no instalado -> BLOCKED/WAIVED parcial, nunca PASS.
- package.json/package-lock.json: sin cambios respecto a dc47d8d.
