# ASEN — Matriz de aceptación de 18 objetivos y 12 puntos adicionales

**Fecha:** 2026-11-23  
**Rama de integración:** `integration/megatanda-1-3-20261123`  
**SHA de las pruebas reales:** `4f1ff965592c6fdd45ae9529f8d123a24e3ef422`  
**Estado global:** `globalFull:false`

Esta matriz separa código implementado, pruebas ejecutadas y aceptación final. Una prueba omitida no se considera superada.

## 18 objetivos

| Nº | Objetivo | Estado actual | Evidencia o bloqueo |
|---:|---|---|---|
| 1 | Estabilización de Verifier y contratos ODD | PARCIAL | PR #100; typecheck, pruebas focalizadas y suite local correctas. Falta CI completa sobre el SHA integrado. |
| 2 | Verifier obligatorio para riesgos altos | IMPLEMENTADO_PENDIENTE_REVISIÓN | Código y pruebas negativas en PR #100. Falta revisión independiente. |
| 3 | Rechazo de resultados incompletos o no verificables | IMPLEMENTADO_PENDIENTE_REVISIÓN | Contratos de evidencia y pruebas locales. Falta revisión externa admisible. |
| 4 | Decisión automática entre uno o varios agentes | PARCIAL | Contratos documentados; falta demostrar la decisión automática en una petición real completa. |
| 5 | División por unidades independientes y dependencias | PARCIAL | PR #101 documenta ámbitos y dependencias. Falta ejecución automática completa. |
| 6 | Dos Writers Pi auténticos en paralelo | COMPLETADO_PARA_EL_ALCANCE | Actions 45244576827: dos procesos NVIDIA, paralelismo e aislamiento confirmados. |
| 7 | Aislamiento de archivos y permisos | COMPLETADO_PARA_EL_ALCANCE | Recibo Writer: `a.txt` y `b.txt`, alcance exacto, una escritura nativa por agente. |
| 8 | Recuperación tras interrupción | COMPLETADO_PARA_EL_ALCANCE | Actions 45244576827: `planned → running → blocked → running → done`. |
| 9 | No repetir escrituras con resultado incierto | PARCIAL | La prueba real no duplicó efectos; falta demostrarlo en el flujo padre automático y con fallos de escritura. |
| 10 | Selección y recuperación de modelos | PARCIAL | NVIDIA explícito y observado. Falta validar las alternativas configuradas y sus límites. |
| 11 | Medición de tiempo, coste y calidad | PARCIAL | Hay tiempos y recibos. `costVerified:false`; falta medición comparable completa. |
| 12 | Entrega y consumo real de notificaciones por el padre | BLOQUEADO | Falta una prueba completa padre-hijo donde el padre consuma el resultado terminal. |
| 13 | Verificación independiente por riesgo | PARCIAL | Implementada la política y las pruebas locales. Falta revisor independiente admitido. |
| 14 | Doble juicio y máximo de dos rondas | BLOQUEADO | No hay evidencia final de dos jueces independientes sobre esta integración. |
| 15 | Corrección mediante nueva tarea ODD | PARCIAL | Existen contratos y diarios de reparación. Falta demostrar el ciclo completo con hallazgo real. |
| 16 | Comparación equivalente con Gentle Shell | BLOQUEADO | Faltan los casos comparables completos Shell/ASEN y sus recibos. |
| 17 | Compatibilidad Linux, Windows y macOS | BLOQUEADO | La prueba autenticada actual es Ubuntu. Faltan comprobaciones equivalentes en los otros sistemas. |
| 18 | Integración y aceptación final | BLOQUEADO | PR #103 abierta; faltan CI, Arquitectura, Release Gate, revisión y matriz final aprobada. |

## 12 puntos adicionales

| Nº | Punto adicional | Estado actual | Evidencia o bloqueo |
|---:|---|---|---|
| A1 | Rama y PR aisladas | COMPLETADO | PR #103 abierta contra rama de desarrollo; sin fusión en `main`. |
| A2 | SHA exacto en las pruebas | COMPLETADO | Writer y recuperación comprueban el SHA del candidato. |
| A3 | Permisos válidos y alcance limitado | COMPLETADO_PARA_EL_ALCANCE | Workflows con permisos mínimos y archivos separados. |
| A4 | Prohibición de fusión automática | COMPLETADO | Ninguna PR se ha fusionado en `main`. |
| A5 | Proveedor y modelo explícitos | COMPLETADO_PARA_EL_ALCANCE | NVIDIA/Nemotron observado en ambos recibos. |
| A6 | Credenciales fuera de recibos | COMPLETADO_PARA_EL_ALCANCE | Los artefactos no contienen claves ni texto completo del modelo. |
| A7 | Recibos verificables | COMPLETADO_PARA_EL_ALCANCE | Artefactos 14851878420 y 14853301511 con huellas SHA-256. |
| A8 | Omitidas separadas de superadas | COMPLETADO | La documentación mantiene `skipped` fuera de los resultados correctos. |
| A9 | Límites de tiempo y reintentos | PARCIAL | Hay límites de ejecución. Falta validar límites completos de coste y sustitución. |
| A10 | Documentación con referencias exactas | IMPLEMENTADO | Esta matriz incorpora SHA, PR y ejecuciones. Falta actualizarla tras cada gate final. |
| A11 | Revisión independiente | BLOQUEADO | CodeRabbit no pudo iniciarse porque su instalador intenta enviar telemetría externa no autorizada. |
| A12 | Estado global seguro | COMPLETADO | `globalFull:false` se mantiene. |

## Evidencia real principal

- [PR #103 — integración de megatandas 1–3](https://github.com/asenbanskaliev/ASEN/pull/103)
- [Actions 45244576827 — Writers y recuperación](https://github.com/asenbanskaliev/ASEN/actions/runs/45244576827)
- PR #100 — estabilización y Verifier.
- PR #101 — continuidad y agentes paralelos.
- PR #102 — pruebas NVIDIA y recuperación.

## Condición para cerrar la matriz

No se puede cambiar ningún estado global a FULL hasta completar, sobre un único SHA integrado:

1. CI completa.
2. Arquitectura.
3. Release Gate.
4. Revisión independiente.
5. Flujo padre-hijos completo.
6. Comparación Shell/ASEN.
7. Matriz Linux/Windows/macOS.
8. Aceptación final de los 18 objetivos y 12 puntos.
