# ASEN — Auditoría detallada de código, 18 objetivos y siete mejoras CTX

**Fecha:** 20/11/2026. **Versión:** 1.0. **Alcance:** [PR #61](https://github.com/asenbanskaliev/ASEN/pull/61), rama `feat/flujo-de-agentes-20261115`. **SHA de código inspeccionado:** `daa250a80b58d80c48336ac017deaf8e68cc396c`. El SHA de los documentos que publiquen esta auditoría será posterior y **no heredará** sus comprobaciones de CI.

**Dictamen:** revisión estática de rutas productivas, pruebas presentes, planes, comentarios de revisión y **registros reales de Actions**. No se ejecutaron pruebas localmente, no se llamó a modelos, no hubo revisión independiente. Una función presente no equivale a llamada ejecutada, un ensayo simulado no equivale a proveedor autenticado y un informe de evidencia no equivale a aceptación.

**Fuentes de planificación:** [rector E0–F, 18 objetivos](../../odd/tasks/flujo-de-agentes-plan-implantacion-4.9.0.md) y [plan operativo CTX](../plan-final-opt-contexto-y-agentes-2026-11-20.md). La comparación externa P16 solo acredita **18 sesiones de solo lectura con carga asimétrica**, no equivalencia funcional completa.

## 1. Evidencias observadas: qué es real y qué está pendiente

Clasificación: **C** = código visible; **T** = prueba presente (sin ejecutar en esta auditoría); **V** = ensayo autenticado limitado ya documentado; **CI** = resultado GitHub comprobado en SHA fijado; **P** = propuesta sin prueba.

- **C:** `planOddRoute`, `buildOrchestrationPlan`, `dispatchNextPlanTask`, `launchParentApprovedWorkers`, `AgentNotificationJournal`, `TaskAgentTodoReconciler`, `startDualRejudgment`, `projectMemoryContext` y `selectSkills` ya existen. Reutilizar estas rutas; no crear segundos motores.
- **T:** hay pruebas de rutas ODD, supervisión de tareas, perfiles, memoria, skills nativas y revisión. Su presencia **no demuestra** la ejecución completa por un modelo real.
- **V:** la serie P16 recibió respuestas reales en **solo lectura**; es limitada porque no incluyó la orquestación externa completa, herramientas, Writers, memoria, revisión ni autorizaciones de un flujo integral.
- **CI, bloqueo real en `daa250a8`:** [Phase 0 Architecture, ejecución 44824200893](https://github.com/asenbanskaliev/ASEN/actions/runs/44824200893) **failure**; [CI, ejecución 44824200603](https://github.com/asenbanskaliev/ASEN/actions/runs/44824200603) incluye **failure** en arquitectura, pruebas Linux, Windows y megatanda T02–T10/T11; Release Gate/Pi 1.2 registraron `success` de trabajos separados. Nunca elevar esos éxitos a un CI global verde.
- **Revisión histórica:** las observaciones sobre `flow-closure-evidence.ts` (comparación por booleano verdadero, arrays nulos y entrada A/B no iterable) aparecen **corregidas en el SHA inspeccionado**, mediante `!==true` y `Array.isArray`. El flujo de NVIDIA de una sola ejecución ya invoca `scripts/t12-pi-retry-settings.mjs`. No reabrirlas sin una nueva prueba roja.

## 2. Bloqueo real antes de tocar la optimización: G0

### G0-A — Referencias externas rechazadas por la arquitectura

**Prueba directa:** registros del trabajo `architecture`, ID `136592492799` y `136592550360`, ejecutan `node scripts/audit-upstream-boundary.mjs` y muestran `External reference in tracked tree`, con seis rutas: flujo y lanzador P16, su informe y tres documentos de optimización/auditoría. El auditor `scripts/audit-upstream-boundary.mjs` prohíbe expresamente referencias externas fuera de documentos de procedencia **exactamente autorizados** o recursos con huella fijada. El rechazo no viene del ejecutor de modelos.

**Adaptación segura necesaria:** revisar las seis rutas en el log, separar **documentación de procedencia** de **código ejecutable** y comprobar que cada excepción sea de **ruta exacta**, con revisión del origen y, donde haya scripts/workflows, huella de blob exacta inmutable. Evaluar si trasladar referencias de estudios a documentos de procedencia existentes resuelve el problema. Nunca permitir un directorio entero, desactivar el detector, ignorar todos los .md ni cambiar la regla solo para poner CI verde. Si una excepción no es justificable, retirar esa referencia o bloquear su uso. Volver a ejecutar Phase 0 y arquitectura del **nuevo SHA**. **Estado:** `BLOQUEANTE`; la decisión sobre una excepción necesita revisión humana/independiente.

**Efecto en el plan:** se permite preparar matrices y pruebas de **solo lectura**, pero **CTX-1/2 no cambia el comportamiento productivo** hasta aprobar G0.

### G0-B — Prueba T06 incompatible con la forma actual de la condición

**Prueba directa:** `tests/t06-github-workflow-boundary.test.ts`, último caso (aprox. L163–L175), exige el texto literal `if(!githubReview)`. El productor actual `scripts/t06-native-independent-review.ts` tiene `if(!githubReview&&!automaticReview)`, más dos rutas de comprobación `requireLiveT06GithubReviewerApprovals` para el modo de revisión GitHub. En Linux y Windows aparece fallo en `T06 no activa revisores por PR ni reintento y conserva T08 separado`. **La diferencia de expresiones no prueba por sí sola un bypass.**

**Adaptación segura:** definir primero la tabla de verdad de `githubReview`, `automaticReview`, replay, consentimiento y proveedor. Construir tests sobre **comportamiento** y rechazo de rutas inválidas. Mantener validación real de aprobaciones antes de consumir proveedor. Si la expresión actual cumple toda la tabla, reparar **solo el test frágil**; si hay bypass demostrado, corregir la rama mínima del productor con RED/GREEN. Sin tocar proveedores durante la prueba. **Estado:** `BLOQUEANTE` para CI final, no afirmar vulnerabilidad antes de la prueba.

### G0-C — El estado final debe ser del mismo commit

Los informes de `44824200893` y `44824200603` pertenecen a `daa250a8`. Cualquier commit de documentación necesita nueva verificación. Para pasar G0: Phase 0, arquitectura, pruebas focalizadas afectadas, suite CI del SHA y sin `FAIL` críticos. Los resultados omitidos no se convierten en aprobados.

## 3. Auditoría individual de los 18 objetivos

La columna «observado» distingue **existe** de **certificado**. El plan no debe abrir un objetivo nuevo cuando solo faltan pruebas de aceptación.

| N.º | Código actual y evidencia (C/T) | Qué adaptar exactamente | Prueba de cierre / fase | Dictamen |
| --- | --- | --- | --- | --- |
| **01 Decidir directo o delegar** | `src/flow/odd-routing.ts:168–184` emite ruta; `src/orchestration/orchestrator.ts:85–138` prepara plan; guía textual en `src/runtime/ui/request-guidance.ts` | **No segundo clasificador.** Probar que la decisión del anfitrión y el mensaje al modelo no discrepan, en tarea pequeña, ambigua, riesgosa y con estado activo | `tests/organic-work-unit-guidance.test.ts`, pruebas Pi de ruta y modo; E1B | **Parcial: ajustar composición y probar** |
| **02 Modos orgánico/completo** | `src/runtime/lifecycle/profiles.ts:4,15–29` persiste ambos modos; `orchestrator.ts:122–135` y `plan-dispatcher.ts` delimitan escritor | Mantener perfil/session binding; comprobar cambio de perfil entre lectura, autorización y ejecución, así como migración y reinicio | `tests/e1-full-delegation-direct-dispatch.test.ts`, `tests/e1-delegation-mode-runtime.test.ts`; E1B | **Existe, falta aceptación real** |
| **03 Explorer proporcional** | `src/runtime/agents/explorer-budget.ts:2–3,23–69` umbral 3 lecturas/40 KiB; `src/agents/pi-agent-tools.ts:64–120` exige modelo y sesión | No delegar por la mera existencia de herramientas. Registrar causa/presupuesto y evitar dos Explorer al mismo tiempo | `tests/megatanda-a-explorer-runtime.test.ts`, ejecución Pi acotada; E1A/E1B | **Existe, falta utilidad y consumo real** |
| **04 Unidades y dependencias** | `src/orchestration/executable-plan.ts` y `src/runtime/lifecycle/plan-dispatcher.ts:111–140` conservan dependencias y prioridades | Probar descomposición por **comportamiento**, no cantidad de archivos; preservar la tarea completa al pasar a Worker | `tests/executable-plan-candidate-propagation.test.ts` + plan con 2 tareas independientes y 1 dependiente; E1B | **Estructura presente; criterio real parcial** |
| **05 Dos Writers simultáneos** | `src/runtime/agents/parallel-parent-supervisor.ts:19–40,102–217` y `parallel-worktrees.ts:67–162` preparan hijos; cada unidad declara `fresh-per-worker-confirmation-required` | **No confundir aprobación del lote con concesión ejecutable de cada hijo.** Medir dos procesos Pi auténticos solapados; si Pi no ofrece permiso derivado verificable, mantener consentimiento individual | `tests/parallel-worktree-todos.test.ts` + observación de 2 procesos, ámbito y consentimientos; E2A | **Base presente, lote único no demostrado** |
| **06 Ampliación de rutas** | `src/runtime/lifecycle/route-command.ts:45–63` responde `needs-scope-approval`; `plan-dispatcher.ts:45–85,155–177` comprueba candidato y permiso | Un cambio de superficie invalida consentimiento anterior. Contrastar aceptación y rechazo **después** de deriva Git | `tests/plan-dispatcher-candidate-guard.test.ts` y negativos de rutas; E2A | **Barreras presentes; diálogo real pendiente** |
| **07 Entrega terminal única** | `src/runtime/agents/agent-notification-journal.ts:12–21,85–140` estados duraderos; `agent-terminal-delivery.ts:15–46` distingue activo, reposo y sin interfaz | No añadir otro diario. Verificar transiciones y acuse ante padre ocupado, aviso repetido, cancelación y reinicio | `tests/agent-notification-journal.test.ts`, `tests/agent-terminal-delivery.test.ts` y Pi real; E2B | **Existe; certificar extremo a extremo** |
| **08 Continuidad tras error** | `src/runtime/agents/task-agent-reconciler.ts:11–95` trata resultado incierto; `src/runtime/lifecycle/plan-advance-queue.ts` agrupa señales | Avanzar **solo** unidades independientes permitidas; no relanzar Writer dudoso. Probar dependencia y notificación en segundo plano | `tests/megatanda-b-parallel-runtime.test.ts`, reinicio, caída y 429; E2B | **Conectado parcialmente; escenario real pendiente** |
| **09 Fallback de modelos** | `src/runtime/lifecycle/model-fallback-policy.ts:14–17,73–104` limita 8 y espera 30/2 min; `parent-model-fallback.ts` adapta turno | Distinguir 429, credencial inválida, cuota, fallo antes/después de escribir y coste `unknown`; no aplicar fallback a escritura incierta | `tests/model-fallback-policy.test.ts`, fallos Pi/provider con autorización; E1A/E2B | **Existe; aceptación por proveedor pendiente** |
| **10 Modelo principal del perfil** | `src/runtime/lifecycle/startup-orchestrator-model.ts:33–75` valida identidad/catálogo y retorno; `profiles.ts` selecciona rutas | No imponer tarifa cero a modelo ya configurado; comprobar selección **observada** y no cambiar sesión reanudada; diferenciar modelo elegido del efectivamente usado | `tests/startup-orchestrator-model.test.ts` y proveedor real; E1A | **Código operativo parcial; prueba de identidad pendiente** |
| **11 Verificación según riesgo** | `src/flow/odd-routing.ts:114–154` infiere seis riesgos; `src/review/review-assessment-policy.ts:44–78` devuelve `independentVerifier` | Trazar consumidor efectivo de la evaluación y guardia de escalado para las seis categorías; no bastan marcadores informativos | `tests/megatanda-c-review-policy.test.ts` + seis negativos de omisión; E3 | **Reglas existen; trazabilidad/uso real pendiente** |
| **12 Revisión ordinaria** | `src/review/ordinary-review-command.ts` controla candidato, rutas y sesión; `src/runtime/lifecycle/review-acceptance.ts:79–163` exige recibo/aceptación | Confirmar un único candidato fijo a través de vista, juez, pausa, reanudación y decisión; no aceptar solo porque terminó un agente | `tests/ordinary-review-assessment.test.ts` y ensayo de reinicio; E3 | **Existe; cierre real no acreditado** |
| **13 Doble juez y corrección** | `src/review/judgment-day.ts:21–54` exige jueces distintos y sin aceptación automática; `src/review/dual-rejudgment.ts:6–23` máximo 2 rondas | Integrar recepción de hallazgos con Fix autorizado; validar discrepancia, persistencia y bloqueo de tercera ronda, también tras caída | `tests/judgment-day.test.ts`, `tests/dual-rejudgment.test.ts` y revisión autenticada; E3 | **Contratos presentes; aceptación no probada** |
| **14 Preguntar lo imprescindible** | `src/runtime/lifecycle/natural-plan-tool.ts:22–68` produce respuesta natural; `plan-dispatcher.ts:197–210` bloquea aclaración | Comprobar una sola consulta material, respuesta posterior y cancelación; texto libre jamás se convierte en autorización | `tests/natural-plan-tool.test.ts`, prueba de Clarifier/espera/retorno; E1B | **Parcial; cadena de respuesta pendiente** |
| **15 Seguridad y Git** | `src/runtime/lifecycle/plan-dispatcher.ts:45–85,155–184` valida SHA/ámbito; `src/runtime/agents/parallel-worktrees.ts` valida worktree | **Primero reparar G0/CI** con causa concreta. Mantener las barreras y repetir negativos para PR exacta; no suavizar aislamiento externo | `tests/plan-dispatcher-candidate-guard.test.ts`, Phase 0, CI Linux/Windows/macOS; E0/E2/F | **Bloqueado por CI del SHA inspeccionado** |
| **16 Medición y A/B** | `src/review/agent-flow-ab-comparison.ts:62–99` exige contexto comparable; `agent-flow-ab-series.ts:29–84` agrega series. P16 tiene 18 sesiones **sin agentes** | Separar P16 parcial de A/B de motores completos. Hacer **ASEN anterior vs ASEN optimizado** (CTX-5); ensayo externo 4.9.0 separado y comparable; medir hijos, caché y precio verificable | `tests/agent-flow-ab-comparison.test.ts`, ≥3 réplicas por escenario de referencia; E4 | **Autenticación de lectura parcial, paridad NO** |
| **17 Recorrido integral** | `src/runtime/agents/flow-closure-evidence.ts:113–171` recibe testigos de Writers/revisión y devuelve `evidence-ready-for-independent-audit`, no aceptación | No convertir un JSON arbitrario en autoridad: verificar contra recibos de Pi, aprobación, procesos, SHA y resultados externos; los arreglos de arrays y `!==true` ya están en HEAD | `tests/agent-ab-combined-gate.test.ts`, dos Writers reales + dos revisiones + aprobación; E4/F | **Informe de evidencia, no E2E certificado** |
| **18 Compatibilidad Pi** | `src/runtime/pi-host.ts:5–16` mínimo 1.2.0; `package-lock.json` fija Pi **1.2.0**; `flow-closure-evidence.ts:8–16,79–108` exige matriz exacta 1.2.0 | Distinguir «versión mínima aceptable», «versión instalada», «versión de aceptación». Las 12 celdas son **3 sistemas operativos × 4 modos**, **no** 3 productos. Pi 1.5.x requiere evidencia propia sin rebajar matriz 1.2 | `tests/pi-host-compatibility-matrix.test.ts`, Linux/Windows/macOS + TUI/RPC/JSON/print; E0/E2/F | **Parcial; matriz viva por versión pendiente** |

**Nota:** los nombres de pruebas y rutas indican cobertura diseñada, no una afirmación de que todas estén verdes en `daa250a8`. El estado `IMPLEMENTED` se decide por código conectado; `LIVE_AUTHENTICATED` por evidencia del proveedor y `ACCEPTED` tras aceptación válida.

## 4. Auditoría individual de CTX-0 a CTX-6

| CTX | Adaptar sobre el código realmente existente | Dependencia lógica | Condición de aceptación |
| --- | --- | --- | --- |
| **0 — Medir** | Instrumentar `before_agent_start` **sin alterar** contenido; contabilizar por sección `request-guidance.ts`, permisos, memoria, plan, catálogo y declaraciones, con parent/hijos separados; Pi 1.2 fijo | G0-A/B diagnosticados; pruebas offline pueden prepararse aunque CI esté rojo | Métricas de ensamblado y observación final diferenciadas; sin prompts/logs privados; línea base por SHA |
| **1 — Herramientas activas** | `extensions/asen.ts:1205–1235` usa `!!pi.registerTool`: es **capacidad de registro**, no selección activa. `selectedTools` del evento es candidato a fuente pública, por verificar en SDK | CTX-0 + G0 verde para cambiar producción | Test `selectedTools` ausente/vacío/activo, caso plan activo sin herramientas; nunca quitar instrucciones de recuperación o seguridad por tener cero herramientas |
| **2 — Núcleo y módulos** | `src/runtime/ui/request-guidance.ts` mezcla reglas de código, exploración, plan, permisos, continuación y cancelación en una guía fija | CTX-1 con compatibilidad demostrada | Matriz «regla → función → guardia ejecutable → caso de carga». Al faltar guardia, conservar regla en núcleo; sin segunda IA clasificadora |
| **3 — Duplicados** | La memoria `projectMemoryContext` y el resumen `formatActivePlanContext` ya están acotados; los hijos usan `--no-skills` + `--skill` exactos | CTX-0/2 prueban redundancia concreta | `NO_APLICAR` si no hay duplicado. Si lo hay, quitar SOLO el par repetido sin reducir memoria arbitrariamente, sin romper lectura de skills o reinicio |
| **4 — Herramientas ocultas** | No se observó una API de ocultación equivalente en Pi 1.2.0 instalada | Opcional tras CTX-0/5 | `POSPONER` por defecto; admitir solo con API pública y pruebas de disponibilidad, seguridad, resultados y ahorro neto |
| **5 — A/B** | `compareAgentFlowAB` existente exige hashes de contexto/herramientas/permisos; P16 histórico no incluye orquestación completa | CTX-2 y CTX-3 si aplica, tras G0–G4 | A/B **interno ASEN** por parejas antes/después; externa 4.9.0 separada; mismos escenarios y capacidades, calidad y tokens por hijo, coste `unknown` si no hay factura |
| **6 — Activación y reversión** | No introducir nuevas migraciones de datos ni estados para elegir guía. Variante anterior debe seguir disponible | CTX-5 y revisión independiente | Medición favorable, 0 regresiones P0, CI exacto, interruptor reversible, continuación de tareas preexistentes sin segunda autorización inventada |

**Hallazgo de lógica de CTX-1 (P0):** el borrador decía «sin herramientas → guía extensa ausente». Eso **no es suficiente**: incluso sin herramientas seleccionadas pueden existir un plan activo, una cancelación, una sesión reanudada o una prohibición de escritura. Separar «instrucciones para llamar a una herramienta» de «obligaciones que el modelo necesita conocer» y conservar estas últimas.

**Hallazgo de lógica de CTX-3:** un catálogo de skills disponible para Pi no equivale a la lectura completa de cada `SKILL.md`. La prueba actual de `get_commands` confirma registro, no consumo del contenido en cada turno; las pruebas nuevas deben distinguir ambos estados.

## 5. Dependencias, conflictos y trabajos sin duplicación

1. **Pre-G0:** resolver control de arquitectura por referencias exactas; después investigar T06 con tabla de verdad. Se pueden estudiar ambas causas en paralelo, pero **ningún agente edita el mismo archivo** y la integración es secuencial. El CI final debe pasar en el mismo SHA.
2. **E0 + CTX-0:** con el bloqueo diagnosticado, medir ensamblado sin proveedor y crear las pruebas de CTX-1. No se inicia ningún A/B pagado.
3. **E1A + E1B:** modelos/perfiles/ruta funcional por una sola intervención a `extensions/asen.ts` a la vez. CTX-1/2 se ejecutan después de integrar esos cambios, para no mezclar seguridad funcional y reducción de texto.
4. **E2A/E2B:** reutilizar `parallel-parent-supervisor`, worktrees, diario y reconciliador. El plan no debe prometer **un permiso único operativo para todos los Workers**: es objetivo condicionado a capacidades verificables de Pi. Si no hay concesión derivada por hijo, conservar permiso individual.
5. **E3:** riesgos nombrados → verifier cuando el host lo conecte, revisión de candidato único → doble juicio → Fix autorizado; no inferir aceptación de `analysis-complete`.
6. **E4:** dos ensayos separados, uno de eficiencia **dentro de ASEN** y otro de equivalencia con la referencia externa; no comparar cifras asimétricas de P16. Incluir consumos de todos los agentes.
7. **F:** verificar exactitud SHA, tres plataformas, seguridad, auditor distinto, versión Pi realmente usada y ausencia de hechos `UNKNOWN/SKIP` presentados como éxito. No fusionar.

**Orden corto y sin retoques innecesarios:** `PRE-0 → PRE-1 → G0 → CTX-0 → CTX-1 → CTX-2 → CTX-3 si está justificado → CTX-5 → CTX-6`. `CTX-4` es opcional; en paralelo quedan E1–E3 **solo en archivos independientes**. Los 18 objetivos originales conservan sus propias puertas de validación.

## 6. Auditoría de coherencia documental: correcciones obligatorias al plan

| Contradicción o ambigüedad observada | Regla única que debe tener el plan |
| --- | --- |
| «Preparado para implantar» cuando G0 está rojo | **Preparado para diagnóstico offline**, NO autorizado para cambiar composición en producción hasta resolver G0 |
| «Sin ensayos reales» en antiguas matrices para P16 | Hay **ensayo real limitado de lectura**; NO paridad ni prueba integrada de agentes |
| Aprobación de lote tratada como permiso de escritura | **No**: `fresh-per-worker-confirmation-required` prevalece hasta prueba de Pi que admita concesiones individuales |
| «Pi ≥ 1.2» confundido con «evidencia Pi 1.2 en todos los SO» | Host acepta versiones desde 1.2; el paquete está fijado en 1.2; los recibos de cierre son exactos de 1.2 y la versión futura necesita matriz |
| Comparador de tareas tratado como medidor del contexto | `P32` mide porcentaje de **ventana**; `CTX` mide composición, tokens, caché y coste si observable |
| «Herramientas ausentes → ninguna regla» | Conservar reglas críticas de permisos, recuperación y estado aun cuando `selectedTools=[]` |
| «Tres sistemas» ambiguo | Para Pi18 son tres **sistemas operativos**; para comparación P16 son dos productos distintos |
| Estado `reviewed` o `analysis-complete` tratado como aceptación | Sólo `ACCEPTED` con recibos y permiso exacto |
| Excepciones al control de referencias externas añadidas globalmente | Nunca ignorar carpetas completas; solo procedencia exacta autorizada y elementos ejecutables con huella/scope revisados |
| Trabajos repetidos entre OPT, CTX y E | **CTX-0…6** son un único conjunto transversal; E0–F mantiene las 18 capacidades. No crear 7 objetivos nuevos de paridad |

## 7. Pruebas negativas adicionales que faltaba distinguir

| ID | Caso crítico | Resultado obligatorio |
| --- | --- | --- |
| **N01** | `selectedTools=[]` pero hay plan bloqueado y «continúa» | El sistema no olvida estado, permisos ni recuperación |
| **N02** | Cero herramientas y solicitud de cancelación de plan | No interpreta ausencia de herramientas como permiso de ignorar la cancelación |
| **N03** | Mismo texto con modo `organic` y `full-delegation` | Sólo el padre permitido puede ejecutar una operación directa |
| **N04** | Revisor sin acceso efectivo a `SKILL.md` | Bloqueo o fallo informado; no alegar skill ejecutada solo por catálogo |
| **N05** | Dos procesos Writer iniciados bajo aprobación de lote sin consentimiento individual verificable | No arrancan; conservar autorización por hijo |
| **N06** | Informe T17 contiene arrays null o `"false"` en campos booleanos | Informe `blocked`, sin excepción ni falsa aceptación |
| **N07** | P16 o prueba de proveedor con 429 y cero reintentos autorizados | Pi reintenta **cero** veces, incluidos reintentos ocultos; validar configuración antes del launch |
| **N08** | Referencia externa en script/doc nuevo no aprobado | Control de arquitectura falla, no se desactiva para pasar CI |
| **N09** | T06 en modo revisión GitHub, revisión automática y ambos activos | Aprobación doble real y reglas separadas; rama alternativa no permite bypass |
| **N10** | Trabajo sobre Pi 1.5.x con prueba 1.2 exitosa | Compatibilidad de la nueva versión = `UNKNOWN` hasta matriz propia |
| **N11** | Reinicio con guía nueva y Writer incierto anterior | Nunca relanzar escritura por cambiar de modo de composición |
| **N12** | Sección de contexto cambia en cada turno | Calcular caché real, no anunciar ahorro por caracteres únicamente |

## 8. Veredicto y estado declarado

- **Auditoría de código y de CI:** **COMPLETADA DOCUMENTALMENTE** sobre SHA `daa250a8`; causas de los dos fallos principales **identificadas** por registros reales.
- **Aplicación en el plan:** requiere actualizar el plan operativo, el rector y el estado de los 18 objetivos; no corregir código de producción ni pruebas sin nueva unidad de trabajo.
- **Permitido ya:** lecturas, inventario, pruebas simuladas y diseño de test de CTX-0. No iniciar proveedor.
- **Bloqueado:** optimización de guía activa, permiso de lote supuesto, afirmaciones de ahorro, paridad completa, aceptación y merge mientras G0/CI no esté verde y falten pruebas.
- **Cierre:** `globalFull:false`, `G0: BLOQUEADO`, `CTX-0: PREPARABLE_SOLO_DIAGNÓSTICO`, `CTX-1…6: PENDIENTES`, `objetivos 01–18: SIN CIERRE INTEGRAL`.

**Fuente de verdad:** el código y las acciones del SHA de referencia. Las anotaciones y documentos anteriores no prevalecen sobre la evidencia comprobada.
