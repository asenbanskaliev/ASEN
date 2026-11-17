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

## 17/11/2026 — T11: ensayo de geometría auténtica en Linux y ampliación a tres plataformas

- SHA verificado: `fac8c4d447b903f6108673c4a5ccd5c20ac6da72`. GitHub CI `44079047426`, Release Gate `44079047502`, Phase 0 `44079047477` y Pi runtime `44079047410` finalizaron con `success`. Pi Free Smoke `44079047403` quedó `skipped` y no se contabiliza como prueba de proveedor.
- En el trabajo Ubuntu `134024851579`, `tests/t11-native-rail-host.test.ts` ejecutó `scripts/t11-native-rail-host-check.mjs` sobre Pi 1.2 real y terminó `PASS`. La prueba obliga a reservar cerca de 53 columnas, árbol `hstack`, separación 3, lateral de 50; lo retira a 139 columnas y lo recupera a 180. No utiliza modelos.
- En ese SHA la prueba de geometría se omitía expresamente en macOS y Windows. Esta tanda habilita la misma prueba real en ambas plataformas (sin alterar código de permisos ni coste) para obtener veredicto exacto del nuevo SHA. **Estado de la nueva tanda: PENDIENTE_CI.** No declarar paridad visual global ni T07/T11 finalizadas; quedan comprobaciones de interacción, preferencias y comparación gráfica. `globalFull:false`.

## 17/11/2026 — T11, fallos reales de Windows/macOS y reparación propuesta

- Para SHA `52e1d520e3a9373f5544ebe1e90ceebaccea85f7` la prueba nativa Linux pasó. CI `44083263920` detectó que macOS no llega a iniciar Pi: `node-pty@1.1.0` termina en `posix_spawnp failed`, compatible con el problema de permiso 0644 del auxiliar `spawn-helper` (microsoft/node-pty#850/#919). La prueba nueva repara únicamente el permiso de ese auxiliar nativo instalado y rechaza su ausencia o un permiso aún incorrecto; no salta el ensayo.
- En Windows el informe real antes del agotamiento muestra 180 → 127 columnas, reserva 53, separación 3, lateral 50, retirada a 139 y restauración correcta. El proceso envolvente no finalizó antes de 125 s: el informe geométrico `PASS_REAL_PI_RAIL` no se reconoce como PASS de CI porque se agotó el tiempo. Se añade registro y exigencia de cierre observado de **ambas** sesiones Pi; solo después del registro, aserciones y liberación de temporales se cierra expresamente el controlador aislado para liberar manejadores nativos de `node-pty`.
- **Estado de la reparación: PENDIENTE_CI** del nuevo SHA. No aumentar tiempo límite ni silenciar la prueba, no cambiar credenciales/consentimiento ni llamar al proveedor. T11 visual y T07 siguen parciales, `globalFull:false`.

## 17/11/2026 — T11-D inicial: preferencias Light/Neutral/Power
- Añadida configuración versionada de presentación en `~/.asen/t11-appearance.json`, con lectura conservadora, escritura privada atómica y rechazo de enlaces o claves extra (incluidos intentos de permisos/modelos).
- Light oculta lateral fijo y resumen redundante en pantalla ancha; Neutral conserva el lateral por defecto; Power muestra más detalle de las secciones sin inventar métricas. `/asen-customize appearance` presenta selector Pi cuando hay sesión TUI; también admite elección textual explícita.
- El estado se relee al iniciar sesión y puede cambiarse sin reiniciar el host, sin alterar autorizaciones, rutas de modelo o agentes. Los datos corruptos devuelven Neutral con estado `invalid`.
- **Estado: IMPLEMENTADO_PENDIENTE_CI.** Siguen pendientes densidad configurable, posición bottom/hidden, cabecera top/split, ratón/teclado y contraste visual con la referencia. `globalFull:false`. No fusionar.

## 17/11/2026 — T11-D: prueba del comando real de preferencias
- Tras el primer commit de presets se detectó por lectura de código que el separador de argumentos podía interpretar `appearance power` como una sola cadena. Se corrige para separar espacios reales y se añade una prueba de la ruta de comandos Pi que guarda Power/Light y rechaza `super-yolo`. No se toca la política de permisos. `globalFull:false`, estado pendiente de CI del nuevo SHA.

## 17/11/2026 — T11: distribución, densidad y controles
- Corregida la prueba de inventario de `/asen-customize` que falló en CI Linux `44088781713` porque esperaba siete superficies antiguas y no incluía la entrada `appearance`.
- Se añade `~/.asen/t11-layout.json` con `schema:1` independiente de la preferencia existente de color/preset. Solo admite `position=auto/right/bottom/hidden` y `density=comfortable/compact/minimal`. El archivo se sustituye mediante temporal privado; los enlaces, datos corruptos, otras versiones o claves adicionales se rechazan.
- `/asen-customize position` y `/asen-customize density` permiten selección nativa si hay TUI, o argumentos directos para automatización explícita. El cambio se aplica al lateral en la sesión y se recupera al iniciar otra sesión. Ninguna preferencia activa herramientas, cambia la ruta de modelos ni toca los permisos Writer.
- `auto`: lateral derecho solo en fullscreen >=140 (Light lo desactiva). `right`: fuerza lateral ancho desde 140. `bottom`: reserva 8 filas bajo la conversación en fullscreen, con al menos 24 columnas y 16 filas; pantallas menores usan el panel manual. `hidden`: sin panel fijo, pero `/asen-panel` sigue disponible. El árbol de Pi se restaura al cerrar.
- `comfortable`: listado habitual; `compact`: cada sección con cabecera y hasta dos líneas reales; `minimal`: solo cabeceras y contadores del estado observado.
- Pruebas añadidas de persistencia, enlaces simbólicos, campos que intentan colar permisos, posición en 140/80 columnas, 12 filas, limpieza del árbol y misma acción de plegado mediante ratón y teclado. No ejecutan agentes ni modelos.
- **Estado al publicar: IMPLEMENTADO_PENDIENTE_CI**. El modo `bottom` requiere todavía una comprobación de geometría con Pi real en macOS, Windows y Linux. No se declara equivalencia total con Gentle Shell ni `globalFull:true`; no se fusiona la PR.

## 17/11/2026 — T11: comprobación Pi real del panel inferior
- Se amplía el ensayo nativo de `scripts/t11-native-rail-host-check.mjs`: tres sesiones reales y aisladas de Pi 1.2.0, sin modelos ni claves. Además del lateral derecho, se guarda explícitamente `position=bottom`, se comprueba composición vertical (dos elementos, ocho filas, una separación), el ancho original disponible al editor y el cambio 180 → 139 → 180. En todos los casos debe observarse cierre del proceso Pi; un informe parcial no es PASS.
- Ajustada `publishInspectedWorkRow` para que el modo `bottom` no duplique la línea de trabajo y `hidden` no muestre una barra residual. El panel manual permanece disponible.
- **Estado: PENDIENTE_CI** del nuevo SHA. La prueba exige el Pi real en Windows, macOS y Linux y no confunde un árbol simulado con geometría del host. No ampliar tiempos, desactivar pruebas ni fusionar.

## 17/11/2026 — T11: interacción directa en el lateral Pi 1.2
- Validación previa del SHA `9c91403dd944d327cc63e6497c92722d7fadb959`: `CI #44091729758` y `Release Gate #44091730318` correctos. Los trabajos nativos de geometría Pi pasaron en Linux, macOS y Windows, incluida la posición `bottom`.
- Interacción añadida en el componente real incluido en `ScrollView`: clic izquierdo sobre una cabecera plegable la abre/cierra; otros botones, filas de datos y posiciones vacías no activan acciones. La coordenada utilizada es la local al contenido que proporciona Pi 1.2 y respeta el desplazamiento del panel.
- Tras ese clic explícito, el lateral puede tomar foco para manejar **Tab/j/k/flechas** (recorrer secciones), **espacio/Enter** (plegar) y **Escape/q** (volver al editor). Se restaura el foco al ocultar el lateral, salir de pantalla completa, redimensionar o cerrar sesión. No se ejecutan comandos ni agentes, no hay aceptación de revisión ni concesión Writer.
- Los encabezados se generan desde `renderAsenPanelWithLayout` para respetar los mismos datos y plegados en `comfortable/compact/minimal`. Una nueva prueba del componente simula foco y ratón de Pi, comprueba plegado exacto y rechazo de entradas ajenas. **No confundir estas pruebas con un clic de ratón inyectado en Pi real**: todavía falta una comprobación nativa de eventos con captura si se desea equivalencia total.
- **Estado:** IMPLEMENTADO_PENDIENTE_CI del nuevo SHA; `globalFull:false`, T11 y T07 abiertos. PR #61 en borrador, sin fusionar.

## 17/11/2026 — T11: ensayo adicional de clic real con Pi TUI
- Se amplía el ensayo de pantalla nativo con una **cuarta sesión Pi 1.2 aislada** para comprobar el clic sobre `TODOS` directamente en el lateral derecho. Se obtienen las coordenadas del componente desde el árbol real de Pi; el pseudoterminal inyecta un evento de ratón SGR, exige observar la sección plegada y el foco recibido, luego envía Escape y exige que el lateral deje de tener foco.
- Este ensayo evita confundir la llamada manual a `handleMouse()` con un evento realmente enrutado por Pi. No se contacta con modelos ni se suministran claves. Si Pi no expone la geometría o el evento no llega, falla, no omite las pruebas.
- La aceptación exige `closedSessions` de las cuatro sesiones y `interaction.source=native-pty-sgr`. **Estado PENDIENTE_CI** para este SHA. No fusionar, `globalFull:false`.
