# T11 — Paridad de layout y experiencia Gentle Shell 4.8.0 en ASEN

**Estado:** T11 EN DESARROLLO; layout derecho/inferior y navegación con Pi real verificados parcialmente. Cabecera y superficie implementadas, pendientes de CI/contraste visual. No se declara equivalencia completa.  
**Prioridad:** P1, inmediatamente después de la integración de datos T06/T07 y **antes de cerrar la interfaz T07**.  
**Rama:** `feat/flujo-de-agentes-20261115` (PR #61 en borrador; no fusionar).  
**Referencia congelada:** tag oficial [Gentle Shell v4.8.0](https://github.com/Gentleman-Programming/gentle-shell/releases/tag/v4.8.0), commit [`3dc9029755912358d0a172b4972e5842c239570c`](https://github.com/Gentleman-Programming/gentle-shell/tree/3dc9029755912358d0a172b4972e5842c239570c), publicado el 14/11/2026. **Gentle 4.8 trae Pi 1.5.2; ASEN usa Pi 1.2.0.** La compatibilidad no puede suponerse.

## 1. Fuentes exactas, no conjeturas visuales

- [Manual Gentle Shell 4.8.0](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.8.0/docs/gentle-shell.md): pantalla grande, pantallas estrechas, panel, interacción, presets, barra y regular/fullscreen.
- [`lib/shell-sidebar-layout.ts`](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.8.0/lib/shell-sidebar-layout.ts): `SIDEBAR_BREAKPOINT=140`, `RAIL_WIDTH=50`, `GAP=3`; distingue estado del host, separación de cabecera, barra e interacción; experimenta con árbol de componentes Pi.
- [`lib/shell-panel.ts`](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.8.0/lib/shell-panel.ts): cabeceras plegables, contenido denso, resumen de trabajo, panel a ancho completo, ajuste de líneas.
- [`lib/shell-bar.ts`](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.8.0/lib/shell-bar.ts): barra, segmento de modelo, esfuerzo, perfil, rama, cambios, permisos, contexto, coste, uso, prioridades de truncado.
- [`lib/visual-customization-policy.ts`](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.8.0/lib/visual-customization-policy.ts): posición del estado `auto/right/bottom/hidden`, cabecera `top/below-input/split`, densidad, superficies y presets.
- [`design/shell-rework/02-proposal.html`](https://github.com/Gentleman-Programming/gentle-shell/blob/v4.8.0/design/shell-rework/02-proposal.html): propuesta de distribución de origen. Fuente de intención visual, no prueba de que cada detalle se haya publicado.

**Precisión histórica:** parte de la experiencia visual se introdujo en versiones anteriores. La tarea verifica **el resultado existente en el tag 4.8.0**, no atribuye todo el diseño a las novedades publicadas el 14/11/2026.

## 2. Cómo se organiza la pantalla

### Pantalla completa ancha — desde 140 columnas

La conversación vive a la **izquierda**. Un espacio propio a la **derecha** ocupa 50 columnas, más 3 de separación. No es un widget lineal encima del editor. La barra de estado tiene una fila clara, que no duplica permiso ni información de integración. Se conserva sitio suficiente para escribir.

```text
┌──────────────────────────────────────────────────────┬───────────────────────────────────────┐
│ ✿ ASEN · proyecto/ruta                  sesión/perfil │                                       │
│                                                      │ ▾ TODOS                         2/6 │
│ Conversación, herramientas y resultados              │   ✓ 2 completadas                    │
│                                                      │   ◐ Tarea actual                      │
│                                                      │ ▾ JOBS                         1    │
│                                                      │ ▾ AGENTS                       2    │
│                                                      │   ◐ Worker A · tarea · tiempo         │
│                                                      │   ? Worker B · necesita respuesta     │
│                                                      │ ▾ CHANGES                     ±3    │
│                                                      │ ▾ REVIEW             necesita revisión│
│                                                      │ ▾ INTEGRATIONS             observado │
├──────────────────────────────────────────────────────┴───────────────────────────────────────┤
│ ─ ✿ fase actual ──────────────────────────────────────────────────────────────────────────────│
│ › escribir aquí                                                                              │
│ rama ±3 │ modo │ modelo · esfuerzo · perfil │ contexto │ coste/uso si son conocidos           │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Es **esquema funcional**, no captura ni prueba de interfaz renderizada. La referencia soporta cabecera `top`, `below-input` o `split` y estado configurable. La distribución dibujada ilustra `split`.

El orden es **TODOS → JOBS → AGENTS → CHANGES → REVIEW → [STATS opcional] → INTEGRATIONS**. Secciones plegables, cabecera con contador a la derecha y filas densas. Las tareas terminadas se agrupan; las activas muestran su texto relevante. Los agentes se ordenan por atención: esperando respuesta, ejecutando, pendientes y errores; la fila muestra tarea, rol, tiempo y uso verificado. Pulsar abre el detalle del agente; cambios abre su visor. REVIEW pide acción solo cuando exista evidencia real. STATS opcional detalla coste/tokens/llamadas y desglose de modelos sin inventar cifras.

### Pantalla estrecha — menos de 140 columnas

No hay panel fijo. **Una sola línea de trabajo vivo** resume Agents/Todos y los bloqueos prioritarios junto al editor, con un botón o acción **[ Panel ]**. El panel se abre sobre el espacio disponible, se desplaza y se cierra con Escape, `q` o un control visible. La vista estrecha no elimina acceso a CHANGES/REVIEW/INTEGRATIONS.

```text
Conversación adaptada al ancho
◐ 2 agentes · ? 1 esperando · ✗ 1 fallo · 2/6 tareas
─ ✿ ejecutando ────────────────── [ Panel ]
› escribir…
rama ±3 │ modelo/estado │ contexto/consumo verificados
```

Con 50, 40 o 24 columnas y pocas filas: nunca sobrepintar texto ni cortar una secuencia ANSI; priorizar indicador de bloqueo y acceso al panel. Cuando cambia el tamaño de la terminal, la vista refluye y conserva la tarea seleccionada. Evitar duplicar secciones visibles.

### Modo normal de Pi (no fullscreen)

Barra inferior compacta de una línea y agentes encima del editor. **No** forzar cabecera, dos columnas ni vista a pantalla completa sobre el modo normal.

### Personalización y experiencia

- **Light:** menos distracciones, sin lateral fijo, barra y acceso al panel.
- **Neutral:** distribución por defecto.
- **Power user:** más información con STATS.
- Densidad: `comfortable`, `compact`, `minimal`. Posición: `auto/right/bottom/hidden`. Cabecera: `top/below-input/split`. Superficie: `transparent/tinted`.
- Ratón y teclado con el mismo efecto; hover solo resalta, no ejecuta. Los plegados, navegación, selección y scroll funcionan sin pérdida de foco. Modal no concede permisos.
- **Modelo solicitado** no es necesariamente **modelo realmente utilizado**. Desconocido se representa como desconocido. Precio desconocido no es `$0`. Métrica de suscripción/cuota no disponible no se inventa. Al cambiar de sesión no se muestran Workers ajenos.

## 3. Auditoría ASEN: lo que ya está y lo que falta

| Elemento | ASEN, observado en código | Diferencia para T11 |
|---|---|---|
| Datos TODOS/AGENTS/CHANGES/INTEGRATIONS | `src/runtime/ui/ide-panel.ts`, `agent-flow-panel-source.ts`, `agent-flow-overview.ts` y diarios T06 | Reutilizar datos; añadir organización visual, foco, jerarquía y acciones equivalentes |
| Secciones y ventana | `ASEN_PANEL_SECTIONS` tiene las 6 secciones; `native-work-panel.ts` ofrece plegado, scroll, ratón parcial y lectura fresca | Faltan mismas prioridades visuales, hoja plena adaptativa y sección STATS verificada |
| Lateral `>=140` | `m1-readonly-rail.ts` devuelve una lista de encabezados; `extensions/asen.ts` la muestra con `setWidget(...aboveEditor)` | Lateral nativo de 50 + 3 implementado; geometría real verificada en tres sistemas en SHA `9c91403`. Siguen pendientes la igualdad visual y todos los eventos reales |
| Ancho menor que 140 | `renderAsenWorkRow` ya resume trabajo vivo | Conectar botón [ Panel ], reglas de prioridad, cierre y reflow; incluir no solo trabajo sino bloqueo/revisión |
| Cabecera, barra, editor | `focus-chrome.ts` dibuja título de ASEN; `renderAsenStatusLine` y `host-status-projection.ts` preservan observaciones | Falta identidad proyecto/sesión bien colocada, modelo/perfil/consumo con prioridades de espacio, cabecera y editor equivalentes |
| Coste, uso y modelo | `host-status-projection.ts` indica `cost/subscription/quota: unavailable` en host real | Añadir observadores verificados antes de pintar uso/coste; mantener desconocido cuando no exista fuente |
| Presets | `/asen-presentation compact/complete` y `/asen-customize` para permisos/atajos | Light/Neutral/Power, posición y densidad implementados; cabecera y superficie añadidas en esta tanda. Falta contrastar el resultado completo con Gentle Shell 4.8 |
| Gestión de espacio real Pi | El host de ASEN es Pi 1.2.0; la referencia usa adaptación de árbol de Pi 1.5.2 | **Puerta técnica:** verificar API y compatibilidad del host antes de tocar layout nativo; fallback seguro a panel si no admite dos columnas |

### Invariantes

1. Un cambio visual no altera el Dispatcher, ODD, permisos individuales de Writer, revisión, fusión ni aislamiento de sesiones.
2. El lateral se construye sobre el host nativo autorizado, nunca sobre una terminal falsificada ni otro runtime paralelo.
3. Estado de agente, modelo y costes se enlaza a datos observados, con avisos de `unverified/unknown` ante huecos.
4. No convertir un resultado de `T06` GitHub en una sesión Pi TUI local sin pruebas; CI verde no prueba experiencia visual hasta ensayo de host.
5. Volver a la presentación actual en caso de host no compatible, sin romper herramientas de lectura ni comandos.

## 4. Plan de implementación T11 — tandas ODD + TDD

| Subtarea | Tanda, módulos | Entregable y aceptación |
|---|---|---|
| **T11-A** — Base visual y contrato host | Lectura de `v4.8.0`; `responsive-layout.ts`, `m1-readonly-rail.ts`, interfaz Pi 1.2 | Pruebas **RED** de 139/140 columnas, de rail lateral vs widget y opciones visuales; comprobar APIs públicas y host real; selección del adaptador compatible y devolución a panel al fallar |
| **T11-B** — Layout ancho | `extensions/asen.ts`, layout/panel reutilizado, `focus-chrome.ts` | Lateral derecho 50 columnas + espacio 3; cabecera y editor alineados; secciones en orden, plegables y con altura/scroll independientes; pantalla completa real, sin usurpar la conversación |
| **T11-C** — Estrecho, barra y acciones | `native-work-panel.ts`, `ide-panel.ts`, `host-status-projection.ts`, modelos/rutas existentes | Sin rail bajo 140, una fila de actividad + [ Panel ]; barra rama/permisos/modelo/esfuerzo/perfil/contexto/coste/uso, degradación honesta de datos; clic, teclado, navegación y estados de bloqueo visibles |
| **T11-D** — Preferencias y acabados | `/asen-customize`, almacén de configuración seguro, presets, tema/densidad/posiciones | Light/Neutral/Power, top/below-input/split, bottom/hidden, transparent/tinted; persistencia con migración de versiones y prueba de entradas corruptas; sin cambios de permisos al cambiar aspecto |
| **T11-E** — Comprobación UX / Pi real | Pruebas, captura reproducible de host, CI y Release Gate del SHA exacto | Ver matriz de aceptación, contraste lado a lado con la referencia bajo las mismas medidas; revisión independiente, sin declarar igualdad por captura aislada |

**Prioridad inmediata:** empezar **T11-A + T11-B** agrupados cuando la compatibilidad Pi 1.2 esté demostrada; preparar T11-C en paralelo solo en archivos disjuntos. Cerrar T11 antes de aceptar visualmente T07. T08 y seguridad pueden avanzar en paralelo sin editar UI.

## 5. Matriz de aceptación para no confundir bonito con funcional

| Pantalla de prueba | Comportamiento exigido |
|---|---|
| 180 y 140 columnas, 50 y 24 filas | Dos columnas reales, rail fijo de 50, separación 3, cabecera y barra sin invadir editor; datos actualizados mientras trabaja un hijo |
| 139 y 120 columnas | **Corte exacto del lateral**; resumen y [ Panel ] sin contenido perdido, misma acción disponible |
| 80, 50 y 40 columnas | Prioridad a actividad, pregunta de agente y fallo; barra sin corte de caracteres de ancho doble; panel navegable |
| 24 columnas y 12 filas | Acceso para cerrar/abrir panel siempre visible; ningún bucle ni corrupción del terminal |
| Cambio en vivo 180 → 80 → 180 | Sin doble widget/barra, sin perder foco o plegado; cambios nuevos llegan al origen y a la vista |
| 2+ Workers vivos con uno bloqueado | Priorización por atención, tarea y duración; no escribir `PASS` ni `modelActual` inventados |
| Estado sin modelo, sin presupuesto/coste o sin conexión | Mostrar `unknown/unavailable` y evitar `$0` implícito, progreso ficticio y errores sin cierre |
| Presets, tema claro/oscuro y mouse/teclado | Igualdad de navegación y legibilidad, persistencia, permisos idénticos, sin filtración de datos |
| Modo normal, Windows/macOS/Linux | Mantener modo normal funcional; pruebas nativas al menos en tres sistemas y comprobación de tamaños |

Cada subtrabajo: RED (fallo reproducible anterior), GREEN, negativos (permisos, identidad, limpieza, entrada maliciosa, coste ausente, redimensionado), typecheck, CI y Release Gate del SHA. **Prohibido cerrar T11 por documentación o renderizador puro**: se exige Pi TUI real y observaciones del host en los tres sistemas previstos, con diferencias justificadas frente a Gentle Shell 4.8.0.

**Fuera de alcance:** el Design Canvas y Gentle Desktop RPC que llegaron en el lanzamiento v4.8.0 no forman parte del layout terminal solicitado; esta tarea tampoco cambia modelos ni desbloquea Workers.

**Estado inicial histórico:** `ANALYZED_PLANNED_NOT_IMPLEMENTED`. **Estado actual:** `IMPLEMENTED_PARTIAL_PENDING_FINAL_CI_VISUAL_PARITY`, `globalFull:false`; los ensayos nativos y las opciones visuales no son por sí solos paridad completa.

## Seguimiento de la tanda 17/11/2026

La referencia permanece Gentle Shell v4.8.0 en tag congelado. Las implementaciones reales y su evidencia están documentadas cronológicamente en [flujo-de-agentes-continuidad.md](flujo-de-agentes-continuidad.md). La geometría del panel derecho e inferior tiene pruebas Pi nativas multiplataforma. El clic real recibió confirmación en Linux y Windows en el SHA `45f545b`; la validación completa del siguiente SHA y las opciones de cabecera/superficie siguen bajo CI. No se considera cerrada T11-E hasta verificar interacción, cambios de sesión, capturas de contraste y revisión independiente. No ejecutar modelos de pago ni fusionar.

### Validación confirmada de interacción del lateral

El SHA `d6a18ed75db09fc35dac526a4668accb53d1335f` ha superado los tres trabajos nativos Pi, el CI completo, la puerta de publicación, arquitectura y Pi 1.2. La incorporación de la cabecera y superficie en la siguiente tanda requiere verificaciones propias; mantener `globalFull:false` hasta que exista revisión visual comparada.

### T11-E — Ensayo de cabecera en Pi 1.2 auténtico (17/11/2026)

El host nativo se amplía para cargar `t11-chrome.json` con `below-input` y `tinted` antes de la sesión real que ya verifica el panel inferior. El pseudoterminal debe mostrar la marca ASEN y la versión Pi. La comprobación va vinculada al SHA exacto, a la terminación de las cuatro sesiones y a las pruebas de geometría/ratón previas.

Este control **no** demuestra por sí solo que la cabecera esté debajo del editor, que los 50 caracteres reciban fondo real ni una comparación fotográfica con Gentle Shell v4.8.0. Continúan pendientes la captura/contraste y la revisión independiente. `globalFull:false`.

### T11-C — Barra compacta con prioridad verificable (17/11/2026)
La referencia selecciona una sola barra informativa en anchuras estrechas y elimina elementos secundarios antes que los avisos. ASEN no sustituye el pie nativo de Pi 1.2: utiliza la clave `asen:host` existente. El nuevo `t11-compact-status.ts` prioriza alertas conocidas y mantiene `/asen-panel` cuando cabe (sin fingir que sea un botón pulsable); no duplica el pie. El texto resultante se prueba a 12, 24, 40, 80, 139 columnas. **Diferencia aceptada por ahora:** ASEN no ofrece el mismo comportamiento visual exacto de la barra inferior Gentle Shell ni un enlace clicable. Falta el contraste nativo y captura. `globalFull:false`.

### T11-C — Corrección de regresión en barra estrecha (17/11/2026)
La integración del pie es un contrato público: los ensayos de sesión, permisos y tema no deben fallar por textos obsoletos. La corrección conserva esas verificaciones sobre el nuevo formato compacto y restaura un hecho observable que se había perdido, `effectiveThinking`. `respondingModel` se sigue mostrando como desconocido cuando no hay observación de una respuesta. No se cambia el permiso actual ni el modelo real. Pendiente de CI del SHA de corrección y contraste visual.

## Comparación específica con Gentle Shell 4.8.0 — T11-E (17/11/2026)
| Comportamiento observado en la referencia congelada | ASEN después de las tandas recientes | Juicio sin extrapolar |
|---|---|---|
| Lateral derecho 50 columnas y separación 3, que desaparece bajo 140 | Adaptación nativa `t11-native-rail.ts`, comprobada con Pi 1.2 en 180 y 139 | Conectado, faltan 120/80/50/40/24 y contraste visual |
| Ratón en encabezados, scroll de lateral y escape de foco | Clic SGR real en Pi, plegado y Escape; atajos de Pi incluidos | Conectado; falta verificar otros elementos de cada fila |
| Cabecera `top/below-input/split` y superficie `transparent/tinted` | `t11-chrome-settings.ts`, cabecera y lateral tintado; ensayo de salida del host | Opciones reales, pero no hay comparación de capturas ni estado visual por ancho |
| Barra inferior prioriza datos de contexto y de ejecución, sin duplicados | Pi conserva el pie propio y ASEN añade estado compacto `asen:host` | Diferencia conocida: ASEN no reemplaza el pie ni ofrece la misma distribución o acciones que Gentle |
| Contadores de trabajos, fallos y revisión | Barra toma listas solo de una observación vinculada a sesión/proyecto | Mejora de continuidad; pendiente prueba real con varios Workers |
| Coste/tokens/cuota y STATS opcional con fuente verificada | Modelo seleccionado y contexto público; costes/cuotas sin fuente, muestran ? | **No equivalente**: está prohibido inventar datos |
| Apariencia completa / diseño exacto | Prioridad de alertas y relleno tintado de lateral | **No equivalente todavía**: faltan controles, márgenes, resaltados y prueba visual comparada |

**Criterio de cierre:** T11-E requiere matriz nativa exacta, revisión de las diferencias de tabla y contraste visual con medidas idénticas. El CI por sí solo **no demuestra paridad**. Mantener `globalFull:false`, PR #61 en borrador y sin fusión.

### Criterio reforzado de T11-E (17/11/2026)
La matriz nativa debe distinguir el umbral de 140 columnas del fallback estricto por debajo de 140. En las dimensiones 140/120/80/50/40/24 se exige una **lectura nueva** de Pi posterior a cada resize, con ancho del editor comprobado; en 24×12 se exige continuidad real del proceso, no una maqueta. Los errores conservan fase y última geometría para permitir reproducción en Windows. Si falta una lectura, el trabajo CI **falla** y T11-E permanece abierta.
  
La línea de estado usa revisiones observadas en la sesión y proyecto vigentes y deja de publicar tras cierre/cambio de sesión. No se crea autoridad Writer, no se revisan permisos ni se realizan llamadas NVIDIA. El contraste visual con Gentle Shell 4.8.0 sigue **pendiente**: la geometría comprobada no acredita colores, tipografía ni acciones equivalentes.

### T11-E + T07 — Regresión del modo estrecho y falta de datos de hijos (17/11/2026)

Cuando falla el diario remoto de las sesiones hijas pero los datos locales aún se leen, el panel debe conservar únicamente hechos locales y mostrar un aviso `hijos no disponibles`. En particular, el resumen para 24/40/50/80/120/139 columnas no debe desaparecer ni reutilizar un Worker anterior si existe `agentFlowUnavailable`. El modal y la vista fija siguen el mismo principio; tras fallo local, el widget M1 previo debe retirarse, no quedar colgado junto al editor. Se añaden pruebas de presentación y regresión. **Esto no cierra T11-E:** siguen pendientes capturas comparables y acreditación Pi TUI integrada de dos hijos. `globalFull:false`.

### Corrección de fallback visual — T11-E (17/11/2026)

La lista M1 `aboveEditor` a partir de 140 columnas no es un lateral real: no debe dibujarse cuando `layoutRoot` no se puede adaptar. El flujo de la extensión usa ahora una sola fila compacta y mantiene `/asen-panel` en hosts sin soporte, sin suponer que el editor cedió 53 columnas. La medición real 50+3 sigue siendo exclusiva del adaptador Pi y sus pruebas exact-SHA. **T11-E no se cierra** hasta comparación visual y funcional con la referencia congelada.
