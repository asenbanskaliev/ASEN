# Investigación avanzada — flujo de agentes Gentle Shell 4.9.0 frente a ASEN

**Estado:** INVESTIGADO_EN_CODIGO / PROPUESTA_DE_PLAN; NO IMPLEMENTADO NI CERTIFICADO POR ESTE DOCUMENTO.
**Fecha:** 2026-11-19.
**Referencia inmutable:** Gentleman-Programming/gentle-shell, tag `v4.9.0`, commit `ce64a9a708e50c0ca899c8023140e63f29f293e1`.
**ASEN observado:** PR #61, rama `feat/flujo-de-agentes-20261115`, SHA `d38cc1dcce3fd79bfe15acbba23985973bb04852`.
**Ámbito:** decisiones de orquestación, exploración, delegación, paralelismo, modelos, permisos, comunicación, fallos, recuperación, verificación, revisión y reparación. **Se excluyen Desktop, Tower, diseño visual y T11**. La comparación visual 4.8.0 conserva su propia referencia.
**Documento rector:** [flujo-de-agentes.md](./flujo-de-agentes.md). Esta investigación no concede permisos, no inicia modelos, no declara pruebas reales, no modifica las tareas históricas y mantiene `globalFull:false`.

## Método y grado de prueba

Se contrastaron los contratos de agente de Gentle Shell 4.9.0 con código ejecutable, PRs de introducción y pruebas del repositorio; en ASEN se inspeccionaron las rutas del orquestador, la extensión Pi, el Dispatcher, la planificación ODD, sesiones, modelos, Workers paralelos, diarios, correcciones y revisiones.

- **CONTRATO:** regla que aparece en instrucciones al orquestador o subagentes de Gentle, pero cuyo cumplimiento concreto depende del modelo y de la admisión del host. **No confundir instrucciones con garantías ejecutables**.
- **RUNTIME:** validación o transición implementada en código. Aun así, un método existente no prueba que el punto de entrada Pi lo invoque.
- **PRUEBA DE CÓDIGO:** prueba automatizada sobre una ruta concreta. No demuestra inferencia autenticada, simultaneidad real ni equivalencia completa.
- **EN VIVO/A-B:** requiere dos ejecuciones reales, mismo caso, modelo/host/candidato/consentimientos comparables y evidencia observable. **No ejecutado en esta investigación**.
- **Valoración de adopción:** ADOPTAR, ADAPTAR, MANTENER ASEN o POSPONER. «No observado» no implica «inexistente»; obliga a trazar el productor y el consumidor antes de implementar.

## G49-01 — ¿Trabajo directo, plan ODD o agente delegado?

**Gentle 4.9 — contrato exacto:** `assets/orchestrator.md#L15-L49` y `assets/orchestrator-delegation-reference.md#L38-L91`. Clasifica «pequeño» solo cuando resultado y ubicación están claros, riesgo contenido y el trabajo puede reanudarse con la petición original + diff. «Grande» depende de continuidad, no de cantidad de archivos. Pequeño -> el padre trabaja directamente, hace pruebas y entrega. Grande sin motivo para delegar -> el padre sigue directamente, pero registra ODD/TODO. El tamaño no lanza Writer ni Verifier por sí solo. Si aparece un mecanismo aplicable, reevalúa. **Modo de delegación total:** `assets/orchestrator-full-delegation.md#L1-L35` obliga a que cualquier escritura vaya a Writer; es una opción explícita del perfil, no la regla por defecto.

**ASEN — evidencia:** `src/orchestration/orchestrator.ts#L85-L164` traduce `OddRouteDecision` en `direct|plan|verify|incident|orchestrate`; `src/runtime/lifecycle/plan-dispatcher.ts#L102-L195` exige tareas persistidas y admisión. No hay equivalencia probada de las tres pruebas de tamaño, el motivo de delegación y el cambio de modo a lo largo del turno.

**Decisión: ADAPTAR.** Reusar `deriveOddFacts/planOddRoute` y `buildOrchestrationPlan` para añadir un diagnóstico de ruta explícito `inline/track/delegate/read-only-explore` con motivo y límites. No introducir un segundo orquestador. No convertir automáticamente toda tarea grande en Writer. El «modo delegación total» es POSPONER hasta probar consentimiento, capacidades y semántica de Pi: no activarlo por defecto.

**A/B:** tarea pequeña de dos archivos -> cero hijos; tarea grande indivisible -> ODD pero cero Writer delegado sin motivo; dos unidades verdaderamente independientes -> delegación si pasa admisión; petición de delegación expresa con herramienta ausente -> bloqueo o elección válida, nunca escritura encubierta.

## G49-02 — ¿Cuándo llamar al Explorer?

**Gentle — contrato:** `assets/orchestrator.md#L39-L47`, `assets/orchestrator-delegation-reference.md#L64-L75`. La investigación directa se limita a un lote de hasta tres consultas y aproximadamente 10.000 tokens; si hace falta superar ese presupuesto acumulado, se encomienda una exploración de solo lectura con contexto fresco y resumen de hasta unos 2.000 tokens, citando ruta/línea. No es una exigencia por número de archivos ni para lecturas ya delimitadas que preparan una edición.

**ASEN:** `src/orchestration/orchestrator.ts#L129-L135` solo añade Explorer automáticamente para `decision.route==="incident"`; `src/agents/agent-runtime.ts` dispone de `startReadOnly/startExplorer`. **Hueco de decisión**, no carencia del tipo de agente.

**Decisión: ADOPTAR CON ADAPTACIÓN.** Habilitar señal explícita de «lectura acumulada supera presupuesto» hacia el mismo planificador; medir lecturas sin guardar contenido sensible, no un detector heurístico que invente rutas ni un contador que obligue a comprar llamadas. En defecto de modelo Explorer autorizado, no ejecutar llamadas de pago: informe de bloqueo/continuación limitada.

**A/B:** primera lectura suficiente -> sin Explorer; cuarta lectura exploratoria necesaria -> un solo Explorer; fichero de preparación ya localizado -> lectura inline; Explorer sin herramientas -> bloqueo técnico sin capacidad de escritura.

## G49-03 — ¿Por qué, cómo y cuántos Writers paralelos?

**Gentle — contrato más límite runtime:** `assets/orchestrator-writer.md#L1-L25`, `assets/orchestrator-full-delegation-card.md#L22-L61`, `lib/bounded-writer-admission.ts#L205-L299`, `lib/agents-runner.ts#L611-L623`. En modo orgánico, solo hay Writer por paralelismo real (dos o más comportamientos independientes y suficientemente grandes) o límite de contexto. Una unidad contiene código + pruebas + documentación; las dependencias se ejecutan en serie. Los lanzamientos independientes se agrupan en la misma acción; el runner encola lo que supera `maxConcurrency`. La admisión bloquea Writer sin motivo válido y solapamiento de ámbitos. En delegación total, el padre nunca escribe y todo cambio autorizado va a Writer.

**ASEN:** `src/runtime/agents/parallel-worktrees.ts#L44-L197` prepara de 2 a 4 worktrees con confirmación; `src/runtime/agents/parallel-parent-supervisor.ts#L102-L363` exige sesiones hijas y planes ODD listos, consentimiento de lote y aprobación individual; `src/agents/dispatcher.ts#L75-L165` dispone de concurrencia y ámbitos. Es una ruta **más preparada y costosa**, y muy estricta frente a lanzamientos ambiguos.

**Decisión: ADAPTAR, NO COPIAR EL RUNNER.** Usar el Dispatcher y el supervisor presentes. Reducir ceremonias **solo después** de demostrar la misma protección: preparar y lanzar en un flujo de lote único de la sesión Pi, reutilizando los diarios y la doble revalidación; no obligar a un worktree nuevo si dos ámbitos disjuntos admitidos pueden usar el mismo proyecto sin perder aislamiento ni trazabilidad. Mantener autorización Writer por unidad y no integrar automáticamente. No abrir modelos si el lote no está listo.

**A/B:** dos unidades independientes -> ejecución concurrente medida; solapadas -> bloqueo sin una sola escritura; dependientes -> lanzamiento de B solo tras A validada; un Worker falla después de empezar B -> B conserva su resultado y se inspecciona A; supervisores duplicados -> un único intento durable.

## G49-04 — Cambiar o ampliar rutas de escritura sin permisos implícitos

**Gentle:** `assets/orchestrator-writer.md#L9-L25`, `lib/bounded-writer-admission.ts#L1-L205`. El hijo solo puede editar rutas exactas autorizadas. Si descubre otra ruta necesaria, devuelve `interaction_required` con ruta y motivo. **El padre**, no el hijo, puede sustituir el ámbito para la misma finalidad ya autorizada si revisa dueño, riesgo, solapamientos y alcance; objetivos nuevos, datos privados, operaciones destructivas o consentimiento agotado vuelven a la persona. El nuevo ámbito **reemplaza**, no suma sin límite. La ruta por sí sola no autoriza usar un repositorio distinto.

**ASEN:** `src/agents/dispatcher.ts#L95-L165`, `src/runtime/lifecycle/plan-dispatcher.ts#L129-L165` y `src/runtime/agents/parallel-parent-supervisor.ts` ligan autorización al candidato, sesión y rutas.

**Decisión: MANTENER ASEN para escrituras; ADAPTAR solo la experiencia de propuesta.** El padre puede **proponer** la modificación concreta y preparar un nuevo plan, pero no trasladar automáticamente permisos ya consumidos ni ampliar un grant vivo sin autorización. Optimización posible: evitar solicitar al humano que escriba rutas técnicas, sin asumir que las ha aprobado. Para consentimiento insuficiente, detener.

**A/B:** ruta requerida nueva misma finalidad -> propuesta detallada sin escritura; ruta fuera del proyecto -> bloqueo; conflicto entre agentes -> bloqueo; consentimiento negado -> cero modificaciones; cambio de SHA entre oferta y aceptación -> invalidar.

## G49-05 — ¿Qué ocurre en primer plano, segundo plano y al finalizar?

**Gentle:** `assets/orchestrator-full-delegation-card.md#L47-L61` + `lib/agents-runner.ts#L575-L740` + `lib/agents-completion-delivery.ts#L1-L81`. Con política de segundo plano apagada o herramienta no disponible, tarea en primer plano. Con política encendida y herramienta válida, lanzamiento devuelve ID y resultado se entrega al padre al **terminar realmente**; `agent_end` puede ser un intento, solo `agent_settled` es final. Sin sondeos periódicos. Dos tareas no deben lanzarse dos veces por estar en cola; resultados antiguos se anuncian abreviados (90 s). Al salir Pi, no se anuncian tareas activas como recuperadas.

**ASEN:** `src/runtime/agents/agent-terminal-delivery.ts#L15-L103` separa `idle/run/hold/headless`, ya tiene ventana de 90 s; `src/runtime/agents/agent-notification-journal.ts#L81-L175` conserva `pending/attempted/enqueued/acknowledged`; `src/runtime/agents/task-agent-coordinator.ts` vincula tareas y agentes. Muy buen fundamento, pero el ACK es del coordinador, no de lectura humana, y no demuestra que el plan continúe solo.

**Decisión: ADAPTAR.** Una única transición terminal validada por el host debe alimentar diario, entrega al padre y próxima decisión de ODD. Reusar las colas actuales; no crear un proceso de sondeo ni un segundo gestor de tareas. La continuación puede planificar y leer automáticamente; **no** autoriza nueva escritura, coste, cambio de objetivo o aceptación.

**A/B:** `agent_end` intermedio -> no terminar; `agent_settled` final -> una entrega; padre ocupado -> aviso sin duplicación; respuesta >90 s -> solo aviso y consulta de evidencia; Pi reiniciado -> ambiguo, no reejecución automática; headless -> registro sin falso despertar.

## G49-06 — Fallos de lanzamiento, bloqueos, cancelaciones y continuidad

**Gentle runtime:** `lib/agents-runner.ts#L686-L740`, `#L1292-L1535`: fallo de lanzamiento se asigna solo a su tarea; cancelación antes/después de comenzar; cierre ordenado con SIGTERM y, si se agota, SIGKILL y comprobación del árbol de procesos; tareas hijas en curso no equivalen a éxito de su padre. **Nueva regla 4.9**: `assets/orchestrator-verification.md#L20-L34`, `assets/orchestrator-full-delegation-card.md#L54-L59`: diagnóstico ante agotamiento, nunca repetir ciegamente. Las PR #3339 y #3286 aclaran que un bloqueo de una unidad no debe paralizar otras unidades independientes y autorizadas.

**ASEN:** `src/agents/dispatcher.ts#L75-L165`, `src/runtime/agents/agent-lifecycle.ts#L32-L54`, `src/runtime/agents/authorized-write-recovery.ts#L39-L86`, `src/runtime/agents/task-agent-coordinator.ts#L29-L103`. Reconciliación de escrituras con estado `pending/completed/uncertain`; un Worker interrumpido no recibe replay automáticamente. `src/runtime/agents/parallel-parent-supervisor.ts` puede devolver `partial-needs-review` en cuanto encuentra ambigüedad.

**Decisión: MANTENER ASEN ante escrituras inciertas, ADOPTAR continuidad de tareas independientes.** Si falla una unidad, mantener bloqueada *esa unidad* y permitir que otras listas y consentidas progresen, sin recomenzar las ya observadas. Un error de lectura técnica (sin efectos) puede tener una recuperación delimitada; cualquier error posterior a una escritura requiere inspección del candidato y nuevos permisos. No aplicar la política de «seguir» a operaciones destructivas.

**A/B:** lanzamiento Pi inexistente; excepción de spawn; proceso colgado; parada voluntaria; cancelación cuando queda un evento tardío; proceso muere tras escribir pero antes de responder; reinicio y diario inconsistente; una rama paralela bloqueada y otra independiente lista.

## G49-07 — Errores de modelos y sustitución por perfiles

**Gentle runtime:** `lib/model-fallback-policy.ts#L1-L151` y `lib/agents-runner.ts#L935-L1017`, `lib/orchestrator-fallback.ts#L1-L76`. Clasifica errores recuperables, usa una cadena de modelos no repetidos y tiempo de espera: agotamiento/cuota ≈30 minutos; fallo transitorio ≈2 minutos. Cambia al siguiente modelo **solo si la cadena lo permite**. Un rechazo a cambiar de modelo lleva al siguiente permitido; una cancelación no dispara fallback. La selección de esfuerzo usa el esfuerzo configurado en el paso o el original, sin arrastrar indebidamente el del anterior.

**ASEN:** `src/runtime/lifecycle/model-fallback-policy.ts#L1-L162` ya contiene cooldown 30m/2m, máximo 8 y clasificación; `src/runtime/lifecycle/parent-model-fallback.ts#L53-L133` escucha `agent_end/agent_settled`; `src/agents/dispatcher.ts` valida la cadena. **Gran parte de la regla ya está implementada**.

**Decisión: MANTENER ASEN, endurecer pruebas reales, no duplicar.** Asegurar mismo comportamiento para padre e hijo, proveedor sin credenciales, modelo real no observado, coste o privilegio distinto, error de contenido vacío y cadena agotada. La elección de modelos y el coste requieren consentimiento del usuario cuando proceda; el fallback no equivale a autorización de pago.

**A/B:** límite 429 -> siguiente permitido; 5xx -> pausa breve; credencial caducada -> salto válido si estaba autorizado; modelo no disponible -> no anunciar cambio exitoso; cadena agotada -> fallo explícito; cancelación -> no cambiar; respuesta vacía -> analizar clasificación real sin inventar respuesta.

## G49-08 — Perfiles y el modelo del orquestador principal

**Gentle 4.9 runtime y PR #3208:** `lib/session-profile-freeze.ts#L1-L149`, `lib/profiles-orchestrator.ts#L1-L130`, `extensions/gentle-ai.ts`. Para una **sesión propia nueva elegible**, congela el perfil resuelto y puede aplicar el modelo del orquestador sin escribir los valores globales; sesiones hijas y modo follow no hacen ese cambio. Modelo ausente, credencial no válida o rechazo del host -> mantiene el actual e informa. Editar el perfil global no cambia silenciosamente la sesión congelada.

**ASEN:** `src/runtime/lifecycle/session-profile-binding.ts#L1-L121`, `src/runtime/lifecycle/profiles.ts#L1-L32` y `extensions/asen.ts` implementan perfiles por capas y captura de sesión. La pantalla de perfiles distingue el orquestador del resto de rutas; no se ha demostrado el mismo cambio controlado del modelo padre al iniciar sesión.

**Decisión: ADOPTAR CONDICIONALMENTE.** Primero comprobar capacidades reales del Pi fijado por ASEN, credenciales y coste; después reutilizar el método **del host** para elegir modelo en una sesión propia nueva, bajo comprobación de identidad y sin reescribir configuración global. Sin ruta válida -> conservar modelo. No cambiar sesión que ya está ejecutándose por editar un perfil. No copiar archivos internos de Gentle si requieren otra versión de Pi.

**A/B:** perfil nuevo con orquestador válido -> modelo observado; perfil sin clave -> conservar; no disponible -> conservar+aviso; cambio global durante sesión -> sin cambio; hijo -> no altera al padre; sesión reanudada -> semántica observada, no inferida.

## G49-09 — Verificación proporcional y revisión independiente

**Gentle contrato y límites:** `assets/orchestrator-verification.md#L5-L43`, `lib/review-policy-ordinary.ts`. El Writer comprueba su cambio y aporta pruebas. Riesgo pasivo -> lectura estructural; riesgo medio -> Writer y pruebas, sin Verifier independiente; **un riesgo alto identificado en una de seis categorías** -> un Verifier independiente, no porque el trabajo parezca largo. Cuando RDD está encendido o desconocido, ASSESS informa el plan pero no sustituye las pruebas. Tras varias unidades paralelas, el padre ejecuta una comprobación conjunta de integración. Un fallo de montaje del Verifier es distinto de un fallo del código.

**ASEN:** `src/review/review-assessment-policy.ts#L1-L80` está anotado **unused-in-production**; `src/review/review-risk.ts`, `src/review/ordinary-review-command.ts` y `src/runtime/lifecycle/review-acceptance.ts` sí aportan piezas. El orquestador añade Verifier según `decision.verification` y puede proponer revisores. No hay equivalencia acreditada de toda la evaluación al entrar en producción.

**Decisión: ADAPTAR con mínimo coste.** Conectar la política proporcional a la fuente real de riesgo/plan existente, sin crear una segunda evaluación incompatible. Preservar pruebas obligatorias y recibos firmados; no forzar cuatro revisores ni un Verifier en cada tarea. **T09 deberá medir** defectos detectados/escapados, tiempo y llamadas, no solo pruebas sintéticas.

**A/B:** cambio de estilo -> sin revisor externo; cambio con permisos -> Verifier; fallo del Verifier por herramienta -> `partial` y causa de montaje; verificación real pasa pero el candidato cambia -> invalidar aceptación; pruebas de Writer ausentes -> no PASS por narrativa.

## G49-10 — Corrección agotada, rechazo de delegación y decisiones humanas

**Gentle 4.9 PR #3339 + #3292:** `assets/orchestrator-prompts.md#L9-L20`, `assets/orchestrator-verification.md#L24-L43`, `assets/orchestrator-writer.md`. Cuando Worker agota correcciones, entrega causa y `partial`; el padre decide la salida. En modo orgánico puede corregir en línea *solo si sigue siendo pequeño, entendido y autorizado*; en delegación total deriva otro Writer limitado; si la misma causa reaparece, bloquea esa unidad y sigue con trabajo independiente. Rechazo por falta de motivo de delegación no equivale a fracaso del trabajo: puede hacerla en línea; si el usuario exigió delegación, le plantea alternativas. Un fallo de preparación del Verifier admite una corrección limitada sin reescribir código de negocio.

**ASEN:** `src/review/bounded-correction.ts#L1-L32` tiene corrección de revisión de una ronda, `src/review/judgment-fix-odd-draft.ts` y `src/runtime/lifecycle/plan-dispatcher.ts` requieren un plan/consentimiento nuevo. `src/runtime/agents/task-agent-coordinator.ts` ofrece orientaciones, no orquestación automática de diagnóstico por causa. **No convertir esos objetos descriptivos en permisos**.

**Decisión: ADAPTAR con separación estricta:** errores sin efectos pueden producir sugerencias automáticas y una sola recuperación acotada; corrección de código únicamente bajo permiso existente válido o nueva aprobación. La causa se categoriza `test-regression|environment|scope|model|consent|conflict|unknown`; sin evidencia, `unknown` y bloqueo. Nunca repetir una escritura incierta, reiniciar presupuesto, eludir un no-retry ni preguntar por detalles que el sistema puede investigar en solo lectura.

**A/B:** fallos de tests por código; preparación del Verifier que falla antes del primer test; dos correcciones fallidas con misma causa; delegación rechazada para tarea pequeña; solicitud explícita de delegar; bloqueo humano legítimo; otra unidad independiente que puede continuar.

## G49-11 — Preguntas, respuestas abiertas y autorizaciones cerradas

**Gentle 4.9 PR #3292:** `extensions/ask-user-choice.ts`, `extensions/ask-user-question.ts`, `assets/orchestrator-prompts.md#L9-L20`. Pregunta ordinaria de 2–4 opciones admite texto propio por defecto; consentimiento o identificador de opción del proveedor es **cerrado** y debe configurar `allowCustomResponse:false`; no convierte texto libre ni una etiqueta en token opaco. Si la interfaz no representa la pregunta completa, se reproduce toda en el chat y se espera sin elegir. Una cancelación o respuesta ambigua no autoriza continuar.

**ASEN:** `extensions/asen.ts#L1824-L1830` valida selecciones nativas, `src/runtime/lifecycle/plan-dispatcher.ts#L129-L190` confirma acciones, pero no hay garantía probada de traspaso sin pérdida de sobres de elección arbitrarios de agentes/proveedor.

**Decisión: ADOPTAR el contrato, NO la herramienta por nombre.** Construir un tipo de «pregunta bloqueante» estable y una única adaptación al mecanismo Pi disponible: preservación íntegra de opciones/orden/tokens, rechazo de elecciones alteradas, caída segura a chat o suspensión sin inventar consentimiento. **No** permitir respuesta abierta en un permiso de escritura, modelo pago o autorización de revisión de proveedor.

**A/B:** elección ordinaria abierta; autorización de Writer cerrada; proveedor exige token exacto; cancelación; pregunta de cinco opciones no representable; selección ambigua; pregunta recibida mientras el padre está ocupado; usuario pregunta «¿por qué?» sin elegir.

## G49-12 — Judgment Day, revisión de correcciones y aceptación final

**Gentle:** `lib/review-policy-judgment-day.ts#L103-L288`, `lib/review-policy-ordinary.ts#L191-L516`, `lib/review-correction-lifecycle.ts#L98-L145`. Dos jueces independientes trabajan sobre un candidato/alcance congelado. Solo se vuelven a juzgar los hallazgos graves ya congelados; **máximo dos rondas**. La revisión ordinaria tiene corrección delimitada, validación objetiva y estados distintos para test que falla y fallo procedimental. Ningún informe de un agente es por sí mismo entrega autorizada.

**ASEN:** `src/review/judgment-day.ts#L21-L55` ejecuta dos revisores Pi distintos, pero devuelve `analysis-complete|findings-require-review|disagreement-requires-review` sin aceptación. `src/review/dual-rejudgment.ts#L6-L25` contiene límite de dos rondas, mientras `src/review/judgment-fix-odd-draft.ts#L1-L100` obliga a nuevo ODD/consentimiento. Existe lógica; no se ha probado la unión real de todos los tramos con dos modelos.

**Decisión: MANTENER diseño seguro de ASEN y completar cableado E2E.** No automatizar Fix con permisos heredados ni convertir `analysis-complete` en PASS. Distinguir análisis hecho, hallazgos corroborados, pruebas válidas, aceptación humana y entrega. Usar modelo de revisión realmente autenticado, diferente del autor, y marcar como no ejecutado si faltan credenciales o prueba independiente.

**A/B:** dos jueces coinciden; discrepan; uno retorna contenido vacío; falta modelo distinto; hallazgo grave persiste después de dos rondas; cambio del árbol SHA; Fix guardado pero no lanzado; corrección fuera de ámbito; rechazo de aprobación.

## G49-13 — Incidentes de Git, trazabilidad y límites de autoridad

**Gentle:** `assets/orchestrator.md#L45-L49`, `assets/orchestrator-writer.md#L9-L25`, `lib/agents-runner.ts`. Tras mutación accidental, directorio equivocado, recuperación fallida o reparación del entorno, detiene cambios, fotografía Git y diagnostica por separado. No transforma informes de hijos en órdenes, ni cambia repositorios sin autorización. Cambios paralelos deben revalidarse antes de integración.

**ASEN:** `src/runtime/agents/parallel-worktree-reconciliation.ts#L1-L115`, `src/runtime/agents/authorized-write-recovery.ts#L39-L86`, `src/runtime/lifecycle/review-acceptance.ts#L66-L163` ya son **fail-closed** con identidad Git/candidato/sesión, hash y recibo; la conciliación no fusiona automáticamente.

**Decisión: MANTENER ASEN.** No hacer más permisivo el diseño para aparentar paridad. Mejorar los diagnósticos visibles y continuidad de unidades no afectadas. No limpiar worktrees, resetear, rebase, merge ni consumir credenciales de forma automática.

**A/B:** SHA cambia durante aprobación; el proyecto o sesión cambia a mitad de consulta; un fichero no rastreado queda fuera de la revisión; fallo al leer diario; dos avisos contradictorios; un recibo no coincide con el árbol; fallo de CI del SHA final.

## Matriz obligatoria de casos A/B (sin ejecutar)

El comportamiento atribuido a Gentle procede de contratos+runtime indicados arriba, no de una ejecución local de esta investigación. ASEN se mide en el **punto de entrada real Pi**, no invocando por separado una función pura. Los escenarios negativos deben comprobar ausencia de escrituras, de nuevas llamadas de modelo y de estados falsamente positivos.

| ID | Disparador A/B | Resultado esperado o regla de bloqueo | Evidencia obligatoria |
| --- | --- | --- | --- |
| F49-01 | Tarea pequeña clara | Padre directo, sin agentes adicionales | Registro de ruta + contador de lanzamientos |
| F49-02 | Tarea grande indivisible | ODD registrado; sin delegación injustificada | Ruta y motivo |
| F49-03 | Investigación > presupuesto acumulado | Un Explorer solo lectura | Handoff, rutas y ausencia de write |
| F49-04 | Requisitos de producto ambiguos | Pregunta completa y espera | Elección sin modificación |
| F49-05 | Dos unidades independientes costosas | Workers simultáneos si hay permiso válido | Dos IDs Pi reales, intervalos solapados |
| F49-06 | Dos unidades escriben mismo archivo | Bloqueo o serialización, nunca carreras | Estado Git antes/después |
| F49-07 | Unidad B depende de A | B no arranca antes de A comprobada | Orden de eventos |
| F49-08 | Falta herramienta Worker adecuada | Fallback admitido o bloqueo real | Inventario de herramientas |
| F49-09 | Worker pide archivo adicional | Propuesta y validación por padre; no autoconcede | Ámbito anterior/nuevo y autorización |
| F49-10 | Archivo fuera de proyecto/sensible | Rechazo sin escritura | Estado Git y rutas protegidas |
| F49-11 | Segundo plano apagado | Ejecución frontal | Política y resultado |
| F49-12 | Segundo plano encendido | ID inmediato; final solo al asentarse | Eventos `agent_end/agent_settled` |
| F49-13 | Mensaje antiguo | Aviso acotado, sin repetir informe completo | Diario y entrega |
| F49-14 | Padre ocupado cuando hijo termina | No doble turno ni doble consumo | Un evento idempotente |
| F49-15 | Muere Pi mientras corre hijo | `interrupted`, nunca `completed` | Estado persistente |
| F49-16 | Child termina sin contenido | Fallo/diagnóstico, no PASS | Mensaje final y error categorizado |
| F49-17 | Quota/429 | Solo siguiente modelo autorizado | Modelo real, cooldown, precio/consentimiento |
| F49-18 | Fallo transitorio 5xx | Cooldown temporal y alternativa permitida | Categoría y tiempo |
| F49-19 | Se cancela el proveedor | No cambiar ni reintentar modelo | Eventos posteriores ignorados |
| F49-20 | No quedan modelos de respaldo | Bloqueo con causa | Cadena agotada |
| F49-21 | Perfil cambia durante sesión | No cambio retroactivo inesperado | Identidad de sesión/modelo |
| F49-22 | Modelo del perfil principal ausente | Mantener modelo anterior y avisar | Modelo observado |
| F49-23 | Riesgo bajo o pasivo | Pruebas proporcionales, sin 4R universal | Informe de riesgo |
| F49-24 | Cambio de seguridad/concurrencia | Verificador independiente autorizado | Riesgo, modelo y pruebas |
| F49-25 | Preparación del Verifier falla | Diagnóstico parcial, no PASS | Comandos no ejecutados |
| F49-26 | Dos jueces coinciden sin evidencia de tests | No aceptación automática | Candidato, firma y pruebas |
| F49-27 | Dos jueces discrepan | Desacuerdo visible, no Fix implícito | Ambos dictámenes |
| F49-28 | Grave sobrevive dos rondas | Escalado, jamás tercera ronda | Diario congelado |
| F49-29 | Worker agota correcciones | Diagnóstico y decisión del padre | Presupuesto inmutable |
| F49-30 | Se rechaza delegación de tarea simple | Ruta directa o pregunta legítima, no bucle | Motivo del rechazo |
| F49-31 | Consentimiento cerrado con texto libre | Rechazo, ningún token deducido | Registro de decisión |
| F49-32 | Interfaz no puede mostrar 5+ opciones | Pregunta íntegra o bloqueo, no selección parcial | Sobres y opciones |
| F49-33 | Se pierde respuesta tras escribir | Reconciliar, no repetir | Hashes/rutas/HEAD |
| F49-34 | Un Worker bloqueado; otro independiente listo | Continuar únicamente el ya autorizado | IDs y dependencias |
| F49-35 | Cambia SHA mientras se confirma | Rechazo de permiso obsoleto | SHA anterior/nuevo |
| F49-36 | Varios Workers terminan | Prueba conjunta de interacción y revisión | Comando real, diff combinado |
| F49-37 | Candidato revisado tiene archivos extra | No aceptar ni fusionar | Git tree y untracked |
| F49-38 | Falla CI del SHA final | `globalFull:false`, no entrega certificada | URL de ejecución SHA exacto |

## Plan de adopción óptimo (propuesta, no autorización automática de modelos)

### Megatanda G49-A — Política de decisiones y perfiles (P0/P1)

- **G49-01, 02, 08 y 10**: fijar contrato de ruta, trazabilidad de disparador, lectura acumulada, diagnóstico de rechazo y captura de perfiles. Cambios mínimos en `src/orchestration/orchestrator.ts`, `src/flow/odd-routing.ts` si existe el consumidor apropiado, `src/runtime/lifecycle/plan-dispatcher.ts`, `extensions/asen.ts`.
- Primero pruebas RED de cada ruta; luego GREEN y una prueba PRESERVE para `direct/plan/incident/verify` existente.
- No habilitar delegación total ni modelo principal al inicio hasta que Pi real confirme que la ruta soporta los cambios; dejar subunidades bloqueadas si requieren nuevo consentimiento.
- **Cierre:** F49-01..04, 21, 22 y 30; prueba Pi real y resultados observables, no solo texto del plan.

### Megatanda G49-B — Ejecución, eventos y recuperación (P0)

- **G49-03, 04, 05, 06, 13**: reutilizar `Dispatcher`, `TaskAgentCoordinator`, supervisor paralelo, enlace sesión/Todo y diarios; unir eventos terminales a una decisión segura de continuación.
- Separar «avanzar el plan sin coste» de «lanzar una nueva llamada/modelo» y «escribir»; solo la primera puede automatizarse sin nuevo permiso, si se cumplen condiciones de identidad.
- Evitar nuevas jerarquías de agentes, procesos Docker obligatorios, segundo planificador o un temporizador de sondeo persistente.
- **Cierre:** F49-05..15, 33..35, pruebas negativas de duplicado y 2 Workers reales aprobados.

### Megatanda G49-C — Fallos, revisión y Fix (P0/P1)

- **G49-07, 09, 11, 12**: mantener fallback y recibos; conectar diagnóstico de causa, verificación proporcional y continuación de unidades independientes; completar 4R/JD de punta a punta cuando corresponda.
- La corrección de una escritura incierta o un Fix requiere nueva autorización; un bloqueo técnico de lectura no debe confundirse con una pregunta humana.
- No copiar un gestor nuevo de `gentle_review` ni el binario Gentle AI 4.6.0 sin comprobar compatibilidad y decisión independiente.
- **Cierre:** F49-16..20, 23..29, 31..32, 36..38; al menos una revisión de dos modelos reales autorizados y una corrección consentida con evidencia.

### Megatanda G49-D — A/B, optimización y aceptación (T09/T10, P1)

- Preparar 38 escenarios como manifiesto/versionado de pruebas; ejecutar comparativas **caso por caso** con etiquetas `CONTRACT_ONLY`, `HOST_TESTED`, `LIVE_AUTHENTICATED`, `AB_PARITY`.
- Comparar **calidad de la solución, errores detectados, errores escapados, tiempo, llamadas, tokens, coste conocido, preguntas humanas necesarias, fallos de permiso y reanudaciones correctas**.
- Probar configuraciones con 1, 2 y 4 agentes donde tenga sentido. Medir si separar realmente reduce tiempo; el «100+ líneas» es una orientación de Gentle, no un límite normativo que ASEN deba copiar.
- T10 exige revisión independiente y exact-SHA de CI; fallos en Windows/macOS/Linux o modelos saltados quedan abiertos con estado preciso.
- **Cierre:** evidencia A/B real, sin gasto no consentido; `globalFull:false` hasta superar todos los controles del objetivo original.

## Riesgos y decisiones de diseño

1. **Evitar excesiva delegación:** más agentes generan más coste, latencia y superficie de fallo. Elegir por motivos, no por tamaño bruto.
2. **Evitar excesiva ceremonia:** los diarios de ASEN son útiles; no exigir cuatro confirmaciones para una sola lectura, pero **no reducir las aprobaciones de escritura y coste**.
3. **No confundir política con runtime:** los documentos de Gentle son una guía al modelo y el runner añade garantías. En ASEN, las decisiones sensibles deben verificarse en el Dispatcher/host, no solo en instrucciones.
4. **No duplicar piezas:** `review-assessment-policy.ts` está sin conectar a producción; antes de crear otro mecanismo averiguar cuál es el consumidor autorizado. El `SessionOrchestrator` de ASEN está documentado como no conectado; su mera presencia no acredita funcionalidad.
5. **Mantener compatibilidad:** Gentle v4.9.0 usa otro estado/versionado de Pi, proveedor y review. Reimplementar *comportamiento probado*, no trasladar interfaces privadas directamente.
6. **No confundir avance con entrega:** un resultado Pi `completed`, un juicio `analysis-complete`, una notificación `acknowledged` o CI verde aislado no aceptan ni fusionan código.
7. **Optimizar solo con métricas:** no adoptar automáticamente parámetros, límites ni bucles de corrección de Gentle. Exigir A/B para verificar ventaja en ASEN y conservar controles más estrictos cuando sean pertinentes.

## Fuentes directas (ancladas al tag y rama)

**Gentle Shell 4.9.0**
- [Nota oficial de versión](https://github.com/Gentleman-Programming/gentle-shell/releases/tag/v4.9.0) y [código de referencia](https://github.com/Gentleman-Programming/gentle-shell/tree/v4.9.0).
- [Orquestador](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.9.0/assets/orchestrator.md), [reglas de delegación](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.9.0/assets/orchestrator-delegation-reference.md), [Writer](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.9.0/assets/orchestrator-writer.md), [verificación](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.9.0/assets/orchestrator-verification.md), [preguntas](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.9.0/assets/orchestrator-prompts.md).
- [Ejecución y fallos](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.9.0/lib/agents-runner.ts), [modelo alternativo](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.9.0/lib/orchestrator-fallback.ts), [entrega de resultados](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.9.0/lib/agents-completion-delivery.ts), [Judgment Day](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.9.0/lib/review-policy-judgment-day.ts).
- PRs causales: [#3286](https://github.com/Gentleman-Programming/gentle-shell/pull/3286) continuidad/decisiones/rutas; [#3339](https://github.com/Gentleman-Programming/gentle-shell/pull/3339) agotamiento; [#3208](https://github.com/Gentleman-Programming/gentle-shell/pull/3208) perfil del padre; [#3292](https://github.com/Gentleman-Programming/gentle-shell/pull/3292) respuestas abiertas/cerradas.

**ASEN**
- [Orquestador](https://github.com/asenbanskaliev/ASEN/blob/feat/flujo-de-agentes-20261115/src/orchestration/orchestrator.ts), [despachador](https://github.com/asenbanskaliev/ASEN/blob/feat/flujo-de-agentes-20261115/src/runtime/lifecycle/plan-dispatcher.ts), [supervisor de paralelismo](https://github.com/asenbanskaliev/ASEN/blob/feat/flujo-de-agentes-20261115/src/runtime/agents/parallel-parent-supervisor.ts), [fallo y cambio de modelo del padre](https://github.com/asenbanskaliev/ASEN/blob/feat/flujo-de-agentes-20261115/src/runtime/lifecycle/parent-model-fallback.ts), [revisión](https://github.com/asenbanskaliev/ASEN/blob/feat/flujo-de-agentes-20261115/src/review/ordinary-review-command.ts), [Judgment Day](https://github.com/asenbanskaliev/ASEN/blob/feat/flujo-de-agentes-20261115/src/review/judgment-day.ts).
- Pruebas existentes que deben ampliarse, no duplicarse: `tests/orchestrator.test.ts`, `tests/plan-dispatcher-role-boundaries.test.ts`, `tests/parallel-parent-supervisor-claims.test.ts`, `tests/parent-model-fallback.test.ts`, `tests/agent-terminal-delivery.test.ts`, `tests/ordinary-review-command-ui.test.ts`, `tests/judgment-day.test.ts`, `tests/agent-flow-ab-series.test.ts`.

**Estado final de esta investigación:** hay decisiones justificadas y escenarios listos para convertir en tareas ODD; no se ha modificado la ejecución de ASEN, no se ha invocado ningún modelo y **no existe nueva evidencia E2E ni paridad FULL**.
