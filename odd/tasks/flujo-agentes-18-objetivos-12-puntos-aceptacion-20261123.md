# ASEN — Matriz de aceptación canónica: 18 objetivos y 12 puntos

**Corte original:** 23/11/2026. **Actualización de evidencias:** 24/11/2026; las pruebas de B pertenecen a ramas aún no integradas en el corte. **Base de integración:** `56ad1d0388322ad7edb6355cf6942ac5f1a75217`.  
**Rama receptora:** `integration/megatanda-1-3-20261123`. **Estado global:** `globalFull:false`.

Esta matriz emplea **los nombres y números originales** del [estado rector de 18 objetivos](./flujo-de-agentes-estado-18-objetivos.md) y del [informe de 12 puntos](../../docs/audit/plan-quirurgico-delegacion-automatica-12-puntos-2026-11-21.md). Los 12 puntos complementan los 18; **no son doce nuevos proyectos ni comprobaciones de administración de PR**.

Un ensayo real aislado acredita solo el comportamiento ensayado. Una CI correcta no acredita por sí sola autonomía funcional. Una prueba omitida no es una prueba superada.

## 18 objetivos

| Nº | Objetivo original | Estado | Evidencia o bloqueo |
|---:|---|---|---|
| 01 | Decidir cuándo ASEN resuelve y cuándo delega | PARCIAL | Ruta ODD y guía existentes; faltan decisiones reales de Pi en casos simples, ambiguos y críticos. |
| 02 | Dos modos: normal y delegación completa | PARCIAL | Perfiles conectados; pendiente comprobar cambio de perfil y veto de escritura del padre con Pi real. |
| 03 | Investigar solo cuando hace falta | PARCIAL | Explorer y presupuesto disponibles; falta evidencia real de elección sin duplicar agentes. |
| 04 | Separar tareas y dependencias | PARCIAL | Unidades y dependencias conectadas; falta secuencia real 2 independientes + 1 dependiente. |
| 05 | Dos agentes de escritura trabajando a la vez | ENSAYO_REAL_LIMITADO | Dos procesos NVIDIA paralelos sobre archivos sintéticos; falta enlace completo padre-ODD-Writer. |
| 06 | Solicitar ampliación de archivos sin conceder permisos | PARCIAL | Rechazo de cambios de ámbito existente; pendiente consentimiento real ante ampliación y SHA distinto. |
| 07 | Recibir cada resultado una sola vez | PARCIAL | Diario y entrega única presentes; corrección del aviso diferido en 56ad1d0, CI y prueba padre-hijo pendientes. |
| 08 | Continuar después de un fallo seguro | PARCIAL | Recuperación Pi verificada en ensayo aislado; falta continuidad de todas las unidades seguras desde el padre. |
| 09 | Cambiar de modelo cuando falla | PARCIAL | Alternativas configuradas; faltan pruebas de 429, credenciales, coste y modelo efectivo en fallo real. |
| 10 | Usar el modelo principal del perfil | PARCIAL | Selección de perfil conectada; falta recibo de modelo principal tras reanudación auténtica. |
| 11 | Verificar según los riesgos del cambio | PARCIAL | Contratos E3 de #98/#99 incluidos en #103; CI del SHA nuevo y revisión independiente pendientes. |
| 12 | Una revisión completa del cambio | PARCIAL | Revisión con candidato/recibo; falta resultado real y decisión humana diferenciada. |
| 13 | Dos jueces y correcciones limitadas | PARCIAL | Dos jueces y límite de rondas presentes; falta doble revisión autenticada y Fix autorizado extremo a extremo. |
| 14 | Preguntar lo imprescindible y seguir | PARCIAL | Clarifier disponible; falta petición única, cancelación y reanudación con Pi real. |
| 15 | Mantener la seguridad y el control de cambios | PARCIAL | Protecciones y pruebas rápidas; falta CI completa, arquitectura y puerta final del mismo SHA y auditoría. |
| 16 | Medir velocidad, consumo, calidad y costes | PENDIENTE_DE_MEDICION | Hay infraestructura y ensayo C01; falta comparativa A/B completa, comparable y con costes/tokens reales. |
| 17 | Probar todo el recorrido con modelos reales | PENDIENTE_INTEGRAL | Los ensayos NVIDIA no demuestran petición→plan→hijos→revisiones→recepción→aceptación como flujo único. |
| 18 | Comprobar la compatibilidad real de Pi | PARCIAL | Evidencia Pi en algunos sistemas; falta matriz completa Pi 1.2, tres sistemas × cuatro modos. |

## 12 puntos adicionales

| Nº | Punto original | Estado | Evidencia o bloqueo |
|---:|---|---|---|
| 01 | Modos | PARCIAL | Dos modos existentes; falta aceptación con Pi real y cambio de perfil al siguiente turno. |
| 02 | Decisión automática | PARCIAL | Ruta ODD conectada; falta decisión real justificada sin crear agentes innecesarios. |
| 03 | Independencia | PARCIAL | Unidades independientes previstas; falta solape auténtico decidido por el orquestador. |
| 04 | Explorer | PARCIAL | Explorer con límites; falta comprobar arranque único y contexto útil en host real. |
| 05 | Unidades ODD | PARCIAL | Plan de Todo con dependencias; falta ejecución completa y una reclamación por unidad. |
| 06 | Hijos automáticos | PARCIAL | Inicio de sesiones hijas condicionado a capacidad comprobable del anfitrión, sin heredar permisos. |
| 07 | Dos Writers | ENSAYO_REAL_LIMITADO | Dos Pi Writer NVIDIA reales en worktrees sintéticos; no equivale a ejecución autónoma de producción. |
| 08 | Permisos | PARCIAL | Ámbitos exactos y controles existentes; falta comprobar consentimiento real y rechazo de ampliación. |
| 09 | Continuidad | PARCIAL | Journal y recuperación parcial; pendiente entrega padre-hijo y ausencia de repetición con escritura incierta. |
| 10 | Verificación | PARCIAL | Seis riesgos y Verifier E3; pendientes pruebas de consumidores Pi y auditoría independiente. |
| 11 | Contexto | PARCIAL | Guía modular y selección de habilidades; falta ensayo medido de tokens y seguridad en padre e hijos. |
| 12 | Aceptación | PENDIENTE_DE_ACEPTACION | Faltan pruebas integrales, comparación A/B, matriz de sistemas y revisión independiente sobre un SHA final. |

## Evidencia verificable y límites

- **PR #103:** https://github.com/asenbanskaliev/ASEN/pull/103 — rama integradora, no fusionada en `main`.
- **PR #100:** estabilización y contratos de Verifier; **#101:** documentación de los Writers; **#102:** pruebas NVIDIA y recuperación.
- **Ensayos NVIDIA reales:** https://github.com/asenbanskaliev/ASEN/actions/runs/45266488924 — dos procesos con archivos sintéticos separados e interrupción/recuperación; no es la aceptación completa del orquestador.
- **Corrección posterior:** `56ad1d0388322ad7edb6355cf6942ac5f1a75217` — elimina el reintento recursivo de avisos, captura el error y ajusta la rama permitida para C01. **CI y revisión pendientes de confirmación**.
- **Revisión de CodeRabbit:** tres hallazgos sobre #103; comprobar que las reparaciones siguen vigentes en la revisión más reciente y que no aparecen otros.
- **Comparativa Gentle Shell:** hay infraestructura C01, pero falta la batería A/B reproducible con igualdad de condiciones, métricas y revisión externa.
- **Compatibilidad:** ejecutar los **3 sistemas × 4 modos** del plan, diferenciando resultados reales de simulaciones y omisiones.

## Actualización de evidencia · 24/11/2026

- A: #103 integrada; CI [45367463194](https://github.com/asenbanskaliev/ASEN/actions/runs/45367463194) correcta, CodeRabbit 0 abiertos. La referencia 56ad1d0 anterior es histórica.
- B: #115 SHA 7354dded1545e4a95e404f51ec16aaaf56a23177, [E2A real 45467138376](https://github.com/asenbanskaliev/ASEN/actions/runs/45467138376) y [CI 45467138204](https://github.com/asenbanskaliev/ASEN/actions/runs/45467138204) correctos: dos sesiones nativas, Writers solapados, dos recibos, candidato conjunto y dependencia bloqueada. Refuerza objetivos 04,05,07,08 y adicionales 03,05,06,07,09; no acredita decisión autónoma ni sucesora real.
- B: #116 SHA 0fa0231e67f9c50dee07a17823f6ea98fd7dd53c, [E3 real 45491178357](https://github.com/asenbanskaliev/ASEN/actions/runs/45491178357) correcto sobre fixture separada: Nano Omni + Ultra, Fix Lightning, segunda revisión y recibo firmado. Refuerza objetivos 11–13 y adicional 10; falta candidato E2A→E3 único y consentimiento real. CI definitiva en curso al corte; no inferir resultado ni integración.
- Refuerzos y criterios de actualización: [P01–P06](flujo-agentes-refuerzo-quirurgico-ab-20261124.md). Estados de aceptación conservadores; no elevar una fila completa por una evidencia limitada. Verificar SHA y artefactos actuales antes de admitir.

## Actualización de evidencia · 25/11/2026

- B0: #115 `4f66fb4eaba00ce211349040a1889bbf16e2f194`: [CI 45557740308](https://github.com/asenbanskaliev/ASEN/actions/runs/45557740308) fallida. #117 `39c34a9103c2ccbb267c7b07db0de569eec520bc`: [CI 45557811544](https://github.com/asenbanskaliev/ASEN/actions/runs/45557811544) fallida. Dictamen E [#63](https://github.com/asenbanskaliev/ASEN/issues/63#issuecomment-7154736972): revisión COMMENTED con hallazgos pendientes. No admitir ni trasladar al plan.
- [#118](https://github.com/asenbanskaliev/ASEN/pull/118) `dcf5698378598e8517e26d56746b670df8aca1a4`: corrige prueba negativa de selección exacta y añade caso positivo de clarifier instrumentado; sin aprobación CI ni prueba Writer positiva. No promover las filas 04/06/07/08/15 ni adicionales 05/06/08/09.
- E2A/E3 históricos del 24/11 permanecen evidencia real limitada, no aceptación del SHA actual. Sin inferencia nueva en esta unidad. Los 18 objetivos y 12 puntos conservan los estados de las tablas anteriores.

### Control P01–P06 (complemento transversal, no otra matriz de aceptación)

| Refuerzo | Estado a este corte | Siguiente evidencia y responsable |
|---|---|---|
| P01 | PARCIAL, #117 no admitida | B/E: probar independencia por identidad canónica y política proporcional; casos 1/2/3 modelos. |
| P02 | PARCIAL, #117 no admitida | B/E: identidad solicitada/seleccionada/declarada tras alternativa; ausente o ambigua no acredita independencia. |
| P03 | PENDIENTE_INTEGRAL | C: recorrido natural Pi sobre base admitida, recibo conjunto real y sucesora; primero pruebas sin proveedor. |
| P04 | PARCIAL, #117 no admitida | B/C: reinicio en cada límite del diario, conciliación por ID exacto, rechazo de repetición incierta. |
| P05 | CONDICIONADO | C: comparar 1 vs 2 agentes, coste desconocido como unknown; no ampliar a 3/4 antes de medir. |
| P06 | TRANSVERSAL, NO ACEPTADO | A/E: conservar estados, verificar SHA/run/job/recibo y límites; D valida antes de integrar. |

Casos de política que no pueden omitirse: bajo/medio sin riesgo nombrado y sin revisión explícita, recibo firmado del árbol exacto y consentimiento de integración; riesgo nombrado exige verificador independiente; doble explícita exige dos identidades distintas y compatibles; si hay 1/2/3 modelos insuficientes para el riesgo, bloquear la revisión obligatoria, nunca sustituirla por autorrevisión. Rechazar recibo alterado, cambio de riesgo o candidato durante espera, identidad desconocida, permiso caduco y recuperación de otro lote. Sucesora conserva la política original y permiso Writer aislado; nunca fuerza doble revisión artificial.

**Próximo criterio comprobable:** B0 pasa exclusivamente con nueva CI completa y revisión pertinente sobre SHA exacto; D no integra por un test corregido sin resultado. Mantener CTX/E1–E4/F y `globalFull:false`.

## Segundo corte · 25/11/2026

- #118: CI 45561936867 superada para dcf5698, revisión no registrada. Nuevo SHA 2d4e57b444a5de95a9d64de61ea8874db453800f incorpora validación de raíces de la misma partición, ruta Writer concreta, selección exacta y recuperación nativa por lote. CI 45565748323 pendiente; pruebas negativas específicas y revisión por verificar.
- #117: SHA 86476085528c031ef6035bdc56246d379a095222, corrección de equivalencias de identidad y relectura de política tras el recibo, con regresiones de prueba. CI 45565786394 pendiente. No resuelve aún la generación de recibos firmados por el producto, la vía explícita alcanzable ni recuperación de planes históricos.
- #120: ensayo sintético de catálogos, CI previa 45562052657 falló por la expectativa heredada de selección Todo (no prueba fallo del caso C2). SHA 987b5d6710af04eb0bd54bc4bf4d778bc06f6 incorpora la corrección de prueba de #118 en la rama experimental; CI 45565849123 pendiente. No ejecutar NVIDIA hasta base admitida.
- B0 sigue bloqueado por #115, CI fallida y observaciones de revisión vigentes; no trasladar a la rama del plan hasta admisión. E debe contrastar las reparaciones con los SHA nuevos. Sin nuevos ensayos reales; mantener los 30 estados y globalFull:false.

## Tercer corte · 25/11/2026

- #115 `4e5a0775889ade8d4917a1f14d4118aeeff03573`: [CI 45606097389](https://github.com/asenbanskaliev/ASEN/actions/runs/45606097389) y [Release Gate 45606097305](https://github.com/asenbanskaliev/ASEN/actions/runs/45606097305) correctos. Inventario grande, finales de línea Git, aislamiento y espera de terminales incorporados; ocho hilos históricos aún abiertos al corte. No confundir la CI con aceptación funcional.
- #120 integrada en #117 mediante `f2da503de120c20f60be1b7e3b3496fc03c3d917`; pruebas sintéticas de catálogos 1/2/3 y selección Todo exacta. #117 reconciliada con #115 en `9c0c1680573be790bb9fb64ec4dd2ea7de70995e`, [CI 45606204819](https://github.com/asenbanskaliev/ASEN/actions/runs/45606204819) y [Release Gate 45606204831](https://github.com/asenbanskaliev/ASEN/actions/runs/45606204831) correctos, cuatro hilos resueltos. Todavía no integrada en #115.
- E2A: los runs [45602238557](https://github.com/asenbanskaliev/ASEN/actions/runs/45602238557) y [45606097366](https://github.com/asenbanskaliev/ASEN/actions/runs/45606097366) **omitieron** el paso de inferencia y la subida del recibo. El resultado verde no prueba ejecución real. El histórico 45467138376 sí ejecutó el paso y publicó artefacto 14954894051; su SHA no es el actual.
- E3: el histórico 45491178357 ejecutó el paso y publicó artefacto 14966716482. La autorización de SHA exacto para #117 ha iniciado [45609633761](https://github.com/asenbanskaliev/ASEN/actions/runs/45609633761); comprobación de autorización superada, pruebas sin modelos en curso al corte. No declarar PASS sin recibo y paso de inferencia completado. Identidad del descriptor solicitado no equivale a identidad física del proveedor.
- [#125](https://github.com/asenbanskaliev/ASEN/pull/125) `8d6bde8bd7e49e9bb539c3457503005b7fbd0ee9`: reemplaza marcador E2A por etiqueta SHA, exige CI y Release Gate, desactiva reintentos, espera ambos terminales y prueba recuperación parcial en ambos órdenes. Pendiente CI y revisión; no altera #117 durante E3 ni inicia inferencia. Integrar posteriormente sin duplicar #123/#124; comprobar diferencias residuales antes de cerrar esas PR.
- Mantener estados originales de las 30 filas. P01/P02/P04 avanzan con pruebas sin modelos; P03/P05/P06 conservan aceptación pendiente. E2A y E3 aislados no demuestran recorrido integral, coste ni autonomía de producción. No fusionar main ni marcar globalFull:true.

## Cuarto corte · 25/11/2026 — Megatanda B + C1/C2

- #117 `9c0c1680573be790bb9fb64ec4dd2ea7de70995e`: [E3 real 45609633761](https://github.com/asenbanskaliev/ASEN/actions/runs/45609633761), job 139189494062, artefacto 15020006011. Logs: PASS_REAL_FOCUSED_NVIDIA_FIX_TEST_ONLY; cuatro revisiones reales, FAIL/FAIL antes y PASS/PASS después; Fix Lightning nativo, una escritura exacta, cero errores, pruebas firmadas. Los cuatro diagnósticos de juez tienen identityEvidence=requested-descriptor-only, no se ha verificado identidad física del proveedor. Coste desconocido, consentimiento instrumentado, fixture separada de E2A. CI y Release Gate correctos, cuatro hilos resueltos. Integrada en #115 mediante `950e4a05b0112dbb557431d24cf1991b90172d94`; no fusionada en main.
- #125: CI correcta en `8d6bde8bd7e49e9bb539c3457503005b7fbd0ee9`, reconciliada con #117 integrada mediante `6ce4dc83d75915176623b3b37269fee9832cf1e8`. Nuevo SHA `4e00228a8c1d7f8ca6c317198c33c2908c9559b2` añade continuación C1/C2 al mismo candidato de los dos Writers: prueba Node conjunta, recibo firmado exacto, revisión proporcional explícita, integración únicamente en rama sintética, sucesora ligada al candidato y lectura en proceso nuevo sin credenciales ni autoridad. Compilación del ensayo en CI antes de inferencia. Todavía no se ha ejecutado ese SHA; requiere CI, revisión e integración en #115 antes de etiqueta E2A exacta.
- El nuevo ensayo no lanza la tercera escritura, no ejecuta jueces adicionales ni prueba la decisión natural del orquestador. No acredita recorrido integral E1/CTX/E4, independencia física, medición A/B ni aceptación de producción. Mantener las 30 filas conservadoras y globalFull:false.

## Quinto corte · 25/11/2026 — Estabilización + autonomía

- #125 integrada en #115 mediante de617bc43a95662fe1aaf17652963f86c1be0f52. #115 `bfa172e6326ef3cb43aa325768b36b36e688c373` amplía E2A/C1/C2 a sucesora con consentimiento nuevo, recibo autenticado, rechazo de duplicado y tiempos individuales, lote y solape; pruebas de regresión incluidas. [Release Gate 45617772715](https://github.com/asenbanskaliev/ASEN/actions/runs/45617772715), Pi 1.2, arquitectura y CI rápida correctos; [CI 45617772652](https://github.com/asenbanskaliev/ASEN/actions/runs/45617772652) en curso al corte. No se ha ejecutado NVIDIA sobre este SHA.
- #115: 94/94 hilos resueltos tras contrastar ocho históricos con el código y E3 real. Identidad física del proveedor NO verificada: requested-descriptor-only es una limitación explícita, no una aceptación de independencia real. Cierre de hilos no equivale a revisión independiente del SHA final.
- [#126](https://github.com/asenbanskaliev/ASEN/pull/126) `bff113d835ef4dc1b35d16fe97ac727834933767`: agrupa estabilización y E1. Avisos monotónicos, metadatos exactos de altas Git, aislamiento del candidato frente a GIT_DIR/GIT_WORK_TREE y clasificación de HTTP sin cambio de modelo por errores inválidos. Conserva causas específicas de cuota y contexto. Regresiones nuevas. Ensayo E1 Pi real preparado: petición directa, aclaración natural única y propuesta de Writer sin permiso. No se entrega DAG ni hechos ODD al padre. Host instrumentado sin agentes hijos, sin ejecución de escritura. CI y Release Gate exactos antes de etiqueta asen-e1-SHA; sin reintentos. No acreditar resultado antes de recibir recibo.
- #122/#123/#124 permanecen abiertas hasta comprobar residuales y CI de #126. No fusionar sus ramas conflictivas por duplicado. Cerrar con referencia a pruebas y commits que las sustituyan cuando corresponda.
- Pendientes E1: Explorer real con presupuesto, cambio de perfil y reanudación, rechazo de escritura en host real, fallo real de modelo/alternativa autorizada. CTX-2 modular ya implementado; medición y comprobación natural pendientes. E2A 2+1 real, E3 sobre mismo candidato, E4/F aún no aceptados. No elevar filas sin evidencia; globalFull:false.

## Sexto corte · 25/11/2026 — Evidencia parcial real y consolidación

- #115 `bfa172e6326ef3cb43aa325768b36b36e688c373`: [CI 45617772652](https://github.com/asenbanskaliev/ASEN/actions/runs/45617772652) y Release Gate completos con éxito. 94/94 hilos históricos resueltos.
- [E2A/C1/C2/C3 real 45631298486](https://github.com/asenbanskaliev/ASEN/actions/runs/45631298486), job 139264895638, artefacto 15030278677: resultado global BLOCKED, etapa successor-terminal. Pruebas previas: 62/62. Dos Writers NVIDIA verificados, una escritura exacta cada uno, cero errores de herramienta, dos recibos, candidato conjunto 4f7896d5d65848c41be237add4b39cb24333bd36, árbol 65863e5e8c02f5392635b2ac578dba24e440e660, dos pruebas conjuntas y recibo firmado, integración sintética consentida, reinicio independiente verificado. La sucesora fue rechazada inicialmente sin ejecución y después iniciada con nueva autorización. No se acreditó su terminación, ni pruebas finales ni rechazo de duplicado real. Duraciones observadas: 2461 y 2756 ms, lote 3375 ms, solapamiento 1843 ms; no es comparación A/B ni coste verificado. Revisión proporcional mediante pruebas conjuntas, no independiente. No promover aceptación global.
- #126 `7f53c1bb3c370ee3d4e1975813c2d404eb868844`: corrige colisión de directorios temporales de Windows (23 fallos en CI anterior), candidato de lectura, selección canónica de Explorer NVIDIA y comprobación de sucesoras; añade diagnóstico cerrado de C3, pruebas de perfil y presupuesto, ensayo natural E1 y Explorer real preparado. CI rápida, Release Gate, arquitectura, Pi 1.2 y prueba integrada sin modelos correctos; [CI 45631983216](https://github.com/asenbanskaliev/ASEN/actions/runs/45631983216) en curso al corte. No se ha probado el nuevo SHA con NVIDIA. La causa exacta del fallo C3 sigue sin determinar; el diagnóstico no equivale a corrección demostrada.
- #123 cerrada por sustitución documentada, no fusionada. Independencia física de jueces sigue pendiente. #122 y #124 abiertas hasta cierre de validación y comprobación de residuos. No repetir E2A sobre SHA ya consumido; nueva autorización exacta tras consolidar código.
- E1, CTX-2, E4/F, A/B, aceptación final y globalFull:true siguen pendientes según sus evidencias. No cambiar las filas sin cumplir sus criterios.

## Cierre

Solo marcar `globalFull:true` cuando las treinta filas tengan evidencia positiva adecuada a sus criterios, y exista un recorrido auténtico completo desde Pi, con revisión independiente, CI y Release Gate sobre el **mismo SHA final**. Sin aprobación humana de integración no se fusiona en `main`.

**Próxima prioridad:** cerrar B0 sobre los SHA exactos → B+ (identidad e independencia) → C1 (recuperación) → C2 (recorrido integral, requisitos E1/CTX-2 pendientes incluidos) → C3 (paralelismo condicionado) → E4/F, A/B, sistemas y auditoría final. P06 transversal.
