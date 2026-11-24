# ASEN — Refuerzo quirúrgico de A/B: plan operativo P01–P06

**Fecha:** 24/11/2026. **Estado:** propuesta de implantación aprobada para incorporar al plan; código de estas mejoras pendiente de ejecución y aceptación. **Autoridad:** complemento del apartado 16 del [plan rector](flujo-de-agentes-plan-implantacion-4.9.0.md), no sustituye los contratos ODD, CTX, G0–G6 ni los 18 objetivos + 12 puntos originales. **globalFull:false**.

## 1. Línea base, límites y dictamen

| Unidad | Revisión comprobada | Evidencia y límite |
|---|---|---|
| A / #103 | 3cc04a4f4c8991b183292eab8afc42d22faefffe; integrada en 0a0496c6432ada5d20540380fe4c22bb4befcdb5 | CI [45367463194](https://github.com/asenbanskaliev/ASEN/actions/runs/45367463194), arquitectura, puerta de publicación correctas; [ensayo real 45266488924](https://github.com/asenbanskaliev/ASEN/actions/runs/45266488924) de Writers y recuperación en versión anterior; no recorrido global. |
| B / #115 | 7354dded1545e4a95e404f51ec16aaaf56a23177 | CI [45467138204](https://github.com/asenbanskaliev/ASEN/actions/runs/45467138204) correcta; [E2A 45467138376](https://github.com/asenbanskaliev/ASEN/actions/runs/45467138376) PASS real limitado: dos sesiones nativas, dos Writers Lightning solapados, dos recibos, ámbito y bytes exactos, candidato conjunto, origen limpio, sucesora bloqueada. |
| B / #116 | 0fa0231e67f9c50dee07a17823f6ea98fd7dd53c | [E3 45491178357](https://github.com/asenbanskaliev/ASEN/actions/runs/45491178357) PASS real limitado: Nano Omni + Ultra, fail/fail, Fix Lightning, pass/pass, un archivo, pruebas firmadas; artefacto 14966716482. La CI [45491178355](https://github.com/asenbanskaliev/ASEN/actions/runs/45491178355) estaba en ejecución en el corte de auditoría. |

CodeRabbit: #103 3/3, #115 78/78, #116 8/8 hilos cerrados en el corte. Un hilo cerrado no es una aprobación independiente. Las pruebas de A y B no acreditan consentimiento humano de producción, selección autónoma por el padre, integración real del candidato corregido, ejecución real de la sucesora ni ahorro. E2A y E3 son fixtures diferentes. La descripción antigua de #116 no debe interpretarse como un recorrido único: el script E3 vigente usa un defecto sintético preexistente, NO la salida E2A. Las pruebas omitidas no son PASS.

**Decisión:** no rehacer A, preservar el código y recibos de B, usar el motor actual. P01/P02/P03/P04/P06 son actuaciones necesarias para la aceptación; P05 es investigación y experimento condicionado, no obligación de desplegar más concurrencia. No modificar sistemas locales del usuario, main, perfiles personales ni credenciales; todo el trabajo de desarrollo y prueba en GitHub. Sin tareas programadas nuevas. Los ensayos NVIDIA acotados están autorizados por el usuario; no repetir un caso fallido sin causa o cambio material. La autorización de proveedor no otorga permiso de escritura o integración del producto.

## 2. Orden único y propiedad de archivos

Estas etiquetas son paquetes de refuerzo, no nuevos objetivos ni sustitución de las megatandas A–E originales de PR #61. Conservar E1A/E1B y CTX-2 antes de los cierres E2/E3; CTX-3 condicionado; E4/CTX-5 y F/CTX-6 mantienen sus condiciones. Si algún requisito anterior sigue sin prueba, planificarlo antes del cierre dependiente. No lanzar un segundo proyecto en paralelo.

| Paquete | Fase rectora | Alcance | Dependencia / salida |
|---|---|---|---|
| B0 | E2A/E3 | Cierre de las PR #116 y #115 en rama de desarrollo; revisión de identidad SHA, diffs, CI, CodeRabbit y recibos reales | No integrar si hay hallazgo bloqueante; admitir solo alcance controlado, no FULL |
| B+ | E1A/E3 + registro transversal | P01 + P02 + comienzo P06; un contrato común, consumidores y tests | B0 estable o, si se confirma vulnerabilidad bloqueante, corregirla antes de admitir B0 |
| C1 | E2B | P04: recuperación segura y pruebas de interrupción | Contrato de identidad estable |
| C2 | E1B/E2A/E2B/E3/E4 | P03 + actualización P06: recorrido natural real y escenarios negativos | Prerrequisitos E1/CTX-2 y recuperación probados |
| C3 | E4/CTX-5 | P05: medir 1/2; evaluar 3/4 solo si los datos y el diseño justifican prototipo | C2 estable; no ampliar por defecto |
| F | F/CTX-6, D/E originales | Revisar 30 requisitos, comparación la referencia comparativa fijada en el plan rector, Pi 3 sistemas × 4 modos, auditoría final | Todas las puertas vigentes; decisión humana |

Antes de cada paquete leer #63, #61, #115/#116 y SHA actuales. Reservar archivos y evitar cambios concurrentes sobre extensions/asen.ts, dispatcher y contratos de revisión. El nombre de archivo aquí es punto de inspección, no autorización para reescribirlo. Cada modificación: prueba que falle por el motivo correcto, parche mínimo, pruebas negativas y positivas, typecheck, check:fast, CI exacta, revisión independiente, evidencia y actualización de P06. Agrupar cambios relacionados en un commit/PR revisable. No tocar las ramas de B mientras estén obteniendo evidencias. Reconciliar la rama receptora tras integrar #116 en #115 y #115 en su base: #103 ya está cerrada; mover los cambios resultantes a #61 mediante PR explícita, comprobar ancestría y diferencias, no reabrir #103 ni perder el plan documental. No forzar referencias, no saltar controles.

## 3. Unidades quirúrgicas

### P01 — Independencia de jueces (alta)

**Hallazgo reproducible:** src/review/pi-model-reviewer.ts cuenta pares proveedor/id literales; src/review/judgment-day.ts compara concatenaciones literales. native-integration-review.ts excluye algunas variantes del autor, pero no impone equivalencias de ambos jueces de forma común. El ensayo E3 verifica dos modelos distintos en el catálogo, no demuestra todos los alias posibles.

**Intervención:** empezar con test de dos descriptores que representan el mismo modelo conocido (por ejemplo, prefijo redundante del proveedor cuando está documentado). Extraer una función pura de identidad canónica compartida por selección, comprobación previa a llamada, resultado y aceptación. Conservar el descriptor original exacto al llamar Pi. Usar equivalencias explícitas respaldadas por catálogo/contrato; no eliminar nombres de familia ni versiones a ciegas, no equiparar modelos por substrings. Si la relación es ambigua y se exige doble revisión, bloquear esa pareja y explicar por qué. Excluir TODOS los autores observados del candidato. Usar perspectivas separadas sin compartir el dictamen previo; preferir diversidad de familias si disponible, sin convertirla en requisito ni imponer proveedor distinto. Mantener política de revisión proporcional existente.

**Archivos a inspeccionar:** src/review/pi-model-reviewer.ts, src/review/judgment-day.ts, src/runtime/lifecycle/native-integration-review.ts; consumidores de review y profiles; tests/pi-model-reviewer.test.ts, tests/judgment-day.test.ts, tests/native-partition-flow.test.ts.
**Pruebas de salida:** alias conocido, entradas duplicadas, autor con alias, dos autores, dos jueces válidos, virtuales, sin autenticación, pareja ambigua, discrepancia, perfiles con rutas válidas preservadas. Cero llamadas en rechazo previo. No aprobar por dos votos cuando falta una prueba obligatoria. Si el proveedor usa un alias no demostrable, reconocer incertidumbre y conservar bloqueo para independencia requerida.
**Pros/contra:** mejora confianza con coste local mínimo; reduce opciones si se aplica demasiado agresivamente. No añadir inferencias para identidad.

### P02 — Identidad observada (alta; junto a P01)

**Hallazgo:** E3 registra proveedor/modelo de evento y responseModel cuando existe. El motor general extrae texto y valida veredicto, sin aplicar el mismo control en todos los roles. Los Writers tienen observación de selección nativa y recibo; no confundir selección con identidad física certificada.

**Intervención:** reutilizar los campos y recibos existentes, no crear un segundo registro. Registrar solicitado, descriptor resuelto, identidad declarada por transporte, identidad declarada por respuesta si existe, fuente de evidencia y estado: coincidente declarado / desconocido / incompatible. Verificar contra equivalencias P01; detectar cambios durante sesión, conservar autorización de alternativa y no atribuir un fallo a otro modelo. Respuestas sin declaración no se inventan ni se convierten en prueba de identidad física: la política de riesgo decide si la evidencia es suficiente, y para doble revisión exigida una identidad incompatible/independencia no demostrable no permite aceptar. Versionar lectores de recibos: históricos sin nuevos campos quedan desconocidos; no fabricarlos. No guardar texto de razonamiento, cabeceras, claves o payloads privados. Mantener validación estricta del veredicto y controles del proveedor sin añadir llamadas.

**Archivos:** src/agents/pi-process-runner.ts, src/runtime/agents/native-writer-completion.ts, src/review/pi-model-reviewer.ts, src/runtime/lifecycle/native-integration-review.ts y tipos/recibos existentes que se comprueben necesarios. Revisar tests de selección nativa, reviewer y receipt-verifier.
**Pruebas:** declarado compatible, distinto, ausente, virtual, alias ambiguo, alternativa autorizada vs no autorizada, recibo histórico, evento falso, respuesta truncada, cambio de modelo durante ejecución; el resultado incompatible no autoriza Fix ni aceptación. Modelo de perfil válido y casos de A no regresan.
**Pros/contra:** trazabilidad sin coste de llamadas; diferencias de proveedores pueden provocar falsos bloqueos. La evidencia es declaración verificable del transporte, no certificación física del proveedor.

### P04 — Recuperación sin duplicar efectos (alta)

**Hallazgo:** ya existen Todo, agentes, journal de terminales, observaciones y referencias Git durables. reportBindings/acceptedIntegrations en native-integration-review.ts son WeakMap de proceso; el marcador en Git permite recuperar una preparación exacta, pero la reiniciabilidad de las autorizaciones y de la sucesora requiere prueba. persistNativePartitionSuccessor usa addPlan y acceptIntegratedPartition en pasos separados: probar el corte entre ambos antes de cambiarlo.

**Intervención:** inventariar transiciones y fuentes de verdad existentes; crear prueba de reinicio real de proceso (no solo nueva instancia). Identidad idempotente por proyecto/sesión/lote/unidad/candidato/operación. Recuperar solo hechos demostrables. Si la evidencia de revisión pierde autenticidad al reiniciar, reconstruirla desde fuentes verificadas existentes o solicitar revisión/consentimiento nuevo; jamás deserializar un objeto y declararlo genuino. Si Git ya avanzó exactamente al candidato, reconciliar el registro y pedir las autorizaciones que falten; si index/worktree divergen, bloquear con motivo y sin reset. No borrar refs de evidencia sin política de retención y comprobación de usos; nunca publicarlas vía mirror. No repetir una llamada externa de resultado incierto; diferenciar efecto lógico único de garantía imposible de petición HTTP única.

| Punto de corte a probar | Resultado exigido |
|---|---|
| Antes de despacho / en cola | Sin lanzamiento sin permiso vigente |
| Después de spawn, antes de recibo | Estado incierto; inspección, no retry ciego |
| Recibo durable, antes de aviso | Recuperar una vez; no repetir Writer |
| Padre ocupado, sesión cambiada o reiniciada | Entrega atribuida a sesión y proyecto correctos |
| Antes/después de read-tree y update-ref | Detectar preparación exacta o integración ya hecha; nueva aprobación cuando corresponda |
| Después de addPlan, antes de aceptar sucesora | No duplicar plan; bloquear ejecución hasta aceptación auténtica |
| Dos procesos recuperan simultáneamente | Una transición efectiva; sin pérdida de otros trabajos |

**Archivos:** src/runtime/agents/parallel-native-child-terminal.ts, agent-store.ts, parallel-worker-observation-journal.ts, native-writer-completion.ts; src/runtime/lifecycle/native-integration-review.ts, native-integration-successor.ts, todo-store.ts, plan-dispatcher.ts; extensions/asen.ts solo si necesario. Reutilizar pruebas de continuidad, agent-notice-ack-tool, native-partition-flow y bloqueos existentes.
**Salida:** cero escrituras duplicadas, cero pérdida de recibos confirmados, cero reutilización de permisos vencidos; tareas independientes seguras continúan y dependencias bloqueadas mantienen causa. Simular fallos de disco/cancelación y reinicio en GitHub; una prueba real acotada después del offline. No ampliar concurrencia antes.

### P03 — Recorrido integral real (crítica)

**Hallazgo:** E2A llama asen_plan_request con params y unidades preparados por el test; E3 usa fixture distinta y autoriza el diálogo con host sintético. Estos ensayos son regresiones valiosas, no sustituyen la decisión autónoma ni validan el candidato resultante entre etapas.

**Intervención:** conservar ambos ensayos. Añadir recorrido de aceptación único que entre por Pi principal real con petición natural y perfil, observe la decisión ODD del modelo sin suministrar el DAG, use el planificador y supervisor existentes, obtenga dos resultados con recibos, congele el árbol conjunto, verifique/juzgue según riesgo, vincule un defecto reproducible al mismo candidato, planifique Fix autorizado y acotado, repita revisión, ejecute pruebas del árbol final, solicite aceptación local de prueba y replantee la sucesora sobre SHA integrado. Verificar entrega al padre y resultado final. No escribir en repositorio de usuario: fixture Git descartable con controles reales del host; etiquetar consentimiento instrumentado como tal. No llamar a un motor alternativo ni editar árboles fuera del camino probado para fingir éxito. Resolver explícitamente la brecha del Fix sobre candidato compuesto: usar contratos existentes y una preparación aislada autorizada, nunca integrar un candidato defectuoso en la rama original para poder corregirlo. Si el camino de producto no lo admite, abrir test negativo y parche mínimo, sin declarar PASS. Mantener una rama de caso limpio y otra de defecto/corrección, sin imponer doble juicio en tarea sencilla.

**Puntos de entrada:** extensions/asen.ts, src/runtime/lifecycle/natural-plan-tool.ts, odd-unit-plan.ts, parallel-native-child-plans.ts, parallel-worktree-command.ts, native-integration-review.ts, native-integration-successor.ts; src/review/odd-agent-review-flow.ts; scripts/e2a-native-partition-nvidia.ts, scripts/e3-focused-fix-nvidia.ts como ejemplos de instrumentación, no fusionarlos ciegamente. Buscar harness Pi real ya existente y reutilizarlo.
**Casos:** petición simple (no agentes innecesarios), ambiguo (una pregunta y reanudación), full-delegation (padre no escribe), dos raíces + sucesora, fallo/discrepancia, permiso rechazado, ampliación de ámbito, modelo inválido, reinicio, defecto y Fix con límite de rondas. Offline primero; proveedores reales solo para casos que los necesitan, sin repetición automática. Registrar SHA/árbol de cada transición, proceso/rol, modelo observado, recibos y causas de bloqueo.
**Salida:** sucesora realmente terminada sobre la revisión integrada; mismo linaje de evidencia desde petición a entrega. Verificación real de las rutas aplicables y pruebas negativas. No confundir una fixture con aceptación humana real ni extender un PASS a todos los proyectos.

### P05 — Paralelismo adaptable, condicionado (media)

**Hallazgo:** canMaterializeOddPartition en src/flow/odd-routing.ts admite exactamente tres unidades (dos raíces + una sucesora), riesgo bajo/medio sin riesgos nombrados, sin decisiones abiertas ni revisión previa. native-integration-successor.ts admite una sucesora exacta. Ampliar solo el contador rompería contratos.

**Fase 1 sin cambio de producción:** medir secuencial vs dos Writers sobre corpus fijo de tareas independientes, mismos modelos/perfiles, permisos, pruebas, presupuesto y entorno. Comparar con la referencia comparativa fijada en el plan rector en E4 cuando corresponda. Registrar duración extremo a extremo, tokens/coste declarados (unknown si ausentes), memoria máxima, conflictos, errores, latencia p50/p95 si tamaño de muestra suficiente, calidad ciega y tasa de finalización. Incluir tareas pequeñas, independientes y con dependencias; alternar orden, repetir casos de forma previamente acotada y no elegir solo éxitos. Sin extrapolar tiempos de CI a tiempos de producto.
**Fase 2 condicionada:** si hay beneficio reproducible y se puede mantener seguridad, diseñar experimento 3/4 aislado, presupuesto de concurrencia y colas del Dispatcher existente. Revisar grafo, límites, rutas portables, autorización por lote, worktrees, integración, sucesoras y recibos antes de ampliar. Limitar por ámbitos independientes, memoria, proveedor y coste; conservar dos por defecto y posibilidad de ejecutar uno. Sin conteos por número de archivos como única razón.
**Criterio propuesto a acordar antes de medir:** mejora de mediana de tiempo de al menos 15% frente a dos en tareas elegibles, sin regresión de calidad, sin conflictos/violaciones y sin aumento injustificado del coste por tarea exitosa; si muestras insuficientes o coste desconocido, no activar ampliación por defecto. El 15% es umbral de decisión propuesto, no resultado observado. Si no aporta ventaja, cerrar experimento como NO ADOPTAR y mantener límite actual.
**Archivos:** src/flow/odd-routing.ts, src/runtime/lifecycle/odd-unit-plan.ts y native-integration-successor.ts; src/runtime/agents/parallel-parent-supervisor.ts, parallel-worktrees.ts, src/agents/dispatcher.ts; infraestructura C01/agent-flow-series-comparison existente. No cambiar código de producción hasta resultado y revisión.

### P06 — Matriz única y evidencia (transversal)

**Intervención:** mantener nombres y números de la [matriz canónica](flujo-agentes-18-objetivos-12-puntos-aceptacion-20261123.md), no crear una segunda matriz de verdad. Registrar evidencia por objetivo, tipo, SHA del código, run/job, caso, resultado, artefacto/digest si existe, fecha, modelo declarado o desconocido, limitaciones, revisión y pendiente. Usar lectores/recibos existentes; automatizar verificación de resultados y actualización propuesta, no promoción automática a aceptado. Las evidencias de una rama no integrada se etiquetan como tales; comprobar diferencia de código antes de reutilizar evidencia de otro SHA. Si artefacto expira, conservar resumen verificable y huella sin secretos; si no puede verificarse, marcar no comprobable. No almacenar código confidencial ni credenciales. Evidencia firmada acredita integridad, no suficiencia.
**Pruebas:** nombres y 18+12 intactos, omitido/cancelado/fallido, SHA diferente, resultado de simulación, recibo manipulado, identidad no demostrada, evidencia desaparecida, duplicada o contradictoria, artefacto de otro run. Mantener globalFull:false hasta todas las condiciones del plan.
**Archivos:** matriz canónica y tests/flujo-agentes-matriz-canonica.test.ts; src/evidence y workflows existentes tras inventario; índice y registro del plan, no otro almacén de aprobación.

## 4. Mapa a requisitos originales (no redefine aceptación)

| Mejora | Objetivos 01–18 afectados | Puntos adicionales 01–12 afectados |
|---|---|---|
| P01 | 11,12,13,15 | 10,12 |
| P02 | 09,10,11,13,15 | 07,08,10,12 |
| P03 | 01–15,17,18 (según caso) | 01–10,12 |
| P04 | 06,07,08,15,17 | 06,08,09,12 |
| P05 | 04,05,16 | 03,05,07,11,12 |
| P06 | 01–18 | 01–12 |

## 5. Admisión, revisión, reversión y salida

1. Leer el HEAD receptor real y #63; listar archivos afectados, evidencias, casos y permisos. Si otro cambio los modifica, reconciliar antes de continuar.
2. TDD: primero prueba negativa localizada; no relajar aserciones, omitir controles ni ampliar excepciones para pasar. Reutilizar APIs públicas Pi verificadas, sin llamadas inventadas. Revisar compatibilidad de recibos, perfiles y comportamiento histórico.
3. Aplicar cambio mínimo, probar ruta ordinaria y negativa; correr CI exacta para una tanda consolidada. Revisión por rol distinto del autor y CodeRabbit; hilos cerrados no sustituyen aprobación ni prueba.
4. Ensayo real únicamente con código congelado, SHA exacto, límites de coste/llamadas, reporte depurado, sin auto-retry de escritura incierta. Registrar qué se ejecutó realmente. No contar skipped.
5. Integrar solo al destino de desarrollo explícito, con SHA esperado; verificar árbol y nueva CI. Si cambia el código dependiente repetir las pruebas afectadas; no heredar evidencia automáticamente. Reversión mediante revert revisable o no admisión de la PR, nunca force-push/reset destructivo. Si un cambio no aporta valor, conservar comportamiento anterior.
6. P06 desde el comienzo y tras cada entrega. Cierre formal de B0 es alcance limitado, no global. Antes de declarar globalFull:true: 18+12 aceptados, recorrido auténtico, comparativa controlada, Pi tres sistemas por cuatro modos, CI y Release Gate del SHA final, revisión independiente y decisión humana. Main permanece sin fusión automática.

**Auditoría de diseño:** el plan contrasta código y ensayos de A/B, preserva autoridad y arquitectura, declara incertidumbres y limita cambios. No es certificación externa ni implantación de P01–P06. Las decisiones de diseño y umbral experimental se revisan con evidencia, sin modificar los requisitos originales.
