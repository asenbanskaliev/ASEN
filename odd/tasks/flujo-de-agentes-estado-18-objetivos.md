# ASEN — Estado verificable de los 18 objetivos

**Fecha de línea base auditada:** 20/11/2026 · **Actualización operativa:** 21/11/2026. **Código de referencia:** `daa250a80b58d80c48336ac017deaf8e68cc396c`. **Rama:** `feat/flujo-de-agentes-20261115`. **PR:** #61 (borrador; no fusionar).

**Auditoría de cada punto:** [análisis de código y pruebas](../../docs/audit/auditoria-detallada-codigo-y-plan-18-ctx-2026-11-20.md). **Plan ejecutable:** [plan final, apartado 13](../../docs/plan-final-opt-contexto-y-agentes-2026-11-20.md#13-auditoría-de-coherencia-contra-el-código-de-los-18-objetivos-actualización-vinculante).

**Prioridad actual (21/11):** PRE-0/PRE-1 incorporados con CI verde en `ae14e10d`; CTX-0 añade pruebas sintéticas en `508b31f5`. CTX-1 requiere verificar Pi real mediante PR #66. Las fases E4/F y la equivalencia de ejecución completa siguen abiertas. Las pruebas simuladas no prueban por sí solas un flujo real.

**Importante:** lo publicado en GitHub no equivale a trabajo validado. Todos los estados de esta matriz son conservadores. Ninguna prueba simulada demuestra por sí sola el comportamiento con proveedores reales. **`globalFull:false`**.

| Nº | Objetivo para el usuario | Estado de implantación | Falta para cerrarlo |
| --- | --- | --- | --- |
| 01 | Decidir cuándo ASEN resuelve y cuándo delega | Parcial, ruta ODD implementada | Probar decisión Pi real frente a guía del padre y contexto simple, ambiguo o de riesgo alto |
| 02 | Dos modos: normal y delegación completa | Modos conectados; aceptación pendiente | Probar `organic` y `full-delegation`, cambio de perfil y prohibición efectiva de escribir en modo completo |
| 03 | Investigar solo cuando hace falta | Presupuesto y Explorer conectados; aceptación pendiente | Acreditar 3 lecturas/40 KiB, utilidad, identidad y consumo real de Explorer sin duplicar lanzamientos |
| 04 | Separar tareas y dependencias | Plan y dependencias presentes; decisión real pendiente | Probar dos unidades independientes y una dependiente, sin trocear artificialmente por archivos |
| 05 | Dos agentes de escritura trabajando a la vez | Supervisor y carpetas aisladas probados localmente | Dos procesos Writer autenticados solapados; por ahora persiste confirmación exacta por Worker |
| 06 | Solicitar ampliación de archivos sin conceder permisos | Controles de ámbito implementados; aceptación pendiente | Probar permiso nuevo y rechazo tras ampliar rutas, cambiar candidato o variar SHA |
| 07 | Recibir cada resultado una sola vez | Diario y avisos conectados; aceptación pendiente | Entregar una vez con padre ocupado, duplicación, cancelación y reinicio real |
| 08 | Continuar después de un fallo seguro | Reconciliación y continuidad conectadas; aceptación pendiente | Continuar otras unidades seguras sin repetir ninguna escritura de resultado incierto |
| 09 | Cambiar de modelo cuando falla | Alternativas de modelos y esperas presentes | Comprobar 429, credenciales, modelo efectivo, reintentos y coste observado o desconocido |
| 10 | Usar el modelo principal del perfil | Modelo de perfil integrado; aceptación pendiente | Confirmar en Pi autenticado el modelo realmente usado; respetar sesión reanudada |
| 11 | Verificar según los riesgos del cambio | Seis riesgos y política de Verifier presentes | Demostrar que la decisión se aplica en el ejecutor y no se limita a un aviso |
| 12 | Una revisión completa del cambio | Revisión ordinaria con recibo conectada | Probar candidato congelado, interrupción, resultado y aceptación humana separada |
| 13 | Dos jueces y correcciones limitadas | Dos jueces y límite de dos rondas implementados | Comprobar hallazgos, discrepancia, Fix autorizado y prueba nueva del límite de rondas |
| 14 | Preguntar lo imprescindible y seguir | Entrada natural y Clarifier presentes | Demostrar pregunta única, respuesta, cancelación y reanudación sin inferir permisos |
| 15 | Mantener la seguridad y el control de cambios | PRE-0/PRE-1 corregidos e integrados; CI y arquitectura correctos en `ae14e10d` | Mantener controles de regresión en nuevos SHA, probar consentimiento real y no asumir aceptación E4/F |
| 16 | Medir velocidad, consumo, calidad y costes | P16: 18 sesiones Pi auténticas de solo lectura; paridad no probada | A/B completo con condiciones comparables, orquestación, hijos, tokens, caché y coste observable |
| 17 | Probar todo el recorrido con modelos reales | Pruebas locales y verificador de evidencias presentes | Dos Writers reales, dos jueces, permisos exactos, pruebas conjuntas, revisión y aceptación auténtica |
| 18 | Comprobar la compatibilidad real de Pi | Host >=1.2, paquete fijado 1.2.0; matriz parcial | 3 sistemas operativos × 4 modos con Pi 1.2.0 exacto; otras versiones requieren matriz propia |

## Avances comprobables de esta tanda

- Selección de modelos configurados, también cuando su tarifa no sea cero: `startup-orchestrator-model.ts` y `pi-agent-tools.ts`.
- Dos modos de perfil y prohibición de edición directa del padre en delegación completa: `profiles.ts`, `primary-tool-policy.ts` y `extensions/asen.ts`.
- Trabajo de lectura en paralelo y cola de señales pendientes: `plan-dispatcher.ts`, `plan-advance-queue.ts` y pruebas específicas.
- Modelos y ámbitos Writer vuelven a comprobarse antes del despacho; **no** se ha introducido ninguna aprobación automática de escritura.
- Serie de comparación repetible de 18 ejecuciones: `agent-flow-series-comparison.ts`; se mantiene `acceptance:not-accepted`.
- Supervisión de dos Writers, preparación de carpetas Git y comprobación de ámbitos ya existen, pero todavía exigen pasos manuales; no confundir su presencia con E2A terminada.

## Condiciones innegociables de cierre

1. CI sin fallos para un único SHA en Windows, macOS y Linux; Pi 1.2 y puertas de publicación correctas.
2. Revisión independiente nueva sobre ese SHA, sin fallos graves abiertos.
3. Demostración con dos procesos reales de escritura aislados, autorización exacta y ejecución simultánea; ningún resultado ambiguo se repite.
4. Resultado completo de las 18 filas con evidencia identificable por versión; pruebas omitidas, en espera o simuladas no acreditan equivalencia real.
5. No fusionar la PR ni fijar `globalFull:true` sin evidencias y decisión humana.

**Orden actualizado (21/11):** PRE-0/PRE-1 integrados → CTX-0 pruebas sintéticas (medición real pendiente) → CTX-1 verificación de SDK mediante PR #66 → E1A/E1B y CTX-1/2 sin editar los mismos archivos a la vez → E2A/E2B → E3 → E4/CTX-5 → auditoría F/CTX-6. CTX-3 solo si hay duplicados probados; CTX-4 opcional. `globalFull:false`.
