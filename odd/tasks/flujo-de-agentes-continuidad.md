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
- **C.1 — Paridad de interfaz T11**: nuevo trabajo prioritario tras C y antes del cierre visual de T07. Fuente fijada Gentle Shell 4.8.0, lateral real y distribución por ancho, barra, panel, presets, pruebas Pi 1.2.0. Documento: [T11](./flujo-de-agentes-t11-layout-gentle-shell-4.8.0.md). **Estado PENDIENTE**: análisis documentado; no hay implementación ni prueba visual certificada.
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


## 17/11/2026 — Reparación de CI de la tanda C

SHA diagnosticado: `fd379be1a08bd43bd6da3b6b79d19d1c0d6280e4`. CI 44033273062 falló en Linux, macOS y Windows por la misma prueba de navegación del panel: esperaba dos llamadas al cierre del host tras cerrar ya el componente. La nueva gestión de temporizador dispone el componente al cerrar y correctamente ignora entradas posteriores. Se conserva el cierre único y se añade comprobación de que tampoco refresca después de cerrar. RED observado en los tres sistemas; GREEN pendiente de CI del commit de reparación. Phase 0, Pi 1.2 y Release Gate del SHA diagnosticado correctos. No se avanza a D hasta verificar el nuevo SHA; no se ejecuta manualmente ningún proveedor ni se aprueba entorno.

## 17/11/2026 — Alta T11: experiencia y distribución visual Gentle Shell 4.8.0

Se fija la referencia oficial `v4.8.0`, commit `3dc9029755912358d0a172b4972e5842c239570c`, **no la rama main ni una descripción genérica de otras versiones**. La referencia usa lateral real a partir de 140 columnas, un resumen y hoja completa en pantalla estrecha, barras de estado adaptables y tres perfiles visuales. ASEN tiene ahora seis secciones en panel nativo y `renderM1Surface`, pero con ancho >=140 coloca una lista encima del editor, no un lateral Pi real. El host status conserva coste y cuota como `unavailable` hasta observación válida. El diseño y la matriz de aceptación se documentan en [T11](./flujo-de-agentes-t11-layout-gentle-shell-4.8.0.md).

Estado **T11: ANALIZADO_Y_PLANIFICADO_PENDIENTE_DE_IMPLEMENTACIÓN**. Próxima acción automática: T11-A (pruebas RED de layout y host, arquitectura Pi 1.2 sin modificar internals no validados) antes de T11-B/C/D; repetir sólo las pruebas de modelo necesarias, no la prueba Writer protegida por cambios puramente visuales. `globalFull:false`.

## 17/11/2026 — Ejecución inmediata de T11, fallo RED confirmado por Pi auténtico

Solicitud del usuario: ejecutar ya la tarea horaria. En la PR #61, SHA `d05f98dab5c333333a2c11263b4cb7f7b56c0265`, CI 44077832393, prueba `tests/t11-native-rail-host.test.ts` **FALLÓ** al observar Pi 1.2 en `fullscreen`: `baselineWidth=180`, `withRailWidth=180`, `realReservation=0`; `layoutRoot[NODE]` producía `vstack` y `rail:auto`. Las pruebas de doble columna simuladas NO son evidencia del host. Se añade diagnóstico de tema real y se separa la instalación del encabezado/lateral del requisito `ctx.ui.theme instanceof Theme`, con rechazo conservado si `setTheme` real falla. Esto es una hipótesis de raíz compatible con la fachada de tema de Pi; **no es un pase demostrado**. Nueva compilación/CI y prueba real deben mostrar ancho reservado ~53, cambio 180→139→180 y estilo ASEN antes de cerrar la tanda. Sin cambio en permisos, Workers, proveedor ni aceptación; `globalFull:false`, PR sin fusionar.
