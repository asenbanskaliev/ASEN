# T10 — Plan auditado y criterios de cierre

## Estado reconciliado - 2026-11-01

### Implementacion funcional T10-N1/T10-N2 - proyeccion de estado no autoritativa

**T10-6 notification decision: CONNECTED_PROJECTION, NOT DURABLE DELIVERY.** `extensions/asen.ts` now instantiates `PiNotificationProjection` from `src/runtime/notification-projection.ts`, using the existing `SessionNotificationBus` to show a bounded, ephemeral Pi widget of observed background-job and agent outcomes. Event keys are scoped to both session and project. The widget never includes untrusted job output or agent summaries; its input is a generated public status only. The isolated projection has identity deduplication, TTL, capacity and UI-failure protection. Its production integration is exercised in `tests/background-job-delivery.integration.test.ts`; additional source-bound scenarios live in `tests/notification-projection.test.ts`.

**There is no confirmed display acknowledgement.** The persistent `BackgroundJobJournal` remains the sole source for terminal outcome and pending/enqueued status. `pi.sendMessage` and `ui.notify` remain the actual delivery transports, independent of the widget; success of synchronous enqueue still sets `deliveryConfirmed:false`. An in-memory bus acknowledgment does not prove Pi displayed a message and is never used to mutate the journal or to authorize work. The widget is cleared on session shutdown and cannot show events from a different session/project. Renderer failures, a full bus, expiration or context mismatch cannot prevent sending or persisting notifications; a process restart reconstructs pending work from the journal, not from the widget.

**Remaining work:** host-level observable delivery acknowledgement, real cross-process crash-window evidence, multi-instance concurrency, interactive keyboard/TUI acceptance and independent R4. Unless a supported host API offers an actual acknowledgement, exactly-once delivery is **not** promised. The prior NOT_WIRED observations below are historical. No new exact-SHA CI result is claimed before GitHub Actions validates this implementation.


Current disposition: **ACCEPTED_WITH_WAIVER (bounded T10 scope), NOT global FULL**. This supersedes older intermediate PARTIAL/FULL statements as a status summary; historical evidence and owners' waivers are retained below.

**T10-6 notification decision: NOT_WIRED.** `src/runtime/session-notifications.ts` implements a bounded in-memory `SessionNotificationBus` with event identity, TTL, capacity and local acknowledgement. `extensions/asen.ts` does not import or register that bus. The production route for background-job final notices is `BackgroundJobJournal` -> `pendingBackgroundJobNotifications` -> `pi.sendMessage` / `ui.notify`. A successful send only records `deliveryState: "enqueued"`; `deliveryConfirmed: false` deliberately stays false. Calling `acknowledge` on an in-memory bus would NOT prove that Pi displayed a message. No replacement of the journal, automatic re-execution, exactly-once delivery or provider-backed verification is authorized by this documentation work.

Decision for this batch: **retain the tested durable journal delivery and treat the bus as an unintegrated optional primitive**, rather than inserting a new delivery gate that could lose or duplicate notices. A future functional integration requires a separately tested consumer contract, crash windows before/after sending and persisting, restart replay, source-id collisions, TTL/capacity, session/project isolation and Pi host confirmation limits. Until those tests and actual wiring exist, T10-6 integration remains PARTIAL and is excluded from the bounded acceptance. The technical CI on baseline e9229568 was green; a later source commit requires new exact-SHA evidence.

## Propósito y estado

T10 completa la experiencia de workspace de ASEN en Pi: trabajos y monitores en segundo plano, entrega de resultados de agentes, cambios Git por raíz/worktree, coordinación entre sesiones, perfiles vinculados a sesión, notificaciones y vistas utilizables en terminales estrechos.

Estado de partida: **PARTIAL**. El HEAD remoto inicial de este plan fue `6fc3f7ba0a2038f578502508629a22dbc44ad1b9`. El candidato revisado durante la estabilización de Windows es `5a0b36f6d6b96aedceb0fcb9106c86da38e430a6`; la prueba de integración local añadida después queda asociada al commit posterior que la incorpora, no al SHA anterior.

Este plan se prepara por petición del propietario. El mapa ODD mantiene T10 después de T09 y T05. Se permite adelantar trabajo T10 independiente, pero el cierre/admisión final debe reconciliar ese orden canónico y no promover evidencia de otro SHA.

## Baseline de comparación

Comparación de comportamiento consultada en una instantánea de referencia fijada en el commit `2d1d3a4eb6621641401f8be6f62ada2427168521` (27-10-2026). No se usa `main` mutable como pin. Ese árbol separa `bash_background` de `monitor`, conserva una cola de salida acotada, notifica terminaciones, agrupa cambios por las raíces de trabajo de la sesión, entrega resultados de agentes por push y adapta vistas al ancho de terminal. Sus límites documentados incluyen tail de 20 líneas/2.000 caracteres, cierre de procesos al terminar sesión, timeout y protección anti-flood para monitores, y rechazo del modo background cuando el cliente no puede recibir resultados.

Este pin es una referencia de investigación de código fuente, no prueba que coincida con un paquete publicado llamado `Reference Shell 4.3.0`. La vinculación inmutable de esa versión de referencia sigue sin demostrarse en el mapa de paridad. No se copian código, permisos, marcas ni autoridad de esa implementación.

## Auditoría de implementación existente

| Área | Ya existe en ASEN | Defecto o prueba pendiente |
| --- | --- | --- |
| Jobs | `BackgroundJobRegistry`, herramientas `asen_background_*`, salida acotada, timeout/cancelación, límite 32 global/8 por sesión y backend público de shell Pi en producción | Journal privado, status por sesión/proyecto, recuperación como `interrupted`, sin replay, push terminal Pi. Falta acuse/replay durable de transporte. |
| Monitor | Modo `monitor` y eventos internos por línea | Timeout obligatorio, batches Pi hasta 20 líneas de 500 caracteres, IDs deterministas y mensaje terminal. Falta acuse durable/replay. |
| Agentes | `AgentRuntime.subscribeTerminal`, persistencia por sesión/proyecto y avisos UI | Resultado enviado por `pi.sendMessage`, acotado y marcado `trusted:false`; dedupe del proceso activo. Falta ledger durable de entrega/stale/retry. |
| Cambios | Atribución persistida, snapshot Git por raíz y comando `/asen-changes` | Snapshot actual integrado para proyecto/worktrees conocidos; preserva NUL/newline, rechaza raíz symlink y comprueba identidad antes/después de Git. Falta descubrimiento completo de raíces y carrera eliminable durante el proceso. Conflicto sigue siendo señal heurística. |
| Sesiones | Módulo `SessionDirectory` y tool Pi `asen_session_consult` | Consentimiento UI de un uso, scope requester/target/proyecto, TTL 60 s, solo metadatos mínimos y almacenamiento process-local. Falta validar lifecycle del host y coordinación multi-proceso. |
| Perfiles | Binding aislado por sesión/proyecto, captura, selección y limpieza al cerrar | Buena base determinista; falta recorrido integrado en Pi 1.2.0 para routing por rol y sesiones simultáneas. No exigir persistir el binding tras reinicio: la referencia también pide volver a seleccionarlo. |
| Notificaciones | `SessionNotificationBus` y eventos Pi | Resultados terminales de job/agente/monitor usan `pi.sendMessage`, ID estable, sesión/proyecto y `trusted:false`; el bus legado no se registra y el host no ofrece acuse de entrega. |
| Terminal/UI | `responsive-layout.ts` y vistas de status/agents/changes | Mide graphemes y ancho Unicode, limpia controles y adapta comandos a columnas visibles; `asen-changes` mezcla snapshot Git con atribución separada. Falta interacción integrada de teclado/TUI. |

**Hallazgo R4 bloqueante de partida (corregido en la tanda local):** `asen_background_start` no estaba incluido en la política primaria y aceptaba `command + args`, permitiendo evitar la clasificación del shell. Ahora admite únicamente el comando completo, aplica las mismas decisiones deny/confirmación y producción delega a la API pública de Pi `createLocalBashOperations()` con `shellPath` y `shellCommandPrefix` configurados. Las regresiones comprueban la decisión antes de ejecutar. Falta revisión independiente del diff final y CI del SHA publicado.

## Unidades de implementación

Cada unidad debe incluir implementación, pruebas RED/GREEN, comandos ejecutados y límites observados. No basta con que pase la prueba aislada del módulo.

### T10-1 — Autoridad y ciclo de vida de trabajos

- Convertir el inicio de job en una ruta de shell compatible con Pi: el comando completo se clasifica con la misma política primaria que `bash`; las acciones destructivas conservan denegación/confirmación y las operaciones no admitidas fallan cerradas. No aceptar `command + args` como escape de la política.
- Reutilizar la API pública de Pi para operaciones Bash cuando permita conservar shell configurado, prefijo, salida y aborto del árbol de procesos. No construir comandos concatenando argumentos sin reglas de quoting.
- Mantener estados terminales inequívocos; timeout, cancelación, salida, error de spawn y flood no pueden sobrescriberse entre sí. `disposeSession()` cancela, espera settlement con deadline y retiene los jobs aún activos hasta confirmar su cierre.
- Persistir inicio y resultado de forma privada y atómica. Tras reinicio, marcar trabajo previamente activo como interrumpido/no reanudable; nunca reejecutarlo automáticamente. El journal corrupto debe producir diagnóstico, no fingir una lista vacía sana.
- Definir y probar límites de concurrencia y almacenamiento para evitar consumo ilimitado de memoria/disco.
- Regresiones: tool call destructivo bloqueado antes de cero spawns; modo headless; shell/prefijo del usuario; proceso descendiente detenido; salida tardía ignorada; stop/timeout/flood concurrentes; shutdown espera `close`; fallo/corrupción/reinicio del journal; no repetición del comando.

### T10-2 — Monitor separado

- Exponer una interfaz clara de monitor distinta de job normal, con timeout obligatorio (1–1800 s), batch de líneas con ventana acotada, límite de eventos/ventana y notificación final.
- Mantener salida completa fuera del contexto del modelo y entregar solo batches acotados; truncar por celdas visibles/control characters de manera segura.
- Regresiones: falta de timeout, timeout, 120/121 líneas, ráfagas agrupadas, batch >20 líneas, línea parcial/CRLF, salida vacía, fallo de proceso, cancelación y cierre de sesión.

### T10-3 — Entrega push fiable de jobs y agentes

- Jobs: al completarse, emitir un único mensaje Pi con ID estable, estado/exit code, tail limitado y localizador de log privado. Un job detenido manualmente no debe presentarse como éxito.
- Agentes: usar `pi.sendMessage`/mecanismo público equivalente de Pi 1.2.0 para insertar el resultado como mensaje de extensión, no solo `ui.notify`. Marcar el cuerpo como salida no confiable del agente; nunca convertirlo en permiso, aceptación o cierre de Todo.
- Acotar y sanear contenido antes de insertarlo. Mantener historial duradero en el almacén de agentes y no reenviar un cuerpo viejo al reanudar una sesión. Usar IDs de resultado para deduplicar y tratar fallo de transporte como estado pendiente visible; no afirmar “exactamente una vez” salvo que el host ofrezca acuse/idempotencia demostrable.
- Regresiones: job completado/failed, monitor event/final, agente completado/error/cancelado, receptor idle/busy, sesión/proyecto equivocado, duplicado, resultado ya consultado, salida obsoleta, fallo al enviar y shutdown/reload.

### T10-4 — Workspace real por raíz/worktree

- Descubrir y registrar únicamente worktrees/clones que la sesión y sus agentes hayan usado, ligados a sesión/proyecto y con propietario. No escanear todo el disco ni ejecutar `git status` en cada tool call.
- Obtener estado real por root desde Git, incluir untracked, usar `-z`/parser NUL para nombres con newline, validar que la raíz siga siendo el worktree esperado y poner límites/timeout a Git lento.
- Separar visualmente “estado Git ahora” de “atribución de cambios de la sesión”. Los snapshots son lectura; diff perezoso, límite de tamaño y rechazo de rutas inseguras. La eliminación de un worktree no debe borrar datos ajenos.
- La detección de conflictos es advertencia para revisión; no escoger ganador ni declarar pérdida de datos sin comparar contenido/base.
- Regresiones: dos worktrees con mismo path relativo, cambios paralelos, untracked, rename/delete, nombre de archivo extraño, worktree retirado/sustituido, Git no disponible/lento, symlink y salida corrupta.

### T10-5 — Coordinación entre sesiones

- No usar `authorized:boolean`. Introducir consentimiento humano de un uso, ligado a sesión solicitante, sesión destino, proyecto canónico, scope de lectura y vencimiento. No concede escritura ni permite leer prompts/transcripts por defecto.
- Validar esquema exacto, tamaño, timestamps, proyecto y normalización. Escritura privada, atómica y con coordinación entre procesos; la corrupción se informa y no se interpreta como datos confiables. Aplicar TTL y limpieza únicamente de entradas propias vencidas.
- Publicar solo sujeto/alias/clasificación mínima, nunca contenido de conversación o credenciales. Limitar búsquedas al proyecto autorizado y hacer que consulta/ausencia/error sean distinguibles sin filtrar otros proyectos.
- Regresiones: consentimiento inexistente/falso/reutilizado/caducado, requester/target/project incorrectos, mismo session, proyecto diferente, archivo corrupto, symlink, concurrencia, sesión cerrada y eliminación de entrada vencida.

### T10-6 — Perfiles y notificaciones

- Mantener profile binding en memoria por sesión/proyecto; asegurar que todos los roles que ASEN enruta (incluidos reviewer/verifier) usan la misma captura estable. Selección/refresh es explícita; shutdown limpia la sesión; un perfil no modifica permisos ni grants.
- Integrar un bus de eventos con `eventId/sourceId`, `sessionId`, origen, hora, acuse y TTL/cupo. Dedupe por identidad del evento, no por texto. Los avisos UI/sound no deben bloquear agentes ni ejecutar acciones.
- Definir replay: restaurar solo avisos no sensibles y todavía útiles; ningún replay puede reactivar job/agente. Fallo de UI deja resultado consultable, no se pierde ni se convierte en éxito.
- Regresiones: dos sesiones con perfiles distintos, config cambia durante job, reviewer routing, shutdown/reload, doble evento mismo ID, dos eventos mismo texto, TTL, ack, fallo del renderer y aislamiento.

### T10-7 — Vistas adaptables y accesibles

- Conectar el layout a las vistas públicas existentes (status, agents, changes, todos, jobs/notificaciones). Usar ancho terminal visible compatible con Unicode y salida saneada; mantener una alternativa compacta bajo el umbral mínimo.
- Teclado primero: navegación, selección, volver/cancelar y foco previsibles. Las acciones destructivas no aparecen como habilitadas en vistas de solo lectura; diffs completos abren la herramienta/editor existente.
- Regresiones snapshot sobre 120/80/60/40 columnas, Unicode de ancho doble, combining marks, emojis, ANSI/control chars, mensajes largos, lista vacía y cancelación/foco. Ejecutar al menos una prueba integrada Pi TUI/RPC para confirmar que no es solo el helper.

### T10-8 — Integración, R4 y evidencia final

- Ejecutar journeys integrados: job normal → notificación; monitor → eventos → final; agente → resultado push → revisión/aceptación independiente; dos worktrees → cambios/conflicto; dos sesiones → perfil/consentimiento aislados; reinicio → estados no repetidos.
- R4 independiente de ejecución, identidad, límites, rutas, logs, corrupción, shutdown races, stale delivery y permisos. Resolver todo Critical/High antes de declarar T10 completo.
- Pruebas locales enfocadas, typecheck, build, auditorías pertinentes. Después, una ronda final en SHA único: Pi 1.2.0 y CI Windows/Linux/macOS, incluyendo matriz host/package según workflows. Revisar artifacts y logs antes de repetir cualquier job.

## Descubrimiento T10-7 (2026-10-31, SHA pendiente)

### Host real Pi 1.2.0

- La prueba integrada `scripts/t10-real-pi-tui-matrix.mjs` ejecuta la extensión en Pi real sobre un PTY nativo a 120/80/60/40 columnas con `NO_COLOR=1`, importando Pi 1.2.0 fijado Y ejecuta `/asen-status`, `/asen-agents`, `/asen-changes`, una entrada inválida (`/asen-changes bogus`), una Escape y un re-render subsequente.
- Descubrimiento: renderizar exactamente a `process.stdout.columns` hace que el transcript de Pi corte la línea a `columnas - 3` y envíe el resto al renglón siguiente (el ancho disponible es 37 a 40 columnas), eliminando el marcador de truncamiento. Por eso `terminalColumns()` en `extensions/asen.ts` ahora aplica `hostContentColumns` de `src/runtime/responsive-layout.ts`, que resta 3 columnas documentadas (vista no vacía).
- El gutter se midió, no se supuso: las mismas vistas pasaron a quedar intactas en los cuatro anchos tras la corrección, sin cambiar el truncamiento del helper.
- Cancelación y reinicio: Escape reenvía el foco a Pi y el siguiente `/asen-status` vuelve a renderizarse; el caso de selección/editor/confirmación se cubre además por `scripts/t12-real-pi-dialog-smoke.mjs` sobre el host real.
- Directorio de evidencia local: `t10-real-pi-tui-matrix-win32.json` contiene `result=PASS, wrapped=[]` en cada uno de los cuatro anchos; no se confunden con PASS global.

### Controles de teclado compatibles con Pi

Las vistas de ASEN se publican como resultados de `registerData` y se consumen dentro del bloque de entrada/comandos de Pi. La interacción anuló el teclado por convención del host:

- `/asen-changes` sin argumento muestra la vista; `/asen-changes resolve` abre el recorrido interactive.
- Selección con flechas, confirmación con `Enter`, cancelación con `Escape`; el editor respeta `Ctrl+C` y el aborto del efecto del comando.
- En vistas de solo lectura (`status`, `agents`, `changes`), no hay acción destructiva: un comando erróneo (`/asen-changes bogus`) devuelve un mensaje acotado y no muta estado.
- Diffs completos no se despliegan en la vista; se abre la herramienta/editor de Pi existente. ASEN no intercepta teclas propias ni instala bindings nuevos.
- La TUI de Pi es la fuente de verdad para teclas; ASEN solo ofrece strings dentro del budget y deja al host los atajos, el scroll, el historial y el redimensionado.

### Pruebas cubiertas

- `tests/t10-responsive-matrix.test.ts`: ancho visible real con `visibleWidth`, sin splitting de graphemes/combining/emoji ZWJ, sin control leaves, vistas vacías, layout por ancho, `hostContentColumns`, inert escape.
- `scripts/t10-real-pi-tui-matrix.mjs`: real host TUI, 4 widths, no color, render idéntico sin corte, escape, error y re-render.
- Hallazgo ALTA inicial (solo helper) queda rebajado: ahora existe prueba integrada Pi TUI, aunque R4 independiente y CI multiplataforma siguen pendientes antes de promover T10.

Requiere todas las unidades 1–8 demostradas en un SHA exacto; ninguna ruta de ejecución evade la política primaria; jobs y agentes notifican sin confundir salida con autorización; ningún trabajo se repite al reiniciar; coordinación/perfiles no cruzan sesiones; vistas funcionan en Pi 1.2.0 y terminales estrechos; Windows/Linux/macOS pasan; R4 no deja hallazgos Critical/High pendientes; el log canónico y mapa se actualizan solo con recibos del SHA admitido.

Una helper aislada, mock, aviso UI, suite parcial, referencia mutable o CI de otro SHA no cierra T10. La equivalencia global con Reference Shell 4.3.0 permanece separada hasta fijar ese artefacto/versionado.

## Estado de ejecución

Plan auditado contra HEAD remoto `6fc3f7ba0a2038f578502508629a22dbc44ad1b9` y la instantánea de referencia `2d1d3a4eb6621641401f8be6f62ada2427168521`. El checkout previo con modificaciones se conserva intacto; la implementación se trabaja en un worktree limpio.

### Trabajo hecho en esta tanda local

- La política primaria incluye `asen_background_start`, falla cerrada para argumentos/formas no admitidos y aplica deny/confirmación al comando completo. El tool ya no expone `args` separados que eludan la clasificación.
- En producción, los jobs usan `createLocalBashOperations` de Pi 1.2 y respetan la shell y el prefijo configurados. Los settings se leen al ejecutar: Pi prohíbe consultarlos durante la carga de la extensión.
- Journal privado, atómico y acotado registra job antes de spawn y resultado terminal; corrupción/permisos inseguros fallan cerrados. Después de reinicio, un estado `running` aparece como `interrupted` y no se reejecuta. Se retienen como máximo 500 jobs globales/100 por sesión.
- El cierre de sesión detiene jobs activos, aborta el backend y espera como máximo 5 s. Si no settlea, conserva el job terminal hasta que lo haga; callbacks de error/close y fallos síncronos de spawn settlean el resultado.
- Jobs, monitores y agentes envían mensajes Pi de extensión con `triggerTurn:false`, IDs estables, datos de sesión/proyecto y salida marcada `trusted:false`. Monitores requieren timeout y agrupan hasta 20 líneas, 500 caracteres por línea. Pi no devuelve acuse durable, así que no se afirma entrega exactamente una vez.
- `asen_session_consult` solicita confirmación en UI y consume un token de un uso ligado al requester, target, proyecto y TTL 60s; solo entrega etiqueta y clasificación. El índice está en memoria del proceso y no demuestra coordinación entre instancias Pi.
- El detector de conflictos incluye proyecto/worktree en la identidad; worktrees paralelos con el mismo path dejan de colisionar.
- `asen-changes` muestra por separado estado Git actual y atribución, sobre el proyecto y worktrees ya conocidos del store. El snapshot Git rechaza raíz symlink, comprueba identidad antes/después de cada proceso, limita cada proceso a 5 s/8 MiB y parsea `status --porcelain -z` con filenames newline.
- Status/agentes/cambios usan columnas visibles Unicode y evitan partir graphemes; se añadieron pruebas de anchos y sanitización.

Verificación local de esta tanda (Linux, árbol de trabajo antes de publicar): `npm run typecheck`, `npm run build`, `npm run verify:pack` y `git diff --check` pasaron. La suite completa pasó 2.207/2.207, con 18 skips preexistentes/configurados; las últimas 74 pruebas enfocadas pasaron 74/74. `verify:pack` instaló el paquete real, confirmó 11 comandos, 16 herramientas públicas, 0 invocaciones de modelos, reinicio/aislamiento de sesión y empaquetado con 28 exports. `audit:parity`, `audit:skills`, `audit:skill-parity`, `audit:memory-parity` y `audit:upstream-boundary` pasaron; `audit:ecosystem` conserva sus 16 claims PARTIAL y advierte que la evidencia normativa de baseline no está disponible. La revisión R4 confirmó resuelta la carrera del lock; fallos síncronos de entrega de agente/monitor quedan visibles y probados; también se prueban cancelación/cambio de requester durante el consentimiento y la advertencia de revisión en terminal estrecho.

T10 sigue **PARTIAL**: la API Pi no ofrece acuse durable y no se promete entrega exactamente una vez ni replay tras reinicio; el índice de sesiones es process-local; solo se consultan worktrees conocidos; la revisión de raíz Git detecta reemplazo antes/después, pero no conserva descriptor abierto durante el subprocess; no hay prueba integrada de teclado/TUI ni CI de este nuevo SHA en Windows/Linux/macOS. Un lock huérfano de journal bloquea escrituras tras 3 s hasta su limpieza explícita, deliberadamente para evitar borrar un lock ajeno por pathname. La adquisición/autenticidad, mantenimiento real y el resto de la paridad no se convierten en FULL por esta tanda.

### Evidencia añadida tras el candidato `5a0b36f6`

- El CI asociado a `5a0b36f6d6b96aedceb0fcb9106c86da38e430a6` terminó con éxito: suite completa Linux, macOS y Windows; matrices Pi host en los tres sistemas; Phase 0 Architecture; Pi 1.2 runtime evidence; y Release Gate en Ubuntu, macOS y Windows. Pi Free Smoke quedó omitido por condición del workflow.
- En Linux, las pruebas T10 enfocadas volvieron a pasar **90/90**. `npm run verify:pack` verificó paquete instalado y Pi RPC: extensión presente, 11 comandos, 16 herramientas, reinicio de sesión y proyección cross-session comprobados, sin invocaciones de modelo.
- Se añadió `tests/background-job-delivery.integration.test.ts`: vía la herramienta pública de la extensión inicia un proceso Node real, observa un único mensaje Pi con `trusted:false` y `triggerTurn:false`, confirma persistencia del estado consultable y comprueba que una nueva instancia no reejecuta el comando ni reenvía salida vieja. El test integra el facade de ASEN y el transporte Pi simulado; no equivale a prueba de TUI ni de transporte del Pi real.
- Con ese test, el lote T10 local enfocado pasó **91/91**; `npm run typecheck` y `npm run build` pasaron. La suite completa `npm test` pasó **2.209 tests, 0 fallos y 18 skips** (117,4 s).
- Se intentó ejecutar la TUI real de Pi 1.2 con `node-pty`. El paquete no tenía su módulo nativo; `npm rebuild node-pty` falló al extraer los headers de Node con `TAR_ENTRY_ERROR EINVAL: invalid argument, fchown`. Por tanto no se afirma prueba interactiva. El smoke Pi RPC sí está demostrado por `verify:pack` y por el workflow del SHA `5a0b36f6`.

T10 permanece **PARTIAL**. Siguen abiertos la coordinación de consulta de sesiones entre procesos (el directorio es process-local), la interacción de teclado/TUI real y la revisión R4 independiente del candidato actualizado. Las pruebas de agente, workspace y notificación aportan cobertura de componentes; el nuevo recorrido integrado solo cierra job → proceso → entrega → recuperación sin replay. Ninguna prueba local se presenta como matriz multiplataforma del candidato nuevo.

## Seguimiento de cierre — 2026-10-29

La rama de trabajo T10 se separó sobre `feat/t09-managed-update-stage`; se trasladaron únicamente los commits T10 recientes que estaban encima del PR T05. PR #38 y sus cambios T05 no se modificaron.

### Corrección implementada en este candidato

- `pendingBackgroundJobNotifications` ahora forma parte del arranque real de la extensión. Al iniciar Pi, ASEN consulta el journal dentro de la pareja activa sesión/proyecto y vuelve a encolar solamente resultados terminales pendientes. No vuelve a ejecutar el comando. El resultado se marca `enqueued` después de que Pi acepte la llamada síncrona; el mensaje y sus detalles declaran `deliveryConfirmed: false` porque Pi no ofrece un acuse durable de presentación.
- El estado de entrega de un job recuperado se actualiza bajo el lock existente del journal y vuelve a validar job, sesión y proyecto en el punto de escritura. No se creó un almacén de autorizaciones ni de notificaciones paralelo.
- El ID de evento es estable y opaco: se deriva mediante SHA-256 de sesión, proyecto y job, sin filtrar el path del proyecto en metadatos del evento.
- Se añadió un recorrido integrado con un proceso Node real que sale con código 7, fallo inyectado de transporte, reinicio de la extensión, reintento con el mismo ID y comprobación de que el comando no se repite. Una tercera instancia no vuelve a encolar el resultado ya aceptado.

### Verificación ejecutada en esta rama

- `npm ci --ignore-scripts` terminó correctamente.
- `npm run check` pasó: typecheck, suite completa 2.224 PASS / 0 FAIL / 19 SKIP y auditorías de parity, skills, memory, ecosystem y upstream boundary. La auditoría de ecosystem conserva 16 claims PARTIAL y la prueba normativa queda NOT ADMITTED.
- `npm run build`, `npm run verify:pack` y `git diff --check` pasaron. El paquete instalado registró 11 comandos, 16 herramientas, cero llamadas a modelos, reinicio y aislamiento cross-session en Pi RPC; este recibo no cubre TUI.
- Pruebas enfocadas de jobs, journal, herramientas Pi, entrega integrada, atribución y comandos: 54/54 en el baseline previo al cambio; tras el cambio, typecheck y subconjunto jobs/journal/entrega: 27/27.
- Los procesos reales probados incluyen salida 0, salida 7 y timeout. El caso de entrega pendiente cubre también recuperación tras reinicio y deduplicación por ID estable.
- La matriz interactiva no se ejecutó: `npm rebuild node-pty` falló descargando los headers de Node 24.22.1 con `TAR_ENTRY_ERROR EINVAL: invalid argument, fchown`. Se conserva como bloqueo de entorno, no como prueba superada.

Estos resultados son locales y no equivalen a CI multiplataforma, TUI Pi real ni revisión independiente R4.

### Hallazgos R4 que siguen abiertos

| Severidad | Hallazgo reproducible | Corrección requerida | Regresión requerida |
| --- | --- | --- | --- |
| Alta | `findPotentialWorkspaceConflicts` solo clasifica cambios del log por actores y path; `/asen-changes` obtiene entradas de la sesión activa. No compara versiones/contenido, no identifica conflictos confirmados y no puede resolverlos. La prueba existente solo comprueba la señal heurística y el aislamiento de sesiones. | Diseñar sobre el almacén de workspace y la autoridad ya existente una operación explícita, de un solo uso, vinculada a sesión/proyecto/path/hash esperado; validar obsolescencia antes del write y dejar decisión/resultados recuperables. | Dos procesos reales sobre el mismo archivo; diff previo; autorización válida, caducada, reutilizada y obsoleta; interrupción/reinicio; segundo proyecto/sesión aislados. |
| Alta | Las acciones de espacio de trabajo expuestas son de inspección (`asen-status`, `asen-agents`, `asen-changes`, `asen-todos`); no hay flujo integrado para aprobar y ejecutar resolución o descartar/reconocer un aviso. Una vista no concede permisos, pero falta el punto de ejecución autorizado solicitado. | Integrar la acción en el gate de escritura actual, con validación final de identidad/estado en el momento de mutar y registro de resultado; mantener la inspección solo lectura. | Acción autorizada y rechazada, estado obsoleto, reintento, operación ya ejecutada y acceso cruzado. |
| Media | El journal permite reintentar avisos que quedaron `pending`, usando el mismo ID. Si el proceso cae después de que `sendMessage` acepte el mensaje y antes de persistir `enqueued`, Pi no expone acuse/idempotencia durable que permita saber si el usuario lo recibió. El reintento puede duplicar el aviso, aunque no el job; marcarlo entregado antes del envío permitiría perderlo. | Mantener el contrato como reintento de encolado best-effort, documentar el límite y deduplicar por ID en un consumidor solo si Pi ofrece una interfaz demostrable. No afirmar exactamente-una-vez ni lectura confirmada. | Fallo antes y después de enqueue, reinicio en ambas ventanas y comparación del mismo ID; una futura prueba de acuse solo si la API lo admite. |
| Alta | Las pruebas de formato comprueban ancho y sanitización, pero no la navegación por teclado ni la TUI nativa Pi 1.2.0. La prueba TUI histórica quedó bloqueada al compilar `node-pty` por `fchown EINVAL`; no es un PASS. | Completar una matriz TTY/no-TTY de la interfaz real de Pi 1.2.0 o registrar un bloqueo de entorno reproducible; documentar controles de teclado compatibles con Pi. | Terminales 120/80/60/40 columnas, sin color, teclado/escape/cancelación, error/carga y reinicio. |

### Dictamen

T10 sigue **PARTIAL**. La recuperación de avisos pendientes queda conectada al uso real; la resolución autorizada de conflictos, las acciones mutables, la prueba TUI/teclado y la revisión independiente R4 no están cerradas. La API de Pi limita la promesa de entrega a encolado best-effort con ID estable. No se infiere FULL de esta tanda.


### T10 — Workspace status/attribution hardening, 2026-10-31

A new bounded continuation addresses three concrete weaknesses of the existing read-only `/asen-changes` path: Git rename/copy records now retain and render their original path and reject incomplete NUL-framed status; a directory nested under another Git worktree is reported unavailable rather than silently attributed as its own Git root; and conflict warnings are scoped to the owning session as well as project/worktree/path. Tests include an actual `git mv` in a disposable repository and negative parser/root/session scenarios. This unit neither authorizes filesystem writes nor resolves conflicts. T10 remains **PARTIAL**: authorized workspace actions, cross-process coordination, interactive terminal accessibility, and independent exact-candidate R4 evidence are not admitted by this change alone. CI results are pending for the published candidate; prior test receipts are not transferred to it.


### T10 manual correction / Pi interactive action continuation

The existing /asen-changes command now supports an explicit \`resolve\` subaction for a recorded same-session conflict. It is unavailable without an active interactive Pi selector, editor and confirmation, and does not accept arbitrary model-supplied paths or shell arguments. It selects only attribution conflicts in the current project/worktree, prepares a bounded tracked text-file candidate tied to the current HEAD and file bytes, requires fresh human confirmation, acquires the existing exclusive workspace writer lease, rechecks source/root identity, atomically replaces that one file and attributes the user edit. Dirty or stale candidates, symlinks, sensitive paths, locks and missing UI fail closed. No commit, automatic merge or independent-review acceptance is performed. The implementation is cooperative concurrency protection, not OS confinement against malicious same-user path substitution. Tests cover one-use, stale content, competing writers, publication drift and unsafe paths.

The Pi child-process integrity pin for workspace attribution was updated from the verified original source digest to the exact new reviewed attribution source SHA-256. The pinned guard was not disabled. This iteration remains PARTIAL pending exact-SHA CI, interactive TUI evidence, cross-process coordination and the remaining original T10 scope.


Follow-up R4 portability correction: on POSIX the atomic replacement preserves the original file permission bits (including executable mode); an explicit regression commits an executable source and verifies its mode after correction. Windows-only file symlink setup is declared an environment-dependent skip instead of assuming privileged symlink creation. Neither change weakens the path, HEAD, one-use, or writer-lease checks.


### T10 — metadata de sesión compartida entre procesos (continuación)

`enableWorkspaceRuntime` activa el directorio privado `SharedSessionDirectory`, que conserva solo etiquetas, clasificación y sesión/proyecto mediante registros finitos por PID y caducidad. La consulta desde otro proceso vuelve a requerir consentimiento interactivo de un uso, ligado al solicitante y proyecto; los tokens no se comparten. Las pruebas incluyen dos instancias de directorio, un proceso Node independiente, aislamiento entre proyectos, caducidad de una sesión cerrada y rechazo de enlaces simbólicos. Sin este opt-in se mantiene el directorio process-local anterior. Este mecanismo no comparte transcripciones, credenciales ni permisos.

Riesgos residuales: los registros solo verifican vida del PID, no autentican un proceso del mismo usuario; un proceso malicioso con igual identidad del sistema puede modificar los metadatos. Los registros caducan tras cuatro horas sin renovación de sesión. La consulta requiere una segunda comprobación y no concede escritura. Falta TUI multiinstancia real, rendimiento bajo concurrencia y R4 exact-SHA antes de FULL.


Same-process session recovery regression: two Pi host instances with the same PID may transfer ownership of a metadata record for the same session identity. The old host's shutdown only removes records whose random owner token still matches, so it cannot erase the new host's record. A different live PID remains blocked from taking that identity. No authority or consent token is transferred.


### T10 state isolation and process-death characterization — 2026-11-01 batch

`PiNotificationProjection` now clears the internal `SessionNotificationBus` partition during scope changes and shutdown, instead of only clearing the rendered Pi widget. This prevents old session/project messages from reappearing if an identical identity is activated again and frees ephemeral bus capacity; it does **not** acknowledge a durable delivery. `tests/notification-projection.test.ts` and `tests/session-notifications.test.ts` cover stale same-identity reactivation, scope isolation and capacity recycling.

`tests/background-job-journal.test.ts` adds a real separate Node process killed after a journaled `running` record is fsynced, then observes a non-resumable `interrupted` view on restart. Pending interruption notification identity is visible without executing the command again. A disk row still marked `running` **must refuse** a forced `enqueued` mutation from another process; the test verifies journal bytes remain unchanged. This is a deliberate fail-closed boundary, not delivery success. A future owner-fenced crash-confirmation protocol is required before safe automatic acknowledgement of that uncertain record. No exactly-once or user-visible confirmation claim is made. New SHA CI remains to be observed.


### T10-R7: recovered `running` is an observation, not a deliverable terminal event

The journal's `load` projects a previously recorded `running` job as `interrupted` **only for observation**. Its durable on-disk state still reads `running`, which may also be owned by another concurrently alive Pi process. The extension previously attempted to send this projected terminal-looking status automatically at startup and then set `enqueued`. Durable acknowledgement refused that state; the unacknowledged status could be resent on each subsequent restart.

The extension now treats every recovered `interrupted` job conservatively as **uncertain**: a bounded user-facing diagnostic directs inspection via `asen_background_status`, with **no auto resend, command replay, mutation of journal state or delivery confirmation**. Genuinely persisted terminal `completed`/`failed` jobs still use the existing pending-notice recovery. The adversarial integration test boots the same journal twice and checks that no Pi message is enqueued and the disk row rejects false delivery promotion. The self-audit R4 checks the guarded startup branch against removal. No user-visible display acknowledgement or exactly-once transport is claimed. T10/ECO-10 remain PARTIAL until an actual host ack/owner fencing exists.


### T10-R8 — rechazo universal de resultados de ejecución incierta

Se extiende la protección de reinicio desde `extensions/asen.ts` a las dos fronteras compartidas de datos: `pendingBackgroundJobNotifications` ya no produce avisos de `state==="interrupted"`; `BackgroundJobJournal.updateDeliveryState` y `BackgroundJobRegistry.setDeliveryState` rechazan marcar `pending` o `enqueued` cuando el estado todavía es `interrupted`. Un evento `interrupted` puede seguir consultándose mediante status, pero no equivale a una ejecución finalizada ni a una recepción comprobada. Los resultados reales `completed`/`failed` mantienen su comportamiento. Pruebas nuevas cubren lista pendiente, aislamiento por sesión, rechazo del journal en ambos estados y byte-exact preservation de la escritura fallida. R4 SELF_AUDIT_ONLY verifica por fuente las tres fronteras y tiene prueba adversarial de eliminación de controles. No se declara ACK de Pi, exactamente-una-vez ni ECO FULL.


### T10-R9 — compare-and-set for delivery metadata, not whole-row journal overwrites (2026-11-01)

A live `BackgroundJobRegistry.setDeliveryState` used to update its memory snapshot and then call `BackgroundJobJournal.record`, blindly replacing the entire durable row by job id. With two Pi processes, a stale local snapshot could overwrite a newer terminal outcome or undo a delivery transition. Worse, a failed write left the in-memory snapshot marked `enqueued` despite a persistence error.

The registry now sends the observed terminal snapshot to `BackgroundJobJournal.updateDeliveryState(..., expected)`, which holds the existing exclusive journal lock, compares state, updatedAt, command, mode, exit code, event count, cwd, arguments, output tail, delivery state and delivery error against the committed row, and changes **only delivery metadata** when the expected values still match. A mismatch fails closed, and registry memory stays unacknowledged while reporting persistence failure. The existing restart-only update uses the same lock and state validation but does not fabricate a native Pi display receipt. A real child Node process publishes a conflicting terminal row; another test publishes `enqueued` before a stale writer attempts to regress it to `pending`. Both conflicts must be rejected with durable data preserved. R4 SELF_AUDIT_ONLY validates this CAS boundary and has mutation tests.

**Limitations:** These checks reduce wrong-row overwrites and preserve conservative results; they do not prove visible Pi delivery, exactly-once effects, or full cross-process ownership fencing for arbitrary job termination. T10/ECO-10 and the 16 ECO aggregate claims remain PARTIAL. New exact-SHA CI Windows, macOS, Linux and Release Gate are required; do not inherit prior SHA receipts. External independent review was replaced only by explicit SELF_AUDIT_ONLY for bounded PR #45 scope; no main merge or release.


### T10-R10 — journal record finality and one-time retry-claim preservation (2026-11-01)

An additional T10/T04 concurrency defect was confirmed: `BackgroundJobJournal.record` previously removed any existing entry by id and wrote the caller's full snapshot. A stale original process could overwrite its original `stopped` record after `claimInterruptedForRetry`, or overwrite a newer terminal result and its delivery receipt. The bounded fix runs under the existing cross-process journal lock and refuses any stale, duplicate or unauthorized row replacement. A normal `running -> completed/failed/stopped/timed_out/flooded` transition is allowed only with the same immutable job identity and unchanged delivery metadata. A durable authorized `interrupted` retry claim may transition **once** to `running` with its exact authorization binding; a second start is rejected. Terminal and claimed rows never revert through `record`. An unrecognized identity change or delivery-state mutation is rejected without rewriting bytes.

Regressions cover: (1) real second Node writer publishing terminal failure before a stale process attempts to finish and enqueue, (2) stale original child attempting to erase a consumed retry claim, (3) exact one-time claim start plus subsequent valid finish, (4) actual `BackgroundJobRegistry.runAuthorizedRetry` with journal persistence, and (5) a terminal delivery receipt surviving attempted stale overwrites. The source and adversarial mutation checks are included in R4 SELF_AUDIT_ONLY. This is source-level protection against observed interleavings, **not** complete cross-process execution owner fencing, not native Pi display ACK, and not exactly-once side-effect proof. T10/T04/ECO aggregate remain PARTIAL. The old parent SHA 2a2676c had Release Gate and core checks PASS but CI was still running Windows/macOS at inspection; new source requires its own exact-SHA cross-OS checks. F5-01/F5-02 are IN_PROGRESS. No independent review or main merge.
