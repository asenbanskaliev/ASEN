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
