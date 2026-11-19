# ASEN — Control de cierre de los 18 puntos (19/11/2026)

## Fuente de verificación
- PR: https://github.com/asenbanskaliev/ASEN/pull/61
- Rama: `feat/flujo-de-agentes-20261115`
- SHA de referencia anterior a este registro: `4b83981399de9a4e86dc4ac06e66681054b178eb`
- En este SHA, GitHub Actions mostró `success` para CI, Release Gate, Phase 0 Architecture y Pi 1.2 runtime evidence. Pi Free Smoke quedó `skipped`; no acredita modelo autenticado.
- PR en borrador, no fusionada. Este documento **no equivale a aceptación funcional**, ni puede sustituir pruebas de un SHA posterior.

## Lista verificable de los 18 puntos — correspondencia con el plan rector v1.1

**Corrección de inventario:** los números siguientes corresponden exactamente a la [comparativa 4.9.0](./flujo-de-agentes-comparativa-actual-4.9.0.md) y al [plan rector auditado](./flujo-de-agentes-plan-implantacion-4.9.0.md). La versión inicial de este registro utilizaba descripciones resumidas que no respetaban esa correspondencia. Se corrige sin atribuir cierres falsos.

| Nº | Función del plan rector | Evidencia actual / prueba que falta |
| --- | --- | --- |
| 01 | Decidir entre trabajo directo y delegación | Guía y ruta ODD implementadas; decisión de host y Pi real comparativo pendientes |
| 02 | Modo orgánico o delegación completa | Perfil compatible y guardas de despacho en código; falta ensayo autenticado de ambos modos |
| 03 | Presupuesto y lanzamiento Explorer | Límite, modelo configurado y prueba con host simulado; falta medir consumo real |
| 04 | Condiciones para lanzar Writer | Ruta ODD y Worker controlado; falta decisión automática por unidades independientes con evidencia real |
| 05 | Dos Workers en paralelo | Supervisor y ensayos parciales; falta arranque autónomo desde padre y solapamiento E2E aceptado |
| 06 | Ampliar archivos sin elevar permisos | Barreras de candidato, ámbito y consentimiento; falta prueba real de ampliación/rechazo |
| 07 | Aviso de finalización en segundo plano | Diario y notificaciones existentes; falta demostrar entrega/asentamiento/reanudación nativos |
| 08 | Recuperación tras fallos y avance independiente | Barreras de reintento dudoso y lecturas independientes; faltan escenarios reales de recuperación |
| 09 | Sustitución de modelos configurados | Política de alternativas y pausas existente; falta prueba de cuota/error y modelo efectivo |
| 10 | Modelo inicial del orquestador | Selección de catálogo en sesión nueva, admite modelos configurados de pago; falta observación autenticada |
| 11 | Verificación proporcional al riesgo | Riesgo nombrado 1–6 genera un plan con Worker y Verifier vinculados; falta evidencia autenticada tras dos Writers |
| 12 | Revisión ordinaria coordinada | Flujo de revisión conectado; falta prueba integral con proveedor y datos reales |
| 13 | Dos jueces y corrección controlada | Dos jueces y propuesta Fix; falta ensayo autenticado con permisos y rondas |
| 14 | Preguntas y decisiones bloqueantes | Confirmaciones protegidas; falta validación de respuestas ordinarias y reanudación |
| 15 | Seguridad Git, permisos y recuperación | SHA, ámbitos e intentos duraderos; cierre pendiente de adversarios y CI exacto del cambio de confirmación |
| 16 | Medición de costes, calidad y duración | Comparador instrumental; falta ensayo A/B auténtico frente a referencia |
| 17 | Aceptación de principio a fin | Ensayo con anfitrión simulado; falta flujo autenticado, pruebas, revisión y aceptación humana |
| 18 | Compatibilidad Pi/ASEN | Pi 1.2 y arquitectura probados en CI del SHA anterior; falta matriz de capacidades y ensayos completos |

**Criterio de cierre:** `TERMINADO` solo cuando la ruta funcional esté conectada, los controles negativos pasen, exista evidencia adecuada al punto, y CI/Release Gate del mismo SHA aprueben. `skipped`, simulaciones y planes no son pruebas reales de paridad.

### Avance de seguridad del 19/11/2026

- Confirmaciones `input.confirm` de Workers y agentes de solo lectura: el despachador exige ahora `approved===true`, nunca un objeto o cadena con aspecto de consentimiento.
- `confirmWithAbort`: también exige `true` exacto en las rutas con y sin cancelación.
- Nuevas pruebas con valores ambiguos, consentimiento positivo, cancelación y no lanzamiento.
- `Audit all tracked references` falló en el SHA `4134dcf` porque este documento nuevo no estaba registrado. Se reparó añadiendo solo su ruta `.md` exacta y pruebas negativas para ruta y extensión distintas.
- **Estado:** cambios publicados en la PR, **CI del último SHA por comprobar**, sin ampliar autoridad ni fusionar; `globalFull:false`.

## Megatandas de ejecución
- A: 1, 2, 3, 4, 9, 10, 14, 18 — planificación, perfiles y modelos.
- B: 5, 6, 7, 8, 11, 12, 13, 15 — Workers, resultados, recuperación, revisiones y seguridad.
- C: 16, 17 — medida y ensayo completo.

## Megatanda A de seis puntos — 19/11/2026

**Publicada en esta rama, pendiente de CI/Release Gate del SHA final.** No equivale a paridad con Gentle Shell ni a aceptación funcional.

| Punto | Evidencia nueva | Cierre |
| --- | --- | --- |
| 02 · Modos de delegación | Modo guardado invalidado si cambia el turno durante la verificación de Pi; prueba negativa en delegation-turn-latch.test.ts | Parcial: falta Pi autenticado |
| 03 · Presupuesto Explorer | Respuestas defectuosas de herramientas no interrumpen la sesión ni consumen el presupuesto; prueba negativa en explorer-budget.test.ts | Parcial: falta consumo real |
| 06 · Ámbito de escritura | Ampliar archivos no hereda el consentimiento previo; rechazo con Git modificado en writer-authorization-snapshot.test.ts | Parcial: falta diálogo real |
| 09 · Alternativas de modelos | Informe seguro ante nombres especiales y fechas fuera de rango; pruebas en model-fallback-policy.test.ts | Parcial: falta conmutación real |
| 10 · Modelo inicial | Se comprueba la identidad de Pi después de observar el modelo y de aplicar el esfuerzo; pruebas de carrera en startup-orchestrator-model.test.ts | Parcial: falta verificación autenticada |
| 15 · Seguridad Git | Cambios en archivos ajenos entre permiso y arranque bloquean autorización; prueba negativa | Parcial: faltan ensayos adversarios completos |

**Último commit previo a este registro:** c685b3bd2ebb3831a61dffe7a9f5fff0fcda1751. No atribuirle resultados de un SHA anterior.

**Siguiente megatanda B:** 01, 04, 07, 08, 11, 12, 13, 14 y 18. Después cerrar los puntos mayores 05, 16 y 17. Mantener globalFull:false y no fusionar main.

## Dependencias de cierre
1. Confirmar los escenarios reales que ya cubre el código actual, evitando añadir un segundo orquestador.
2. Completar pruebas negativas y de integración sobre la ruta Pi/Dispatcher vigente.
3. Ejecutar los ensayos autenticados y de escritura exclusivamente bajo los permisos por Writer, modelos reales y controles de coste aprobados; **no simular consentimientos**.
4. Comparar con Gentle Shell con la misma entrada y condiciones, y revisar los 18 recibos.
5. Mantener `globalFull:false` y la PR abierta hasta que los 18 puntos superen su criterio y se compruebe el último SHA. **No fusionar con main automáticamente.**

## Próxima prioridad
La siguiente tanda funcional es cerrar las pruebas E2E de selección de perfiles y flujo de delegación (A) y sus controles negativos, aprovechando `DelegationTurnLatch`, `applyStartupOrchestratorModel` y los tests `e1-*` existentes. Después conectar prueba Writer→Verifier→revisión→recogida (B) y ensayos medidos (C). Este registro no declara ningún punto finalizado.

## Matriz de evidencia local — SHA `5b2e548e51e29a5d0c5b794c9fbf4e5c0b6cbd53`

**Ejecución local (Windows, 19/11/2026):** `npm test` completó 511/511, sin fallos ni skips; `npm run typecheck`, `npm run check:fast` y los ocho controles de arquitectura/auditoría pasaron. Esta evidencia corresponde al SHA indicado, todavía local y no publicado; por tanto `CI_EXACT_SHA` sigue pendiente y `globalFull:false` se mantiene.

| Punto | IMPLEMENTED | RUNTIME_WIRED | HOST_SIMULATED | LIVE_AUTHENTICATED | CI_EXACT_SHA | Evidencia / límite verificable |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Sí | Sí | Sí | No | No | Rutas ODD y pruebas de planificación; falta comparación Pi real. |
| 02 | Sí | Sí | Sí | No | No | Perfiles y `DelegationTurnLatch`; falta ensayo autenticado. |
| 03 | Sí | Sí | Sí | No | No | Presupuesto Explorer con controles negativos; falta consumo observado. |
| 04 | Sí | Sí | Sí | No | No | Writer controlado; falta decisión autónoma real entre unidades. |
| 05 | Parcial | Parcial | Sí | No | No | Explorer y Verifier Pi reales se solaparon; faltan dos Writers autorizados. |
| 06 | Sí | Sí | Sí | No | No | Candidato, ámbito y consentimiento no reutilizable; falta diálogo Pi real. |
| 07 | Sí | Sí | Sí | No | No | Diario y avisos; falta entrega/asentamiento nativo autenticado. |
| 08 | Sí | Sí | Sí | No | No | Reintento seguro y continuidad probados en host; falta recuperación real. |
| 09 | Sí | Sí | Sí | No | No | Fallback configurado; falta cuota/error de proveedor real. |
| 10 | Sí | Sí | Sí | No | No | Selección de catálogo y carreras; falta observación autenticada. |
| 11 | Sí | Sí | Sí | No | No | `planOddRoute` eleva riesgos 1–6 y `orchestrator` añade Verifier; prueba E3 verde. |
| 12 | Sí | Sí | Sí | No | No | Revisión ordinaria conectada; falta proveedor y datos reales. |
| 13 | Sí | Sí | Sí | No | No | Dos jueces y corrección acotada; falta ensayo autenticado. |
| 14 | Sí | Sí | Sí | No | No | Confirmaciones bloqueantes protegidas; falta validación real de reanudación. |
| 15 | Sí | Sí | Sí | No | No | SHA, ámbitos y recuperación endurecidos; falta CI del SHA actual y adversarios completos. |
| 16 | Parcial | Parcial | Sí | No | No | Instrumentación presente; falta A/B auténtico comparable. |
| 17 | Parcial | Parcial | Sí | No | No | E2E con host simulado; falta flujo autenticado y aceptación humana. |
| 18 | Parcial | Parcial | Sí | No | No | Pi 1.2 está cubierto; la matriz local no admite Pi 1.5.2. |

**Evidencia autenticada acotada:** el informe temporal `asen-t06-openai-pi-concurrent-cc715b55-513c-4c3a-900d-eb99f9983e34.json` registró el 19/11/2026 dos procesos Pi con `openai-codex/gpt-5.6-sol`: Explorer y Verifier completaron, con solapamiento real y worktrees limpios. El coste informado por Pi fue USD 0.00206 por proceso, sin verificación de facturación. El ensayo no concedió Writer (`writerGranted:false`) ni autorización de entrega.

**Bloqueos reales:** no se encontró una credencial de proveedor en el entorno para ejecutar Writers autenticados y las pruebas de consentimiento requieren una concesión humana comprobable. No se simularon esos permisos.
