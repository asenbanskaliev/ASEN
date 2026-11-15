# Flujo de agentes — ASEN

Estado: PLAN_INICIAL_PUBLICADO_PENDIENTE_AUDITORIA (2026-11-15)
Repositorio: `asenbanskaliev/ASEN`
Rama de entrega: `feat/flujo-de-agentes-20261115`
Rama padre: `feat/t12-integrated-acceptance-merge`
Baseline inmutable para este plan: `2d20ecf2dff6b3f0a7cb509f85f0e06ca86827b6`
Referencia a contrastar: Gentle Shell 4.8.0. No declarar paridad hasta observarla.

## Objetivo y límites de autoridad

Convertir la arquitectura existente de ASEN en un flujo de agentes fiable, especializado, configurable, recuperable y verificable, manteniendo el mismo núcleo de Pi/ODD y sin multiplicar runtimes.

Invariantes no negociables:
1. No escribir, integrar ni liberar `main`; la entrega es una rama de desarrollo + PR revisable. No fusionar el PR sin inspección independiente y gates del SHA exacto.
2. No relanzar los dos agentes de usuario que fallaron con Windows `0xC0000409` ni modificar su historia. No atribuirles una causa sin WER/reproducción.
3. No inferir éxito de una prueba offline o un mock. Distinguir arranque nativo, carga de extensión, respuesta RPC, turno de modelo autenticado, permisos, escritura consentida y aceptación A/B.
4. No debilitar la extensión de autoridad, digests firmados, permisos Pi, receiver ligado al Dispatcher, superficies de edición, revisión independiente, identificación sesión/proyecto, reglas de pago ni consentimiento humano.
5. No realizar llamadas a proveedores de pago sin consentimiento explícito. Los live tests son opcionales por credenciales y condición; SKIP significa no ejecutado.
6. Sin salidas sensibles en logs/artefactos: no API keys, tokens, conversaciones, prompts íntegros, stderr completo, rutas privadas WER ni contenido del repositorio no autorizado.
7. No sustituir módulos ya presentes: ampliar `src/agents/{dispatcher,agent-runtime,pi-process-runner,pi-agent-tools}.ts`, `src/orchestration/orchestrator.ts`, `src/review/`, `src/runtime/lifecycle/`, `src/runtime/agents/` y `extensions/asen.ts` respetando compatibilidad.

## Inventario verificado y lagunas del baseline

- `AgentRequest.role` admite `clarifier|explorer|worker|reviewer|verifier`. `AgentRuntime` y `Dispatcher` preservan identidad, concurrencia, almacén y restricciones de Writer.
- `asen_agent_start` admite exploración directa read-only o tareas planificadas `explorer/reviewer/verifier`; Writer usa la ruta controlada del plan.
- `src/runtime/lifecycle/profiles.ts` soporta capas `session > project > global > default`; `/asen-profiles` expone cuatro roles seleccionables y el orquestador no es un hijo equivalente.
- `src/review/review-risk.ts` ya reconoce lenses `risk|resilience|readability|reliability`, pero `planReviewRisk` no ejecuta lentes. `src/review/pi-model-reviewer.ts` ya incluye revisión independiente con registros model Pi y evidencia limitada.
- `src/orchestration/orchestrator.ts` puede planificar 1 o 2 `reviewer` genéricos para revisión explícita, sin roles 4R/JD nativos individualizados.
- `src/runtime/agents/agent-store.ts` exige cinco roles persistentes; añadir identidades especializadas requiere migración explícita o persistir `specialization` como metadato de `reviewer` validado.
- CI y Release Gate pasaron en SHA `a9b5e179` (PR #60); el incidente de Windows `0xC0000409` no tiene causa probada. Verde offline no demuestra turnos de modelo ni Writer real.
- Estado global: conservar `globalFull:false` y distinciones IMPLEMENTED / RUNTIME_WIRED / HOST_TESTED / LIVE_AUTHENTICATED / AB_PARITY / FULL.

## Especificaciones cerradas

### S01 — Estabilidad y trazabilidad P0
- Arranque nativo con Pi exacto de `PiProcessRunner`, bare y con `extensions/authority.ts`; preservar el test existente `tests/pi-native-agent-preflight.test.ts`.
- Introducir diagnóstico seguro por etapas: launch, spawn, policy_preflight, get_commands, model_selection, prompt, settle, cleanup, con eventos limitados y correlación task/session/project. No almacenar salidas sensibles.
- Diferenciar causas: process_spawn, native_exit, authority_load, rpc_protocol, provider_call, permission_denial, timeout, cancellation, invalid_settlement.
- En Windows obtener la información del módulo WER mediante una receta manual de lectura *sin exportar PII*, cuando el host afectado esté disponible. Sin WER, dejar ROOT_CAUSE_UNPROVEN.
- Live smoke read-only con credencial autorizada: Explorer, Verifier, simultaneidad real y entrega del resultado firmado/atado a identidad. Nunca convertir SKIP en PASS.
- El Writer real requiere un consentimiento humano auténtico y separado; no automatizar ni simular aprobación.

### S02 — Routing tipado y especializado P1
- Reutilizar el tipo base `reviewer` y `Dispatcher`; añadir un discriminante estable de especialización `risk|resilience|reliability|readability` ligado a `taskId`, sesión, proyecto y candidato inmutable.
- Las lentes deben tener instrucciones comprobables y diffs congelados, controles contra inyección de prompts, sólo lectura y resultados estructurados validados con esquema estricto.
- Política proporcional por riesgo: trivial sin lente, ordinario reliability opcional, permiso/secretos risk, fallo/reinicio resilience, refactorización readability/reliability, alto riesgo cuatro lentes cuando requerido. Sin lanzar cuatro por defecto.
- Fusionar hallazgos sin borrar desacuerdos, provenance ni duplicados; `PASS` sin evidencia no aprueba nada. Revisión 4R y Verifier son contratos diferentes.
- Integración en plan/Todo con dependencias previas completas y revalidación de versión/candidato antes de cada lector.

### S03 — Perfiles por destino P2
- Ampliar perfiles sin invalidar `asen.runtime-profiles/v1`, ni cambiar preferencia `session > project > global > default`; migración de claves sólo cuando haya necesidad técnica.
- Configurar modelo y thinking por `explorer|worker|reviewer|verifier`, más `review-risk|review-resilience|review-reliability|review-readability` y, en fase JD, `jd-judge-a|jd-judge-b|jd-fix-agent`. Orquestador principal permanece separado.
- Catálogo Pi real, proveedor configurado, capabilities thinking y costes conocidos; entrada desconocida/pago exige consentimiento antes de su uso. Nunca anunciar modelo efectivo por lo solicitado: preferir selección reportada por hijo; si no hay prueba, `actual:unknown`.
- Un plan persistido usa el modelo/thinking fijado en su revisión; no alterarlo al cambiar perfiles. Mantener fallback máximo 8, sin duplicados, cooldown y no escape a pago o modelo más privilegiado.

### S04 — Paralelismo seguro P3
- Diseñar DAG de unidades independientes (código+tests+docs de un comportamiento juntos); correr Worker concurrentes únicamente en worktrees separados o superficies de escritura disjuntas con reservas atómicas comprobadas.
- No crear otro Dispatcher/almacén; reutilizar límites de concurrencia y `TrustedTaskAgentBinder`. Contención bloquea con fallo seguro, nunca autodesbloquea permisos.
- Persistir estados `queued/running/waiting/interrupted/failed/completed`, stop/cancel y dependencias; tras reinicio estado ambiguo = requiere revisión explícita; no replay automático.
- El agregador espera resultados válidos de todos los predecesores y conserva los fracasos; revisores paralelos no escriben.
- Mantener consumo mínimo: sin sondeos continuos de tareas completadas, evitar llamadas de modelo duplicadas, presupuesto de modelos/concurrencia.

### S05 — Judgment Day y paridad P4
- Ampliar revisión dual genérica con contratos Judge A, Judge B y Fix. La revisión debe usar modelos independientes cuando el contrato lo exija; si no hay segundo modelo, reportar UNAVAILABLE.
- `jd-fix-agent` no recibe permiso implícito: cualquier propuesta de cambio se convierte en unidad Writer, con scope, grant fresco y decisión humana.
- Fijar A/B: misma entrada, commit/candidato, modelo y thinking (o registrar diferencias), herramientas/autorizaciones equivalentes, y métricas de tarea correcta, defecto crítico escapado, duración, tokens y coste.
- Aceptación `FULL` sólo con evidencia de flujos reales comparados, compatibilidad en OS previstos y gates exact SHA; no ascender por diseño, documentación o tests sintéticos.

### S06 — UI y observabilidad
- Reusar `/asen-agents`, `/asen-todos`, `/asen-changes`, `/asen-integrations`, `/asen-profiles`, paneles y barra inferior; no nueva aplicación.
- Exponer especialización, requested/resolved/actual-model (con `unknown` honesto), estado y duración, vinculando tarea, candidato y revisión. Sin prompts completos ni secretos.
- La elección 4R/JD no debe cambiar opciones previas de lectura o ejecutar escrituras sin consentimiento.

## Arquitectura y puntos de intervención

| Requisito | Código existente | Posible archivo nuevo | Tests |
| --- | --- | --- | --- |
| S01 | `src/agents/pi-process-runner.ts`, `src/agents/agent-runtime.ts` | `src/agents/pi-native-diagnostics.ts` sólo si el runner no basta | `tests/pi-native-agent-preflight.test.ts`, nuevos tests de errores |
| S02 | `src/review/review-risk.ts`, `src/orchestration/orchestrator.ts`, `src/agents/dispatcher.ts` | `src/review/review-lens-contracts.ts`, `src/review/review-results.ts` | negativos de autoridad, scopes, candidatos |
| S03 | `src/runtime/lifecycle/profiles.ts`, `extensions/asen.ts`, `src/agents/pi-agent-tools.ts` | catálogo de roles compartido sólo si evita duplicación | `tests/runtime-profiles.test.ts`, tests de comandos y enrutamiento |
| S04 | `src/agents/dispatcher.ts`, `src/runtime/lifecycle/plan-dispatcher.ts`, `src/runtime/agents/agent-store.ts` | planificador DAG sólo si falta función existente | colisión Worker, crash, stop/cancel, dependencias |
| S05 | `src/review/pi-model-reviewer.ts`, `src/review/ordinary-review-command.ts` | `src/review/judgment-day.ts` | independencia, validación dual, rechazo de writes |
| S06 | `extensions/asen.ts`, `src/runtime/ui/*` | mínimo UI necesario | TUI, ancho pequeño, estados inciertos |

## Plan ejecutable ODD + TDD por tandas

- [ ] T00 Plan publicado en una rama separada, baseline y permisos fijados; auditar requisitos y dependencias, registrar decisiones sin supuestos implícitos.
- [ ] T01 Auditoría de lanzamiento P0: ruta exacta, fase de salida, protocolo, métricas seguras; pruebas RED primero y GREEN después, CI 3 OS. Sin reintento de incidentes previos.
- [ ] T02 Smoke de modelo autenticado Explorer/Verifier + cadena completa; bloquear aceptación LIVE si falta proveedor aprobado o Windows del incidente.
- [ ] T03 Roles de revisión 4R: catálogo estricto, autoridad read-only, aislamiento candidato y resultados tipados; tests negativos y revisión de seguridad.
- [ ] T04 Enrutamiento desde ODD/Todo de las lentes, selección proporcional y revalidación del estado, sin nuevos privilegios ni gate vacío.
- [ ] T05 Perfiles 4R + JD, selección de modelos/thinking/costes, UI de configuración, no regresión de cuatro destinos existentes, verificación ruta efectiva.
- [ ] T06 Paralelismo de tareas disjuntas, DAG y reconciliación de fallos y reinicio sin replay ni doble escritura.
- [ ] T07 UI Agents/Todos/Changes/Integrations con evidencia solicitada versus observada y distinción SKIP/BLOCKED/FAIL/PASS.
- [ ] T08 Judge A/B y Fix Agent con cadena de autoridad inmutable, independencia y resultados conciliados.
- [ ] T09 Benchmark A/B contra referencia 4.8.0 con pruebas honestas de calidad/tiempo/coste y paridad discriminada.
- [ ] T10 Auditoría integral independiente, regresiones, matriz Windows/macOS/Linux, CI y Release Gate SHA exacto, reconciliación `odd/tasks/equivalencia-funcional-agentes-full.md` y apertura de PR listo para revisión, sin merge a `main`.

Orden: T00 -> T01 -> T02; T01 -> T03 -> T04 -> T05; T04+T05 -> T06 -> T07; T03+T05 -> T08 -> T09; T01..T09 -> T10.

## Contratos de pruebas y aceptación

- Cada cambio de comportamiento: test RED (capturar fallo real por requisito), GREEN, regresión, tests negativos de permisos/proveedor/scope/candidato/reinicio, typecheck y prueba de paquete según alcance.
- Cada PR: CI y Release Gate de SHA exacto; los jobs omitidos son NOT_RUN. Nunca usar un receipt de otro commit como prueba del commit actual.
- Criticidad alta: revisión independiente, sin autovalidación silenciosa.
- Estados ODD por tarea: NOT_STARTED / IMPLEMENTED_UNVERIFIED / TESTED_OFFLINE / LIVE_VALIDATED / AB_VALIDATED / BLOCKED. `FULL` no se deduce de DONE.
- Riesgos bloqueantes: falta de WER para Windows, ausencia de credenciales gratuitas autorizadas, errores de Pi, consentimientos, conflict scope, coste de proveedor desconocido, desalineación upstream.
- Documentar cada decisión y evidencia con commit, SHA de workflow, entorno y limitación en `## Registro de ejecución y auditorías`.

## Registro de ejecución y auditorías

- 2026-11-15 T00 inicio: plan inicial separado del código. Auditoría de coherencia y alcance **pendiente** antes de cualquier modificación funcional.
