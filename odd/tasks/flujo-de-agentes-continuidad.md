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

## 17/11/2026 — T11: tanda conjunta accesibilidad y seguridad del foco
- Se refuerza la navegación directa del lateral para usar las mismas teclas configuradas en Pi: las asignaciones de `tui.input.tab`, `tui.select.down/up/confirm/cancel` sustituyen sus valores anteriores y nunca se pisan las opciones de teclado del usuario. Los accesos locales `j/k/q/espacio` funcionan **solo con foco explícito en el lateral** y no ejecutan comandos.
- Al recorrer secciones se comprueba su fila en el contenido observado y `ScrollView` desplaza **únicamente el lateral** cuando la seleccionada sale de la parte visible. El editor y el desplazamiento principal de Pi no se modifican.
- Al cambiar el árbol propietario de Pi, se limpia el foco sin restaurar el antiguo editor ya desmontado; al ocultar el panel o cancelarlo con el árbol original vigente se devuelve el foco anterior. Si Pi cambia el foco por otro motivo, las teclas del lateral dejan de gestionarse hasta otra activación explícita.
- Se añaden pruebas con atajos personalizados `Ctrl+N/P/T/F/X`, rechazo de las teclas originales sustituidas, aislamiento del scroll y reconexión de un host nuevo. **Estas pruebas de componente no sustituyen la prueba real SGR** que sigue siendo el criterio obligatorio de T11.
- CI del SHA anterior `45f545bb8888c77d4e89fa5d1feba9cb76a9c869`: Linux y el fragmento 0 de Windows confirmados; se siguen verificando los restantes trabajos. Para este nuevo commit el estado es **PENDIENTE_CI**. `globalFull:false`, PR #61 en borrador y sin fusión.

## 17/11/2026 — T11-D: cabecera configurable y superficies visuales
- Se añaden dos opciones de **presentación exclusivamente** en `/asen-customize`: `header top|below-input|split` y `surface transparent|tinted`. Se almacenan en `~/.asen/t11-chrome.json` (`schema:1`), con validación estricta de claves/valores, rechazo de enlaces simbólicos y sustitución por archivo temporal privado.
- `top`: cabecera original completa. `below-input`: omite la cabecera superior y coloca sus datos en el widget nativo `belowEditor`. `split`: logotipo arriba y metadatos versión/Pi abajo **sin duplicarlos**. El tema tintado utiliza `customMessageBg` del host solo cuando Pi lo proporciona; si no, mantiene el texto sin fondo. La superficie llena el ancho disponible sin alterar el editor ni la barra de estado.
- Se usa el mismo renderizador que ya sanea secuencias de control, texto bidireccional y caracteres de ancho doble; no se inventan modelo, coste, permisos, conexión o estadísticas. Los cambios se reflejan en la sesión actual cuando el host expone las funciones, y se recuperan al iniciar la siguiente.
- Pruebas añadidas de ancho 1/2/5/12/24/40/140, color con y sin fondo del host, migración desde configuración ausente, archivo corrupto/versión ajena, intento de introducir permisos y comandos de configuración reales. El inventario público debe recoger las nuevas superficies.
- **Estado: IMPLEMENTADO_PENDIENTE_CI** del SHA de publicación; no declara igualdad visual completa con Gentle Shell 4.8.0. Las comprobaciones reales de `belowEditor` en Pi y las capturas de contraste siguen pendientes. `globalFull:false` y PR #61 en borrador, sin fusión.

### Validación confirmada de la tanda anterior
- SHA `d6a18ed75db09fc35dac526a4668accb53d1335f`: **CI #44099798686 = SUCCESS**, Release Gate #44099798845, Arquitectura #44099798759 y prueba Pi 1.2 #44099798615 = SUCCESS. Se revisaron las tres pruebas nativas del lateral con resultado `ok` en Linux, Windows y macOS (con clic SGR y devolución del foco). Estos resultados pertenecen al SHA anterior, **no** certifican la nueva cabecera.

## 17/11/2026 — T11-D: fondo uniforme del lateral real
- Al contrastar el tag congelado Gentle Shell 4.8.0 se comprobó que `tinted` debe afectar también al **lateral fijo**, no solo a la cabecera. La siguiente mejora pinta cada fila del lateral con `customMessageBg` cuando el host ofrece `theme.bg`, hasta completar su ancho nativo. `transparent` conserva el dibujo original y los datos, sin colorear. El ajuste en caliente conserva los plegados y no modifica el estado de tareas.
- Prueba nueva: transición transparente → tintado, mismo contenido y número de filas, exactamente 50 columnas pintadas, sin inventar datos ni tocar permisos/modelos. El tema del host que carezca de `bg` mantiene un resultado legible.
- Diferencias conscientes respecto a la referencia: no se pinta todavía toda la barra inferior ni se dispone de fotografías equivalentes de ambas versiones. **Estado: IMPLEMENTADO_PENDIENTE_CI** de esta mejora. `globalFull:false`, PR #61 sin fusión.

## 17/11/2026 — T11-E: comprobar cabecera inferior en salida nativa Pi

- Basado en HEAD `abc5e7e226963a8af45b5c6c2d869075711ac6ce`. La geometría, clic y foco ya se comprobaron en tres plataformas en SHAs previos; no se repite un ensayo Writer.
- Se amplía la cuarta sesión Pi 1.2 existente del ensayo nativo (posición `bottom`) con preferencia real persistida `header=below-input`, `surface=tinted`. El pseudoterminal debe **dibujar** la marca `π ASEN` y la versión `Pi 1.2.0` durante la sesión; un renderizador aislado no basta. Se exige además que todas las sesiones cierren y se mantiene la geometría vertical.
- El recibo guarda únicamente dos indicadores de texto visible, no pantallas, claves ni salida cruda del terminal. **Limitación:** demostrar caracteres en la salida del host no demuestra todavía ubicación exacta, color real del fondo, capturas comparables ni paridad completa con Gentle Shell.
- Estado de esta ampliación: `IMPLEMENTADO_PENDIENTE_CI`; no hubo un RED/GREEN local separado, la prueba Pi nativa debe verificarse en CI del SHA nuevo. `globalFull:false`, T07/T11 abiertos, PR #61 sin fusión.

## 17/11/2026 — Control de coste: NVIDIA no debe repetirse por cambios T11

- La inspección de `.github/workflows/ci.yml` encontró que `t06-nvidia-free-api` y `t06-nvidia-pi-native` se ejecutaban automáticamente en **cada** `pull_request synchronize` de PR #61, incluso tras un commit que solo cambia la interfaz. Esto contradice la limitación de consumo acordada. La ejecución automática del SHA visual previo ya pudo consumir cuota: no se presenta como coste cero verificado.
- Para nuevos SHAs se restringen ambos trabajos a un evento real de GitHub `pull_request:labeled` cuando **`asenbanskaliev` añade** `asen-t06-nvidia-una-vez`. Si el label permanece entre commits, los eventos `synchronize` no consumen proveedor. Volver a ejecutar requiere quitar y añadir conscientemente el label. El trabajo hijo depende del éxito del sondeo.
- Las pruebas ordinarias, CI multiplataforma, arquitectura, Pi 1.2 y Release Gate siguen disponibles en `synchronize`. Los ensayos protegidos de **dos Writers T06** continúan exigiendo el flujo manual y dos aprobaciones humanas reales; el label NO los autoriza ni ejecuta.
- Se añade prueba de frontera de CI que falla si algún trabajo NVIDIA vuelve a admitir un `push/synchronize` sin el evento exacto y actor esperado.
- **Estado:** IMPLEMENTADO_PENDIENTE_CI del SHA de este cambio. Prueba estructural RED sobre el YAML anterior y GREEN sobre el editado; validación completa del nuevo SHA pendiente. `globalFull:false`; T11/T07 no cerradas.

## 17/11/2026 — T11-C: barra compacta y prioridad de alertas
- El SHA de entrada `2c0d1cd51318ea15c8bd52697022a026b9e40946` tiene CI `44106136700`, Release Gate `44106136887`, Architecture `44106136687` y Pi 1.2 `44106136793` en estado SUCCESS. Pruebas por sistema: Linux, Windows, macOS, todos los fragmentos en SUCCESS. Corrige la prueba de cabecera inferior en Pi real y limita llamadas NVIDIA en CI tras cambios visuales.
- Frente a Gentle Shell 4.8.0 (`lib/shell-bar.ts`, `odd/tasks/responsive-shell-bars.md`), ASEN conservaba el pie de Pi pero recortaba al final los segmentos de información. En 24/40 columnas un aviso de contexto alto o bloqueo se perdía detrás de datos secundarios. Se añade un renderizador puro `t11-compact-status.ts` para menos de 140 columnas, con reserva de `/asen-panel` cuando caben 21 o más columnas.
- **Orden de prioridad:** contexto verificado en warning/error; bloqueos locales realmente observados; resultados en revisión explícitos; permisos elevados activos; modelo seleccionado verificado (no confundir con modelo que respondió); contexto normal/desconocido; modelo respondedor solo si observado; rama; coste/uso como `?`. Nunca se convierte coste desconocido en 0 ni ausencia de actividad en estado conocido.
- Se reutiliza `ctx.ui.setStatus("asen:host",...)`. **No** se sustituye el footer de Pi, no se crean widgets duplicados ni se consumen APIs nuevas de modelos. Las pantallas de 140 columnas o más mantienen `renderAsenStatusLine`. Se acotan y limpian las entradas de la rama, modelo y modo.
- Pruebas TDD de anchos 1/2/12/20/21/24/40/50/80/120/139, prioridad de alertas, rechazo de textos maliciosos, omisión honesta de métricas, estado sin agentes y persistencia intacta de la integración Pi. La prueba de integración del pie se actualiza al nuevo contrato de 100 columnas.
- **Estado: IMPLEMENTADO_PENDIENTE_CI.** Aún falta validar con pseudoterminal tamaños estrechos, capturas/contraste con Gentle Shell 4.8.0 y revisión independiente. `globalFull:false`. PR #61 sigue en borrador, sin merge.

## 17/11/2026 — Corrección de los 7 fallos en CI T11-C
- SHA `bb0ab89552ce45936cef1852f3c24248c5db9449`, CI `44113222685`: el trabajo macOS fragmento 0 detectó **7 fallos de expectativas** (6 en `panel-observation-integration.test.ts`, 1 en `permission-modes.test.ts`). Las pruebas esperaban el texto anterior de la única barra `asen:host`, mientras la implementación entrega el texto compacto nuevo. La verificación no puede marcarse PASS.
- Hallazgo funcional adicional: el renderizador compacto omitía el nivel de razonamiento `effectiveThinking`, aunque se observaba desde Pi, y omitía el hecho `respondingModel=unknown`. Se restauran `modelo … · high` cuando el nivel observado existe y `respuesta ?` cuando no existe un modelo respondedor validado; nunca se equipara al modelo seleccionado.
- Se actualizan **sin suprimir controles** las aserciones de entrada/salida en `panel-observation-integration`, `permission-modes` y `focus-extension-integration`, conservando su validación de sesión vigente, ausencia de acciones y permisos, pie original de Pi, colores y modo normal. El comando `/asen-panel status` mantiene su representación detallada anterior y sus pruebas.
- **Estado: REPARADO_PENDIENTE_CI** del nuevo SHA. Las puertas de arquitectura y Pi 1.2 del SHA anterior pasaron, pero no reparan el CI. `globalFull:false`, PR #61 sin merge.

## 17/11/2026 — T11-E: matriz nativa de pantallas pequeñas
- Se prepara una ampliación del ensayo `scripts/t11-native-rail-host-check.mjs` para pasar de 180 → 139 → **120×40, 80×40, 50×40, 40×40, 24×12** → 180 sin detener Pi, iniciar modelos ni intervenir en el editor. Cada paso exige nueva medición real del ancho y ausencia del lateral fijo de 50 columnas. El árbol amplio debe restaurarse.
- Los cinco tamaños y las filas observadas se guardan como `narrowMatrix` vinculada al SHA exacto; `tests/t11-native-rail-host.test.ts` valida cada par de dimensiones en macOS, Windows y Linux. No se altera el límite temporal ni se omite ninguna comprobación anterior.
- **Esta matriz comprueba geometría, no paridad fotográfica**. T11 sigue pendiente de comparación de interfaz con Gentle Shell 4.8.0, pruebas de interacción de toda la interfaz y revisión independiente. `globalFull:false`. PR #61 no fusionada.

## 17/11/2026 — T11-C: bloqueo observable en barra, aislado por sesión
- El pie compacto no debe calcular bloqueos desde listas vacías ficticias cuando existen listas observadas. `refreshWorkRow` ya recibe Todos, agentes y trabajos del `sessionIdentity` vigente; ahora entrega una copia de las listas a `t11-activity-cache.ts` solo después de verificar generación, sesión y proyecto.
- `refreshHostStatus` reutiliza las listas solo si coincide **sessionId y projectId**; si no hay observación válida, no añade conteos inventados. `session_start` y `session_shutdown` limpian la memoria. El pie se refresca al observar nueva actividad; no abre diarios adicionales, no lanza agentes, no altera Writer ni consentimientos.
- Pruebas del cache: aislamiento al cambiar sesión, aislamiento al cambiar proyecto, rechazo de identidades vacías, limpieza, copia de arrays y representación de dos bloqueos reales sin contaminación de otra sesión. `globalFull:false`. Evidencia de CI del nuevo SHA pendiente.

### Validación de la base antes de la megatanda
El SHA `f256a5faf65e0197d909167a0254ffbf7d31a9db` concluyó **CI #44114997600 = SUCCESS**, con seis fragmentos de pruebas y `test-shard-coverage` correctos en Windows, macOS y Linux. También completaron correctamente Release Gate #44114997729, Arquitectura #44114997603 y Pi 1.2 #44114997712. La megatanda siguiente se valida de manera independiente por su nuevo SHA; estos resultados no se trasladan automáticamente.

## 17/11/2026 — T11-E: corrección conjunta Windows + revisiones reales + sesión
- Base `b633a41fe039b9d7f66fcdcdb24b42db373117ec`: Phase 0 Architecture, Pi 1.2 runtime evidence y Release Gate superados. Cinco de seis fragmentos de pruebas pasan, pero **Windows fragmento 0 falla** en `T11: el Pi real…`. El fallo se produce en el nuevo bucle de redimensionado y el informe del test antiguo no identifica la fase; por tanto se conserva como **FAIL** del SHA base.
- Se corrige el ensayo nativo: cada resize espera una medición nueva con el **ancho** del host y anota sus filas como evidencia complementaria. `terminal.rows` puede actualizarse más tarde que `terminal.columns` en Windows y no debe ser el único criterio para detectar el siguiente render. Se mide también **140×40** (umbral donde el lateral fijo sigue visible), además de 120/80/50/40/24. Se aumenta el número de registros permitido y se registra `lastFailure` con sesión, tamaño, mensaje y las últimas lecturas en caso de error. **No se omite ningún tamaño ni se oculta el fallo**: si no aparece un render nuevo, la prueba falla de forma explícita y acotada.
- La proyección de revisiones usa `derivePanelReview` **solo cuando existe una lista de Todos observada** en el cache de la sesión actual; no supone que cero tareas sin proveedor implique cero revisiones. Se refuerza `refreshWorkRow` con `panelScope`, invalidación por `workRowGeneration` en inicio/cierre y rechazo si `hostStatusClosed`; los trabajos asíncronos antiguos no deben reintroducir avisos después de sustituir la sesión.
- Se añaden pruebas negativas de Todo `succeeded` y bloqueo con motivo explícito de revisión: dos pendientes solo en la sesión propietaria, sin declararlos aceptados, sin afirmar `PASS` y sin coste inventado. Las pruebas de matriz exigen `fresh-pi-render`, cada medida del umbral y que el editor conserve ancho positivo.
- **Estado: IMPLEMENTADO_PENDIENTE_CI** del SHA de esta tanda; no declarar T11 completa ni `globalFull:true`. La comparación con Gentle Shell 4.8.0 sigue siendo parcial y falta revisar la interfaz mediante capturas equivalentes. PR #61 en borrador; **sin fusión**.

## 17/11/2026 — Siguiente tanda T11: fallo de origen de datos, sin estado caducado
- En `refreshWorkRow`, tras una lectura satisfactoria se conservan listas ligadas a sesión/proyecto. **Caso negativo pendiente:** si el origen de Todos o agentes falla a continuación, la barra no debe continuar mostrando los bloqueos anteriores como actuales.
- Se prepara comportamiento fail-closed: ante fallo de observación de la generación vigente se descartan las listas y el widget de actividad de la sesión, se marca `! actividad no disponible` y se repinta únicamente el estado local verificable del host. Cuando el origen se recupera, desaparece el aviso y vuelve a mostrarse la lectura fresca.
- La limpieza se aplica solo si `panelScope` y generación siguen vigentes: una lectura antigua fallida no puede retirar la barra correcta de la nueva sesión ni restaurar el estado de la anterior. Se incluyen pruebas con lectura que falla y se recupera, y con finalización tardía tras cambio y cierre de sesión.
- **Estado: IMPLEMENTADO_PENDIENTE_CI del nuevo SHA tras publicación.** T11-E permanece abierta por contraste visual, no declarar `globalFull:true`, PR #61 sin fusión.

### Contrato complementario: no convertir una observación ausente en cero
- `AsenPanelSnapshot.activityUnavailable` distingue «lectura fallida» de «lista vacía observada». Cuando se marca, `TODOS/JOBS/AGENTS` publican `unavailable`, sin `0 running`, `0/0` ni textos «No tasks in this session». La vista nativa hace lo mismo si todavía no ha recibido su primer snapshot.
- El pie compacto advierte `! actividad no disponible`. El cambio afecta únicamente a datos y representación; no crea tareas, no reintenta proveedores y no concede permisos. Pruebas de 12/24/40/50/140 columnas, pérdida de fuente, recuperación y aislamiento de sesiones.

### Prioridad de pantalla estrecha
- Con 28 columnas, un bloqueo observado de Worker tiene prioridad visual sobre el aviso de contexto alto. Después se muestran revisiones pendientes y contexto, siempre conservando `/asen-panel` cuando cabe. A 100 columnas los dos avisos aparecen en la misma barra. Esto no altera prioridades reales de tareas ni el estado de los Workers.

### Cierre de la tanda de observación y tamaño
- Los ensayos nativos del SHA base `e402690087cf698beb8f2edb852c40c39f007dcc` demostraron los seis tamaños en Linux, macOS y Windows; Architecture, Pi 1.2 y Release Gate pasaron. La tanda de indisponibilidad que sigue tiene **nuevas pruebas y nuevo SHA**, por lo que exige CI propio: no se trasladan automáticamente los resultados anteriores.

## 17/11/2026 — T06: congelar la tarea completa tras aprobar cada Worker

- En el supervisor padre, la comprobación posterior a la aprobación verificaba modelo, revisión y superficies, pero no la descripción completa ni el estado ODD de la tarea hija. Una actualización de instrucción o de estado después del consentimiento podía pasar el control parcial.
- Se añade una fotografía de la tarea hija antes de solicitar permiso: ID, petición, título, instrucción, dependencias, estado/revisión y plan completo. `validateExact` exige igualdad antes y después de aprobar, además de las verificaciones Git y de identidad existentes. No concede Writer ni amplía permisos.
- Pruebas negativas para cambio de instrucción y cancelación de Todo tras el permiso: sin despacho, sin repetición silenciosa y con intento único persistente.
- **Estado: IMPLEMENTADO_PENDIENTE_CI** del nuevo SHA. T06 sigue parcial: falta prueba productiva completa Pi y modelo real, revisión independiente y reconciliación de aceptación. `globalFull:false`, sin fusionar.

### Corrección de integración con el binder (misma tarea T06)
- `TrustedTaskAgentBinder` guarda una transición `planned → running` tras registrar el vínculo y **antes** del despacho. La comprobación del supervisor también se llama después de ese registro; por ello no debe bloquear el cambio legítimo.
- Ahora acepta exclusivamente la tarea planificada idéntica o un evento adicional auténtico `Agent launch claimed before dispatch`, con revisión siguiente y todo el historial anterior intacto. Cualquier instrucción, permiso, estado cancelado o salto de revisión distinto sigue bloqueado.
- Prueba positiva añadida para dos Workers con la transición; conservadas las dos pruebas negativas de cambio tras consentimiento. La verificación de CI del nuevo SHA sigue pendiente.

## 17/11/2026 — T05/T08: ruta de modelo Fix con validación previa

- Se corrigió la propuesta ODD Fix para rechazar rutas de modelo sin proveedor, rutas reservadas `default` y niveles de esfuerzo no admitidos. Se reutiliza el mismo validador que T05/T06 para el modelo solicitado del Worker y `isThinking` para el esfuerzo.
- Se añadió prueba con informe genuino emitido por dos jueces instrumentados: perfiles mal formados bloqueados, perfil válido permitido pero `fixModelActual:unknown`, sin autoridad Writer, sin lanzamiento y con nuevo consentimiento obligatorio.
- Estado: **IMPLEMENTADO_PENDIENTE_CI** del SHA de esta tanda. Este control valida configuraciones, no prueba autenticación del proveedor ni que el modelo haya respondido. No se ejecutaron llamadas a modelos de pago. `globalFull:false`.

## 17/11/2026 — Tanda D/P9: cerrar aceptación de revisiones sin pruebas firmadas

- Ruta productiva inspeccionada: `/asen-accept-review` → `acceptIndependentReview` → `resolveReviewVerification`. El resto de controles ya exigía sesión, Todo bloqueado, agente completado, Git limpio y confirmación humana. La **ausencia de recibo** podía transformarse en `structural-fallback` y finalizar el Todo con `done`.
- Ahora sin lector de recibos o sin recibo **se bloquea antes de mostrar el diálogo humano**; la evidencia estructural sigue siendo únicamente provisional. Una firma `PASSED` requiere al menos una prueba, todas superadas, cero fallos y ejecutor indicado, además de árbol/commit vinculados.
- Pruebas negativas P9: recibo ausente, lector ausente, firma `PASSED` con cero pruebas; se conservan las pruebas de firma alterada, SHA/árbol distinto, rechazo humano, candidato sucio y aceptación concurrente. Los escenarios positivos pasan a generar recibos HMAC reales.
- **RED estático:** el código original devolvía `structural-fallback` para recibos ausentes y la antigua prueba esperaba `accepted`. **GREEN y CI reales pendientes** del nuevo SHA; no atribuir ejecuciones de pruebas no observadas.
- Estado `IMPLEMENTADO_PENDIENTE_CI`. Sin nuevas autorizaciones Writer, ejecuciones de modelos ni fusiones. T11-E/T07/D completa siguen pendientes, `globalFull:false`.

## 17/11/2026 — Megatanda 1 / T11-E: evitar estados caducados tras error de lectura

- **SHA base verificado:** `39771eae42dfb940cbe780df983b1a15946e46ee`, con CI, Arquitectura, Pi 1.2 y Release Gate en `success`. Pi Free Smoke: `skipped`.
- **Ruta productiva:** `renderAsenT11CompactStatus`, `derivePanelReview`, `renderAsenPanelSection` y `renderAsenWorkRow`. El origen de actividad fallido no debe mostrar como actuales bloqueos, revisiones ni trabajos que pertenecen a la lectura anterior.
- **Cambio:** prevalencia de `activityUnavailable` en snapshot o en el aviso del llamador; la barra no muestra contadores caducados, REVIEW queda sin verificar y la línea de actividad ofrece `/asen-panel`. Se preserva el estado local del host y no se alteran fuentes de autoridad, permisos o Workers.
- **Pruebas nuevas:** lectura fallida tras actividad observada, aviso externo con snapshot antiguo, recuperación explícita, revisión antigua y fila con agente/trabajo antiguo. La inspección estática de la versión anterior revela el defecto; **no se afirma un RED ejecutado**. GREEN/CI del commit que añade esta sección **pendientes de comprobar**.
- **Estado:** `IMPLEMENTADO_PENDIENTE_CI`; T11-E visual continúa abierta por contraste de capturas, navegación y revisión independiente. T06/T07 no cerrados; `globalFull:false`. Sin NVIDIA, Writer, aprobación fingida ni merge.

## 17/11/2026 — Megatanda 2 / T06+T07: invalidar el panel tras fallo de refresco

- **SHA base:** `ce66028df74e376ccf2cd0576950217707f77574`; mismo ámbito y PR #61. La megatanda T11 anterior conserva pruebas exact-SHA pendientes al iniciar esta corrección. **El CI concluyente será el del último SHA**, no se suman aprobaciones de SHA diferentes.
- **Problema de producción:** en `createNativeWorkPanel.refreshNow`, un error quitaba el flujo de hijos pero dejaba Todo, Jobs, agentes, revisión, Git e integración de la lectura anterior. El panel podía presentar resultados antiguos como actuales e incluso decir «No work in this session».
- **Corrección:** tras fallar la lectura, vista mínima marcada `activityUnavailable` y `agentFlowUnavailable`; el panel muestra «no disponible» y conserva el acceso a cerrar y refrescar. Solo una lectura nueva y correcta restablece datos actuales. No se modifican permisos, Dispatcher, aprobaciones ni lógica de Writer.
- **Prueba negativa:** datos previos de revisión bloqueada y rama Git, fallo del origen, ausencia de datos antiguos, posterior lectura satisfactoria sin aceptar ninguna revisión. Se añadió al conjunto `native-work-panel.test.ts`.
- **Estado:** `IMPLEMENTADO_PENDIENTE_CI`; no se ha acreditado un RED ejecutado. T06/T07 continúan parciales, T11-E visual pendiente y `globalFull:false`. NVIDIA y ensayo manual de dos Writers no ejecutados; ninguna fusión.
