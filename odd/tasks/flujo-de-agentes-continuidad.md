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

## 17/11/2026 — T04 + T05 + T06: asegurar el origen ODD del Worker hijo

- CI, Release Gate, Arquitectura y Pi 1.2 del SHA de partida `d0d6ba7ffcf3432b4559e7553777dd70a9cf0024` comprobados como SUCCESS; Pi Free Smoke omitido.
- Se detectó que `/asen-worktrees supervise` comprobaba modelo solicitado, candidato y ámbito del Worker hijo, pero no exigía que su petición ODD y datos originales de autorización coincidieran con el Worker reservado en la sesión padre. Otra petición con el mismo modelo y los mismos archivos podía aparecer como lista para ejecutar.
- Se exige igualdad exacta de `requestId` y `writerAuthorizationBasis` entre origen e hijo durante la preparación y otra vez al verificar identidad antes, durante y después del consentimiento individual. No se concede autoridad por esa igualdad: el Dispatcher y el binder siguen emitiendo el permiso nuevo y comprobando el ámbito exacto.
- Pruebas negativas: modificación de la instrucción ODD sin cambiar modelo/HEAD/scope; sustitución de la identidad de petición. Ambas deben bloquear antes del diálogo del lote y no consumir el intento irreversible.
- Prueba positiva existente de dos Workers instrumentados pasa a usar la identidad de petición original, como produce `plan-todo` en el flujo real. **Estado: IMPLEMENTADO_PENDIENTE_CI** del SHA nuevo; faltan ensayos reales TUI/Writer y revisión independiente. `globalFull:false`, sin modelos de pago ni fusión.

## 17/11/2026 — T02 + T04/T05/T06: no anunciar herramientas prohibidas y validar planificación real

- La extensión de autoridad Pi solamente admite `read`, `edit` y `write` según rol, pero la superposición configurable podía añadir `bash` o `grep` al argumento `--tools`. En la ejecución el permiso se bloquearía después, pero el modelo vería una herramienta imposible de usar.
- El adaptador Pi aplica ahora el complemento y, antes de iniciar Pi, conserva únicamente las herramientas que el rol tenía permitidas. Puede **retirar** herramientas, nunca ampliar permisos. No cambia el funcionamiento genérico del cargador de complementos ni otorga capacidades nuevas.
- Pruebas negativas: Explorer sin `read` no puede sustituirlo por `grep`; Explorer con `read` no anuncia `bash`; Worker legítimo con complemento malicioso sigue disponiendo solo de `read,edit,write` bajo la autorización emitida por el Dispatcher.
- Se añade una prueba positiva T04/T05/T06 con `controlledInstructionPlanCommand` en proyectos origen/hijo reales: mismo ID, datos ODD y archivos, candidato con raíz distinta y SHA igual. No se atribuyen permisos ni modelo consumido.
- Estado: **IMPLEMENTADO_PENDIENTE_CI** de este nuevo SHA. Pi Free Smoke y NVIDIA siguen fuera del alcance del ensayo, no se proclama FULL. PR #61 en borrador y sin merge.

## 17/11/2026 — T07: distinguir la lectura local del estado desconocido de los hijos

- La ruta real `getPanelSnapshot` puede cargar Todos/agentes locales cuando `readAgentFlowPanelObservation` falla y comunica `agentFlowUnavailable:true`. El panel nativo mostraba equivocadamente `No work in this session` y ocultaba la advertencia en secciones locales vacías.
- Se conservan los recuentos locales verificados y se marca explícitamente como **no disponible** el estado de tareas, agentes y cambios de los worktrees hijos. Un fallo de fuente no se convierte en un cero observado ni en aceptación.
- Prueba negativa del panel completo y del modal nativo, seguida de refresco con un Worker hijo observado como activo. El modal no concede permisos, no ejecuta herramientas ni inicia modelos.
- **IMPLEMENTADO_PENDIENTE_CI** del nuevo SHA. T07 no es FULL: faltan comparativa visual real e integración autenticada Pi completa. `globalFull:false`; PR #61 en borrador, sin merge.

## 17/11/2026 — T11-E: observador nativo no inventa ceros tras fallo

- **Base exacta:** `9884c41f3f8ecab1ddb8e7c2a33e5c3c42f54e50` con CI, Release Gate, Pi 1.2 y Phase 0 en `success` (Pi Free Smoke `skipped`). PR #61 permanece en borrador.
- **Ruta real:** `startSession` de `extensions/asen.ts` conecta `createT11RailObserver` al lateral. Al fallar `getPanelSnapshot`, la llamada `onUnavailable` dejaba `todos/agents/jobs` vacíos y `agentFlowUnavailable`, pero omitía `activityUnavailable`. La vista podía mostrar `0/0` y revisión sin pendientes como observaciones actuales.
- **Corrección:** `unavailableT11RailSnapshot` centraliza el estado bloqueado y se usa en la devolución nativa al fallar la lectura. Ninguna autorización, trabajo ni proveedor se toca.
- **Pruebas negativas añadidas:** lectura observada → caída del origen → indicación `unavailable` en TODOS/JOBS/AGENTS, revisión `unverified`, sin Todo ni permisos antiguos → nueva lectura legítima → se muestran únicamente los datos frescos. También se comprueba el contenido del lateral real renderizado por el adaptador en una prueba instrumentada.
- **Evidencia RED:** comparación estática con el HEAD base; no se afirma una ejecución RED. **GREEN y CI exact-SHA pendientes de comprobar tras publicar**.
- **Estado:** `IMPLEMENTADO_PENDIENTE_CI`; T11-E permanece abierta hasta contraste visual con Gentle Shell 4.8.0 y prueba de sesiones Pi vivas integradas con T06/T07. `globalFull:false`, sin NVIDIA, Writers ni merge.

## 17/11/2026 — Megatanda 1 T11+T07: modo estrecho y datos de hijos fallidos

- **SHA base:** `2e7cae3fbaa1fb0f2898f91aa03e15252eb0a403`. La PR #61 permanecía en borrador; arquitectura, Pi 1.2 y Release Gate aprobados en la comprobación inicial, CI general todavía en curso. Se usa exclusivamente esta rama mediante escritura con SHA esperado.
- **Fallo reproducible por inspección estática (RED sin ejecutar):** `renderAsenWorkRow` omitía el resumen en terminal estrecha si no había actividad local y la lectura de hijos fallaba; `renderAsenPanelSection` y el modal podían reutilizar un `agentFlow` antiguo aunque `agentFlowUnavailable` señalara fallo; el bloque de error de `refreshWorkRow` solo retiraba `asen-live-work`, sin borrar `asen:m1-rail` ni su caché.
- **Corrección:** se da prioridad al error de origen sobre fotografías antiguas de hijos; se muestra `! hijos no disponibles` con acceso `/asen-panel` en tamaños estrechos, el modal conserva solo observaciones vigentes y el widget M1 se retira al perderse el origen. No se alteran permisos, modelos, Dispatcher ni reservas T06.
- **Pruebas negativas:** datos contradictorios (hijo observado como activo y origen marcado no disponible), tamaños 24/40/50/80/120/139/140/180, ausencia de ejecuciones antiguas y de declaraciones de éxito, navegación del modal y caso vacío legítimo. Sin llamadas NVIDIA, aprobaciones ni merge.
- **Estado provisional:** `IMPLEMENTADO_PENDIENTE_CI`. Comprobar typecheck y tests exact-SHA con CI, Pi 1.2 y Release Gate. No se presume GREEN antes del CI. T11-E aún requiere contraste visual independiente con Gentle Shell 4.8.0, y T07 no certifica dos Workers Pi TUI productivos. `globalFull:false`.

### Ajuste de aceptación de terminal estrecha (misma megatanda)

- La revisión de las pruebas nuevas del commit `eeaffead4cc91b286e990babdf31f5753bdc03f3` detectó dos errores de expectativa: a 24/40 columnas el mensaje completo no cabe, y el modal necesita cinco avances `Tab` desde TODOS para llegar a INTEGRATIONS, no seis.
- Se conserva el acceso literal `/asen-panel` al comprimir el aviso; si no cabe el texto largo se muestra `! hijos ?`, nunca un falso «sin hijos». La prueba verifica el comando y el ancho en todos los tamaños y selecciona realmente INTEGRATIONS.
- **No se declara GREEN por inspección.** Se exige CI, Pi y Release Gate del SHA final. Ni T07 live ni T11-E visual se dan por cerrados. `globalFull:false`.

## 17/11/2026 — Reparación RED de pruebas T11/T07 en CI multiplataforma

- **SHA con fallos reproducidos:** `00404ffe8977389a1215f5e272eb7a33c14b124c`; ejecución de CI [#44170956417](https://github.com/asenbanskaliev/ASEN/actions/runs/44170956417). Arquitectura, Pi 1.2 y Release Gate: `success`, pero la prueba general falla.
- **RED real (logs):** `tests/ide-panel.test.ts` y `tests/native-work-panel.test.ts` rechazados por `Invalid persisted agent-flow batch` en Linux/macOS/Windows: los nuevos datos de prueba tenían solo una tarea y el contrato del proyector exige 2–4. `tests/t11-rail-observer.test.ts` falló porque el agente ficticio carecía de `role` y `updatedAt`, necesarios para representar la lista.
- **Corrección:** añadir una segunda tarea inocua y válida a ambos lotes de prueba y completar los campos públicos observables del agente. Se conserva la proyección real y su validación estricta: no se permite un lote de una sola tarea ni se falsea autorización o aceptación. Las pruebas siguen comprobando que una lectura fallida no reutiliza agentes anteriores.
- **Alcance:** exclusivamente pruebas y registro, sin cambios en las barreras de seguridad o la ejecución Pi. No hay ensayo NVIDIA ni aprobaciones Writer.
- **Estado:** `RED_CONFIRMADO_CI / GREEN_PENDIENTE_CI_SHA_NUEVO`. Se verificará CI multiplataforma exact-SHA, Pi runtime y Release Gate antes de avanzar a otra tanda. T11-E visual y T06/T07 unidos aún pendientes, `globalFull:false`.

## 17/11/2026 — T11-E: fallback auténtico y no lateral ficticio

- **SHA base:** `547012791c22dc4665f35e6fa4e7783d7d2c8e7d`. Arquitectura, Pi 1.2 y Release Gate de esa revisión `success`; CI general aún en comprobación al comenzar esta tanda.
- **Diagnóstico de ruta productiva:** en `extensions/asen.ts -> refreshWorkRow`, con `width>=140` y `t11Rail.active()===false` se mostraba `renderM1Surface(...).mode==="rail"` mediante `setWidget("asen:m1-rail", ... "aboveEditor")`; ese widget no reserva 53 columnas, pero podía aparentar una columna lateral inexistente. En la inspección explícita también se ocultaba el resumen si el ancho era grande, aunque el lateral real no existiera.
- **Cambio:** la reserva 50+3 solo la hace `installAsenNativeRail` sobre el árbol Pi compatible. Si no existe, se retira la lista M1 artificial y se publica una única fila compacta con `/asen-panel`, incluso a 140+ columnas. Se respetan `hidden`, `auto+light` y el lateral realmente activo.
- **Pruebas:** integración de `createAsenExtension -> session_start -> refreshWorkRow -> setWidget` con host sin `layoutRoot`; sin columna artificial, una fila compacta, sin contadores inventados ni comandos de agentes; contrato de anchuras 24/40/80/139/140/180. No hay modelo ni Writer. RED por inspección estática; GREEN y CI exact-SHA pendientes.
- **Límite:** esto es degradación segura, no paridad visual con Gentle Shell 4.8.0. T11-E sigue pendiente de captura comparada, estilos y controles; T06/T07 extremo a extremo continúa abierto, `globalFull:false`. No se fusiona.

### T11-E — evitar que el resumen compacto recorte la orden de apertura

- Al revisar el código antes del cierre de CI del SHA `e024e15ddc6be8c9317d23a8559e728adf1be05f` se detectó que la cadena `▸ Panel ASEN · /asen-panel` supera 24 columnas y un resumen con actividad también puede truncar el propio comando.
- Se reserva primero el espacio de `/asen-panel`; solo se acorta la descripción. En 12 columnas se enseña únicamente la orden. Se añaden pruebas con/sin agente activo en 12/24/40/80/139/140/180 columnas.
- RED por inspección estática (sin ejecutar todavía), GREEN y CI del nuevo SHA pendientes. No se alteran permisos, sesiones, Writer, NVIDIA ni el lateral nativo real. `globalFull:false`.

## 17/11/2026 — CodeRabbit PR #61: triaje y primera tanda de correcciones mayores

- Revisión CodeRabbit recibida para `0e749c7cca3467ab0c83661ac90b12f10b3e0c7d`: **10 avisos Major en línea + 17 Minor** en resumen. CI, Release Gate, Arquitectura y Pi 1.2 de ese SHA aprobados. El CI no acredita ausencia de defectos.
- Correcciones de esta tanda: ruta de archivo Git comparada **con la misma capitalización** que el permiso (evitar que `case.ts` herede permiso para `Case.ts`); enumerar archivos nuevos anidados individualmente, sin `--directory`; impedir que el padre T06 inicie el Todo hijo equivocado por prioridad; revalidar el proyecto Fix bajo el bloqueo antes de despachar, además de revisarlo antes del diálogo; comprobar la sesión de Fix tras la lectura del diario y **antes** de guardar el plan.
- Pruebas negativas nuevas: ruta con mayúsculas distintas, archivo nuevo anidado y dos tareas de distinta prioridad en la misma sesión hija. Sin llamadas NVIDIA, sin nuevos grants, sin fusión.
- **Estado: IMPLEMENTADO_PENDIENTE_CI** del SHA de esta tanda. Mantener abiertos los avisos hasta que pasen todas las comprobaciones del SHA exacto y se valore cada comentario.
- **Bloqueo prioritario aparte:** CodeRabbit detectó en T08 un problema de ejecución de código generado sin límite de red efectivo y la posibilidad de salida 0 sin completar las afirmaciones. No se declara validación de seguridad de T08 ni ejecución fiable de ensayo real hasta aislar el proceso y acreditar el fin de las pruebas. No ampliar `--permission` ni confiar en una lista de identificadores como sustituto.
- Después: resolver los avisos restantes agrupados por módulo, integrar con T06/T07/T11, completar revisión independiente y ensayos Pi/TUI; `globalFull:false`.

## 17/11/2026 — CodeRabbit megatanda Git/Windows/Fix

- Entorno Git temporal de variables explícitas: evita heredar GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE y configuración ajena en pruebas T06/T08 y verificador de instantáneas. Pruebas negativas de variables Git forzadas.
- Árbol de revisión Fix completo y ámbito Writer limitado: se compara el hash total antes de autorizar sin conceder escritura sobre archivos ajenos. Prueba positiva de candidato revisado de dos archivos con permiso de uno y negativa por cambio posterior.
- Diagnóstico Windows: acumulador `$crashRecords` independiente de la variable automática `$Matches`.
- **IMPLEMENTADO_PENDIENTE_CI** del nuevo SHA; P0 de ejecución de código generado sin aislamiento de red auténtico sigue abierto, sin PASS ni equivalencia FULL. No hay fusión ni consumo NVIDIA.

## 17/11/2026 — CodeRabbit: recuperación Pi y visibilidad de lanzamientos

- T08: se rechazan `toolCall` y `tool_call` también en respuestas Pi intermedias, aunque no exista evento `tool_execution_start`. Prueba negativa del reintento y `agent_settled`.
- T06: revisores Pi nativos esperan `agent_settled`, igual que los jueces estrictos T08; no permiten PASS por el primer `agent_end`.
- T06: el supervisor incorpora a `started` un despacho confirmado **antes** de revalidar la sesión padre; si cambia después, informa `partial-needs-review` conservando el agente observado y sin reintentos. Prueba de cambio posterior al lanzamiento.
- Se corrige la identidad criptográfica de la prueba de Fix de varios archivos: el informe de origen y su SHA deben coincidir.
- Estado: cambios de código pendientes de CI y revisión. Mantener P0 de red/terminación del código generado abierto; `globalFull:false`.

## 17/11/2026 — P0 CodeRabbit: cierre preventivo de ejecución insegura T06/T08

- Código generado por los Workers T06 y el corrector T08 **ya no se ejecuta** mediante Node `--permission`, porque esa opción no bloquea conexiones de red y la salida 0 puede simular afirmaciones realizadas.
- `checkT06Behavior` y `checkT08Behavior` devuelven `false` (NO VERIFICADO) hasta existir contenedor o aislamiento del sistema operativo que corte la red, con prueba de terminación comprobada desde el proceso padre. El filtro sintáctico T08 no se considera un límite de seguridad.
- Tests de regresión: funciones correctas no reciben PASS falso, expresiones por `constructor` y `process.exit(0)` tampoco. Esto **bloquea intencionadamente el ensayo T06/T08**; no se suplanta con éxito simulado ni permisos nuevos.
- **Pendiente P0 para recuperar la funcionalidad:** implementar ejecutor aislado con red negada por el sistema operativo, archivo montado en solo lectura, límites de recursos y comprobación de finalización de cada aserción que el candidato no pueda falsificar. Después ejecutar pruebas negativas con escape, red local y salida temprana.
- Se conserva `globalFull:false`, PR borrador sin merge, sin coste NVIDIA y sin autorizaciones Writer heredadas. Verificar CI exact-SHA antes de declarar este bloqueo operativo.

## 18/11/2026 — Diagnóstico y corrección multiplataforma T06 (pendiente de CI)

- En el SHA de partida `ea04cca9c260f910c1d173325a3e92a8170c320a`, CI falla en Windows (4 pruebas del verificador de instantáneas), mientras las matrices macOS/Linux y las pruebas de agentes específicas pasan. La cobertura global falla como consecuencia; no se declara resuelto.
- El lector de instantáneas utiliza ahora `git status --porcelain -z` para no depender del formato de rutas y saltos de línea del sistema. Compara la raíz Git mediante ruta relativa, conservando la comprobación de directorio exacto.
- Los bloqueos indican únicamente la etapa local fallida, **sin publicar rutas ni contenido Git**, para distinguir de forma reproducible un problema de directorio, SHA, estado, árbol o archivo en Windows.
- Prueba negativa de variables `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` y configuración global heredadas, con el lector aislado. Las huellas, permisos y rechazo de archivos ajenos no se relajan.
- Estado: **IMPLEMENTADO_PENDIENTE_CI**. Si persisten los fallos, utilizar la etapa registrada en CI para diagnosticar la causa real, sin cambiar los resultados esperados de seguridad.
- Sin proveedores, sin pruebas TUI y sin fusión; `globalFull:false`. El P0 de ejecución de código generado sin aislamiento del sistema operativo continúa **BLOQUEADO**.

## 18/11/2026 — Segunda corrección Windows: Git global NUL

- En el SHA `41a8effbc00d0fa63edad179a27893d30974f5b4`, CI Windows sigue fallando (5 pruebas del verificador T06); las etapas detalladas se guardan en `blockers` y ahora se incluyen en la salida de las pruebas.
- Causa **compatible con evidencia externa**, pendiente de validación en el runner: versiones de Git para Windows/MSYS rechazan `GIT_CONFIG_GLOBAL=NUL`. El entorno aislado de ASEN utilizaba ese valor.
- Corrección: crear un archivo temporal **vacío y privado** una sola vez por proceso en Windows; usarlo como `GIT_CONFIG_GLOBAL` y limpiarlo al salir. Se mantiene `GIT_CONFIG_NOSYSTEM=1`, la prohibición de protocolos, la eliminación de variables heredadas, la protección de SHA y el bloqueo sin huella válida. Nunca heredar el archivo Git global del usuario.
- Prueba positiva de ruta real válida, negativa de inyección del entorno y comprobación específica de la ruta Windows. No se ejecuta código generado.
- Estado **IMPLEMENTADO_PENDIENTE_CI**. Comprobar CI/Release Gate/Pi/Arquitectura del nuevo SHA; hasta entonces no declarar solucionado Windows. P0 de aislamiento de red de T06/T08 sigue **BLOQUEADO**, `globalFull:false`.

## 18/11/2026 — T06: diferencias CRLF al crear la muestra de Git

- CI `e65134a055b26765815aa04326a50c3f309ebda6`: el diagnóstico determinó que ambos Workers fallaban en **`estado Git`**; la corrección del archivo global `NUL` por sí sola no bastó.
- Reproducción local sin IA: Git crea el checkout con `core.autocrlf=true` y, al comprobarlo con `core.autocrlf=false`, se observa un ` M README.md` ficticio además del Writer no rastreado. Es una diferencia de **normalización del archivo en la muestra**, no una autorización.
- La muestra TDD se crea ahora con el mismo `isolatedGitEnvironment()` que usa el verificador; se fija `core.autocrlf=false` **solo en su repositorio temporal**, sin tocar Git de usuario ni cambiar la protección del código real. Un cambio rastreado auténtico sigue bloqueándose, con prueba negativa.
- El diagnóstico de estado informa solo número de entradas y si el archivo esperado aparece, sin exponer rutas privadas ni contenido.
- Estado **IMPLEMENTADO_PENDIENTE_CI** del siguiente SHA. Verificar CI multiplataforma y Release Gate antes de declarar resuelto; `globalFull:false`, no ejecutar código generado y mantener P0 T06/T08 **BLOQUEADO**.

## 18/11/2026 — Megatanda CodeRabbit T06 + T09 sin modelos

- **T06, Minor de estabilidad:** `scripts/t06-nvidia-pi-concurrent.ts` ahora conserva el `AgentRuntime` en el bloque de cierre, espera el resultado de **todas** las altas de hijos y cancela/espera **ambas** sesiones mediante `cancelSession` antes de observar o borrar worktrees. En caso de fallo de cancelación, marca `BLOCKED` y **no borra** los árboles, para evitar que un proceso Pi vivo siga actuando sin su carpeta.
- **T09, Minor de formato:** `assessT09NativeTrialReadiness` acepta tanto `1.2.0` como `pi 1.2.0` con comprobación exacta. No acepta versiones distintas, sufijos o SHA incorrecto. Los informes siguen siendo `candidate-evidence-only` y no prueban facturación ni FULL.
- **Pruebas offline positivas/negativas:** cancelación de ambos hijos incluso después de fallo de una alta, bloqueo al fallar cancelación, runtime ausente y versión Pi real/forjada; ninguna prueba llama a proveedor ni ejecuta código generado.
- **P0 CodeRabbit no resuelto:** ejecución segura del código T06/T08 requiere aislamiento de red real del sistema operativo y comprobación no falsificable de finalización. `checkT06Behavior` y `checkT08Behavior` siguen bloqueados, sin habilitar permisos nuevos.
- **Estado:** IMPLEMENTADO_PENDIENTE_CI del nuevo SHA. Mantener revisión independiente y comparativa T09/T10 pendientes; `globalFull:false`. Sin fusiones ni NVIDIA.

## 18/11/2026 — Megatanda CodeRabbit T06 + T11: integridad y pantalla estrecha

- T06: reclamaciones de ODD hijo y supervisor ahora comparan raíces mediante `sameWorkspaceIdentityPath` en vez de convertirlas siempre a minúsculas. Se mantienen los bloqueos de rutas duplicadas en Windows; en Linux/macOS se aceptan rutas realmente distintas por capitalización.
- T06: tras el consentimiento para preparar worktrees se vuelve a verificar sesión, gestor Pi y proyecto **antes de crear o reservar** nada, también en `prepare` sin ODD.
- T11: la alerta más urgente se recorta al ancho disponible en vez de desaparecer detrás de un dato corto; se conserva `/asen-panel`.
- Pruebas negativas de cambio de sesión y gestor, rutas con mayúsculas distintas y vista T11 estrecha. Sin consumos de modelos, sin fusión. `globalFull:false`.
- Estado **IMPLEMENTADO_PENDIENTE_CI**. El P0 de aislamiento de red y finalización comprobable del código generado T06/T08 permanece **BLOQUEADO**.

## 18/11/2026 — P0 CodeRabbit: bloquear ensayos sin aislamiento, antes del proveedor

- Controladores manuales T06 Writer y T08 Fix: barrera no eludible en código **al entrar**. No invocan Pi, revisores ni NVIDIA para un ensayo cuyo comportamiento no podría verificarse de forma segura.
- El cierre preventivo de `checkT06Behavior` y `checkT08Behavior` permanece: no se ejecuta JavaScript generado por modelo hasta disponer de aislador de red real y prueba externa del fin de todas las aserciones.
- La documentación T08 ya no anuncia falsamente «sin red» usando permisos Node ni un máximo consentido de cinco llamadas mientras Pi admite reintentos internos no contados.
- **El Major de CodeRabbit sobre el fin de las pruebas sigue ABIERTO**, y la recuperación funcional de T06/T08 sigue **BLOQUEADA**. Esto elimina el riesgo de gasto inútil o de usar aprobaciones antiguas, no acredita FULL.
- Tests negativos con código sin llamadas al proveedor; revisión CI exact-SHA pendiente. Sin permisos ni merge, `globalFull:false`.

## 18/11/2026 — CodeRabbit: pruebas Pi, geometría T11 y documentación histórica

- T11: la medición TUI de cada cambio de tamaño espera ancho y filas solicitadas cuando el host informa filas enteras; elige la muestra con la misma condición y tolera filas no disponibles. Evita seleccionar estados de redimensionado intermedios.
- Pi: la prueba de cancelación espera a observar el arranque del proceso y exige cierre **antes de los 4000 ms de timeout**. El resultado `cancelado` por timeout tardío ya no equivale a propagación correcta de AbortSignal.
- Documentación T06 registra la ejecución histórica autenticada `43915611666` y separa resultados antiguos de aprobación del SHA actual. T11 pasa a «implementación parcial», sin alegar paridad.
- **Estado:** IMPLEMENTADO_PENDIENTE_CI. Sin nuevos modelos, gastos, permisos ni fusión, `globalFull:false`. El bloqueo P0 T06/T08 continúa.

## 18/11/2026 — Major nuevo CodeRabbit: archivo no revisado entre dos inspecciones

- La proyección del árbol Fix separa `candidateTree` de `unexpectedUntracked`. Antes se cotejaba el hash sin rechazar necesariamente un archivo añadido después de `ls-files`.
- Ahora `inspectStoredFixSourceTree` rechaza expresamente cualquier `unexpectedUntracked` antes de confirmar el árbol completo. No muestra rutas sensibles ni modifica permisos, Writer o Git.
- Prueba de regresión con proyección Git real: el árbol seleccionado mantiene el hash, pero la aparición posterior de un archivo debe bloquear la aceptación de consistencia.
- Estado: **IMPLEMENTADO_PENDIENTE_CI** y revisión CodeRabbit del SHA. `globalFull:false`, no modelos ni fusiones.

## 18/11/2026 — Corrección CI: guardia preventiva con tipo void

- El SHA `78bc94be8283d5b188f4bc1588819c1cfede8504` falló en el CI dirigido por el compilador TypeScript: la función de bloqueo P0 declaraba `never`, por lo que el resto de la función `main` T08 se trató como inalcanzable y se perdió la comprobación de fase `review|fix`.
- Se declara `void` (retorna de tipo, pero **siempre lanza** en tiempo de ejecución). No se relaja el bloqueo de seguridad ni hay acceso a modelos: el ensayo T06/T08 sigue parado al inicio.
- **PENDIENTE_CI** del siguiente SHA. No atribuir éxito sin Gate exacto. `globalFull:false`.

## 18/11/2026 — CI T11 Windows: arranque nativo ConPTY no observado

- CI del SHA `3d2d64766eacbd19b722872140f438daa025e1ec` falló solo en `test (windows-latest shard 0)`: en el segundo terminal Pi (con extensión ASEN) el test no observó `session_start` en el plazo fijado, aunque el proceso seguía vivo. Durante la limpieza apareció un error secundario de `node-pty` `AttachConsole failed`. **No hay evidencia suficiente para atribuir causa raíz a la extensión o a ConPTY.**
- En Windows se permite **un solo reintento** de inicio del terminal T11 **sin modelos** únicamente si la primera sesión falló en fase `inicio` y el controlador confirmó su cierre. La segunda sesión debe emitir todos los eventos TUI, dimensiones y pruebas reales igual que la primera: ningún estado simulado, ninguna concesión Writer, ningún PASS por salir con 0. Otros fallos, sistemas y reintentos quedan bloqueados.
- El informe deja `startupRecovery` con el intento adicional y la prueba exige la lista de sesiones realmente cerradas. Si también falla la segunda, el job debe seguir fallando y `globalFull:false`.
- **PENDIENTE_CI** del SHA nuevo, sin llamadas NVIDIA, sin fusiones. P0 T06/T08 y la auditoría independiente permanecen bloqueados.

## 18/11/2026 — P0 T06/T08: comprobación externa de código generado (tanda parcial)

- Se añade `src/runtime/agents/generated-code-docker-sandbox.ts`: preparación de contenedor Docker Linux sin red (`--network=none`), sistema de solo lectura, sin capacidades ni privilegios, con límites de recursos, imagen Node fijada por digest y **sin descargar imágenes**. Solo se monta una copia del archivo generado en lectura. Docker o imagen ausentes implican bloqueo.
- Los casos y respuestas esperadas los define el proceso padre. Cada caso se ejecuta aparte, con salida única y comprobación externa. Salida 0 sin respuesta, interrupción, casos vacíos, pruebas sin terminar, respuesta incorrecta y anuncios PASS del candidato **no acreditan** cumplimiento. El contador externo refleja pruebas efectivamente verificadas.
- `tests/generated-code-docker-sandbox.test.ts`: casos correctos del verificador y negativos para salida falsa, resultado incompleto, fallo, señal, contenedor inseguro, imagen no fijada, ruta inválida y archivo inexistente.
- **Alcance:** mecanismo preparado y pruebas de contrato offline; no se ha realizado ensayo Docker real ni prueba adversarial de red, así que aún no se acredita aislamiento efectivo en el host de CI. Los controles `checkT06Behavior`, `checkT08Behavior` y los puntos de entrada T06/T08 continúan **BLOQUEADOS**. No se utiliza NVIDIA ni se fabrican permisos.
- **ODD/TDD:** RED por inspección CodeRabbit (Node no bloquea red y salida 0 falsa); RED ejecutado: **no acreditado**. GREEN offline y gates exact-SHA del commit nuevo: **pendientes de CI**. Estado **IMPLEMENTADO_PARCIAL_PENDIENTE_CI**.
- **Siguiente:** probar en contenedor local de confianza, comprobar bloqueo de red y falsificación del resultado; revisar de forma independiente y solo después conectar los ensayos T06/T08 sin eludir aprobaciones individuales. PR borrador, sin merge, `globalFull:false`.

## 18/11/2026 — Decisión de alcance: Docker solo en GitHub Actions

- El usuario decide no instalar ni ejecutar Docker en su ordenador. Los agentes de ASEN siguen funcionando con Pi y worktrees como hasta ahora. El contenedor se reserva exclusivamente para el trabajo de pruebas de código generado en **GitHub Actions**, ejecutado en un servidor alojado de GitHub.
- `runDockerBehaviorCases` se cierra por defecto: exige Linux, indicador explícito de trabajo, `GITHUB_ACTIONS=true`, `RUNNER_ENVIRONMENT=github-hosted`, repositorio, evento `pull_request` y rama concreta de PR #61. Estos valores evitan ejecuciones locales accidentales; **no son credenciales ni una barrera de seguridad criptográfica**. El aislamiento real depende del contenedor sin red.
- El flujo CI incorpora el trabajo `generated-code-docker-sandbox`, exclusivamente PR #61/esta rama. Instala dependencias sin scripts externos, fija el SHA, descarga una imagen oficial Node por digest y ejecuta pruebas independientes de red, límite de permisos, cinco aserciones positivas y rechazos de falsificaciones; no aporta secretos, NVIDIA, modelos ni permisos Writer.
- El candidato se ejecuta dentro del contenedor en un contexto de JavaScript sin `process`, importaciones ni compilación dinámica, mientras la verificación y los resultados esperados permanecen fuera del contenedor. No se considera ese contexto por sí solo barrera frente a código hostil: la protección efectiva es Docker sin red y sin privilegios.
- Los controles de producción T06/T08 **siguen bloqueados**: la comprobación en CI usa código sintético, NO un modelo ni la interfaz Pi integrada. Quedan pendientes prueba CI real exact-SHA, revisión independiente, enlace seguro de evidencias y consentimiento humano de cada Writer. Ningún `SKIP` equivale a `PASS` y no hay merge; `globalFull:false`.
- **ODD/TDD:** RED ejecutado aún no acreditado en CI; fallo conocido de revisión por inspección. GREEN nativo y gates exact-SHA **pendientes** para este cambio. Estado: **IMPLEMENTADO_PARCIAL_PENDIENTE_CI**.

## 18/11/2026 — Megatanda T11 + T07: unificar fallo del modal y lateral nativo

- **Ruta de producción auditada:** `extensions/asen.ts` instala el lateral de Pi desde `installAsenNativeRail`, observa los diarios mediante `getPanelSnapshot` y publica el resultado del comando `/asen-panel` con `createNativeWorkPanel` y `publishInspectedWorkRow`. La geometría 50+3 y su repliegue a menos de 140 columnas se conservan sin reimplementación.
- **Fallo por inspección (RED por inspección):** cuando `createNativeWorkPanel.refreshNow` fallaba, el propio modal pasaba a `activityUnavailable:true`, pero el callback compartido `onRefreshed` solo informaba lecturas correctas. El lateral y la barra podían retener un snapshot anterior mientras el modal declaraba datos desconocidos.
- **Corrección:** se introduce `onUnavailable` de solo presentación, llamado después de comprobar que la sesión sigue siendo válida, y conectado a `publishInspectedWorkRow` en la integración real Pi. El mismo snapshot desconocido sustituye la vista anterior. Un nuevo resultado auténtico restablece las cifras. No se añaden permisos, lanzamientos, llamadas a modelos ni fusiones.
- **TDD:** `tests/native-work-panel.test.ts` añade caso positivo de recuperación y negativos de fallo/estado obsoleto, cambio de sesión con lectura pendiente y cierre del modal. RED ejecutado **no acreditado**: la causa se detectó por inspección; GREEN de CI exact-SHA **pendiente** al publicar esta tanda. No se atribuye aprobación visual.
- **Estado:** IMPLEMENTADO_PENDIENTE_CI; T11-E continúa parcialmente implementado: sigue pendiente el contraste visual independiente con la referencia 4.8.0. T07 conserva pendiente la integración Pi TUI de dos Workers reales dentro de la misma ejecución. T06/T08 siguen bloqueados hasta sus puertas protegidas y pruebas seguras. PR #61 borrador, `globalFull:false`.

## 18/11/2026 — T11 + T07: propagación real de estados desconocidos a barra, lateral y modal

- **Inspección de producción:** aunque el modal `createNativeWorkPanel` enviaba `onUnavailable` a `publishInspectedWorkRow`, esta función solo sustituía `t11Snapshot`. `refreshHostStatus` sigue alimentándose de `t11ActivityCache` y `t11ActivityUnavailable`; ambos quedaban intactos. Además el `createT11RailObserver` de Pi publicaba directamente el lateral sin actualizar el aviso de la barra. Por tanto la barra compacta podía mantener contadores anteriores o no avisar de hijos desconocidos.
- **Corrección funcional:** `publishInspectedWorkRow` limpia la caché y marca la indisponibilidad local cuando hay fallo total; distingue ese caso de `agentFlowUnavailable`, sin borrar hechos locales ante un fallo exclusivamente de hijos. El observador del lateral usa la misma ruta de publicación. La barra estrecha prioriza `! actividad no disponible` o `! hijos no disponibles`; al recibir una lectura local nueva se repuebla la caché. Los avisos no ejecutan agentes ni alteran permisos o estados Writer.
- **TDD:** se añaden positivos de nuevo estado desconocido y recuperación y negativos de falso cero, datos antiguos, prioridad de error total, sobreanchos y acceso `/asen-panel`. El defecto anterior se acreditó por **inspección**, no por RED ejecutado. GREEN exact-SHA y ejecución Pi real de esta modificación: **pendientes de CI** al publicar.
- **Sin duplicar:** se conserva el reparto lateral 50+3 a partir de 140 columnas, la degradación por debajo de 140, los ensayos nativos ya acreditados y el mecanismo de control del foco. **Pendientes:** contraste visual independiente con Gentle Shell 4.8.0 y TUI de dos Workers Pi en una única ejecución bajo las autorizaciones protegidas. PR #61 borrador, `globalFull:false`, sin NVIDIA, sin merge.

## 18/11/2026 — T11 + T07: observación Pi visible en modo estrecho y caducidad de hijos

- **Hallazgo en ruta de producción:** `createT11RailObserver` solo observaba el lateral fijo (`t11Rail.active()`); bajo 140 columnas la barra compacta quedaba sin sondeo de diarios. Además `refreshWorkRow` sobrescribía el snapshot de hijos al comprobar trabajo local cuando el lateral no estaba activo. El resultado podía perder Workers observados o aparentar que no existían.
- **Corrección:** ahora el observador también lee los diarios cuando la fila compacta está visible, sin activarse cuando se oculta la presentación. `combineT11LocalWithChild` preserva únicamente el estado de hijos observado hace 12 segundos como máximo; si expira se muestra `agentFlowUnavailable` y no cero hijos. Los datos de trabajo local se refrescan sin arrastrar Git, permisos o revisiones antiguos. Si falla el origen, no se recupera el snapshot anterior hasta una lectura nueva.
- **TDD:** `tests/t11-compact-child-observer.test.ts` comprueba sondeo permitido/denegado, lectura y cambio de sesión, preservación del resultado fresco, caducidad, error de hijos y recuperación local con hijos desconocidos. RED **por inspección** de la antigua lógica; RED ejecutado **no acreditado**. GREEN exact-SHA y ensayo Pi 1.2 real de esta modificación **pendientes** hasta comprobar el nuevo CI.
- **No implica cierre:** geometría 50+3, cursor, ratón, cabecera y matrices nativas previas no se reimplementan. Sigue pendiente la captura y comparación independiente de Gentle Shell 4.8.0 y el ensayo de dos Workers Pi conectados a una única TUI real. No hay modelos, aprobación Writer, merge ni evidencia FULL. `globalFull:false`.

## 18/11/2026 — T11 + T07: primer sondeo pendiente y caducidad real sin nuevos turnos

- **RED por inspección (no ejecutado):** el puente `combineT11LocalWithChild` devolvía listas locales sin `agentFlowUnavailable` si no existía lectura previa de hijos. La vista podía confundir «todavía no observado» con «cero hijos». Otra discrepancia: los 12 segundos de caducidad se comprobaban solo cuando llegaba un refresco local, así que un Pi inactivo podía conservar datos antiguos en pantalla indefinidamente.
- **GREEN implementado, aún pendiente de CI exact-SHA:** se señala `agentFlowUnavailable` cuando no hay primera observación; la ausencia real requiere `agentFlow.state='absent'` procedente del diario. `observeT11ChildAvailability` impide publicar cifras de hijos si el origen no se consultó. `createT11ChildExpiryController` programa una invalidación de presentación a los 12 segundos, aunque no haya eventos de Pi; las lecturas nuevas renuevan el plazo. `stop` cancela la invalidación tras cerrar/cambiar sesión. El callback comprueba el contexto Pi original antes de actualizar el modal, el lateral o la fila compacta.
- **Pruebas nuevas positivas y negativas:** primera lectura desconocida en 24/40/50/80/120/139 columnas; diario explícitamente ausente, caducidad y recuperación; errores, plazos inválidos, doble renovación, cancelación y cierre sin mensajes de una sesión anterior. No se simulan aprobaciones Writer ni se generan resultados del modelo.
- **Alcance:** mejora de observación T07 en Pi, sin rehacer el lateral 50+3, el fallback o los tests nativos previos. No demuestra aún dos Workers Pi enlazados a la TUI dentro de una misma ejecución ni el contraste visual independiente con Gentle Shell 4.8.0. `globalFull:false`; PR #61 borrador, sin merge, sin NVIDIA; Pi Free Smoke omitido no equivale a PASS.
- **ODD:** pruebas RED **por inspección**, RED ejecutado **no acreditado**, comprobación GREEN exact-SHA **pendiente**, revisión visual independiente **pendiente**. Continuar con el CI del SHA final y la comparación visual nativa/independiente cuando esté disponible; no cerrar T11-E/T07 por CI solo.

## 18/11/2026 — Reparación CI T11/T07: tipo opcional estricto

- **RED ejecutado en CI (compilación, no RED conductual):** SHA `9cee989b68cf91dc6b625e8e5e77246c3eaf08f8` falló en Pi 1.2, macOS, pruebas de agentes y contenedor al compilar `extensions/asen.ts:622`: `TS2379`, por pasar `agentFlow:undefined` a un `AsenPanelSnapshot` con `exactOptionalPropertyTypes:true`. La causa fue la nueva invalidación del snapshot tras 12 segundos, no un fallo de permisos ni del proveedor.
- **Reparación:** el callback crea una copia del snapshot, elimina la propiedad opcional `agentFlow` con `Reflect.deleteProperty` y publica `agentFlowUnavailable:true`. No borra datos del diario ni modifica el snapshot original, la autorización o la geometría. Ningún Writer vuelve a ejecutarse.
- **Evidencia GREEN:** pendiente de los trabajos exact-SHA posteriores a esta corrección. El fallo de compilación no acredita que haya pasado el test funcional; conservar T11-E/T07 en `IMPLEMENTADO_PENDIENTE_CI`, sin equivalencia visual ni integración de dos Workers Pi TUI reales. `globalFull:false`.

## 18/11/2026 — T11 + T07: alerta de inicio y prioridad de Workers bloqueados

- **CI inspeccionado del SHA anterior `c8404491132cdfda1fa1a4e324d866402f461d5f`:** los tests `focus-extension-integration.test.ts` fallaban en Windows y macOS, no por fallo en Pi sino porque exigían exactamente una línea de inicio anterior. La nueva ruta de producción muestra `! hijos no disponibles` hasta observar diarios de sesiones hijas; no es correcto quitar el aviso para satisfacer la prueba antigua. RED **ejecutado** y verificado en los registros nativos de esos dos sistemas.
- **Prueba corregida:** la aserción de arranque exige el nuevo aviso y comprueba que proveedor, modelo y esfuerzo originales permanecen intactos; prohíbe presentar cero Workers o aceptación no verificada. No implica que los diarios de dos Workers reales se hayan observado.
- **Segundo fallo por inspección (RED conductual no ejecutado):** `renderAsenWorkRow` enumeraba Workers activos y en cola antes de bloqueos de hijos. En 40/50 columnas el bloqueo podía desaparecer por falta de espacio. Se priorizan ahora bloqueos y lanzamientos sin verificar; el contador de la barra Pi agrega `stages.blocked` SOLO cuando `agentFlow` está vigente y no hay lectura fallida.
- **TDD añadido:** `tests/t11-t07-child-attention.test.ts` comprueba dos Workers proyectados (uno activo y otro fallido), prioridad en 40/50/80/120/139 columnas, contador de bloqueo, diario antiguo o ausente sin falso bloqueo, ninguna aceptación ni fusión inventada. Es una prueba con datos sintéticos, NO la evidencia TUI de dos Pi reales.
- **Estado:** implementación y pruebas publicadas; GREEN **pendiente** de CI, Pi 1.2, arquitectura y Release Gate del SHA final. T11-E: captura y comparación visual independientes pendientes. T07: dos Workers reales conectados a TUI en un mismo ensayo pendiente. PR #61 sigue borrador, sin autorización Writer ficticia ni merge. `globalFull:false`.

## 18/11/2026 — T11 + T07: regresión real de barra Pi y ocultación durante resize

- **RED ejecutado confirmado:** SHA `6a5029e634ec3bd6010bb86f40e02fbb4b6a2f67`, CI 44286493350, falló en macOS (`test shard 0`) y Windows (`test shard 1`) en `tests/panel-observation-integration.test.ts`: tres aserciones antiguas esperaban la barra sin `! hijos no disponibles`. La producción distingue correctamente diarios hijos no consultados y datos hijos verificados vacíos. El fallo es de contrato de presentación de tests, no prueba de fallo de Worker Pi.
- **Pruebas reparadas:** las tres aserciones se actualizaron para conservar el aviso real y las comprobaciones del contexto, modelo y modo de permisos. Se mantiene el comportamiento del panel y el rechazo de aceptación de tareas sin evidencia.
- **Defensa adicional (RED por inspección):** `shouldObserveT11Surface` podía permitir un sondeo si `railActive` seguía verdadero transitoriamente tras pedir `position=hidden`. Ahora la preferencia explícita `hidden` se impone siempre; el panel `right` sin lateral instalado tampoco empieza lecturas. Pruebas positivas y negativas agregadas a `tests/t11-compact-child-observer.test.ts` para ocultación con rail anterior, lateral real y sin rail.
- **GREEN:** exact-SHA CI, Pi 1.2, arquitectura y Release Gate pendientes del SHA final al registrar esta entrada. No se afirma haber ejecutado dos Workers Pi reales dentro de la TUI; pruebas simuladas y geometría Pi existente no sirven de acreditación T07. Tampoco existe aún comparación visual independiente con Gentle Shell 4.8.0. PR #61 permanece en borrador, sin Writer, modelos de pago ni merge; `globalFull:false`.

## 18/11/2026 — Supertanda GitHub: CI y seguridad de sesiones T06/T08 y avisos T11/T07

- **RED de CI ejecutado:** SHA `c7faeb63cf145a835aa003d342368a7e906c21a8`, CI 44288393060, terminó con fallos en Windows, macOS y Linux. Causa: prueba antigua exigía mostrar `coste/uso ?` con 100 columnas, aunque la barra suprime ese dato secundario para preservar `! hijos no disponibles`, contexto, modo y acceso a `/asen-panel`. Se corrige el contrato de prueba y se añade cobertura de 100 y 160 columnas; no se elimina el aviso.
- **T06 (CodeRabbit):** verificado en HEAD un cambio de sesión posible durante las lecturas ODD. Comprobación de identidad tras la primera y la segunda lectura `loadTodos`, y tras `journal.reserve`; la reserva ambigua queda retenida para inspección, sin reintentos ni autoridad Writer. Pruebas negativas de cambio de sesión y aborto en ambas lecturas; deben demostrar que no se crean worktrees ni reservas.
- **T08 (CodeRabbit):** `checkT08Behavior` YA devolvía `false`, sin ejecutar candidatos: el informe antiguo de aprobación por `process.exit(0)` no es estado HEAD. Se endurece el filtro estático frente a accesos calculados por corchetes, pero no se considera aislamiento ni se desbloquea código generado. Pruebas positivas/negativas sin modelo.
- **Evidencia:** T11 RED ejecutado confirmado en registros GitHub; T06 y T08 RED por inspección (RED ejecutado no acreditado). GREEN exact-SHA pendiente de nuevos CI, Pi 1.2, arquitectura y Release Gate. SKIP no equivale a PASS. Mantener T11-E visual, T07 dos Writers Pi TUI reales, T09/T10 y revisión independiente pendientes. PR #61 borrador, sin merge, sin NVIDIA y `globalFull:false`.


## 2026-11-18 — Ejecución de megatanda: T06, T08, T07/T11 y T09/T10

**Inicio:** `e09bca9e770d0e6ccd22dd02133c2e31b2b882ed`, verificaciones CI/Release Gate/arquitectura/Pi 1.2 correctas de ese SHA.
**T06:** endurecer `settleT06ReadOnlyTrial` para no limpiar si faltan identidades de hijos, se duplican o no hay runtime; intentar cancelar lo conocido sin declarar limpieza segura. TDD positivo y negativo.
**T08:** la prueba Docker ya aislaba la red y comparaba resultados externamente, pero filtraba un array del contexto externo a `vm.SourceTextModule`. Reconstruir el argumento dentro del contexto y probar el desvío por `constructor.constructor` exclusivamente en Docker sin red de GitHub. No ejecutar código generado en el host.
**CodeRabbit:** Minor de sesión ODD contrastado con el código del SHA de inicio: ya revalida después de ambas lecturas y de reserva. Major original de finalización de pruebas **sin cerrar** hasta ensayo seguro y evidencia independiente; el guardado del ensayo T08 sigue bloqueado.
**T07/T11:** conservar observación/resize y pruebas nativas existentes. La comparativa visual independiente sigue BLOQUEADA. **T09/T10:** benchmark A/B auténtico y revisión externa permanecen BLOQUEADOS.
**Reglas:** no usar NVIDIA, no autorizar Writers, no actualizar permisos, no fusionar, PR draft, `globalFull:false`. GREEN y CI del nuevo SHA: pendientes hasta consultar GitHub.


## 18/11/2026 — T07: revisión y actividad de hijos bloqueados

- Contraste de dos Minor CodeRabbit originales: los contadores por etapa ocultaban Workers reales activos y en cola si su etapa era bloqueada; REVIEW mostraba cero resultados aunque un hijo necesitase revisión humana.
- Corrección: contar actividad desde workerObserved y bloqueos por etapa, y enseñar por separado revisiones locales y de hijos. La ausencia de lectura de hijos no equivale a cero.
- Pruebas positivas y negativas con datos sintéticos; no equivalen a dos Pi reales/TUI ni aceptación. Sin proveedores ni permisos. CI exact-SHA y revisión externa pendientes. globalFull:false.


## 2026-11-18 — Seguridad de pruebas de comportamiento, Major nuevo de CodeRabbit

- Se detectó que un candidato sin la función exportada podía superar falsamente todos los casos que esperaban `TypeError`: el controlador generaba ese mismo error dentro del `catch` de la función. **Corrección:** comprobar el export fuera del `catch` del candidato. Un export ausente o no invocable debe provocar un resultado de infraestructura no exitoso.
- Pruebas de GitHub en Docker sin red: export ausente, export no invocable, sintaxis válida en el caso adversarial de salida anticipada y motivo exacto de fallo. La ausencia del archivo se verifica tras la puerta CI en la prueba real, no se confunde con el bloqueo local.
- Se mantiene el bloqueo de ensayos Writer T06/T08, sin modelos ni credenciales ni permiso añadido. Ninguna prueba offline sustituye el ensayo autorizado. `globalFull:false`.


## 2026-11-18 — Tanda T07/T11 de estabilidad y rendimiento (CodeRabbit)

El sondeo del lateral llama a `getPanelSnapshot(ctx,"observer")` y omite el `git status` síncrono; la vista abierta manualmente conserva Git fresco. La pérdida de datos locales invalida lecturas y progreso Todo pendientes y borra la vista anterior. Solo una lectura válida de la misma sesión recupera el widget. El acceso al panel se recorta en terminales de menos de 12 columnas para evitar excepciones y desbordes. El ensayo nativo distingue espera del primer dibujo de espera del indicador de arranque. La prueba del observador contabiliza las notificaciones de indisponibilidad para no ocultarlas. Sin modelos, consentimientos ni integración; `globalFull:false`.


## 18/11/2026 — CI real y reintento T11 Windows

- RED confirmado en CI `44305533676`: el test offline esperaba `solo-github-actions`, pero la puerta ya estaba abierta durante el trabajo protegido de GitHub, y la ruta inexistente dio `aislamiento-no-disponible`. Corregido el resultado esperado según el entorno sin rebajar la puerta ni admitir el fichero ausente.
- El ensayo nativo T11 exige cuatro sesiones Pi cerradas sin reintento Windows, o cinco con el único reintento previsto. No confundir un reintento cerrado con un fallo.
- Las nuevas pruebas son de seguridad y geometría, no evidencias de uso de modelos, Writer ni equivalencia global. `globalFull:false`.


## 18/11/2026 — T07/T11 revisión parcial y alertas críticas

- REVIEW declara parcial la revisión cuando el origen carga solo los lotes recientes; si el diario de hijos falla, el cero se limita explícitamente a resultados locales. El panel remite a `/asen-worktrees review` para ampliar la inspección. La cola dice `observados en cola`, sin afirmar que nunca se ejecutaron.
- T11 compacta el aviso de hijos a `! hijos ?` cuando un bloqueo local y el comando de inspección deben caber en 40 columnas. Pruebas negativas de mensaje global falso y ancho.
- Los cambios son únicamente de lectura y presentación, sin permisos ni modelo. `globalFull:false`.

## 18/11/2026 — T06/T11: sesiones caducadas, sondeo limitado y liberación única

- **HEAD de partida verificado:** `2ed8bd5f8564297ee24f0bc4a876fa210f85d83d`. Release Gate, arquitectura y Pi 1.2 correctos; el CI completo todavía estaba ejecutándose cuando se examinó esta tanda. La prueba Docker T06/T08 sin red pasó en ese SHA; Pi Free Smoke omitido no demuestra proveedor.
- **T11:** se detectó por inspección que el observador se quedaba programado si la sesión expiraba con el panel oculto. Se invierte la comprobación de sesión/visibilidad: la sesión obsoleta detiene el observador incluso sin lectura activa. Además se rechazan intervalos no finitos o negativos para evitar sondeos excesivos. Se añaden dos pruebas negativas/positivas. **RED ejecutado no acreditado; GREEN exact-SHA pendiente.**
- **T06:** prueba de competencia entre dos solicitudes de liberación de la misma reserva. Solo una debe prosperar; la otra conserva el rechazo de intento duplicado. No se lanza Git ni se borra ningún worktree.
- **CodeRabbit contrastado:** el Minor sobre anchura inferior a 12 ya está cubierto por `renderT11CompactFallback`, que recorta `/asen-panel` antes de llamar al renderizador de ancho mínimo. El Major histórico T08 no autoriza la ejecución: `checkT08Behavior` continúa devolviendo false y el ensayo Docker aislado es independiente. El caso de fichero ausente se comprueba dentro del trabajo Docker de GitHub, además de la puerta negativa local. No cerrar avisos sin revisión y pruebas exactas.
- **Bloqueos:** Writers Pi y Fix real con aprobación individual, pruebas TUI completas, referencia A/B externa T09 y auditoría independiente T10. PR #61 en borrador, sin merge, sin NVIDIA ni pago, `globalFull:false`.

## 18/11/2026 — Segunda megatanda de corrección T08/T06 y visibilidad T07/T11

- **SHA anterior:** `a3e52d87df34325ff691eed85d3188ab6f1b20f7`; arquitectura, Pi 1.2 y Release Gate correctos, CI completo aún en curso al empezar. Los trabajos en curso no son GREEN.
- **T08 (nuevo Major CodeRabbit):** la exportación de una clase ahora se rechaza antes de comparar excepciones de comportamiento. Una clase que da `TypeError` por invocarla sin `new` no simula un ensayo válido. Regresión adversarial en GitHub Docker sin red, con funciones de prueba válidas conservadas. No se ejecuta código generado en el equipo.
- **T06 (nuevo Major):** se registra justo antes del primer intento `git worktree add` la frontera de efectos. Fallos seguros anteriores liberan bajo bloqueo la reserva exacta; cualquier error después conserva la reserva para inspección manual, sin reintentos ni borrados. Prueba negativa de cambio Git concurrente tras reservar.
- **T07/T11 (Minor):** la barra compacta mantiene el aviso de hijos desconocidos delante de una revisión secundaria; REVIEW coloca «parcial» al comienzo; las pruebas de cola distinguen 1 de 10. Quedan por contrastar la restauración del widget Todo y la observación Git manual frente a sondeo, sin cerrar esos avisos.
- **Bloqueados:** T06/T08 Writer genuino y Fix con aprobaciones individualizadas, T07/T11 en TUI real y comparación visual, T09 A/B, T10 auditoría independiente. Sin modelos de pago ni NVIDIA, sin merge, PR draft y `globalFull:false`. GREEN y CodeRabbit del nuevo SHA aún pendientes.

## 18/11/2026 — Corrección de prueba T06 tras CI rojo

- **SHA comprobado:** `65c1b2d3850d3026dd15c3adb29ba019578dac6c`. Trabajo de agentes T02–T08 `134826088797`: **208 PASS, 1 FAIL**. Falló solo la nueva prueba de T06 («Missing expected rejection») porque instrumentaba `f.journal.reserve`, pero la ruta productiva del comando crea una segunda instancia del diario. Por tanto nunca se provocó la carrera esperada.
- **Reparación:** la prueba instrumenta de manera temporal `ParallelTodoWorktreeJournal.prototype.reserve` para alcanzar la instancia usada por el comando. Lo restaura en `finally`, incluso ante error. Se mantiene el escenario de árbol Git sucio después de reservar y anterior a `git worktree add`. No se cambia la política de seguridad ni el código productivo con esta reparación.
- **Pruebas exact-SHA:** pendientes de relanzamiento y cotejo de CI, arquitectura, Pi 1.2, Release Gate y Docker. No convertir 208/209 a PASS total. `globalFull:false`.

## 18/11/2026 — T07/T11: recuperación local y última consulta Git

- **HEAD de partida:** `0dc52ea9b7b1eaff6af8c171f85d4b4d0c80e030`. Release Gate, Pi 1.2, arquitectura, pruebas T02–T08 y contenedor Docker sin red correctos en la última comprobación. El CI completo continuaba ejecutándose.
- **T11/T07:** al fallar `list` del Todo se invalidan juntos el indicador de tareas, la barra, la caché y las lecturas anteriores. Una nueva lectura correcta de la misma sesión recupera el progreso sin esperar otra orden. No se muestra cero como si fuese una comprobación.
- **Git:** solo la lectura manual guarda la última observación dentro de la sesión/proyecto. El sondeo sin Git no la borra y la vista indica «última consulta (puede haber cambiado)». Se limpia al cambiar de sesión/proyecto o al fallar una consulta manual.
- **Pruebas:** recuperación del widget y aislamiento de observaciones Git en la suite. RED/GREEN y gates del SHA nuevo pendientes de cotejar. Ningún modelo, Writer o pago ejecutado; PR borrador, sin merge; `globalFull:false`.

## 18/11/2026 — Megatanda de robustez CodeRabbit y diagnóstico Pi macOS

- **HEAD de partida:** `3d2ce3dc0c2e3ba9603b9530818ffbb505345866`. CI general de ese SHA detectó un único fallo en `test (macos-latest shard 1)`: `tests/ask-user-rpc.test.ts`, espera Pi RPC agotada a los 15 s. Misma prueba correcta en el SHA anterior: raíz de lentitud **NO DEMOSTRADA**.
- **Prueba macOS:** se mantiene ejecución real sin modelos ni credenciales; plazo finito de 30 s solo para macOS y diagnóstico de etapa `get_commands/commands/select/answer` para distinguir carga lenta de un bloqueo de RPC. Otros sistemas conservan 15 s.
- **Docker sin red:** los errores de lanzamiento se distinguen de un proceso candidato que llegó a ejecutarse y rechazó un export. Nuevas pruebas de ambos resultados. Un contenedor fallido nunca acredita una comprobación negativa.
- **T06:** nueva comprobación de cancelación inmediatamente después del callback previo a `git worktree add`; una señal abortada no crea un worktree. Se conserva el comportamiento prudente del diario tras marcar un intento ambiguo.
- **Pruebas Git:** todos los `git -C` del fixture enlazado T06 usan un entorno sin las variables locales de repositorio comunicadas por `git rev-parse --local-env-vars`; previene afectar al repositorio invocador desde hooks o `GIT_DIR`. Caso negativo con `GIT_DIR` ajeno.
- **T07/T11:** la fila compacta usa `! hijos ?` cuando así puede conservar una alerta de contexto o el número de revisiones. Da preferencia al aviso completo cuando cabe igual información. Pruebas de 35 y 55 columnas.
- **Bloqueos:** ejecución auténtica de Writer/Fix con autorización humana, paridad T11 interactiva, A/B T09 y auditoría independiente T10. Otras observaciones de CodeRabbit requieren comprobación. Sin pago ni NVIDIA, sin fusión, `globalFull:false`. Las pruebas del SHA que se publique siguen PENDIENTES.

## 18/11/2026 — Corrección de compilación y geometría tras CI

- **SHA inspeccionado:** `b3886a824447351825f5469765cb2987cc6e9a43`. `Pi 1.2 runtime evidence` falló antes del ensayo por dos errores TypeScript TS2339: un test T06 llamaba a `f.git`, no incluido en el objeto del fixture. Se sustituye por `execFileSync` en la raíz de prueba con `gitFixtureEnv`, sin tocar el código productivo.
- **Barra T11:** el test de 40 columnas acepta la forma corta `! hijos ?` cuando permite mostrar una alerta adicional, mientras conserva el aviso completo a anchuras mayores. El tamaño y presencia de la advertencia siguen comprobados.
- **Estado:** corrección publicada pendiente del CI y Release Gate de su SHA exacto. No declarar PASS antes de ver el resultado. `globalFull:false`, sin merge ni Writer.

## 18/11/2026 — T11: corrección del CI de Linux y macOS

- **SHA inicial:** `617ee4deddb416eeb34edce584be7fd5467fdf07`, PR #61 borrador.
- **Hallazgo confirmado:** CI Linux falló en cuatro pruebas de panel T11 y macOS en una: el selector abreviaba `! hijos no disponibles` por maximizar el número total de segmentos, incluso para añadir solo `coste/uso ?` y eliminar un aviso prioritario a 44 columnas.
- **Corrección:** conservar los segmentos incluidos por identidad y elegir abreviación solo si permite mostrar un nuevo segmento de prioridad crítica (bloqueos, hijos, contexto, revisión o modo). Cuando no mejora los avisos críticos se conserva la forma completa; coste/modelo no desplazan avisos de salud.
- **Verificación:** nueva prueba a 100 columnas junto a cobertura de 35, 40, 44 y 55 columnas existente. CI exacto del siguiente SHA pendiente, no se da por superado.
- **Restricciones:** sin fusión a la rama base, sin modelos ni pagos, sin cambio de permisos, `globalFull:false`.

## 18/11/2026 — T08: rechazo de export y tiempos agotados

- Se exige prueba explícita del controlador aislado para los rechazos: código 73 y salida exacta ASEN_EXPORT_RECHAZADO; Docker 125 u otras interrupciones no son rechazos acreditados.
- Los tiempos de espera ETIMEDOUT se distinguen de los fallos de arranque y nunca aprueban casos.
- Las pruebas negativas comprueban fallo de arranque, interrupción, clase exportada y casos válidos; permanecen los límites sin red y sin privilegios.
- No se autoriza Writer, modelos, pagos ni FULL: checkT08Behavior conserva su bloqueo y globalFull:false. Validación exact-SHA pendiente.

## 18/11/2026 — T11: versiones de observación y progreso
- La lectura más reciente al iniciarse gobierna el widget Todo; una lectura antigua de recuperación no puede anular una actualización posterior.
- Cada inspección manual Git lleva una generación: las inspecciones anteriores no pueden modificar el último resultado comprobado.
- Los sondeos del lateral capturan la versión de invalidación; los iniciados antes del fallo se descartan sin mostrar contadores obsoletos, también al fallar.
- No se alteran proveedores, permisos, tareas ni registros; la UI sigue siendo de solo lectura. Pruebas CI exact-SHA pendientes.

## 18/11/2026 — T11/T06: indicación Git antigua y entorno de pruebas

- El aviso «última consulta» se muestra antes de la rama y de su contador, de modo que no desaparezca al truncar la línea.
- La prueba T11 de recuperación usa un ancho controlado, independiente del terminal del CI.
- Los dos conjuntos T06 preparan su entorno Git aislado antes de crear el repositorio de prueba; el test incorpora GIT_DIR malicioso ANTES de ejecutar Git, sin modificar las variables globales.
- Cambios solo de presentación y pruebas, sin permisos, sin fusión; globalFull:false. CI exact-SHA pendiente.

## 18/11/2026 — Pruebas regresivas adicionales de T06/T11

- T06: se crea el primer worktree, el segundo destino queda ocupado tras la reserva; se exige conservar el primer worktree y el diario en reservado, impidiendo una segunda reserva de los mismos scopes. No se borra ni reintenta automáticamente.
- T11: en empate de dos avisos a 40 columnas, el bloqueo observado y el aviso de hijos desconocidos prevalecen sobre la advertencia secundaria de contexto.
- Probar en CI exact-SHA, sin permisos ni modelo; globalFull:false.

## 18/11/2026 — T07: igualdad exacta del número de hijos en cola
- Reparadas dos expresiones de prueba que escapaban de más el límite de dígitos. Se añade caso negativo donde «10» no puede satisfacer «1».
- Validación CI exact-SHA pendiente; sin permisos, modelos ni cambios del flujo productivo.

## 18/11/2026 — Validación de fuente Docker y terminales estrechas

- T08: la ausencia de un archivo real en el trabajo autorizado se distingue de un fallo de Docker con la razón `origen-ausente`, antes de ejecutar Docker. La prueba local solo verifica el bloqueo `solo-github-actions`.
- T11: la función de reserva compacta ya admite anchos de 1 a 11 columnas; nueva prueba de ancho 1–15 sin desbordamiento y sin elevar artificialmente el ancho del terminal.
- No se amplían permisos, no se ejecuta código generado fuera del contenedor, no hay merge, `globalFull:false`. Validación del SHA nuevo pendiente.

## 18/11/2026 — Hallazgos adicionales de la revisión independiente

- T08: la detección de clases usa su sintaxis de función, sin confundir una función normal con `Object.freeze` con una clase. Se añade una prueba Docker real para función congelada.
- T08: `ENOBUFS` se notifica como `salida-excesiva` y mantiene `verified:false` y los casos anteriores contados.
- T06: las variables Git del entorno se limpian sin distinguir mayúsculas/minúsculas para evitar `Git_Dir` heredado en Windows; se añaden pruebas negativas.
- CI exacto del siguiente SHA pendiente. `globalFull:false`, sin fusión ni ampliación de permisos.

## 18/11/2026 — Lecturas T11 obsoletas y estado de panel

- Las consultas manuales incorporan versiones de Git, invalidación y publicación local. Si quedan superadas, sus resultados no se publican en caché, lateral ni ventana modal.
- El panel nativo comprueba la versión antes de pintar y no convierte un resultado descartado en una falsa pérdida de actividad. Se añaden dos pruebas de ventana modal.
- Los sondeos mantienen los hijos observados y descartan el Todo local anterior cuando hay una publicación local más reciente. Un fallo antiguo no elimina datos locales válidos.
- El aviso sobre Git síncrono en los sondeos es independiente y sigue pendiente de resolver.
- Sin fusión, sin permisos extra, `globalFull:false`. CI exact-SHA pendiente.

## 18/11/2026 — Git asíncrono en el sondeo T11/T07
- Se añade inspección de cambios Git con procesos asíncronos sin shell. Conserva límites, comprobaciones de identidad, alcances y rechazo del inspector manual.
- El sondeo periódico utiliza esta modalidad para no bloquear el hilo de Pi; la consulta manual mantiene su comportamiento actual.
- Prueba de paridad frente a estados limpio, cambios previstos, cambios fuera del alcance, divergencia y ruta ausente.
- Sin permisos, sin merge, sin modelos; `globalFull:false`. CI exact-SHA pendiente.
