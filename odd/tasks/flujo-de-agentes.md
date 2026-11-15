# Flujo de agentes — ASEN

Estado: IMPLEMENTACION_PARCIAL_EN_PR_DRAFT — SIN DECLARACION_FULL (2026-11-15)
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

- [x] T00 Plan publicado en una rama separada, baseline y permisos fijados; auditoría de código y dependencias documentada abajo. **AUDITADO, no equivale a implementación funcional**.
- [ ] T01 Auditoría de lanzamiento P0: ruta exacta, fase de salida, protocolo, métricas seguras; pruebas RED primero y GREEN después, CI 3 OS. **PARCIAL:** script read-only Windows WER y tests de seguridad/parseo; falta ejecución en el Windows afectado y atribución causal.
- [ ] T02 Smoke de modelo autenticado Explorer/Verifier + cadena completa. **BLOQUEADO LIVE:** sin sesión y credenciales autorizadas para ese host; no lanzar un modelo en un job no autorizado.
- [ ] T03 Roles de revisión 4R: catálogo estricto, autoridad read-only, aislamiento candidato y resultados tipados. **IMPLEMENTADO EN CANDIDATO:** contratos read-only, Pi real tool-free por lente, bundle genuino y tests negativos; falta cierre CI/Release Gate exacto y revisión independiente.
- [ ] T04 Enrutamiento desde ODD/Todo. **PARCIAL:** `/asen-review workspace 4r` ofrece cuatro lentes explícitas y `/asen-review workspace adaptive` selecciona una a cuatro según riesgo, con consentimiento y modelos autenticados. En riesgo alto exige al menos risk+reliability e indica verificación independiente pendiente. Falta conectarlo al plan ODD/Todo y a identidad durable especializada.
- [ ] T05 Perfiles 4R + JD. **PARCIAL:** once destinos, creación/edición UI y resolución especialidad→rol base por capas; 4R y Judge A/B pueden usar modelos autenticados configurados. `jd-fix-agent` sigue siendo solo destino de configuración. El revisor in-process rechaza thinking configurado sin soporte demostrado. Costes y modelos reales no comprobados.
- [ ] T06 Paralelismo. **PARCIAL CON VÍNCULO DURABLE ODD/TODOS:** `src/runtime/agents/parallel-worktrees.ts` prepara 2–4 worktrees Git aislados y permite despachar solicitudes Worker **previamente autorizadas** con el Dispatcher existente. `/asen-worktrees prepare-todos` exige 2–4 tareas ODD Worker reales y planificadas, mismo HEAD/scope y dependencias completas; reserva sus identidades antes de mutar Git en `parallel-todo-worktrees.json`. `/asen-worktrees status` inspecciona el estado desde la sesión origen sin auto-reanudar. No crea grants, no migra permisos ni fusiona. Falta que el coordinador ODD lance automáticamente sesiones Pi de worktree, persistir los resultados por unidad y conciliar/merge tras revisión; requiere CI exacto y pruebas live.
- [ ] T07 UI Agents/Todos/Changes/Integrations con evidencia solicitada versus observada y distinción SKIP/BLOCKED/FAIL/PASS.
- [ ] T08 Judge A/B y Fix Agent. **PARCIAL:** dos jueces independientes con modelos autenticados distintos, perspectivas diferenciadas y comando manual `/asen-review workspace judgment-day`. Los dictámenes son solo análisis; no conceden RDD, Writer, merge ni auto-fix. Pendiente Fix Agent controlado, plan ODD/Todo, persistencia durable y pruebas reales.
- [ ] T09 Benchmark A/B contra referencia 4.8.0 con pruebas honestas de calidad/tiempo/coste y paridad discriminada.
- [ ] T10 Auditoría integral independiente, regresiones, matriz Windows/macOS/Linux, CI y Release Gate SHA exacto, reconciliación `odd/tasks/equivalencia-funcional-agentes-full.md` y apertura de PR listo para revisión, sin merge a `main`.

Orden: T00 -> T01 -> T02; T01 -> T03 -> T04 -> T05; T04+T05 -> T06 -> T07; T03+T05 -> T08 -> T09; T01..T09 -> T10.

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
