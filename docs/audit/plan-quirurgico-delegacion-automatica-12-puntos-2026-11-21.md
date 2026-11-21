# ASEN — Auditoría del informe avanzado y plan quirúrgico de delegación automática (12 puntos)

**Fecha de corte:** 21/11/2026. **Estado:** diseño y auditoría documental; NO acredita implantación, mejora de rendimiento ni aceptación funcional. **Base de código inspeccionada:** [PR #61, SHA 8b62891f](https://github.com/asenbanskaliev/ASEN/tree/8b62891f2545f5053b065220154f03ddd8bdac29). **Base documental:** [PR #76, SHA 79968587](https://github.com/asenbanskaliev/ASEN/pull/76). **Coordinación:** [issue #63](https://github.com/asenbanskaliev/ASEN/issues/63). La rama de este documento es apilada sobre #76: no altera #61 ni main.

**Objetivo aprobado por el usuario:** en modo normal, ASEN decide automáticamente cuándo trabajar directamente y cuándo emplear agentes, sin preguntar qué modo escoger en cada petición. Modo completo opcional por perfil. **El objetivo no confiere escritura, uso de modelos ajenos al perfil, publicación ni fusión.**

**Alcance:** 12 recomendaciones de la investigación avanzada; son un complemento transversal, NO 12 objetivos adicionales ni sustituyen la matriz original 01–18, E0/E1A/E1B/E2A/E2B/E3/E4/F, CTX-0…6 y G0…G6. Prioridad normativa: fuente real del SHA, contratos de Pi, seguridad y plan rector. Ante contradicción, prevalece la ejecución verificable y una prueba negativa.

## 1. Dictamen crítico del informe avanzado

El informe aporta una dirección acertada —delegar solo cuando aporta valor—, pero su **tabla principal enumera diez puntos, pese a titular doce** y algunas propuestas contradicen el código o sus barreras. No trasladar literalmente las siguientes afirmaciones:

| Hallazgo | Contraste verificable | Resolución |
| --- | --- | --- |
| «ASEN no tiene reglas programadas de ruta» | [odd-routing.ts, 168–181](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/flow/odd-routing.ts#L168-L181) decide direct/plan/orchestrate/incident/verify con riesgo, contexto y revisión; faltan causas ejecutables para paralelismo por unidad | AMPLIAR, no sustituir |
| «Usar número de archivos o tamaño para decidir» | [Gentle #1587](https://github.com/Gentleman-Programming/gentle-shell/issues/1587) y [Gentle #1731](https://github.com/Gentleman-Programming/gentle-shell/issues/1731) discuten el sobrecoste de estos atajos | DESCARTAR conteos como motivo único; usar independencia, investigación, contexto y riesgo |
| «Explorer carece de presupuesto» | [explorer-budget.ts, 1–67](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/agents/explorer-budget.ts#L1-L67) mide 3 consultas y 40 KiB, marca una recomendación y evita doble reclamación; NO lanza automáticamente | MANTENER telemetría; conectar activación útil y comprobable |
| «No existen tareas/dependencias» | [plan-dispatcher.ts, 110–149](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/lifecycle/plan-dispatcher.ts#L110-L149) filtra dependencias y reclama una tarea; falta derivar varias unidades funcionales desde una petición | REUTILIZAR almacén y grafo; ampliar preparación |
| «Crear sesiones con session.run() / runChildAgent()» | El informe no acredita esas API como contrato público Pi en ASEN; los lanzamientos se someten a [Dispatcher y autorización](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/lifecycle/plan-dispatcher.ts#L155-L193) | DESCARTAR llamadas inventadas; validar contrato Pi 1.2.0 y adaptar lo mínimo |
| «El segundo agente solo lee: error de Writer» | [extensions/asen.ts, 683–702](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/extensions/asen.ts#L683-L702) restringe **el segundo despacho automático de ese camino a lecturas**. Existe supervisor aparte y [test de dos Writers con ejecutor simulado](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/tests/e1-full-delegation-direct-dispatch.test.ts#L105-L109) | BRECHA de integración automática, no prueba de incapacidad para dos Writers |
| «No hay aislamiento de archivos» | [parallel-worktrees.ts](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/agents/parallel-worktrees.ts) y [parallel-parent-supervisor.ts](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/agents/parallel-parent-supervisor.ts) ya contemplan carpetas Git separadas y ámbitos exactos | MANTENER y demostrar equivalencia integrada, no crear aislamiento paralelo nuevo |
| «Copiar token de escritura a cada hijo» | [plan-dispatcher.ts, 155–190](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/lifecycle/plan-dispatcher.ts#L155-L190) requiere confirmación individual, SHA exacto y comprobación de identidad | **PROHIBIDO** copiar/reutilizar credenciales; solo concesiones de un solo uso derivadas del lote si Pi puede verificarlas, o confirmación individual |
| «No hay registro, deduplicación ni continuidad» | [plan-advance-queue.ts](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/lifecycle/plan-advance-queue.ts) almacena señales; [supervisor](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/agents/parallel-parent-supervisor.ts) reclama intentos de forma durable; [agent-terminal-delivery.ts](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/agents/agent-terminal-delivery.ts) distingue padre ocupado/libre | MANTENER; cubrir fallos y reinicio Pi reales, sin repetir Writer incierto |
| «Verifier se lanza siempre después de Writer» | [orchestrator.ts, 170–175](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/orchestration/orchestrator.ts#L170-L175) lo incluye cuando la decisión exige verificación independiente | REFORZAR cumplimiento ejecutable de las seis causas de riesgo, no crear otro verificador |
| «Todos los hijos reciben contexto completo» | No se aportan trazas concretas de la sesión hija ASEN que lo acrediten; [CTX-0/CTX-2](https://github.com/asenbanskaliev/ASEN/blob/79968587c568bb0094d4cb4bbc9fe635b94a591f/docs/plan-final-opt-contexto-y-agentes-2026-11-20.md) ya definen diagnóstico y modularidad | TRATAR COMO HIPÓTESIS y medir antes de eliminar bloques |
| «No hay pruebas reales» | [prueba E2B](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/tests/e1-full-delegation-direct-dispatch.test.ts#L105-L109) usa archivos reales pero proveedor simulado; existe replay externo de [17 casos de dos candidatos](https://github.com/asenbanskaliev/ASEN/actions/runs/44794317489), que NO prueba orquestación real completa | SEPARAR unitarias, ejecutor simulado, replay, Pi autenticado, aceptación E4 y A/B |

**Hallazgo añadido:** líneas del plan histórico de CTX dicen «prueba no existe» o «G0 bloqueado» en cortes antiguos; la situación vigente solo se determina por último SHA y [#63](https://github.com/asenbanskaliev/ASEN/issues/63). No convertir diagnóstico histórico en nuevo bloqueo ni CI verde en aceptación.

## 2. Matriz óptima y completa de los doce puntos

**Leyenda:** MANTENER = no reescribir; MEJORAR = ampliar mínima ruta; CONDICIONAL = solo si la capacidad/medición lo demuestra; DESCARTAR = no implantar. Las pruebas son criterios de aceptación futuros, no resultados.

| Nº | Contraste ASEN / Gentle / otra opción | Decisión quirúrgica para ASEN | Intervención mínima y prueba | Estado |
| --- | --- | --- | --- | --- |
| **01. Modos** | ASEN ya tiene perfiles y bloqueo real; Gentle configura organic/full por perfil; Claude delega por descripción | Organic por defecto sin pregunta; completo solo si se selecciona expresamente y sin cambios silenciosos | Conservar profiles.ts + primary-tool-policy.ts + delegation-turn-latch.ts. Test Pi: cambio de perfil al siguiente turno y escritura principal bloqueada en modo completo | MANTENER, aceptación pendiente |
| **02. Decisión automática** | ASEN tiene decisión ODD por riesgo; Gentle exige motivo útil y no cuenta archivos; Claude usa descripciones de subagentes | Añadir señales verificables de investigación necesaria, unidades independientes, capacidad real y justificación persistida | Extender odd-routing.ts y adaptación de orchestrator.ts sin dar autoridad de ejecución. Mismo pedido simple: 0 agentes; dos unidades: ruta justificada | MEJORAR, E1B |
| **03. Independencia** | ASEN planifica principalmente un Writer por ruta; Gentle admite dos unidades independientes grandes; Claude Code permite sesiones separadas | Derivar tareas por comportamiento completo (código+pruebas+docs) y dependencias explícitas, nunca por recuento de archivos | Pequeño paso de preparación en orquestador/plan existente, validación de ámbitos. Probar dos independientes + una dependiente y colisión | MEJORAR, E1B |
| **04. Explorer** | ASEN mide 3 consultas/40 KiB; Gentle usa un lote breve y resumen con rutas; OpenHands ofrece hijos con contexto separado | Mantener medición y un único Explorer por motivo, con resultado acotado y sin ejecución si información ya basta | explorer-budget.ts + enlace a herramienta activa y journal. Test umbral exacto, doble señal, sesión cambiada, proveedor no configurado | MEJORAR el enlace, E1B |
| **05. Unidades ODD** | ASEN tiene Todo, dependencias y plan; Gentle mantiene unidad de comportamiento íntegra; LangGraph usa dependencias explícitas | Crear varias unidades en el **mismo** plan durable existente, sin un segundo grafo | Preparador de plan → store Todo → dispatcher actual. Test dependencia real y una sola reclamación por unidad | MEJORAR, E1B/E2A |
| **06. Hijos automáticos** | ASEN posee supervisor con sesiones preparadas; Gentle usa subagent_run cuando disponible; OpenHands lanza mediante herramienta de tarea | Verificar API Pi 1.2.0 y abrir solo hijos aprobados con identidad y ámbitos independientes. Si falta capacidad: CAPABILITY_BLOCKED | Adaptación mínima supervisor/dispatcher, no session.run inventado. Test dos procesos reales y rechazo si no existe receptor Pi válido | CONDICIONAL, E2A |
| **07. Dos Writers** | ASEN cuenta con límite de dos agentes y worktrees; Gentle paraleliza solo independientes; Claude ofrece aislamiento por carpeta Git | Permitir despacho automático de dos **Writers autorizados** por ruta segura propia del supervisor; solape temporal demostrado | Reutilizar parallel-parent-supervisor.ts, parallel-worktrees.ts, guardias de superposición. Test dos Pi autenticados, ámbitos distintos, uno falla, colisión negativa | MEJORAR/ACREDITAR, E2A |
| **08. Permisos** | ASEN exige SHA/ámbito/una confirmación por Writer; Gentle delimita superficies; LangGraph prevé interrupción humana | No compartir credenciales. Optimizar preparación de propuesta de lote; **concesión derivada** solo si Pi soporta vínculo verificable y consumo individual atómico | Conservar plan-dispatcher.ts y políticas; pruebas: rechazo, cambio SHA, ámbito extra, caducidad, repetición, sin UI. Si no existe capacidad, mantener confirmación individual | MANTENER/CONDICIONAL, G1/E2A |
| **09. Continuidad** | ASEN ya encola y registra eventos; Gentle entrega al padre al quedar listo; LangGraph separa estados persistidos y reanudación | Despertar por evento terminal, respetar tareas listas; jamás repetir una escritura de resultado incierto | plan-advance-queue.ts, journal y reconciliador existentes. Test caída tras claim, señal duplicada, padre ocupado, cancelación, dependiente bloqueada | MEJORAR/ACREDITAR, E2B |
| **10. Verificación** | ASEN tiene verifier condicionado a decisión; Gentle solo añade segundo agente por riesgo nombrado; OpenHands permite etapas especializadas | Tests del autor siempre; verificador independiente si riesgo nombrado o verificación solicitada; juez/revisión ordinaria separados | Conectar review-assessment-policy.ts a ejecutor existente, sin segunda máquina de revisión. Test riesgos 1–6, riesgo medio sin Verifier extra y veto a aceptación prematura | MEJORAR/ACREDITAR, E3 |
| **11. Contexto** | ASEN ya tiene selección de skills y CTX-0/1; Gentle #1587 prueba alto coste del contexto hijo; Claude aísla instrucciones por subagente | Medir prefijo de padre/hijos y luego eliminar **solo** instrucciones realmente ajenas, conservando seguridad y convenciones | CTX-2 en E1B con test de equivalencia; CTX-3 por duplicado demostrado; CTX-4 opcional en E4. Pruebas sin proveedor y A/B | CONDICIONAL, CTX-2/5 |
| **12. Aceptación** | ASEN tiene tests unitarios, proveedor simulado, replays y comparativas parciales; Gentle #1494/#1587 publica ensayos acotados; LangGraph dispone de ejecución durable | Matriz de evidencia en cinco niveles y A/B reproducible; cero éxito declarado por simulación o CI solamente | Reutilizar test y series A/B; Pi 1.2.0 3 SO × 4 modos, dos Writers+dos jueces reales, revisión y costes observados o unknown | MEJORAR/ACREDITAR, E4/F |

**Correspondencia con los 18 objetivos existentes:** 01→02; 02→01; 03→04; 04→03; 05→04; 06→05/18; 07→05/15; 08→06/15; 09→07/08; 10→11/12/13; 11→16/CTX; 12→16/17/18. No añadir 12 objetivos paralelos.

## 3. Contratos técnicos mínimos de implantación

### 3.1 Entrada y decisión (puntos 01–04)

1. La sesión Pi captura perfil, modo, herramientas realmente activas, identidad de sesión/proyecto, restricciones y modelo configurado. La política del anfitrión prevalece sobre cualquier frase de la IA.
2. Clasificar en ruta **directa**, **pregunta focalizada**, **investigación**, **plan por unidades**, **incidencia** o **verificación** con motivo trazable. La ruta no es permiso; estimaciones, número de archivos, extensión de la respuesta o tiempo no crean un Writer.
3. Una petición sencilla, clara y segura sigue directa, incluso si cambia varios archivos. Investigación adicional usa máximo tres lecturas/40 KiB observados antes de valorar un Explorer; que el aviso se active no obliga a delegar cuando ya se sabe la respuesta.
4. En modo completo la IA principal solo lee/coordina y siempre manda las escrituras a un Writer con ámbito exacto. El perfil cambia entre turnos y no a mitad de una llamada pendiente. Los hijos no heredan automáticamente permiso de padre.
5. Contrato deseado de decisión registrable: ID del trabajo + sesión/proyecto + versión de plan + hechos observados + motivo + unidades propuestas + riesgos + capacidades disponibles. **Sin token de escritura ni secreto**, validación de los mismos hechos antes del despacho.
6. CTX-2 (guía modular) solo después de pruebas negativas de seguridad y herramientas seleccionadas; mantener versión anterior reversible. La PR #78 cubre tests propuestos, NO demuestra la nueva composición productiva.

### 3.2 Descomposición y ejecución (puntos 05–08)

1. Una unidad corresponde a una función completa y sus pruebas/documentación; agrupar si los cambios comparten archivos o estado. Crear dependencias solo por causa técnica real. Una unidad dependiente espera el resultado **asentado y aceptado** exigido por su contrato.
2. **No** delegar únicamente por tener dos archivos o por duración estimada. Solo tiene sentido una ejecución paralela si hay dos unidades suficientemente independientes y el ahorro probable justifica crear dos contextos separados.
3. El almacén Todo y el despachador actuales son autoridad única. El preparador genera varias entradas con identidad estable y aristas; el supervisor obtiene de ese almacén unidades preparadas, sin fabricar un segundo plan ni reclamaciones duplicadas.
4. El planificador puede **proponer** rutas de escritura y preparar carpetas Git; no puede otorgar autoridad. El host revalida sesión, proyecto, SHA, árbol, ámbito, modelo, dependencia y confirmación antes de lanzar. Salir ante cambio de Git sin borrar trabajo ajeno.
5. Paralelismo inicial **máximo dos** Writes si están autorizados e independientes; ninguna superposición de rutas, ni directorios compartidos sin control. Los worktrees separan escrituras físicas, pero **no** prueban independencia semántica ni autorizan integración automática.
6. El permiso de lote es objetivo de comodidad, no hecho logrado: un objeto validado por el host puede conceder autorizaciones hijas **distintas, cerradas, de un solo uso**, ligadas a los mismos hechos. Si Pi no ofrece mecanismo comprobable, conservar aprobación individual. **Nunca copiar el token del padre, nunca heredar YOLO a un hijo, nunca usar texto como firma**.
7. La ejecución por defecto no crea commits finales, push, merge, despliegue ni aprobación de revisión. Si el usuario autoriza estos pasos en otro contrato, esa decisión sigue siendo separada.

### 3.3 Resultados, revisión y contexto (puntos 09–11)

1. Distinguir: planificada, reclamada, iniciada, asentada, entregada, revisada, aceptada. Una señal terminal no prueba aceptación; el aviso se entrega **una sola vez** y se conserva para padre ocupado/reinicio.
2. Fallo claro y seguro permite otras unidades independientes ya autorizadas. **Fallo de Writer con resultado incierto bloquea el reintento del Writer**: inspección de estado y Git, no reset/force/stash ni replay oportunista.
3. El Writer hace sus pruebas focalizadas y presenta evidencias; riesgo nombrado 1–6 o verificación explícita añade Verifier independiente. Revisión ordinaria, doble juicio opcional, correcciones acotadas y aceptación humana siguen contratos diferentes.
4. Medir uso real antes de cambiar instrucciones del hijo: contexto inicial, herramientas, skills, memoria, tokens de entrada/salida y caché. Retirar solo el material reservado al coordinador cuya omisión conserva pruebas y permisos. Si no se puede validar, NO APLICAR el recorte.
5. El estudio [Gentle #1587](https://github.com/Gentleman-Programming/gentle-shell/issues/1587) documenta prefijos costosos, pero sus cifras NO son ahorro medido de ASEN ni justifican quitar reglas obligatorias.

### 3.4 Evidencia y aceptación (punto 12)

Cada prueba registra: SHA exacto, rama, Pi/Node, SO, modelo y proveedor realmente utilizados, sesión y perfil, modo, herramientas activas, ámbitos, autorización, unidades/solape, decisiones, resultados de pruebas, tiempos, tokens/caché, coste observado o **unknown**, y enlaces a logs/recibos no sensibles.

Estados diferenciados: **CÓDIGO**, **PRUEBA UNITARIA**, **EJECUTOR SIMULADO**, **Pi AUTENTICADO**, **ACEPTACIÓN INTEGRAL**. Los 17 casos externos de los candidatos T06 validaron comportamiento aislado de artefactos; no validan dos procesos de Writer ASEN de extremo a extremo ni a sus jueces.

## 4. Cuatro megatandas compatibles con el plan rector (NO duplicarlas)

| Tanda | Puntos | Fase original / prerequisito | Cambios estrictos y propiedad de archivos | Puerta medible |
| --- | --- | --- | --- | --- |
| **DA-A — decisión** | 01–04 + parte 11 | E1B, después de E1A necesario; CTX-2 en serie | Solo pruebas y cambios focalizados en odd-routing.ts, orchestrator.ts, request-guidance.ts y explorer-budget.ts; respetar la unidad B/#78 de CTX-2 y las reservas #63 | 6 situaciones: directa, investigación útil, incertidumbre, alto riesgo, modo completo, cambio de perfil; 0 escritura sin permiso |
| **DA-B — unidades e hijos** | 03,05–08 | E2A; DA-A con puertas de seguridad aprobadas | Extensión pequeña del preparador de tareas, dispatcher y supervisor/aislamiento existentes. Nada de nuevo motor ni API Pi inventada | 2 Writers Pi autenticados, solape observado, 2 ámbitos y permisos separados; colisión/rechazo/SHA inválido bloqueados |
| **DA-C — recepción y revisión** | 09–10 + parte 11 | E2B y E3; #77 trabaja ya la prueba negativa E2B; CTX-3 solo por evidencia | Reconciliador, cola de avance, diario y política de revisión actuales; no rehacer doble juicio | 1 entrega por resultado, continuidad segura, nunca repetir Writer dudoso, riesgos 1–6 disparan Verifier solo cuando corresponda |
| **DA-D — medición y auditoría** | 11–12 | E4, después de E2/E3; CTX-4 opcional, CTX-5/6 y F | Ejecuciones comparables A/B; compatibilidad Pi 1.2.0; auditoría independiente y activación reversible | Pruebas Pi auténticas, diferencias observadas y coste conocido/unknown; CI exacto + revisión sin hallazgos críticos; aceptación humana separada |

**No mezclar megatandas DA-A/B/C/D con las megatandas anteriores del programa**; son una agrupación temática de las mismas fases, no una segunda cola. En particular: CTX-2 pertenece a E1B **antes de cerrar E2/E3**; CTX-4 queda opcional **en E4 después de E2/E3**; CTX-5 en E4, CTX-6 en F. El trabajo de #77 y #78 no se duplica. Revisar el mapa de reservas de #63 y exacto SHA antes de abrir cualquier cambio de código.

## 5. Pruebas negativas obligatorias y ensayo A/B

| Escenario | Resultado esperado (sin asumir PASS) |
| --- | --- |
| Consulta breve o errata con riesgos controlados | Ruta directa, cero hijos, pruebas del cambio si corresponde |
| Cambio claro que toca varios archivos | No delegar solo por número de archivos |
| Cuarta lectura relevante o más de 40 KiB | Solo una recomendación/Explorer si aporta valor, sin escritor ni doble ejecución |
| 2 unidades completas sin dependencia + 1 dependiente | Dos Workers con permisos y solape real, tercera espera |
| Dos tareas con archivo/ámbito solapado | No admitir lanzamiento concurrente; mantener una cola segura |
| Perfil organic → full en mitad del turno | Modo anterior hasta nuevo turno, no relajación de escritura pendiente |
| Full-delegation con herramienta write/edit/bash | Bloqueo del padre; hijo requiere ámbito/SHA y aprobación propios |
| Denegación, falta de interfaz humana, cancelación | Cero escritura y ninguna repetición de consentimiento por temporizador |
| Permiso de lote sin soporte Pi verificable | No inventar concesiones: seguir confirmación individual o BLOCKED |
| Git HEAD, tarea, proyecto o sesión modificados | No despachar Writer ni reutilizar autorización del contexto anterior |
| Dos avisos iguales, padre ocupado o reinicio | Reconocimiento durable una sola vez; mensaje íntegro solo al destino correcto |
| Fallo inequívoco de A / escritura incierta de B | Avanzar únicamente unidades independientes seguras; B nunca se repite |
| Riesgo bajo/medio/alto | Pruebas del autor siempre; Verifier solo cuando política lo exige |
| Dos jueces o revisión normal pedidos | Contratos independientes, hallazgos congelados y aceptación separada |
| Falta proveedor/modelo del perfil | Bloqueo explicado, sin sustituir silenciosamente ni simular éxito |
| Pi 1.2.0 en Linux/macOS/Windows × 4 modos | Matriz exacta; cada omisión figura SKIPPED/UNKNOWN, nunca PASS |

**A/B:** congelar tareas, condiciones, versiones y permisos; comparar organic anterior vs organic optimizado; hacer un segundo ensayo distinto contra Gentle completo, NO contra su extensión aislada. Registrar distribución y fallos, no solo promedio. Predefinir aceptación: **cero regresiones de seguridad** y misma o mejor calidad funcional; los objetivos de ahorro/latencia se fijarán tras la línea base y presupuesto consentido, no se inventan porcentajes. No afirmar gasto cero ante factura desconocida.

**Reversión:** marcar cada ampliación por configuración reversible, mantener ruta previa como predeterminada hasta pruebas, desactivar únicamente la nueva elección automática si introduce errores; conservar registros, concesiones y resultados. Nunca forzar Git ni deshacer trabajos ajenos como mecanismo de retorno.

## 6. Auditoría de coherencia previa a cualquier implantación

| Control | Resultado documental de este corte | Condición posterior |
| --- | --- | --- |
| A. Cobertura | Los 12 puntos de la investigación están presentes y mapeados a los 18 originales | Ninguna fila puede cerrarse sin evidencia por punto |
| B. Seguridad | Rechazado copiar tokens, permisos heredados, API Pi inventada, shell del padre en full, merge automático | Pruebas negativas ejecutadas en anfitrión real |
| C. No duplicación | Se reutilizan ODD, Todo, dispatcher, supervisor, worktrees, explorer, journal, Verifier y CTX | Diff futuro mínimo; no segundo motor de agentes |
| D. Orden | E1B/CTX-2 → E2A/E2B → E3 → E4/CTX-4 opcional/CTX-5 → F/CTX-6 | Respetar PR #77/#78, #63 y reservas |
| E. Evidencia | Se distingue código de simulación, replay y modelo real; coste unknown permitido | Registrar SHA exacto y verificación completa por caso |
| F. Tráfico Git | Este documento se guarda separado y apilado sobre #76 | Integrar a desarrollo, nunca main sin aprobación humana |
| G. Estado global | Ninguna mejora de rendimiento, Pi autenticado completo o aceptación E4/F demostrada aquí | Mantener **globalFull:false** |

**Dictamen:** propuesta de diseño **COHERENTE CON CONDICIONES**: el camino de implementación se sostiene si se prueban el lanzamiento de hijos y las autorizaciones nativas Pi. La investigación avanzada NO es una orden para copiar permisos, forzar agentes o dar por completadas las fases. Auditar nuevamente el diff/CI/CodeRabbit del SHA que contenga este texto.

## 7. Fuentes primarias para mantener el plan verificable

- [ASEN, ruta ODD y controles](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/flow/odd-routing.ts); [despachador](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/lifecycle/plan-dispatcher.ts); [supervisor](https://github.com/asenbanskaliev/ASEN/blob/8b62891f2545f5053b065220154f03ddd8bdac29/src/runtime/agents/parallel-parent-supervisor.ts).
- [Gentle Shell 4.9.0, reglas del coordinador](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/assets/orchestrator.md); [dos modos](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/lib/orchestrator-mode-policy.ts); [concurrencia Writer](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/assets/orchestrator-writer.md).
- [Gentle Shell #1587: coste del contexto e investigación](https://github.com/Gentleman-Programming/gentle-shell/issues/1587); [#1731: delegar por motivo](https://github.com/Gentleman-Programming/gentle-shell/issues/1731); [#1494: sobrecarga en tareas pequeñas](https://github.com/Gentleman-Programming/gentle-shell/issues/1494). Son evidencias acotadas de Gentle, no promesa de mejora en ASEN.
- [Claude Code: subagentes](https://code.claude.com/docs/en/sub-agents) y [sesiones en paralelo](https://code.claude.com/docs/en/agents): aprendizaje sobre descripción y aislamiento, sin importar su motor a ASEN.
- [OpenHands: tareas delegadas](https://docs.openhands.dev/sdk/guides/task-tool-set): alternativa con ejecución normalmente sincrónica, no copia de permisos.
- [LangGraph: control de estados y continuidad](https://docs.langchain.com/oss/python/langgraph/overview): patrón conceptual, no nueva dependencia recomendada.
- [Plan rector ASEN](../../odd/tasks/flujo-de-agentes-plan-implantacion-4.9.0.md) y [coordinación #63](https://github.com/asenbanskaliev/ASEN/issues/63).

## 8. Contraste complementario con dos terceros por punto

Esta matriz **no presupone que un marco externo sea más rápido o seguro**. Compara patrones que tienen evidencia pública; solo se traslada el principio pertinente sin añadir dependencia a ASEN.

| Punto | Alternativa externa 1 | Alternativa externa 2 | Por qué no copiar literalmente |
| --- | --- | --- | --- |
| 01 Modos | [Claude Code, subagentes](https://code.claude.com/docs/en/sub-agents): delegación seleccionada por función | [OpenHands, tareas](https://docs.openhands.dev/sdk/guides/task-tool-set): tarea delegada con contexto aparte | No demuestran el mismo bloqueo de escritura del padre que ASEN debe conservar |
| 02 Decidir | Claude Code: descripción breve de agente orienta la decisión del modelo | [LangGraph, rutas condicionales](https://docs.langchain.com/oss/python/langgraph/overview): lógica explícita entre estados | Solo instrucciones no bastan; introducir LangGraph duplicaría el motor ODD |
| 03 Independencia | [Claude Code, sesiones en paralelo](https://code.claude.com/docs/en/agents): carpetas Git separadas | LangGraph: dependencias y bifurcaciones explícitas | Carpetas separadas no prueban independencia de comportamiento; conservar Todo/ODD |
| 04 Explorer | Claude Code: subagentes con conversación propia | OpenHands: agentes para tareas acotadas con resultado al padre | Aislar contexto no reemplaza el contador ni garantiza buena decisión; conservar 3 consultas/40 KiB |
| 05 Plan multiunidad | LangGraph: grafo de estados y aristas | [CrewAI](https://github.com/crewAIInc/crewAI): tareas y roles definidos en flujos | Rehacer el plan en otros formatos rompe identidades y registros de ASEN; extender el existente |
| 06 Lanzar hijos | Claude Code: lanzamiento integrado en su ejecución | OpenHands: herramienta de delegación con identificación de tarea | Ninguna API garantiza que Pi 1.2.0 ofrezca la misma firma; primero prueba de contrato nativo |
| 07 Paralelismo | Claude Code: sesiones con carpetas Git opcionalmente separadas | OpenHands: [límite configurable de concurrencia](https://docs.openhands.dev/sdk/guides/task-tool-set) | No aumentar el límite sin medición; conservar dos y comprobar intersecciones de ámbitos |
| 08 Consentimiento | Claude Code: políticas de herramientas propias del entorno | LangGraph: interrupciones/humano para decisiones importantes | No reutilizar claves o permisos entre ejecutores; el consentimiento es del anfitrión Pi, exacto por unidad |
| 09 Continuar | LangGraph: estado y ejecución duraderos | OpenHands: reanudación por ID de tarea con contexto preservado | Ninguna librería externa sustituye el journal actual ni permite repetir una escritura ambigua |
| 10 Verificar | Claude Code: un subagente puede inspeccionar una tarea sin escribir | LangGraph: nodo de validación condicionado y revisión humana | Un segundo agente no es automáticamente independiente; exigir riesgo real, candidato congelado y recibos |
| 11 Contexto | Claude Code: instrucción detallada se carga cuando se usa el subagente | LangGraph: estado explícito separado del historial narrativo | Eliminar material de contexto sin medir puede quitar seguridad o convenciones; CTX-2/CTX-5 primero |
| 12 Medir | Claude Code: sesiones distintas observables | LangGraph: flujos repetibles y estados inspeccionables | Ninguna comparación externa reemplaza A/B con mismos modelos, proyecto, permisos, tareas y coste efectivo |

**Nivel de evidencia:** documentación pública para capacidades de terceros; código exacto para ASEN; ensayos [Gentle #1494](https://github.com/Gentleman-Programming/gentle-shell/issues/1494) y [#1587](https://github.com/Gentleman-Programming/gentle-shell/issues/1587) para sus propios escenarios. No se han ejecutado aquí proveedores ni ensayos de ASEN contra esas herramientas. Estas alternativas son **referencias de diseño**, no requisitos ni cambios de dependencias.

## 9. Segunda auditoría de consistencia y salida

- **Cobertura:** doce filas de solución, doce filas de correspondencia del plan rector y doce pares de terceros. No se incorporan doce objetivos nuevos.
- **Contratos de autoridad:** la ruta propone, el despachador comprueba, Pi autoriza, el agente ejecuta únicamente su ámbito; prueba y aceptación humana son pasos separados.
- **Contrato de concurrencia:** máximo inicial dos; independencia por comportamiento, dependencias y ámbito; el aislamiento físico y la simultaneidad no acreditan por sí solos calidad.
- **Contrato de continuidad:** señales, diario y reclamación existentes; continuaciones solo para pasos seguros, nunca repetición automática de Writer incierto.
- **Orden único:** E1A/E1B/CTX-2 → E2A/E2B → E3 → E4/CTX-5 (CTX-4 opcional) → F/CTX-6. CTX-3 condicionado a prueba.
- **Límites:** sin cambios de código, sin pruebas ejecutadas en este documento, sin aceptación E4/F, sin merge, sin ahorro demostrado y con estado global false.
- **Dictamen:** **coherencia documental favorable con condiciones técnicas**; se debe validar con CI/CodeRabbit del SHA exacto y prueba Pi auténtica antes de declarar funcionalidad completa.
