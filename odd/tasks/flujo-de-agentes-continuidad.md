# Continuidad autónoma del plan «Flujo de agentes» — ASEN

Estado del plan: **PREPARADO PARA TANDA A**; ningún arreglo nuevo se acredita por crear este documento.
Fecha del diagnóstico: 2026-11-16. Fuente histórica: \`eaed07883703461ee225d61540265b1e478217e2\`.
PR objetivo: https://github.com/asenbanskaliev/ASEN/pull/61
Rama de trabajo exclusiva: \`feat/flujo-de-agentes-20261115\`.
Rama padre: \`feat/t12-integrated-acceptance-merge\`.
Informe íntegro: [auditoría independiente](../../docs/audit/auditoria-independiente-flujo-agentes-pr61-20261116.md)
Plan rector: [flujo-de-agentes.md](./flujo-de-agentes.md)

## Cola priorizada y relación con la auditoría

- **A — Bloqueo antes de escritura**: N1 + P1/P2/P5 + T06. Prioridad CRÍTICA DE OPERACIÓN. Pendiente; evitar repetir prueba pagada hasta pruebas negativas locales.
- **B — Ciclo de vida Pi/cancelación**: N7/N8 y hallazgos 2/3/8 + P4/P6/P7 + T01/T02/T08. Pendiente, después de A.
- **C — T06 + T07 conectados**: N2/N3 + P3/P8; unión real de sesiones/estado, actualización de paneles y TUI. Pendiente; tests de simulación insuficientes.
- **D — ODD, revisión y Fix**: N4/N5 y hallazgos 5/6/7 + P9 + T03/T04/T05/T08. Pendiente; las condiciones de aceptación humanas se mantienen.
- **E — Seguridad, regresión y auditoría**: N6 y hallazgos pendientes + P10 + T09/T10. Pendiente.
- **F — A/B y equivalencia**: mediciones auténticas y cierre T09/T10. Pendiente.

## Bitácora mínima de cada ejecución

Usar este formato y mantener solo hechos demostrados:

| Ejecución (hora España) | Tanda | SHA inicial → final | Cambios | RED/GREEN/CI/Gates | Estado | Siguiente decisión |
|---|---|---|---|---|---|---|
| 2026-11-16 · configuración inicial | preparación | \`eaed078…\` → commit de plan | Guardado de auditoría y plan, sin correcciones funcionales | No aplican pruebas de producto | PREPARADO | A |

## Límites de autonomía

**Permitido sin nuevas consultas:** auditar código, planificar, agrupar, editar código y pruebas en rama de desarrollo de la PR #61, publicar commits, comprobar resultados y reparar CI. Todo con controles de identidad/seguridad existentes.

**No permitido sin consentimiento válido y específico:** iniciar proveedores con coste/desconocido, aprobar entornos protegidos de GitHub, saltar gates, usar secretos nuevos, editar otras ramas, fusionar PR/main, borrar datos o reintentar ejecuciones Writer cuyo resultado sea incierto.

**Si una tanda queda bloqueada:** registrar causa y seguir con tareas **independientes** y seguras, sin rebajar prioridades ni cambiar artificialmente a FULL. Si la PR, la rama o el SHA cambian por otro actor, releer y reconciliar antes de escribir; no sobrescribir.

**Criterio global:** ningún cierre de T06/T07 por el ensayo externo aislado. Requiere ruta Pi/TUI real conectada, una sola escritura cuando se exige, modelo autenticado, permisos individuales, estado durable y revisión verificable. \`globalFull:false\` hasta ese punto.

## 2026-11-17 — Primer avance de la tanda A

Usuario: NVIDIA autorizado para ensayos del plan; evitar gasto ilimitado y mantener el consentimiento individual exigido por el flujo. SHA de código de T06: \`061d7dd8ebb8707ed0a8d57fd0ca78e8ad902f21\`.

La extensión \`extensions/authority.ts\` aplica \`oneShotWritePath\` **solo cuando el ensayo T06 lo solicita**. El primer evento \`tool_call\` válido consume un permiso no renovable; el siguiente \`write\` o cualquier \`edit\` queda bloqueado antes de su ejecución. Se actualizó el SHA256 de autoridad verificada en el runner. Writers sin la opción mantienen su comportamiento.

Pruebas negativas incorporadas: edición antes/después de write, segundo write, error sin resultado, ruta no permitida, política falsa y Writer normal sin límite nuevo. **Estado: IMPLEMENTADO_PENDIENTE_CI**, no afirmar prueba real NVIDIA ni cierre T06.


## 2026-11-17 — Pruebas A + B de recuperación, primera corrección

SHA inicial: `7d7f7dcaae0d1047ef4a6a78c2eb92ad6407e751`. SHA final: consultar HEAD de la PR #61 tras publicar.
La comprobación anterior (CI, Pi 1.2 y Release Gate) del SHA inicial estaba correcta; no prueba las nuevas modificaciones.

- **A:** reserva `O_EXCL` en fichero privado antes de `write`, exclusiva de `oneShotWritePath`. Un reinicio con el mismo diario no recupera el permiso. Se deniega el intento si falla la reserva. La opción solo se activa para el ensayo T06; no altera Writers ordinarios.
- **Pruebas A:** segundo `write`, `edit`, cambio de ruta, reinicio con identidad repetida, configuración sin reserva, dos extensiones sobre la misma reserva y fallo ambiguo sin `tool_result`.
- **B:** nueva prueba con dos procesos Pi RPC instrumentados independientes, cancelando uno y comprobando que el otro termina. No equivale a dos modelos reales ni a ensayos Writer auténticos.
- **Estado al redactar:** IMPLEMENTADO_PENDIENTE_CI. RED no ejecutado aisladamente; GREEN, CI multiplataforma y Release Gate deben comprobarse sobre el nuevo SHA. `globalFull:false`. Ninguna aprobación humana simulada ni coste de proveedor.
- **Siguiente paso:** cotejar los resultados exact-SHA; después continuar B con pruebas negativas de reinicio, modelo alternativo y cierres ambiguos antes de C + D.

## 17/11/2026 — Tanda B: eventos posteriores a cancelación

Tras la reserva persistente de la tanda A, se detecta que \`PiProcessRunner\` podía continuar analizando el mismo bloque \`stdout\` tras \`AbortSignal.abort()\` desde un observador de herramienta. El texto de respuesta no se aceptaba como éxito, pero el observador podía recibir falsos eventos posteriores al instante de cancelación.

Corrección: dejar de procesar los eventos que queden en ese bloque o lleguen después de solicitar parada; en \`child.on("error")\`, usar el cierre del árbol de procesos antes de resolver. Prueba negativa con eventos \`tool_execution_start\` y \`tool_execution_end\` coalescidos, cancelación síncrona durante el primero y comprobación de que el segundo no se entrega.

**Estado:** IMPLEMENTADO_PENDIENTE_CI del SHA nuevo. No certifica recuperación del proceso productivo tras reinicios ni reutilización segura de Writers. No se ejecutan modelos de pago.

## 17/11/2026 — Tanda C, conexión viva T06 + T07

Comprobado en código: \`readAgentFlowPanelObservation\` ya une diarios de origen, Todo hijo, enlace Todo/Agent y registros de \`AgentRuntime\` mediante lecturas persistentes. Sin embargo, \`/asen-panel\` creaba una fotografía inmóvil al abrir el modal.

Cambio: el panel nativo observa de nuevo los registros persistidos cada cinco segundos **solo mientras permanece abierto**, y ofrece \`r\` para refrescar al instante. No reenvía solicitudes ni activa permisos. Una lectura fallida elimina el estado antiguo de los Workers, marcándolo como no disponible. Si cambia la sesión, se cierra y no presenta información ajena. El temporizador se cancela también cuando el host cierra o abandona el modal. Los datos de la barra inferior se refrescan únicamente tras aplicar una observación válida.

Pruebas nuevas: \`running\` → \`completed\` con cambios Git pendientes, Worker fallido, lectura corrupta sin estado antiguo, cambio de sesión durante la lectura y cierre sin relectura. Son pruebas del código del panel, **no** una certificación Pi TUI real con dos modelos. Estado: IMPLEMENTADO_PENDIENTE_CI; \`globalFull:false\`.

