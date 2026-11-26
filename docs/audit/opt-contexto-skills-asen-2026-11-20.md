# ASEN — Auditoría quirúrgica de optimización de contexto, skills y agentes (20/11/2026)

**Estado:** AUDITORÍA DOCUMENTAL CON EVIDENCIA DE CÓDIGO; sin pruebas nuevas de proveedor, sin ejecución local de la suite y sin revisión independiente. Propuesta rector: [Anexo 11 OPT](../../odd/tasks/flujo-de-agentes-plan-implantacion-4.9.0.md#11-opt--optimización-quirúrgica-del-contexto-de-asen-20112026). No declarar OPT implementado ni equivalencia total.

**Objeto observado:** ASEN PR #61, SHA anterior a esta ampliación `05340ec03fed768921149247f0d43f8607c31169`; plan OPT guardado en `3f690ce71682a7febad1dc5b41b3f262bcfe7654`. Gentle Shell 4.9.0 en `ce64a9a708e50c0ca899c8023140e63f29f293e1`. La auditoría se limita a los caminos de contexto, skills, memoria, agentes y ensayos P16; no aprueba ni cierra los 18 objetivos previos.

## 1. Dictamen ejecutivo

**Adoptar con condiciones.** Sí conviene hacer más selectivas las instrucciones de la sesión principal de ASEN. **No** conviene rehacer su selección de skills ni su motor de agentes. El camino más pequeño y contrastable es medir el contexto real → corregir la detección de herramientas → dividir la guía fija → volver a medir → abordar memoria y duplicados solo si hay pruebas.

**No verificado:** ahorro del 60–70 %, latencia inferior, paridad de Gentle completo, coste facturado, seguridad comparada 3/3 frente a 2/3, ni mejora demostrada por solo cambiar prompts. Un acierto exacto distinto no equivale por sí solo a una vulnerabilidad.

## 2. Evidencias directas de ASEN

| Hallazgo | Evidencia | Evaluación |
| --- | --- | --- |
| **A01: bloque común muy largo** | [src/runtime/ui/request-guidance.ts L3–L34](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/src/runtime/ui/request-guidance.ts#L3-L34): instrucciones de desarrollo, búsqueda, Writer, plan, paralelismo, reanudación, cancelación | Confirmado en código. No confirmado como responsable exclusivo de los 1373 tokens extra. |
| **A02: señal de herramientas imprecisa** | [extensions/asen.ts L1205–L1235](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/extensions/asen.ts#L1205-L1235): `addAsenRequestGuidance(options,!!pi.registerTool,...)` | Confirmado: capacidad de registrar no significa herramienta elegida; evaluar `systemPromptOptions.selectedTools` o equivalente **solo tras validar la API de Pi exacta**. |
| **A03: skills ya seleccionadas en código** | [src/skills/registry.ts L66–L91](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/src/skills/registry.ts#L66-L91): rutas, disparadores y dependencias | Confirmado. No construir un segundo clasificador general. |
| **A04: Pi nativo ya controla rutas** | [src/agents/pi-process-runner.ts L146–L161 y L318–L322](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/src/agents/pi-process-runner.ts#L146-L161): valida paths del contexto; `--no-skills` seguido de `--skill` exactos | Confirmado. No eliminar instrucciones de lectura de `SKILL.md` hasta comprobar cómo Pi publica metadatos frente a cuerpo completo. |
| **A05: memoria dinámica limitada** | [src/memory/pi-integration.ts L82–L96](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/src/memory/pi-integration.ts#L82-L96): hasta 4096 bytes, base fijada y búsqueda acotada | Confirmado. El contexto puede ser útil o redundante: no reducir a ciegas. |
| **A06: plan acotado** | [src/runtime/lifecycle/plan-context.ts L23–L52](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/src/runtime/lifecycle/plan-context.ts#L23-L52): resumen de planes con máximo 2048 bytes | Confirmado. La continuidad necesita un indicador de estado, no necesariamente todo el histórico. |
| **A07: varias secciones por ejecución** | [extensions/asen.ts L1196–L1249](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/extensions/asen.ts#L1196-L1249): persona, modo, guía, memoria, plan | Confirmado. Medir **cada sección y su orden**, incluyendo cambios entre turnos y prefijos de caché. |
| **A08: ya hay pruebas Pi sin proveedor** | [tests/pi-native-skill-load.test.ts](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/tests/pi-native-skill-load.test.ts), [tests/pi-memory-skill-sdk-lifecycle.test.ts](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/tests/pi-memory-skill-sdk-lifecycle.test.ts), [tests/extension-runtime-commands.test.ts](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/tests/extension-runtime-commands.test.ts) | Tests presentes en repo; **no ejecutados en esta auditoría**. Ampliar, no duplicar infraestructura. |

## 3. Evidencias directas de Gentle Shell 4.9.0

| Mecanismo | Fuente real | Qué adoptar |
| --- | --- | --- |
| **Núcleo + detalle bajo demanda** | [assets/orchestrator.md](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/assets/orchestrator.md), [orchestrator-skills.md](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/assets/orchestrator-skills.md) | Mantener núcleo obligatorio, desplazar procedimientos largos a módulos condicionados. |
| **Carga de guía completa en sesión principal** | [extensions/gentle-ai.ts L13053–L13175](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/extensions/gentle-ai.ts#L13053-L13175) | **Ojo:** Gentle completo también añade núcleo y revisión al modelo; no comparar ASEN contra solo su interfaz. |
| **Selección precisa de skills para subagentes** | [lib/agents-runner.ts L365–L396](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/lib/agents-runner.ts#L365-L396), [extensions/child-context.ts](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/extensions/child-context.ts) | ASEN ya dispone de la selección; comprobar que los agentes no reciben reglas ajenas y que Pi no duplica la carga. |
| **Quitar bloques de contexto duplicado** | [lib/child-context-files.ts](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/lib/child-context-files.ts) | Crear una prueba de deduplicación antes de copiar el mecanismo; conservar originales en disco. |
| **Medir bytes del núcleo y herramientas** | [docs/prompt-budget.md](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/docs/prompt-budget.md) y [tests/orchestrator-budget.test.ts](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/tests/orchestrator-budget.test.ts) | Adoptar tests de presupuestos y regresión. Los bytes del conjunto de pruebas no son tokens facturados. |
| **Herramientas poco usadas ocultables** | [lib/hidden-tools.ts](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/lib/hidden-tools.ts) | Estudio opcional de API Pi. No asumir disponibilidad en Pi 1.2.0. |

**Corrección fundamental de P16:** [scripts/p16-comparacion-real.mjs L82–L90](https://github.com/asenbanskaliev/ASEN/blob/05340ec03fed768921149247f0d43f8607c31169/scripts/p16-comparacion-real.mjs#L82-L90) carga `extensions/gentle-shell.ts` en Gentle y `extensions/asen.ts` en ASEN con `--no-extensions --no-skills --no-tools`. No carga `gentle-ai.ts`, `gentle-agents.ts` ni `skill-registry.ts`. La prueba no es A/B de sistemas completos. Los 16940/4584 tokens son **datos de esa configuración concreta**, no ahorro atribuible a skills ni diferencia general entre productos.

## 4. Terceras opciones: qué aporta cada una

- **Claude Agent Skills, referencia oficial:** metadatos de skill visibles y cuerpo del archivo solo cuando es necesario; [documentación](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview). **Adoptar el patrón**, no la plataforma, porque ASEN ya ejecuta con Pi y skills propias.
- **OpenAI Codex/AGENTS.md:** separar las instrucciones del proyecto por ubicación y evitar instrucciones universales ajenas a cada operación; [guía de Codex](https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide). **Estudiar conflictos entre fuentes**, sin introducir otro sistema global.
- **LangGraph/LangMem:** resumir historial conforme al límite de contexto y preservar estado separado de los mensajes; [guía de memoria](https://langchain-ai.github.io/langgraph/how-tos/create-react-agent-memory/). ASEN ya conserva planes y memoria; **no añadir una segunda base ni otro coordinador**.
- **Seguridad de la cadena:** reglas ejecutables y pruebas negativas por encima de las instrucciones al modelo. Ninguna técnica de reducción justifica suprimir límites de autoridad.

Estas opciones son patrones de diseño; su existencia no demuestra ventajas de rendimiento en ASEN.

## 5. Puntos que el dibujo había pasado por alto

| ID | Riesgo omitido | Prioridad | Acción quirúrgica |
| --- | --- | --- | --- |
| **R01** | Comparación incompleta del Gentle real | P0 | Ensayo con carga equivalente de extensiones; no reutilizar porcentajes P16. |
| **R02** | Confundir herramientas registradas con activas | P0 | Probar selección Pi real al ensamblar el contexto. |
| **R03** | Eliminar del núcleo un aviso de seguridad o permiso | P0 | Matriz de obligaciones y test negativo antes/después. Guardia del host permanece intocable. |
| **R04** | Doble declaración de skills: catálogo Pi + rutas + lectura del cuerpo | P1 | Medir qué se envía de verdad y qué se lee; no suprimir lecturas obligatorias sin evidencia. |
| **R05** | Memorias y planes irrelevantes en preguntas simples | P1 | Comprobar frecuencia y relevancia; conservar estado mínimo fiable para «continúa». |
| **R06** | Prefijo cambiante rompe caché incluso si baja el texto | P1 | Medir cacheRead/cacheWrite y estabilidad de secciones entre turnos. |
| **R07** | Reglas duplicadas entre AGENTS.md, Pi, ASEN y skills | P1 | Inventariar, clasificar autoridad y eliminar solo equivalencias demostradas. |
| **R08** | Activación por palabras sueltas da falsos positivos/negativos | P0 | Enrutar por estado de ejecución, herramientas y operaciones. Fallback conservador. |
| **R09** | Recortar instrucciones de los hijos les quita contratos de edición | P0 | Probar Worker/Explorer/revisión real y aislamiento exacto. |
| **R10** | Medir solo caracteres o tokens de un turno | P1 | Por proceso, sesión, reintentos, caché, herramientas y precio; descartar comparativas de coste desconocido. |
| **R11** | Instrucciones de varios idiomas y versiones divergentes | P2 | Mantener un solo texto canónico por regla; test contra la versión Pi fijada. |
| **R12** | Cambios cruzados al mismo tiempo que E1–E3 | P0 | Integrar OPT solo mediante commits pequeños, sin mezclar controles de consentimiento y rutas. |
| **R13** | Clasificación de errores por marcador exacto | P1 | Guardar categorías seguras de respuesta y revisar la salida sintética, sin almacenar secretos. |
| **R14** | Pérdida de caché o degradación por consultar skills repetidamente | P1 | Medir coste total, no solo contexto inicial; reutilizar lecturas ya verificadas cuando proceda. |

## 6. Plan de implantación auditado: parches mínimos, sin cambiar el motor

**Tanda 0 — medición y pruebas (OPT-00):** añadir prueba para obtener `sections` y herramientas efectivas en Pi 1.2.0; registrar longitud y huella de cada bloque, metadatos de recursos y recuentos, sin contenido de usuario. Añadir presupuesto de contexto a los tests; registrar línea base en un SHA congelado.

**Tanda 1 — activación (OPT-01):** en `extensions/asen.ts` y `request-guidance.ts`, definir una sola función pura de selección de guía, con `selectedTools` verificado o alternativa estable. No tocar el host guard. Pruebas: sin herramientas, lectura, escritura autorizada, capacidades ausentes, modo completo, sesión cambiada.

**Tanda 2 — separación de guía (OPT-02):** extraer bloques de reglas **sin reescribir su significado**. Empezar solo por el texto usado en preguntas simples. Las obligaciones que el modelo necesita conocer **antes** de intentar una acción continúan en núcleo; los procedimientos extensos se incorporan cuando el estado o tarea lo requieren. Probar continuidad y cancelación; no decidir solo por palabras clave.

**Tanda 3 — duplicados medidos (OPT-03 y OPT-04):** medir memoria/plan y skills en padre e hijos; eliminar redundancia solo de pares semánticamente equivalentes y con prueba de no regresión. No reducir el límite de 4096 bytes por estética ni romper la semántica `--skill`.

**Tanda 4 — herramientas opcionales (OPT-05):** si Pi actual admite mantener herramientas activas sin declarar su esquema completo, probar en aislamiento. Si no, **descartar OPT-05** sin alterar el trabajo previo.

**Tanda 5 — comparación y admisión (OPT-06 y OPT-07):** lectura y agentes reales en sesiones separadas, mismas autorizaciones y alcance; pruebas negativas, rollback de solo los cambios OPT, revisión independiente y CI exacto por SHA. El despliegue gradual requiere interruptor reversible y telemetría de regresión.

### Matriz de aceptación mínima

| Caso | Contexto | Función | Seguridad |
| --- | --- | --- | --- |
| Pregunta simple sin herramientas | Guía extensa ausente | Misma respuesta correcta | Sin acciones |
| Programación pequeña | Guía pertinente | Pi puede editar solo si autorizado | Misma admisión |
| Investigación amplia | Umbral exploración real | Explorer si está justificado | Solo lectura |
| Plan complejo | Resumen activo | Dependencias y progresos | No permiso implícito |
| Continuar tras reinicio | Estado verificado | Reanudar donde procede | No repetir escritura incierta |
| Dos tareas independientes | Skills exactas por agente | Dos procesos separados | Ámbitos disjuntos |
| Denegación o cambio de SHA | Información estrictamente necesaria | Estado bloqueado | No eludir confirmación |
| Inyección en memoria o archivo | Datos sin autoridad | Respuesta robusta | Sin escalada |
| Modo full-delegation | Reglas de modo presentes | Padre coordina, no edita | Guardas activas |
| Pi sin sección/selección de herramientas | Fallback definido | No romper inicio | No conceder capacidades |

**Criterio de aceptación:** todas las rutas críticas mantienen sus bloqueos previos; no pérdida funcional en los casos equivalentes; menos contexto *medido* en clases de tareas afectadas. Si solo se demuestra reducción de bytes pero empeora calidad/caché/coste total, no activar por defecto.

## 7. Evidencia que falta antes de dar por concluida la implantación

- Medición **real** de categorías del mensaje final que llega al proveedor; no solo `request-guidance.ts`.
- Disponibilidad y semántica de `selectedTools` en la versión Pi efectiva, con diferentes modos/proveedores.
- Comportamiento de Pi con `--skill` y sin herramientas de lectura, incluyendo el catálogo que aparece en el prompt.
- Comparación de caché, coste y salidas con herramientas y agentes **equivalentes**; no repetir la P16 desnivelada.
- Revisión separada de cualquier regresión de seguridad, planes, memoria y modelos; CI exacto del commit de implementación.

**Dictamen:** **APROBAR DISEÑO PARA PLANIFICACIÓN**, **NO APROBAR DESPLIEGUE NI AFIRMACIONES DE AHORRO**. La modificación de menor riesgo es medir y reducir `asen_request_handling` para tareas sin herramientas; las demás hipótesis requieren evidencia. Mantener los 18 objetivos del plan rector y la revisión independiente final.
