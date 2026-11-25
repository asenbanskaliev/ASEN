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

## Cierre

Solo marcar `globalFull:true` cuando las treinta filas tengan evidencia positiva adecuada a sus criterios, y exista un recorrido auténtico completo desde Pi, con revisión independiente, CI y Release Gate sobre el **mismo SHA final**. Sin aprobación humana de integración no se fusiona en `main`.

**Próxima prioridad:** cerrar B0 sobre los SHA exactos → B+ (identidad e independencia) → C1 (recuperación) → C2 (recorrido integral, requisitos E1/CTX-2 pendientes incluidos) → C3 (paralelismo condicionado) → E4/F, A/B, sistemas y auditoría final. P06 transversal.
