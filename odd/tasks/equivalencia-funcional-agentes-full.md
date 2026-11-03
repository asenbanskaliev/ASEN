# ASEN — ODD de equivalencia funcional integral de agentes hasta FULL

**Estado: IN_PROGRESS — FULL NO ALCANZADO.** Fecha: 2026-11-03. Rama: `feat/t12-integrated-acceptance-merge`, PR #45. Propietario autoriza el plan; NO autoriza merge a main, gasto en modelos ni saltarse permisos.

## Misión

Reproducir los comportamientos observables del entorno de referencia para **Explorer, Planner, Reviewer, Verifier y Writer**, incluida la elección de cuándo utilizarlos, la coordinación en segundo plano, los controles de riesgo, la recuperación, las decisiones humanas, las comprobaciones y el resultado de cierre. FULL no significa textos idénticos entre modelos estocásticos: significa rutas, acciones permitidas, rechazos, resultados de control y garantías funcionales equivalentes para los mismos escenarios.

**Relación con otros ODD:** este documento es el plan de ejecución especializado, no sustituye `odd/tasks/pi-capability-completion.md` (ODD canónico) ni `odd/tasks/ecosystem-strict-parity.md` (backlog de equivalencia global). Tampoco promociona los 16 ECO PARTIAL/0 FULL. Toda acción respeta `AGENTS.md` y los gates de la PR.

## Baseline congelada y procedencia

| Fuente | SHA verificado el 2026-11-03 | Significado |
| --- | --- | --- |
| A — orquestador/experiencia de referencia | `813ec110600c8451c5f2bb9c35c12d8cf9b1c11e` | Decisiones de agentes, notificaciones y ODD |
| B — motor metodológico/revisión | `fd99d8492adb6c23c29f3e9fbd59fc756b76b6ff` | Contrato de revisión y transiciones nativas |
| ASEN inicial | `aeea0505feb19eccccff24b596a4e9156c0db96c` | Código y pruebas auditados |
| Fuente global ECO histórica (no sustituir) | `08de420ca29be16b6f6bee725a30b599b061df16` | Comparación histórica registrada |

Los nombres/URLs de fuentes externas se conservan en la procedencia permitida del proyecto, no en este ODD: `scripts/audit-upstream-boundary.mjs` rechaza esos literales en archivos versionados ordinarios. Cambiar la baseline exige decisión explícita, análisis delta y nuevas pruebas, nunca heredar PASS de otro SHA.

### Hallazgos iniciales — lectura de código, no prueba funcional completa

| Componente | ASEN hoy | Brecha frente a A/B | Estado |
| --- | --- | --- | --- |
| Explorer | Agente de lectura, CodeGraph y skill | Criterios y presupuesto de delegación, fuentes web y formato de entrega | PARTIAL |
| Planner | ODD, rutas, TODO y dependencias | Decisión directa/delegada, preservación de intención y reanudación exacta | PARTIAL |
| Reviewer | Revisión ordinaria y dual con evidencias | Revisión nativa proporcional, perspectivas, corrección y cierre | PARTIAL |
| Verifier | Gates y pruebas por candidato | No debe lanzarse si la referencia no lo exige; pruebas independientes propias | PARTIAL |
| Writer | Consentimiento y edición delimitados | Handoff, test-first, paralelismo disjunto y ciclo completo | PARTIAL |
| Coordinación | Suscripción a eventos e historial | Notificación no garantiza despertar al padre, deduplicación y acuse | PARTIAL |

En el SHA inicial: Phase 0, Release Gate, F5, Pi Runtime, CodeGraph, autoauditoría R4 y aceptación T12 sin proveedor PASS. **CI general FAIL** en Ubuntu, macOS y Windows, por dos casos comunes de `tests/primary-tool-policy.test.ts`: confirmación Normal falsa-caducada y error del diálogo absorbido. Verificación con modelo real y Writer interactivo: no acreditadas. La tanda B0 corrige el origen y añade una prueba de autorización caducada; el PASS depende del CI del nuevo SHA.

## Specs

### S01 — Decisiones proporcionales del coordinador

- Las tareas pequeñas, entendidas y de bajo riesgo se resuelven directamente. No exigir cinco agentes siempre ni crear tareas solo por número de archivos o precio.
- Delegación motivada por exploración extensa, límites reales de contexto, paralelismo independiente o riesgo. Una petición no autorizada sigue siendo de lectura; un plan o un resultado no fabrica consentimiento.
- **AC01:** C01, C04, C05 reproducen la misma decisión de ruta y bloqueo que A.

### S02 — Explorer

- Lectura únicamente, salvo el índice local permitido. CodeGraph antes de búsquedas amplias; fallback solo tras indisponibilidad/fallo. Evidencia web recuperada y atribuida; no deducir contenidos de una URL.
- Presupuesto de exploración equivalente a A: disparo al superar 3 consultas o 40 KiB de texto observado; delegar solo una vez. Entregar resumen corto con rutas, líneas, pruebas y dudas; no editar, ejecutar comandos ni subdelegar.
- **AC02:** C02–C03 prueban misma activación, investigación y ausencia de escrituras.

### S03 — Planner y ODD persistente

- Documentar para trabajos sustanciales requisitos originales S#, criterios de aceptación, tareas estables, riesgos, decisiones, pruebas, avances y siguiente paso, conservando `## Specs` y `## Log`.
- Reconciliar TODO/ODD/memoria sin duplicar fuentes de autoridad; si el espejo de memoria falla, marcar pendiente sin declarar persistencia. Validar sesión, proyecto y revisión antes de continuar.
- **AC03:** C05 y C15 preservan intención y estado real tras interrupción.

### S04 — Writer

- El padre aporta motivo, tarea exacta, archivos permitidos, habilidades, requisitos y pruebas. Cada unidad contiene código, test y documentación asociados.
- Modificar solo el alcance autorizado, preservar cambios ajenos; no leer credenciales, usar subagentes, hacer stage/commit/push/release ni migraciones destructivas desde el hijo.
- RED/GREEN y pruebas de preservación cuando apliquen; ejecutar pruebas autorizadas en primer plano, con intentos de corrección finitos. Dudas de alcance: una elección humana concreta, no suposición.
- Dos Writers simultáneos solo con superficies disjuntas demostrables. Resultado estructurado completed/partial/blocked/interaction_required, nunca éxito ficticio.
- **AC04:** C06–C08, C17 y C19 prueban alcance, evidencia y consentimiento real.

### S05 — Verifier proporcional e independiente

- No abrir un Verifier por rutina ni por tamaño: pasivo = comprobación estructural del padre; medio = autopruebas del Writer; alto riesgo declarado = comprobador independiente adicional.
- Obtener pruebas propias del requisito original, extremos, mensajes/errores, datos sin cambios tras rechazo, comparación con baseline y copia de trabajo aislada. No editar ni inventar pruebas ejecutadas.
- Fallo de preparación: registrar un bloqueo real y los checks no ejecutados, sin reintentos indefinidos.
- **AC05:** C09–C10 comprueban selección correcta e independencia real.

### S06 — Reviewer y revisión nativa

- Evaluar riesgo de un cambio exacto, no del plan entero. Mantener separadas revisión normal, las cuatro perspectivas adversariales y la verificación funcional: no tratarlas como el mismo gate.
- Igualar las perspectivas y transiciones admitidas de B: riesgo, legibilidad, fiabilidad, resiliencia; candidato congelado, pruebas, aceptación/rechazo, corrección delimitada y reevaluación tras cambios.
- Un modelo no disponible, un output inválido, un candidato obsoleto o la autoauditoría no se convierten en revisión independiente PASS.
- **AC06:** C11–C12 y C17 verifican decisiones, correcciones y permisos en el mismo SHA.

### S07 — Segundo plano y despertar del padre

- Lanzar agentes con ID persistente y una sola ejecución para el mismo trabajo activo; devolver el ID e informar de notificación automática. El padre no debe usar sleep/sondeo periódico como mecanismo de espera.
- Padre ocupado: insertar resultado en el turno sin duplicar. Padre inactivo: conservar resultado y **provocar reactivación**; una simple notificación con `triggerTurn:false` no basta.
- Identificar tarea, proyecto, sesión, intención y alcance; no confundir similitud verbal con equivalencia. Separar encolado, entregado y consumido; invalidar mensajes viejos, repetidos o cruzados.
- **AC07:** C13–C15 verifican despertar real y ausencia de efectos duplicados.

### S08 — Recuperación, decisiones humanas y continuidad

- Persistir resultados/estados sin restaurar permisos. Tras reinicio distinguir exitoso, fallido, detenido e incierto; un write incierto no se relanza sin comprobar ausencia de efecto.
- Relacionar task ID con ODD, sesión, workspace y SHA. Subagentes pueden elevar una pregunta al humano; ninguna salida del modelo da autorización.
- **AC08:** C15 y C18 pasan con reinicios y decisiones interactivas auténticas.

### S09 — Modelos, cuotas y coste

- Respetar modelo y esfuerzo configurados para cada rol; no sustituir silenciosamente por proveedor/modelo pagado cuando el elegido no responda. Contabilizar llamadas, tiempo y coste sin confundir smoke con capacidad funcional.
- Las pruebas reales requieren proveedor autenticado gratuito disponible y consentimiento de consumo; un proveedor inaccesible deja BLOCKED, no PASS simulado.
- **AC09:** C16 y C20 prueban modelo real de cada rol sin coste inesperado.

### S10 — Permisos, seguridad y experiencia

- No transmitir modos elevados del padre a hijos ni eludir consentimiento independiente de Writer. Proteger secretos, rutas sensibles, operaciones destructivas y destinos externos.
- Inicios/finales muestran rol, ID, modelo, estado y resumen útil, sin ruido de sondeos; las preguntas humanas son concretas. La entrega al padre se prueba y registra, no se supone.
- **AC10:** C13, C14, C17–C19 son equivalentes a A sin escapes de permisos.

### S11 — FULL requiere paridad y evidencias, no cantidad de tests

- FULL solo si S01–S10 y C01–C20 están demostrados sobre una baseline de referencia fija y un SHA final de ASEN. Cambios nuevos invalidan evidencias afectadas.
- Exigir tests focalizados + suite completa PASS Ubuntu/Windows/macOS, build/typecheck, Arquitectura/Release Gate, Pi real, cada rol con modelo real cuando aplique, Writer solo con consentimiento humano, recuperación y despertar real. Una prueba con mocks prueba el contrato local, no el proveedor.
- `SELF_AUDIT_ONLY / NOT independent` es un gate técnico temporal de PR #45; no cuenta como independencia real en el objetivo FULL.
- **AC11:** matriz obligatoria cerrada con recibos exact-SHA, sin FAIL/SKIP obligatorio/BLOCKED ni incidencias materiales abiertas.

## Matriz de aceptación común (A/B y ASEN)

| Caso | Qué deben hacer igual | Evidencia exigida | Estado |
| --- | --- | --- | --- |
| C01 | Trabajo pequeño directo | Sin subagentes ni ODD innecesarios | PENDING |
| C02 | Explorer estructural | CodeGraph primero; fallback justificado | PENDING |
| C03 | Límite de exploración | Un único Explorer al superar presupuesto | PENDING |
| C04 | Petición de alto riesgo o ambigua | No escribe sin autorización | PENDING |
| C05 | Plan de varias etapas | ODD y requisitos conservados tras reanudar | PENDING |
| C06 | Dos unidades de Writer disjuntas | Paralelismo seguro y prueba de integración | PENDING |
| C07 | Dos Writers sobre mismo archivo | Evitar solapamiento y escritura doble | PENDING |
| C08 | Cambio real con pruebas | RED/GREEN/PRESERVE y retorno verificable | PENDING |
| C09 | Cambio de riesgo medio | No lanzar Verifier adicional | PENDING |
| C10 | Cambio de alto riesgo | Verifier independiente con pruebas propias | PENDING |
| C11 | Revisión normal | Misma clasificación y transición | PENDING |
| C12 | Revisión adversarial | Mismas perspectivas, bloqueos y correcciones | PENDING |
| C13 | Subagente termina con padre ocupado/inactivo | Entrega y reactivación real | PENDING |
| C14 | Resultado repetido o antiguo | No reinyectar ni sondear continuamente | PENDING |
| C15 | Reinicio con estado incierto | No duplicar trabajo ni perder evidencia | PENDING |
| C16 | Proveedor sin cuota o credenciales | Error honesto, sin modelo de pago oculto | PENDING |
| C17 | Escritura/acción fuera de alcance | Cero ejecución y protección de permisos | PENDING |
| C18 | Subagente pide decisión humana | Una pregunta vinculada y continuación legítima | PENDING |
| C19 | Writer real Pi autorizado | Un único efecto con consentimiento interactivo | PENDING |
| C20 | Flujo completo cinco roles selectivos | De petición a entrega/revisión sin agentes sobrantes | PENDING |

Para cada C: registro de referencia (SHA, pasos, herramientas, acción de control), registro ASEN (SHA, ambiente, modelo, logs), comparación, PASS/FAIL/BLOCKED y enlace a prueba. No calificar un caso por similitud de respuesta libre.

## Plan ejecutable: tareas y dependencias

### F0 — Puntos de partida y comparación

- [x] EF-000 Auditar código de A/B y ASEN, congelar SHA y registrar diferencias. **Solo evidencia de código**, no equivalencia FULL.
- [ ] EF-001 Resolver 2 fallos de confirmación de baseline en tres OS, con preservación de excepción y nueva prueba de caducidad; cerrar tras CI exact-SHA.
- [ ] EF-002 Obtener observaciones reales C01–C20 del comportamiento A/B con entorno aislado y registrar resultados canónicos.
- [ ] EF-003 Crear harness de comparación de decisiones observables sin depender del texto libre del modelo.
- **Gate:** baseline CI limpia, referencias trazables, comparación válida; no modificar el registro global ECO.

### F1 — Planner/decisión

- [ ] EF-101 Alinear rutas directa/plan/delegación sin usar solo tamaño o cantidad de archivos.
- [ ] EF-102 Conservar ODD, S#, tareas y mirror con conflictos visibles y próximos pasos honestos.
- [ ] EF-103 Continuar por dependencias con identidad, sesión y candidato revalidados.
- **Gate:** C01, C04, C05.

### F2 — Explorer

- [ ] EF-201 Igualar consulta CodeGraph-first, búsqueda local/web autorizada y fallback.
- [ ] EF-202 Implementar disparadores observables de presupuesto y no repetición.
- [ ] EF-203 Retorno compacto de pruebas y comprobaciones de no escritura.
- **Gate:** C02–C03.

### F3 — Writer

- [ ] EF-301 Handoff exacto: task, requisitos, habilidades, pruebas y archivos permitidos.
- [ ] EF-302 Pruebas RED/GREEN/PRESERVE, correcciones acotadas y retorno estructurado.
- [ ] EF-303 Paralelismo seguro disjunto y rechazo de ámbitos superpuestos.
- [ ] EF-304 Probar write real Pi con consentimiento genuino, revocación y resultado exacto.
- **Gate:** C06–C08, C17, C19.

### F4 — Verifier

- [ ] EF-401 Alinear criterio de riesgo: cuándo se lanza y cuándo no.
- [ ] EF-402 Pruebas independientes basadas en petición original, scratch y baseline.
- [ ] EF-403 Prueba real de defecto de alto riesgo, detección y revalidación tras fix.
- **Gate:** C09–C10.

### F5 — Reviewer

- [ ] EF-501 Alinear vía de evaluación del riesgo, identidad del cambio y revisión nativa.
- [ ] EF-502 Comparar perspectivas, resultado congelado, bloqueo, corrección y reevaluación.
- [ ] EF-503 Probar reviewer real independiente sin sustituir evidencias faltantes por simulaciones.
- **Gate:** C11–C12 y C17.

### F6 — Segundo plano y recuperación

- [ ] EF-601 Entrega del resultado según estado del padre, con reactivación real cuando esté inactivo.
- [ ] EF-602 Suprimir sondeo/sleep innecesario, duplicados y avisos caducados.
- [ ] EF-603 No relanzar tareas activas equivalentes: misma identidad y alcance verificable.
- [ ] EF-604 Recuperación tras reinicio, estado incierto y preguntas del hijo sin permiso inventado.
- **Gate:** C13–C15 y C18.

### F7 — Validación real y cierre

- [ ] EF-701 Comparar C01–C20 con snapshots A/B y ASEN final; no heredar recibos entre SHAs.
- [ ] EF-702 Probar selección de modelos reales gratuitos, error de cuota/red y consumo por agente.
- [ ] EF-703 Verificar tres OS, suite global, permisos, Pi interactivo, Writer, revisión, eventos y recuperación.
- [ ] EF-704 Auditoría final de diferencias. Solo cambiar estado a **FULL** cuando todos los gates anteriores y S01–S11 estén satisfechos.
- **Gate:** C01–C20 PASS obligatorios y ninguna diferencia esencial pendiente.

## Estrategia de tandas grandes y CI

| Entrega | Alcance | Regla de publicación |
| --- | --- | --- |
| B0 — Preparación | F0, ODD y corrección de fallos conocidos | Un commit agrupado y validación exact-SHA |
| A — Orquestación | F1 + F2 + F6 | Un CI después del conjunto de cambios, no por microtarea |
| B — Cinco roles | F3 + F4 + F5 | Pruebas locales por unidad y CI consolidado de la tanda |
| C — FULL | F7 + ajustes finales | Aceptación real y matriz exact-SHA final |

El CI global puede durar ~30 minutos; no relanzarlo tras cada pequeño avance. Reconciliar HEAD remoto antes de publicar con `expected_sha`; avanzar en trabajo independiente sin esperar un Release Gate lento, pero no decir PASS hasta que termine. No fusionar main sin permiso.

## Control de seguridad y estado

- Reutilizar código/contratos existentes en vez de crear otra arquitectura o copiar ciegamente fuentes externas. Conservar candados de Writer y revisión, datos de proyecto, memoria, permisos y recuperación.
- Modelos de pago, APIs externas, cambios en producción, merges, releases y acciones destructivas requieren autorización propia; el objetivo FULL no es un consentimiento global para ellos.
- Describir cada hallazgo como PASS/FAIL/BLOCKED/PENDING/OUT_OF_SCOPE_APPROVED, con evidencia observada, modelo/versión/fecha, comando y SHA. Las exclusiones de requisitos esenciales impiden FULL integral.
- La autoauditoría del PR está admitida solamente como `SELF_AUDIT_ONLY / NOT independent`; no declara revisión independiente funcional.
- Actualizar este ODD después de cada tanda; si cambia el código, volver a ejecutar los checks afectados. Un checkbox sin evidencia no cierra nada.

## Log

- **2026-11-03 — Inicio:** orden del usuario de preservar este plan y evolucionar hasta FULL. Auditoría fuente/código completada; se ha preparado la matriz, no la comparación de ejecución real.
- **2026-11-03 — Baseline CI:** en el SHA `aeea0505`, el run `41651668587` dio FAIL en los tres OS por dos pruebas de confirmación. El run `41651658407` de aceptación funcional sin proveedor dio PASS con el job real SKIPPED. Gate R4 es SELF_AUDIT_ONLY.
- **2026-11-03 — B0 preparada:** fallo de modo Normal sin getter, error del cuadro de confirmación tragado y revocación por epoch identificados; corrección y prueba añadidas junto con este ODD. Estado de la corrección **PENDING exact-SHA CI**, no PASS.
- **Siguiente bloque:** validar B0 y ejecutar EF-002/003; construir primero el despertar real y la selección de rutas antes de declarar a los agentes equivalentes.

## Tanda A1 — agrupación de cambios funcionales (2026-11-03)

Estado **IMPLEMENTED_PENDING_CI**, no FULL. Cambios previstos en el mismo commit exact-SHA que esta entrada:

- **EF-601 / C13 — reactivación por eventos.** El resultado de un agente terminal se entrega al Pi principal mediante `sendMessage` con `triggerTurn:true` y `deliverAs:"followUp"` **solo** si hay sesión interactiva TUI autenticada y coincidente. Cuando el padre está activo, `followUp` espera a que termine; cuando está inactivo, puede iniciar un nuevo turno de Pi. RPC/headless sigue sin activar inferencia automática. Un resultado de un Todo enlazado se notifica también tras reconciliar/avanzar el plan. Si el plan ya inició otra unidad, se informa sin reactivar el padre de forma redundante. La carga es dato no confiable, no autorización; el estado de entrega sigue `enqueued`, nunca `delivered` sin acuse.
- **EF-603 / C14 — coalescencia de Explorer activo.** Para Explorer ad-hoc de solo lectura y sin vínculo a Todo, el Runtime calcula una clave exacta de rol, instrucción, sesión, proyecto, modelo y esfuerzo. El almacén persistente, bajo bloqueo exclusivo, reutiliza el ID si existe un trabajo idéntico `queued/running`; no crea un segundo proceso. Trabajos de distinto proyecto, sesión, modelo o instrucción son diferentes. Nunca se reutilizan resultados terminales ni se reanudan tareas `interrupted`; Writer, revisores y agentes planificados conservan su identidad independiente. No se afirma deduplicación semántica general de peticiones expresadas de otro modo.
- **EF-401 / C09–C10 — verificación selectiva.** La ruta `verification` explícita sigue lanzando Verifier. El orquestador deja de añadir Verifier a toda ejecución de revisión de bajo/medio riesgo. Solo añade Verifier independiente al trabajo `incident` cuando `verification===independent`. La revisión explícita del candidato permanece; las pruebas RED/GREEN del Writer no sustituyen las pruebas independientes cuando sean necesarias.
- **EF-202 / C03 — guía de exploración proporcional.** El skill Explorer deja de imponer un umbral fijo por cantidad de archivos. Ahora establece un límite inicial de tres consultas enfocadas o 40 KiB observados antes de recomendar una delegación única cuando haga falta seguir investigando. Es orientación comprobable; todavía falta instrumentar mediciones reales en el coordinador y compararlas con A.
- **F7 — evidencias.** Nuevas pruebas de coalescencia dentro de un proceso y dos instancias de almacén bajo bloqueo, excepción de contexto de proyecto/modelo, cierre/reinicio, ausencia de reanudación implícita, mensajes de resultado, reactivación TUI, y Verifier condicionado al riesgo. Se incorporan a la aceptación sin proveedor y a la CI general. Los tests con runner simulado no cuentan como prueba de proveedor Pi real.

**Cierre parcial requerido:** ejecutar typecheck, test de orquestación, prueba del almacén, prueba de notificación y regresiones de la nueva entrega en el SHA de publicación. Corregir fallos en tanda consolidada; registrar los CI exactos. `EF-601` no será FULL mientras no se pruebe un turno Pi real iniciado desde estado inactivo. `EF-603` no será FULL mientras no cubra tareas semánticamente equivalentes planificadas y escenarios de varios procesos. `EF-401` no será FULL sin verificar el comportamiento de referencia sobre los mismos riesgos. Los veinte casos siguen PENDING/BLOCKED según sus pruebas, no se marcan PASS preventivamente.

**Siguiente tanda de trabajo:** extender la comparación ejecutable de rutas y Explorer sobre telemetría real, completar entrega/acuse de resultados que sobreviva a reinicios sin duplicar efectos, y avanzar Writer/Reviewer con aceptación real después de cerrar estas regresiones.

### Tanda A1 — ajuste de prueba de aceptación (2026-11-03)

- `1f59a6a` logró typecheck, build y pruebas focalizadas de F2/F3/F5, así como recuperación F6. La nueva prueba integrada EF-603 quedó `cancelledByParent`, no por una duplicación observada sino porque el fixture esperaba que el segundo runner se iniciara antes de liberar el primero y esperaba el resultado de una sesión ajena en la sesión activa.
- El test ahora libera el runner de la sesión original, observa exactamente su notificación, comprueba que comienza la unidad de la otra sesión cuando hay un slot disponible, y libera su trabajo sin exigir la entrega de mensajes de otra sesión. Se conserva la aserción de que dos intentos concurrentes idénticos reciben el mismo ID y solo uno ejecuta la tarea.
- La corrección no equivale a probar reinicio Pi real, entrega reconocida ni deduplicación semántica general. El estado del ODD sigue `IN_PROGRESS`, todos los criterios pendientes de paridad real continúan abiertos.

### Tanda A1 — reconciliación de contratos completos (2026-11-03)

- La aceptación T12 sin proveedor de SHA `bc7fc8a` pasó. En cambio `R4` automático (`41661863290`), `Release Gate` (`41661863232`) y la suite completa Windows (`41661863336`) expusieron pruebas de integración/paquetizado que todavía exigían Verifier para un caso de riesgo medio con revisión dual. No son errores de Ollama ni pruebas de que haya un Verifier real funcionando.
- Se reconciliaron los mismos casos de tres tareas (Writer + dos Reviewers) en `tests/extension-runtime-commands.test.ts`, `tests/extension-state-commands.test.ts`, `tests/instruction-triage.test.ts` y `scripts/verify-pi-package.mjs`, conservando sus dependencias y comprobaciones de no ejecución sin autorización. Las pruebas de verificación explícita y de incidente de riesgo alto continúan esperando Verifier independiente.
- Las correcciones de pruebas se hacen porque el contrato intencionado ahora es proporcional al riesgo; no se han eliminado permisos ni se ha declarado innecesaria una verificación de riesgo alto. La aceptación definitiva requiere reejecutar todos los gates de los tres sistemas sobre el SHA nuevo.
- Estado global **PARTIAL**: el objetivo FULL sigue condicionado a los escenarios C01-C20, pruebas reales de Pi y los cinco roles, despertar confirmado, Writer con consentimiento y comparación contra la referencia congelada.

## Tanda consolidada EF-101 + EF-401 + EF-601 + F0 (2026-11-03)

**Estado: PENDING exact-SHA CI; FULL NO ALCANZADO.** Baseline verificada antes de esta tanda: PR #45 HEAD `766fa4b602f4bc8933f87d2b496e69735aa7a4c5`. Los controles Arquitectura, Release Gate, F5, R4 automático, Pi Runtime, CodeGraph y aceptación T12 sin proveedor dieron PASS; **la suite CI general dio FAIL en los tres sistemas** (run `41663079512`) por cuatro regresiones comunes de expectativas antiguas, no por evidencia de que Verifier faltara en una situación de alto riesgo.

### Auditoría F0 del CI y decisiones quirúrgicas

- `tests/natural-plan-tool.test.ts`: dos pruebas esperaban un cuarto agente Verifier para una revisión `dual_explicit` de riesgo medio. La política vigente, y la verificación proporcional pretendida, solo requieren Worker y dos Reviewers; los tests deben reflejar esa decisión sin rebajar riesgo alto.
- `tests/orchestrator-dispatcher-integration.test.ts`: la prueba decía cubrir la presencia de Explorer, Reviewer y Verifier en un incidente, pero no incluía ninguna operación de riesgo alto. Se añade `security_boundary` **a ese fixture concreto**, que pasa a verificar realmente la presencia de Verifier independiente y que ningún agente de lectura recibe autoridad de escritura.
- `tests/functional-role-parity-matrix.test.ts`: nueva matriz semántica que ejerce ruta pequeña directa, planificación ante alcance incierto, dos jueces sin Verifier en riesgo medio, incidente alto con Explorer/Reviewer/Verifier, verificación explícita sin Writer y revisión doble de bajo riesgo. Son pruebas deterministas del comportamiento ASEN; **no** sustituyen la ejecución A/B.
- `src/runtime/agent-terminal-delivery.ts`: se acota a 1200 caracteres el resumen de un agente y se eliminan secuencias ANSI y controles para evitar desbordar la reactivación del coordinador con salida no confiable. El resultado completo continúa en el almacén duradero; nunca se pierde el ID del agente ni se convierte su texto en consentimiento.
- `tests/agent-terminal-delivery.test.ts`: escenarios de resumen enorme, controles de terminal y persistencia del enlace a la tarea. La salida se etiqueta expresamente como dato no confiable, no nueva instrucción.
- `.github/workflows/asen-real-agent-acceptance.yml`: añadir las pruebas funcionales de Planner y Verifier al gate sin proveedor de la misma revisión antes de cualquier inferencia real.

### Correspondencia con el ODD

| Unidad | Avance técnico de esta tanda | Estado admisible |
| --- | --- | --- |
| EF-001 | Corrección previa de control de confirmaciones y test de caducidad existente en HEAD | PASS focal histórico; verificar CI nuevo |
| EF-101 | C01/C04/C05: selección proporcional, seis escenarios ASEN | PARTIAL: referencia A/B no ejecutada |
| EF-401 | C09/C10: medium no Verifier, high incidente exige uno, test de no acceso a Writer | PARTIAL: falta prueba Pi real |
| EF-601 | C13/C14: acotar la carga no confiable de una notificación de finalización | PARTIAL: falta despertar Pi real y acuse |
| EF-701 | Gate sin proveedor reforzado para rutas reales | PARTIAL: falta aceptación de referencia y proveedor |

**Restricciones:** no alterar permisos de Writer, ni activar inferencia de proveedores reales, ni proclamar C01–C20 PASS sin recibo. R4 sigue `SELF_AUDIT_ONLY / NOT independent`. Un CI verde futuro no es FULL funcional. No fusionar `main`. Preparar siguientes bloques grandes EF-102/103/201–203/602–604 y después Writer/Verifier/Reviewer con sus pruebas reales.

## Tanda EF-003 — comparador de observables (2026-11-03)

**Estado: IMPLEMENTED_PENDING_EXACT_SHA_CI; FULL NO ALCANZADO.** Se incorpora `scripts/agent-observable-parity.mjs`, una herramienta de lectura que compara rutas, roles, restricciones, comprobaciones, notificaciones y efectos (no respuestas libres). El conjunto de aceptación continúa siendo C01–C20 y las referencias congeladas A/B de este ODD.

- Captura: JSON `asen-agent-observable-v1`, objeto con `subject` (`reference` o `asen`) y `cases`, cada caso con `id`, `source`, `sha`, `execution`, `environment`, `model`, `receipt` y `trace`. El `trace` exige exactamente seis campos: `route`, `roles`, `guards`, `checks`, `notifications`, `effects`; solo permite valores de control limitados. El campo `receipt` es un localizador de evidencia para auditoría, no prueba automática de autenticidad.
- Uso en entorno aislado, con capturas reales ya obtenidas: `node scripts/agent-observable-parity.mjs <reference.json> <asen.json> <sha-candidato-exacto>`. Presenta MATCH/FAIL/BLOCKED para cada C y sale con código no cero si falta evidencia o hay diferencias. Una coincidencia necesita verificar recibos externos; el programa **siempre devuelve globalFull:false**.
- Rechaza esquemas ajenos, casos repetidos/extraños, trazas mal formadas y reutilización de SHA; la evidencia estática o simulada queda BLOCKED aunque coincida en contenido. No se crean capturas A/B ni se atribuyen ejecuciones reales inexistentes.
- Prueba local focal de siete escenarios en Node 22.16.0: 7/7 PASS con `node --experimental-strip-types --test tests/agent-observable-parity.test.ts`. La nueva prueba se integra en la aceptación sin proveedor. El typecheck y CI remoto exact-SHA **aún no están certificados**.
- **EF-003: código implementado, aceptación remota pendiente. EF-002: BLOCKED hasta obtener observaciones reales A/B.** Los escenarios C01–C20 permanecen PENDING/BLOCKED y no se transforma ningún MATCH de fixture en FULL.

**Siguiente bloque:** captura auténtica A/B + ASEN, comparación por escenario y recibos verificados; proseguir F1/F2/F6 (continuidad, presupuesto de Explorer y acuse tras reinicio) y después F3/F4/F5 con Writer interactivo. Sin merge a `main`, sin gasto de modelos.

### EF-003 — corrección de transcripción de la prueba (2026-11-03)

- La primera publicación `9bd7d94` falló en el paso **Typecheck** de la aceptación sin proveedor, run `41670537262`, por una línea mal transcrita en `tests/agent-observable-parity.test.ts` (TS1005/TS1127/TS1002). Era un error sintáctico del test, no un resultado de equivalencia.
- Se restablecen los dos asserts de rechazo de rol desconocido y token con salto de línea, conservando el comparador y sus siete escenarios. Pendiente resultado CI exact-SHA de esta corrección; no calificar aún PASS ni FULL.

## Tanda F6 — EF-601/602: notificaciones protegidas y sin repetición (2026-11-03)

**Estado: IMPLEMENTED_PENDING_EXACT_SHA_CI; FULL NO ALCANZADO.**

- `SessionNotificationBus` conserva la identidad de un aviso reconocido hasta su TTL: la misma notificación terminal no reaparece después del acuse. Los registros reconocidos caducan y siguen contando en la capacidad en memoria hasta entonces; la saturación falla cerrada y nunca elimina una identidad consumida para aceptar una repetición.
- Se rechazan separadores de clave y caracteres de control en identificadores de sesión, tipo y origen, evitando suplantación de particiones. Los mensajes siguen admitiendo texto multilínea acotado.
- `agentTerminalContinuationMessage` elimina controles ANSI CSI/OSC, formatos Unicode y saltos de línea de datos del hijo; resume a 1200 puntos de código y encapsula el resultado en texto JSON etiquetado como no confiable. No se concede autoridad de Writer ni se cambia el criterio para reactivar Pi.
- Se añaden regresiones de reenvío tras acuse, capacidad/expiración, aislamiento de identidades y carga maliciosa del agente. En entorno local aislado, seis pruebas focales de Node comprobaron los contratos equivalentes (6/6 PASS); las suites de ASEN y los CI de GitHub quedan pendientes del SHA de publicación.
- **EF-601/602: PARTIAL**. No se ha demostrado aún acuse duradero ni despertar del padre Pi real tras reinicio. Esta corrección actúa sobre el bus efímero de presentación y sobre el mensaje entregado; no sustituye el almacén persistente de resultados.
- El comparador EF-003 de la tanda anterior recibió aceptación sin proveedor PASS sobre `5d9eaf8` (run `41670808497`); la suite CI completa y Release Gate deben verificarse por separado en el nuevo SHA. Los casos C13–C15 no se declaran equivalentes a A/B sin ejecución real.

**Siguiente bloque:** registrar/validar acuse persistente de agente y recuperar resultados bajo identidad de sesión/proyecto, sin reejecutar efectos inciertos; EF-201/202 presupuestos reales de Explorer; EF-102/103 reanudación exacta de ODD; luego Writer/Reviewer/Verifier auténticos.

## Tanda F2 — EF-202: presupuesto de Explorer observado (2026-11-03)

**Estado: IMPLEMENTED_PENDING_EXACT_SHA_CI, FULL NO ALCANZADO.**

- Telemetría `ExplorerBudgetTelemetry` para herramientas de lectura conocidas (`read`, `grep`, `find`, `ls`, `codegraph`, `asen_code_intelligence`, `web_search`, `web_fetch`), deduplicadas por `toolCallId`. Mide bytes UTF-8 de los bloques de texto observados, pero no almacena contenidos de herramientas.
- Los umbrales del ODD son **más de tres consultas o más de 40 KiB**. Si una lectura supera el presupuesto, el Pi anfitrión recomienda una sola delegación Explorer de solo lectura *si todavía falta investigar*. No ejecuta modelos, no lanza agentes y no concede permisos. El estado se reinicia en cada inicio/cierre de sesión, y la identidad de sesión/proyecto se valida después de la consulta asíncrona.
- Se añaden seis pruebas focales del medidor y una prueba de eventos Pi de no gasto/no notificación cruzada. El test de integración EF-202 y la prueba unitaria están incluidos en aceptación sin proveedor. En entorno Node aislado pasaron los seis tests unitarios equivalentes; no se declara todavía PASS de typecheck general ni de CI sobre el SHA final.
- **EF-202: PARTIAL**. No prueba todavía la necesidad real de delegación, las consultas hechas mediante herramientas no instrumentadas, ni el orden CodeGraph-first cuando no está disponible. Tampoco acredita comportamiento A/B ni Pi con proveedor real.

**Siguiente:** EF-102/103 para ODD persistente y reanudación, EF-601/604 para acuse duradero y recuperación tras reinicio, y observaciones reales C01–C20 antes de afirmar FULL.

### Control de aceptación F6 y criterio de cierre

Se ejecutan los dos nuevos tests EF-604 integrados con el anfitrión Pi de prueba junto con EF-601/603/202. El journal **no confirma consumo**: `attempted` y `enqueued` permanecen diferenciados para evitar duplicados y falsas garantías. C13–C15/C18 siguen exigiendo evidencias Pi real, proceso real y comparación con referencia. No se usan modelos pagados ni se hace merge a `main`.

**Próximos bloqueos externos para FULL:** snapshots genuinos de A/B sobre C01–C20, proveedor gratuito autenticado y su cuota, consentimiento Writer interactivo, recuperación con proceso real, revisión independiente de riesgo y CI exact-SHA en tres OS. No promocionar ninguna unidad por pruebas con mocks.

## Macrotanda F6 — EF-601/602/604: paridad del enrutador ocupado/inactivo y CI integral (2026-11-03)

**Estado: CODE_READY / PENDING_EXACT_SHA_CI. FULL NO ALCANZADO.** Se consolida el cambio en una publicación para no multiplicar CI de tres sistemas.

### Diagnóstico reproducible del SHA precedente

- CI general `41684034554` del SHA `11aab4e`: falla en Ubuntu/macOS/Windows aunque arquitectura, F5, Release Gate, Pi Runtime, CodeGraph y aceptación funcional sin proveedor eran PASS.
- Tres defectos de la misma integración `tests/pi-agent-runtime.test.ts`: línea 184 invocaba solo el primer listener de `tool_execution_end` y dejaba la barra de validación en `Comprobando`; línea 525 esperaba un ID visible antiguo en lugar del hash estable del journal; línea 532 esperaba el aviso de error antiguo, provocando timeout.
- Corrección: los finales de herramientas pasan por **todos** los observadores registrados; los asserts verifican formato de hash, semántica de fallo incierto y protección del resultado duradero. No se desactiva ninguna prueba ni se maquilla una falla del proveedor.
- El siguiente CI deberá demostrar suite global completa con esas tres regresiones solucionadas en las tres plataformas, además de preservar los gates ya verdes. Cualquier FAIL restante mantiene el estado PARTIAL.

### Semántica F6 aplicada

- Contrato de referencia A inspeccionado directamente en la baseline `813ec110`, módulo de agentes de la referencia líneas 1162–1189 y 1209–1259: padre ejecutando recibe `steer + triggerTurn:true`; padre inactivo recibe contenido encolado `triggerTurn:false` y un wake separado; ocupado sin turno del modelo retiene hasta un límite de ciclo. No se ha ejecutado aún la referencia en vivo ni la referencia B.
- ASEN adopta ese criterio mediante `agentParentRoute` y `agentTerminalWakeOptions`. El contexto Pi `isIdle()`, el estado `agent_start`/`agent_settled`, `turn_end` y los límites de compactación determinan la entrega. Sin identidad TUI válida, no se inicia otro turno. No hay sondeo de estado ni reejecución de agentes por una señal de wake.
- El journal `AgentNotificationJournal` sigue siendo el árbitro de deduplicación: en `hold` la entrada queda `pending`, y una frontera de turno solo puede entregar tras consultar de nuevo el estado terminal verdadero y comprobar la sesión y el proyecto. Nunca se recupera `attempted` automáticamente ni se reenvía una entrada `enqueued`.
- Para padres inactivos, el mensaje de resultados se encola y confirma **antes** de programar un único wake oculto, consolidado por ráfaga. Un wake se identifica como mensaje generado por ASEN, sin permisos ni supuesto consentimiento humano. Un fallo de wake conserva el resultado consultable; no lo reinyecta ni simula un acuse.
- Nuevas pruebas: rutas puras `run/idle/hold/headless` y tres integraciones Pi TUI simuladas (padre activo, inactivo y compactación). Son pruebas con host instrumentado y runner simulado: **no prueban** todavía que un Pi real acepte y procese el wake, ni demuestran consumo, reinicio de proceso real o paridad total.

### Gate y próximos cierres

- Aceptación requerida: `node --import tsx --test --test-name-pattern='EF-601|EF-603|EF-202|EF-604' tests/pi-agent-runtime.test.ts`, suite completa Ubuntu/Windows/macOS, Typecheck, Build, F5, arquitectura, Release Gate y R4 `SELF_AUDIT_ONLY / NOT independent`.
- Pendientes FULL: EF-002 observaciones A/B genuinas C01–C20, EF-102/103 continuidad ODD revisada, EF-201/203 Explorer con fuentes reales, EF-301–304 Writer con autorización TUI auténtica, EF-402–503 revisión/verificación real, EF-601 wake Pi real bajo padre activo e inactivo, EF-702 proveedor gratuito autorizado y recibos exact-SHA finales. **Ningún mock promociona C13/C15/C19/C20 a PASS.**

### Ajustes de integración de la tanda

El SHA inicial de esta tanda detectó dos rechazos reales de gates: TypeScript `TS2379` al pasar una propiedad opcional con `undefined` explícito en un fixture, y rechazo por la política de no introducir nombres de procedencia externos fuera de los manifiestos. Se corrige el fixture construyendo un contexto sin esa propiedad; el ODD conserva las líneas y SHA de referencia sin el literal prohibido. Estas correcciones no prueban FULL ni cambian los permisos de ejecución.

### CI de F6 — sustitución de expectativa `followUp` obsoleta

La aceptación funcional del commit `f72a2c0` superó Typecheck y las tres nuevas pruebas Pi TUI de enrutamiento, pero otra prueba `EF-601` todavía exigía `followUp`. Se mantiene la prueba y se actualiza a la semántica S07: resultado primero encolado, wake separado con `steer`, una sola vez y sin acuse de consumo ficticio. Se limpia también la sesión de prueba. Falta confirmar el CI completo exact-SHA; no promocionar a FULL.

### Extensión de F1: materializador de planes y recibos de referencia

El cambio de protección se aplica también al **origen**: `materializeExecutablePlan` propaga `candidateRevision` desde los agentes de la ruta ODD para Explorer, Reviewer y Verifier. De este modo la comprobación de HEAD del despachador no depende de que un tercero construya manualmente el metadato. Se añaden dos pruebas usando decisiones ODD auténticas, una ruta con dos revisores y otra con Verifier explícito. No se reconstruye una revisión candidata si ha cambiado la rama: se bloquea la unidad y se solicita volver a planificar.

El workflow sin proveedor incluye ahora las pruebas de ODD persistente y tres regresiones de candidato caducado, la vista de dependencias bloqueadas, la propagación del materializador y el evento Pi EF-201. Todas deben cerrar en el **mismo SHA de publicación**, sin reclamar FULL por un fixture.

### Corrección de compilación exact-SHA

La primera ejecución `41693250792` del SHA `af26679` rechazó TypeScript `TS2345`: el tipo inferido para `flatMap` solo aceptaba `missing`, aunque las dependencias pueden tener cualquier `TaskState`. Se añade `<{id:string;state:string}>` al `flatMap` sin cambiar la lógica, los datos persistidos ni las pruebas de bloqueo. La aceptación de la nueva revisión queda pendiente del siguiente CI.

## Macrotanda F4/F5 — aceptación humana verificable de Reviewer/Verifier (2026-11-03)

**IMPLEMENTADO / CI DEL SHA EXACTO PENDIENTE — ESTADO GLOBAL PARTIAL, NO FULL.**

- Se incorpora el comando interactivo `/asen-accept-review <todo-id>` en el catálogo de Pi, separado de `/asen-review`. No es una herramienta invocable por el modelo y no funciona en RPC/headless: exige TUI activa, sesión y proyecto idénticos, `ui.confirm` humano y autorización de un solo uso. No acepta un Writer y **no autoriza escritura ni merge**.
- El nuevo verificador `acceptIndependentReview` exige un Todo de Reviewer/Verifier realmente bloqueado por su resultado terminal, `candidateRevision` persistido, un único enlace durable y un registro de agente completado autenticado desde `AgentRuntime.query` para la misma sesión/proyecto/rol. El dictamen JSON contiene únicamente `verdict` y `evidence` y debe ser `pass` con hallazgos no vacíos; los fallos, estructuras inesperadas, texto libre con controles terminales, duplicación de claves y evidencia excesiva bloquean.
- Antes de la autorización y dentro del cierre se verifica Git HEAD exacto y árbol/índice sin cambios. Cualquier modificación en el diálogo, cambio de sesión o cambio del resultado invalida la aprobación. Un resultado declarado `pass` por el modelo **no se convierte en aceptación automática ni demuestra que el hallazgo es verdadero**: se presenta al usuario para juicio explícito.
- `SessionTodoStore.acceptReviewedTask` ejecuta la confirmación en una única transacción con bloqueo entre procesos y control de instantánea CAS. Registra `blocked→running→done` como transiciones auditables del acto humano (sin reejecutar el agente), valida dependencias y se niega a escribir si el evento/plan cambió. Dos confirmaciones concurrentes no pueden registrar dos aceptaciones.
- Se añaden pruebas de veredicto, formato e inyección; Reviewer y Verifier con almacenes reales, dos confirmaciones simultáneas, denegación, fallo de dictamen, SHA caducado, árbol alterado durante el diálogo, vínculo inexistente y cierre de interfaz interrumpido. El gate sin proveedor las ejecuta junto con todas las pruebas F1–F6 existentes.
- **Límite reconocido:** este comando habilita continuar desde una revisión *realmente completada y aprobada* de un commit congelado, pero aún no demuestra el criterio FULL de equivalencia A/B, ni suple una auditoría independiente ni fabrica firma o consentimiento Writer. Cuando el Worker cambió HEAD, la revisión basada en la revisión antigua se bloquea; hay que preparar una nueva revisión sobre el candidato actual, no rebautizarla silenciosamente. Las verificaciones reales de los cinco roles y C01–C20 siguen pendientes.

### Criterio de aceptación de esta macrotanda

Aceptar únicamente tras typecheck, tests unitarios y de integración del comando y del journal, suite global Windows/Ubuntu/macOS, los gates de seguridad, Release Gate y el mismo SHA en CI. Ollama Cloud omitido y R4 autoauditoría NO independiente mantienen FULL bloqueado aunque todos los tests sin proveedor estén verdes.

### Ajuste TS estricto de la aceptación interactiva

La primera ejecución del commit `0ec8234` rechazó `TS2322/TS2345` por inferencia amplia de `phase` en el fixture de Reviewer/Verifier. Se anota `selection: SkillSelectionContext` en el test de integración; no se modifican verificadores, permisos, journal ni límites de aceptación. Queda pendiente comprobar el siguiente CI exact-SHA.

### CI global: inventario público de comandos

La ejecución completa `41696159173` del SHA `2ea767e` detectó un rechazo en `tests/command-catalog.test.ts`: la lista estática esperada no incluía `asen-accept-review`. Se incorpora el comando en su posición alfabética sin eliminar el control de unicidad, la comprobación de comandos ausentes ni la lista de comandos implementados. El tipo, la lógica de autorización y el almacenamiento permanecen intactos. Confirmar el nuevo SHA antes de cerrar el gate de tres sistemas.

### EF-603 — cierre ordenado de procesos en la prueba de coalescencia

La aceptación sin proveedor del SHA `28906cb` falló en el hook de limpieza de un test que había validado el ID de dos Explorer idénticos: `ENOTEMPTY` borrando `.asen` antes de terminar la persistencia del agente de otra sesión. Se corrige el fixture para cerrar primero ambas sesiones con sus hooks Pi y eliminar después la raíz aislada con reintentos finitos. No se añaden sleeps de ejecución ni sondeo de agentes, no se cambia el sistema productivo y la prueba sigue exigiendo identidad/de-duplicación correctas.

## F7 — reparación de la adquisición congelada y CLI de comparación C01–C20 (2026-11-03)

**Estado: IMPLEMENTADO / CI exact-SHA pendiente. Nunca proclamar FULL por esta reparación.**

- Baseline del incidente: en el CI general del SHA `1fb27dd`, Ubuntu abortó `Prepare frozen ecosystem Git objects` por HTTP 403 del endpoint de búsqueda pública `search/commits`. Los gates de Arquitectura, Release Gate, Pi Runtime, F5, CodeGraph, R4 automatizado y aceptación funcional sin proveedor de ese SHA eran PASS. El error observado es de adquisición de procedencia, no prueba de divergencia de comportamiento.
- Se ha **verificado de manera independiente la identidad del origen** con lectura de objetos Git de GitHub: repositorio de procedencia ya declarado en `registry/parity/skill-sources-v1.json`, commit `08de420ca29be16b6f6bee725a30b599b061df16` y árbol `9af648106ed75fa270476e9d474bad93aa38af6b`, que coincide con el manifiesto de `registry/parity/ecosystem-sources-v1.json`. No se cambia la referencia.
- El preparador `.github/scripts/prepare-frozen-ecosystem-baseline.mjs` ya no busca commits usando la API pública ni depende de cuotas de búsqueda: comprueba que los dos manifiestos rastreados coinciden, verifica que la fuente tiene formato `owner/repo`, obtiene **únicamente** el SHA congelado mediante `git fetch --no-tags --depth=1`, y comprueba de nuevo `FETCH_HEAD`, el tipo `commit` y el hash exacto de su árbol. No hace checkout del código externo ni exporta la variable de evidencias si existe una discrepancia.
- Tests F7 nuevos: concordancia de manifiestos, rechazo de fuente/revisión manipulada, construcción del comando Git exacto sin búsqueda web, rechazo de SHA/tree no coincidentes y prohibición de publicar una ruta de evidencia inválida; incluidos en gate funcional sin proveedor y en la suite general. No hacen solicitudes de red en CI al evaluar las pruebas.
- En EF-003 se corrige la ruta CLI `process.argv.length` (un error previo de nombre de propiedad impedía invocar el comparador correctamente). Se añade una prueba que ejecuta Node como proceso real con JSON A/ASEN de muestra: 1 caso alineado y 19 faltantes deben dar exit 1, `globalFull=false`; número de parámetros incorrecto debe fallar con uso explícito. **El comparador sigue sin certificar FULL**, incluso con 20 coincidencias, mientras no haya recibos auténticos auditados.

**Siguientes requisitos para FULL:** CI completo exact-SHA Linux/Windows/macOS; matrices A/B capturadas por ejecución real en las referencias; recibos verificables C01–C20; Provider gratuito real con credenciales y autorización; consentimiento Writer en Pi real; acuse genuino del coordinador; cierre R4 `SELF_AUDIT_ONLY` claramente diferenciado de revisión independiente. La reparación de un 403 y los tests sin proveedor **no sustituyen** ninguna evidencia de ejecución del proveedor.
