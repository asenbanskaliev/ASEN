# ASEN — especificación de paridad de Gentle Shell v4.6.0 + Gentle AI v4.3.1

> **Decisión de equivalencia R4-04 (2026-11-05; prevalece sobre las entradas históricas A/B de este documento):**
> La comparación funcional y de interfaz vigente es **Pi + Gentle Shell v4.6.0 vs Pi + ASEN**. La referencia ejecutable Shell está fijada en tag `v4.6.0`, commit `1f74e9e24473e7e121a96b1680444ae0196d3009`, tree `64d14750450d0144d65230eb0b6ecc69d841a8f3`, paquete 4.6.0. **Gentle AI no es una tercera ejecución de agente**: sus reglas metodológicas se estudian solo cuando la experiencia Shell las incorpora.
> Los **20 casos C01–C20 requieren 40 observaciones** (SHELL + ASEN, ambas en Pi), recibos reales por host, misma entrada/proyecto/condiciones, consentimiento humano cuando proceda y verificación independiente para FULL. Los anteriores manifiestos, ejecuciones y cifras de **60 plazas A/B/ASEN** quedan **HISTÓRICOS, NO NORMATIVOS** y no son un requisito de aceptación nuevo. No se altera su historial ni se hereda ninguna prueba de Shell 4.5.1. La fuente de verdad ejecutable es `registry/parity/shell-asen-baseline-v1.json`, `registry/parity/shell-asen-case-readiness-v1.json` y `scripts/shell-asen-parity.mjs`.
> Una prueba `--help`, un test aislado o un par de JSON coincidentes no equivalen a C01–C20 ejecutados. Mantener `globalFull:false`, 8/28 EF y 0/14 UI hasta recibir evidencia real. La seguridad y los permisos del plan original siguen aplicándose sin relajación.


**Fecha de auditoría:** 2026-11-05. **Estado:** SPEC + tareas, sin implementación de UI ni certificación FULL. Contrato de equivalencia para el PR #45, no sustituto de evidencias C01–C20.

## 0. Referencias congeladas, alcance y diferencias

| Elemento | Tag y commit | Qué define |
|---|---|---|
| Gentle Shell / paquete gentle-pi | v4.6.0, `1f74e9e24473e7e121a96b1680444ae0196d3009`, 2026-11-04 | TUI Pi: rail, Agents, Todos, Jobs, Changes, Review, Integrations, statusbar, editor, panel, paleta, perfiles y fallbacks |
| Gentle AI | v4.3.1, `2dba7784114fff57864519c4c0d067e952a8c98b`, 2026-10-27 | Runtime Go, ODD, review/ACK, instalador y actualizaciones Linux/macOS/Windows, Copilot CLI |
| Contrato provider review | 1.4.0 congelado | Schemas/evidencias de revisión |
| Pi empaquetado por Gentle Shell v4.6.0 | 1.5.0 | APIs TUI y agente. ASEN aún ensaya Pi 1.2: no asumir compatibilidad binaria sin pruebas |
| ASEN inspeccionado | `984d867d310c13b6d564c46a81f2dd263694f127` | comandos ASEN, agentes/Todo/Git texto/widget; CI y aceptación FAIL en ese SHA |

Gentle AI 4.3.1 **no contiene por sí solo** la interfaz IDE de Gentle Shell. Usar ambos repos como dos referencias distintas; no confundir el release de runtime con los gestos y comandos del Shell. No tomar la rama main ni capturas de otra versión para acreditar pruebas. No copiar implementación sin verificar licencia y compatibilidad; reproducir comportamiento observable y garantías.

**Fuentes Shell en commit fijo:** `extensions/gentle-shell.ts`, `extensions/gentle-agents.ts`, `extensions/gentle-todo.ts`, `lib/shell-sidebar-layout.ts`, `lib/shell-panel.ts`, `lib/shell-bar.ts`, `lib/agents-widget.ts`, `lib/agents-view.ts`, `lib/agents-protocol.ts`, `lib/shell-todo.ts`, `lib/shell-changes.ts`, `lib/shell-changes-view.ts`, `lib/background-jobs-tools.ts`, `lib/command-palette-catalog.ts`, `lib/model-fallback-policy.ts`, `docs/gentle-shell.md`. Permalinks: https://github.com/Gentleman-Programming/gentle-shell/tree/1f74e9e24473e7e121a96b1680444ae0196d3009 .

**Fuentes Gentle AI:** https://github.com/Gentleman-Programming/gentle-ai/tree/2dba7784114fff57864519c4c0d067e952a8c98b ; `docs/gentle-shell-tui-acceptance.md`, `docs/gentle-shell-windows-install.md`, `docs/gentle-shell-linux-install.md`, `docs/gentle-shell-macos-install.md`, `docs/review-integration.md`, `internal/agents/copilotcli/adapter.go`. v4.3.1 declara actualizaciones sólo de componentes cambiados, pins en manifest, preferencias preservadas, reconocimiento de manifest Windows antiguo y avance de boundary tras ACK válido.

**ASEN:** `extensions/asen.ts`, `src/agents/pi-agent-tools.ts`, `src/runtime/pi-todo-tools.ts`, `src/runtime/todo-presentation.ts`, `src/runtime/status.ts`, `src/runtime/command-catalog.ts`, `src/runtime/workspace-attribution.ts` y `src/runtime/usage-command.ts`. `/asen-agents`, `/asen-todos` y `/asen-status` ofrecen información útil pero mayoritariamente textual. `/asen-changes` lista Git por raíz y atribución (hasta 50 filas mostradas por raíz), no el overlay diferencial de la fuente. La existencia del comando no prueba equivalencia de UI.

## 1. Layout objetivo y comportamiento responsive

```text
┌─ ✿ proyecto /cwd ─────────────────────────────────────────── sesión · perfil ┐
│ Conversación Pi                             │ ▾ TODOS            2/6     │
│                                              │   ◐ tarea en curso         │
│ → Delegating                                │   └ dependencia / job      │
│ ◎ Agent status                              │ ▾ JOBS       1 running    │
│ ↩ Agent answer                              │ ▾ AGENTS   2 run · 1 ask  │
│                                              │ ▾ CHANGES  3 files +42 −7  │
│                                              │ ▾ REVIEW   needs you      │
│                                              │ ▾ INTEGRATIONS            │
│ ─ ✿ waiting for input ────────── INSERT ─   │ ctrl+shift+t · alt+u       │
│ › escribe o / comandos                      │ / commands                │
├─ main ±3 │ modo │ modelo · effort │ ctx █░ 45% │ coste/sub │ usage ──────┤
└──────────────────────────────────────────────────────────────────────────────┘
```

Esquema de requisitos, **no screenshot ni producto ASEN ejecutado**.

- Ancho **>=140 columnas** con fullscreen/Status arriba: una única superficie tintada derecha, cabecera de proyecto y ruta a la izquierda y sesión/perfil a la derecha; se recorta primero la ruta. Secciones en orden **TODOS → JOBS → AGENTS → CHANGES → REVIEW → INTEGRATIONS**; Stats opcional antes de Integrations (Power user). Headers `▾/▸` colapsables por clic, hover homogéneo, sección en reposo con una fila atenuada y comando de apertura. Cache de render por sección y digest del contenido: no recalcular ni redibujar toda la conversación por movimiento del ratón.
- **<140 columnas**, o en preset Light/Status abajo, la rail no se dibuja; una work row agrupa agente que pregunta, activos, fallos y progreso TODO. Botón `[ Panel ]` en la regla del editor abre hoja horizontal completa con las secciones. Navegación ↑/↓, j/k, rueda; Esc/q/clic en back cierra. No convertir la hoja en un nuevo child o llamada al proveedor.
- Texto de editor tras regla `─ ✿ <fase/estado> ─ <vim/esc>`, prompt `›`; preservar cursor, autocomplete, selección, imágenes y recursos Pi. La pregunta hija aparece encima del editor (`? explore asked: … /gentle:agents`), sin fingir consentimiento. Al usar tema claro, pintar también huecos/gaps; otros temas mantienen contraste.
- Modo no-fullscreen: barra compacta de una línea y tarjetas pequeñas sobre editor, nunca forzar un overlay en hosts print/RPC sin UI. Presets **Light, Neutral, Power user** en Customize, atajo `alt+l` (remapeable), y posiciones de status arriba/abajo/hidden. Estado de UI persistido y restaurado en `/reload`.

## 2. Cómo arranca cada agente: API, UI y permisos

| Agente o proceso | Invocación de la fuente | ASEN: punto de entrada a equiparar | Resultado visible obligatorio | Control |
|---|---|---|---|---|
| Orquestador | Prompt natural del usuario + ODD; no child si tarea simple | chat → router → `/asen-plan` sólo cuando procede | cabecera, estado ODD, modo, TODO si hay plan | identidad del usuario; no elevar permiso |
| Explorer | `subagent_run` con `agent=gentle-ai-explore`, `task`, opcional `label`, `mode=task/background` | `asen_agent_start`; planes mediante `asen_plan_dispatch_next` | `→ Delegating` y AGENTS fila task/rol/modelo/effort/tokens/tiempo, hasta fin `↩ Agent answer` | readonly; auth de root, no escrituras |
| Worker | agente worker por subagent_run o ruta ODD; tool child Pi separado | plan guardado y `asen_plan_dispatch_next` | WAITING por confirmación, luego RUNNING/COMPLETED; Git Changes diffs y revisión | autorización única de candidato/archivo; denegación no escribe |
| Reviewer | `gentle_review`/captura RDD y reviewers de rol | `/asen-review` y review pipeline | REVIEW indica `needs you`, findings y candidato; Agents si task propia | no se convierte en Writer |
| Verifier | `gentle-ai-verify` como hijo/role; pruebas independientes | plan verifier, `asen_todo_accept_result` | AGENTS con rol y pruebas; TODO bloqueado hasta aceptación real | sin write grant, no autocierre |
| Hijo background | `subagent_run` con `mode=background`; `subagent_continue` | runtime + entrega durable ASEN | AGENTS RUNNING; al terminar ↩, stale si antiguo | sólo con padre interactivo; no autorizar preguntas |
| Consulta al padre | `subagent_parent_message` kind query y `subagent_reply` correlacionado | canal hijo/padre a implementar | AGENTS WAITING + `? agent asked` sobre editor; diálogo asociado al task | una respuesta de la sesión actual, timeout, no replay |
| Job shell | `bash_background`, `monitor`, `job_stop`, `/gentle:jobs` | implementar canal de trabajos diferenciado | JOBS con elapsed/comando/output/Stop | guard de bash original, no se cuenta como agente |

**Reglas operativas:** cada subagente real de la referencia ejecuta Pi RPC en proceso separado. La UI no crea permisos ni sustituye ejecución. Un child puede preguntar sólo en modo task y el padre de la sesión responde expresamente; background no puede autoconceder respuesta. Estados de agente RUNNING, WAITING, QUEUED, FAILED, COMPLETED, CANCELLED, TIMED OUT visibles en tarjeta y overlay. Un task de otro proyecto/sesión no se considera adoptado por coincidir el nombre.

## 3. Secciones de la rail: datos, interacción y diferencias

**TODOS.** En Gentle Shell herramienta `todo` con `write/add/update/clear/list`; estados `pending` ○, `in_progress` ◐, `blocked` ⊘ (nota obligatoria), `done` ✓, `dropped` ✕. Mostrar `done/total`, trabajo actual y nota multilinea; terminadas condensadas, las otras una línea recortada. `ctrl+shift+t` pliega, `alt+shift+↑/↓` o rueda desplaza. Listas vivas se llevan en tail oculto sin invalidar prompt fijo del modelo y no provocan un turno extra. ASEN tiene planned/running/succeeded/blocked/done/cancelled: `succeeded` expresa **ejecutada pendiente de revisión**, NO `done`. Se necesita proyección visual sin fusionar estados ni convertir cancelada en dropped sin explicación.

**JOBS.** `bash_background` para comandos largos, `monitor` para salida evento, `job_stop`; `/gentle:jobs` abre selector y detalle, `ctrl+shift+j` pliega. No consumir inferencias con `sleep` de espera; exit entrega una notificación única. Mantener stdout/stderr en archivo privado y tail acotado, Stop de usuario distinto de fallo; los jobs son de la sesión y no autorizan Writer.

**AGENTS.** Orden de atención: pregunta del child, corriendo, en cola, fallidos, terminados recientes; máximo 8 filas rail, los demás `… N more`. Fila con glyph, tarea, rol, modelo/effort, tokens, coste y duración observados (no inventar metadata ausente). Click → `/gentle:agents` o `alt+a`. Overlay lista/jerarquía y thread semántico Text/Thinking/Note/Tool; j/k y scroll; Follow f, Open transcript o, Stop s solo propios/activos, Scope a, Back/Esc, q cerrar, F fullscreen, historial persistente al `/resume`. Atajos `ctrl+shift+a` colapso y `alt+s` stop con confirmación. Herramientas `subagent_list_agents`, `subagent_run`, `subagent_status`, `subagent_result`, `subagent_list_tasks`, `subagent_reply`, `subagent_cancel`, `subagent_send_message`, `subagent_continue` y las locales `orchestrator_session_id/list/send_message`. Una presencia no acredita estar alcanzable ni consentir mensajes.

**CHANGES.** Git `status/diff contra HEAD` del cwd y worktrees/repo autorizados, aunque el cambio venga del editor, no sólo del agente. Cabecera clean o `N files +A −D`; grupo por repo/branch; markers M modificado, A nuevo staged, U untracked, D borrado, R rename. `/gentle:changes` / `alt+g`: overlay de dos paneles, j/k, flechas, diff lazy <=1 MiB/20.000 líneas, `F` solo diff, `r` refresh, `o`/Enter abre archivo en editor directo (sin intérprete shell); Windows rechaza .cmd/.bat. `session_worktree_register` registra raíz, no atribuye escrituras mágicamente. ASEN `/asen-changes` hoy hace lista textual y correcciones scoped separadas: mantenerlas pero implementar viewer Git equivalente.

**REVIEW.** Se muestra con evidencia RDD de la sesión; cambia a `needs you` sólo cuando hay decisión real. `gentle_review` integra captura de contexto, candidato, veredicto, corrección y revisión. **Gentle AI 4.3.1:** ACK aprobado avanza la frontera revisada al candidato acuseado; cambio de SHA invalida el alcance anterior. Autoauditoría R4 no cuenta como revisión independiente. No extrapolar el estatus de herramientas a autoridad.

**INTEGRATIONS.** Agregar estados reales de extensiones `ctx.ui.setStatus` y MCP disponible vía API Pi; `Agent profile:` efectivo, conectividad (conectado/desconectado/desconocido), permiso en palabras, sin duplicación respecto a barra inferior. `/gentle:status` y `/gentle:doctor` muestran detalles. ASEN `/asen-status` hoy agrega agentes/cambios/skills/telemetría en texto; no se ha validado representación conjunta de providers/MCP. Si no existe API de datos o está headless, `unknown/unavailable`.

## 4. Barra inferior, edición y comandos

**Statusbar:** Git branch + dirty count real, permission mode no predeterminado sólo una vez, provider/model y effort (incl. Standard/Fast cuando lo soporte), contexto como gauge: >=80% ámbar, >=95% rojo, `?%` después de compaction sin respuesta; coste/tokens y `sub` para suscripción, medidor de usage cuando hay datos; clic `usage` abre `/gentle:usage`. Recortar segmentos secundarios antes de perder el modelo; no inferir coste cero de snapshots sin pricing. Una sola fila con actualizaciones parciales y sin reprocesar transcript por pulsación.

**Comandos y atajos fuente:** `/gentle:panel`, `/gentle:agents` (alt+a), `/gentle:changes` (alt+g), `/gentle:jobs`, `/gentle:usage` (alt+u), `/gentle:stats`, `/gentle:profiles`, `/gentle:customize` (alt+l para presets), `/gentle:commands` (alt+k), `/gentle:guide [local|stop]`, `/gentle:yolo`, `/gentle:review-session-permission`, `/gentle:doctor`, `/gentle:status`, `/gentle:review-mode`, `/gentle:background-subagents`. Paleta agrupada Configuration/Session/Diagnostics/Skills: buscar por nombre/etiqueta/ayuda, Enter ejecuta, Tab asigna atajo. `/gentle:customize` → Keymaps exige Ctrl/Alt o F1–F12 y `/reload` para aplicar, rechaza teclas reservadas Pi y corrupción de keymap sin sobrescribir el archivo.

**Perfiles:** `/gentle:profiles` con pestañas sesión ◉, default ★ y repo ⌂; asignación por agente/orquestador, invalid pins visibles, usar sesión / guardar / hacer default, captura congelada por sesión durante resume. Fallback por agente **hasta 8 provider/model** con `f` añadir, `e` esfuerzo, Shift+↑/↓ ordenar, `x` eliminar. Quota/auth salta al siguiente modelo inmediatamente; rate-limit/network/timeout/provider unavailable sólo tras retries nativos; abort/context-length/invalid-request/unknown nunca; cooldown 30 min para quota/auth y 2 min transitorio; se anuncia nuevo modelo y coste relativo. En ASEN **no fallback no autorizado a modelo de pago**, aun si la fuente ofrece cadenas configurables.

## 5. Plan EF y pruebas complementarias

Los 28 EF canónicos conservan sus checks, fases y evidencias originales. Los apartados siguientes detallan requisitos adicionales de UI y roles, **sin declararlos ya implementados**.
### EF-000 — Baseline y manifiesto de fuentes

- **Gesto/trigger de Gentle Shell o Gentle AI:** Shell/AI release, /gentle:status y perfiles, SHA fijo.
- **ASEN verificado por inspección:** ASEN snapshot comparador F0.
- **Funcionalidad y UI exigidas:** Registrar tag/sha/path/estado de UI y Pi API por fuente, inventario de 6 paneles, comandos y renderer; archivo fuente referenciado por permalink.
- **Gate y dependencia de equivalencia:** FREF: comprobar inmutabilidad y hash, sin cambiar semántica de C01–C20. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-001 — Confirmación y permisos

- **Gesto/trigger de Gentle Shell o Gentle AI:** statusbar PERMISSION, modal de autorización al realizar acción restringida.
- **ASEN verificado por inspección:** /asen-mode, guardrails y test de confirmaciones.
- **Funcionalidad y UI exigidas:** UI normal/auto/YOLO/super-yolo, herencia y rollback; denegar no cambia archivos/sesión; no se acepta consentimiento de CI como humano.
- **Gate y dependencia de equivalencia:** FPERM: TUI real allow/deny/cancel y 3 sistemas. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-002 — Observación A/B

- **Gesto/trigger de Gentle Shell o Gentle AI:** C01–C20 en herramientas, navegación Agents/Changes/Review/Todos.
- **ASEN verificado por inspección:** A/B sólo CLI source/help, 0 casos completos.
- **Funcionalidad y UI exigidas:** Recopilar trazas observables por cada caso en Shell v4.6, Gentle AI 4.3.1 y ASEN; no heredar pruebas anteriores.
- **Gate y dependencia de equivalencia:** FREF: 60 slots ejecutados con provenance y host A/B de verdad. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-003 — Harness observable UI

- **Gesto/trigger de Gentle Shell o Gentle AI:** registro de comando/estado/selección/scroll y diff Git.
- **ASEN verificado por inspección:** scripts/agent-observable-parity.mjs.
- **Funcionalidad y UI exigidas:** Normalizar tokens/tiempo/ANSI, NO normalizar cambios semánticos de permiso, modelo, rol o terminal status; comparar snapshots/acciones UI.
- **Gate y dependencia de equivalencia:** FTEST: A/B+ASEN misma secuencia y semántica. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-101 — Decisión de ruta

- **Gesto/trigger de Gentle Shell o Gentle AI:** prompt normal → acción directa o subagent_run + Delegating.
- **ASEN verificado por inspección:** /asen-plan y route, dispatch automático.
- **Funcionalidad y UI exigidas:** Tarea simple sin spawn; tarea compuesta crea plan visible y razones; UI no exige JSON al usuario; perfilar roles sin pago implícito.
- **Gate y dependencia de equivalencia:** FAGENT: tests ruta para casos bajo/alto riesgo y UI-C05/06. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-102 — ODD/TODO

- **Gesto/trigger de Gentle Shell o Gentle AI:** tool todo write/add/update/list/clear; rail TODOS glyph y progreso.
- **ASEN verificado por inspección:** /asen-todos, asen_todo_* y widget corto.
- **Funcionalidad y UI exigidas:** Mapeo de estados sin mentir: succeeded en ASEN sigue pendiente de revisión; blocked nota visible; histórico, dependencias, cache de prompt tras cambios.
- **Gate y dependencia de equivalencia:** FTODO: UI-C03/04/20 + reinicio y no duplicación. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-103 — Reanudación de dependencias

- **Gesto/trigger de Gentle Shell o Gentle AI:** TODO y Agents indican próximo step, nombre/estado y jerarquía.
- **ASEN verificado por inspección:** /asen-continue y asen_plan_dispatch_next.
- **Funcionalidad y UI exigidas:** Revalidar session/project/HEAD/perfil/consentimiento antes de despacho; UI muestra por qué no avanza y etapa en cola.
- **Gate y dependencia de equivalencia:** FAGENT+FTODO: UI-C07 y segundo proceso. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-201 — Explorer

- **Gesto/trigger de Gentle Shell o Gentle AI:** subagent_run(agent=gentle-ai-explore, task, mode=task/background); cards Agents.
- **ASEN verificado por inspección:** asen_agent_start y CodeGraph-first.
- **Funcionalidad y UI exigidas:** Priorizar CodeGraph, añadir fallback sólo si disponible/autorizado, registrar child tools reales, límite de contexto y lectura web controlada.
- **Gate y dependencia de equivalencia:** FAGENT+FINT: UI-C05/06/17, Pi RPC, sin Writer. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-202 — Presupuesto de exploración

- **Gesto/trigger de Gentle Shell o Gentle AI:** fila Explorer con tokens/tiempo/coste y avisos no repetidos.
- **ASEN verificado por inspección:** src/runtime/explorer-budget.ts.
- **Funcionalidad y UI exigidas:** No polling ni relanzamientos bajo presupuesto; mostrar remaining/unknown verídico; UI no inventa consumo al reservar inferencia.
- **Gate y dependencia de equivalencia:** FBAR: UI-C11/15, medidores distintos logical HTTP. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-203 — Retorno compacto

- **Gesto/trigger de Gentle Shell o Gentle AI:** ↩ Agent answer + estado + thread; Changes permanece clean.
- **ASEN verificado por inspección:** status/receipt durable de Explorer.
- **Funcionalidad y UI exigidas:** Resultado redactado y bounded, archivos sin escritura y tool use auténtico; JSON/errores maliciosos no se interpretan como nueva orden.
- **Gate y dependencia de equivalencia:** FAGENT+FCHANGES: C05 + UI-C05. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-301 — Handoff Writer

- **Gesto/trigger de Gentle Shell o Gentle AI:** agent worker en Agents, prompt de aprobación con rutas SHA y scope.
- **ASEN verificado por inspección:** asen_plan_dispatch_next, snapshot y grant one-use.
- **Funcionalidad y UI exigidas:** Proyectar instrucciones exactas, risk, test y rollback; no conceder acceso por hacer clic en tarjeta; usar repo Git temporal limpio para CI.
- **Gate y dependencia de equivalencia:** FWRITER+FUI: UI-C06/18; negativa real. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-302 — RED→GREEN/PRESERVE

- **Gesto/trigger de Gentle Shell o Gentle AI:** TODO en curso, Changes refleja diff tras Writer, Review guarda pending.
- **ASEN verificado por inspección:** tests y lifecycle Writer parcial.
- **Funcionalidad y UI exigidas:** Registrar fallo previo, fix autorizado, green y no regresión; no promover TODO a done sin resultado verificado, ni retroconceder grants al child.
- **Gate y dependencia de equivalencia:** FWRITER+FREVIEW: casos C06–07. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-303 — Paralelismo seguro

- **Gesto/trigger de Gentle Shell o Gentle AI:** AGENTS múltiples, CHANGES grupos por worktree y archivos.
- **ASEN verificado por inspección:** workspace writer lease, worktree overlap tests.
- **Funcionalidad y UI exigidas:** Admitir sólo scopes disjuntos/aliases resueltos, revertir por subworktree, no atribuir simultaneidad a CPU sin Pi real.
- **Gate y dependencia de equivalencia:** FCHANGES+FPERM: UI-C08/09 con dos grants. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-304 — Consentimiento humano

- **Gesto/trigger de Gentle Shell o Gentle AI:** WAITING agent, pregunta en editor, modal Pi, resumen candidato y cambios.
- **ASEN verificado por inspección:** ECO-06 CI simulado, sin aprobación humana auténtica.
- **Funcionalidad y UI exigidas:** Una decisión por operación/archivo/candidato, revocación y denegación; UI no debe mostrar successful sin ejecución; archivar recibo de decisión real.
- **Gate y dependencia de equivalencia:** FPERM: UI-C10/18; bloqueante para FULL. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-401 — Política de riesgo

- **Gesto/trigger de Gentle Shell o Gentle AI:** Review sólo con RDD; Risk: item N exige recordatorio, no concede permiso.
- **ASEN verificado por inspección:** matriz risk ASEN.
- **Funcionalidad y UI exigidas:** Límites del runtime AI 4.3.1: ítem 1 high-risk sólo dato irreconstruible; probar tanto no-verification como verification.
- **Gate y dependencia de equivalencia:** FREVIEW: C09 con inputs A/B. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-402 — Verifier autónomo

- **Gesto/trigger de Gentle Shell o Gentle AI:** AGENTS verifier separado del Worker; REVIEW muestra test results.
- **ASEN verificado por inspección:** verifier plan + accept result.
- **Funcionalidad y UI exigidas:** Pruebas nuevas contra petición original, baseline, scratch; ningún permiso de escritura por rol verifier, no considerar PASS sin corroboración.
- **Gate y dependencia de equivalencia:** FREVIEW: C10, UI-C12 y real Pi. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-403 — Defecto alto riesgo

- **Gesto/trigger de Gentle Shell o Gentle AI:** Review finding → scope Changes → fix → fresh Verifier; distintos SHA.
- **ASEN verificado por inspección:** fixture triple fallo real y grader, pero no defecto orgánico alto riesgo.
- **Funcionalidad y UI exigidas:** Probar RED/diagnóstico/fix/segunda verificación con el modelo real; si fixture es construido, distinguir de bug ASEN; revisión tras nuevo SHA.
- **Gate y dependencia de equivalencia:** FREVIEW: C09–10, criterios de severidad y post-fix. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-501 — Revisión nativa

- **Gesto/trigger de Gentle Shell o Gentle AI:** gentle_review y /gentle:review, panel Review needs you.
- **ASEN verificado por inspección:** /asen-review y /asen-accept-review.
- **Funcionalidad y UI exigidas:** ACK positivo avanza reviewed boundary y sólo con candidato fijo; rctx1/rctx2, base upstream, errores typed; no esconder controles de usuario.
- **Gate y dependencia de equivalencia:** FREVIEW: UI-C12/13, contratos AI 1.4.0. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-502 — Juicios y re-evaluación

- **Gesto/trigger de Gentle Shell o Gentle AI:** dos reviewers independientes; tarjeta findings y ACK, cambio en Changes.
- **ASEN verificado por inspección:** dual-review Pi parcial.
- **Funcionalidad y UI exigidas:** Congelar snapshot, comparar perspectivas, aplicar fix sólo con grant válido, repetir juicio sobre commit/diff nuevos sin reusar evidencia.
- **Gate y dependencia de equivalencia:** FREVIEW: C11–12 y UI-C13. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-503 — Independencia de revisión

- **Gesto/trigger de Gentle Shell o Gentle AI:** Reviewer/Verifier identificables como tasks distintas en AGENTS.
- **ASEN verificado por inspección:** dos procesos con Beam mismo proveedor.
- **Funcionalidad y UI exigidas:** Diferenciar dos respuestas modelo de revisión externa; identidad del auditor, inputs ocultados del otro juicio, autoridad humana separada.
- **Gate y dependencia de equivalencia:** FREVIEW: pruebas de independencia y veredicto R4. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-601 — Entrega de hijos

- **Gesto/trigger de Gentle Shell o Gentle AI:** ↩ Agent answer; si WAITING, pregunta; si stale, aviso; padre idle despierta.
- **ASEN verificado por inspección:** journal y agentParentRoute.
- **Funcionalidad y UI exigidas:** Diferenciar parent running, idle, hold y print; deduplicar wake, demostrar consumo en Pi y no sólo enqueued.
- **Gate y dependencia de equivalencia:** FAGENT: UI-C10/14, Pi padre auténtico. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-602 — Sin sondeos

- **Gesto/trigger de Gentle Shell o Gentle AI:** aviso async, no sleep, stale obliga consultar subagent_result.
- **ASEN verificado por inspección:** journal y ack guard.
- **Funcionalidad y UI exigidas:** Una notificación terminal por task; error de wake reintenta acotado, no reejecuta child; etiquetas y resultados saneados.
- **Gate y dependencia de equivalencia:** FAGENT: UI-C14, pruebas con fallos inyectados. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-603 — Coalescencia exacta

- **Gesto/trigger de Gentle Shell o Gentle AI:** un Explorer activo, Reviewer/Verifier sin alias, coste único en AGENTS.
- **ASEN verificado por inspección:** CAS Explorer, Beam one Pi RPC, pendientes alias Windows.
- **Funcionalidad y UI exigidas:** Incluir normalización física Windows de identidad, session/project/model/effort/task; tests con aliases UNC, cambios de ruta y owner; distinguir proceso RPC de llamadas HTTP observadas.
- **Gate y dependencia de equivalencia:** FAGENT: UI-C06/08 y recibos exactos. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-604 — Crash/recovery

- **Gesto/trigger de Gentle Shell o Gentle AI:** reopen /gentle:agents; estado enqueued/attempted, preguntas no inventadas.
- **ASEN verificado por inspección:** AgentNotificationJournal recoveryReview y status opt-in.
- **Funcionalidad y UI exigidas:** TUI crash durante inferencia, child exit incierto, historial durable, respuesta humana posterior, no replay/autoauth.
- **Gate y dependencia de equivalencia:** FAGENT+FTODO: UI-C10/14, Pi auténtico. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-701 — Paridad A/B con UI

- **Gesto/trigger de Gentle Shell o Gentle AI:** capturas reproducibles de rail/palette/agents/gits/consentimiento.
- **ASEN verificado por inspección:** harness CI de fuentes, sin 60 ejecuciones.
- **Funcionalidad y UI exigidas:** Todos los C01–20 con trazas reales fuente y ASEN; UI-C01–24 complementarios; no sustituir 3OS por única captura Linux.
- **Gate y dependencia de equivalencia:** FREF+FTEST, manifests con SHA. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-702 — Modelos/cuotas

- **Gesto/trigger de Gentle Shell o Gentle AI:** /gentle:profiles chains por agente, /gentle:usage, statusbar; aviso ↪ nuevo modelo.
- **ASEN verificado por inspección:** /asen-profiles, /asen-usage, clasificación de errores.
- **Funcionalidad y UI exigidas:** Cadenas <=8 y cooldown 30 min auth/cuota y 2 min transitorios, avanzando sólo en tipos admitidos; API coste cero confirmado; ningún fallback a pago sin permiso explícito.
- **Gate y dependencia de equivalencia:** FPROFILE+FBAR: UI-C15/19, cuota real/no fake. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-703 — TUI+3OS+Pi

- **Gesto/trigger de Gentle Shell o Gentle AI:** fullscreen >=140, panel <140, 6 bloques, interop MCP, Pi 1.5, Install.
- **ASEN verificado por inspección:** CI F8 parcialmente roto, Release Gate F9 verde separado.
- **Funcionalidad y UI exigidas:** Verificar accesibilidad mouse/keyboard, escenarios con Pi 1.2 y 1.5, Windows UNC, macOS, Linux, firmas y provider; integrar nuevos UI-C gates y seguridad sin saltar shards.
- **Gate y dependencia de equivalencia:** FTEST+FINSTALL: UI-C01–24 + gates exact-SHA. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.

### EF-704 — FULL estricto

- **Gesto/trigger de Gentle Shell o Gentle AI:** todos paneles y comandos con evidencia; UI y CLI concordantes.
- **ASEN verificado por inspección:** R4 auto; auditoría externa y C01–C20 pendientes.
- **Funcionalidad y UI exigidas:** Cerrar sólo con todos EF, UI-C01–24, C01–20, S01–S20, CI+Release Gate, pruebas reales y revisión independiente; registrar divergencias explícitas sin false FULL.
- **Gate y dependencia de equivalencia:** FALL: aprobación final documental auditada. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corresponda y SHA congelado; la existencia de test no es prueba de paridad por sí sola.


## 6. Tareas UI nuevas y sus dependencias (checks separados de EF)

- [ ] **UI-01: Shell IDE y rail.** Título, rail único tintado en orden, plegado, hover y cache por digest. Dependencias: FREF. Tests: UI-C01/02/22. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-02: Overlay Agents y transcript.** Per task Pi RPC, lista/hierarchy/thread, model/effort/tokens/cost, stop/follow/resume. Dependencias: UI-01. Tests: UI-C05/06/07/08/10. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-03: Todos y ODD.** Cinco estados fuente, proyección ASEN sin false DONE, scroll/prompt cache y listas guardadas. Dependencias: UI-01. Tests: UI-C03/04/20. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-04: Changes Git.** Git multi-root, diff HEAD/untracked, 2 paneles, editor seguro, recuentos. Dependencias: UI-01. Tests: UI-C09. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-05: Jobs y monitors.** Bash background/monitor, sidebar, logs, wake, stop y no sleep. Dependencias: UI-01. Tests: UI-C11/14. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-06: Review RDD.** needs you, evidence, native review + ACK y boundary real. Dependencias: UI-01. Tests: UI-C12/13/18. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-07: Integrations y MCP.** MCP status real + Agent profile y permiso no duplicado, desconocido veraz. Dependencias: UI-01. Tests: UI-C16/17. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-08: Statusbar.** branch/dirty, mode, model/effort, ctx gauge, cost/sub, usage clickable. Dependencias: UI-01. Tests: UI-C15. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-09: Profiles/fallback.** Tabs sesión/default/repo, frozen session, chain <=8, coste y cooldown. Dependencias: UI-02,UI-08. Tests: UI-C19/23. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-10: Paleta/keymaps/guide.** Comandos registrados, búsqueda, atajos reasignables, /reload, recorrido. Dependencias: UI-01. Tests: UI-C17/21. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-11: Responsive y presets.** >=140 rail; <140 work row + Panel sheet; Light/Neutral/Power; extremes. Dependencias: UI-01. Tests: UI-C01/02/22/24. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-12: Installer/Update runtime.** TUI install/Manage, component pins, rollback, Windows manifiesto antiguo, gs launcher. Dependencias: FREF. Tests: UI-C23/24. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-13: Padre-hijo y recuperación.** Task/background, preguntas correlacionadas, sin replay/consentimiento, historie. Dependencias: UI-02,UI-03. Tests: UI-C06/10/14. Evidencia por SHA para marcar, no basta el desarrollo textual.
- [ ] **UI-14: Aceptación interfaz y seguridad.** Capturas 80/120/139/140/160, inputs reales mouse/teclado, Pi nativo, 3OS, R4. Dependencias: UI-01..UI-13. Tests: UI-C01..24. Evidencia por SHA para marcar, no basta el desarrollo textual.

## 7. Casos de paridad visual e interacción (no sustituyen C01–C20)

| Caso | Contexto | Resultado esperado | Evidencia requerida |
|---|---|---|---|
| UI-C01 | Fullscreen 160 columns | Orden rail, título sesión/perfil, editores y statusbar | screenshot+render semántico |
| UI-C02 | Fullscreen 139 columns | Desaparece rail, work row + Panel, scroll y back | teclado+ratón |
| UI-C03 | TODO estados | pending/in_progress/blocked/done/dropped con glyph, nota; sucedido ASEN no done | store/GUI |
| UI-C04 | TODO viewport | colapso, scroll, completadas agrupadas, límites y No stale con sólo blocked | Pi TUI |
| UI-C05 | Explorer Pi child | una tarea, proceso RPC real, modelo/effort y status exactos | process receipt |
| UI-C06 | Background parent/child | mensaje completion a idle/running; no segunda inferencia | host Pi real |
| UI-C07 | Agents overlay | Follow/Scope/Open/Stop/Back/Close/thread e historial al resume | TUI nativo |
| UI-C08 | Coalescing por rol | un Explorer exacto; Reviewer/Verifier distintos; alias Windows | multi-process/Windows |
| UI-C09 | Changes | 3 raíces Git, M/A/U/D/R, F diff-only, o editor y lazy 1MiB | Git fixtures 3 OS |
| UI-C10 | Hijo pregunta + permisos | WAITING y aviso arriba editor; reply sólo owner; deny/timeout | humano real cuando requiera |
| UI-C11 | Jobs background | bash_background vs bash, monitor, stop y aviso exit único | logs/exit |
| UI-C12 | Review pendiente | needs you sólo con RDD; no aprobaciones por tomar foco | candidate ack tests |
| UI-C13 | ACK revisado | avanza boundary sólo para candidato exacto aprobado | runtime AI 4.3.1 |
| UI-C14 | Crash/recovery | reinicio TUI/hijo, stale y entrega incierta sin replay | SIGKILL real |
| UI-C15 | Barra de estado | branch±dirty, modo, model/effort/Fast, 80/95/? ctx, coste/sub, usage | UI snapshot |
| UI-C16 | Integrations/MCP | otras extensiones, profile efectivo y conexión veraz | MCP mock + real |
| UI-C17 | Paleta/teclas | alt+a/g/k/u, ctrl+shift+t, búsqueda, keymap collision | registro comandos |
| UI-C18 | Writer | aprobación/denegación/revocación; scope y diff; sin power de UI | consent humano |
| UI-C19 | Fallback | hasta 8 modelos, no pago, cooldown y no fallback por abort/context | provider-free+real |
| UI-C20 | TODO y prompt cache | tail oculto, estable system prompt, recuperación tras compaction | Pi trace |
| UI-C21 | Customize | Light/Neutral/Power, Stats, persistencia y perfil sesión | config reload |
| UI-C22 | TUI extrema | 12..59 columnas, <12 fallback Close, scroll sin freeze | geometry fuzz |
| UI-C23 | Manage/Update | pins por componente y Windows manifest legado, preserve preferences | release 3OS |
| UI-C24 | FULL gate | C01-C20 + UI-C01-C24, 3 OS, no false green, auditor independiente | certificación exact-SHA |

## 8. Secuencia de implementación por megatandas

**M1 — shell + datos, 1 publicación:** UI-01, UI-03, UI-07, UI-08, UI-10, UI-11. Contratos de render, proyección a datos Pi, persistencia UI, panel responsive y tests C01–04/15–17/21–22. La UI no hace dispatch de agente al pintar.

**M2 — agentes + trabajos:** UI-02, UI-05, UI-13; per-process Pi RPC, Agent List/Details, pregunta, aviso, historial y jobs. Tests UI-C05–08/10–11/14. Cualquier cambio de permisos requiere revisión aparte y no concede Writer por render.

**M3 — Git/Review/Writer:** UI-04 y UI-06; Git multi-root, estado/diff, visualización scoped, review/boundary con ACK. Tests UI-C09/12/13/18. Garantizar que el sandbox y la autoridad no dependen del color de una tarjeta. No corregir un fallo de Windows debilitando la verificación del workspace.

**M4 — perfiles + gestión:** UI-09 y UI-12; modelo/effort, session profile congelado, fallback no-pago consentido, instalador/actualizador v4.3.1 por plataforma. Tests UI-C19/20/23.

**M5 — certificación real:** UI-14, todos los EF, C01–C20, UI-C01–24; terminal widths 80/120/139/140/160, teclado+mouse, TUI/print/RPC, Ubuntu/Windows/macOS, Pi nativo y proveedor autorizado, tests de seguridad/consentimiento y R4 realmente independiente. Auditor con evidencia independiente, no auditoría auto.

### Contrato de recibos

Cada caso: entrada y preestado, source tag/commit y ASEN SHA, comando/acción física, sesión/proyecto/Git HEAD, modelo real o ausencia verificada, salida observable, eventId/agentId/todoId propios cuando procedan, diff/estado post, resultado positivo y negativo, latencia, origen de la observación, PNG/ANSI semántico de pantalla si es UI, hash y workflow. Un contador de «inferencia reservada» nunca se presenta como HTTP observado; un aviso encolado no prueba consumo del padre; un click no equivale a permiso.

No introducir un servidor de telemetría ni guardar secretos para mostrar Integrations. No habilitar modelos de pago automáticamente. Las preguntas humanas y autorización Writer se prueban en TUI real; robots de CI no cuentan como decisión humana. Los tests A/B source-only no deben elevar su categoría sin procedimientos ejecutados.

## 9. Puertas de seguridad y divergencias permitidas

- Mantener los 28 checks EF originales de ODD y sus SHAs. UI-01..UI-14 añade trabajo requerido para FULL, no invalida auditorías históricas. No modificar S01–S11 o C01–C20 para hacerlos más fáciles; ampliar a S12–S20 y casos UI nuevos.
- Si Gentle Shell source permite una acción no permitida por política ASEN (o la cadena por perfiles contiene modelos pagados), documentar divergencia y exigir decisión explícita antes de modificar seguridad. El objetivo de UX nunca habilita privilegios, bash unsafe ni acceso ajeno.
- El estado de ASEN al auditar aún presenta CI F8 y functional acceptance FAIL; no confundir la ampliación del plan con solución del bloqueo ECO-06 ni marcar más EF por describirlos.
- Las versiones de librerías Pi pueden divergir: comparar Pi 1.2 (histórico ASEN) con Pi 1.5 del paquete fuente, sin degradar transcripción ni contrato de interceptación. Aceptación real requiere test runtime compatible.
- Nota de procedencia: la parte visual se validó contra Gentle Shell **v4.6.0**; la entrega/runtime/actualizaciones se validan contra Gentle AI **v4.3.1**. No afirmar que es el mismo repositorio o un solo release.

## CI fixture checkpoint — 2026-11-05

The PR #45 CI failure in run `42070066360` was reproduced in a job-inspection test fixture, not attributed to UI behavior: a broad-mode fixture home prevented the production journal's intentional privacy check from reading even an absent journal. The fixture now requests mode `0700`; a separate negative test preserves rejection of an unsafe `0755` parent. Production code is unchanged. This work provides no native UI interaction, visual, or A/B evidence; UI-01–UI-14 remain unverified and no UI status is promoted.

### R4-04 — evidencia Pi TUI nativa reutilizada en tres OS (2026-11-05)

Se amplía el probe host real de `t12-real-pi-tui-dialog` a anchuras 120/80/60/40/139/140/160 (Pi 1.2.0, sin inferencia ni proveedor). El job `r4-integrated-evidence` descarga **exclusivamente** los artefactos nativos de los tres sistemas de **la misma corrida** y candidato, verifica SHA, versión de host, identidad de plataforma, lista de anchuras, eventos reales de sesión/error/reinicio/cierre, render y ausencia de wrapping. Emite un informe acotado separado (`r4-native-ui-report.json`) y pruebas negativas de SHA cruzado, simulación, anchuras ausentes, estados falsos y enlaces inseguros. No duplica el arranque de Pi ni usa otro modelo.

**Alcance certificado por el recibo R4-04:** observación técnica de 21 celdas host/anchura, si el CI exact-SHA concluye PASS. La observación de filas `/asen-status`, `/asen-agents` y `/asen-changes` **no demuestra** rail paritario, overlay, mouse, permisos ni UI-C01–UI-C24 completos. Las 24 UI-C siguen bloqueadas para comparación externa real y las 14 tareas UI conservan `[ ]`. El contrato A/B C01–C20 conserva 60 slots, cero casos observados con ambas fuentes y `globalFull:false`. Los CLIs `--help` de las fuentes no equivalen a su host funcional ni a A/B auténtico; R4-04 requiere posterior provisión de hosts/modelos/consentimiento y capturas reales antes de ascender un caso.

**No emitir `R4-04 FULL`:** el gate técnico puede pasar con estado `PARTIAL_NATIVE_HOST_OBSERVED`. Queda abierta la matriz comparada A/B, controles nativos ratón/teclas y Pi 1.5 de referencia, Writer humano y revisión externa. El estado histórico 8/28 EF, 0/14 UI no se altera. CI y Release Gate pendientes de validar el nuevo SHA.

### R4-04 — corrección causal del CI y preparación ejecutable C01–C05 (2026-11-05)

**Fallo observado:** CI `42100195135` del SHA `c734e67d83985c97fe6e6c5e5673dca5e0d1f04a` concluyó FAIL exclusivamente en el agregador `r4-integrated-evidence`: los tres jobs `t12-real-pi-tui-dialog` fueron SUCCESS y las nueve pruebas negativas R4-04 PASS, pero una celda real tenía `rendered:[]` y `R4_NATIVE_UI_REJECTED: Actual terminal-rendered rows must be captured and bounded`. No se atribuye al proveedor ni se rebaja el rechazo de evidencia vacía.

**Corrección:** el probe TUI guarda el marcador de salida real del propio PTY recibido por `send('/asen-status')` y `send('/asen-changes')` cuando la división en líneas del buffer pierde las filas por reescritura con cursor. Identifica `PTY_BUFFER_ROWS` o `PTY_COMMAND_RESPONSE_MARKERS`; la auditoría exige origen permitido, render no vacío y marcador auténtico de estado/Git. Pruebas negativas nuevas rechazan marcadores simulados y datos sin contenido observable. La validez de la corrección requiere el CI de un **nuevo SHA**, no hereda el PASS de los tres jobs anteriores.

**Discrepancia bloqueante de las referencias:** la fuente A actualmente fijada para C01–C20 (`813ec110...`) anuncia paquete **4.5.1**, mientras que el objetivo de UI declarado es **4.6.0**. La referencia B fijada es un instalador Go con comando `--help`, no un agente B ya provisionado. No se modifica la baseline canónica sin decisión explícita, ni se afirma que `--help` ejecute un escenario de agentes.

**Paso real preparatorio:** `agent-ab-host-smoke.mjs` registra las versiones del paquete leídas de los checkouts de commits congelados; el disparador opt-in de la acción ejecuta ambos binarios `--help` sin inferencia ni instalaciones. `r4-first-five-preflight.mjs` comprueba procedencia/estado y prepara cinco prompts/escenarios sobre un fixture de código acotado con digest determinista. C01–C05 permanecen `BLOCKED` y `scenariosExecuted:0` hasta disponer de sesiones auténticas de A, B y ASEN, proveedor permitido cuando sea necesario y recibos de cada ejecución. No conceder Writer ni cambiar C01–C20 para hacerlos pasar.

**Invariantes:** 8/28 EF, 0/14 UI, cero C01–C20 certificados, 60 recibos A/B/ASEN todavía exigibles, `globalFull:false`; no merge, no modelo de pago, no permiso humano simulado. Próximo objetivo: ejecutar primero los cinco escenarios reales tras provisionar un host compatible para B y reconciliar la versión congelada de A con la normativa de UI, conservando ambas procedencias.
