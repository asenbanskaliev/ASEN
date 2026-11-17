# Flujo de agentes — ASEN

Estado: IMPLEMENTACION_PARCIAL_EN_PR_DRAFT — SIN DECLARACION_FULL (2026-11-15)
Repositorio: `asenbanskaliev/ASEN`
Rama de entrega: `feat/flujo-de-agentes-20261115`
Rama padre: `feat/t12-integrated-acceptance-merge`
Baseline inmutable para este plan: `2d20ecf2dff6b3f0a7cb509f85f0e06ca86827b6`
Referencia a contrastar: Gentle Shell 4.8.0. No declarar paridad hasta observarla.

## Objetivo final fijado y trazabilidad

**Documento rector del resultado esperado:** [Flujo de agentes — objetivo funcional](./flujo-de-agentes-objetivo.md). Contiene el mapa Orquestador → Clarifier/Explorer → ODD/TODOS → Models/Profiles → Workers aislados → Dispatcher/Verifier → 4R/Judgment Day → Fix autorizado o integración controlada → UI. **Es un objetivo verificable, no un estado ya implementado.**

**Regla de ejecución:** toda tarea T00–T11 debe indicar su contribución a ese flujo, archivos, pruebas negativas, evidencia de modelo/host/CI y estado exacto. Las funcionalidades de interfaz sin conexión real no satisfacen por sí solas el objetivo. No elevar `globalFull:false` a FULL sin pruebas en condiciones reales y revisión independiente.

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

### S07 — Paridad visual y experiencia de Gentle Shell v4.8.0 (T11, P1)
- **Nueva tarea T11:** reconstruir la experiencia visual real de la referencia en el host Pi usado por ASEN: reparto adaptable del espacio, lateral derecho, panel completo en ancho reducido, orden y densidad de secciones, barra de rama/permisos/modelo/esfuerzo/contexto/consumo, editor y accesibilidad por teclado/ratón.
- Usar **solo la fuente fijada v4.8.0 (commit `3dc9029755912358d0a172b4972e5842c239570c`)** y el inventario real de ASEN. No copiar código dependiente de Pi 1.5.2 directamente a ASEN Pi 1.2.0; exigir prueba del host antes de alterar el árbol de componentes.
- Especificación verificable, mapa del diseño y tandas agrupadas: [T11 — paridad visual 4.8.0](./flujo-de-agentes-t11-layout-gentle-shell-4.8.0.md). Sin aceptación de T07 visual ni equivalencia `FULL` hasta pasar T11 con Pi real y CI exact-SHA.

## Arquitectura y puntos de intervención

| Requisito | Código existente | Posible archivo nuevo | Tests |
| --- | --- | --- | --- |
| S01 | `src/agents/pi-process-runner.ts`, `src/agents/agent-runtime.ts` | `src/agents/pi-native-diagnostics.ts` sólo si el runner no basta | `tests/pi-native-agent-preflight.test.ts`, nuevos tests de errores |
| S02 | `src/review/review-risk.ts`, `src/orchestration/orchestrator.ts`, `src/agents/dispatcher.ts` | `src/review/review-lens-contracts.ts`, `src/review/review-results.ts` | negativos de autoridad, scopes, candidatos |
| S03 | `src/runtime/lifecycle/profiles.ts`, `extensions/asen.ts`, `src/agents/pi-agent-tools.ts` | catálogo de roles compartido sólo si evita duplicación | `tests/runtime-profiles.test.ts`, tests de comandos y enrutamiento |
| S04 | `src/agents/dispatcher.ts`, `src/runtime/lifecycle/plan-dispatcher.ts`, `src/runtime/agents/agent-store.ts` | planificador DAG sólo si falta función existente | colisión Worker, crash, stop/cancel, dependencias |
| S05 | `src/review/pi-model-reviewer.ts`, `src/review/ordinary-review-command.ts` | `src/review/judgment-day.ts` | independencia, validación dual, rechazo de writes |
| S06 | `extensions/asen.ts`, `src/runtime/ui/*` | mínimo UI necesario | TUI, ancho pequeño, estados inciertos |
| S07 / T11 | `extensions/asen.ts`, `src/runtime/ui/{m1-readonly-rail,native-work-panel,ide-panel,focus-chrome,host-status-projection}.ts`, `src/runtime/responsive-layout.ts` | diseño adaptable y opciones visuales, solo si el host no permite reutilizar una función actual | Pi TUI real y responsive, interacción, reflow, identidad, modelo/coste desconocidos y tres SO |

## Plan ejecutable ODD + TDD por tandas

- [x] T00 Plan publicado en una rama separada, baseline y permisos fijados; auditoría de código y dependencias documentada abajo. **AUDITADO, no equivale a implementación funcional**.
- [ ] T01 Auditoría de lanzamiento P0: ruta exacta, fase de salida, protocolo, métricas seguras; pruebas RED primero y GREEN después, CI 3 OS. **PARCIAL:** script read-only Windows WER y tests de seguridad/parseo; falta ejecución en el Windows afectado y atribución causal.
- [ ] T02 Smoke de modelo autenticado Explorer/Verifier + cadena completa. **PARCIAL:** Explorer y Verifier Pi reales autenticados con NVIDIA y árboles Git sintéticos superaron la prueba del SHA `9dcb6cf1`; se ha endurecido la comprobación de modelo y respuesta para la tanda actual, pendiente del CI exacto. Faltan cadena completa y dos Workers de escritura con consentimiento individual.
- [ ] T03 Roles de revisión 4R: catálogo estricto, autoridad read-only, aislamiento candidato y resultados tipados. **IMPLEMENTADO EN CANDIDATO:** contratos read-only, Pi real tool-free por lente, bundle genuino y tests negativos; falta cierre CI/Release Gate exacto y revisión independiente.
- [ ] T04 Enrutamiento desde ODD/Todo. **PARCIAL:** `/asen-review todo <id>` prepara la revisión de un Worker ODD real en su sesión, con HEAD y ámbito verificados; `/asen-review workspace 4r` ofrece cuatro lentes explícitas y `/asen-review workspace adaptive` selecciona una a cuatro según riesgo, con consentimiento y modelos autenticados. En riesgo alto exige al menos risk+reliability e indica verificación independiente pendiente. Falta conectarlo al plan ODD/Todo y a identidad durable especializada.
- [ ] T05 Perfiles 4R + JD. **PARCIAL:** once destinos, consulta de rutas 4R y perfil Fix sin consumirlo; creación/edición UI y resolución especialidad→rol base por capas; 4R y Judge A/B pueden usar modelos autenticados configurados. `jd-fix-agent` sigue siendo solo destino de configuración. El revisor in-process rechaza thinking configurado sin soporte demostrado. Costes y modelos reales no comprobados.
- [ ] T06 Paralelismo. **PARCIAL, SUPERVISOR DE DESPACHO IMPLEMENTADO:** `/asen-worktrees prepare-todos` reserva 2–4 tareas Worker en worktrees aislados, `attach` confirma sesiones Pi hijas reales, `plan-todo` reconstruye ODD independiente. `/asen-worktrees supervise` prepara el lote, exige confirmación global y **una confirmación adicional por Worker**, verifica scopes, dependencias, modelo y estado Git y utiliza **el `dispatchNextPlanTask` ya existente** para iniciar Pi RPC en el worktree del hijo. No inventa sesiones, no hereda grants, no reanuda los intentos inciertos y detiene los siguientes si un lanzamiento falla. `collect` registra resultados terminales de forma atómica sin PASS ni merge; `status`/`review` muestran las evidencias. **Falta probar despachos con Pi y modelo reales, gestionar ciclo de vida completo/cancelación entre hijos, verificar coste y paridad A/B**; no marcar completo.
- [ ] T07 UI Agents/Todos/Changes/Integrations con evidencia solicitada versus observada y distinción SKIP/BLOCKED/FAIL/PASS. **PARCIAL, INTEGRACIÓN EN PANEL Pi:** TODOS y REVIEW muestran los Workers que necesitan revisión y su comando, sin aceptar cambios; el núcleo `src/runtime/ui/agent-flow-overview.ts` alimenta `/asen-worktrees status`/`review`; `src/runtime/ui/agent-flow-panel-source.ts` consulta de forma acotada los diarios de origen, asociaciones Pi y cambios Git; `getPanelSnapshot` proyecta estados en los paneles nativos TODOS/AGENTS/CHANGES/INTEGRATIONS, incluso si la sesión padre no contiene agentes. Sin modelos realmente consumidos, `actual:unknown`. Falta model receipt autenticado, telemetría/coste, barra inferior y prueba TUI live; mantener parcial.
- [ ] T08 Judge A/B y Fix Agent. **PARCIAL:** Judgment Day propone un Fix a partir de resultados auténticos y guarda propuestas de forma privada y sin autoridad en `JudgmentFixProposalJournal`, consultables mediante `/asen-review fixes`; los dos jueces no conceden RDD, Writer, merge ni auto-fix. `/asen-review fix-plan <id>` ya recupera el registro Fix de la sesión original y ofrece un borrador ODD acotado sin autoridad. **NUEVO PARCIAL:** `/asen-review fix-plan <id> save` usa el planificador ODD habitual para guardar nuevas tareas tras una instrucción humana, comprobación del árbol Git y consentimiento de guardado. Los Workers conservan el árbol revisado en `plan.fixSource`, que el despachador vuelve a comprobar antes y después de la autorización y justo antes del lanzamiento. **Todavía falta** demostrar una reparación con Writer Pi real y autorización humana individual, cierre de revisión independiente y recuperación ante interrupciones; no se reutiliza ningún consentimiento anterior.
- [ ] T09 Benchmark A/B contra referencia 4.8.0 con pruebas honestas de calidad/tiempo/coste y paridad discriminada. **PARCIAL:** comparador tipado de observaciones emparejadas y pruebas negativas; falta realizar mediciones reales con Gentle Shell 4.8.0 y revisión independiente.
- [ ] T10 Auditoría integral independiente (**auditoría interna 4R documentada en `docs/audit/4r-flujo-agentes-pr61-2026-11-16.md`, no sustituye revisión independiente**), regresiones, matriz Windows/macOS/Linux, CI y Release Gate SHA exacto, reconciliación `odd/tasks/equivalencia-funcional-agentes-full.md` y apertura de PR listo para revisión, sin merge a `main`.
- [ ] **T11 — Paridad visual Gentle Shell 4.8.0: layout adaptable, lateral derecho, panel para pantallas estrechas, TODOS/JOBS/AGENTS/CHANGES/REVIEW/STATS/INTEGRATIONS, barra de estado y personalización.** **PENDIENTE DE IMPLEMENTACIÓN, ANÁLISIS DE REFERENCIA DOCUMENTADO.** [Desglose T11 completo](./flujo-de-agentes-t11-layout-gentle-shell-4.8.0.md). T11 debe conservar los datos observados de T06/T07 y comprobar Pi real en escritorio y pantallas estrechas. Ningún widget sobre el editor se considera un lateral derecho equivalente.

Orden: T00 -> T01 -> T02; T01 -> T03 -> T04 -> T05; T04+T05 -> T06 -> T07 (fuentes reales) -> **T11 (diseño/host/UI)**; T03+T05 -> T08 -> T09; **T01..T09 + T11 -> T10**.

## Contratos de pruebas y aceptación

- Cada cambio de comportamiento: test RED (capturar fallo real por requisito), GREEN, regresión, tests negativos de permisos/proveedor/scope/candidato/reinicio, typecheck y prueba de paquete según alcance.
- Cada PR: CI y Release Gate de SHA exacto; los jobs omitidos son NOT_RUN. Nunca usar un receipt de otro commit como prueba del commit actual.
- Criticidad alta: revisión independiente, sin autovalidación silenciosa.
- Estados ODD por tarea: NOT_STARTED / IMPLEMENTED_UNVERIFIED / TESTED_OFFLINE / LIVE_VALIDATED / AB_VALIDATED / BLOCKED. `FULL` no se deduce de DONE.
- Riesgos bloqueantes: falta de WER para Windows, ausencia de credenciales gratuitas autorizadas, errores de Pi, consentimientos, conflict scope, coste de proveedor desconocido, desalineación upstream.
- Documentar cada decisión y evidencia con commit, SHA de workflow, entorno y limitación en **Registro de ejecución y auditorías**.

## Auditoría de coherencia previa a implementar — 2026-11-15

**Auditoría estática del código** efectuada contra el SHA de origen y del primer commit del plan; no es una revisión externa ni un smoke en el equipo Windows. Antes de declarar cada tarea terminada se exige corroborar CI del commit concreto.

| Hallazgo | Evidencia observada | Decisión de implementación |
| --- | --- | --- |
| A01: rol especializado altera formato durable | `AgentRequest.role` y `AgentStore.specValue` tienen listas cerradas de cinco roles | **No agregar nueve valores a `role` inicialmente**: conservar `reviewer` como autoridad base y añadir identidad `reviewTarget`/lens a un contrato de revisión independiente; sólo migrar store si hay un caso funcional completo y backwards-compatible |
| A02: 4R ya tiene base | `src/review/review-risk.ts` valida 4 lenses, pero no los ejecuta | Reutilizar `planReviewRisk` y `pi-model-reviewer`, no otro runner o herramienta con más privilegios; introducir contrato de entradas/salidas, evidencia congelada y catálogo separado |
| A03: perfil acepta claves arbitrarias | `src/runtime/lifecycle/profiles.ts` usa `Record<string,RouteChoice>` y `resolveRuntimeRoute` por clave | Mantener esquema v1; crear catálogo cerrado de destinos *visibles* y resolución con fallback de especialidad a `reviewer` sin que un perfil arbitrario permita crear privilegios |
| A04: wizard incompleto | `extensions/asen.ts` crea perfiles con cero o una ruta y `editSavedProfile` sólo modifica roles existentes | Ampliar la creación/edición por destinos de forma acumulativa; guardar con CAS/signature existente y mantener cancelación sin escritura |
| A05: dos revisores no son 4R/JD | `src/orchestration/orchestrator.ts` produce 1-2 `reviewer` genéricos, ambos usan la misma ruta `reviewer` | Añadir selección JD/4R por criterio ODD explícito; mostrar especialidad como evidencia, nunca equiparar dos agentes genéricos con dos jueces independientes |
| A06: revisión independiente ya validada | `src/review/pi-model-reviewer.ts` exige modelo autenticado y distinto al autor, valida resultados JSON y no usa herramientas | Conservar ese motor para revisiones tool-free; un juez distinto necesita verificación de independencia e identidad, no sólo diferente id de tarea |
| A07: P0 tiene límite de prueba | PR #60 corrige rutas y contiene preflight real provider-free; `0xC0000409` sigue sin WER | Priorizar diagnóstico seguro; diferenciar los gates CI/offline, live y Windows host. No bloquear documentación o componentes puros por ausencia de Windows; sí bloquear declaración de estabilidad resuelta |
| A08: autorización y configuración | `pi-process-runner.ts` pasa únicamente la credencial explícita y extensión de autoridad fijada | No inyectar variables de entorno, ni autoelegir modelo de pago, ni mutar la selección de modelo persistida; rechazar rutas desconocidas antes de gastar |
| A09: paralelismo parcial ya existe | `Dispatcher` limita `maxConcurrency=4` y `TrustedTaskAgentBinder` protege vínculos durables | No introducir worker pool duplicado ni asumir que concurrente equivale a Writer paralelo seguro; probar colisiones y recuperación primero |
| A10: modelo de test sin CI local | GitHub sirve el código pero el entorno de ejecución actual no puede clonar el repo desde Internet | Usar los tests TypeScript existentes y runners GitHub Actions; ningún resultado se considera PASS hasta comprobar el SHA exacto publicado en CI |

### Diseño de integración autorizado por el plan

1. Separar **tipo de autoridad** (`explorer|worker|reviewer|verifier`) de **especialidad** (`review-risk` etc). Especialidad nunca concede herramientas; se rechaza para otro rol.
2. **Etapa de perfil primero:** añadir catálogo tipado de destinos UI + pruebas puras, y actualizar el editor de perfiles con controles existentes. No mutar el esquema de archivos ni la precedencia de capas.
3. **Etapa revisión:** añadir catálogo de 4R con prompts de alcance limitado y agregación pura, luego conectar el ejecutor existente con evidencia de candidato congelado. Un plan 4R sin completarse es estado pendiente, no PASS.
4. **Etapa runtime:** implementar identidad especializada cuando los contratos estén verdes; actualizar persistencia de manera aditiva, pruebas de lectura de archivos antiguos y rechazo de campos/migraciones inválidas.
5. **Etapa ODD:** documentar reglas explícitas de activación y costo; gating sin auto-lanzamiento para tareas pequeñas. Conectar al plan sólo cuando la fase anterior esté validada.
6. **Etapa UI y JD:** desplegar después de pruebas de contratos/routing; no confundir menú con ejecución real.
7. **A/B:** disponer de fixture y metodología antes de medir; jamás inventar métricas ni declarar paridad sin recibos comparables.

### Reglas de aceptación reforzadas

- Un test que no tuvo lugar = NOT_RUN, aun cuando CI general sea verde.
- Un perfil especializado solo cambia `model`/`thinking` en peticiones autorizadas; no puede alterar `role`, `writeSurfaces`, `skillContext`, `writerAdmission` ni `candidate`.
- Un resultado de lente debe estar ligado a la solicitud, el candidato, la sesión y el modelo de origen; si no coincide, rechazarlo y no consolidarlo.
- La cancelación o una selección 'Back' no escribe configuración ni activa perfiles.
- Ante pérdida del proceso, controles de aprobación caducados o identidad cambiada: detener sin nuevas escrituras/reintentos.
- El PR permanece en borrador hasta que se documenten resultados completos, fallos conocidos y revisión independiente.

## Registro de ejecución y auditorías

- 2026-11-15 T00: publicado `60262309` en rama separada y PR #61 borrador. Auditoría estática A01–A10 completada; **todavía no hay nueva implementación ni prueba independiente**.

## Registro de implementación del primer bloque — 2026-11-15

| Entrega | Commits de esta rama | Alcance comprobable | Limitación de aceptación |
| --- | --- | --- | --- |
| Plan y auditoría T00 | `60262309`, `0f2247bd` | Plan ODD, hallazgos A01–A10 y PR #61 draft | No son ejecución |
| Perfiles T05 | `522f4289`, `867ecd55`, `c91dfef6` | Catálogo de destinos, herencia por scope, UI create/edit y tests | JD sólo configurable, falta ejecución; thinking de reviewer no aplicado |
| Política documental | `8cafce47` | Excepción de ruta exacta para este archivo de procedencia | No se relajó el escaneo de fuentes |
| Lentes 4R T03 | `ab7db45a`, `d565b830`, `b9cd4950`, `0683ca87`, `b82c6ce` | Prompts de enfoque, resultado genuino por lente, agregador que rechaza falsificaciones y pruebas | Faltaba terminar gates del SHA final |
| Comando 4R opt-in T04 | `641762d6`, `184dabe7`, `3105691d` | `/asen-review workspace 4r`; confirma cuatro llamadas; no hace admisión RDD | Misma interfaz de modelo por defecto si no hay ruta configurada |
| Modelos por lente T05 | `a4659b95`, `35ffc747`, `aa9de573`, `bd8d365a` | Resuelve perfil por lente, exige modelo autenticado y no igual al autor; rechaza effort no demostrable | La interfaz Pi streamSimple no prueba aplicar effort |
| Diagnóstico Windows T01 | `e4609327`, `568d1bea` | Script WER read-only, salida acotada y test PowerShell sintáctico Windows | No ejecutado en el Windows afectado, causa raíz pendiente |

### Observaciones de CI durante iteración

1. Phase 0 falló inicialmente porque la nueva documentación ODD contenía referencias externas no exentas. Corregido con una excepción **sólo documental y exacta**; el siguiente Phase 0 pasó.
2. Release Gate detectó un error de tipo en la comparación de una lente con el `ReviewPlan` real (objeto, no lista). Corregido en `b82c6ce`.
3. Pi runtime evidence detectó una expectativa obsoleta del texto de ayuda de `/asen-review`. Actualizada en `3105691d`.
4. El compilador detectó un assert de test que podía retornar un resultado síncrono. Normalizado a Promise en `bd8d365a`.
5. Los resultados anteriores se refieren a SHA anteriores y **no validan** automáticamente este HEAD. El gate exacto del último commit sigue por comprobar.
6. No se ha hecho una prueba real del modelo, no se ha lanzado Writer con autorización humana, no se ha resuelto el fallo nativo Windows, no hay integración de JD ni equivalencia FULL.

### Revisión adicional sobre concurrencia

`src/runtime/lifecycle/workspace-writer-lease.ts` publica un archivo `asen-t05-writer.lock` dentro del directorio Git. Por seguridad sólo permite un Writer por Git root. Las validaciones de superficies disjuntas en `src/policies/scopes.ts` no sustituyen el lock entre procesos. El diseño T06 debe asignar un worktree separado por unidad paralela, con permisos mínimos, mutex independiente, candidato congelado y reconciliación posterior en el coordinador. Hasta disponer de ese protocolo, no se afirmará paralelismo seguro de Writers en un mismo Git root.

### Comando de diagnóstico manual (sin lanzamiento de agentes)

En el host Windows afectado y desde la carpeta del proyecto, ejecutar `powershell -NoProfile -File .\\scripts\\diagnose-asen-pi-native-windows.ps1 -LookbackHours 48 -MaxEvents 100`. La salida contiene sólo metadatos seleccionados de los eventos Application Error / Windows Error Reporting que mencionan `0xC0000409`, sin contenido íntegro de eventos ni rutas de procesos. Si no hay coincidencias, la causa sigue sin probar.

### Siguiente frontera de admisión

Aceptar en la rama únicamente los bloques de perfiles y revisión 4R cuando el mismo HEAD tenga tests, Phase 0, CI y Release Gate correctos. Cerrar T01/T02 requiere prueba del Windows/servicio real; T06 requiere worktrees segregados; T08 requiere prueba de independencia Judge A/B y canal de Fix sin Writer automático. `globalFull:false` continúa.

## Continuación — revisión proporcional y Judgment Day

- Modo adaptativo: `src/review/review-lens-selection.ts`, pruebas y comando `/asen-review workspace adaptive`, con mínimo de Risk y Reliability para gravedad alta. No es despacho automático desde ODD.
- Judgment Day: `src/review/judgment-day.ts`, dos modelos autenticados distintos del autor y entre sí, perspectivas independientes, mismo candidato genuino; comando manual `/asen-review workspace judgment-day` y consentimiento para dos llamadas.
- Las revisiones no tienen herramientas, no autorizan Writer ni RDD y no ejecutan Fix Agent; cualquier propuesta de corrección deberá tramitarse como Worker con consentimiento fresco.
- Pruebas nuevas: `tests/review-lens-selection.test.ts`, `tests/judgment-day.test.ts`, contratos negativos en `tests/ordinary-review-assessment.test.ts`.
- El CI del SHA `3673b613` encontró dos regresiones de snapshots (texto de ayuda, opciones de edición de perfiles). Se corrigieron en commits posteriores. El Release Gate verde de ese SHA no valida un HEAD posterior.
- PENDIENTE: CI/Release Gate SHA exacto, revisión independiente, conectividad de modelos reales, Windows WER, ODD/Todo durable, worktrees concurrentes y benchmark A/B. Mantener `globalFull:false` y PR #61 borrador.


## Fase T06 — worktrees y paralelismo seguro (2026-11-15)

### Entregas de código

- `src/runtime/agents/parallel-worktrees.ts` crea worktrees desacoplados del Git root activo, con HEAD idéntico y `git worktree add --detach`. Requiere fuente limpia, dos a cuatro tareas, ámbitos de escritura explícitos, no solapados (también sin diferencia de mayúsculas), nombres seguros y directorio padre existente fuera del proyecto. Usa `execFileSync` sin shell y desactiva hooks `post-checkout` mediante `core.hooksPath` temporal no existente.
- Cada asignación queda marcada `grantsAuthority:false`, `autoMerge:false`; no existe importación de grants ni traslado de autoridad desde el repositorio padre. Un Worker solo puede actuar si una nueva planificación ODD, una aprobación explícita y los controles de ASEN emiten un grant para la **raíz de su worktree**.
- `dispatchApprovedParallelWorkers` exige una instancia genuina de `Dispatcher`, contextos de skill emitidos y vinculados a candidato, identidad y permisos propios del Worker y un batch no reutilizado. Ejecuta concurrentemente dos a cuatro solicitudes y devuelve resultados para inspección; la excepción no se reintenta, y no existe merge automático.
- `src/runtime/lifecycle/parallel-worktree-command.ts` y `/asen-worktrees prepare` conectan la preparación al TUI existente, con editor JSON, confirmación expresa del alcance y captura de identidad sesión/proyecto antes y después. Rechaza entornos sin TUI, identidad obsoleta y consentimiento denegado.
- `extensions/asen.ts` registra el nuevo comando; `src/runtime/ui/command-catalog.ts` lo incluye en el catálogo y la paleta Workflow.
- `tests/parallel-worktrees.test.ts`: worktrees reales aislados, dos leases simultáneos, comprobación del árbol principal inalterado, bloqueo de scopes malformados, identidad falsificada, conflicto de rutas, test de concurrencia mediante el **Dispatcher real con grants ODD emitidos para cada worktree** y prueba de no ejecutar hooks Git.
- `tests/parallel-worktree-command.test.ts`: cancelación, entorno sin UI, autorización interactiva, solicitud JSON malformada, cambio de identidad y ausencia de permisos implícitos.

### Secuencia operativa correcta

1. En la raíz del proyecto, preparar un directorio **ya existente** para worktrees aislados, fuera del árbol original (por ejemplo, un directorio hermano dedicado).
2. Ejecutar `/asen-worktrees prepare` y revisar `parentDir`, `taskId` y `writeSurfaces` antes de confirmar.
3. Abrir una sesión Pi **separada en cada worktree**. Para cada una, volver a planificar la tarea ODD, verificar su candidato específico y aprobar manualmente el alcance Writer. Los perfiles/modelos se resuelven en la nueva sesión, no se heredan autorizaciones.
4. Los Workers autorizados pueden correr en paralelo porque cada Git root posee su bloqueo exclusivo de escritura. El `Dispatcher` sigue aplicando sus límites de concurrencia.
5. Tras terminar, revisar estados, cambios y pruebas por worktree; **no** integrar automáticamente. Los worktrees con estado incierto, modificaciones fuera de scope o fallo deben preservarse para inspección. No replay automático.

### Límites y evidencias todavía requeridos

- `/asen-worktrees prepare` **solo prepara** el terreno; no hace autolanzamiento de Workers ni migra un Todo guardado a otra raíz. La ejecución de lote está implementada como API interna que recibe solicitudes ya autorizadas, todavía sin productor automático desde el plan ODD.
- Las pruebas del `Dispatcher` en CI usan runner instrumentado sin proveedor de IA. Pueden verificar rutas, grants y paralelismo de procesos/solicitudes en local, pero **no** la validez de un modelo autenticado ni el resultado funcional de la tarea.
- **Nota histórica superada por los bloques posteriores:** la correlación durable origen→Todo→worktree y origen→sesión Pi se incorporó en T06; siguen pendientes los recibos live de ejecución, aceptación independiente e integración/merge. Los crasheos nunca se interpretan como PASS.
- La prueba native Windows `0xC0000409`, la equivalencia A/B, el Fix Agent automático con consentimiento, auditoría independiente y el CI de SHA exacto de esta tanda siguen condicionados a sus evidencias; `globalFull:false`.


## T06 — Continuación de enlace durable ODD/TODOS y recuperación (2026-11-15)

### Nuevo comportamiento y ubicación

- **Vinculación real con TODOS:** `src/runtime/agents/parallel-todo-bindings.ts` valida los datos actuales del `SessionTodoStore.list` del proyecto fuente: sesión exacta, rol `worker`, estado `planned`, ID `asen-plan:...:worker`, fase `apply`, candidate de origen con HEAD fijado, ámbitos exactos y predecesores `done/succeeded`. Rechaza tareas inexistentes, repetidas, modificadas, con permisos o rutas incompatibles y dependencias incompletas.
- **Diario de reserva privada:** `src/runtime/agents/parallel-todo-journal.ts` y su ruta en `~/.asen/parallel-todo-worktrees.json` (almacenamiento privado) registran una reserva mediante bloqueo exclusivo + escritura atómica **después de confirmar y antes del primer `git worktree add`**. Cada reserva tiene ID aleatorio y directorios de destino deterministas para recuperar una interrupción sin reintento silencioso. El diario bloquea reservas duplicadas por tarea, valida su esquema exacto y solo marca `prepared` tras verificar allocations auténticas, HEAD y raíces Git.
- **Comando TUI:** `/asen-worktrees prepare-todos` usa TODOS reales y un formulario precargado con dos Worker planificados; compara las revisiones después del diálogo antes de reservar. `/asen-worktrees prepare` se mantiene como preparación manual sin vínculo ODD, y `/asen-worktrees status` consulta sin escritura las reservas de la sesión/proyecto, sus tareas de origen y presencia de worktrees.
- **Persistencia y degradación:** `reserved` después de un crash, errores de Git, contexto cambiado o failure del journal indica `REQUIRES_MANUAL_RECONCILIATION`, nunca `DONE` ni `RETRY`. Un `prepared` solo demuestra preparación de worktrees, **no ejecución de Worker**, revisión ni aceptación.
- **TDD:** `tests/parallel-todo-bindings.test.ts` y `tests/parallel-worktree-todos.test.ts` cubren rutas ODD, cambios de revisión, dependencias, autorización denegada, interrupción simulada entre reserva y preparación, identidad cruzada, duplicación y lectura sin auto-resume.

### Frontera de autoridad

El vínculo al Todo de origen es una **referencia de auditoría**, no el traslado de un `writerAdmission` ni de un `phaseGrant`. Cada worktree debe iniciar su propio plan ODD y obtener una aprobación Worker nueva. El `Dispatcher` sigue validando grants de aplicación, ODD, skillContext, candidato y ámbito de escritura en su raíz independiente. Ningún Todo de origen es marcado `running` o `done` por la preparación.

### Criterios no satisfechos — T06 sigue abierto

- El despacho del plan ODD fuente a varios Workers de worktree **aún no está automatizado**. Existe una inspección de cambios y conflictos de solo lectura, pero no acciones de merge/rebase ni aceptación ni reconciliación aprobatoria de resultados.
- No se ha ejecutado un proveedor IA autenticado en varios Workers. Sin WER del Windows afectado, `0xC0000409` permanece sin causa demostrada.
- Todo gate anterior a la corrección final es histórico y no acredita este HEAD. La PR #61 sigue draft y `globalFull:false` hasta CI exacto, revisión externa y pruebas reales autorizadas.

## T06 — Continuación: asociación real de sesiones Pi y revisión cruzada (2026-11-15)

### Nuevas rutas de ejecución y observabilidad

- `/asen-worktrees attach` desde una **sesión Pi real abierta dentro del worktree**: solicita confirmación específica para asociar la sesión con el Todo de origen. Comprueba raíz Git real, mismo repositorio común y HEAD previsto; rechaza el repositorio fuente, sesiones duplicadas, identidades cambiadas y worktrees no preparados. El registro `src/runtime/agents/parallel-todo-session-links.ts` es privado, con bloqueo y escritura atómica; incluye `authority: none`, `autoDispatch: false` y `autoMerge: false`.
- `/asen-worktrees status` desde el proyecto fuente: puede leer el vínculo al hijo y observar tareas y agentes de la sesión Pi del worktree mediante los almacenes actuales. Un agente `completed` **no prueba** modelo consumido, revisión independiente, pruebas de software ni integración aceptada.
- `/asen-worktrees review` agrega por lote los cambios Git reales y estados observados. `src/runtime/agents/parallel-worktree-change-inspection.ts` compara cada worktree con el SHA base (incluye commits, staged/unstaged y untracked/ignorados) sin ejecutar comandos ni hooks de la aplicación; rechaza árboles ausentes, procedencias ambiguas y cambios fuera del ámbito autorizado. `src/runtime/agents/parallel-worktree-reconciliation.ts` detecta conflictos por ruta entre Workers, desviación del HEAD, tareas de origen modificadas, fallos y estado desconocido.
- Las únicas disposiciones de conciliación son `blocked`, `not-started` y `manual-review-required`. **Ninguna es PASS, aceptación RDD, autorización Writer ni permiso de merge.** No se borran ni reintentan worktrees automáticamente.
- La preparación inicial reutiliza un directorio padre con worktrees hermanos previamente registrados sin permitir anidamientos de raíces Git desconocidas. El diario privado prohíbe escrituras solapadas no solo en cada lote, sino **entre lotes y sesiones del mismo proyecto**, incluso con diferencias de mayúsculas en las rutas.

### Nuevas pruebas TDD

- `tests/parallel-worktree-todos.test.ts`: asociación de sesión real, confirmación denegada, identidad y HEAD distintos, enlace duplicado, observación de AgentRuntime y vista `review` frente a una escritura real fuera de scope.
- `tests/parallel-worktree-change-inspection.test.ts`: clean vs scoped, archivos rastreados, nuevos, ignorados, commit local y raíces Git inválidas.
- `tests/parallel-worktree-reconciliation.test.ts`: bloqueo por conflicto de archivos, candidate drift, observación fallida, source Todo desactualizado y ausencia de autorización implícita.
- `tests/parallel-worktrees.test.ts`: Git `core.autocrlf=false` para impedir que una configuración del runner Windows modifique los bytes del fixture.

### Verificaciones y hallazgos de esta continuación

- CI anterior sobre `41f78107` identificó una aserción que no contemplaba reusar el directorio contenedor de worktrees y diferencias CRLF de Git para Windows. Corregidos con una comprobación estricta de **hermanos** y fixture independiente del autocrlf global; no se suprimieron tests.
- El primer gate del diario Pi `parallel-todo-session-links.ts` identificó una conversión de TypeScript demasiado amplia, corregida en `d284a9ec`.
- El primer gate de conciliación encontró inferencia `any` en `Array.isArray`, corregida en `9ef1fa31`.
- Los resultados verdes de SHA anteriores son históricos; el último SHA de esta tanda exige CI + Pi + Phase 0 + Release Gate completo. Un CI `cancelled` o un job `skipped` no es PASS.
- **Pendiente mayor:** un productor automático ODD/TODO que cree planes seguros en los worktrees **sin suplantar la sesión Pi del usuario**, obtenga autorización independiente por Worker, consuma modelos reales y registre verificaciones y decisiones de integración. La solución actual NO presume ese permiso ni inicia Workers desde la sesión origen.

## T06 — Planificación del Todo del origen en la sesión Pi hija (2026-11-15)

### Implementación conectada

- El comando **`/asen-worktrees plan-todo`** solo es válido en una sesión Pi TUI que se haya asociado previamente mediante `attach` al worktree exacto. No admite repositorios o sesiones ajenos y no copia `writerAdmission`, `phaseGrant` ni credenciales.
- Recupera el Todo Worker original desde el almacén de la sesión/proyecto fuente, revalida las **2–4 tareas del lote** (roles, revisiones, dependencias, candidate, scope y base Git), comprueba que el worktree no tenga modificaciones y regenera el plan con `controlledInstructionPlanCommand` usando el **proyecto y candidato del hijo**.
- Rechaza cualquier cambio de ruta ODD a una categoría sin Worker delegado o cualquier ampliación o desviación de `writeSurfaces`. El usuario ve la instrucción original como dato no confiable, HEAD, scope y las implicaciones de iniciar el plan antes de confirmarlo.
- **Tras la confirmación**, escribe de forma atómica el `ParallelChildPlanClaimJournal` (`~/.asen/parallel-child-plan-claims.json`). El estado `claimed-not-verified` es deliberado: un cierre repentino o fallo del planificador no reabre un grant ni permite un replay oculto.
- El adaptador de `extensions/asen.ts` llama al **mismo** `preparePlan` utilizado por `/asen-plan`. Ese planificador conserva las rutas, selección de skills y tokens ODD existentes; cualquier Worker requiere **un segundo consentimiento Writer** de la sesión hija. No se inicia desde el origen usando una identidad Pi suplantada.
- La vista `/asen-worktrees status` indica `handoffClaimed` únicamente como evidencia de intento, jamás como ejecución terminada, modelo consumido o aceptación.

### Pruebas de seguridad y no-replay

- `tests/parallel-worktree-todos.test.ts`: plan ODD recalculado sobre el repositorio hijo, petición confirmada una única vez y envío exacto de hechos originales al planificador instrumentado. Rechazo de sesión no asociada, consentimiento denegado, cambios Git y planificación repetida.
- Los tests de la conexión de planificación son instrumentados; **no prueban un turno real de Pi, uso de proveedor, costes ni el `0xC0000409`**.

### Limitación T06 que permanece abierta

No existe todavía una coordinación autónoma que cree múltiples sesiones Pi vivas desde un único supervisor y complete la tarea sin abrir la sesión hija. La ruta actual reduce pasos manuales y utiliza el planificador/Dispatcher de producción sin rebajar permisos, pero **no debe declararse paralelismo FULL ni escritor multiagente de extremo a extremo** hasta ejecutar Worker real por worktree, verificar evidencias y conciliar resultados con aprobación independiente.

Se mantiene la PR #61 en **draft** y `globalFull:false`, sin merge automático.

## T07 — Proyección de flujo observable y honesta (2026-11-15)

- Objetivo funcional fijado: [flujo-de-agentes-objetivo.md](./flujo-de-agentes-objetivo.md). El mapa y los paneles allí descritos son objetivo, no prueba de implementación.
- `src/runtime/ui/agent-flow-overview.ts`: derivación sin efectos secundarios sobre ODD/TODOS, worktrees Git y observación de agentes. La salida conserva identidad lote/tarea, fase observada, siguiente paso informativo y total por fase. No incluye prompts, conversaciones, credenciales ni grants.
- `/asen-worktrees status` y `/asen-worktrees review` muestran `flowOverview`, que nunca confunde `completed` observado con código aceptado. `modelRequested`, `modelResolved` y `modelActual` permanecen en `unknown`, con `modelConsumedProven:false` hasta que exista un recibo verificable del modelo usado.
- Tests `tests/agent-flow-overview.test.ts` cubren reservas, sesiones, plan hijo, actividad, terminal sin verificar, fallos, desvío de HEAD, scope incorrecto, duplicados y datos inválidos. `tests/parallel-worktree-todos.test.ts` prueba la proyección desde journal y comando existentes.
- **Pendiente T07:** integrar estas señales con TODOS/AGENTS/CHANGES/INTEGRATIONS y barra inferior, añadir prueba auténtica de modelos y validar la UX TUI con truncamiento seguro en tres plataformas. No marcar FULL por proyección JSON.
- **Gates:** CI, Phase 0 y Release Gate del SHA final; la política de referencias externas tiene una excepción limitada al documento no ejecutable `odd/tasks/flujo-de-agentes-objetivo.md`, no a módulos de runtime.

## T07 — Integración directa en panel Pi / TODOS–AGENTS–CHANGES–INTEGRATIONS (2026-11-15)

- El panel nativo existente sigue siendo la única vista principal: no se introducen frameworks ni un segundo panel multiagente. `getPanelSnapshot` ahora consulta un observador sin escritura que deriva datos de los almacenes ODD/TODOS, vínculo sesión Pi y Git worktrees.
- `src/runtime/ui/agent-flow-panel-source.ts` limita la lectura a los **3 últimos lotes**, mostrando el indicador `limited` y el total de lotes persistidos. El límite evita N×Git sin fin en la apertura del panel; no dice que no existan lotes anteriores. Un diario ausente indica `absent`; errores de lectura muestran `unavailable`, nunca cero tareas verificado.
- `src/runtime/ui/ide-panel.ts`: TODOS muestra la procedencia de tareas originales y las fases de sus worktrees, AGENTS muestra trabajadores hijos activos observados y revisión pendiente, CHANGES indica evidencia de cambios no validados y remite a revisión manual, INTEGRATIONS muestra la conexión entre sesiones **sin inferir salud del proveedor/modelo real**.
- `src/runtime/ui/native-work-panel.ts`: el resumen aparece en el overlay Pi auténtico incluso si el padre carece de Agent/Todo propios. No se modifica la navegación por teclado, los controles de escritura ni las llamadas a modelos.
- Tests: `tests/ide-panel.test.ts` (datos acotados y sanitización), `tests/native-work-panel.test.ts` (overlay sin agentes padre), `tests/parallel-worktree-todos.test.ts` (enlace real con los diarios y detección de cambios fuera de scope).
- **Limitaciones:** requested/resolved/actual-model sigue `unknown` salvo prueba auténtica, no se muestra consumo/coste ni se importan autorizaciones. La barra inferior y validación con una TUI Pi real siguen pendientes. Una pantalla verde no declara DONE, PASS o FULL.
- Gates de aceptación: typecheck, Phase 0, Pi runtime, CI multiplataforma y Release Gate en el **último SHA**; las suites omitidas quedan no ejecutadas.


## T06 — Coordinador de resultados terminales y atribución exacta (2026-11-15)

### Implementación

- `src/runtime/agents/parallel-worker-attribution.ts` vincula cada Worker observado con su **Todo hijo real**, candidato con SHA de origen, raíces Git, `writeSurfaces` autorizadas por la reserva y el vínculo `TaskAgentLinkStore` (agent ID = petición ODD emitida). Tener un agente con rol Worker en la misma sesión **no basta** para atribuir su resultado.
- `src/runtime/agents/parallel-batch-coordinator.ts` comprueba el lote completo de la **sesión principal**: reserva preparada, Todo de origen aún planificado con revisión e ID originales, vínculo Pi hijo, `plan-todo` reclamado, Todos del hijo, agents y asignaciones persistidas. Diferencia tareas activas/no observadas de terminales sin inferir éxito.
- `/asen-worktrees collect` exige TUI Pi de origen, readers reales, 2–4 resultados terminales atribuidos y **confirmación específica**; vuelve a comprobar que el snapshot no cambió antes de escribir. Solo recopila la última reserva visible del origen y no lanza ni reintenta Workers. La recogida se realiza ahora en una sola transacción atómica por lote; una falla no deja un subconjunto de Workers registrado como lote completo.
- `src/runtime/agents/parallel-worker-observation-journal.ts` persiste un único recibo por Worker y lote con bloqueo, escritura atómica, IDs y estados permitidos (`completed`, `failed`, `cancelled`, `interrupted`), estado Git y nombres acotados de archivos. **Nunca guarda conversación, credenciales, salida de agente, autorización ni payload de cambios.** Rechaza duplicados/replay y cruzar sesiones.
- `/asen-worktrees status` presenta los recibos como evidencia histórica; un `completed` procedente del almacén de agentes no constituye pruebas de software, consumo autenticado de un proveedor ni aprobación RDD/merge. Todo recibo conserva `modelActual:unknown`, `modelConsumedProven:false`, `acceptance:not-accepted`, `autoMerge:false`.

### Pruebas TDD y controles negativos

- `tests/parallel-worker-attribution.test.ts`: no confundir agente ajeno con la petición ODD, rechazo de ámbitos/HEAD/raíz falsos, duplicación de planes y vínculos, y estado interrumpido sin aceptación.
- `tests/parallel-worker-observation.test.ts`: diario privado y acotado, entradas terminales sin modelos inventados, consentimiento insuficiente, duplicados y prohibición de cambiar el recibo.
- `tests/parallel-worktree-todos.test.ts`: lote con dos hijos, task→agent→Git asociados, recogida consentida y consultas desde origen; falta de vínculo y rechazo humano impiden escribir recibos. Usa un runner de pruebas instrumentado, **no proveedores reales**.

### Lo que permanece pendiente

- No existe supervisor que inicie y organice varias **sesiones Pi nuevas** automáticamente bajo autorización separada de cada Worker. El código añadido coordina resultados **de sesiones previamente abiertas y autorizadas**, no genera permisos ni ejecuta modelos.
- Los recibos no sustituyen pruebas reales de cada candidato, 4R, Judgment Day, tests de Windows/macOS/Linux ni integración revisada. No ejecutar merge ni reintentos de lotes con estado parcial, corrupto o desconocido.
- Verificar Phase 0, Pi runtime, CI y Release Gate sobre el SHA final de la tanda. Nunca convertir `skipped` o `pending` en PASS.

## T06/T07 — Corregir atribución de agentes y recogida atómica (2026-11-15)

### Incidencia CI real y causa raíz comprobada

- En el SHA `e9d44f60` el **CI multiplataforma falló** en `tests/parallel-worktree-todos.test.ts:319` (Windows, macOS y Ubuntu): esperaba una tarea `child-plan-required` tras `attach` y se observaba `0`. Release Gate, Phase 0 y Pi runtime de ese SHA habían pasado, pero **CI rojo invalida el cierre**.
- **Causa:** `/asen-worktrees status` y `readAgentFlowPanelObservation` trataban un agente cualquiera con rol `worker` de la sesión Pi hija como actividad del Todo de origen, sin comprobar todavía el `claim` ODD y la asociación `TaskAgentLinkStore`. El error no debía corregirse cambiando el esperado del test.
- **Reparación:** ambas vistas pasan por `attributeParallelChildWorker` y solo reflejan actividad si existen el Todo hijo con candidato/ámbito originales, el vínculo ODD → agente y la fase de planificación reclamada. Si no hay vínculo, el agente ajeno **no** se atribuye. Una incongruencia explícita falla cerrada, en lugar de inventar `running`.
- Se añadió prueba positiva con dos Workers correctamente atribuidos, prueba negativa de Worker ajeno antes y después de `attach`, y estado `running` auténtico sin inferir `modelActual` ni aceptación.

### Atomicidad de resultados del lote

- `ParallelWorkerObservationJournal.recordBatch` recibe **2–4 resultados** y aplica una sola escritura atómica dentro del bloqueo exclusivo. Si el segundo resultado no es válido o si existe un recibo previo en conflicto, **no se escribe ningún recibo nuevo**. Las peticiones concurrentes del mismo lote no pueden guardar resultados duplicados.
- `/asen-worktrees collect` ahora llama a esa operación única, después de comprobar nuevamente los estados y el consentimiento. Se conserva `record` para compatibilidad y para pruebas de recibos individuales, sin nuevos derechos de integración, reintento ni escritura.
- Tests `parallel-worker-observation.test.ts`: lote completo, error en segundo Worker, lote con dueño distinto, colisión con recibo anterior y dos intentos concurrentes. Todos los estados se mantienen en `not-accepted`, `modelActual:unknown`, `autoMerge:false`.

### Pendientes que NO se elevan a FULL

- **T06**: todavía falta un supervisor **host-native** que pueda iniciar Workers Pi reales en worktrees separados con nuevo consentimiento por Worker, autorización precisa por Git root, un modelo realmente autenticado, cancelación y límites de coste. No usar una identidad de sesión hija inventada ni transportar grants del padre.
- **T07**: falta el recibo de modelo realmente consumido y la experiencia TUI/estado final probada contra el Pi real, no solo los tests de presentación.
- El gate verde de un SHA anterior no valida estos cambios. Requieren CI completo y Release Gate del HEAD exacto, además de la revisión independiente. `globalFull:false`.

## T06 — Supervisor del padre sobre Workers Pi reales previamente adjuntados (2026-11-15)

- **Nueva ruta de producto:** `/asen-worktrees supervise`. No crea sesiones Pi ficticias ni ejecuta trabajos en las identidades del padre. Requiere dos a cuatro worktrees previamente preparados, cada uno adjuntado desde una sesión Pi genuina con `attach`, con `plan-todo` reclamado y una tarea Worker ODD propia y preparada.
- **Preflight fail-closed:** `src/runtime/agents/parallel-parent-supervisor.ts` verifica estado original de Todo y revisión, asociación persistente de sesión, reclamación ODD, Git root/revisión limpios, scopes de escritura idénticos al registro, dependencias resueltas y ausencia de Workers lanzados en ese hijo. Exige que el **siguiente** Todo que escogería el Dispatcher sea exactamente ese Worker, no una tarea de lectura o primaria.
- **Autorización:** diálogo de lote informativo **más confirmación específica por Worker**, con sesión hija, candidato HEAD, alcance, instrucción exacta y aviso de coste/modelo solicitado sin suponer el uso real. Una denegación impide lanzar el Worker siguiente; los ya iniciados permanecen registrados para revisión.
- **Ejecución:** el adaptador en `extensions/asen.ts` llama `dispatchNextPlanTask`, que valida `writerAuthorizationBasis`, emite un grant nuevo por worktree mediante el circuito existente y lanza Pi a través del `AgentRuntime` y `TrustedTaskAgentBinder`. El supervisor no importa ni copia admisiones del padre y no llama directamente al runner. Puede iniciar Workers sucesivamente para que los procesos Pi se ejecuten **concurrentemente** bajo los límites configurados en el AgentRuntime.
- **Cierre parcial:** `src/runtime/agents/parallel-worker-observation-journal.ts` registra el lote terminal atómicamente; no ejecuta merge ni reconoce aprobación autónoma. Fallo, cancelación o estado incierto bloquean el resto del lanzamiento y conservan la evidencia existente; jamás hay reintento silencioso.
- **TDD:** `tests/parallel-worktree-todos.test.ts` amplía pruebas instrumentadas de lote con 2 hijos, confirmación individual, rechazo del segundo Worker, bloqueo al relanzar un intento, sesión adjunta pero no reclamada y Git sucio. Son pruebas con Dispatcher inyectado/instrumentado, **no ejecución real de modelos autenticados**.
- **Sin evidencia de FULL:** falta un test E2E con Pi real y proveedor configurado para demostrar simultaneidad auténtica, cancelación/recuperación, coste real y compatibilidad Windows (`0xC0000409`). La ruta utiliza sesiones Pi **previamente adjuntadas**, no automatiza la creación de sesiones Pi TUI. Integración y limpieza siguen siendo manuales.

## T06 — Corrección de identidad nativa y separación planificar/lanzar (2026-11-15)

- **Identidad comprobada en `AgentRuntime.startControlledWorker`:** el ID efectivo es `<taskIdentity>:worker`; el ID del Todo ODD es `asen-plan:<taskIdentity>:worker`. `parallel-worker-attribution.ts` debe comparar el ID del AgentRuntime con `requestId.slice("asen-plan:".length)`, no con el prefijo persistido. Se actualizaron los tests de atribución y de dos sesiones Pi hijas.
- **Planificación sin lanzamiento prematuro:** `plan-todo` conserva la confirmación del handoff, pero su adaptador `preparePlan(..., deferChildLaunch=true)` guarda el plan ODD del worktree **sin llamar a `advancePlan`**. Así el parent `/asen-worktrees supervise` puede autorizar y despachar los Workers independientemente, sin encontrar uno iniciado durante la fase de planificación.
- **Sin atajos de permisos:** el resto de llamadas de `asen-plan` siguen usando el comportamiento habitual. El nuevo modo se aplica **solo** al handoff de planificación hija. `dispatchNextPlanTask` reconstruye y revisa el permiso Writer del candidato del hijo; el supervisor no los copia desde la sesión padre.
- **Deriva de modelo rechazada:** el supervisor compara el modelo ODD solicitado antes del consentimiento de lote y también tras la confirmación individual. Una sustitución durante las autorizaciones detiene el lanzamiento, especialmente si cambia a un proveedor de pago. Los diálogos advierten que el coste/consumo real no está verificado.
- **Pruebas negativas:** el segundo Worker puede ser denegado sin reintentar el primero; un cambio de modelo antes/durante los diálogos no relanza ni retargetea; los perfiles y sesiones son independientes. Las pruebas instrumentadas no constituyen evidencia de modelo autenticado.
- **PENDIENTES:** CI, Release Gate del SHA más reciente; ejecución Pi live (proveedor autenticado), control de cancelación/recuperación intersesión, modelo realmente consumido y prueba de simultaneidad, estabilidad Windows y revisión independiente. No declarar FULL ni fusionar PR #61.


## T06 — Concurrencia en el runtime y registro único del supervisor (2026-11-15)

### Avances implementados

- **Prueba real de infraestructura Pi sin consumo de proveedor:** `tests/parallel-worktrees.test.ts` emplea la clase de producción `AgentRuntime` y su `Dispatcher`, crea dos Git worktrees con ámbito separado, genera dos permisos ODD de Worker y utiliza un ejecutor instrumentado. Comprueba **solapamiento efectivo de dos ejecuciones** y persistencia independiente de resultados terminales. No representa una llamada autenticada a Ollama/Groq/NVIDIA ni una prueba del modelo consumido.
- **Corrección de regresión multiplataforma:** el CI del SHA `53919396` falló en Windows, macOS y Ubuntu por `tests/parallel-worktree-todos.test.ts:218`. La prueba todavía esperaba ver como Worker auténtico a un agente de la sesión hija **sin** vínculo ODD/TaskAgentLink. La expectativa se corrigió para exigir `agents:[]` y conservar la barrera de atribución; no se suprimió el test.
- **Fallo ambiguo después de autorizar:** `launchParentApprovedWorkers` devuelve `partial-needs-review` al encontrar una excepción del despacho Pi. Conserva los IDs de los Workers cuyo lanzamiento se confirmó, no supone que el Worker fallido no arrancara y nunca reintenta.
- **Registro privado de un único intento del supervisor:** `src/runtime/agents/parallel-parent-supervisor-claims.ts` guarda `claimed-not-verified` para el lote de 2–4 Workers **antes** del primer despacho, dentro de una operación atómica y con bloqueo. Impide que dos supervisores usen simultáneamente el mismo lote o que un reinicio repita una autorización anterior. La denegación global **no** consume ese intento.
- `/asen-worktrees status` y `review` exponen `supervisorClaimed` y `supervisorAttempts` sin promocionar el intento a `done`/PASS. Todos los registros conservan `grantsAuthority:false`, `autoRetry:false` y `autoMerge:false`.
- Nuevas pruebas: `tests/parallel-parent-supervisor-claims.test.ts` (colisión de sesiones/worktrees, fuente ajena, archivo corrupto y doble intento simultáneo), `tests/parallel-worktree-todos.test.ts` (denegación, intento único y recuperación sin reenvío) y prueba de concurrencia `AgentRuntime` sin modelo.

### Requisitos aún no cerrados

- Falta validación de **dos procesos/modelos Pi autenticados con un proveedor real** y medición del coste y uso efectivo de cada uno. Los ejecutores instrumentados demuestran la concurrencia del runtime, no la calidad ni autenticidad de un modelo.
- Falta comprobar fin de sesión, cancelación y reanudación supervisada en equipos reales, además del error nativo de Windows `0xC0000409`.
- Antes de declarar estable este tramo se necesitan Phase 0, Pi runtime, CI y Release Gate verdes en el SHA final. Un test saltado o un workflow anterior verde no cumplen este gate.
- La PR #61 sigue en borrador, sin merge; T06 permanece **PARCIAL** y `globalFull:false`.

## T06 — Cancelación aislada entre sesiones Pi (2026-11-15)

- Nueva prueba `tests/parallel-worktrees.test.ts`: dos agentes de lectura con `AgentRuntime` real, un Git worktree por sesión y un ejecutor instrumentado. La cancelación del agente A no debe cancelar ni marcar como fallido al agente B. Verifica estados persistidos independientes, `cancelled`/ `completed` y que la raíz de origen no cambie.
- Se conserva por separado la prueba de **dos Workers ODD** con permisos de escritura y ejecuciones concurrentes instrumentadas. La prueba de cancelación se centra en aislamiento del runtime; **no afirma** haber cancelado una llamada real a un proveedor ni haber comprobado la cancelación de un Writer en Windows.
- Para cerrar T06 faltan: prueba con proveedor Pi autenticado, recibos de modelo usado, cancelación de un Writer real, control de coste, recuperación manual de intentos ambiguos y validación multiplataforma del SHA final.


## T02/T06 — Siguiente tanda conjunta: identidad y modelo real (2026-11-15)

- **Corrección funcional:** `reconcileParallelWorktreeBatch` ahora bloquea que dos tareas ODD aparezcan atribuidas a la misma sesión Pi hija o al mismo ID de Worker. También bloquea varios Workers observados en una misma unidad y estados inventados/desconocidos. No se transforma un `completed` falsificado en revisión válida.
- **Pruebas negativas:** `tests/parallel-worktree-reconciliation.test.ts` incorpora sesiones repetidas, agentes duplicados, varios Workers y estados desconocidos. Deben pasar en el CI del SHA exacto antes de considerar verificada la reparación.
- **Prueba viva ampliada:** el escenario `scripts/t06-nvidia-pi-concurrent.ts` pasa de Clarifier+Clarifier a **Explorer+Verifier**, en dos sesiones Pi distintas, ambas sin herramientas ni escritura, con NVIDIA y verificación de los mensajes, modelos y solapamiento. Se ejecuta mediante el trabajo `t06-nvidia-pi-native` de CI; el resultado de un SHA anterior no demuestra este cambio.
- **Alcance honesto:** prueba roles de lectura con proveedor auténtico si el trabajo final concluye PASS. **No son todavía dos Workers Writer autorizados**, ni demuestra cambios de código, grants individuales, conciliación de sus diffs o revisión independiente. Conservar T02/T06 en **PARCIAL**, `globalFull:false`, PR #61 en borrador y sin fusión.
- **Siguiente bloque:** ejecutar dos Workers con permisos separados en sesiones Pi adjuntadas y worktrees distintos mediante el supervisor TUI, recoger los cambios y comprobar costes/recibos auténticos; requiere confirmación de escritura individual por Worker y no debe sustituirse por aprobaciones sintéticas.


## T06 + T09 — Tanda agrupada, aislamiento real y medición prudente (2026-11-16)

### T06: dos sesiones Pi con árboles Git independientes
- `src/runtime/agents/t06-read-only-git-fixture.ts` construye **un repositorio sintético y desechable** con dos Git worktrees reales sobre un SHA congelado. No modifica Git del proyecto, no incluye datos privados y no otorga permisos Writer; inhabilita hooks en el escenario.
- `scripts/t06-nvidia-pi-concurrent.ts` ejecuta Explorer y Verifier bajo `AgentRuntime` + `PiProcessRunner` con NVIDIA, cada uno en su **worktree distinto** y `noTools:true`. Su recibo final exige simultaneidad, modelo/resultado autenticado, HEAD fijado, raíces distintas y tres árboles limpios (origen sintético y dos hijos). Un archivo editado, nuevo o un cambio de HEAD impiden resultado positivo.
- `tests/t06-read-only-git-fixture.test.ts` comprueba aislamiento, Git real, HEAD idéntico, cambios no autorizados en un hijo, independencia del segundo y limpieza temporal.
- El trabajo `t06-nvidia-pi-native` de GitHub Actions aprovecha el escenario ampliado y el resto de CI ejecuta las pruebas negativas. **Solo se declarará resultado vivo al confirmar los trabajos del SHA exacto.**
- **No significa Worker real:** Explorer/Verifier no tienen herramientas; no se ha demostrado a dos agentes escribiendo con autorizaciones humanas individuales. Mantener T06 parcial y `globalFull:false`.

### T09: comparativa A/B sin aceptar métricas inventadas
- `src/review/agent-flow-ab-comparison.ts` aporta un comparador puro ASEN ↔ Gentle Shell para pruebas emparejadas con misma entrada, herramientas, permisos, plataforma, modelo, esfuerzo y número de agentes. Diferencia duración, tokens y coste **solo si se conoce**; no inventa un coste por utilizar un proveedor gratuito.
- Bloquea contextos distintos, recibos ausentes, consumos desconocidos, fallos de requisitos y defectos críticos. Devuelve `ready-for-independent-review`, **nunca** PASS, FULL, merge o autorización.
- `tests/agent-flow-ab-comparison.test.ts` incluye casos positivos de cálculo y negativos de métricas falsas, derivación y contextos incompatibles.
- **Pendiente T09:** obtener observaciones reales bajo las mismas condiciones en Gentle Shell 4.8.0 y ASEN, verificar externamente los recibos y medir 1, 2 y 4 Workers con calidad, duración, tokens y costes. El comparador no fabrica esas observaciones.

### Gates y alcance
- PR #61 en borrador. No se han concedido autorizaciones humanas en esta tanda ni se han lanzado modelos pagos.
- La revisión independiente, Windows `0xC0000409`, el Fix Agent autorizado, interfaz completa y la aceptación T10 siguen pendientes. El resultado de CI debe verificarse para el HEAD que contiene este bloque, no reutilizar verificaciones del SHA anterior.

## T04 + T05 + T07 + T08 — Tanda integrada (2026-11-16)

- **T04:** el nuevo comando /asen-review todo <id> consulta el almacén real ODD de la sesión Pi. Rechaza otras sesiones, cambios de Todo, ausencia de succeeded, HEAD distinto al candidato y ámbitos inseguros. Produce una propuesta de revisión adaptativa, sin lanzar un modelo ni autorizar su coste.
- **T05:** ese comando proyecta la configuración de cuatro lentes y el modelo del Worker del plan, conservando actual:unknown. Judgment Day muestra el modelo propuesto para jd-fix-agent utilizando los perfiles existentes; no lo consume ni lo autoriza.
- **T07:** TODOS y REVIEW muestran Workers con resultado pendiente de revisión, el comando exacto y la necesidad de consentimiento separado. No marcan PASS por un resultado succeeded.
- **T08:** el informe emitido por ambos jueces y la evidencia auténtica del controlador se vinculan para producir una propuesta Fix. Se valida sesión, solicitud, árbol, revisión y rutas incluidas realmente en la revisión. Desacuerdo significa revisión humana; hallazgos válidos requieren nuevo /asen-plan y nuevo consentimiento Writer. No crea tareas, no ejecuta reparaciones, no fusiona.
- **Pruebas:** tests/odd-agent-review-flow.test.ts, tests/odd-agent-review-command.test.ts y tests/judgment-day.test.ts, con casos negativos de identidad, HEAD, ámbitos, modelos desconocidos, sesiones ajenas, falsificaciones y desacuerdo. No se declaran superadas hasta que el CI del SHA final las confirme.

### Límites y próximos pasos

1. El comando ODD aún requiere seleccionar el ámbito de revisión en el flujo workspace; falta transferirlo al ejecutor tras revalidación y consentimiento explícito.
2. La propuesta Fix no persiste un nuevo Todo: falta enlazar informe a plan ODD con garantías de un intento y autorización Writer auténtica.
3. Faltan recibos de modelo consumido, costes, interfaz Pi real y dos Workers programadores autenticados con permisos separados.
4. Permanecen abiertas la incidencia Windows, la comparación A/B y la revisión independiente.
5. Estado: T04/T05/T07/T08 parciales; globalFull:false. PR #61 borrador sin fusión, CI y Release Gate exact-SHA obligatorios.

### T04/T05/T07 — Revisión adaptativa directa del Todo (ampliación 2026-11-16)

- Se incorpora /asen-review todo <id> adaptive. Tras comprobar sesión, Todo y HEAD, pasa el conjunto exacto de archivos ODD a la revisión adaptativa nativa, con perfiles 4R ya existentes.
- La lista de archivos revisados queda fijada: no puede ampliarse mediante el editor, ni añadirse un archivo untracked ajeno al Todo. El sistema vuelve a leer el Todo y el HEAD antes de preparar el candidato, tras los diálogos y antes de cada envío al modelo.
- El diálogo de consentimiento habitual sigue siendo obligatorio antes de enviar el diff; la ruta de modelo especializada sigue verificando autenticación y rechaza esfuerzo de razonamiento que no pueda aplicarse de forma comprobable.
- Los paneles TODOS/REVIEW muestran el comando para entrar al recorrido real, indicando que se requiere aprobación. La consulta simple /asen-review todo <id> continúa siendo exclusivamente de lectura.
- Nuevas pruebas en tests/odd-agent-review-command.test.ts: rechazo de consentimiento no ejecuta ni una llamada de modelo y no abre editor de ámbito libre; intentar introducir un archivo ajeno queda bloqueado. Las pruebas siguen necesitando CI del SHA exacto.
- Aún pendiente: persistir la cadena informe de revisión → nueva tarea de reparación, pruebas reales de dos Workers Writer simultáneos, evidencia auténtica de modelo consumido por cada hijo y auditoría independiente. No declarar T04/T05/T07/T08 FULL.

## Auditoría 4R + continuación T06/T08/T10 (2026-11-16)

- Auditoría técnica interna de Risk/Readability/Reliability/Resilience: `docs/audit/4r-flujo-agentes-pr61-2026-11-16.md`. **No constituye revisión independiente ni FULL**.
- **Riesgo T06:** `t06-pi-receipt-validator.ts` ahora exige mensaje final exacto, selección Pi y metadatos de proveedor/modelo coincidentes. Los casos negativos evitan elevar una frase mencionada o un modelo distinto a prueba positiva. La prueba NVIDIA del nuevo SHA es obligatoria; la anterior no lo sustituye.
- **Confiabilidad T04:** ODD se revalida también después de las respuestas del último revisor y del segundo juez; un Todo que cambia mientras consume el modelo no obtiene dictamen vigente.
- **Resiliencia T06:** los dos directorios de prueba se limpian aunque falle la escritura del informe. El proceso Pi tiene plazo; un Worker ambiguo no se reintenta automáticamente.
- **Resiliencia T08:** si falla el perfil `jd-fix-agent`, los dos dictámenes permanecen visibles y la propuesta se bloquea. Si los jueces aprueban, ya no se busca un Fix innecesario.
- **Durabilidad T08:** nuevo diario privado `JudgmentFixProposalJournal` para propuestas emitidas por dictámenes genuinos. Solo guarda identidad, revisión, árbol, rutas verificadas y siguiente acción; no guarda texto del modelo ni concede ejecución. Escrituras atómicas y bloqueo entre procesos; consulta `/asen-review fixes` filtrada por proyecto/sesión. Un error de diario no inventa aprobación y mantiene visible el dictamen.
- **Pruebas:** `tests/t06-pi-receipt-validator.test.ts`, `tests/odd-agent-review-command.test.ts`, `tests/judgment-day.test.ts`, `tests/ordinary-review-assessment.test.ts`, `tests/judgment-fix-proposal-journal.test.ts`, más la corrección del texto de ayuda en los tres sistemas. Ninguna cuenta como aprobada sin CI del SHA exacto.
- **Bloqueos:** 2 Writers reales requieren dos aprobaciones nuevas; sin escritor autorizado no se ejecuta reparación. Falta medir A/B T09 en referencia externa, concluir el error nativo Windows T01 y obtener auditoría T10 independiente.
- **Estado honesto:** T02/T03/T04/T05/T06/T07/T08/T09/T10 no FULL. `globalFull:false`; PR #61 sin merge ni permiso de pago.

## Ampliación de auditoría 4R — registros de Workers T06 (2026-11-16)

- Auditoría interna de cuatro áreas: `docs/audit/4r-flujo-agentes-pr61-2026-11-16.md`. No sustituye a la revisión independiente T10.
- **Riesgo:** el registro duradero podía aceptar sesiones Pi repetidas para distintas raíces Git; se bloquea dentro del lote y en grabaciones posteriores. No concede permisos.
- **Legibilidad:** se reutiliza una única regla `portablePath` para rutas de entrada y registros recuperados.
- **Confiabilidad:** se rechazan estados Git contradictorios, listas de cambios duplicadas y rutas inseguras, tanto antes de grabar como al leer registros conservados.
- **Resiliencia:** las escrituras del lote siguen siendo atómicas; la segunda observación inválida no deja una primera anotación parcial; no se reintentan Writers de forma automática.
- Pruebas negativas ampliadas en `tests/parallel-worker-observation.test.ts`: estado `clean` con cambios, origen no verificado, HEAD incompatible, rutas ajenas, sesión repetida, falsificación del fichero y recuperación segura.
- **Estado:** implementado en la PR, pendiente del CI/Release Gate del SHA exacto. T06 parcial; T08 dispone de diario de propuestas (no un Fix Writer), T09 sin mediciones A/B auténticas, T10 sin revisión independiente. `globalFull:false`.

## Tanda agrupada T02 + T05 + T06 — rutas explícitas, dos sesiones Pi y uso observado (2026-11-16)

**Objetivo de esta tanda:** corregir puntos seguros de la cadena nativa sin fabricar consentimiento Writer, simular facturación ni confundir el ensayo Pi de lectura con dos programadores reales.

### T02 — NVIDIA autenticada y señales reales de consumo
- La prueba CI `t06-nvidia-pi-native` conserva dos sesiones Pi RPC reales Explorer + Verifier con NVIDIA, árboles Git de prueba separados y sin herramientas. El validador exige coincidencia del modelo seleccionado mediante Pi y del mensaje nativo final.
- `src/runtime/agents/t06-pi-receipt-validator.ts` ahora puede extraer números de tokens de `message_end.usage` **solo cuando existen y son válidos**. Nunca infiere precios: `piReportedUsage.costUsd` es una cifra comunicada por Pi, no cobro bancario; `billingVerified:false` incluso si vale cero. Si Pi no informa consumo, el valor sigue siendo `null`.
- `scripts/t06-nvidia-pi-concurrent.ts` conserva estas cifras individualmente, sin incluir claves, instrucciones privadas ni salida textual del modelo. Se mantienen `writerGranted:false` y `costVerified:false`. Tests adversarios en `tests/t06-pi-receipt-validator.test.ts`.

### T05 — perfil y modelo solicitado no equivalen a factura ni ejecución
- `src/runtime/agents/parallel-worker-model-route.ts` diferencia modelo concretamente configurado frente a `selectedActual:unknown`, `providerAuthenticated:false`, `modelConsumedProven:false` y `costVerified:false`.
- Ningún Worker supervisado puede aprovechar un modelo implícito, `unknown`, `auto`, `default`, ausente o malformado. Se requiere la ruta `proveedor/identificador` explícita desde el plan hijo ODD.
- Esa condición **no** demuestra que el modelo sea gratuito, ni sustituye la aprobación individual del Worker. Se mantienen las comprobaciones de identidad y cambios de modelo durante las confirmaciones.
- Tests: `tests/parallel-worker-model-route.test.ts`, `tests/parallel-worktree-todos.test.ts`.

### T06 — sesiones independientes y permisos separados
- El diario `parallel-parent-supervisor-claims.ts` rechaza dos Workers atribuidos a la misma sesión Pi, incluso si tienen worktrees distintos, y bloquea reutilizar la sesión hija en otro lote o recuperar un diario corrupto que intente duplicarla.
- El supervisor `parallel-parent-supervisor.ts` verifica la unicidad de cada sesión hija **antes** de reclamar el lote y antes de solicitar autorizaciones; si encuentra duplicados o modelos ausentes, no lanza nada.
- La confirmación global y el consentimiento individual por Worker permanecen obligatorios. No hay auto-reintento, pago, escritura sin aprobación, fusión ni aceptación automática.
- Pruebas negativas adicionales en `tests/parallel-parent-supervisor-claims.test.ts` y `tests/parallel-worktree-todos.test.ts`.

**No completado ni declarado FULL:** hacen falta dos Workers Pi Writer **auténticos** en dos sesiones con consentimientos humanos separados, mediciones reales de coste si el proveedor las facilita, observaciones de cancelación y recuperación, y revisión independiente. Las comprobaciones CI/Release Gate deben ser del SHA exacto que incluye esta tanda. `globalFull:false`.

## Estabilización agrupada del CI y comprobación 4R (2026-11-16)

- **Entrada:** CI `43825122036` del SHA `9d4766038b65` falló en Linux, macOS y Windows aunque el trabajo específico T02/T05/T06 y Release Gate estaban correctos.
- **Corrección 1:** `tests/judgment-fix-proposal-journal.test.ts` ahora cierra la vista protegida mediante su propia función **antes** de eliminar el árbol temporal. No se rebajan permisos ni se silencian fallos de cierre.
- **Corrección 2:** `tests/odd-agent-review-command.test.ts` conserva el carácter inicial de `git status --porcelain` para distinguir un cambio en el índice de uno solo en el árbol de trabajo.
- **Corrección 3:** `tests/ordinary-review-assessment.test.ts` prueba `blocked` cuando dos jueces genuinos encuentran errores y falta el perfil Fix; `not-needed` cuando ambos aprueban y no es necesaria reparación. La primera situación nunca lanza Writer.
- **Auditoría de cuatro enfoques:** `docs/audit/4r-flujo-agentes-pr61-2026-11-16.md`, apartado sobre las tres causas de error, riesgos, legibilidad, confiabilidad y resistencia a fallos.
- **Evidencia:** pendientes CI y Release Gate **sobre el HEAD final** tras publicar los cambios. El CI verde anterior del bloque T02/T05/T06 **no valida** el conjunto completo ni autoriza T06 Writer.
- **Estado:** las tareas funcionales siguen parciales, `globalFull:false`, PR #61 en borrador. Sin fusión ni autorización Writer implícita.

## Continuación T04 + T08: propuesta Fix guardada → borrador ODD seguro (2026-11-16)

**En esta tanda se ha conectado el diario privado existente con un paso de planificación explícito**, sin iniciar agentes ni crear tareas ejecutables:

1. `/asen-review fixes` permite consultar las propuestas de la sesión propietaria. `/asen-review fix-plan <id>` recupera una propuesta concreta y comprueba dos veces el diario para rechazar cambios concurrentes.
2. `src/review/judgment-fix-odd-draft.ts` valida la identidad del informe, sesión y proyecto Git, el origen mediante su huella y las rutas exactas de los hallazgos. Rechaza rutas sensibles, duplicadas, escapadas o externas al ámbito, candidatos incongruentes y cualquier campo que sugiera autorización anterior.
3. La salida es **`draft-only`** o **`manual-triage-required`**. Expone `nextCommand:/asen-plan`, `writeSurfaces` y los identificadores del informe, pero declara `instructionStatus:not-provided`, `candidateStatus:not-revalidated`, `modelActuallyUsed:unknown`, `authorized:false`, `writerAuthority:false`, `autoLaunch:false` y `globalFull:false`. **Nunca** fabrica una nueva instrucción de programación a partir de los textos de un modelo ni crea un Todo.
4. Pruebas negativas: `tests/judgment-fix-odd-draft.test.ts` (identidad falsa, sesión ajena, rutas inseguras, permisos, disputa) y `tests/judgment-fix-odd-command.test.ts` (comando real, ausencia de escritura, revisión doble, cambio de sesión y cambio de propuesta). Actualizadas las pruebas de ayuda del comando.

**Limitación importante:** el informe describe un árbol Git histórico, y el comando **no vuelve a validar el árbol actual** ni emite una orden de ejecución. Una nueva solicitud ODD debe aportar la instrucción concreta, volver a comprobar el candidato y obtener un permiso Writer específico en el mecanismo existente. Una discrepancia de los jueces exige decisión humana previa: en estado `manual-triage-required` el borrador devuelve `nextCommand:null` y no ofrece `/asen-plan` hasta resolver el desacuerdo. Por ello, T04 y T08 siguen **PARCIALES**.

**Aceptar esta tanda solo cuando:** el CI exact-SHA y Release Gate terminen correctamente en Windows, macOS y Linux; los tests omitidos no cuentan como PASS. La revisión independiente T10 y la demostración T06 de dos Workers con escritura real siguen pendientes. PR #61 sin fusionar; `globalFull:false`.

## T04 + T08 — Guardado real de un ODD Fix sin despacho ni permisos heredados (2026-11-16)

La ruta `/asen-review fix-plan <id> save` incorpora el siguiente paso funcional del flujo de agentes:

1. Recupera el informe privado en su sesión Pi original y vuelve a comprobar su identidad y estado. Un desacuerdo entre jueces no permite guardar un plan.
2. Comprueba que el árbol Git **vivo** coincide con el árbol observado por Judgment Day, incluyendo archivos modificados y archivos nuevos; rechaza archivos no revisados, cambios de contenido posteriores y cambios de HEAD **durante la comprobación**. Un commit histórico nuevo con **el mismo árbol completo** no invalida por sí solo la revisión: el nuevo ODD se ata al HEAD actual y solicita autorización Writer propia. La proyección usa el mecanismo de inspección Git ya existente; **no modifica el árbol de trabajo ni el índice**, aunque puede añadir objetos internos de Git.
3. Pide una **instrucción humana nueva** y los datos ODD completos. `validateFreshFixOddRequest` rechaza textos vacíos o inyectados, ampliaciones de archivos, cambio de identidad, ámbitos desconocidos, ausencia de pruebas, revisión insuficiente y tareas de alto riesgo sin resolución humana. Los modelos no generan instrucciones de Writer.
4. Tras confirmar expresamente que se va a **guardar un plan, no a ejecutar agentes**, se comprueba otra vez el origen y se utiliza el mismo `controlledInstructionPlanCommand` + `SessionTodoStore.addPlan` que en `/asen-plan`, con el lanzamiento aplazado. El nuevo plan queda en tareas reales `planned`; ningún Pi ni modelo se inicia en este paso.
5. Las tareas Worker guardan un `fixSource` exacto (ID de propuesta y árbol original), validado por el esquema privado de Todos. El despachador comprueba de nuevo ese árbol **antes de pedir consentimiento Writer, al terminar el diálogo y en la preparación inmediata del agente**. Ante cambios, detiene el lanzamiento. Los demás agentes ODD mantienen su flujo habitual.
6. `/asen-review fix-plan <id> verify` sigue disponible para inspeccionar el origen sin guardar nada.

**Pruebas nuevas:** `tests/judgment-fix-odd-preflight.test.ts`, `tests/judgment-fix-odd-planning.test.ts`, `tests/judgment-fix-odd-save.test.ts` y ampliación de `tests/todo-store.test.ts`. Incluyen casos negativos de código alterado, archivos ajenos, confirmación denegada, sesión cambiada, disputa entre jueces, rutas ampliadas, riesgo sin resolver y falsificación de metadatos.

**No declarar FULL:** la persistencia no demuestra que el Writer haya trabajado, cobrado correctamente, revisado ni reparado. Faltan la ejecución auténtica con aprobación individual, recuperación segura, comprobación de resultados, comparación A/B y auditoría independiente. El CI y Release Gate deben pasar en el SHA final en Windows/Linux/macOS. Pi Free Smoke omitido no cuenta como PASS. PR #61 en borrador; `globalFull:false`.

## T08 — Recuperación segura de un guardado ODD interrumpido (2026-11-16)

- Nuevo comando de **solo lectura**: `/asen-review fix-plan <id> status`. Busca el Worker del informe Fix exacto en el almacén de la **misma sesión Pi y proyecto**, sin utilizar modelos, guardar datos ni volver a despachar.
- Valida tres veces la estabilidad de sus fuentes: propuesta original; dos lecturas coherentes de los Todos relacionados; propuesta original todavía idéntica. Si hay cambios o interferencias, rechaza el resultado. El código no intenta solucionar silenciosamente un diario ambiguo.
- `src/review/judgment-fix-odd-recovery.ts` comprueba solicitud, identificador de propuesta, árbol revisado, rutas, sesión y estado de la tarea, y solo devuelve `not-observed`, `worker-observed` o `inconsistent`, todos con `autoRetry:false`, `writerAuthority:false` y `acceptance:not-accepted`.
- **Importante:** `not-observed` significa que no se encontró un Worker *activo*, no que se haya demostrado que nunca existió: podría haberse archivado o interrumpido el guardado. Hay que inspeccionar el historial antes de un nuevo intento. `worker-observed` no significa código reparado ni aprobado.
- Pruebas negativas en `tests/judgment-fix-odd-recovery.test.ts` y `tests/judgment-fix-odd-command.test.ts`: sesión y proyecto ajenos, rutas e identidad falsificadas, registros repetidos, cambios entre lecturas, ausencia de lector y cero reintentos.
- Estado: mejora de resiliencia **implementada en la PR**. Las pruebas del SHA definitivo deben aprobarse en Windows, macOS y Linux. No sustituye Writer Pi auténtico autorizado individualmente ni auditoría independiente T10; `globalFull:false`.

## T08 — Recuperación completa del diario activo y archivos ODD históricos (2026-11-16)

- `/asen-review fix-plan <id> status` consulta ahora el registro **activo y los archivos privados históricos** de la sesión Pi. Se comprueba cada origen dos veces, además de la identidad de la propuesta. El comando no concede permisos ni arranca modelos o Workers.
- `judgment-fix-odd-recovery.ts` distingue `worker-observed` (activo), `archived-worker-observed` (histórico), `not-observed` (no demuestra ausencia en archivos inaccesibles) e `inconsistent` (registros alterados, repetidos o contradictorios). Una tarea archivada con estado `done` o `cancelled` **no equivale** a reparación verificada ni autorización Writer. Todas las respuestas conservan `autoRetry:false`.
- El almacén `SessionTodoStore.archived` verifica ahora la huella SHA-256 indicada en el nombre de cada archivo y que todo su contenido sea terminal antes de entregar resultados. Si el contenido no coincide, falla cerrado; no devuelve evidencias falsificadas ni permite reintentos implícitos.
- Pruebas negativas ampliadas: archivo válido con tarea terminada o cancelada, archivo no terminal, sesión o árbol diferentes, duplicados entre activo e histórico, cambios entre lecturas y corrupción que conserva un JSON formalmente válido. Se añadió prueba de ciclo real con archivo privado, no solo datos simulados.
- **Alcance y pendientes:** recuperación segura implementada, pendiente del CI/Release Gate exactos del SHA actual. T04/T08 siguen sin prueba de reparación Writer Pi genuina con consentimiento individual y revisión independiente. T06, T09 y T10 siguen abiertos. No fusionar PR #61; `globalFull:false`.

## T06 — Cancelación de Pi entre lanzamientos del supervisor (2026-11-16)

- Se verificó que el lote reclama una intención irreversible **antes** de empezar los Workers, y que cada agente necesita consentimiento Pi individual. No se implementó ningún lanzamiento sin permiso.
- El supervisor `parallel-parent-supervisor.ts` devuelve ahora `partial-needs-review` si cambia o se cancela la sesión padre **entre dos Workers**, conservando los identificadores exactos de los ya registrados como iniciados. También bloquea un cambio de identidad antes de la confirmación del siguiente Worker.
- El diario de reclamaciones permanece consumido, con `autoRetry:false`, `autoMerge:false`, `grantsAuthority:false` y `acceptance:not-accepted`. Antes de reanudar se debe inspeccionar el estado verdadero de los Todos y agentes hijos. Los Workers que estén ejecutándose no se cancelan ni revierten automáticamente.
- Prueba de integración del supervisor contra worktrees Git preparados y sesiones Pi atribuidas: `tests/parallel-worktree-todos.test.ts`, cancelación controlada después del primer Worker, confirmación de que el segundo no arrancó y rechazo de relanzamiento del lote. **La prueba utiliza un despachador instrumentado, no dos modelos Writer reales.**
- Estado: mitigación de cancelación implementada, pendiente de CI/Release Gate sobre el SHA definitivo. T06 sigue PARCIAL: faltan dos Writers reales autenticados con autorizaciones humanas individuales, verificación de sus resultados/coste y auditoría independiente. `globalFull:false`.

## T06 — Prueba operativa de dos Writers y revisiones Pi, ejecución bajo consentimiento (2026-11-16)

- Se ha incorporado `scripts/t06-nvidia-dual-writer-native.ts`, **no automática**, para que un operador ejecute Pi 1.2 con NVIDIA sobre DOS worktrees Git temporales de un SHA idéntico. Cada Writer tiene sesión independiente, modelo fijo, alcance de un solo archivo, barrera de autorización **humana literal distinta** en terminal y herramienta `write` nativa observada. No acepta respuestas desde CI, datos simulados o permisos heredados.
- El controlador comprueba el modelo reportado por Pi, las llamadas nativas a escritura, los procesos y su solapamiento real, ámbito Git exacto, sintaxis y casos extremos de dos funciones JavaScript genuinamente generadas. Guarda solo resultados acotados, hashes y estados, nunca secretos ni salidas completas del modelo.
- Revisión opcional `scripts/t06-native-independent-review.ts`: **dos modelos NVIDIA distintos entre sí y del Writer**, también con consentimiento humano específico, devuelven dictámenes de solo lectura sobre los SHA exactos de ambos archivos. Si el proveedor no dispone de esos modelos, `NOT_RUN` o `BLOCKED`, nunca PASS. Sus dictámenes no conceden revisión formal de PR ni T10.
- `src/runtime/agents/t06-live-consent.ts` y `t06-native-review-receipt.ts` validan prohibición de permisos falsos, sesiones/nonce repetidos, respuestas malformadas, huellas y hallazgos contradictorios. Pruebas negativas `tests/t06-live-consent.test.ts` y `tests/t06-native-review-receipt.test.ts`, añadidas a CI rápido de T02/T05/T06.
- Instrucciones detalladas en `docs/t06-prueba-real-dos-writers-pi.md`; prueba **únicamente** mediante intervención en una terminal interactiva real, sin ejecución remota del asistente ni aceptación autoaprobada. El procedimiento no equivale a un consentimiento en Pi TUI, sino a dos consentimientos humanos del operador antes de arrancar hijos Pi RPC.
- **Evidencia actual:** implementación en candidato GitHub y pruebas offline/CI; la ejecución real Writer dual y la revisión con modelos distintos **NO SE HAN REALIZADO EN ESTE ENTORNO**. Este procedimiento no sustituye las vinculaciones reales del supervisor ODD/Todo/T06 ni prueba sus costes monetarios. T06 PARCIAL, `globalFull:false` hasta ejecución auténtica verificada y revisión T10.

## Tanda agrupada T06 + T09 + comprobaciones T04/T07/T08/T10 (2026-11-16)

- T06: el evaluador de comportamiento de los dos Writers de demostración usa proceso Node con `--permission`, lectura limitada al archivo creado, sin red, escritura ni lanzamiento de procesos, y pruebas negativas de acceso ajeno y rutas simbólicas. No sustituye aislamiento de sistema operativo.
- T09: `compareAgentFlowABSeries` agrupa 1, 2 y 4 Workers para ambos productos, exige seis observaciones con recibos únicos y contexto comparable, y calcula velocidad relativa únicamente si todas las mediciones son válidas. Coste sigue sin verificar.
- T04/T07/T08: se mantienen las barreras existentes de revisión, estado no aceptado y Fix con ODD/Writer nuevos; no se han ejecutado nuevos modelos Writer ni se ha demostrado E2E.
- T10: pendiente revisión externa independiente, ensayo auténtico de dos Writers y comparativa A/B real. Ver `docs/audit/flujo-agentes-tanda-agrupada-2026-11-16.md`.
- Se requiere CI exact-SHA y Release Gate tras este cambio. PR #61 sigue borrador, sin fusión y `globalFull:false`.

## Tanda T07 + T08 — vista de sesiones hijas y recuperación fail-closed (2026-11-16)

- T07: el panel diferencia de forma explícita una sesión local sin tareas/agentes y el trabajo observado de sesiones hijas. Muestra la siguiente acción segura por tarea, sin convertirla en control de ejecución.
- T08: la recuperación de un Fix rechaza proyecciones con permisos reaprovechados, autorización de fusión, ausencia de consentimiento nuevo o procedencia de Todo contradictoria. Añadidas pruebas negativas.
- Estos cambios no autentican Writers, no ejecutan reparaciones y no conceden FULL. Se exige CI exact-SHA y revisión independiente antes de cerrar. PR #61 sigue borrador; `globalFull:false`.

## T07 — Barra inferior consciente de Workers hijos (2026-11-16)

- `renderAsenWorkRow` ya no desaparece cuando la sesión local está vacía pero existe actividad observada de Workers Pi hijos. Distingue activos, pendientes de revisión y bloqueados.
- Continúa sin declarar `PASS`, modelo real o permisos a partir de estados del panel. Pruebas con fuente enlazada y ancho estrecho.
- T06: pruebas negativas conservan variables esenciales de Windows al ejecutar Node con permisos limitados, sin propagar claves ni `NODE_OPTIONS`.
- Pendiente CI/Release Gate del último SHA, ejecución auténtica de dos Writers y revisión externa. `globalFull:false`.

## T06 + T10 — cotejo posterior de evidencias de dos Writers (2026-11-16)

- Añadido `verifyT06NativeSnapshot` y comando `scripts/t06-verificar-informe.ts` para comprobar un informe **ya creado** contra dos worktrees reales de Git. Solo lectura, sin ejecutar funciones, sin llamadas al proveedor, sin permisos ni fusión.
- Valida identidad exacta del escenario, SHA, archivos nuevos separados, estados Git, huellas SHA-256, sesiones diferentes, campos de seguridad sin aceptación y dos resultados declarados satisfactorios. Bloquea registros corruptos, cambios adicionales, modelos distintos y directorios reutilizados.
- Distingue rigurosamente **consistencia local** frente a **prueba independiente**. Aunque haya coincidencia, las autorizaciones humanas, la concurrencia, el consumo real, las pruebas dinámicas y la revisión independiente siguen **no verificados por este comprobador**.
- Pruebas negativas de manipulación y no ejecución de código generado; la demostración manual sigue pendiente. No declarar T06/T10 FULL. PR #61 en borrador, `globalFull:false`.

## Megatanda conjunta T02 + T04 + T05 + T06 + T07 + T08 (2026-11-16)

**Alcance implementado dentro de PR #61, sin Writer autónomo ni fusión:**

- **T02/T04/T05 → T07:** la lectura de tareas hijas se vincula a la identidad real de una sesión Pi, su Todo planificado, la relación Todo→agente y el estado persistido de AgentRuntime. Cuando ese vínculo se verifica y el modelo de la tarea está fijado, el panel muestra **modelo solicitado**. No confunde modelo solicitado con seleccionado o consumido: ambos permanecen desconocidos hasta tener un comprobante autenticado independiente.
- **T06 → T07:** el panel Pi existente lee los diarios privados de intentos irreversibles del supervisor y de recopilaciones de resultados. Comprueba que lote, tarea de origen, sesión hija, carpeta Git y revisión del Todo coinciden antes de presentar el dato; los recibos no conceden permiso de reintento, aprobación ni integración.
- **T07:** la pestaña AGENTS distingue agentes hijos en curso, tareas pendientes de revisión, modelo solicitado, intento registrado y recibo registrado. No añade un segundo almacén ni tareas ficticias.
- **T08:** la consulta de recuperación de un plan Fix archivado, activo, inexistente o contradictorio devuelve una **siguiente inspección** distinta; nunca despacha ni reautoriza un agente.
- **Pruebas negativas:** modelo sin Worker realmente atribuido, recibos o banderas malformados, intento de supervisor vinculado a otra sesión, separación de modelo solicitado y efectivo, historial Fix ambiguo y no reintento.

**Criterio de aceptación:** comprobar pruebas de GitHub Actions y Release Gate para el último commit de esta tanda, sin dar por realizadas las comprobaciones omitidas. T06 (dos Writers reales), T08 (reparación completa con autorización humana), T01 (causa Windows), T09 (comparativa real) y T10 (revisión independiente) siguen **pendientes**. Los scripts de pruebas locales no se han ejecutado en el ordenador del usuario. PR #61 permanece en borrador y `globalFull:false`.

## T06 — Preparación de dos Writers Pi auténticos en GitHub Actions (2026-11-16)

- La PR incorpora un **flujo reutilizable manual** `.github/workflows/t06-github-approved-writers.yml`, invocado desde el modo `t06` del flujo manual ya presente en la rama principal `memory-openrouter-e2e.yml`. No se dispara por PR, push, CI ni cron.
- **Dos entornos protegidos**: `asen-t06-writer-a` y `asen-t06-writer-b`, cada uno con Required reviewers configurados en GitHub Settings. Es necesaria una revisión individual por entorno, registrada en dos operaciones separadas del mismo run y SHA.
- Control *fail-closed* en `src/runtime/agents/t06-github-approvals.ts`: consulta oficial del historial real de aprobaciones, cuenta iniciadora, rama, commit, primer intento y consentimiento expreso de posible coste no verificado. Rechaza eventos unidos, saltados, rechazados, ficticios, automatizados, repetidos y de otro run. No acepta el simple hecho de atravesar un entorno como autorización.
- El script nativo `t06-nvidia-dual-writer-native.ts` conserva el requisito TTY para pruebas personales, y añade únicamente un modo GitHub con **dos consultas independientes al historial real** (antes y justo antes de los Writers). Cada modelo sigue escribiendo solo en su worktree; no cambia la autorización ODD del sistema productivo.
- Test: `tests/t06-github-approvals.test.ts` y `tests/t06-github-workflow-boundary.test.ts` en el CI rápido, además de las pruebas negativas y compresión de tipos existentes. Guía `docs/t06-prueba-en-github-dos-writers.md`.
- **Estado: IMPLEMENTADO_PENDIENTE_DE_CONFIGURAR_ENTORNOS_Y_EJECUTAR**. Las reglas de revisión de los entornos requieren configuración administrativa en GitHub y NO han sido activadas por el asistente. No se ha lanzado el trabajo con dos Writer, ni consumido NVIDIA por esta prueba, ni verificado coste. La prueba REAL sigue abierta; `globalFull:false`. La PR #61 permanece en borrador sin fusión.

## T06 — reparación del ensayo real de dos Writers (2026-11-16)

- Evidencia: ejecución real [43904432551](https://github.com/asenbanskaliev/ASEN/actions/runs/43904432551) (SHA `ad770bb1`). Dos entornos aprobados por separado; procesos Pi 1.2.0 NVIDIA con intervalos solapados. Ningún archivo creado, ambos `writeToolObserved:false`, A `nativeResultOk:true`, B `nativeResultOk:false`; resultado `BLOCKED_OR_PARTIAL_NEEDS_REVIEW`.
- Hallazgo de código: T06 no configuraba `attributionFile`, campo obligatorio para cualquier escritura aceptada por la extensión `extensions/authority.ts`. El hallazgo es una condición bloqueante real, pero no prueba por sí solo por qué los modelos no solicitaron la herramienta.
- Reparación en rama de PR #61: fichero de atribución privado por hijo fuera de cada worktree, verificación de registro autor/sesión/ruta, instrucciones de escritura nativa más precisas, diagnóstico cerrado por tipo de fallo. Sin saltarse la autoridad nativa, sin reintentos, sin permisos adicionales, sin fusionar.
- Pruebas negativas añadidas: `tests/t06-writer-evidence.test.ts` (ausencia de llamada, tool fallida, duplicación, identidades falsas, cambios fuera del ámbito y diario corrupto); `tests/t06-github-workflow-boundary.test.ts` comprueba la conexión efectiva, ejecutadas por CI T06.
- Estado: **CORREGIDO_EN_CÓDIGO_PENDIENTE_EVIDENCIA_REAL**. No marcar `T06 FULL` ni `globalFull:true`. Siguiente paso: esperar CI del nuevo SHA, solicitar **una nueva ejecución manual** con dos nuevas aprobaciones y coste aceptado; auditar el artefacto de salida. Si persiste `write-not-requested`, examinar compatibilidad real de herramientas del modelo antes de otro consumo.

## Continuación posterior al CI verde: T08 + T09 y diagnóstico de T06 (2026-11-16)

- **CI confirmado para SHA `18667900dc5e1ee16589556951582f999fca97e2`:** CI, Release Gate, Phase 0 Architecture y Pi 1.2 runtime evidence terminados con éxito; Pi Free Smoke omitido. Es la aceptación de las pruebas del código de reparación T06, **no** de dos Writers Pi que hayan escrito correctamente.
- **T08 — Recuperación correcta:** `inspectFixOddRecovery` comprueba el estado terminal únicamente de los archivos del Fix consultado. Un Todo archivado ajeno o activo no contamina la evaluación del Fix correcto. Los casos negativos siguen bloqueando registros duplicados, identidades cruzadas y reintentos. Test nuevo en `tests/judgment-fix-odd-recovery.test.ts`. La recuperación conserva `autoRetry:false` y no concede Writer.
- **T06 → T09:** el informe del ensayo auténtico registra ahora la duración observada de la ventana de dos procesos y su solapamiento, además de las duraciones por hijo. Solo incluye números cuando existen dos intervalos observados; nunca transforma tiempos en costes.
- **T09 — admisión prudente:** `assessT09NativeTrialReadiness` clasifica un informe T06 como bloqueado o `candidate-evidence-only`, siempre con `providerUsageVerified:false`, `billingVerified:false`, `referenceCompared:false`, `qualityIndependentlyVerified:false` y `globalFull:false`. Para admitirlo exige SHA exacto del checkout, dos agentes Pi/Writer genuinos según el informe, registros de autoría únicos, llamada `write`, rutas, pruebas y duraciones coherentes. Esta clasificación **no comprueba externamente** el informe ni sustituye recibos del proveedor.
- **GitHub Actions:** la siguiente prueba manual T06, **si recibe dos nuevas aprobaciones humanas**, guardará un segundo archivo `t09-readiness.json` junto al informe T06, incluso si la prueba sale bloqueada. Un fallo del Writer no se vuelve éxito por el análisis T09. Script local de CI, sin credenciales ni llamadas al modelo: `scripts/t09-auditar-ensayo-t06.ts`.
- **Pruebas negativas:** `tests/t09-native-trial-readiness.test.ts` y cobertura de integración en `tests/t06-github-workflow-boundary.test.ts`; ambas ejecutadas por el CI de agentes. La simulación del ensa​​yo anterior con `BLOCKED_OR_PARTIAL_NEEDS_REVIEW` queda bloqueada aunque los intervalos se hayan solapado.
- **Pendientes auténticos:** repetir T06 con aprobaciones y posibles costes consentidos; verificar el informe nuevo; obtener ensayos equivalentes de Gentle Shell 4.8.0 y ASEN para T09 (1, 2 y 4 agentes) con recibos externos; realizar T08 con consentimiento Writer real; revisar T10 de forma independiente. No hay resultados A/B ni revisión T10. PR #61 en borrador, sin fusión.

## T06 — dos Writers reales confirmados por GitHub (ejecución 43915611666)

- **Validación real lograda:** [run 43915611666](https://github.com/asenbanskaliev/ASEN/actions/runs/43915611666) sobre el SHA exacto `4ec48beec8a191cc276c7532fd579eeeb2004f10`. Los entornos `asen-t06-writer-a` y `asen-t06-writer-b` recibieron dos aprobaciones humanas separadas; ejecución completa `success`. Son dos acciones de la misma cuenta humana, **no dos revisores distintos**.
- **Dos Pi Writer efectivos:** modelo NVIDIA declarado/observado, worktrees separados, sesiones distintas, una llamada de escritura nativa correcta por hijo y un registro persistido de autoría por cada archivo. Sintaxis, comportamiento y ámbitos superados según el controlador del ensayo: A y B `passed:true`.
- **Tiempos observados:** 3557 ms ventana conjunta y 3278 ms de solapamiento. No demostrar superioridad sobre un sistema externo con esta única muestra.
- **T09:** segundo artefacto `t09-readiness.json`, estado `candidate-evidence-only`. Sin verificación de coste ni recibo de uso externo y sin comparación A/B real.
- **T10:** `NOT_RUN_DISTINCT_REVIEW_MODELS_UNCONFIGURED`; no se ha producido revisión independiente de la calidad o la autoría de los archivos fuera del propio proceso ejecutor.
- **Documento de auditoría:** `docs/audit/t06-run-43915611666-evidencia.md`. Evidencia original: [artefacto 14250770281](https://github.com/asenbanskaliev/ASEN/actions/runs/43915611666/artifacts/14250770281) (retención limitada).
- **Estado:** **T06_REAL_TWO_WRITERS_PROVEN_IN_SCOPED_EXPERIMENT; PENDIENTE_T10_Y_PARIDAD**. La PR #61 sigue sin fusionar. `accepted:false`, `globalFull:false`, sin reintentos automáticos.

## Fase 1 — cierre técnico en GitHub de T02/T03/T04/T05 y enlaces T06/T08 (2026-11-16)

**Alcance de esta tanda:** cierre de fallos verificables del código y de sus conexiones al runtime nativo. No equivale a una aceptación FULL sin las pruebas interactivas y externas que se indican abajo.

- **T02 — modelo autenticado y correcto antes del despacho:** el supervisor T06 consume `inspectPlannedWorkerModelRoute` y rechaza modelos implícitos y rutas con segmentos vacíos (incluyendo `nvidia/modelo//otro`), antes de registrar un intento o pedir permiso. El modelo solicitado no se convierte en modelo realmente consumido ni en coste verificado. La prueba GitHub de dos Writers reales (43915611666) aporta evidencia Pi auténtica para **ese escenario**.
- **T03 — revisión 4R tipada y sin herramientas:** `availableIndependentPiReviewers` descarta nombres con caracteres de control, rutas malformadas y duplicados del catálogo Pi antes de ofrecérselos al usuario; las lentes siguen ejecutándose por el revisor autenticado y sin poderes de escritura. El modelo del autor sigue excluido. Pruebas negativas en `tests/pi-model-reviewer.test.ts`, junto al grupo existente de revisión.
- **T04 — ODD y revisión conectados al mismo Todo:** `projectOddReviewHandoff` rechaza `todo.taskId` distinto de `todo.current.taskId`, así como modelos y esfuerzos inválidos en los perfiles propuestos. El comando sigue comprobando sesión, Git HEAD y árbol antes de consumir modelos. Test negativo en `tests/odd-agent-review-flow.test.ts`.
- **T05 — perfiles íntegros y sin contaminación:** `parseRuntimeProfiles` rechaza `__proto__` (no es un nombre de ruta válido) y conserva rutas especiales permitidas, como `constructor` o `toString`, como propiedades propias sin alterar el prototipo ni perderlas al serializar; se mantiene la prioridad sesión/proyecto/global. Tests de lectura, serialización y aislamiento en `tests/runtime-profiles.test.ts`.
- **T06 — supervisor de dos o más Writer:** el modelo válido es condición previa en la ruta real `/asen-worktrees supervise`, no un permiso. Casos negativos de modelos malformados integrados en `tests/parallel-worktree-todos.test.ts`. Los dos Writers Pi simultáneos ya demostrados en 43915611666 tenían ámbitos separados, pero la prueba independiente del supervisor interactivo completo sigue pendiente.
- **T08 — Fix desde dictamen a Todo persistido:** después de guardar `fix-plan <id> save`, se leen dos veces los registros activos y archivados, se verifica la asociación original `fixSource`, que el Worker esté `planned`, que el recibo contenga su identificador, que conserve su candidato Git exacto y que no exista autorización reutilizada. Un recibo JSON sin Todo válido no confirma el guardado: el estado queda para inspección, sin reintento automático. Tests en `tests/judgment-fix-odd-save.test.ts` y `tests/fix-odd-real-plan-persistence.test.ts`.
- **CI conjunto:** el trabajo `Agentes T02 T03 T04 T05 T06 T08 (pruebas negativas)` agrupa los contratos principales, además del typecheck y de los seis conjuntos de pruebas multiplataforma existentes; Release Gate y Pi 1.2 siguen independientes.
- **Bloqueos reales:** T01 necesita estudiar el fallo en Windows del usuario; T07 requiere verificación de la interfaz Pi interactiva; T08 requiere ensayo real de una reparación consentida con dos jueces independientes, T09 comparativa externa con la referencia en condiciones equivalentes y T10 una revisión independiente. No lanzar llamadas pagadas sin consentimiento y no fusionar la PR #61.
- **Estado declarado:** T02–T05, T06 y T08 con mejoras publicadas y verificaciones CI exact-SHA pendientes de cotejar; `globalFull:false`. La frase «cerrado en GitHub» se refiere a la implementación y pruebas de los controles de esta tanda, nunca a paridad o aceptación global.

## T08 — ensayo auténtico de dos jueces y reparación en GitHub (2026-11-16)

- **Implementación técnica nueva:** entrada `modo=t08` en `memory-openrouter-e2e.yml`, flujo protegido `.github/workflows/t08-github-approved-fix.yml`; controlador `scripts/t08-github-real-fix.ts` y restricciones `src/runtime/agents/t08-github-approvals.ts`, `src/runtime/agents/t08-controlled-fixture.ts`.
- **Componentes reales conectados:** `runJudgmentDay` (dos revisores Pi independientes sin herramientas) -> `proposeJudgmentFixHandoff` -> `JudgmentFixProposalJournal` -> `draftOddFromStoredFix` -> `validateFreshFixOddRequest` -> `controlledInstructionPlanCommand` -> `SessionTodoStore` y `inspectFixOddRecovery` -> `PiProcessRunner` + `Dispatcher` con admisión de único archivo -> nueva revisión Pi y prueba de comportamiento aislada.
- **Protecciones:** SHA exacto, dos entornos GitHub `asen-t08-revisores` y `asen-t08-reparacion` con revisores obligatorios, dos registros `approved` verificados mediante API de GitHub, un solo intento, coste desconocido expresamente aceptado, tres modelos NVIDIA distintos, secrets solo tras aprobación, permisos de GitHub exclusivamente lectura, ningún commit ni fusión. Sin reintentos automáticos.
- **Escenario:** defecto controlado de validación en `t08-fix.mjs` dentro de copia Git temporal. Los dos jueces deben detectar un defecto real en la misma ruta; sin coincidencia se detiene y no pide corrección. La nueva tarea ODD se guarda bajo su origen Fix y no puede escribir hasta la aprobación separada. La salida se ejecuta en proceso Node sin permisos de red/escritura y vuelve a revisarse.
- **Pruebas negativas:** `tests/t08-github-approvals.test.ts`, `tests/t08-controlled-fixture.test.ts`, `tests/t08-github-workflow-boundary.test.ts`. Incluidas en CI de agentes junto a T02–T06.
- **Limitación:** ejecutar el controlador aislado desde GitHub **no** sustituye validar las pantallas Pi, el comando interactivo productivo de guardar Fix y el despacho real del Worker desde TODOS. Se necesitan pruebas posteriores de esos caminos. La revisión independiente T10 aún falta.
- **Estado:** `IMPLEMENTED_PENDING_REAL_APPROVED_T08_RUN` (aplicable después de CI verde, no equivale a T08 FULL); `autoMerge:false`, `globalFull:false`.
- **Guía de la ejecución:** `docs/t08-prueba-real-github.md`.

## T08 — cierre del diagnóstico de respuestas vacías de NVIDIA (2026-11-16)

- Ejecución manual `43941733529`: preparada y aprobada para revisores; primer modelo Pi produjo `message_end` con `content:[]`; ASEN rechazó correctamente el dictamen. Sin segundo dictamen, propuesta ODD Fix, permiso Writer ni fusión.
- **Causa probable externa:** NVIDIA publicó un informe en sus foros con la misma anomalía de respuestas HTTP 200, razonamiento defectuoso y texto final vacío para `nvidia/nemotron-3-ultra-550b-a55b` el 11/11/2026: https://forums.developer.nvidia.com/t/nemotron-3-ultra-550b-a55b-corrupted-reasoning-and-empty-responses-on-nvidia-api-and-playground/388780. El reporte es de un usuario, no una confirmación oficial de causa raíz ni garantía de que toda la infraestructura falle.
- **Protección nueva:** la ruta Ultra problemática queda temporalmente bloqueada en la preparación previa a aprobaciones de GitHub y en la comprobación del controlador, para impedir repetir gastos conocidos. Se conserva la condición de fallo ante dictámenes vacíos; **no** se aumenta ningún límite ni se inventa un dictamen. Pruebas negativas nuevas en `tests/t08-github-approvals.test.ts` y `tests/t08-github-workflow-boundary.test.ts`.
- **Próxima prueba sugerida:** modelos `nvidia/nemotron-3.5-bolt-e4b` (revisor A), `nvidia/nemotron-3.5-super-vl-120b-a12b` (revisor B) y `nvidia/nemotron-3.5-lightning-30b-a3b` (Writer). Son rutas publicadas por NVIDIA, pero **no se han probado las tres juntas**; su disponibilidad y coste final dependen de la cuenta y del proveedor.
- **Estado:** `T08_PENDING_REAL_APPROVED_RUN`, `globalFull:false`, sin fusión. Guía actualizada en `docs/t08-prueba-real-github.md`.

## T08 — segunda respuesta vacía con modelo alternativo (2026-11-16)

- En el run manual https://github.com/asenbanskaliev/ASEN/actions/runs/43944108837 con SHA `6ac8c6180d4d779c24ac94d5ae17dab33ca92919`, revisor A `nvidia/nemotron-3.5-bolt-e4b`, aprobación protegida y preparación correctas, pero el mensaje final Pi volvió a devolver **cero bloques de contenido**. El segundo juez, el Fix y el Writer no se ejecutaron.
- Este hecho **descarta que el problema sea exclusivo del modelo Ultra** y deja pendiente localizar si la causa radica en proveedor, compatibilidad de modelo, Pi RPC o combinación. No se debe volver a recomendar cambios de modelo como solución demostrada.
- Se agregó `describeT08ReviewFailure`, alimentado por el observador de fragmentos de texto nativo de Pi y el mensaje final, con **solo metadatos no sensibles** (eventos, caracteres vistos, tamaño final, motivo, indicio de error, fin del agente y número de herramientas), sin retener texto parcial, secretos ni razonamiento. Las respuestas vacías se siguen rechazando y no conceden permiso.
- Pruebas sin modelo real: `tests/t08-pi-review-diagnostics.test.ts`; incluidas en compilación T08 y CI. El diagnóstico real necesita una futura llamada autorizada; **no se ha hecho otra llamada**.
- Estado: `T08_REAL_REVIEW_BLOCKED_EMPTY_CONTENT`, `globalFull:false`, PR borrador sin fusión ni aceptación.

## T08 — comprobación sin IA del cierre de sesión Pi (2026-11-16)

- **Hallazgo comprobado por lectura:** la ruta estándar de `PiProcessRunner` cierra `stdin` al primer `agent_end` cuando no hay modelos alternativos. El contrato de Pi diferencia `agent_end` (fin de intento) de `agent_settled` (fin definitivo, incluyendo recuperación automática). Esta diferencia es **un riesgo real**, pero no demuestra que causara los dictámenes vacíos de NVIDIA en los runs 43941733529 y 43944108837.
- **Intervención limitada:** `PiProcessRunner` incorpora la opción `requireFinalSettlement` (activada exclusivamente para los jueces T08). No cierra Pi en `agent_end`; espera un `agent_settled` auténtico tras el mensaje final y el último `agent_end`, del mismo proceso y de una petición correlacionada. Si no llega, falla por tiempo agotado o fin incompleto. No hay reintentos automáticos añadidos ni nuevas autorizaciones.
- **Cierre del dictamen:** `parseT08NativeReviewText` en modo estricto acepta el **último** dictamen solo cuando un intento anterior fue seguido de `agent_end(willRetry:true)` y el cierre final `agent_settled` está verificado. Rechaza contenido vacío definitivo, herramientas, dictámenes repetidos sin recuperación y cierres anticipados.
- **Evidencia de prueba sin proveedor:** `tests/t08-pi-settlement.test.ts` usa un proceso Pi simulado que primero devuelve un mensaje vacío, anuncia recuperación, devuelve texto en el siguiente intento y finaliza correctamente; también prueba la falta de `agent_settled`, la señal adelantada y la duplicación de mensajes. Se mantiene el contrato antiguo para las demás tareas, respaldado por `tests/pi-process-runner-no-fallback-settlement.test.ts`.
- **Resultado:** 164 pruebas específicas correctas, 0 errores en CI de agentes (SHA `301b04c96f9fa336f40d9ae3858e374a3773abee`). El CI completo sigue sujeto a sus comprobaciones independientes. **No se ha hecho ninguna llamada NVIDIA** para probar estos cambios.
- **Estado:** `T08_SETTLEMENT_SIMULADO_VERIFICADO_PENDIENTE_IA_REAL`; `globalFull:false`, `autoMerge:false`; revisión de producción y validación Pi/NVIDIA reales todavía pendientes. Documentación Pi: https://docs.pi.dev/latest/rpc .

## Tanda transversal — auditoría y reparación del ciclo Pi (16/11/2026)

Documento de auditoría: `docs/audit/t08-auditoria-cierre-pi-agentes-20261116.md`.

- [x] Revisar el ciclo de Pi para clarificador, explorador, revisor,
      verificador, Worker, resultados de ciclo de vida y agente principal.
- [x] Corregir `PiArtifactRunner` para transmitir `AbortSignal` al
      proceso Pi y denegar un artefacto si se canceló antes de entregarlo.
- [x] Evitar la retención de texto parcial fuera de turno en el modo
      `requireFinalSettlement:true` usado por T08.
- [x] Bloquear cierre estricto junto a cadena automática de modelos
      **antes** de abrir un proceso o consumir cuota.
- [x] Añadir pruebas simuladas de cancelación, resultados tardíos,
      sesiones simultáneas y cierre de los cuatro roles de lectura.
- [ ] Comprobar todas las verificaciones del **último SHA** de la rama
      (CI y Release Gate), no solo las pruebas dirigidas.
- [ ] Revisión independiente de seguridad, fiabilidad, resiliencia y
      efectos sobre el ciclo de vida, sin confundir CI con auditoría humana.
- [ ] Decidir e implementar, con contrato propio y controles negativos,
      la recuperación de múltiples `agent_end` en `PiArtifactRunner`.
      La implementación actual rechaza de forma segura dicha secuencia.
- [ ] Validar compatibilidad del cierre estricto con Pi real antes de
      extenderlo a otros agentes, especialmente a los de escritura.
- [ ] Confirmar T08 con IA real y dos jueces, aprobación separada
      y un Writer limitado; no reutilizar aprobaciones antiguas.

Estado: **TANDA_TRANSVERSAL_SIMULADA_PENDIENTE_CI_Y_REVISION**.
No se declara equivalencia `FULL` ni se modifica `globalFull:false`.
No se ha consumido NVIDIA ni fusionado ninguna rama.

## Continuidad autónoma desde la auditoría independiente del 16/11/2026

**Referencia inmutable de auditoría:** [auditoría independiente SHA eaed078](../../docs/audit/auditoria-independiente-flujo-agentes-pr61-20261116.md). **Continuación:** [registro y reglas de tandas](./flujo-de-agentes-continuidad.md). El SHA auditado \`eaed07883703461ee225d61540265b1e478217e2\` es una **referencia histórica**, no el HEAD para ejecutar. El ensayo real \`43971488772\` confirmó una única escritura de A y dos escrituras correctas de B, con FAIL del conjunto. \`globalFull:false\`.

### Prioridades, dependencias y criterios de salida

| Tanda | Estado de entrada | Módulos existentes y trabajo agrupado | Pruebas y puerta de salida |
|---|---|---|---|
| **A — P0 límite de operaciones T06** | PENDIENTE / bloqueante | \`extensions/authority.ts\`, \`src/agents/pi-process-runner.ts\`, \`scripts/t06-nvidia-dual-writer-native.ts\`, \`src/runtime/agents/t06-writer-evidence.ts\`. Distinguir capacidad de escribir **una ruta** de cupo de **una única operación**; añadir cupo atómico y optativo solo al ensayo. Reservar en \`tool_call\`, antes de modificar el disco; rechazar segundo \`write\` o \`edit\`, incluso si llega antes del primer resultado. No imponer el límite a todo Writer productivo. Mantener la validación posterior y las protecciones de integridad. | **P1, P2, P5**: primera escritura permitida, segunda rechazada antes de FS; simultaneidad de llamadas; caída y reinicio con estado incierto y cero relanzamientos. Tests negativos con fallo RED previo y GREEN posterior; typecheck/CI. |
| **B — P0/P1 Pi y cancelaciones T01/T02/T08** | Depende A para operaciones de Writer | \`src/agents/{pi-process-runner,pi-artifact-runner,dispatcher,agent-runtime}.ts\`, recuperación y eventos; contrastar \`agent_end\`/\`agent_settled\`, texto vacío, límites, errores 401/429/5xx, modelo realmente observado, kill de procesos hijos, cancelación A sin cancelar B. No transformar un Writer incierto en reintento automático. | **P4, P6, P7** offline con RPC controlado; Linux/Windows/macOS según CI disponible. SKIP no es PASS. Proveedor real solo tras permiso y presupuesto conocido. |
| **C — P1 integración productiva T06+T07** | Depende A y B | \`parallel-parent-supervisor\`, \`parallel-worker-attribution\`, \`agent-flow-panel-source\`, \`native-work-panel\`, \`extensions/asen.ts\`. Enlazar sesión hija, Todo, AgentRuntime y candidato real. Renovar información de TODOS/AGENTS/CHANGES/INTEGRATIONS mientras cambia, con eventos y sin sondeo agresivo; evitar fotografía obsoleta, \`modelActual\` inventado y falsas aceptaciones. | **P3 y P8**: tests de conexión y regresión offline primero; después único ensayo Pi+TUI auténtico solo con las aprobaciones y credenciales separadas que correspondan. El ensayo \`t06\` de GitHub aislado no prueba TUI productiva. |
| **C.1 — P1 paridad visual T11 antes del cierre UI T07** | Depende de las fuentes duraderas de C; no del ensayo NVIDIA con gastos | Comparar diseño Gentle Shell 4.8.0 y ASEN, crear distribución real 140+ columnas con lateral 50+3, modo estrecho con panel, barra de estado y opciones Light/Neutral/Power user. Reusar datos y comandos actuales sin crear otro runtime. | Matriz terminal 24/40/50/80/139/140/180 y alturas 12/24/50, Pi TUI real, ratón/teclado, desconocidos visibles, no truncados críticos, tres SO y recibos exact-SHA. **La maqueta y el widget actual no son paridad.** |
| **D — P1 revisión, Fix y aceptación T03/T04/T05/T08** | Depende de evidencias fiables de B/C | Revisores 4R, JD A/B, \`src/review/ordinary-review-command.ts\`, \`judgment-fix-odd-*\`, \`src/runtime/lifecycle/review-acceptance.ts\`, mensajes de \`extensions/asen.ts\`. Revisar \`incident\` y dependencias ODD; quitar promesa de avance automático donde exija confirmación; fijar regla de \`structural-fallback\` frente a recibos genuinos; no convertir dictámenes en Writer ni merge. | **P9**: juez rechazado o mismo modelo, veredictos contradictorios, Fix sin nuevo grant, negación humana, cambios de SHA y ausencia de pruebas firmadas. Verificar barrera real. |
| **E — P1 auditoría integral, 4R y CI T09/T10** | Depende A–D | Pruebas de permisos de herramientas extra, ruta vecina, symlink, Git HEAD cambiante, interrupción, registro de modelo/coste, no duplicación de avisos, regresión y mapa de conexiones reales. Distinguir pruebas simuladas, host nativo, proveedor auténtico y UI live. | **P10**: Phase 0, Pi runtime, CI multiplataforma, Release Gate del SHA de la tanda, revisión independiente cuando proceda. Sin informes contradictorios ni PASS ficticios. |
| **F — P2 comparación y cierre T09/T10** | Depende E | Comparativa con Gentle Shell 4.8.0 bajo las mismas entradas, modelo, herramientas y equipos; medir tiempo, calidad, coste y fallos. Reconciliar \`equivalencia-funcional-agentes-full.md\`. | No declarar \`FULL\` ni \`globalFull:true\` sin ensayos A/B verificables, gates SHA exacto y autorización final. No fusionar automáticamente. |

### Regla ODD de ejecución horaria

1. Al empezar cada ejecución: leer este plan, el informe guardado, el registro de continuidad, HEAD actual de la PR #61 y CI asociados. No utilizar como HEAD el SHA de la auditoría.
2. Seleccionar la **primera tanda con dependencias satisfechas**; si permite trabajo sin gasto/permiso nuevo, avanzar automáticamente en una tanda funcional de código + pruebas + documentación, sin repartir en commits triviales.
3. Antes de tocar código, comprobar el punto real de entrada, la función, ruta de producción y cobertura; TDD con RED demostrable, GREEN y tests negativos. Reutilizar el Dispatcher, Pi y almacenes; no reconstruir módulos existentes.
4. Guardar cambios **solo en** \`feat/flujo-de-agentes-20261115\` con verificación del HEAD anterior. Conservar la PR #61 en borrador y sin merge. Mensajes de commits y registros en español.
5. Comprobar CI y Release Gate del **SHA nuevo**. Si fallan, arreglar la misma tanda antes de avanzar; nunca marcar completado por tests no ejecutados o por CI pendiente.
6. Registrar SHA, resultados comprobados, riesgo, bloqueo, siguiente tanda y estado \`PENDIENTE / IMPLEMENTADO / PROBADO_OFFLINE / VALIDADO_EN_PI_REAL / BLOQUEADO\` en el [registro](./flujo-de-agentes-continuidad.md).
7. Si falta consentimiento humano, pago, secreto, acceso, revisión independiente o ejecución fuera de rama: dejar \`BLOQUEADO\`, explicar la acción precisa y **continuar automáticamente con tareas de solo lectura u offline independientes**. Nunca eludir una autorización con otro flujo.
8. Evitar trabajos paralelos sobre los mismos archivos, reintentos de intentos de escritura ambiguos, pérdida de estado, cambios de \`main\` o merges automáticos. La programación horaria no concede autoridad nueva.

**Primer trabajo autónomo prioritario:** Tanda A. La evidencia del fallo real obliga a un límite en tiempo de ejecución, no a aceptar dos \`write\` ni a repetir el ensayo NVIDIA como primer paso.

## Megatanda A + B — refuerzo de permiso tras reinicio y cancelación (2026-11-17)

A partir del SHA `7d7f7dcaae0d1047ef4a6a78c2eb92ad6407e751`, se conserva el control previo de una escritura T06 y se añade un fichero de reserva exclusivo y persistente en la carpeta privada del diario de atribución. La reserva se registra antes de la llamada nativa y no se libera por error o reinicio: estado `claimed-not-verified` hasta inspección, sin reintento automático. El supervisor ya tenía un registro persistente por lote y se mantiene; este control adicional cubre también la ruta de prueba Pi independiente. Los Writers generales no reciben esta opción.

Se añaden pruebas de reanudación con la misma identidad, competencia por la misma reserva y ausencia de `tool_result`. Para B se ejecutan dos procesos Pi RPC instrumentados en paralelo, se cancela uno y se exige la terminación correcta del otro. Estas pruebas no autorizan proveedores, escrituras reales ni equivalencia FULL. Estado pendiente de CI del SHA nuevo.

## Gasto y disparo de ensayos autenticados en CI (2026-11-17)

Los trabajos NVIDIA de lectura T06 del CI se limitan a la acción `labeled` de la PR #61 realizada por `asenbanskaliev` con `asen-t06-nvidia-una-vez`; una sincronización de cambios visuales T11 ya no los vuelve a ejecutar. La etiqueta no equivale a aprobaciones de Writer: esas permanecen separadas en los dos entornos GitHub protegidos. Una omisión NVIDIA por falta de evento no es PASS ni prueba de proveedor. CI general, Pi 1.2 y Release Gate siguen siendo obligatorios en el SHA final.

## Tanda D — aceptación de revisiones (17/11/2026)

No se permite finalizar `/asen-accept-review` sin recibo HMAC de pruebas vinculado a HEAD/árbol Git. La evidencia estructural queda provisional y el Todo sigue bloqueado. Un recibo `PASSED` con cero pruebas también se rechaza. Se incorporan pruebas negativas P9 y positivos con firma real. La revisión independiente, Judgment Day/Fix completo y T11-E continúan pendientes; `globalFull:false`.
