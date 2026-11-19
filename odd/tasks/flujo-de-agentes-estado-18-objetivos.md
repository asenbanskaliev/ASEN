# ASEN — Estado verificable de los 18 objetivos

**Fecha:** 19 de noviembre de 2026. **Rama:** `feat/flujo-de-agentes-20261115`. **PR:** #61 (borrador; no fusionar).

**Importante:** lo publicado en GitHub no equivale a trabajo validado. Todos los estados de esta matriz son conservadores. Ninguna prueba simulada demuestra por sí sola el comportamiento con proveedores reales. **`globalFull:false`**.

| Nº | Objetivo para el usuario | Estado de implantación | Falta para cerrarlo |
| --- | --- | --- | --- |
| 01 | Decidir cuándo ASEN resuelve y cuándo delega | Parcial | Demostrar decisiones automáticas y repetibles, no solo sugerencias de texto |
| 02 | Dos modos: normal y delegación completa | Código conectado; pendiente de validación final | Comprobar ambos modos con la misma petición y permisos reales |
| 03 | Investigar solo cuando hace falta | Parcial | Contrastar presupuesto y utilidad del investigador en Pi auténtico |
| 04 | Separar tareas y dependencias | Parcial | Partir tareas complejas en unidades verdaderamente independientes, sin trocear por archivos |
| 05 | Dos agentes de escritura trabajando a la vez | Pendiente | Preparar y lanzar las dos sesiones Pi aisladas sin adjuntarlas manualmente; demostrar solape real |
| 06 | Solicitar ampliación de archivos sin conceder permisos | Parcial | Propuesta exacta, revisión del nuevo alcance y consentimiento independiente |
| 07 | Recibir cada resultado una sola vez | Código conectado; pruebas pendientes | Demostrar entrega única tras carrera, reinicio y cancelación |
| 08 | Continuar después de un fallo seguro | Código conectado; pruebas pendientes | Demostrar lectura independiente tras fallo y detener siempre escrituras inciertas |
| 09 | Cambiar de modelo cuando falla | Parcial | Probar credenciales, cuota y tiempos de espera con modelos del perfil; contabilizar coste real o desconocido |
| 10 | Usar el modelo principal del perfil | Código conectado; pruebas pendientes | Confirmar selección real sin modificar sesiones reanudadas |
| 11 | Verificar según los riesgos del cambio | Parcial | Conectar seis motivos de riesgo a la verificación independiente obligatoria |
| 12 | Una revisión completa del cambio | Parcial | Prueba integral del candidato congelado y recuperación de una revisión interrumpida |
| 13 | Dos jueces y correcciones limitadas | Parcial | Recibos auténticos, desacuerdos y máximo de dos rondas; nunca autocorrección sin permiso |
| 14 | Preguntar lo imprescindible y seguir | Parcial | Demostrar respuesta, cancelación y reanudación sin inferir permisos de un mensaje |
| 15 | Mantener la seguridad y el control de cambios | En verificación | CI completo por SHA y pruebas negativas sin regresión de permisos |
| 16 | Medir velocidad, consumo, calidad y costes | Comparador ampliado; sin ensayos reales | Tres escenarios × tres repeticiones con recibos auténticos de ASEN y Gentle Shell |
| 17 | Probar todo el recorrido con modelos reales | Pendiente | Dos Writers Pi auténticos, revisores, comprobaciones, consentimiento y aceptación externa |
| 18 | Comprobar la compatibilidad real de Pi | Parcial | Acreditar creación automática de sesiones hijas, permisos por lote y mismas pruebas en los tres sistemas |

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

**Prioridad del siguiente bloque:** estabilizar el CI y cerrar el ciclo Pi Writer con perfiles, sesiones aisladas y pruebas reales; después unir verificación proporcional y comparación controlada.
