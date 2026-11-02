# ASEN — Hardening exact-SHA R4: plan ODD canónico y registro

**Estado vigente de esta pasada, 2026-11-01:** F4-01 DONE histórico; F4-02 DONE técnico (CI exacto de candidato `0b85676c0a879366051bf8c6e616101f73bdaa94`), F5-01 IN_PROGRESS con auditor independiente/actionlint/T07 manual exact-SHA pendientes; F5-02 PENDING. Los registros históricos de preparación posteriores se conservan tal como ocurrieron.
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
| [F3-04](hardening-exact-sha-r4/F3-04.md) | F3 | P1 | noop | F2-01 | 1.00 |
| [F3-05](hardening-exact-sha-r4/F3-05.md) | F3 | P1 | noop | F1-04, F2-02 | 1.25 |
| [F3-06](hardening-exact-sha-r4/F3-06.md) | F3 | P1 | noop | F2-02 | 1.25 |
| [F4-01](hardening-exact-sha-r4/F4-01.md) | F4 | P0 | done | F0-04, F3-01, F3-02, F3-03, F3-04, F3-05, F3-06 | 2.00 |
| [F4-02](hardening-exact-sha-r4/F4-02.md) | F4 | P0 | done | F4-01 | 2.00 |
| [F5-01](hardening-exact-sha-r4/F5-01.md) | F5 | P0 | in_progress | F4-02 | 3.00 |
| [F5-02](hardening-exact-sha-r4/F5-02.md) | F5 | P0 | in_progress (documental; aceptación bloqueada) | F5-01 | 1.50 |

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
| R4 autoauditoría (sustitución explícita del propietario) | inventario estático | pendiente | SELF_AUDIT_ONLY PASS, sin atribución de independencia, SHA exacto y regresiones de riesgos |
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
14. Authority pin intacto y `npm run check:authority-pin` PASS, R4 críticos sin FAIL y workflow `r4-self-audit.yml` SELF_AUDIT_ONLY PASS en el SHA final. Por decisión explícita del propietario de 2026-11-01, la firma independiente se sustituye **solo para aceptación acotada interna** por esta autoauditoría reproducible; `independentReviewPerformed=false` es obligatorio. Otros gates REQUIRED SKIPPED/BLOCKED siguen impidiendo FULL y no se acredita paridad global.

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
## Registro F4 - 2026-11-01

- F4-01 DONE: run CI 41291213760 con SHA exacto y CodeGraph matrix/Pi support tests PASS en 3 OS; T07 workflow_dispatch 41291781415 headSha 7a497e5 con ubuntu/macos/windows PASS.
- F4-02 BLOCKED/FAIL: run CI 41291213760 SHA exacto. t12-integrated-security PASS Ubuntu; t12-real-pi-tui-dialog PASS Ubuntu/macOS pero FAIL/CANCELLED Windows; tests generales con failures/timeout.
- No se ejecutó workflow general adicional; no se usaron proveedores.
- Run de F4 sigue in_progress por test runner Windows al momento del registro.

## Correccion quirurgica - 2026-11-01
- A: commit 2ef5724; prueba CLI GREEN.
- B: Windows TUI PASS local concluido, FAIL exacto en CI por row wrap + AttachConsole.
## Correccion detector - 2026-11-01
- Trigger: el analisis debe corregir la clasificacion de la fila y la comparacion normalizada de rutas. La evidencia nueva muestra que el sufijo de la linea no era solo un problema ASCII.
- Cambio: scripts/t10-real-pi-tui-matrix.mjs con comparación normalizada y diagnósticos.
- Validacion local: matrix PASS 120/80/60/40, node --check PASS, typecheck PASS.
- Nota: el fallo de AttachConsole no se ha demostrado como causa.

## Registro de cierre F4 y apertura F5 — 2026-11-01

- **F4 cerrado para alcance técnico** sobre el SHA probado `0b85676c0a879366051bf8c6e616101f73bdaa94`: CI 41307948302 SUCCESS (test, T07 integrado, Pi support y T12 TUI 3 OS; security Ubuntu); Release Gate 41307948290 SUCCESS 3 SO; Phase 0 41307948301 SUCCESS; Pi runtime 41307948294 SUCCESS. `t12-real-pi-tui-dialog` Windows job 124852136544 PASS; T10 REAL matrix 120/80/60/40 PASS sin AttachConsole en ese log. Los fallos previos quedan históricos.
- **F4-01 T07 manual** fue PASS 3 SO en workflow_dispatch 41291781415, pero `head_sha=7a497e5`, no `0b85676c0a879366051bf8c6e616101f73bdaa94`; F4-01 permanece DONE como evidencia histórica y el requisito de equivalencia exact-SHA final pasa a F5 criterio 12.
- **F5-01 IN_PROGRESS, solo revisión preliminar propia:** revisar matriz 14 criterios, riesgos R4-10/11, actionlint, check:authority-pin, hash exacto, auditor A5. PR #45 sin reviews. Sin firma independiente no FULL, aun con CI verde. `t05-r4-audit` y proveedores SKIPPED no son PASS.
- Esta actualización **solo modifica documentación bajo `odd/`**. Tras publicar el nuevo commit documental se requiere CI y evidencia exact-SHA del nuevo HEAD para cualquier admisión final; no utilizar los runs anteriores como si fueran del nuevo commit. F5-02 PENDING y `odd/tasks/pi-capability-completion.md` sin modificar por allowlist.

## F5 — tanda exact-SHA de gates ausentes (2026-11-01)

- Base inspeccionada: `19a1660040794f9d4cce2867508c026a9f13ae97` del PR #45. F4 técnico DONE, F5-01 IN_PROGRESS y F5-02 PENDING.
- Para dar una evidencia reproduci ble y gratuita, se agrega workflow `f5-static-verification.yml` con dos jobs aislados: `npm run check:authority-pin` y `actionlint` versión 1.7.12. Ambos comprueban el commit exacto, no usan proveedores ni modifican el pin.
- Se extiende el probe T07 CLI real con trigger `pull_request` restringido a rama `feat/t12-integrated-acceptance-merge` y repositorio propio. Se mantienen disparadores manual y push originales; el checkout deja de depender del SHA de merge y exige `github.event.pull_request.head.sha`. Matriz real de tres SO.
- Test `tests/f5-exact-sha-gates.test.ts`: condiciones fail-closed, protección frente a fork/prefijos y comprobación exact-SHA. No constituye prueba real sin CI.
- La firma de un auditor R4 distinto del implementador sigue ausente; la autoverificación no la suplanta. Los gates serán PENDING hasta comprobar todos los jobs del nuevo SHA, no se declara FULL.
- Cero modificaciones de producción/authority, cero cuotas y cero merges.

## F5-LINT-RED — falla real del nuevo gate (2026-11-01)

El workflow F5 static run 41311756034 ha validado el pin de autoridad, pero actionlint v1.7.12 devolvió FAIL con cuatro avisos ShellCheck (GSP-05E SC2266, Pi Free Smoke SC2155 x2, Release Gate SC2016). La microtarea F5-LINT-RED modifica exactamente tres workflows históricos y el test F5, sin tocar filtros de autorización ni proveedores. No usar flags de ignore. Nuevo SHA y verificación GREEN pendientes. F5-01 IN_PROGRESS, sin revisión genuinamente independiente.

## Decisión de admisión F5-02 y corrección Windows, 2026-11-01

- Owner aplaza expresamente auditoría independiente R4 y autoriza continuar al siguiente punto. Por tanto, **F5-01 IN_PROGRESS, F5-02 IN_PROGRESS solo documental**, con dependencia F5-01 no satisfecha para FULL. Ningún waiver equivale a auditoría ejecutada.
- CI 41312104530 en SHA 0329345: Windows test FAIL por regex LF frente a CRLF; Ubuntu test PASS; macOS aún in_progress cuando se inspeccionó. El resto de jobs obligatorios registrados PASS incluyendo T12 TUI 3 OS; F5 actionlint/pin 41312104555 SUCCESS, T07 CLI 41312104546 SUCCESS, Release Gate 41312104553 SUCCESS, Architecture 41312104571 SUCCESS, Pi runtime 41312104548 SUCCESS. No estado global verde.
- Se implementa microfix F5-WIN-CRLF en test solamente, sin cambiar workflow ni relajar contenido esperado: regex admite CRLF y LF, test adversarial añadido. Commit correctivo anterior 3a1a31c, preparado antes del commit de documentación. Tras publicar ambos en un solo update de ref, CI debe probar nuevo SHA. **No marcar F5-02 DONE ni FULL hasta evaluar el SHA nuevo**; auditoría R4 seguirá aplazada aunque CI sea verde.


## Reconciliation checkpoint - CI baseline e9229568 (2026-11-01)

GitHub Actions for PR #45 HEAD `e9229568e457785a884de8e08b1b9ad9404d256b`: CI [41328305297](https://github.com/asenbanskaliev/ASEN/actions/runs/41328305297) SUCCESS, Release Gate [41328305277](https://github.com/asenbanskaliev/ASEN/actions/runs/41328305277) SUCCESS, Phase 0 [41328305307](https://github.com/asenbanskaliev/ASEN/actions/runs/41328305307) SUCCESS, Pi runtime [41328305319](https://github.com/asenbanskaliev/ASEN/actions/runs/41328305319) SUCCESS, T07 real CLI [41328305298](https://github.com/asenbanskaliev/ASEN/actions/runs/41328305298) SUCCESS, F5 exact-SHA static [41328305299](https://github.com/asenbanskaliev/ASEN/actions/runs/41328305299) SUCCESS. Pi Free Smoke 41328305285 was SKIPPED, not PASS. These results supersede the older Windows CRLF FAIL as the latest *observed baseline*, but do not rewrite its history. The technical gates are green for e9229568, not automatically for the commit that adds this note.

F5-01 and F5-02 stay IN_PROGRESS: the PR had zero recorded independent review submissions at this checkpoint. Owner-deferred independent R4 is **PENDING/WAIVED FOR CONTINUATION**, never a PASS and never evidence for criterion 14 FULL. No production authority pins, provider credentials, main merge, or release changed. Refer to `odd/evidence/odd-code-reconciliation-2026-11-01.md` for the audited scope matrix.


## Criterio actualizado F5/R4 — sustitución automática autorizada (2026-11-01)

Se sustituye la firma A5 independiente para la **aceptación interna acotada** de PR #45 por una autoauditoría R4 reproducible. El nuevo workflow `.github/workflows/r4-self-audit.yml` ejecuta sin modelos ni créditos: verificación del HEAD exacto, instalación bloqueada, `check:authority-pin`, `typecheck`, pruebas adversariales de autoridad/estado, recorridos T10 y T09 focalizados, y `scripts/r4-self-audit.mjs` con evidencia JSON. Se etiqueta **SELF_AUDIT_ONLY / NOT independent**: no es segunda opinión independiente, ni certificación de seguridad, ni demostración de paridad Reference Shell. Los tests no pueden convertirse en revisión humana por su resultado PASS.

La autoauditoría tendrá estado PENDING hasta publicar y verificar el workflow en el SHA real. Si falla una prueba o hay riesgo Critical/High sin solución, no se declara cierre R4 automático. El resto de los 14 criterios exact-SHA siguen intactos. Se mantienen F5-01/F5-02 IN_PROGRESS hasta CI real; no merge a main, release, cuota de proveedor ni cambio del pin de autoridad.

Incidencia preexistente en `a106188ff8747ac18dbf3ae111007a9017786ad1`: `CI` 41334284790 FAILURE en test `controlled writer cancellation supports a fresh plan and explicit acceptance` (observó Todo `running` antes de su reconciliación `blocked`) en Ubuntu, Windows y macOS; Release Gate/Pi runtime/CodeGraph/Architecture/F5 static PASS en ese SHA. La nueva prueba de sincronización espera la transición real y conserva un plazo acotado de 5 s, sin cambiar la política de cancelación.


## Consolidated F5 checkpoint — 2026-11-01

CI baseline PR #45 `e47a7956fbb3cd04ee20901af30581ae4e9f8c2f`: Release Gate [41335871606](https://github.com/asenbanskaliev/ASEN/actions/runs/41335871606) SUCCESS; R4 SELF_AUDIT_ONLY [41335871683](https://github.com/asenbanskaliev/ASEN/actions/runs/41335871683) SUCCESS; F5 static 41335871577, Architecture 41335871584, Pi runtime 41335871565 and T07 real 41335871640 SUCCESS. CI [41335871610](https://github.com/asenbanskaliev/ASEN/actions/runs/41335871610) **IN_PROGRESS at checkpoint**: Ubuntu and macOS full suites SUCCESS, Windows full suite IN_PROGRESS; Pi Free Smoke 41335871568 SKIPPED (not PASS). These are historical receipts for e47a795 only; the source/test changes in this batch require their own exact-SHA gates.

F5-01/F5-02 remain IN_PROGRESS until the final source SHA passes all mandatory gates. The replacement for the separate A5 review is owner-approved **SELF_AUDIT_ONLY / NOT independent**, not a fabricated independent reviewer. New cross-process crash-test and scoped notification clear address bounded T10 recovery/isolation but do not prove confirmed delivery or solve T09 hostile same-user final-check-to-unlink race. No global ECO promotion; no merge/release.


## T09 staged-quarantine hardening check (owner R4 SELF_AUDIT_ONLY, 2026-11-01)

A new T09 regression uses a second OS process to replace the private quarantine directory at the deterministic move boundary; the managed uninstall must fail closed and preserve both owned and foreign bytes. `removalStage` tracks root/stage object identity and checks it before and after moving an object for deletion. R4 automated self-audit statically enforces this identity guard and runs the dynamic attack. This is **not** a complete same-user attacker confinement proof: path checks do not make unlink-by-name atomic against continuous substitution. F5-01/F5-02 remain in_progress pending the final exact-SHA CI. No promotion to FULL or independent review claim.


## T10 fail-closed virtual interruption at startup — 2026-11-01

At PR #45 HEAD `95178fff208bfd5bc96b549751ac587dbc6dd6fc`, Release Gate, Pi runtime, Architecture, CodeGraph real CLI, R4 SELF_AUDIT_ONLY and F5 static all passed. CI general was still IN_PROGRESS on Windows at checkpoint; Ubuntu and macOS full suites passed. Do not transfer old SHA results to this candidate.

New T10 issue: journal `load` presents a persisted `running` row as virtually `interrupted`. Automatic startup resend treated this view as a durable terminal row, leading to a failed `enqueued` write and potentially repeated notifications across restarts. The correction conservatively **suppresses automatic delivery of interrupted observations only**, without suppressing persisted completed/failed notifications. It notifies the user to inspect `asen_background_status`, never re-executes an uncertain command, and does not mutate the journal to claim delivery. Integration tests demonstrate repeat-startup stability. A new R4 SELF_AUDIT_ONLY source guard and adversarial mutation check protect this contract. Owner-fenced durable recovery and actual display receipt are still open, as are T09 residual same-user races and ECO reference parity. F5-01/F5-02 remain IN_PROGRESS until exact-SHA verification of the new batch.


## T10-R8 protected journal transitions — pending final SHA admission

The owner-authorized R4 SELF_AUDIT_ONLY check now requires that the notification enumerator and both in-memory and durable delivery-state setters reject `interrupted`. Tests verify no automatic notice from uncertain crash-recovery status, no journal change on rejected `pending/enqueued` for a persisted interrupted retry, and successful delivery tracking for genuinely terminal failures. This is a security/concurrency fix, not a changed Pi host receipt or proof of exactly-once. R4 independent reviewer remains explicitly replaced only for scoped internal admission. Final CI and Release Gate are required on a fresh SHA; previous source receipts cannot be inherited. F5-01/F5-02 stay IN_PROGRESS until then.


### T10-R9 — compare-and-set for delivery metadata, not whole-row journal overwrites (2026-11-01)

A live `BackgroundJobRegistry.setDeliveryState` used to update its memory snapshot and then call `BackgroundJobJournal.record`, blindly replacing the entire durable row by job id. With two Pi processes, a stale local snapshot could overwrite a newer terminal outcome or undo a delivery transition. Worse, a failed write left the in-memory snapshot marked `enqueued` despite a persistence error.

The registry now sends the observed terminal snapshot to `BackgroundJobJournal.updateDeliveryState(..., expected)`, which holds the existing exclusive journal lock, compares state, updatedAt, command, mode, exit code, event count, cwd, arguments, output tail, delivery state and delivery error against the committed row, and changes **only delivery metadata** when the expected values still match. A mismatch fails closed, and registry memory stays unacknowledged while reporting persistence failure. The existing restart-only update uses the same lock and state validation but does not fabricate a native Pi display receipt. A real child Node process publishes a conflicting terminal row; another test publishes `enqueued` before a stale writer attempts to regress it to `pending`. Both conflicts must be rejected with durable data preserved. R4 SELF_AUDIT_ONLY validates this CAS boundary and has mutation tests.

**Limitations:** These checks reduce wrong-row overwrites and preserve conservative results; they do not prove visible Pi delivery, exactly-once effects, or full cross-process ownership fencing for arbitrary job termination. T10/ECO-10 and the 16 ECO aggregate claims remain PARTIAL. New exact-SHA CI Windows, macOS, Linux and Release Gate are required; do not inherit prior SHA receipts. External independent review was replaced only by explicit SELF_AUDIT_ONLY for bounded PR #45 scope; no main merge or release.


### T10-R10 — journal record finality and one-time retry-claim preservation (2026-11-01)

An additional T10/T04 concurrency defect was confirmed: `BackgroundJobJournal.record` previously removed any existing entry by id and wrote the caller's full snapshot. A stale original process could overwrite its original `stopped` record after `claimInterruptedForRetry`, or overwrite a newer terminal result and its delivery receipt. The bounded fix runs under the existing cross-process journal lock and refuses any stale, duplicate or unauthorized row replacement. A normal `running -> completed/failed/stopped/timed_out/flooded` transition is allowed only with the same immutable job identity and unchanged delivery metadata. A durable authorized `interrupted` retry claim may transition **once** to `running` with its exact authorization binding; a second start is rejected. Terminal and claimed rows never revert through `record`. An unrecognized identity change or delivery-state mutation is rejected without rewriting bytes.

Regressions cover: (1) real second Node writer publishing terminal failure before a stale process attempts to finish and enqueue, (2) stale original child attempting to erase a consumed retry claim, (3) exact one-time claim start plus subsequent valid finish, (4) actual `BackgroundJobRegistry.runAuthorizedRetry` with journal persistence, and (5) a terminal delivery receipt surviving attempted stale overwrites. The source and adversarial mutation checks are included in R4 SELF_AUDIT_ONLY. This is source-level protection against observed interleavings, **not** complete cross-process execution owner fencing, not native Pi display ACK, and not exactly-once side-effect proof. T10/T04/ECO aggregate remain PARTIAL. The old parent SHA 2a2676c had Release Gate and core checks PASS but CI was still running Windows/macOS at inspection; new source requires its own exact-SHA cross-OS checks. F5-01/F5-02 are IN_PROGRESS. No independent review or main merge.


## T10-R12 — progreso verificable bajo contención del journal (2026-11-01; candidato, NO admitido aún)

El CI Windows del SHA `270923bf176bf6ebdfde320b7e16bd839aaf1472`, ejecución 41347622946, falló en `serializes journal updates from independent Pi processes without losing records`: el segundo escritor expiró en `Background journal is busy; refusing a concurrent overwrite` tras 3 segundos. Ubuntu/macOS y los gates Release/Architecture/Pi/T07/R4/F5 pasaron para ese SHA anterior, pero el CI global NO pasó. El fallo no demuestra pérdida de registros ni descarta un problema del entorno Windows.

Corrección acotada T10-R12: mantener 3 segundos como límite cuando no cambia el fichero durable del journal, renovar ese límite solo cuando cambie una identidad observable del fichero (dispositivo/inodo/tamaño/mtime) y fijar un máximo absoluto de 15 segundos, aunque un actor siga alterándolo. No se elimina ningún lock ajeno ni se confía en su PID; una espera agotada sigue rechazando la escritura. Se conserva la prueba real de dos procesos y 100 escrituras; se añaden escenarios adversariales con reloj simulado: progreso real durante más de 3 segundos, lock inmóvil, churn continuo con tope absoluto y denegación EPERM. La autoauditoría R4 comprueba la presencia de ambos límites y de la renovación condicionada, y prueba mutaciones que eliminan cada guardia.

Todo este conjunto se publica como **un único commit/actualización de ref**, con pruebas y documentación, para disparar una sola ronda normal de CI. No se han ejecutado pruebas locales del repositorio en el entorno de este chat: sin checkout GitHub accesible ni dependencias de Node compatibles. No es PASS ni FULL por publicarse; exigir CI exact-SHA Windows/macOS/Linux, Release Gate, R4 SELF_AUDIT_ONLY, F5 estático y demás gates. F5-01/F5-02 siguen IN_PROGRESS, T09/T10/ECO siguen PARTIAL, sin merge a main, sin proveedor ni firma independiente.


## Windows CI 41350048894 — T10 same-size workspace test (2026-11-01)

CI on cf2f5c382d1ebabca30064184a845a9ba1354805 ended FAILURE: Ubuntu/macOS tests PASS and Release Gate/Architecture/Pi/R4/F5/T07 PASS, but Windows tests/t10-public-workspace-actions.test.ts failed at git status --porcelain after a successful same-byte-length replacement (original newline -> resolved newline). The assertion checked transient Git index-stat detection; Windows also emitted LF/CRLF warnings. A racy index/stat view is plausible but not independently proven.

Test-only candidate: use a different-size replacement where the integration test asserts porcelain changes. Separately verify same-length edits through exact changed file bytes, unchanged HEAD blob and unchanged index blob, without relying on immediate porcelain metadata. No production behavior, permissions or authority changed. This must be validated by a fresh exact-SHA Windows/Linux/macOS CI, no FULL promotion on documentation alone.


## T10-R13 retry-of-CI, 2026-11-01: await the scoped asynchronous diagnostic

Exact predecessor SHA `bd82d3374a03702dae27c865b27adf960b726432` reported CI 41351846474 FAILURE on Windows and macOS while Ubuntu CI test lane PASS; R4 workflow 41351846461 FAILED. The failing focused test is identical across three jobs: `tests/background-job-delivery.integration.test.ts`, `a losing process cannot send or acknowledge an unpersisted terminal outcome`, assertion `user gets a scoped diagnostic, not a false success`. The existing test checked `registry.snapshot().persistenceError` and yielded just one `setImmediate`. This only establishes that the synchronous terminal persistence CAS failed; the extension asynchronously awaits monitor flushing and identity canonicalization before emitting the scoped diagnostic. No real product evidence demonstrates a lost notification, a false Pi enqueue or overwritten terminal record from these failures.

Surgical corrective test: wait **at most 5 seconds** for the exact diagnostic from the owning UI (10 ms polling, the same bounded pattern used elsewhere in this integration suite). Keep the precise `persistenceError` assertion and zero Pi enqueues, plus durable competing-row, delivery receipt and restart-no-replay invariants. Do **not** change security policy, production code, timeouts of product operations, waived provider paths or authority pins. The test is no longer tied to an arbitrary scheduling turn, yet a genuinely absent UI notice still fails within 5 seconds. Validation remains pending exact-SHA CI/R4; this is not a claimed local RED/GREEN, F5 FULL, external reviewer or reference parity.

One commit/one ref update per this focused repair; verify CI Windows, macOS, Ubuntu, R4 automated and Release Gate for the resulting exact SHA.

## T09-R7 — preserve journal on unhealthy rollback (candidate, 2026-11-01)

On PR #45 parent 4c67310f1e6c13bcde2d34957dca3f1c78a35f32, managed upgrade could select the old version, fail its CLI probe, report rolled-back and discard the durable recovery journal. Explicit rollback also discarded its journal after a failed probe or skipped the health probe when target was already active. No actual production incident has been observed. Corrected candidate retains the journal, reports ambiguous, and requires a successful observed CLI before clearing the interrupted-upgrade recovery marker. A test with temporary signed versions makes v1 unhealthy only after v2 activation, blocks unsafe re-upgrade and proves later explicit recovery. No trust, installation roots, user data or host configuration are changed. T09 remains PARTIAL until exact-SHA CI/R4 validation.

Recovery authority guard: while an interrupted upgrade journal exists, an explicit --to override pointing anywhere other than its recorded from-version is refused with RECOVERY_REQUIRED, not accepted as clearing the incident. The regression verifies this negative behavior before successful recovery.

Added an explicit interrupted-upgrade journal fixture with current v2 and unhealthy prior v1 to cover the distinct manual-selector rollback path, not just automatic rollback followed by already-selected recovery. The test verifies report ambiguity, retained journal and subsequent verified recovery after the temporary CLI fault is removed. All files and signing keys are generated under test-owned temporary roots.

## T09-R8 candidate — selector publication uncertainty (2026-11-01)

The lifecycle implementation previously erased its interrupted-upgrade journal for any `selectOrReconcile` failure and reported not-activated, even where neither the prior selector nor the publication point was certified. It also treated `active===to` following any exception as successful activation, allowing a competing same-user writer's selector to be mistaken for the invocation's own CAS. This candidate now distinguishes `selected`, provably `not-started`, and `uncertain`; only the proven nonpublication clears the journal and only a `ManagedVersionSelectionError` explicitly attesting committed publication may reconcile target readback. Both unknown selector replacement and an external target-selector winner are covered by signed disposable-package regressions. Conservatively mark ambiguous, preserve recovery journal, block further upgrades and never overwrite user data. R4 SELF_AUDIT_ONLY source gate plus negative mutations added. No local full-suite execution claimed; acceptance requires exact-SHA CI/R4. T09 global remains PARTIAL.

R4 conservative refinement: when an activation call errors, a target-version readback is not proof of CAS ownership unless the selection report explicitly attests publication=committed. A publication=uncertain remains ambiguous and retains the recovery journal.

## T09-R9 candidate — verify update-journal origin and shape (2026-11-02)

Review of the exact PR #45 source found that `rollbackManaged` used the journal's recorded `from` as an unconditional rollback target, without requiring the currently selected version to equal the journal's `from` or `to`. A stale or same-user-replaced journal could select v1 while the active version had independently advanced to v3, then erase the evidence after a successful CLI probe. The surgical repair rejects such unrelated-current recovery as `RECOVERY_REQUIRED` without selection or journal deletion; malformed/non-stable/equal version pairs and absent/noncanonical timestamps are refused at journal load. Regression tests build real signed v1→v2→v3 releases in disposable roots, inject an outdated v1→v2 journal, and check the active selector stays at v3; malformed journal variants are rejected before recovery. R4 SELF_AUDIT_ONLY includes source guards and negative mutation tests. No exact-SHA cross-OS acceptance is asserted until subsequent CI; this does not resolve all same-user hostile races or make T09 aggregate FULL.

## T09-R10 candidate — preserve malformed recovery marker on uninstall (2026-11-02)

Before this change, `uninstallManaged` could delete the owned software and subsequently unlink `managed-update-journal.json` without validating the marker that would cause both `upgradeManaged` and `rollbackManaged` to reject. A malformed interrupted-upgrade journal must remain inspectable, not be silently erased by a destructive operation. The new bounded `readJournal(prefix)` preflight executes after owned-root validation but before the first software removal; malformed marker raises `RECOVERY_REQUIRED`, with no managed bytes, selector, journal or user data changed. Absent or well-formed journals retain the existing confirmed-uninstall semantics. Signed disposable-install regression checks fail-closed behavior and, after explicit removal of its test-owned invalid marker, successful uninstall with user data preserved. R4 SELF_AUDIT_ONLY structural/mutation guard and focused workflow test added. This is a candidate pending exact-SHA Windows/macOS/Linux CI; continuous same-user path races and global T09 FULL remain excluded.

R4 hardening refinement: move the recovery-journal preflight **inside** the cooperative maintenance lock and after the ownership-record recheck, but before the first owned-file deletion. A preflight outside the lock would create a cooperative maintenance race. The self-audit and adversarial mutation check require the locked location. This does not address continuous same-user hostile mutations.
