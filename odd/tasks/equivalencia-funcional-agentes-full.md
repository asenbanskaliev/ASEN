# ASEN — ODD de equivalencia funcional integral de agentes hasta FULL

**Estado: IN_PROGRESS — FULL NO ALCANZADO.** Fecha: 2026-11-03. Rama: `feat/t12-integrated-acceptance-merge`, PR #45. Propietario autoriza el plan; NO autoriza merge a main, gasto en modelos ni saltarse permisos.

## Misión

Reproducir los comportamientos observables del entorno de referencia para **Explorer, Planner, Reviewer, Verifier y Writer**, incluida la elección de cuándo utilizarlos, la coordinación en segundo plano, los controles de riesgo, la recuperación, las decisiones humanas, las comprobaciones y el resultado de cierre. FULL no significa textos idénticos entre modelos estocásticos: significa rutas, acciones permitidas, rechazos, resultados de control y garantías funcionales equivalentes para los mismos escenarios.

**Relación con otros ODD:** este documento es el plan de ejecución especializado, no sustituye `odd/tasks/pi-capability-completion.md` (ODD canónico) ni `odd/tasks/ecosystem-strict-parity.md` (backlog de equivalencia global). Tampoco promociona los 16 ECO PARTIAL/0 FULL. Toda acción respeta `AGENTS.md` y los gates de la PR.

## Baseline congelada y procedencia

| Fuente | SHA verificado el 2026-11-03 | Significado |
| --- | --- | --- |
| A — orquestador/experiencia de referencia | `813ec110600c8451c5f2bb9c35c12d8cf9b1c11e` | Decisiones de agentes, notificaciones y ODD |
| B — motor metodológico/revisión | `fd99d8492adb6c23c29f3e9fbd59fc756b76b6ff` | Contrato de revisión y transiciones nativas |
| ASEN inicial | `aeea0505feb19eccccff24b596a4e9156c0db96c` | Código y pruebas auditados |
| Fuente global ECO histórica (no sustituir) | `08de420ca29be16b6f6bee725a30b599b061df16` | Comparación histórica registrada |

Los nombres/URLs de fuentes externas se conservan en la procedencia permitida del proyecto, no en este ODD: `scripts/audit-upstream-boundary.mjs` rechaza esos literales en archivos versionados ordinarios. Cambiar la baseline exige decisión explícita, análisis delta y nuevas pruebas, nunca heredar PASS de otro SHA.

### Hallazgos iniciales — lectura de código, no prueba funcional completa

| Componente | ASEN hoy | Brecha frente a A/B | Estado |
| --- | --- | --- | --- |
| Explorer | Agente de lectura, CodeGraph y skill | Criterios y presupuesto de delegación, fuentes web y formato de entrega | PARTIAL |
| Planner | ODD, rutas, TODO y dependencias | Decisión directa/delegada, preservación de intención y reanudación exacta | PARTIAL |
| Reviewer | Revisión ordinaria y dual con evidencias | Revisión nativa proporcional, perspectivas, corrección y cierre | PARTIAL |
| Verifier | Gates y pruebas por candidato | No debe lanzarse si la referencia no lo exige; pruebas independientes propias | PARTIAL |
| Writer | Consentimiento y edición delimitados | Handoff, test-first, paralelismo disjunto y ciclo completo | PARTIAL |
| Coordinación | Suscripción a eventos e historial | Notificación no garantiza despertar al padre, deduplicación y acuse | PARTIAL |

En el SHA inicial: Phase 0, Release Gate, F5, Pi Runtime, CodeGraph, autoauditoría R4 y aceptación T12 sin proveedor PASS. **CI general FAIL** en Ubuntu, macOS y Windows, por dos casos comunes de `tests/primary-tool-policy.test.ts`: confirmación Normal falsa-caducada y error del diálogo absorbido. Verificación con modelo real y Writer interactivo: no acreditadas. La tanda B0 corrige el origen y añade una prueba de autorización caducada; el PASS depende del CI del nuevo SHA.

## Nueva baseline UX y equivalencia funcional — Gentle AI v4.3.1 + Gentle Shell v4.6.0 (2026-11-05)

**Normativo para declaración FULL, NO una implementación terminada.** El runtime y su instalador se contrastan contra Gentle AI `v4.3.1`, SHA `2dba7784114fff57864519c4c0d067e952a8c98b` (27-10-2026). La UI se contrasta contra Gentle Shell/gentle-pi `v4.6.0`, SHA `1f74e9e24473e7e121a96b1680444ae0196d3009` (04-11-2026), que empaqueta Pi `1.5.0` y fija Gentle AI v4.3.1. El contrato de provider review es `1.4.0`. **ASEN HEAD observado:** `984d867d310c13b6d564c46a81f2dd263694f127`. No consultar main upstream como prueba de esa versión.

**Especificación completa y ejecutable:** [Gentle Shell/UI — 28 EF detallados, comandos, pantallas, 14 tareas y 24 pruebas](gentle-shell-v4.6.0-paridad-ui-odd.md). El anexo es parte obligatoria de este ODD; contiene el contrato de cómo inicia cada agente en UI y cómo se representa en TODOS, JOBS, AGENTS, CHANGES, REVIEW, INTEGRATIONS y barra inferior, incluyendo escenarios de error, consentimiento, navegación, sesión y modelos. Los cambios se deben probar contra SHAs fijos. No se han añadido funcionalidades UI al runtime por la publicación de este plan.

**Diferencias detectadas:** ASEN ya tiene comandos `/asen-agents`, `/asen-changes`, `/asen-todos`, `/asen-status` y `asen_agent_*`, pero el UI probado es fundamentalmente textual + widget TODO breve. No constan rail IDE único (>=140), overlay de Agents con thread, dos paneles de Changes, Panel sheet estrecho, Integrations MCP y barra inferior con contexto+coste+cuotas. El runtime fuente de 2026-11-04 es **Gentle Shell**, no solamente Gentle AI Go. Las garantías de seguridad no se deben rebajar por fidelidad de diseño.

### Matriz de ampliación para los 28 EF (sin alterar checks canónicos)

| EF | Funcionalidad | Lanzamiento/comando o gesto de referencia | Objetivo nuevo de UI y runtime | Dependencia/gate |
|---|---|---|---|---|
| EF-000 | Baseline y manifiesto de fuentes | Shell/AI release, /gentle:status y perfiles, SHA fijo. | Registrar tag/sha/path/estado de UI y Pi API por fuente, inventario de 6 paneles, comandos y renderer; archivo fuente referenciado por permalink. | FREF: comprobar inmutabilidad y hash, sin cambiar semántica de C01–C20. Requerir registro de entrada, estado antes/después, comand |
| EF-001 | Confirmación y permisos | statusbar PERMISSION, modal de autorización al realizar acción restringida. | UI normal/auto/YOLO/super-yolo, herencia y rollback; denegar no cambia archivos/sesión; no se acepta consentimiento de CI como humano. | FPERM: TUI real allow/deny/cancel y 3 sistemas. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/reci |
| EF-002 | Observación A/B | C01–C20 en herramientas, navegación Agents/Changes/Review/Todos. | Recopilar trazas observables por cada caso en Shell v4.6, Gentle AI 4.3.1 y ASEN; no heredar pruebas anteriores. | FREF: 60 slots ejecutados con provenance y host A/B de verdad. Requerir registro de entrada, estado antes/después, comandos/tool,  |
| EF-003 | Harness observable UI | registro de comando/estado/selección/scroll y diff Git. | Normalizar tokens/tiempo/ANSI, NO normalizar cambios semánticos de permiso, modelo, rol o terminal status; comparar snapshots/acciones UI. | FTEST: A/B+ASEN misma secuencia y semántica. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo  |
| EF-101 | Decisión de ruta | prompt normal → acción directa o subagent_run + Delegating. | Tarea simple sin spawn; tarea compuesta crea plan visible y razones; UI no exige JSON al usuario; perfilar roles sin pago implícito. | FAGENT: tests ruta para casos bajo/alto riesgo y UI-C05/06. Requerir registro de entrada, estado antes/después, comandos/tool, scr |
| EF-102 | ODD/TODO | tool todo write/add/update/list/clear; rail TODOS glyph y progreso. | Mapeo de estados sin mentir: succeeded en ASEN sigue pendiente de revisión; blocked nota visible; histórico, dependencias, cache de prompt tras cambios. | FTODO: UI-C03/04/20 + reinicio y no duplicación. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/rec |
| EF-103 | Reanudación de dependencias | TODO y Agents indican próximo step, nombre/estado y jerarquía. | Revalidar session/project/HEAD/perfil/consentimiento antes de despacho; UI muestra por qué no avanza y etapa en cola. | FAGENT+FTODO: UI-C07 y segundo proceso. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de ho |
| EF-201 | Explorer | subagent_run(agent=gentle-ai-explore, task, mode=task/background); cards Agents. | Priorizar CodeGraph, añadir fallback sólo si disponible/autorizado, registrar child tools reales, límite de contexto y lectura web controlada. | FAGENT+FINT: UI-C05/06/17, Pi RPC, sin Writer. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recib |
| EF-202 | Presupuesto de exploración | fila Explorer con tokens/tiempo/coste y avisos no repetidos. | No polling ni relanzamientos bajo presupuesto; mostrar remaining/unknown verídico; UI no inventa consumo al reservar inferencia. | FBAR: UI-C11/15, medidores distintos logical HTTP. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/r |
| EF-203 | Retorno compacto | ↩ Agent answer + estado + thread; Changes permanece clean. | Resultado redactado y bounded, archivos sin escritura y tool use auténtico; JSON/errores maliciosos no se interpretan como nueva orden. | FAGENT+FCHANGES: C05 + UI-C05. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando |
| EF-301 | Handoff Writer | agent worker en Agents, prompt de aprobación con rutas SHA y scope. | Proyectar instrucciones exactas, risk, test y rollback; no conceder acceso por hacer clic en tarjeta; usar repo Git temporal limpio para CI. | FWRITER+FUI: UI-C06/18; negativa real. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de hos |
| EF-302 | RED→GREEN/PRESERVE | TODO en curso, Changes refleja diff tras Writer, Review guarda pending. | Registrar fallo previo, fix autorizado, green y no regresión; no promover TODO a done sin resultado verificado, ni retroconceder grants al child. | FWRITER+FREVIEW: casos C06–07. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando |
| EF-303 | Paralelismo seguro | AGENTS múltiples, CHANGES grupos por worktree y archivos. | Admitir sólo scopes disjuntos/aliases resueltos, revertir por subworktree, no atribuir simultaneidad a CPU sin Pi real. | FCHANGES+FPERM: UI-C08/09 con dos grants. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de  |
| EF-304 | Consentimiento humano | WAITING agent, pregunta en editor, modal Pi, resumen candidato y cambios. | Una decisión por operación/archivo/candidato, revocación y denegación; UI no debe mostrar successful sin ejecución; archivar recibo de decisión real. | FPERM: UI-C10/18; bloqueante para FULL. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de ho |
| EF-401 | Política de riesgo | Review sólo con RDD; Risk: item N exige recordatorio, no concede permiso. | Límites del runtime AI 4.3.1: ítem 1 high-risk sólo dato irreconstruible; probar tanto no-verification como verification. | FREVIEW: C09 con inputs A/B. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando c |
| EF-402 | Verifier autónomo | AGENTS verifier separado del Worker; REVIEW muestra test results. | Pruebas nuevas contra petición original, baseline, scratch; ningún permiso de escritura por rol verifier, no considerar PASS sin corroboración. | FREVIEW: C10, UI-C12 y real Pi. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuand |
| EF-403 | Defecto alto riesgo | Review finding → scope Changes → fix → fresh Verifier; distintos SHA. | Probar RED/diagnóstico/fix/segunda verificación con el modelo real; si fixture es construido, distinguir de bug ASEN; revisión tras nuevo SHA. | FREVIEW: C09–10, criterios de severidad y post-fix. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/ |
| EF-501 | Revisión nativa | gentle_review y /gentle:review, panel Review needs you. | ACK positivo avanza reviewed boundary y sólo con candidato fijo; rctx1/rctx2, base upstream, errores typed; no esconder controles de usuario. | FREVIEW: UI-C12/13, contratos AI 1.4.0. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de ho |
| EF-502 | Juicios y re-evaluación | dos reviewers independientes; tarjeta findings y ACK, cambio en Changes. | Congelar snapshot, comparar perspectivas, aplicar fix sólo con grant válido, repetir juicio sobre commit/diff nuevos sin reusar evidencia. | FREVIEW: C11–12 y UI-C13. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando corr |
| EF-503 | Independencia de revisión | Reviewer/Verifier identificables como tasks distintas en AGENTS. | Diferenciar dos respuestas modelo de revisión externa; identidad del auditor, inputs ocultados del otro juicio, autoridad humana separada. | FREVIEW: pruebas de independencia y veredicto R4. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/re |
| EF-601 | Entrega de hijos | ↩ Agent answer; si WAITING, pregunta; si stale, aviso; padre idle despierta. | Diferenciar parent running, idle, hold y print; deduplicar wake, demostrar consumo en Pi y no sólo enqueued. | FAGENT: UI-C10/14, Pi padre auténtico. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de hos |
| EF-602 | Sin sondeos | aviso async, no sleep, stale obliga consultar subagent_result. | Una notificación terminal por task; error de wake reintenta acotado, no reejecuta child; etiquetas y resultados saneados. | FAGENT: UI-C14, pruebas con fallos inyectados. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recib |
| EF-603 | Coalescencia exacta | un Explorer activo, Reviewer/Verifier sin alias, coste único en AGENTS. | Incluir normalización física Windows de identidad, session/project/model/effort/task; tests con aliases UNC, cambios de ruta y owner; distinguir proceso RPC de llamadas HTTP observadas. | FAGENT: UI-C06/08 y recibos exactos. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host  |
| EF-604 | Crash/recovery | reopen /gentle:agents; estado enqueued/attempted, preguntas no inventadas. | TUI crash durante inferencia, child exit incierto, historial durable, respuesta humana posterior, no replay/autoauth. | FAGENT+FTODO: UI-C10/14, Pi auténtico. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de hos |
| EF-701 | Paridad A/B con UI | capturas reproducibles de rail/palette/agents/gits/consentimiento. | Todos los C01–20 con trazas reales fuente y ASEN; UI-C01–24 complementarios; no sustituir 3OS por única captura Linux. | FREF+FTEST, manifests con SHA. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo de host cuando |
| EF-702 | Modelos/cuotas | /gentle:profiles chains por agente, /gentle:usage, statusbar; aviso ↪ nuevo modelo. | Cadenas <=8 y cooldown 30 min auth/cuota y 2 min transitorios, avanzando sólo en tipos admitidos; API coste cero confirmado; ningún fallback a pago sin permiso explícito. | FPROFILE+FBAR: UI-C15/19, cuota real/no fake. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo |
| EF-703 | TUI+3OS+Pi | fullscreen >=140, panel <140, 6 bloques, interop MCP, Pi 1.5, Install. | Verificar accesibilidad mouse/keyboard, escenarios con Pi 1.2 y 1.5, Windows UNC, macOS, Linux, firmas y provider; integrar nuevos UI-C gates y seguridad sin saltar shards. | FTEST+FINSTALL: UI-C01–24 + gates exact-SHA. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo  |
| EF-704 | FULL estricto | todos paneles y comandos con evidencia; UI y CLI concordantes. | Cerrar sólo con todos EF, UI-C01–24, C01–20, S01–S20, CI+Release Gate, pruebas reales y revisión independiente; registrar divergencias explícitas sin false FULL. | FALL: aprobación final documental auditada. Requerir registro de entrada, estado antes/después, comandos/tool, screenshot/recibo d |

**Lectura de tabla:** se necesita reproducción real (teclado, mouse, comandos y estado) cuando hay UI, pruebas de proceso Pi cuando hay agente y recibo exact-SHA cuando hay aceptación. Los detalles, denegaciones y casos límite de cada EF están en el anexo. Ningún punto pasa a `[x]` por estar aquí documentado.

## Specs

### S01 — Decisiones proporcionales del coordinador

- Las tareas pequeñas, entendidas y de bajo riesgo se resuelven directamente. No exigir cinco agentes siempre ni crear tareas solo por número de archivos o precio.
- Delegación motivada por exploración extensa, límites reales de contexto, paralelismo independiente o riesgo. Una petición no autorizada sigue siendo de lectura; un plan o un resultado no fabrica consentimiento.
- **AC01:** C01, C04, C05 reproducen la misma decisión de ruta y bloqueo que A.

### S02 — Explorer

- Lectura únicamente, salvo el índice local permitido. CodeGraph antes de búsquedas amplias; fallback solo tras indisponibilidad/fallo. Evidencia web recuperada y atribuida; no deducir contenidos de una URL.
- Presupuesto de exploración equivalente a A: disparo al superar 3 consultas o 40 KiB de texto observado; delegar solo una vez. Entregar resumen corto con rutas, líneas, pruebas y dudas; no editar, ejecutar comandos ni subdelegar.
- **AC02:** C02–C03 prueban misma activación, investigación y ausencia de escrituras.

### S03 — Planner y ODD persistente

- Documentar para trabajos sustanciales requisitos originales S#, criterios de aceptación, tareas estables, riesgos, decisiones, pruebas, avances y siguiente paso, conservando `## Specs` y `## Log`.
- Reconciliar TODO/ODD/memoria sin duplicar fuentes de autoridad; si el espejo de memoria falla, marcar pendiente sin declarar persistencia. Validar sesión, proyecto y revisión antes de continuar.
- **AC03:** C05 y C15 preservan intención y estado real tras interrupción.

### S04 — Writer

- El padre aporta motivo, tarea exacta, archivos permitidos, habilidades, requisitos y pruebas. Cada unidad contiene código, test y documentación asociados.
- Modificar solo el alcance autorizado, preservar cambios ajenos; no leer credenciales, usar subagentes, hacer stage/commit/push/release ni migraciones destructivas desde el hijo.
- RED/GREEN y pruebas de preservación cuando apliquen; ejecutar pruebas autorizadas en primer plano, con intentos de corrección finitos. Dudas de alcance: una elección humana concreta, no suposición.
- Dos Writers simultáneos solo con superficies disjuntas demostrables. Resultado estructurado completed/partial/blocked/interaction_required, nunca éxito ficticio.
- **AC04:** C06–C08, C17 y C19 prueban alcance, evidencia y consentimiento real.

### S05 — Verifier proporcional e independiente

- No abrir un Verifier por rutina ni por tamaño: pasivo = comprobación estructural del padre; medio = autopruebas del Writer; alto riesgo declarado = comprobador independiente adicional.
- Obtener pruebas propias del requisito original, extremos, mensajes/errores, datos sin cambios tras rechazo, comparación con baseline y copia de trabajo aislada. No editar ni inventar pruebas ejecutadas.
- Fallo de preparación: registrar un bloqueo real y los checks no ejecutados, sin reintentos indefinidos.
- **AC05:** C09–C10 comprueban selección correcta e independencia real.

### S06 — Reviewer y revisión nativa

- Evaluar riesgo de un cambio exacto, no del plan entero. Mantener separadas revisión normal, las cuatro perspectivas adversariales y la verificación funcional: no tratarlas como el mismo gate.
- Igualar las perspectivas y transiciones admitidas de B: riesgo, legibilidad, fiabilidad, resiliencia; candidato congelado, pruebas, aceptación/rechazo, corrección delimitada y reevaluación tras cambios.
- Un modelo no disponible, un output inválido, un candidato obsoleto o la autoauditoría no se convierten en revisión independiente PASS.
- **AC06:** C11–C12 y C17 verifican decisiones, correcciones y permisos en el mismo SHA.

### S07 — Segundo plano y despertar del padre

- Lanzar agentes con ID persistente y una sola ejecución para el mismo trabajo activo; devolver el ID e informar de notificación automática. El padre no debe usar sleep/sondeo periódico como mecanismo de espera.
- Padre ocupado: insertar resultado en el turno sin duplicar. Padre inactivo: conservar resultado y **provocar reactivación**; una simple notificación con `triggerTurn:false` no basta.
- Identificar tarea, proyecto, sesión, intención y alcance; no confundir similitud verbal con equivalencia. Separar encolado, entregado y consumido; invalidar mensajes viejos, repetidos o cruzados.
- **AC07:** C13–C15 verifican despertar real y ausencia de efectos duplicados.

### S08 — Recuperación, decisiones humanas y continuidad

- Persistir resultados/estados sin restaurar permisos. Tras reinicio distinguir exitoso, fallido, detenido e incierto; un write incierto no se relanza sin comprobar ausencia de efecto.
- Relacionar task ID con ODD, sesión, workspace y SHA. Subagentes pueden elevar una pregunta al humano; ninguna salida del modelo da autorización.
- **AC08:** C15 y C18 pasan con reinicios y decisiones interactivas auténticas.

### S09 — Modelos, cuotas y coste

- Respetar modelo y esfuerzo configurados para cada rol; no sustituir silenciosamente por proveedor/modelo pagado cuando el elegido no responda. Contabilizar llamadas, tiempo y coste sin confundir smoke con capacidad funcional.
- Las pruebas reales requieren proveedor autenticado gratuito disponible y consentimiento de consumo; un proveedor inaccesible deja BLOCKED, no PASS simulado.
- **AC09:** C16 y C20 prueban modelo real de cada rol sin coste inesperado.

### S10 — Permisos, seguridad y experiencia

- No transmitir modos elevados del padre a hijos ni eludir consentimiento independiente de Writer. Proteger secretos, rutas sensibles, operaciones destructivas y destinos externos.
- Inicios/finales muestran rol, ID, modelo, estado y resumen útil, sin ruido de sondeos; las preguntas humanas son concretas. La entrega al padre se prueba y registra, no se supone.
- **AC10:** C13, C14, C17–C19 son equivalentes a A sin escapes de permisos.

### S11 — FULL requiere paridad y evidencias, no cantidad de tests

- FULL solo si S01–S10 y C01–C20 están demostrados sobre una baseline de referencia fija y un SHA final de ASEN. Cambios nuevos invalidan evidencias afectadas.
- Exigir tests focalizados + suite completa PASS Ubuntu/Windows/macOS, build/typecheck, Arquitectura/Release Gate, Pi real, cada rol con modelo real cuando aplique, Writer solo con consentimiento humano, recuperación y despertar real. Una prueba con mocks prueba el contrato local, no el proveedor.
- `SELF_AUDIT_ONLY / NOT independent` es un gate técnico temporal de PR #45; no cuenta como independencia real en el objetivo FULL.
- **AC11:** matriz obligatoria cerrada con recibos exact-SHA, sin FAIL/SKIP obligatorio/BLOCKED ni incidencias materiales abiertas.

### S12 — Marco terminal paritario (Gentle Shell v4.6.0)

En fullscreen ancho >=140: título de proyecto/sesión/perfil, rail único tintado con TODOs → Jobs → Agents → Changes → Review → Integrations (Stats opcional), headers plegables con click, tooltip/hover y render incremental sin congelar transcript. Menos de 140: work row y botón Panel; hoja navegable j/k/↑/↓/mouse/esc; degradar con honestidad en headless/RPC.

### S13 — TODO visible y semántica ODD

Estados fuente pending/in_progress/blocked/done/dropped, glifos/notas y colapso; mapeo ASEN a plan/run/succeeded/review/done sin falsificar §succeeded§ como §done§; scroll, historial, mensaje tail y prompt cache. Iniciar/actualizar con tool real, no por pintado del panel.

### S14 — Agents real y diálogo padre/hijo

La UI expone subagent_run/list/status/result/reply/continue/cancel/send_message, roles, parent-child, modelos/effort/tokens/cost/time auténticos, wait/failed/completed y preguntas arriba del editor; overlay §/gentle:agents§ con thread, teclado, mouse y permisos de sesión. No autoconsentir Worker ni reutilizar Reviewer/Verifier como Explorer.

### S15 — Changes refleja Git actual

Multi-root worktrees, estado Git y diff HEAD, markers M/A/U/D/R, editor externo seguro, refresh y límite diff 1MiB/20000 líneas; diferencia entre cambios reales y atribución de herramientas. El panel Changes no es evidencia de autor de una mutación ni permiso de edición.

### S16 — Jobs, Review e Integrations

Job separado de agente con background/monitor/log/stop; Review con evidencia RDD y needs you únicamente cuando hay consentimiento pendiente; ACK de review avanza frontera exacta sólo si es válido. Integrations muestra estados reales MCP/extensiones/perfil, sin conectividad inventada.

### S17 — Barra de estado y editor

Barra inferior: rama Git ± dirty, permiso no-default, provider/model, effort/Fast, gauge de contexto (>=80 amber, >=95 red, ? tras compaction), coste/sub y usage clickable. Editor §─ ✿ estado ─§ y §›§ sin romper Pi. No confundir coste declarado con facturación real.

### S18 — Paleta, teclas y customización

§/gentle:commands§ / §alt+k§ como paleta de comandos registrados, buscar/ejecutar/reasignar; §/gentle:customize§ presets Light/Neutral/Power, keymaps con reload, conflicto de teclas reservado/rehusado, responsive y tour §/gentle:guide§. ASEN mantiene alias útiles sin registrar duplicados conflictivos.

### S19 — Perfiles, fallbacks y migraciones

§/gentle:profiles§ con sesión/default/repo, rutas por rol y orquestador, estado congelado tras resume, fallbacks de hasta 8, cooldown y errores typed. ASEN nunca seleccionará un modelo de pago sin autorización explícita. Instalación TUI/Manage/Update del runtime 4.3.1 preserva operador, pins, rollback, reconocimiento de manifest viejo Windows y lanzamiento gs/gentle-shell sin sobrescribir nombres ajenos.

### S20 — Aceptación visible y auditoría FULL

Añadir UI-C01–UI-C24 a C01–C20 sin modificar estos últimos. Probar TUI Pi nativo, ancho 80/120/139/140/160, permisos, teclado/ratón, ctx/usage real, multiagente, recuperación, Git diff, review, 3 OS, CI/Release Gate exact-SHA y revisión R4 independiente. Un screenshot o provider-free smoke no acredita consumo real, autorización humana ni FULL.

## Matriz de aceptación común (A/B y ASEN)

| Caso | Qué deben hacer igual | Evidencia exigida | Estado |
| --- | --- | --- | --- |
| C01 | Trabajo pequeño directo | Sin subagentes ni ODD innecesarios | PENDING |
| C02 | Explorer estructural | CodeGraph primero; fallback justificado | PENDING |
| C03 | Límite de exploración | Un único Explorer al superar presupuesto | PENDING |
| C04 | Petición de alto riesgo o ambigua | No escribe sin autorización | PENDING |
| C05 | Plan de varias etapas | ODD y requisitos conservados tras reanudar | PENDING |
| C06 | Dos unidades de Writer disjuntas | Paralelismo seguro y prueba de integración | PENDING |
| C07 | Dos Writers sobre mismo archivo | Evitar solapamiento y escritura doble | PENDING |
| C08 | Cambio real con pruebas | RED/GREEN/PRESERVE y retorno verificable | PENDING |
| C09 | Cambio de riesgo medio | No lanzar Verifier adicional | PENDING |
| C10 | Cambio de alto riesgo | Verifier independiente con pruebas propias | PENDING |
| C11 | Revisión normal | Misma clasificación y transición | PENDING |
| C12 | Revisión adversarial | Mismas perspectivas, bloqueos y correcciones | PENDING |
| C13 | Subagente termina con padre ocupado/inactivo | Entrega y reactivación real | PENDING |
| C14 | Resultado repetido o antiguo | No reinyectar ni sondear continuamente | PENDING |
| C15 | Reinicio con estado incierto | No duplicar trabajo ni perder evidencia | PENDING |
| C16 | Proveedor sin cuota o credenciales | Error honesto, sin modelo de pago oculto | PENDING |
| C17 | Escritura/acción fuera de alcance | Cero ejecución y protección de permisos | PENDING |
| C18 | Subagente pide decisión humana | Una pregunta vinculada y continuación legítima | PENDING |
| C19 | Writer real Pi autorizado | Un único efecto con consentimiento interactivo | PENDING |
| C20 | Flujo completo cinco roles selectivos | De petición a entrega/revisión sin agentes sobrantes | PENDING |

Para cada C: registro de referencia (SHA, pasos, herramientas, acción de control), registro ASEN (SHA, ambiente, modelo, logs), comparación, PASS/FAIL/BLOCKED y enlace a prueba. No calificar un caso por similitud de respuesta libre.

## Plan ejecutable: tareas y dependencias

### F0 — Puntos de partida y comparación

- [x] EF-000 Auditar código de A/B y ASEN, congelar SHA y registrar diferencias. **Solo evidencia de código**, no equivalencia FULL. **VERIFICADO:** `registry/parity/skill-sources-v1.json` + `tests/agent-observable-parity.test.ts` · CI `41699783530` / SHA `7c1fcd9a7bbd17ddea4aa0aa149db24e903644fc`.
- [x] EF-001 Resolver 2 fallos de confirmación de baseline en tres OS, con preservación de excepción y nueva prueba de caducidad. **VERIFICADO:** `src/security/primary-tool-policy.ts` + `tests/ef001-confirmation-regressions.test.ts` · CI `41724028665` / SHA `e05ed7525b214591501ea085767e3d8c33c42ff1`.
- [ ] EF-002 Obtener observaciones reales C01–C20 del comportamiento A/B con entorno aislado y registrar resultados canónicos. **BLOQUEADO:** Identidad Git y arranque `--help` real de A (Node/Pi) y B (Go) PASS en Actions `41810325787` / SHA `cd114cb`, artefacto `13312266529`; se ejecutaron **cero** escenarios C01–C20 y B aún requiere un host de agentes provisionado para comparación válida.
- [x] EF-003 Crear harness de comparación de decisiones observables sin depender del texto libre del modelo. **VERIFICADO:** `scripts/agent-observable-parity.mjs` + `tests/agent-observable-parity.test.ts` · CI `41699783530` / SHA `7c1fcd9a7bbd17ddea4aa0aa149db24e903644fc`.
- **Gate:** baseline CI limpia, referencias trazables, comparación válida; no modificar el registro global ECO.

### F1 — Planner/decisión

- [ ] EF-101 Alinear rutas directa/plan/delegación sin usar solo tamaño o cantidad de archivos. **PARCIAL:** Rutas ASEN probadas; falta contraste observable A/B.
- [x] EF-102 Conservar ODD, S#, tareas y mirror con conflictos visibles y próximos pasos honestos. **VERIFICADO:** `src/flow/odd-task-tracking.ts` + `tests/odd-task-tracking.test.ts` · CI `41699783530` / SHA `7c1fcd9a7bbd17ddea4aa0aa149db24e903644fc`.
- [x] EF-103 Continuar por dependencias con identidad, sesión y candidato revalidados. **VERIFICADO:** `src/runtime/plan-dispatcher.ts` + `tests/plan-dispatcher-candidate-guard.test.ts` · CI `41699783530` / SHA `7c1fcd9a7bbd17ddea4aa0aa149db24e903644fc`.
- **Gate:** C01, C04, C05.

### F2 — Explorer

- [ ] EF-201 Igualar consulta CodeGraph-first, búsqueda local/web autorizada y fallback. **PARCIAL:** CodeGraph-first y fallback sin comparación observada A/B.
- [x] EF-202 Implementar disparadores observables de presupuesto y no repetición. **VERIFICADO:** `src/runtime/explorer-budget.ts` + `tests/explorer-budget.test.ts` · CI `41699783530` / SHA `7c1fcd9a7bbd17ddea4aa0aa149db24e903644fc`.
- [ ] EF-203 Retorno compacto de pruebas y comprobaciones de no escritura. **PARCIAL:** Explorer Pi real con Beam PASS en fixture aislado sin herramientas y sin Writer (run `41723090941`, SHA `fe0198e`); falta demostrar uso auténtico de herramientas, comparación A/B y preservación de archivos con permisos reales.
- **Gate:** C02–C03.

### F3 — Writer

- [x] EF-301 Handoff exacto: task, requisitos, habilidades, pruebas y archivos permitidos. **VERIFICADO:** `src/runtime/plan-dispatcher.ts` + `tests/writer-authorization-snapshot.test.ts` · CI `41689422912` / SHA `07f9793517f8d6a57b3d67cc21b589be8002abb1`.
- [ ] EF-302 Pruebas RED/GREEN/PRESERVE, correcciones acotadas y retorno estructurado. **PARCIAL:** RED/GREEN/PRESERVE sin ciclo Writer real integral.
- [ ] EF-303 Paralelismo seguro disjunto y rechazo de ámbitos superpuestos. **PARCIAL:** Comprobación previa de worktrees y ámbitos disjuntos, con dos leases reales aislados bajo prueba; faltan consentimiento Writer real por carril, ejecución paralela de agentes con permisos independientes y reconciliación segura.
- [ ] EF-304 Probar write real Pi con consentimiento genuino, revocación y resultado exacto. **BLOQUEADO:** Los tests T12 Pi TUI actuales aprueban/cancelan mediante teclas automatizadas, NO una decisión humana. Falta ejecutar, presenciar y registrar un consentimiento humano real vinculado a un archivo/candidato exacto, su denegación y revocación, sin reutilizar aprobaciones del CI.
- **Gate:** C06–C08, C17, C19.

### F4 — Verifier

- [ ] EF-401 Alinear criterio de riesgo: cuándo se lanza y cuándo no. **PARCIAL:** Matriz de riesgo ASEN probada; referencia A/B no ejecutada.
- [ ] EF-402 Pruebas independientes basadas en petición original, scratch y baseline. **PARCIAL:** Verifier Pi real con Beam PASS para rechazo de tres defectos, pruebas deterministas fallidas, fixture aislado y SHA congelado (run `41783370317` / SHA `8add734`); falta ejecutar pruebas nuevas propias/independientes frente a la petición original y comparar A/B.
- [ ] EF-403 Prueba real de defecto de alto riesgo, detección y revalidación tras fix. **BLOQUEADO:** Sin defecto grave real detectado, corregido y revalidado.
- **Gate:** C09–C10.

### F5 — Reviewer

- [ ] EF-501 Alinear vía de evaluación del riesgo, identidad del cambio y revisión nativa. **PARCIAL:** Falta contraste de revisión nativa y riesgos con A/B.
- [ ] EF-502 Comparar perspectivas, resultado congelado, bloqueo, corrección y reevaluación. **PARCIAL:** Reviewer A/B real con dos juicios distintos y Verifier real PASS del rechazo sobre candidato fijo (run `41783370317` / SHA `8add734`); faltan corrección real, reevaluación de perspectivas y contraste externo A/B.
- [ ] EF-503 Probar reviewer real independiente sin sustituir evidencias faltantes por simulaciones. **PARCIAL:** Dos invocaciones separadas de Reviewer y una de Verifier PASS con Ollama Beam y hashes de respuesta diferentes (`41783370317`); no son una revisión externa independiente ni un modelo distinto, requisito todavía abierto.
- **Gate:** C11–C12 y C17.

### F6 — Segundo plano y recuperación

- [ ] EF-601 Entrega del resultado según estado del padre, con reactivación real cuando esté inactivo. **PARCIAL:** Padre/hijo Pi con Beam PASS real (`41798018569`, SHA `616d2655`, artefacto `13306048302`) para padre inactivo. Se añadió una corrección conservadora de estados Pi contradictorios (`isIdle=true` con corrida activa → HOLD) y pruebas de cinco rutas de host + ledger, pendientes de CI nuevo. El padre realmente ocupado con Beam dio PASS acotado en Actions `41815369175` / SHA `0578c3f17150d649f95296819c70a002380d791d`. Siguen faltando reconexión/reinicio de Pi y comparación A/B C13.
- [x] EF-602 Suprimir sondeo/sleep innecesario, duplicados y avisos caducados. **VERIFICADO:** `src/runtime/agent-notification-journal.ts` + `tests/agent-notification-journal.test.ts` · CI `41689422912` / SHA `07f9793517f8d6a57b3d67cc21b589be8002abb1`.
- [ ] EF-603 No relanzar tareas activas equivalentes: misma identidad y alcance verificable. **PARCIAL:** CAS, veto exacto entre IDs Explorer planificados y pruebas con dos procesos Node y journal real superaron CI exact-SHA `41724028665` (3 OS). La aceptación real `41933062639`, SHA `8d1859bd2edda5e6a39fb7e7681fdba68119d93b`, acredita tres solicitudes Explorer idénticas coalescidas en un solo agente persistido y un Pi RPC auténtico con Beam; artifact `13371799033`. Siguen pendientes roles no Explorer en Pi, recibos de todo el CI/Release Gate exact-SHA, paridad A/B y conteo HTTP autenticado; no atribuir la reserva a una llamada HTTP observada.
- [ ] EF-604 Recuperación tras reinicio, estado incierto y preguntas del hijo sin permiso inventado. **PARCIAL:** Journal multiproceso y recibos exact-SHA de Pi 1.2 de terminación forzada/reapertura de TUI pasaron en `8d1859bd2edda5e6a39fb7e7681fdba68119d93b`, aceptación `41933062639`: host Pi nativo reiniciado con identidad durable y avisos `attempted/pending`, más padre TUI SIGKILL con Pi RPC hijo vivo, cero inferencias y cero replay. También existe interrupción Beam RPC + reapertura separada `1b5f1e4358a2032c1f97fe19ccc1b89693743566`. Siguen faltando crash del TUI durante inferencia real, reactivación/consumo del aviso después de reinicio, decisión humana y paridad A/B.
- **Gate:** C13–C15 y C18.

### F7 — Validación real y cierre

- [ ] EF-701 Comparar C01–C20 con snapshots A/B y ASEN final; no heredar recibos entre SHAs. **BLOQUEADO:** Inventario C01–C20 con 60 slots y arranque real A/B `--help` PASS en `41810325787` / `cd114cb`; el reporte fuente conserva `executedCases:0`, `evidenceCaptured:0`, `casesBlocked:20`. Faltan 40 trazas de referencia, 20 de ASEN, host B provisionado y revisión independiente.
- [ ] EF-702 Probar selección de modelos reales gratuitos, error de cuota/red y consumo por agente. **PARCIAL:** Cinco inferencias Beam de cinco roles PASS `41783370317`; Pi hijo RPC y padre TUI reales PASS `41798018569` / `616d2655`. Esta macrotanda añade clasificación de errores de cuota sin filtrar texto de proveedor a recibos, pendiente de CI exact-SHA. Faltan agotamiento real de cuota/red, recuperación por rol y condiciones futuras de gratuidad.
- [ ] EF-703 Verificar tres OS, suite global, permisos, Pi interactivo, Writer, revisión, eventos y recuperación. **PARCIAL:** Padre/hijo Pi con Beam PASS real (`41798018569`). El fallo de copia T09 Windows quedó resuelto: Release Gate `41810333053` / SHA `cd114cb` 3/3 PASS. La suite completa Windows del SHA anterior `a75fbf3` detectó por separado un riesgo de identidad de archivo reemplazado en el candado de mantenimiento, que se corrige en esta tanda; queda pendiente CI exact-SHA de la corrección. Faltan Writer humano, recuperación de proveedor, A/B C01–C20 y revisor externo independiente.
- [ ] EF-704 Auditoría final de diferencias. Solo cambiar estado a **FULL** cuando todos los gates anteriores y S01–S11 estén satisfechos. **BLOQUEADO:** S01–S11, C01–C20 y auditoría final aún sin cerrar.
- **Gate:** C01–C20 PASS obligatorios y ninguna diferencia esencial pendiente.

**Resumen del plan:** 8/28 EF marcados como verificados en su alcance concreto; 20 siguen abiertos. Los checks no certifican FULL ni equivalencia C01–C20.

### FUI — Paridad de interfaz con Gentle Shell v4.6.0 (tareas nuevas)

**Son tareas ejecutables separadas y no hacen check de EF por sí mismas.** Referencia/detalles/criterios en [especificación UI](gentle-shell-v4.6.0-paridad-ui-odd.md#6-tareas-ui-nuevas-y-sus-dependencias-checks-separados-de-ef). Estado inicial: todas pendientes; no se han implementado al editar este documento. Respetar no merge a main sin autorización.

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

**Megatandas:** M1 contratos de render/estado/TODO/panel; M2 agentes/Jobs/parent-child; M3 Git/Review/Writer; M4 perfil/fallback/instalador; M5 tests C01–C20 + UI-C01–UI-C24 y auditoría independiente. Conservar los gates existentes para evitar rebajar seguridad. R4 automática no sustituye independiente.

**Bloqueador anterior a esta actualización:** CI y aceptación exact-SHA de §984d867§ FAIL (fixture de journal y ECO-06 Windows); Release Gate, F5 y otros controles PASS. Actualizar el ODD NO corrige ese runtime. Registrar diferencias y priorizar correcciones con Git aislado al reanudar implementación. FULL=false.

## Estrategia de tandas grandes y CI

| Entrega | Alcance | Regla de publicación |
| --- | --- | --- |
| B0 — Preparación | F0, ODD y corrección de fallos conocidos | Un commit agrupado y validación exact-SHA |
| A — Orquestación | F1 + F2 + F6 | Un CI después del conjunto de cambios, no por microtarea |
| B — Cinco roles | F3 + F4 + F5 | Pruebas locales por unidad y CI consolidado de la tanda |
| C — FULL | F7 + ajustes finales | Aceptación real y matriz exact-SHA final |

El CI global puede durar ~30 minutos; no relanzarlo tras cada pequeño avance. Reconciliar HEAD remoto antes de publicar con `expected_sha`; avanzar en trabajo independiente sin esperar un Release Gate lento, pero no decir PASS hasta que termine. No fusionar main sin permiso.

## Control de seguridad y estado

- Reutilizar código/contratos existentes en vez de crear otra arquitectura o copiar ciegamente fuentes externas. Conservar candados de Writer y revisión, datos de proyecto, memoria, permisos y recuperación.
- Modelos de pago, APIs externas, cambios en producción, merges, releases y acciones destructivas requieren autorización propia; el objetivo FULL no es un consentimiento global para ellos.
- Describir cada hallazgo como PASS/FAIL/BLOCKED/PENDING/OUT_OF_SCOPE_APPROVED, con evidencia observada, modelo/versión/fecha, comando y SHA. Las exclusiones de requisitos esenciales impiden FULL integral.
- La autoauditoría del PR está admitida solamente como `SELF_AUDIT_ONLY / NOT independent`; no declara revisión independiente funcional.
- Actualizar este ODD después de cada tanda; si cambia el código, volver a ejecutar los checks afectados. Un checkbox sin evidencia no cierra nada.

## Log

- **2026-11-03 — Inicio:** orden del usuario de preservar este plan y evolucionar hasta FULL. Auditoría fuente/código completada; se ha preparado la matriz, no la comparación de ejecución real.
- **2026-11-03 — Baseline CI:** en el SHA `aeea0505`, el run `41651668587` dio FAIL en los tres OS por dos pruebas de confirmación. El run `41651658407` de aceptación funcional sin proveedor dio PASS con el job real SKIPPED. Gate R4 es SELF_AUDIT_ONLY.
- **2026-11-03 — B0 preparada:** fallo de modo Normal sin getter, error del cuadro de confirmación tragado y revocación por epoch identificados; corrección y prueba añadidas junto con este ODD. Estado de la corrección **PENDING exact-SHA CI**, no PASS.
- **Siguiente bloque:** validar B0 y ejecutar EF-002/003; construir primero el despertar real y la selección de rutas antes de declarar a los agentes equivalentes.

## Tanda A1 — agrupación de cambios funcionales (2026-11-03)

Estado **IMPLEMENTED_PENDING_CI**, no FULL. Cambios previstos en el mismo commit exact-SHA que esta entrada:

- **EF-601 / C13 — reactivación por eventos.** El resultado de un agente terminal se entrega al Pi principal mediante `sendMessage` con `triggerTurn:true` y `deliverAs:"followUp"` **solo** si hay sesión interactiva TUI autenticada y coincidente. Cuando el padre está activo, `followUp` espera a que termine; cuando está inactivo, puede iniciar un nuevo turno de Pi. RPC/headless sigue sin activar inferencia automática. Un resultado de un Todo enlazado se notifica también tras reconciliar/avanzar el plan. Si el plan ya inició otra unidad, se informa sin reactivar el padre de forma redundante. La carga es dato no confiable, no autorización; el estado de entrega sigue `enqueued`, nunca `delivered` sin acuse.
- **EF-603 / C14 — coalescencia de Explorer activo.** Para Explorer ad-hoc de solo lectura y sin vínculo a Todo, el Runtime calcula una clave exacta de rol, instrucción, sesión, proyecto, modelo y esfuerzo. El almacén persistente, bajo bloqueo exclusivo, reutiliza el ID si existe un trabajo idéntico `queued/running`; no crea un segundo proceso. Trabajos de distinto proyecto, sesión, modelo o instrucción son diferentes. Nunca se reutilizan resultados terminales ni se reanudan tareas `interrupted`; Writer, revisores y agentes planificados conservan su identidad independiente. No se afirma deduplicación semántica general de peticiones expresadas de otro modo.
- **EF-401 / C09–C10 — verificación selectiva.** La ruta `verification` explícita sigue lanzando Verifier. El orquestador deja de añadir Verifier a toda ejecución de revisión de bajo/medio riesgo. Solo añade Verifier independiente al trabajo `incident` cuando `verification===independent`. La revisión explícita del candidato permanece; las pruebas RED/GREEN del Writer no sustituyen las pruebas independientes cuando sean necesarias.
- **EF-202 / C03 — guía de exploración proporcional.** El skill Explorer deja de imponer un umbral fijo por cantidad de archivos. Ahora establece un límite inicial de tres consultas enfocadas o 40 KiB observados antes de recomendar una delegación única cuando haga falta seguir investigando. Es orientación comprobable; todavía falta instrumentar mediciones reales en el coordinador y compararlas con A.
- **F7 — evidencias.** Nuevas pruebas de coalescencia dentro de un proceso y dos instancias de almacén bajo bloqueo, excepción de contexto de proyecto/modelo, cierre/reinicio, ausencia de reanudación implícita, mensajes de resultado, reactivación TUI, y Verifier condicionado al riesgo. Se incorporan a la aceptación sin proveedor y a la CI general. Los tests con runner simulado no cuentan como prueba de proveedor Pi real.

**Cierre parcial requerido:** ejecutar typecheck, test de orquestación, prueba del almacén, prueba de notificación y regresiones de la nueva entrega en el SHA de publicación. Corregir fallos en tanda consolidada; registrar los CI exactos. `EF-601` no será FULL mientras no se pruebe un turno Pi real iniciado desde estado inactivo. `EF-603` no será FULL mientras no cubra tareas semánticamente equivalentes planificadas y escenarios de varios procesos. `EF-401` no será FULL sin verificar el comportamiento de referencia sobre los mismos riesgos. Los veinte casos siguen PENDING/BLOCKED según sus pruebas, no se marcan PASS preventivamente.

**Siguiente tanda de trabajo:** extender la comparación ejecutable de rutas y Explorer sobre telemetría real, completar entrega/acuse de resultados que sobreviva a reinicios sin duplicar efectos, y avanzar Writer/Reviewer con aceptación real después de cerrar estas regresiones.

### Tanda A1 — ajuste de prueba de aceptación (2026-11-03)

- `1f59a6a` logró typecheck, build y pruebas focalizadas de F2/F3/F5, así como recuperación F6. La nueva prueba integrada EF-603 quedó `cancelledByParent`, no por una duplicación observada sino porque el fixture esperaba que el segundo runner se iniciara antes de liberar el primero y esperaba el resultado de una sesión ajena en la sesión activa.
- El test ahora libera el runner de la sesión original, observa exactamente su notificación, comprueba que comienza la unidad de la otra sesión cuando hay un slot disponible, y libera su trabajo sin exigir la entrega de mensajes de otra sesión. Se conserva la aserción de que dos intentos concurrentes idénticos reciben el mismo ID y solo uno ejecuta la tarea.
- La corrección no equivale a probar reinicio Pi real, entrega reconocida ni deduplicación semántica general. El estado del ODD sigue `IN_PROGRESS`, todos los criterios pendientes de paridad real continúan abiertos.

### Tanda A1 — reconciliación de contratos completos (2026-11-03)

- La aceptación T12 sin proveedor de SHA `bc7fc8a` pasó. En cambio `R4` automático (`41661863290`), `Release Gate` (`41661863232`) y la suite completa Windows (`41661863336`) expusieron pruebas de integración/paquetizado que todavía exigían Verifier para un caso de riesgo medio con revisión dual. No son errores de Ollama ni pruebas de que haya un Verifier real funcionando.
- Se reconciliaron los mismos casos de tres tareas (Writer + dos Reviewers) en `tests/extension-runtime-commands.test.ts`, `tests/extension-state-commands.test.ts`, `tests/instruction-triage.test.ts` y `scripts/verify-pi-package.mjs`, conservando sus dependencias y comprobaciones de no ejecución sin autorización. Las pruebas de verificación explícita y de incidente de riesgo alto continúan esperando Verifier independiente.
- Las correcciones de pruebas se hacen porque el contrato intencionado ahora es proporcional al riesgo; no se han eliminado permisos ni se ha declarado innecesaria una verificación de riesgo alto. La aceptación definitiva requiere reejecutar todos los gates de los tres sistemas sobre el SHA nuevo.
- Estado global **PARTIAL**: el objetivo FULL sigue condicionado a los escenarios C01-C20, pruebas reales de Pi y los cinco roles, despertar confirmado, Writer con consentimiento y comparación contra la referencia congelada.

## Tanda consolidada EF-101 + EF-401 + EF-601 + F0 (2026-11-03)

**Estado: PENDING exact-SHA CI; FULL NO ALCANZADO.** Baseline verificada antes de esta tanda: PR #45 HEAD `766fa4b602f4bc8933f87d2b496e69735aa7a4c5`. Los controles Arquitectura, Release Gate, F5, R4 automático, Pi Runtime, CodeGraph y aceptación T12 sin proveedor dieron PASS; **la suite CI general dio FAIL en los tres sistemas** (run `41663079512`) por cuatro regresiones comunes de expectativas antiguas, no por evidencia de que Verifier faltara en una situación de alto riesgo.

### Auditoría F0 del CI y decisiones quirúrgicas

- `tests/natural-plan-tool.test.ts`: dos pruebas esperaban un cuarto agente Verifier para una revisión `dual_explicit` de riesgo medio. La política vigente, y la verificación proporcional pretendida, solo requieren Worker y dos Reviewers; los tests deben reflejar esa decisión sin rebajar riesgo alto.
- `tests/orchestrator-dispatcher-integration.test.ts`: la prueba decía cubrir la presencia de Explorer, Reviewer y Verifier en un incidente, pero no incluía ninguna operación de riesgo alto. Se añade `security_boundary` **a ese fixture concreto**, que pasa a verificar realmente la presencia de Verifier independiente y que ningún agente de lectura recibe autoridad de escritura.
- `tests/functional-role-parity-matrix.test.ts`: nueva matriz semántica que ejerce ruta pequeña directa, planificación ante alcance incierto, dos jueces sin Verifier en riesgo medio, incidente alto con Explorer/Reviewer/Verifier, verificación explícita sin Writer y revisión doble de bajo riesgo. Son pruebas deterministas del comportamiento ASEN; **no** sustituyen la ejecución A/B.
- `src/runtime/agent-terminal-delivery.ts`: se acota a 1200 caracteres el resumen de un agente y se eliminan secuencias ANSI y controles para evitar desbordar la reactivación del coordinador con salida no confiable. El resultado completo continúa en el almacén duradero; nunca se pierde el ID del agente ni se convierte su texto en consentimiento.
- `tests/agent-terminal-delivery.test.ts`: escenarios de resumen enorme, controles de terminal y persistencia del enlace a la tarea. La salida se etiqueta expresamente como dato no confiable, no nueva instrucción.
- `.github/workflows/asen-real-agent-acceptance.yml`: añadir las pruebas funcionales de Planner y Verifier al gate sin proveedor de la misma revisión antes de cualquier inferencia real.

### Correspondencia con el ODD

| Unidad | Avance técnico de esta tanda | Estado admisible |
| --- | --- | --- |
| EF-001 | Corrección previa de control de confirmaciones y test de caducidad existente en HEAD | PASS focal histórico; verificar CI nuevo |
| EF-101 | C01/C04/C05: selección proporcional, seis escenarios ASEN | PARTIAL: referencia A/B no ejecutada |
| EF-401 | C09/C10: medium no Verifier, high incidente exige uno, test de no acceso a Writer | PARTIAL: falta prueba Pi real |
| EF-601 | C13/C14: acotar la carga no confiable de una notificación de finalización | PARTIAL: falta despertar Pi real y acuse |
| EF-701 | Gate sin proveedor reforzado para rutas reales | PARTIAL: falta aceptación de referencia y proveedor |

**Restricciones:** no alterar permisos de Writer, ni activar inferencia de proveedores reales, ni proclamar C01–C20 PASS sin recibo. R4 sigue `SELF_AUDIT_ONLY / NOT independent`. Un CI verde futuro no es FULL funcional. No fusionar `main`. Preparar siguientes bloques grandes EF-102/103/201–203/602–604 y después Writer/Verifier/Reviewer con sus pruebas reales.

## Tanda EF-003 — comparador de observables (2026-11-03)

**Estado: IMPLEMENTED_PENDING_EXACT_SHA_CI; FULL NO ALCANZADO.** Se incorpora `scripts/agent-observable-parity.mjs`, una herramienta de lectura que compara rutas, roles, restricciones, comprobaciones, notificaciones y efectos (no respuestas libres). El conjunto de aceptación continúa siendo C01–C20 y las referencias congeladas A/B de este ODD.

- Captura: JSON `asen-agent-observable-v1`, objeto con `subject` (`reference` o `asen`) y `cases`, cada caso con `id`, `source`, `sha`, `execution`, `environment`, `model`, `receipt` y `trace`. El `trace` exige exactamente seis campos: `route`, `roles`, `guards`, `checks`, `notifications`, `effects`; solo permite valores de control limitados. El campo `receipt` es un localizador de evidencia para auditoría, no prueba automática de autenticidad.
- Uso en entorno aislado, con capturas reales ya obtenidas: `node scripts/agent-observable-parity.mjs <reference.json> <asen.json> <sha-candidato-exacto>`. Presenta MATCH/FAIL/BLOCKED para cada C y sale con código no cero si falta evidencia o hay diferencias. Una coincidencia necesita verificar recibos externos; el programa **siempre devuelve globalFull:false**.
- Rechaza esquemas ajenos, casos repetidos/extraños, trazas mal formadas y reutilización de SHA; la evidencia estática o simulada queda BLOCKED aunque coincida en contenido. No se crean capturas A/B ni se atribuyen ejecuciones reales inexistentes.
- Prueba local focal de siete escenarios en Node 22.16.0: 7/7 PASS con `node --experimental-strip-types --test tests/agent-observable-parity.test.ts`. La nueva prueba se integra en la aceptación sin proveedor. El typecheck y CI remoto exact-SHA **aún no están certificados**.
- **EF-003: código implementado, aceptación remota pendiente. EF-002: BLOCKED hasta obtener observaciones reales A/B.** Los escenarios C01–C20 permanecen PENDING/BLOCKED y no se transforma ningún MATCH de fixture en FULL.

**Siguiente bloque:** captura auténtica A/B + ASEN, comparación por escenario y recibos verificados; proseguir F1/F2/F6 (continuidad, presupuesto de Explorer y acuse tras reinicio) y después F3/F4/F5 con Writer interactivo. Sin merge a `main`, sin gasto de modelos.

### EF-003 — corrección de transcripción de la prueba (2026-11-03)

- La primera publicación `9bd7d94` falló en el paso **Typecheck** de la aceptación sin proveedor, run `41670537262`, por una línea mal transcrita en `tests/agent-observable-parity.test.ts` (TS1005/TS1127/TS1002). Era un error sintáctico del test, no un resultado de equivalencia.
- Se restablecen los dos asserts de rechazo de rol desconocido y token con salto de línea, conservando el comparador y sus siete escenarios. Pendiente resultado CI exact-SHA de esta corrección; no calificar aún PASS ni FULL.

## Tanda F6 — EF-601/602: notificaciones protegidas y sin repetición (2026-11-03)

**Estado: IMPLEMENTED_PENDING_EXACT_SHA_CI; FULL NO ALCANZADO.**

- `SessionNotificationBus` conserva la identidad de un aviso reconocido hasta su TTL: la misma notificación terminal no reaparece después del acuse. Los registros reconocidos caducan y siguen contando en la capacidad en memoria hasta entonces; la saturación falla cerrada y nunca elimina una identidad consumida para aceptar una repetición.
- Se rechazan separadores de clave y caracteres de control en identificadores de sesión, tipo y origen, evitando suplantación de particiones. Los mensajes siguen admitiendo texto multilínea acotado.
- `agentTerminalContinuationMessage` elimina controles ANSI CSI/OSC, formatos Unicode y saltos de línea de datos del hijo; resume a 1200 puntos de código y encapsula el resultado en texto JSON etiquetado como no confiable. No se concede autoridad de Writer ni se cambia el criterio para reactivar Pi.
- Se añaden regresiones de reenvío tras acuse, capacidad/expiración, aislamiento de identidades y carga maliciosa del agente. En entorno local aislado, seis pruebas focales de Node comprobaron los contratos equivalentes (6/6 PASS); las suites de ASEN y los CI de GitHub quedan pendientes del SHA de publicación.
- **EF-601/602: PARTIAL**. No se ha demostrado aún acuse duradero ni despertar del padre Pi real tras reinicio. Esta corrección actúa sobre el bus efímero de presentación y sobre el mensaje entregado; no sustituye el almacén persistente de resultados.
- El comparador EF-003 de la tanda anterior recibió aceptación sin proveedor PASS sobre `5d9eaf8` (run `41670808497`); la suite CI completa y Release Gate deben verificarse por separado en el nuevo SHA. Los casos C13–C15 no se declaran equivalentes a A/B sin ejecución real.

**Siguiente bloque:** registrar/validar acuse persistente de agente y recuperar resultados bajo identidad de sesión/proyecto, sin reejecutar efectos inciertos; EF-201/202 presupuestos reales de Explorer; EF-102/103 reanudación exacta de ODD; luego Writer/Reviewer/Verifier auténticos.

## Tanda F2 — EF-202: presupuesto de Explorer observado (2026-11-03)

**Estado: IMPLEMENTED_PENDING_EXACT_SHA_CI, FULL NO ALCANZADO.**

- Telemetría `ExplorerBudgetTelemetry` para herramientas de lectura conocidas (`read`, `grep`, `find`, `ls`, `codegraph`, `asen_code_intelligence`, `web_search`, `web_fetch`), deduplicadas por `toolCallId`. Mide bytes UTF-8 de los bloques de texto observados, pero no almacena contenidos de herramientas.
- Los umbrales del ODD son **más de tres consultas o más de 40 KiB**. Si una lectura supera el presupuesto, el Pi anfitrión recomienda una sola delegación Explorer de solo lectura *si todavía falta investigar*. No ejecuta modelos, no lanza agentes y no concede permisos. El estado se reinicia en cada inicio/cierre de sesión, y la identidad de sesión/proyecto se valida después de la consulta asíncrona.
- Se añaden seis pruebas focales del medidor y una prueba de eventos Pi de no gasto/no notificación cruzada. El test de integración EF-202 y la prueba unitaria están incluidos en aceptación sin proveedor. En entorno Node aislado pasaron los seis tests unitarios equivalentes; no se declara todavía PASS de typecheck general ni de CI sobre el SHA final.
- **EF-202: PARTIAL**. No prueba todavía la necesidad real de delegación, las consultas hechas mediante herramientas no instrumentadas, ni el orden CodeGraph-first cuando no está disponible. Tampoco acredita comportamiento A/B ni Pi con proveedor real.

**Siguiente:** EF-102/103 para ODD persistente y reanudación, EF-601/604 para acuse duradero y recuperación tras reinicio, y observaciones reales C01–C20 antes de afirmar FULL.

### Control de aceptación F6 y criterio de cierre

Se ejecutan los dos nuevos tests EF-604 integrados con el anfitrión Pi de prueba junto con EF-601/603/202. El journal **no confirma consumo**: `attempted` y `enqueued` permanecen diferenciados para evitar duplicados y falsas garantías. C13–C15/C18 siguen exigiendo evidencias Pi real, proceso real y comparación con referencia. No se usan modelos pagados ni se hace merge a `main`.

**Próximos bloqueos externos para FULL:** snapshots genuinos de A/B sobre C01–C20, proveedor gratuito autenticado y su cuota, consentimiento Writer interactivo, recuperación con proceso real, revisión independiente de riesgo y CI exact-SHA en tres OS. No promocionar ninguna unidad por pruebas con mocks.

## Macrotanda F6 — EF-601/602/604: paridad del enrutador ocupado/inactivo y CI integral (2026-11-03)

**Estado: CODE_READY / PENDING_EXACT_SHA_CI. FULL NO ALCANZADO.** Se consolida el cambio en una publicación para no multiplicar CI de tres sistemas.

### Diagnóstico reproducible del SHA precedente

- CI general `41684034554` del SHA `11aab4e`: falla en Ubuntu/macOS/Windows aunque arquitectura, F5, Release Gate, Pi Runtime, CodeGraph y aceptación funcional sin proveedor eran PASS.
- Tres defectos de la misma integración `tests/pi-agent-runtime.test.ts`: línea 184 invocaba solo el primer listener de `tool_execution_end` y dejaba la barra de validación en `Comprobando`; línea 525 esperaba un ID visible antiguo en lugar del hash estable del journal; línea 532 esperaba el aviso de error antiguo, provocando timeout.
- Corrección: los finales de herramientas pasan por **todos** los observadores registrados; los asserts verifican formato de hash, semántica de fallo incierto y protección del resultado duradero. No se desactiva ninguna prueba ni se maquilla una falla del proveedor.
- El siguiente CI deberá demostrar suite global completa con esas tres regresiones solucionadas en las tres plataformas, además de preservar los gates ya verdes. Cualquier FAIL restante mantiene el estado PARTIAL.

### Semántica F6 aplicada

- Contrato de referencia A inspeccionado directamente en la baseline `813ec110`, módulo de agentes de la referencia líneas 1162–1189 y 1209–1259: padre ejecutando recibe `steer + triggerTurn:true`; padre inactivo recibe contenido encolado `triggerTurn:false` y un wake separado; ocupado sin turno del modelo retiene hasta un límite de ciclo. No se ha ejecutado aún la referencia en vivo ni la referencia B.
- ASEN adopta ese criterio mediante `agentParentRoute` y `agentTerminalWakeOptions`. El contexto Pi `isIdle()`, el estado `agent_start`/`agent_settled`, `turn_end` y los límites de compactación determinan la entrega. Sin identidad TUI válida, no se inicia otro turno. No hay sondeo de estado ni reejecución de agentes por una señal de wake.
- El journal `AgentNotificationJournal` sigue siendo el árbitro de deduplicación: en `hold` la entrada queda `pending`, y una frontera de turno solo puede entregar tras consultar de nuevo el estado terminal verdadero y comprobar la sesión y el proyecto. Nunca se recupera `attempted` automáticamente ni se reenvía una entrada `enqueued`.
- Para padres inactivos, el mensaje de resultados se encola y confirma **antes** de programar un único wake oculto, consolidado por ráfaga. Un wake se identifica como mensaje generado por ASEN, sin permisos ni supuesto consentimiento humano. Un fallo de wake conserva el resultado consultable; no lo reinyecta ni simula un acuse.
- Nuevas pruebas: rutas puras `run/idle/hold/headless` y tres integraciones Pi TUI simuladas (padre activo, inactivo y compactación). Son pruebas con host instrumentado y runner simulado: **no prueban** todavía que un Pi real acepte y procese el wake, ni demuestran consumo, reinicio de proceso real o paridad total.

### Gate y próximos cierres

- Aceptación requerida: `node --import tsx --test --test-name-pattern='EF-601|EF-603|EF-202|EF-604' tests/pi-agent-runtime.test.ts`, suite completa Ubuntu/Windows/macOS, Typecheck, Build, F5, arquitectura, Release Gate y R4 `SELF_AUDIT_ONLY / NOT independent`.
- Pendientes FULL: EF-002 observaciones A/B genuinas C01–C20, EF-102/103 continuidad ODD revisada, EF-201/203 Explorer con fuentes reales, EF-301–304 Writer con autorización TUI auténtica, EF-402–503 revisión/verificación real, EF-601 wake Pi real bajo padre activo e inactivo, EF-702 proveedor gratuito autorizado y recibos exact-SHA finales. **Ningún mock promociona C13/C15/C19/C20 a PASS.**

### Ajustes de integración de la tanda

El SHA inicial de esta tanda detectó dos rechazos reales de gates: TypeScript `TS2379` al pasar una propiedad opcional con `undefined` explícito en un fixture, y rechazo por la política de no introducir nombres de procedencia externos fuera de los manifiestos. Se corrige el fixture construyendo un contexto sin esa propiedad; el ODD conserva las líneas y SHA de referencia sin el literal prohibido. Estas correcciones no prueban FULL ni cambian los permisos de ejecución.

### CI de F6 — sustitución de expectativa `followUp` obsoleta

La aceptación funcional del commit `f72a2c0` superó Typecheck y las tres nuevas pruebas Pi TUI de enrutamiento, pero otra prueba `EF-601` todavía exigía `followUp`. Se mantiene la prueba y se actualiza a la semántica S07: resultado primero encolado, wake separado con `steer`, una sola vez y sin acuse de consumo ficticio. Se limpia también la sesión de prueba. Falta confirmar el CI completo exact-SHA; no promocionar a FULL.

### Extensión de F1: materializador de planes y recibos de referencia

El cambio de protección se aplica también al **origen**: `materializeExecutablePlan` propaga `candidateRevision` desde los agentes de la ruta ODD para Explorer, Reviewer y Verifier. De este modo la comprobación de HEAD del despachador no depende de que un tercero construya manualmente el metadato. Se añaden dos pruebas usando decisiones ODD auténticas, una ruta con dos revisores y otra con Verifier explícito. No se reconstruye una revisión candidata si ha cambiado la rama: se bloquea la unidad y se solicita volver a planificar.

El workflow sin proveedor incluye ahora las pruebas de ODD persistente y tres regresiones de candidato caducado, la vista de dependencias bloqueadas, la propagación del materializador y el evento Pi EF-201. Todas deben cerrar en el **mismo SHA de publicación**, sin reclamar FULL por un fixture.

### Corrección de compilación exact-SHA

La primera ejecución `41693250792` del SHA `af26679` rechazó TypeScript `TS2345`: el tipo inferido para `flatMap` solo aceptaba `missing`, aunque las dependencias pueden tener cualquier `TaskState`. Se añade `<{id:string;state:string}>` al `flatMap` sin cambiar la lógica, los datos persistidos ni las pruebas de bloqueo. La aceptación de la nueva revisión queda pendiente del siguiente CI.

## Macrotanda F4/F5 — aceptación humana verificable de Reviewer/Verifier (2026-11-03)

**IMPLEMENTADO / CI DEL SHA EXACTO PENDIENTE — ESTADO GLOBAL PARTIAL, NO FULL.**

- Se incorpora el comando interactivo `/asen-accept-review <todo-id>` en el catálogo de Pi, separado de `/asen-review`. No es una herramienta invocable por el modelo y no funciona en RPC/headless: exige TUI activa, sesión y proyecto idénticos, `ui.confirm` humano y autorización de un solo uso. No acepta un Writer y **no autoriza escritura ni merge**.
- El nuevo verificador `acceptIndependentReview` exige un Todo de Reviewer/Verifier realmente bloqueado por su resultado terminal, `candidateRevision` persistido, un único enlace durable y un registro de agente completado autenticado desde `AgentRuntime.query` para la misma sesión/proyecto/rol. El dictamen JSON contiene únicamente `verdict` y `evidence` y debe ser `pass` con hallazgos no vacíos; los fallos, estructuras inesperadas, texto libre con controles terminales, duplicación de claves y evidencia excesiva bloquean.
- Antes de la autorización y dentro del cierre se verifica Git HEAD exacto y árbol/índice sin cambios. Cualquier modificación en el diálogo, cambio de sesión o cambio del resultado invalida la aprobación. Un resultado declarado `pass` por el modelo **no se convierte en aceptación automática ni demuestra que el hallazgo es verdadero**: se presenta al usuario para juicio explícito.
- `SessionTodoStore.acceptReviewedTask` ejecuta la confirmación en una única transacción con bloqueo entre procesos y control de instantánea CAS. Registra `blocked→running→done` como transiciones auditables del acto humano (sin reejecutar el agente), valida dependencias y se niega a escribir si el evento/plan cambió. Dos confirmaciones concurrentes no pueden registrar dos aceptaciones.
- Se añaden pruebas de veredicto, formato e inyección; Reviewer y Verifier con almacenes reales, dos confirmaciones simultáneas, denegación, fallo de dictamen, SHA caducado, árbol alterado durante el diálogo, vínculo inexistente y cierre de interfaz interrumpido. El gate sin proveedor las ejecuta junto con todas las pruebas F1–F6 existentes.
- **Límite reconocido:** este comando habilita continuar desde una revisión *realmente completada y aprobada* de un commit congelado, pero aún no demuestra el criterio FULL de equivalencia A/B, ni suple una auditoría independiente ni fabrica firma o consentimiento Writer. Cuando el Worker cambió HEAD, la revisión basada en la revisión antigua se bloquea; hay que preparar una nueva revisión sobre el candidato actual, no rebautizarla silenciosamente. Las verificaciones reales de los cinco roles y C01–C20 siguen pendientes.

### Criterio de aceptación de esta macrotanda

Aceptar únicamente tras typecheck, tests unitarios y de integración del comando y del journal, suite global Windows/Ubuntu/macOS, los gates de seguridad, Release Gate y el mismo SHA en CI. Ollama Cloud omitido y R4 autoauditoría NO independiente mantienen FULL bloqueado aunque todos los tests sin proveedor estén verdes.

### Ajuste TS estricto de la aceptación interactiva

La primera ejecución del commit `0ec8234` rechazó `TS2322/TS2345` por inferencia amplia de `phase` en el fixture de Reviewer/Verifier. Se anota `selection: SkillSelectionContext` en el test de integración; no se modifican verificadores, permisos, journal ni límites de aceptación. Queda pendiente comprobar el siguiente CI exact-SHA.

### CI global: inventario público de comandos

La ejecución completa `41696159173` del SHA `2ea767e` detectó un rechazo en `tests/command-catalog.test.ts`: la lista estática esperada no incluía `asen-accept-review`. Se incorpora el comando en su posición alfabética sin eliminar el control de unicidad, la comprobación de comandos ausentes ni la lista de comandos implementados. El tipo, la lógica de autorización y el almacenamiento permanecen intactos. Confirmar el nuevo SHA antes de cerrar el gate de tres sistemas.

### EF-603 — cierre ordenado de procesos en la prueba de coalescencia

La aceptación sin proveedor del SHA `28906cb` falló en el hook de limpieza de un test que había validado el ID de dos Explorer idénticos: `ENOTEMPTY` borrando `.asen` antes de terminar la persistencia del agente de otra sesión. Se corrige el fixture para cerrar primero ambas sesiones con sus hooks Pi y eliminar después la raíz aislada con reintentos finitos. No se añaden sleeps de ejecución ni sondeo de agentes, no se cambia el sistema productivo y la prueba sigue exigiendo identidad/de-duplicación correctas.

## F7 — reparación de la adquisición congelada y CLI de comparación C01–C20 (2026-11-03)

**Estado: IMPLEMENTADO / CI exact-SHA pendiente. Nunca proclamar FULL por esta reparación.**

- Baseline del incidente: en el CI general del SHA `1fb27dd`, Ubuntu abortó `Prepare frozen ecosystem Git objects` por HTTP 403 del endpoint de búsqueda pública `search/commits`. Los gates de Arquitectura, Release Gate, Pi Runtime, F5, CodeGraph, R4 automatizado y aceptación funcional sin proveedor de ese SHA eran PASS. El error observado es de adquisición de procedencia, no prueba de divergencia de comportamiento.
- Se ha **verificado de manera independiente la identidad del origen** con lectura de objetos Git de GitHub: repositorio de procedencia ya declarado en `registry/parity/skill-sources-v1.json`, commit `08de420ca29be16b6f6bee725a30b599b061df16` y árbol `9af648106ed75fa270476e9d474bad93aa38af6b`, que coincide con el manifiesto de `registry/parity/ecosystem-sources-v1.json`. No se cambia la referencia.
- El preparador `.github/scripts/prepare-frozen-ecosystem-baseline.mjs` ya no busca commits usando la API pública ni depende de cuotas de búsqueda: comprueba que los dos manifiestos rastreados coinciden, verifica que la fuente tiene formato `owner/repo`, obtiene **únicamente** el SHA congelado mediante `git fetch --no-tags --depth=1`, y comprueba de nuevo `FETCH_HEAD`, el tipo `commit` y el hash exacto de su árbol. No hace checkout del código externo ni exporta la variable de evidencias si existe una discrepancia.
- Tests F7 nuevos: concordancia de manifiestos, rechazo de fuente/revisión manipulada, construcción del comando Git exacto sin búsqueda web, rechazo de SHA/tree no coincidentes y prohibición de publicar una ruta de evidencia inválida; incluidos en gate funcional sin proveedor y en la suite general. No hacen solicitudes de red en CI al evaluar las pruebas.
- En EF-003 se corrige la ruta CLI `process.argv.length` (un error previo de nombre de propiedad impedía invocar el comparador correctamente). Se añade una prueba que ejecuta Node como proceso real con JSON A/ASEN de muestra: 1 caso alineado y 19 faltantes deben dar exit 1, `globalFull=false`; número de parámetros incorrecto debe fallar con uso explícito. **El comparador sigue sin certificar FULL**, incluso con 20 coincidencias, mientras no haya recibos auténticos auditados.

**Siguientes requisitos para FULL:** CI completo exact-SHA Linux/Windows/macOS; matrices A/B capturadas por ejecución real en las referencias; recibos verificables C01–C20; Provider gratuito real con credenciales y autorización; consentimiento Writer en Pi real; acuse genuino del coordinador; cierre R4 `SELF_AUDIT_ONLY` claramente diferenciado de revisión independiente. La reparación de un 403 y los tests sin proveedor **no sustituyen** ninguna evidencia de ejecución del proveedor.

### Validación F7 — diferencia entre formato y autenticidad del árbol (2026-11-03)

El primer gate funcional del SHA `9cc7fb0` mostró una prueba negativa mal planteada: esperaba que un digest de 40 caracteres válido sintácticamente fuera rechazado **antes** de descargar su árbol. El validador de manifiestos comprueba formato y coincidencia de commits entre documentos; la comprobación de autenticidad del árbol se hace **después de** `git fetch`. Se corrige el fixture a un valor de formato inválido y se mantiene intacta la prueba que simula un árbol Git incorrecto y exige rechazo sin exportar la ruta de evidencia. No se reduce la verificación de procedencia ni se declara FULL.


## Reconciliación del plan ejecutable (2026-11-03)

- Se marcaron 7 EF con código, pruebas y una ejecución de CI satisfactoria que corresponde al alcance específico. No se extrapola un PASS de tests simulados a equivalencia de proveedor auténtico.
- Los otros 21 siguen `[ ]`, diferenciando `PARCIAL` de `BLOQUEADO`, con el motivo de cierre visible en cada tarea.
- La nueva auditoría del checklist impedirá comprobar un EF sin ruta de código, ruta de prueba y CI exact-SHA; no sustituye la autenticidad de una evidencia real A/B ni cierra el gate F7.
- La autoauditoría R4 y la aceptación sin proveedor no equivalen a independencia ni a ejecución de modelos reales.

## Macrotanda F7/F6/F0 — evidencias A/B/ASEN, concurrencia y confirmación Pi (2026-11-03)

**Estado de publicación: IMPLEMENTED_PENDING_EXACT_SHA_CI; FULL NO.** Alcance: EF-701, EF-603 y EF-001. Los checks siguen 7/28 hasta pasar los gates y cerrar los requisitos completos.

- **EF-701: comparativa triple por caso.** El comparador v2 exige **ambas referencias A y B, además de ASEN**, para cada C01–C20. Un caso solo con A, solo con B o sin ASEN se clasifica BLOCKED. Si A y B difieren en rutas, roles, guardas, checks, notificaciones o efectos, el caso es FAIL aun cuando ASEN coincida con una de ellas. Se comprueban los tres commits congelados y que cada ejecución se declara real; una declaración textual de `real` todavía no demuestra autenticidad. Hasta 40 registros de referencia son válidos; el duplicado de una misma referencia/caso falla.
- **F7: cierre negativo del CLI.** Incluso 40+20 trazas coincidentes dejan `globalFull:false` y el comparador CLI devuelve exit code 1: las coincidencias deterministas no constituyen un recibo independiente. Tests de divergencia A/B, referencia ausente, SHA caducado, simulación, identidad duplicada y ejecución real del proceso de CLI.
- **F7: preparación de capturas.** `npm run scaffold:agent-observations -- <SHA_ASEN> <directorio-nuevo>` genera `reference.json` (A+B, 40 entradas) y `asen.json` (20 entradas), todas **STATIC / NOT_CAPTURED**. No crea ni inventa ejecuciones. Falla si el directorio ya existe. Su README exige correr los 20 casos en ambas referencias y en ASEN y conservar recibos, modelo, ambiente y SHA.
- **F7: auditor de integridad local.** `npm run audit:agent-observation-receipts -- <reference.json> <asen.json> <SHA_ASEN> <raíz-recibos>` comprueba la ruta canónica, tamaño y digest SHA-256 de cada archivo citado, su fuente A/B/ASEN, caso, commit, entorno, modelo y traza. Rechaza archivos faltantes, desviaciones y datos manipulados. El resultado positivo se llama `INTEGRITY_ONLY`, no `REAL_VERIFIED`: los hashes proporcionados por quien capturó la evidencia no prueban que ejecutó el proveedor. El CLI nunca da exit 0 como certificado FULL.
- **EF-603: concurrencia entre procesos.** Nuevo fixture de dos procesos Node independientes con barrera, un almacén en disco, el mismo alcance/rol/modelo y una reclamación duradera. Exige un único ID y que, al finalizar los procesos, la unidad quede interrumpida sin relanzamiento automático. La coalescencia semántica de tareas planificadas sigue fuera del cierre.
- **EF-001: autorización primaria.** Regresiones de modo Normal sin getter, propagación intacta de la excepción del diálogo, revocación entre presentación y aceptación del consentimiento y protección frente a un segundo `session_start` que intentaría restaurar una preferencia elevada. Ni el modelo ni los tests conceden un permiso real de escritura.
- **Gate nuevo:** tests de todas estas rutas añadidos a la aceptación sin proveedor y a la suite completa de 3 OS; typecheck, build, seguridad, Release Gate y auditor ODD deben aprobar en el SHA final. Sin A/B reales, credenciales autorizadas de Ollama, consentimiento Writer genuino y prueba de consumo del padre, el proyecto sigue PARTIAL.

**Criterio para marcar:** EF-001 requiere los tres SO en verde; EF-603 no debe marcarse mientras falte equivalencia de unidades planificadas; EF-701 permanece BLOQUEADO hasta 20 escenarios reales ejecutados y recibos externos auditados, por más que la infraestructura de comparación ya esté implementada.

### F6 multiproceso — corrección de tipo de etiqueta (2026-11-03)

El primer gate sin proveedor del SHA `310b058` identificó `TS2345` en la etiqueta del archivo de barrera del fixture F6, porque TypeScript consideraba que una etiqueta leída de `process.argv` podía estar ausente. La validación ahora usa una guarda literal `label !== "one" && label !== "two"` que valida y estrecha su tipo, sin cambiar el algoritmo de deduplicación, la autoridad del agente ni el resto de pruebas. Se requiere nuevo CI exact-SHA; EF-603 y FULL siguen abiertos.

### Macrotanda siguiente — candado de planes públicos y reparación del CI Windows (2026-11-03)

**Estado: IMPLEMENTADO; CI exact-SHA y validación funcional real pendientes. FULL sigue BLOQUEADO.**

- **EF-603/EF-103:** la herramienta pública `asen_agent_start` ya no utiliza el vínculo laxo `onQueued` para tareas con un plan. Emplea `onPrepared` y el candado `TrustedTaskAgentBinder.launchExact`, con instantánea persistida idéntica y transición CAS antes del primer efecto de encolado. El mismo Todo no puede arrancar una segunda vez mientras esté `running`, ni aunque el agente previo haya terminado y falte conciliación. Las tareas ordinarias no planificadas conservan el vínculo anterior.
- **Control del candidato:** cuando Explorer/Reviewer/Verifier guarda `candidateRevision`, se verifica el HEAD de Git antes de la preparación y dentro del candado, inmediatamente antes del encolado. Cambios de sesión, proyecto, instrucciones, selección o plan bloquean sin crear un nuevo agente.
- **Pruebas:** `tests/planned-agent-public-dispatch.test.ts` cubre dos lanzamientos concurrentes del mismo Todo, rechazo de revisión Git obsoleta, aceptación del HEAD actual, único registro y ausencia de segunda ejecución. Estas pruebas no son una ejecución de modelos reales.
- **CI Windows:** el fallo del run `41705481790` se concentra en `tests/profile-routing-real.test.ts`: `ENOTEMPTY` al borrar el directorio `.asen` durante cierre. Ambos fixtures ahora ejecutan los hooks de `session_shutdown` antes de `rm`, que además usa los reintentos finitos nativos de Node para carreras transitorias del filesystem.
- **Criterio de salida:** typecheck, regresiones y test completo en los tres sistemas; CI consolidado en un único SHA. No marcar EF-603 ni FULL mientras falten las pruebas reales y el gate exact-SHA.


### Macrotanda EF-203/601/603/604 — acuse de coordinador y Todo único (2026-11-03)

**Implementación agrupada sin esperar al CI ni al Release Gate. FULL NO ALCANZADO.**

- **EF-601/604:** el journal durable conserva `pending → attempted → enqueued → acknowledged`. El nuevo `asen_agent_ack` de Pi solo actúa desde la sesión/proyecto TUI actual cuando el aviso está encolado, el agente terminal coincide con la fuente duradera y se ha consultado antes el resultado exacto mediante `asen_agent_status`. El acuse es atómico e idempotente entre procesos y no reenvía resultados. No prueba lectura humana, consumo por el modelo, revisión independiente ni consentimiento de Writer. Un aviso en estado `attempted` sigue siendo incierto y nunca se auto-reproduce.
- **EF-603:** todas las tareas Todo nuevas invocadas por `asen_agent_start`, incluidas las antiguas sin metadata de plan, pasan por `launchExact` y exigen `planned`, instantánea y CAS bajo bloqueo. No se permite una segunda ejecución durante la ventana entre fin del agente y reconciliación. `asen_agent_retry` y `asen_agent_continue` siguen con autorización y límites propios.
- **EF-203:** el esquema T12 Explorer añade validación de claves exactas, longitudes, ausencia de caracteres de control/bidi, evidencias no vacías, rutas relativas y IDs de hallazgos únicos; los diagnósticos siguen exponiendo solo tipos y nunca contenido del modelo. Esto no acredita que una observación sea verdadera.
- **Tests:** regresiones de estado y concurrencia del journal, TUI en el acuse, aislamiento de sesión, resultado terminal cambiado, doble lanzamiento Todo legacy antes y después del fin del agente, notificación con ID validado y datos de Explorer hostiles.
- **Pendiente para marcar checks:** suite exact-SHA completa en los tres sistemas, Pi real y consumo, observaciones A/B para C01–C20, Writer interactivo y proveedor real autenticado. El gate R4 automatizado en PR #45 no se equipara a auditoría independiente.


### Macrotanda de estabilización del CI y consulta explícita del resultado (2026-11-03)

- **CI `41710013109` / SHA `894b62b`:** los fallos Ubuntu y macOS de suite global eran dos contratos obsoletos: cadena literal para el rechazo de cambio de proyecto y lista de herramientas Pi que omitía `asen_agent_ack`. Se conserva la cadena anterior y se actualiza la lista sin suprimir pruebas. La matriz Pi ejecutó los hosts reales pero su gate de recibos `ecosystem-execution-receipts.mjs` volvió a ejecutar `pi-host-preflight.test.ts` y encontró el mismo fallo; no se relaja el gate.
- **EF-601/604:** `asen_agent_ack` exige ahora consulta previa por `asen_agent_status` con ID exacto, resultado terminal validado y mismo alcance TUI. El marcador efímero de consulta caduca a los 5 minutos, está acotado a 64 entradas, se borra al restablecer la sesión y no es una prueba de lectura/consumo del modelo, aceptación humana o consentimiento Writer. Una mera lista de agentes no emite marcador.
- **Pruebas:** rechazo antes de consultar, tras listado genérico o tras consulta con terminal divergente; aceptación idempotente después de consulta exacta, sin relanzamiento de tareas ni reenvío de avisos.
- **Pendiente:** CI completo exact-SHA tres sistemas, 20 casos A/B/ASEN reales, proveedor gratuito autenticado, consentimiento Writer y observación del consumo genuino del padre. Los checks no cambian hasta acreditar cierre integral.


### F3 — control preventivo de rutas y alias de Writer (2026-11-03)

- Se endurece `acquireWorkspaceWriter`: SHA solo de 40 o 64 hexadecimales, autorización con ID Unicode válido y acotado, rutas exactas canonizadas, sin controles ni bidi, sin unidades Windows, sin `.git`, sin duplicados o solapamiento exacto, máximo 512 superficies.
- Antes del candado y también en `verify()` se recorren los componentes reales de cada ruta autorizada y cada ruta modificada: un enlace simbólico preexistente o introducido durante la ejecución obliga a detener el Writer, sin borrar los cambios para que puedan inspeccionarse. Los directorios y archivos nuevos normales siguen permitidos cuando la autorización es exacta.
- Pruebas Linux/macOS de sustitución por symlink después de obtener el permiso y de symlink presente al solicitarlo; pruebas multiplataforma de rutas ambiguas, malformadas y autorizaciones no canónicas.
- **Límite EF-303:** el candado sigue siendo exclusivo para un mismo workspace y no habilita ejecución paralela insegura. El paralelismo de Writer solo se considerará con aislamiento genuino por worktree y reconciliación explícita. FULL y este check siguen abiertos.


### Corrección CI exact-SHA: preparación atómica y paquete Pi Windows (2026-11-03)

- **Suite global Ubuntu del SHA `c0aefcc`:** la prueba anterior asumía que una identidad de proyecto caducada generaba un agente `cancelled`. El mecanismo nuevo `onPrepared` verifica la identidad **antes de persistir** el agente. Se refuerza la prueba para exigir ausencia total de registros (en lugar de fabricar un cancelado), Todo inalterado y ningún vínculo.
- **Release Gate Windows del SHA `c0aefcc`:** el empaquetado y el compilador terminaron correctamente, pero el supervisor de 11 comandos RPC reales agotó el watchdog de 20 s durante una ejecución de carga CI. Se conserva el contrato completo y las tres sesiones reales (original, reabierta y ajena), sin forzar salida ni simular respuestas; el watchdog Windows queda acotado a 45 s con diagnóstico del comando/índice, permaneciendo en 20 s en otros sistemas. No se da por PASS hasta su próxima ejecución.
- **Inventario del paquete publicado:** el registro instalado valida ahora explícitamente también `asen_agent_ack`; las pruebas y admisión de recibos requieren 17 herramientas en vez de aceptar la versión anterior con 16. Se añade caso negativo para rechazar recibos antiguos con 16.
- **F3:** los nuevos filtros de Writer del SHA `85c092f` quedan sujetos a CI y pruebas de symlink; el candado exclusivo del workspace se mantiene. EF-303 y FULL siguen pendientes de evidencia real y paralelismo aislado seguro.


### Macrotanda F6/EF-603 — equivalencia exacta de Explorer entre tareas y gate de paquete (2026-11-03)

- **EF-603:** `SessionTodoStore.withAgentLaunch` comprueba ahora dentro del candado interproceso del mismo journal si otra tarea Explorer `running` comparte instrucción exacta, dependencias, candidato, modelo, thinking, selección de skills y phase. Si existe, rechaza el nuevo lanzamiento sin encolar otro agente, mutar la tarea ni inventar un resultado. Distintos IDs Todo no eluden la regla; otras sesiones/proyectos quedan aislados. Un segundo Explorer con instrucción diferente sí puede ejecutarse. **Solo comparaciones exactas**: no se deducen equivalencias semánticas de un modelo ni se coalescen resultados entre distintas tareas.
- **Regresiones:** test de dos arranques concurrentes de Explorer con distintos IDs pero alcance exacto (un único `running`) y de dos instrucciones diferentes (dos lanzamientos independientes). El bloqueo queda dentro del candado de proyecto; su efecto no depende de una carrera de lectura fuera del candado.
- **CI exact-SHA `f589fd7`:** las tres matrices Pi encontraron un fixture de `tests/ecosystem-evidence-bundle.test.ts` que declaraba 16 herramientas. Se actualiza a 17 (incluida `asen_agent_ack`) sin relajar `admitPackageJourneyResult`; el gate sigue rechazando recibos antiguos o incompletos. Los fallos de subida de artefactos eran consecuencia de no haber generado evidencias al fallar la fase semántica.
- **FULL:** continúa pendiente. No marcar EF-603 hasta CI exact-SHA y resto de roles. EF-701 y EF-702 necesitan capturas externas/modelos reales y EF-304 autorización genuina.

### Tanda de implementación EF-303 — worktrees aislados y límites de autoridad (2026-11-03)

- **Readiness real, no autorización:** nuevo `src/runtime/parallel-writer-readiness.ts`. Antes de aceptar dos carriles, comprueba que corresponden a dos worktrees Git distintos con índices independientes del mismo repositorio, mismo HEAD congelado, estado limpio y superficies exactas sin solapamiento, aliases de ruta ni enlaces simbólicos en el ámbito. Si el mismo archivo o una carpeta ancestro se comparte, falla cerrado. Devuelve explícitamente `READINESS_ONLY`, `humanApproval:false` e `integrationApproved:false`.
- **Prueba de Git y disco:** `tests/parallel-writer-readiness.test.ts` crea worktrees Git vinculados reales con un mismo commit; obtiene simultáneamente dos leases de Writer existentes con distintas autorizaciones, escribe únicamente en sus respectivos archivos y confirma que el otro worktree y el checkout base no cambian. Añade casos de solapamiento exacto, ruta padre, worktree compartido, SHA obsoleto, árbol sucio, otro repositorio, scope malformado y enlace simbólico (POSIX).
- **Sin escalada:** la prueba utiliza autorizaciones de fixture, no la UI Pi; no se habilita ningún merge, cambio automático de rama, permisos heredados ni publicación de resultados. La decisión previa es sensible al tiempo y el Writer debe volver a verificar candidata, ruta y autorización al ejecutar.
- **Salida abierta:** completar la integración de dos agentes reales, consentimiento interactivo separado por carril, pruebas RED/GREEN/PRESERVE, revisión y aceptación explícita de cada resultado y de su reconciliación. La referencia A/B C06 y C07 aún no tiene recibos reales; EF-303 y FULL siguen abiertos.

### Macrotanda de CI y multiproceso EF-603 (2026-11-03)

- **CI del SHA `276c554`:** TypeScript encontró un `TS7006` en `parallel-writer-readiness.ts` por inferencia implícita de los callbacks `some` después de `Array.isArray`. Se especifican tipos de los parámetros `string` e `index:number` sin relajar las comprobaciones. Se exige nuevo typecheck/build/CI exact-SHA para cerrar esta regresión.
- **Seguridad EF-303:** la comparación de rutas utiliza equivalencia conservadora sin diferenciar mayúsculas/minúsculas para rechazar alias en Windows y macOS; también rechaza solapamientos entre rutas dentro del mismo carril. Ninguna decisión de preparación reemplaza consentimiento humano ni aceptación del cambio.
- **EF-603 interproceso:** `tests/planned-explorer-multiprocess.test.ts` arranca dos procesos Node independientes con `tsx`, crea dos tareas Explorer planificadas distintas con el mismo contexto exacto y libera simultáneamente una barrera. Solo uno debe entrar en `withAgentLaunch` y ejecutar el callback de despacho; el otro permanece `planned` y recibe rechazo inequívoco. Se verifica el fichero de estado persistente, no únicamente un contador en memoria. Este fixture no realiza ninguna llamada a proveedor LLM.
- **Seguimiento:** no declarar FULL por estas pruebas; EF-303 y EF-603 siguen abiertos hasta ejecución real y recibos exact-SHA completos. Referencias A/B, Writer Pi y consumo real permanecen pendientes.

### Tanda de seguridad F6 — aviso único con alias de workspace y etiquetas seguras (2026-11-03)

- **Fallo observado en código:** `agentNoticeEventId` usa una huella del nombre textual del proyecto, sin canonizar. En Windows dos rutas del mismo proyecto con distinta capitalización o alias 8.3 pueden originar eventos distintos, aunque la comprobación de propiedad `sameWorkspaceIdentityPath` las trate como equivalentes. Migrar la función de hash invalidaría los recibos duraderos previos, por lo que no se reescribe ningún `eventId` histórico.
- **Corrección en `AgentNotificationJournal.record`:** bajo el candado del diario, el mismo agente, sesión, proyecto equivalente y resultado terminal ahora **reutiliza el evento persistido** aunque el hash textual de la segunda llamada difiera. Conserva `attempted`, `enqueued` o `acknowledged`: no vuelve a enviar ni simula lectura por el padre. Distintos proyectos en POSIX, otras sesiones o estados diferentes siguen siendo identidades distintas.
- **Saneamiento de etiquetas en mensajes al coordinador:** `agentTerminalContinuationMessage` neutraliza controles de terminal, Unicode de dirección, saltos de línea y cadenas excesivas en **ID, rol y estado**, además del saneamiento de `summary` ya existente. Se conserva el ID duradero válido para confirmaciones explícitas; los datos del hijo nunca aportan permiso Writer.
- **Regresiones:** dos instancias que registran simultáneamente el mismo evento; intento de segundo registro tras acuse; alias Windows sin segundo encolado frente a rutas distintas en POSIX; identificadores manipulados con Unicode bidi, multilínea y exceso de longitud.
- **Límite de evidencia:** estos son contratos verificables por fixtures y CI, no demuestra consumo real del modelo Pi, vigilia efectiva del padre, ni autorización humana; EF-601/604 y FULL continúan abiertos. No se habilita un reenvío desde estados de entrega inciertos.

### Corrección del CI Windows de aislamiento de Writers (2026-11-03)

- **Fallo comprobado:** en `test (windows-latest)` del SHA `4fcb299`, el caso `EF-303 disjoint linked worktrees...` falló al comparar `"b0\\r\\n"` con el literal `"b0\\n"`. El checkout Git de Windows transforma válidamente LF en CRLF; la prueba de preservación no debía asumir bytes de origen Linux.
- **Corrección sin rebajar el criterio:** `tests/parallel-writer-readiness.test.ts` captura los bytes reales de los cuatro archivos de control antes de las dos escrituras y exige después identidad exacta de buffers, tanto en cada worktree ajeno como en el checkout base. Es una comprobación de no modificación más precisa que comparar texto con un LF prescrito. Los cambios autorizados siguen verificándose con ambos leases.
- **Evidencia pendiente:** CI exact-SHA en Ubuntu, macOS y Windows del candidato corregido; un PASS del empaquetado Pi no implica capacidad Writer interactiva ni FULL.

### Tanda Beam R1 — aceptación real acotada por cinco inferencias (2026-11-03)

- **Evidencia real anterior:** el job autenticado `ASEN real-agent functional acceptance`, run `41608735935` / SHA `d66d401d371f81104e96957b418e387f965b6ffc`, ejecutó las dos llamadas Reviewer y la llamada Verifier contra `ollama-cloud/beam`. El artefacto `asen-real-provider-.../real-review-verifier.json` recoge **ambos Reviewer correctos** con tres defectos de código identificados, pero rechaza el resultado del Verifier con `VERIFIER_EVIDENCE_INCOMPLETE`. Diagnóstico concreto del grader: `Verifier changed the failed criterion for pricing`. No existe un PASS real de Verifier para ese SHA; no reetiquetar la ejecución.
- **Hipótesis/solución limitada:** la petición anterior al Verifier repetía las trazas completas de Node, los testimonios de ambos jueces y tablas de requisitos extensas. Nuevo `scripts/t12-verifier-brief.mjs` prepara un sobre compacto solo con observaciones verdaderamente fallidas, criterios literales congelados, digest de fixture y hallazgos ya graduados. El Verifier sigue produciendo sus propias justificaciones; se conserva el segundo Reviewer independientemente graduado en el contexto. Se mantienen `gradeRealVerification`, las pruebas negativas, los SHA exactos, el bloqueo de herramientas y la ausencia de autorización Writer: **no** se completa ni modifica una respuesta inválida.
- **Pruebas:** `tests/t12-verifier-brief.test.ts` rechaza criterios ausentes, repetidos, resultados no fallidos, ausencia de `AssertionError`, ámbitos de archivo falsos y digest no canónico. En condiciones reales se vuelve a ejecutar el gate `t12-live-evidence-gate.mjs` sobre las **cinco reservas exactas** `Explorer → Planner → Reviewer A → Reviewer B → Verifier`; no hay sexto intento encubierto ni consumo extra en caso de fallo.
- **Ejecución de Beam:** el workflow existente `.github/workflows/asen-real-agent-acceptance.yml` contiene la rama de `push` explícita de un solo disparo mediante mensaje `ci: one-time Ollama Cloud provider smoke`; utiliza el secreto ya configurado del entorno `ollama-cloud-beam`. La publicación de esta tanda emplea esa activación autorizada; comprobar `real-provider-acceptance` **no SKIPPED** y guardar artefactos exact-SHA antes de afirmar éxito. Las ejecuciones `push` verdes anteriores con el job `real-provider-acceptance` SKIPPED no son pruebas reales de modelo.
- **Clasificación mantenida:** EF-203/401/402/501/502/503/702/703 siguen `PARCIAL` o `BLOQUEADO` según el requisito porque estas inferencias aisladas no ejecutan A/B C01–C20, no prueban herramientas del agente, no otorgan consentimiento de Writer, no certifican Reviewer externo independiente ni demuestran consumo de turnos del padre Pi. El resultado máximo de este job es `PASS_BOUNDED_READ_ONLY`, no FULL.

### Tanda Beam R1b — preflight de cinco llamadas reparado sin inferencia (2026-11-03)

- **Ejecución `41721150065` / SHA `4c29a4e`:** `offline-static-validation` FAIL en `tests/t12-real-provider-workflow.test.ts`, que seguía buscando en el archivo ejecutor frases literales del antiguo prompt del Verifier. Al extraer de forma segura el prompt compacto a `scripts/t12-verifier-brief.mjs`, esas comprobaciones de implementación dejaron de encontrarlo. La ejecución real `Real Ollama Cloud functional acceptance` quedó **SKIPPED** por la dependencia `needs:` y **no consumió llamadas de Beam**.
- **Corrección:** las pruebas de arquitectura ahora comprueban que el ejecutor invoca `createT12VerifierBrief`, que la pieza real exige criterios literales, tres evidencias de revisión, fallos de tipo `AssertionError` y una explicación propia. Las pruebas dinámicas `tests/t12-verifier-brief.test.ts` pasan a la lista de aceptación sin proveedor de `asen-real-agent-acceptance.yml`. Ni los criterios de `gradeRealVerification`, ni el límite de cinco inferencias ni el bloqueo Writer se han relajado.
- **Acción:** publicar la siguiente tanda agrupada con el mismo disparador `ci: one-time Ollama Cloud provider smoke`; la aceptación remota requerirá PASS de preflight y ejecución **no SKIPPED** de `ollama-cloud/beam`. Ninguna tarea EF se marca `[x]` antes de recibos exact-SHA y validación.

### Tanda Beam R2 — diagnóstico de valores Explorer y tercera aceptación autenticada (2026-11-03)

- **Ejecución auténtica `41721696752` / SHA `01a9b2e`:** PASS de la validación sin proveedor; Pi y Ollama Cloud autenticado arrancaron. La primera llamada real de `ollama-cloud/beam` terminó en `EXPLORATION_SCHEMA_INVALID`, lo que bloqueó Planner, Reviewers y Verifier por dependencia. El artefacto `asen-real-provider-01a9b2e-41721696752` conserva la huella del modelo y demuestra que los ocho campos principales tenían sus **tipos correctos**, sin facilitar el contenido de respuesta. El presupuesto muestra únicamente la primera reserva, sin reintentos ocultos.
- **Hallazgo:** el verificador Explorer diferencia tipo de campo frente a restricciones de valor: cadenas sin controles y acotadas, evidencia no vacía, rutas y claves exactas, IDs únicos. El mensaje al modelo señalaba la forma global pero no todos estos límites exactos, por lo que no se podía atribuir sin más el rechazo a un defecto de lógica.
- **Implementación:** `scripts/t12-explorer-schema.mjs` añade códigos `invalidFields` calculados localmente y limitados a 24, sin exponer texto del modelo. `scripts/t12-ollama-asen-dispatcher.mjs` registra estos códigos en el recibo de rechazo e instruye explícitamente los límites de datos y rutas. `tests/t12-explorer-schema.test.ts` cubre tipos globales correctos con valores semánticamente inválidos y ausencia de exposición de un marcador secreto.
- **Invariantes:** la condición `passed` sigue validando el contrato preexistente completo. Ni se modifica la respuesta del modelo, ni se sintetizan evidencias, ni se habilita una escritura, ni se sustituye el proveedor. El workflow conserva exactamente las cinco reservas secuenciales como techo. Si Beam vuelve a fallar, los códigos acotados permitirán identificar la causa real sin repetir llamadas por inercia.
- **FULL:** no alcanzado. EF-203, EF-402, EF-503 y EF-702 siguen pendientes de pruebas y recibos completos; A/B, consentimiento Writer y consumo del padre siguen abiertos.

### Tanda Beam R2b — reparación del typecheck antes de inferencia (2026-11-03)

- La aceptación exact-SHA `41722428699` / `c188bb3` no alcanzó Ollama: `offline-static-validation` se detuvo en `TS1508` (`tests/t12-explorer-schema.test.ts:78`), una clase de caracteres con un cierre `] ` que el compilador TypeScript rechaza. `real-provider-acceptance` quedó `SKIPPED`; **cero nuevas llamadas Beam**.
- La comprobación estática del nombre de campo se sustituye por verificación explícita de longitud y caracteres de un alfabeto fijo, evitando diferencias de parseo de regex y conservando el criterio de no exponer el contenido del modelo. No se altera el schema de producción ni el gate de aceptación.
- Nueva ejecución limitada a las cinco reservas originales, condicionada al PASS del preflight. Su resultado se evaluará por recibos del mismo SHA, no por el verde de jobs sin proveedor.

### Tanda Beam R2c — fixture con controles reales frente a escapes textuales (2026-11-03)

- La validación sin proveedor `41722716135` / SHA `de75844` superó TypeScript y falló únicamente en la nueva prueba `EF-203 schema diagnostics expose only bounded field codes`: esperaba rechazo de un valor que contenía barras invertidas literales seguidas de `n`/`u202e`. Estos caracteres **no son** controles Unicode; el validador hizo bien en aceptarlos.
- Se corrige el propio fixture para usar saltos de línea y dirección Unicode reales, manteniendo un control positivo que acepta una barra invertida literal. Ni `clean()`, ni `validValues()`, ni los gates de contenido se debilitan.
- No se produjo inferencia Beam en este SHA porque la etapa de preflight impidió `real-provider-acceptance`. Se solicita de nuevo una tanda de cinco llamadas condicionada a la aprobación previa, sin reintentar automáticamente una llamada fallida.

### Cierre de la tanda Beam R2c — cinco inferencias reales y límites de paridad (2026-11-03)

- **Recibo reproducible:** `ASEN real-agent functional acceptance`, run `41723090941`, SHA `fe0198ea72e3d29aded0be0d4a9901b018f6d7c5`. La validación sin proveedor es **PASS**. La evidencia autenticada `asen-real-provider-fe0198e.../inference-budget-summary.json` contiene `limit:5, reserved:5, remaining:0, authorization:NOT_GRANTED`; modelo seleccionado por Pi: `ollama-cloud/beam` (alias registrado de `beam:cloud`).
- **Explorer (EF-203, F2): PASS acotado.** `asen-dispatcher-explorer.json` confirma `passed:true` y fixture inalterado, salida estructurada y ejecución con `noTools:true`. No acredita consulta CodeGraph real ni herramientas Explorer en A/B.
- **Planner (EF-101/103, F3): PASS acotado.** `fixture-plan-grade.json` confirma `passed:true`, candidato exacto y tres tareas vinculadas a los defectos. No acredita plan A/B ni continuidad real tras reinicio.
- **Reviewer A y B (EF-501/502, F5): PASS acotado para ambos.** El artefacto `real-review-verifier.json` conserva dos respuestas de modelo distintas (hashes distintos), ambas graduadas `passed:true` con tres defectos reproducibles. Las dos usan **el mismo proveedor/modelo**, no revisión externa independiente.
- **Verifier (EF-402/503, F5): FAIL.** `VERIFIER_EVIDENCE_INCOMPLETE`; el grader exige exactamente las secciones `tests`, `scope`, `review`, pero el recibo de fallo registra `verifierEvidenceKinds:[]` y `verifierReviewPaths:[]`. La aceptación completa `PASS_BOUNDED_READ_ONLY` NO se obtuvo. Nunca convertir un Verifier sin pruebas suficientes en PASS.
- **Corrección siguiente, aún sin nueva inferencia:** `scripts/t12-verifier-brief.mjs` incorpora una estructura JSON completa de tres secciones, vinculada a los valores del input, con `?` en todas las observaciones y razones que el modelo debe generar. El grader rechaza literalmente esos placeholders; no hay normalización ni relleno posterior de respuestas. El fallo registra solo metadatos de forma `verifierResponseKeys`, `verifierEvidenceContainer`, `verifierEvidenceCount` (nunca el texto del modelo) para futuros diagnósticos.
- **Decisión de consumo:** no relanzar automáticamente cinco llamadas adicionales por un único fallo de formato. La ejecución de la nueva petición requerirá comprobar disponibilidad y cuota real del modelo; el presupuesto de esta tanda está consumido. Los casos C01–C20 comparativos A/B, Writer Pi con consentimiento humano y consumo efectivo de notificaciones siguen **PENDING/BLOCKED**. Resumen de checks verificables sigue siendo 7/28; FULL no alcanzado.

### Macrotanda de verificación de Beam, CI y protección de evidencias (2026-11-04)

**Reconciliación F0 con CI ya ejecutado, no pronóstico:** el candidato `e05ed7525b214591501ea085767e3d8c33c42ff1` obtuvo PASS en `CI` run `41724028665` (suites completas Ubuntu/macOS/Windows, gates T12 Pi TUI y matrices), Release Gate `41724028942`, Arquitectura `41724028928`, Pi Runtime `41724028955`, CodeGraph `41724029097`, F5 `41724028616` y R4 **SELF_AUDIT_ONLY / NOT independent** `41724028800`. Los logs de los tres jobs `test` contienen `ok` de los tres casos nominales EF-001 y ningún `fail`. Por eso se cierra **solo EF-001**. La misma evidencia actualiza el límite de EF-603/703: el CI ya no es su bloqueo, pero las interacciones de modelo/humano pendientes sí lo son.

**Macrotanda F5 — evitar informes falsos sin gastar llamadas adicionales en cada iteración:**
- `scripts/t12-verifier-brief.mjs` vincula cada prueba real `pricing`, `authorization` y `parsing` al criterio inmutable correspondiente. Rechaza IDs no reconocidos, duplicados, criterios de prueba adulterados y discrepancias con los criterios citados por Reviewer, antes de pedir una inferencia a Beam.
- `tests/t12-verifier-brief.test.ts` demuestra que el esqueleto JSON con observaciones `?` nunca supera `gradeRealVerification`; únicamente un informe **completamente rellenado y fundamentado** puede satisfacer la misma validación estricta, y siguen fallando SHA obsoleto, caso omitido y criterio alterado. Ese informe completado es un fixture offline, **NO una salida real de Beam**.
- Las cinco llamadas existentes de Ollama Cloud siguen siendo `Explorer → Planner → Reviewer A → Reviewer B → Verifier`. No se eleva el límite, no se habilitan herramientas ni permisos Writer, no se sustituye modelo, no se repite una llamada al fallar y no se concede FULL por completar solo el recorrido de lectura.
- **Autoauditoría de riesgo (no independiente):** controles verificables contra respuestas recicladas de otros SHA, resultados de test inventados y contaminación de criterios entre hallazgos; sin cambios en `gradeRealVerification`, en `authorization` ni en el ejecutor de Writer. El estado EF-402/503/702 y C01–C20 permanece PARTIAL/BLOCKED según sus exigencias auténticas.
- **Evidencia de aceptación nueva:** esta publicación exige primero gates focalizados y CI exact-SHA; `Real Ollama Cloud functional acceptance` debe figurar `no SKIPPED`, recibir como máximo cinco reservas y demostrar `PASS_BOUNDED_READ_ONLY` sin aceptar el esqueleto sin contenido. Registrar en otra reconciliación el resultado real; no presumirlo antes del run.

**Progreso del checklist por evidencia:** 8/28 comprobaciones cerradas (antes 7/28); FULL sigue NO alcanzado.

### Corrección de auditoría de EF-001 sin retroceder su prueba real (2026-11-04)

El run `41781460824` del SHA `3e3b720` bloqueó la aceptación auténtica antes de gastar una llamada de Beam: `audit:ef-plan` requiere que cada tarea `[x]` tenga el par `src + tests`, run y SHA con sintaxis canónica, y que el resumen estructural coincida con el número de checks. El recibo EF-001 ya estaba acreditado por `CI 41724028665` (tres OS) pero se escribió con un formato narrativo distinto. Se restablece el formato exigido, `8/28`, y se refuerza la prueba de regresión del propio auditor. **No se cambia el significado del PASS EF-001 ni se concede una autorización Writer.** La aceptación real en el siguiente SHA sigue subordinada al preflight íntegro.

### Tanda agrupada F5/F6 — Verifier basado en aserciones reales y entrega atómica entre procesos (2026-11-04)

**Incidencia real de modelo confirmada:** run `41781846957` / SHA `d96d7f0ba23259527424852d09183b3b57856f1e`, `real-provider-acceptance` FAIL tras las cinco llamadas Beam permitidas. Explorer y Planner resultaron PASS en el job; ambos Reviewer dieron sus tres hallazgos canónicos, pero el Verifier registró `VERIFIER_EVIDENCE_INCOMPLETE`, con `verifierEvidenceKinds:[tests,scope,review]`, tres review paths y `gradingError: Verifier must explain the observed failure for parsing`. La estructura ya es correcta; el bloqueo es la **justificación concreta de la aserción de parsing**. El presupuesto de ese run fue cinco reservas y Writer `NOT_GRANTED`. No trasladar su resultado como PASS a otro SHA.

**Implementación F5 (no alterar `gradeRealVerification`):** la entrada de `scripts/t12-verifier-brief.mjs` exige ahora que **cada** observación de prueba comience con `AssertionError:` o `Failed assertion:` y describa el fallo específico. Se explica que `Number.parseInt` acepta indebidamente `12abc` sin lanzar la excepción esperada, y se recuerdan las aserciones auténticas de pricing y authorization. Es una instrucción de salida para una inferencia *real*, no una reparación ni una generación sintética de recibos. Se amplía `tests/t12-verifier-brief.test.ts` para mantener la obligatoriedad de los tres casos. Si Beam no responde conforme al gate estricto, permanecerá FAIL y se conservará el motivo.

**Implementación F6 (concurrencia real de almacenamiento, sin modelo):** nuevo `tests/agent-notification-multiprocess.test.ts` utiliza dos procesos Node independientes con barrera de arranque y un journal privado compartido. Ambos intentan `record` + `claim` sobre el mismo evento terminal; exactamente uno puede reclamar y encolar, ambos deben obtener el mismo `eventId`, el diario persistido conserva una única fila y un proceso extraño no puede falsificar `acknowledge`. No se añaden estados de entrega ni reenvíos ante `attempted`. Se incluye la regresión en el preflight F6 del workflow existente para impedir consumir llamadas de Beam si falla la carrera real.

**Límite de prueba explícito:** dos procesos reales Node compitiendo por un journal son prueba de **exclusión de transporte**, no de consumo de un turno Pi por el coordinador; EF-601/604 permanecen PARCIAL. Las pruebas del Verifier son offline hasta que un nuevo run autenticado con el exact-SHA supere `gradeRealVerification`; EF-402/503 quedan PARCIAL/BLOQUEADO. No se ejecutan las referencias A/B C01–C20 ni se marca FULL; no hay nuevo consentimiento Writer.

**Gates solicitados por tanda:** `audit:ef-plan` 8/28 coherente, TypeScript, build, suites F5 y F6 con dos procesos, CI consolidado Ubuntu/macOS/Windows, Release Gate, arquitectura, R4 SELF_AUDIT_ONLY; y una única aceptación autenticada Ollama Cloud Beam con hasta cinco llamadas, siempre después de preflight completo. No crear un workflow adicional ni publicar un merge a main.

### Tanda R3 — corrección causal del juicio Verifier y recibos F6 (2026-11-04)

**Ejecución auténtica 5/5 y localización del siguiente bloqueo:** `ASEN real-agent functional acceptance`, run `41782747238`, SHA `078e061f5eaf8609b793610fe0861466898b116d`. `offline-static-validation` PASS, incluyendo `tests/agent-notification-multiprocess.test.ts` con dos procesos reales. Explorer y Planner con Ollama Beam PASS, Reviewer A y Reviewer B PASS (mismo modelo, juicios separados), Verifier FAIL `VERIFIER_EVIDENCE_INCOMPLETE`; diagnóstico determinista `Verifier must explain the reviewed defect`. El artefacto `asen-real-provider-078e061.../real-review-verifier.json` muestra que la respuesta ya contiene `tests`, `scope`, `review`, tres paths y los criterios de las pruebas, pero al menos una de las explicaciones de `review.findings.reason` no cumple `/fail|defect|bypass|reject|accept/`. La llamada fue real y su evidencia sigue registrada como FAIL, no se reetiqueta. Presupuesto de cinco reservas agotado en ese run.

**Macrotanda F5 antes de otra inferencia:** `scripts/t12-verifier-brief.mjs` exige ahora explícitamente una razón causal para **cada** hallazgo de Reviewer, comenzando por `The defect fails the acceptance criterion because` y completada por el modelo con evidencia específica de pricing/access/parsing. Se preservan rutas, SHA, criteria y expresiones exactas, y el modelo debe rellenar motivos; no se sintetiza una respuesta desde el programa ni se modifica la calificación. `scripts/t12-review-grader.mjs` conserva la condición de admisión intacta, pero el error de una razón insuficiente incorpora solo el path conocido del fixture, de modo que un futuro rechazo indique la unidad concreta sin publicar el texto del modelo ni claves. Las pruebas `tests/t12-review-grader.test.ts` fuerzan razones genéricas en cada una de las tres rutas y exigen un rechazo con el path correcto; `tests/t12-verifier-brief.test.ts` verifica las instrucciones causales.

**F6 con recibo acotado:** la nueva prueba de procesos reales PASS no significa que Pi recibiera, leyera o consumiera el evento; únicamente acredita un `claim` y un `enqueue` por identidad entre procesos sin respuesta de modelo. EF-601/604 continúan PARCIAL, y el `asen_agent_ack` nativo permanece sujeto a identidad/entrega registrada. El riesgo de confundir una fila `enqueued` con un acuse de humano o con Writer `authorized` sigue prohibido.

**Resultado y límites:** Se conservan 8/28 checks completados: ningún nuevo check se marca solo por un PASS offline. EF-402/503 siguen con prueba real de Verifier pendiente, EF-002/701 dependen de A/B C01–C20, EF-304 exige consentimiento humano y EF-601 consumo real del coordinador. No merge a main, ni proveedor de pago, ni auditoría presentada como independiente. Publicar una sola tanda con CI y aceptación autenticada limitada a cinco llamadas, y decidir por recibos exact-SHA.

### Cierre verificable R3: aceptación real completa dentro de su alcance (2026-11-04)

**Recibo de proveedor real:** `ASEN real-agent functional acceptance` run `41783370317`, SHA exacto `8add73424613f9bdae7b334e8a24c5b5d27fb0c8`, artefacto `asen-real-provider-8add734...-41783370317` (ID `13299214875`). Las evidencias `real-review-verifier.json`, `live-evidence-gate.json`, `inference-budget-summary.json` y `t12-acceptance-ledger.json` fueron contrastadas. Los dos Reviewer aprobaron tres hallazgos con hashes de respuesta distintos; el Verifier produjo `passed:true`, `checkCount:3`, `findingCount:3`, `verdict:fail` sobre los defectos deliberados. El gate final aceptó los cinco recibos secuenciales como `PASS_BOUNDED_READ_ONLY`. El presupuesto real fue `limit=5`, `reserved=5`, `remaining=0`. El entorno continuó `authorization=NOT_GRANTED`, `toolsAllowed=false`, `writer=BLOCKED_INTERACTIVE`. No se deduce de esto ninguna tarifa futura, autorización de escritura ni FULL.

**Checks granulares de la aceptación autenticada** (independientes de los 28 EF de paridad):

- [x] BEAM-R3-01 — Explorer autenticado, lectura acotada, salida observada y validada en el SHA indicado.
- [x] BEAM-R3-02 — Planner autenticado, tres tareas y contrato de planificación sobre fixture real aislado.
- [x] BEAM-R3-03 — Reviewer A y B, dos llamadas ciegas separadas, tres hallazgos correctos por cada una.
- [x] BEAM-R3-04 — Verifier auténtico, tres tests fallidos, alcance/digests inmutables y tres razones causales; gate estricto PASS sin editar la respuesta.
- [x] BEAM-R3-05 — Presupuesto exacto cinco llamadas y Writer no autorizado, con huellas y archivo de evidencia.
- [x] BEAM-R3-06 — Preflight F6 con dos procesos Node reales compitiendo por una única notificación; **sin** afirmar consumo Pi.
- [ ] BEAM-R3-07 — Consumo comprobado por un turno del coordinador Pi inactivo y acuse vinculado al resultado real.
- [ ] BEAM-R3-08 — Writer Pi con aprobación y rechazo humano auténticos, revocación y preservación de archivos.
- [ ] BEAM-R3-09 — Pruebas auténticas C01–C20 en las referencias A y B, y comparación exact-SHA ASEN.
- [ ] BEAM-R3-10 — Recuperación de proveedor/cuota/red y segunda revisión externa verdaderamente independiente.

**Reconciliación de estado:** la aceptación acotada F2/F3/F5 es PASS real; por ello EF-402, EF-502, EF-503 y EF-702 incorporan nueva evidencia, pero siguen `PARCIAL` y **sin** `[x]` a nivel EF: todos contienen requisitos adicionales no probados. EF-601/604 mantienen solo el PASS multiproceso del journal, no del consumidor Pi. El plan canónico mantiene **8/28 EF verificados, 20 abiertos y FULL NO**. La autoauditoría R4 sigue `SELF_AUDIT_ONLY / NOT independent`.

**Cierre de tanda y paso siguiente:** no lanzar otras cinco llamadas de Beam para repetir un recorrido ya aceptado. Priorizar una tanda de aceptación con consumo real Pi/Writer y A/B, bajo los permisos auténticos disponibles. El commit documental de reconciliación no contiene el disparador de Ollama; el último PASS autenticado permanece anclado al SHA `8add734`, nunca se hereda a commits posteriores.

### Macrotanda F7/F6/F3 — A/B Git real, Pi padre con Beam, autorización Writer (2026-11-04)

**Compromiso de alcance y coste.** Se concentran F7 (identidad de A/B), F6 (consumo del padre real Pi) y F3 (clasificación honesta de Writer) en una sola publicación. La ejecución con proveedor no reitera Explorer/Planner/Reviewer/Verifier: esos cinco roles ya dieron `PASS_BOUNDED_READ_ONLY` en `41783370317` / `8add734`. El nuevo disparador `ci: one-time Pi parent Beam proof` activa **solo** la prueba nueva del padre en un TUI nativo y deja omitida la anterior batería de cinco llamadas. El modelo está restringido a `ollama-cloud/beam`, sin modelos de pago alternativos, con máximo de cinco turnos. Un fracaso no autoriza reintentos automáticos.

**F7 / A y B: identidad de fuentes reproducible en Actions.**
- Baselines establecidas: A = `813ec110600c8451c5f2bb9c35c12d8cf9b1c11e`, árbol `7adff2898dff18740c00bdc65031c5f9044cd8e2`; B = `fd99d8492adb6c23c29f3e9fbd59fc756b76b6ff`, árbol `c4ad4b7f79b3a0be36176657904090803e6d2b70`. Ambos objetos `commit` y sus árboles se han consultado en las respectivas APIs GitHub; son repositorios diferentes, no dos SHAs del mismo código. La procedencia nominal solo se versiona en la ruta permitida `registry/parity/agent-ab-baselines-v1.json`.
- `scripts/agent-ab-source-witness.mjs` trabaja en dos repositorios **bare temporales**, obtiene cada commit exacto por HTTPS, verifica `FETCH_HEAD`, tipo `commit`, árbol y blobs de ficheros obligatorios. Nunca ejecuta dependencias, scripts ni código de referencia; limpia los objetos al terminar y conserva un recibo `SOURCE_OBJECTS_VERIFIED` con `executedCases=0`, `modelCalls=0`, `runtimeAttested=false` y `globalFull=false`.
- `tests/agent-ab-source-witness.test.ts` fuerza negativas de SHA, árbol, blob, ruta, alias y duplicación; no requiere internet ni provider. El workflow existente añade un job separado `ab-frozen-source-witness` y retiene solo la huella exact-SHA, sin atribuir C01–C20. **EF-002 y EF-701 permanecen bloqueados** hasta las 40+20 capturas funcionales independientes.

**F6 / Pi padre TUI real.**
- `scripts/t12-parent-probe.ts` usa `createAsenExtension` real, el journal real y un **hijo determinista de solo lectura** que produce una terminación duradera. El único modelo que puede actuar es el coordinador Pi TUI con Beam. En el contexto del modelo se exponen exclusivamente las herramientas read-only `asen_agent_status` y `asen_agent_ack`; el inicio del hijo es un comando del fixture, no del modelo. No hay Bash, Writer ni ninguna fuente externa ejecutable.
- `scripts/t12-real-parent-consumption.mjs` inicia Pi 1.2.0 en PTY real, inyecta el comando, observa el aviso terminal encolado con `triggerTurn:false`, el wake `triggerTurn:true/steer`, un turno auténtico del modelo, la llamada a `asen_agent_status`, la posterior llamada a `asen_agent_ack`, el cierre del turno, el ledger `acknowledged` y que Git continúa limpio. Env privado, proyecto descartable, límite de turnos y watchdog; no se publica texto del modelo ni credenciales.
- `scripts/t12-parent-consumption-grade.mjs` exige **esa secuencia y misma identidad**: un `enqueued` sin lectura/ack no califica como consumo, ni un ack sin status anterior, ni cambio de proyecto, ni dos despertares, ni salida del modelo sin evento duradero. `tests/t12-parent-consumption-grade.test.ts` cubre fraude, desorden, identidades y consentimientos inventados. Recibo válido máximo: `PASS_REAL_PI_PARENT_BOUNDED` y `COORDINATOR_ACTION_ONLY`; nunca FULL, lectura humana ni independencia de revisión.
- El workflow real añade el job `real-parent-consumption`, con proveedor Beam ya conectado a GitHub Actions, **condicionado a un único commit específico** y preflight provider-free en verde. Su fallo no se oculta: EF-601 sigue PARCIAL hasta recibir el artefacto real; incluso si aprueba, quedará el contraste A/B y la ejecución con hijo Pi real.

**F3 / Writer:** no se presenta un `y` escrito por un script de GitHub Actions como consentimiento de una persona. Los tests T12 nativos existentes comprueban el diálogo mecánico y la preservación, pero EF-304 y C19 siguen BLOQUEADO hasta una aprobación humana interactiva de un cambio aislado y su denegación/revocación. El nuevo job del padre es deliberadamente sin herramientas de escritura.

**Checks de la macrotanda (distintos de los 28 EF):**
- [x] MEGA-AB-01 — procedencia A y B, commit y árbol obtenidos y contrastados con objetos GitHub públicos, **solo identidad**.
- [x] MEGA-PI-01 — validador de consulta y acuse exactos, con pruebas negativas, PASS en preflight `41787200198` / SHA `44c9ad0`; no sustituye una sesión Pi real.
- [x] MEGA-AB-02 — GitHub Actions obtuvo ambos commits/árboles/blobs A/B y publicó `SOURCE_OBJECTS_VERIFIED`, artefacto `13302125750`, run `41787200198` / SHA `44c9ad0`; **0/20 casos ejecutados**.
- [x] MEGA-PI-02 — Pi 1.2.0 TUI + Ollama Beam auténticos despertaron el padre, consultaron `asen_agent_status` y llamaron `asen_agent_ack` para el mismo evento; artefacto `13301807519`, run `41787200198` / SHA `44c9ad0`, fixture hijo de lectura.
- [x] MEGA-PI-03 — Pi RPC hijo Explorer real + Pi TUI padre real con Ollama Beam, status+ack sobre el mismo evento y proyecto inalterado; `PASS_REAL_PI_PARENT_AND_CHILD_BOUNDED` / run `41798018569` / SHA `616d2655bbcec263eea9afe6ce823a32697290d5` / artefacto `13306048302`. No acredita A/B ni Writer.
- [x] MEGA-AB-04 — Inventario de C01–C20 y 60 slots PASS en Actions `41797370720` / SHA `b47244f`, artefacto `13305748173` con `READINESS_ONLY_NOT_EXECUTED`, `evidenceCaptured:0` y `globalFull:false`.
- [x] MEGA-PI-04 — Validador offline de hijo+padre y pruebas negativas de estado, modelo, identidad, ausencia de Writer y orden PASS en preflight `41797370720` / SHA `b47244f`; **el modelo hijo todavía no se ha ejecutado**.
- [ ] MEGA-WRITER-01 — consentimiento humano, rechazo y revocación en archivo exacto, con recibo vivo.
- [ ] MEGA-AB-03 — 40 observaciones A/B y 20 ASEN con per-case A/B/ASEN y fuente verificada.
 
**Auditoría de estado:** el checklist EF conserva **8/28 [x]**. Ninguna de las tareas EF-002, EF-304, EF-601, EF-701 cambia a [x] basándose en código o un CI todavía no observado. EF-503/702 siguen PARCIAL bajo sus requisitos propios; no merge a `main`.

### F7/F6 — primera comprobación de la macrotanda y ajuste de tipos (2026-11-04)

- El run `41786966087`, SHA `0328b190eecdfe7a2d96201fa4c5c84518fe2206`, detuvo `offline-static-validation` en TypeScript `TS2322` en `tests/t12-parent-consumption-grade.test.ts`: la prueba negativa intercambiaba dos posiciones de array que el compilador, con `noUncheckedIndexedAccess`, considera potencialmente `undefined`.
- La corrección usa referencias explícitas no nulas a ambos eventos antes del intercambio, sin cambiar la semántica negativa ni el criterio que exige consulta real previa al acuse. En ese SHA los jobs `ab-frozen-source-witness` y `real-parent-consumption` quedaron omitidos por preflight; **no se consultaron los modelos ni se descargó la referencia como ejecución del workflow**.
- El siguiente commit mantiene el mismo único disparador para Pi/Beam, con ausencia de Writer y cero herencia de resultados entre SHA. Los 8/28 EF verificados no cambian hasta recibir nuevas evidencias positivas.

### Macrotanda F6 — inmutabilidad del resultado terminal (2026-11-04)

**Corrección por inspección del journal; CI nuevo pendiente; FULL NO ALCANZADO.** `AgentNotificationJournal.record` generaba distintos `eventId` para estados finales distintos de un mismo agente, sesión y proyecto. Dos resultados contradictorios (completed/failed) podían por tanto reclamarse y encolarse independientemente aunque ambos describieran la misma ejecución. No se afirma que el fallo haya ocurrido en producción.

- El registro transaccional rechaza un resultado final contradictorio para una identidad ya cerrada, conserva registros idénticos idempotentes y permite agentes de otra sesión/proyecto. El parser rechaza diarios históricos con terminales incompatibles incluso bajo alias equivalentes de Windows, sin modificar los bytes dudosos.
- Regresiones en `tests/agent-notification-journal.test.ts`: conflicto secuencial, carrera entre dos instancias, aislamiento entre sesiones, historial inconsistente y preservación exacta de los bytes. La aceptación sin proveedor las incluye expresamente. Ningún test concede autorización ni prueba el turno padre Pi.
- **Aceptar solo tras recibo exact-SHA**: CI Ubuntu/macOS/Windows, Typecheck, Build, Release Gate, Arquitectura, Pi Runtime, F6 y R4 (SELF_AUDIT_ONLY). Esta publicación no opta a ninguna nueva inferencia Beam ni Writer.
- EF-601/604 quedan PARCIAL hasta que Pi real consuma el resultado y se demuestre recuperación; EF-002/701 y EF-304 permanecen bloqueadas en A/B y consentimiento humano genuino. Total: **8/28 EF verificados**, sin nuevos checks ni FULL.

### Cierre R4 de la macrotanda: A/B source-only y consumo auténtico del padre Pi (2026-11-04)

**Recibos exactos, no simulaciones:** `ASEN real-agent functional acceptance`, run `41787200198` sobre `44c9ad044b7652031e088404c62e5631878fbed7` terminó con `Provider-free static and ASEN validation: SUCCESS`, `Frozen A/B source objects: SUCCESS`, `Real Pi parent notices with Ollama Beam: SUCCESS` y `Writer authorization design lock: SUCCESS`. La aceptación anterior de cinco roles con Beam fue **omitida intencionalmente** para no gastar otras cinco llamadas sin necesidad. El preflight incluyó las pruebas negativas de `tests/agent-ab-source-witness.test.ts` y `tests/t12-parent-consumption-grade.test.ts`.

**A/B, prueba fuente real:** el artefacto `13302125750`, `asen-ab-source-only-44c9ad0-41787200198`, informa `SOURCE_OBJECTS_VERIFIED`, dos repositorios distintos, dos commits exactos, dos árboles exactos y tres blobs de fuente en cada uno. Sus campos `executedCases:0`, `runtimeAttested:false`, `globalFull:false` prohíben expresamente usarlo como paridad A/B. Se marca **MEGA-AB-02**, no EF-002 ni EF-701.

**Pi padre y Ollama Beam auténticos:** el artefacto `13301807519`, `asen-parent-real-44c9ad0-41787200198`, contiene `PASS_REAL_PI_PARENT_BOUNDED` en Pi 1.2.0 Linux con `beam`. El host observó exactamente `result_enqueued → idle_wake → parent_turn_start → status_inspected → acknowledged → parent_turn_end`. El padre llamó a dos herramientas públicas reales, `asen_agent_status` y `asen_agent_ack`; el journal confirmó el mismo `eventId` en `acknowledged`. Proyecto Git descartable inalterado. `childUsesModel:false`, `writerAuthorized:false`, `humanReadConfirmed:false`, `independentReferenceParity:false`, `globalFull:false`. Se marcan **MEGA-PI-01** y **MEGA-PI-02**, no EF-601 completo.

**Writer:** no existe recibo de una decisión humana real. Un diálogo TUI que CI responde con teclas automatizadas demuestra el mecanismo, no consentimiento genuino. MEGA-WRITER-01 y EF-304 quedan sin marcar. Los contratos de permiso, revocación y preservación deben aplicarse a un Writer Pi real controlado por una persona y a un worktree descartable.

**Interferencia de cambios concurrentes reconciliada:** tras `44c9ad0` se publicó `1dd34aad726aa9824ae4a9e9a7ffba0d640412ea`, que añade rechazo de estados terminales contradictorios e incluye nuevas regresiones en el journal; el cambio se conserva. Su `F5 exact-SHA static verification` run `41787331592` falló por `actionlint`/ShellCheck `SC2155` en el script de la nueva prueba Pi: `export ASEN_SELECTED_MODEL="$(cat ...)"` ocultaba el código de salida. Se separa asignación y exportación, sin alterar el modelo elegido, la cuota ni la autoridad. El CI global de dicho SHA estaba aún en ejecución durante esta reconciliación. No se heredan resultados de un SHA a otro.

**Balance de checks tras recibos:** los subchecks MEGA-AB-01, MEGA-AB-02, MEGA-PI-01 y MEGA-PI-02 están `[x]`; MEGA-PI-03, MEGA-AB-03 y MEGA-WRITER-01 siguen abiertos. El plan EF canónico continúa en **8/28 cerrados y 20 abiertos**, porque cada EF requiere todos sus criterios, no solo evidencia parcial. No se declara FULL, no se usa una auditoría automática como independiente y no se fusiona a `main`.

### EF-601 — vinculación de inspección real al mismo agente terminal (2026-11-04)

**Nueva regresión preparada, no recibo exact-SHA todavía.** La primera aceptación Pi/Beam exigía orden de eventos y un acuse durable correcto, pero `status_inspected` no guardaba el ID consultado ni si la respuesta contenía realmente una tarea completada. Un `asen_agent_status` de otra tarea o una consulta general podía satisfacer la condición del auditor si después se confirmaba el evento correcto. El mecanismo de producción de `asen_agent_ack` ya mantiene su propia vinculación temporal; esta corrección endurece la **evidencia del host** y no sustituye la autoridad productiva.

- `scripts/t12-parent-probe.ts`: registrar `agentId` solicitado en la herramienta real y `taskFound` solo cuando la respuesta de `asen_agent_status` incluye `task.record.state === completed`.
- `scripts/t12-parent-consumption-grade.mjs`: exigir identidad exacta `inspection.agentId === result.agentId` y `taskFound === true` antes de admitir `PASS_REAL_PI_PARENT_BOUNDED`.
- `tests/t12-parent-consumption-grade.test.ts`: regresiones negativas para agente distinto, consulta sin ID, tarea no completada y ausencia de resultado.
- **Validación pendiente:** pruebas focales y CI exact-SHA, y nueva ejecución real del padre Pi con Beam solo cuando exista disparador opt-in autorizado; el éxito histórico `41787200198` no prueba este contrato reforzado. EF-601 permanece PARCIAL y el plan EF en 8/28. Sin Writer, sin A/B funcional y sin merge.

### Macrotanda EF-601 — comprobación de respuestas reales de ambas herramientas Pi (2026-11-04)

**Cambio de aceptación propuesto sobre el SHA de esta tanda, sin atribuirle recibos anteriores.** La evidencia de la macrotanda anterior verificaba el ID solicitado a `asen_agent_status` y un booleano `taskFound`, pero no comprobaba por separado el `record.id` realmente devuelto. El acuse se verificaba por el ID solicitado y `acknowledged: true`, sin contrastar los tres campos devueltos por `asen_agent_ack`. El journal de producción tiene sus propias validaciones; el hueco estaba en la **fidelidad del testigo de ejecución real**.

- El testigo registra `returnedAgentId` y `returnedState` de `asen_agent_status`, y `returnedEventId`, `returnedAgentId`, `returnedState` de `asen_agent_ack`. Son valores de respuestas reales de herramientas Pi, no derivados de los argumentos ni inventados por el grader.
- El evaluador exige correspondencia entre el evento encolado, el agente solicitado, el registro devuelto, el acuse solicitado y la respuesta del acuse. Se mantienen los límites de turno, modelo gratuito, ausencia de Writer y conservación del proyecto.
- Se añaden diez casos negativos de identidad, estado y campos omitidos; ninguna respuesta falsa o incompleta debe alcanzar `PASS_REAL_PI_PARENT_BOUNDED`.
- **Criterio de recepción:** typecheck, tests, gates y nueva ejecución Pi/Beam en el SHA exacto. Hasta entonces esta evidencia es solo código revisable. No se marcan nuevos EF ni se declara FULL; se mantienen 8/28.

### EF-601 — opt-in de cuota Ollama Beam autorizado (2026-11-04)

El usuario autorizó expresamente consumir cuota de Ollama. Esta tanda solicita **una única ejecución real** del padre Pi con el modelo gratuito `ollama-cloud/beam` mediante el disparador exacto ya existente `ci: one-time Pi parent Beam proof` en GitHub Actions. El workflow mantiene `github.run_attempt == 1`, el entorno `ollama-cloud-beam`, los secretos gestionados por GitHub, la verificación de SHA, el límite de tiempo y el hijo fixture solo lectura. No se autoriza Writer ni proveedores de pago; no se cambia ningún gate.

**Resultado aún desconocido al crear el commit:** comprobar el job `real-parent-consumption`, el grader reforzado de identidad/estado y el artefacto `asen-parent-real-<SHA>-<run>`. Si falta el secreto, el modelo, el permiso de entorno o la cuota, registrar FAIL/SKIP sin inferir PASS. La ejecución previa no se reutiliza para cerrar EF-601. EF canónico permanece 8/28; no FULL ni merge.

### Macrotanda F6/F7 agrupada — inferencia real también en el hijo y matriz C01–C20 ejecutable (2026-11-04)

**Base y reconciliación.** HEAD de trabajo `139bd3ad97cb55c4411687ef793e918341f27b48`, después de `4a8e16c8a3`, `61ab74a02e`; conserva el endurecimiento que compara `asen_agent_status` y `asen_agent_ack` con el mismo estado terminal. Su aceptación con fixture `41794096740` PASS, pero **no prueba un hijo Pi LLM**. Gates Arquitectura, F5, Release, Pi Runtime, T07 y R4 SELF_AUDIT_ONLY completaron PASS; el CI general seguía en curso en la lectura inicial. Ningún recibo del SHA anterior pasa al nuevo.

**Unidad 1: RPC hijo Pi auténtico con Beam + padre Pi TUI auténtico.**
- Nuevo `scripts/t12-parent-real-child-probe.ts` utiliza `createAsenExtension`, el mismo `AgentRuntime`, las herramientas nativas `asen_agent_status`/`asen_agent_ack` y el journal que usa producción; inyecta `PiProcessRunner` para un **Explorer real** en un proceso Pi RPC independiente.
- El proceso hijo usa `@earendil-works/pi-coding-agent@1.2.0`, proveedor explícito `ollama-cloud`, extensión exactamente `npm:pi-ollama-cloud@0.13.1`, modelo fijo `beam` o `beam:cloud`, credencial aislada `OLLAMA_API_KEY` y `noTools:true`; no se habilita Bash, web, rutas de escritura, grants ni reintento de modelos alternativos. El host Pi guarda únicamente identidad, selección observada, finalización y SHA256 de la salida, nunca el texto del modelo ni secretos.
- Nuevo `scripts/t12-real-child-parent-consumption.mjs` inicia un TUI auténtico y solo una tarea hija leída de un proyecto temporal; el modelo padre debe despertarse y ejecutar las dos herramientas públicas tras el resultado. Su límite es de cinco turnos del padre y un hijo, timeout fijo y limpieza del proyecto. El script **no crea consentimiento Writer**.
- Nuevo `scripts/t12-real-child-parent-grade.mjs` exige eventos reales `child_pi_requested → child_pi_started → child_pi_selected → child_pi_finished → result_enqueued → idle_wake → parent_turn_start → status_inspected → acknowledged → parent_turn_end` con la misma identidad. Verifica selección exacta, respuesta de asistente `message_end`, `agent_end`, huella, ausencia de tool calls y journal duradero `acknowledged`. Rechaza un hijo fixture, otra identidad, modelo no permitido, falta de respuesta o un acuse no correlacionado. `tests/t12-real-child-parent-grade.test.ts` contiene los negativos correspondientes.
- La aceptación en Actions utiliza **el job existente** `real-parent-consumption` y solo se activa para el mensaje `ci: one-time Pi parent-child Beam proof`. La anterior prueba de fixture sigue disponible sin repetirse. La batería Explorer/Planner/Reviewer/Verifier de cinco llamadas permanece omitida para esta tanda. Resultado admisible si pasa: `PASS_REAL_PI_PARENT_AND_CHILD_BOUNDED`, **todavía no C13 FULL**, ni permisos Writer ni prueba de padre ocupado/A/B.

**Unidad 2: escenarios C01–C20 estructurados, pero sin falsa equivalencia.**
- Se incorpora `registry/parity/agent-ab-case-readiness-v1.json`: 20 IDs canónicos con modo, observables mínimos, condiciones de consentimiento y estado `NOT_EXECUTED`. Las casillas que requieren consentimiento humano no se consideran ejecutables sin él.
- `scripts/agent-ab-case-readiness.mjs` enlaza esa matriz a los SHA congelados de A/B y al comparador real existente. Emite `READINESS_ONLY_NOT_EXECUTED` con `casesPrepared:20`, `sourceSlotsRequired:60`, `evidenceCaptured:0`, `casesBlocked:20`, `humanConsentReceived:false` y `globalFull:false`. `tests/agent-ab-case-readiness.test.ts` rechaza ID, orden, permiso, modo, evidencia o SHA inventados.
- El job A/B existente de GitHub Actions verifica commits/árboles reales y ahora guarda también el manifiesto de preparación. Es **preparación auditada**, no ejecución funcional: EF-002/701 y C01–C20 siguen pendientes hasta los registros de cada referencia y ASEN final.

**Unidad 3: límites de autorización y validación.**
- Solo una publicación con tests y preflight sin proveedor, F5/actionlint, auditor de EF, CI general tres OS, Release Gate, R4 como autoauditoría y una ejecución Beam del nuevo padre/hijo. No se relanza el paquete anterior de cinco inferencias.
- EF-601, EF-702 y EF-703 permanecen PARCIAL; EF-002, EF-304 y EF-701 siguen BLOQUEADO. El checklist canónico continúa en **8/28 EF**; no se marca ni un solo EF sin ejecutar los criterios restantes. Los subchecks MEGA-PI-03/04 y MEGA-AB-04 requieren su PASS del SHA nuevo para cambiar a `[x]`; MEGA-AB-03 y MEGA-WRITER-01 siguen abiertos.
- No se publica paquete ni se fusiona `main`. No se afirma consentimiento humano, revisión externa independiente, gratuidad perpetua del proveedor ni FULL.

### F6/F7 — corrección de compilación del primer intento agrupado (2026-11-04)

El SHA `8e752924c52038bf3837fe3305d15d9de2bb6918` activó `ASEN real-agent functional acceptance` run `41797023658`, pero el preflight falló antes de la fase autenticada por **errores de tipo del propio test** `tests/t12-real-child-parent-grade.test.ts`: TS2345 sobre el argumento `undefined` de `assert.throws` y TS2538 sobre índices potencialmente `undefined` en la prueba de secuencia invertida. R4 y Pi Runtime registraron el mismo problema en `typecheck`. **No existe en ese SHA prueba Pi padre+hijo válida ni una llamada Beam de esa fase**; el job remoto fue `skipped`.

Se reemplaza el predicado omitido por `Error` (sin relajar el gate) y se tipan los pares de índices con `as const`, manteniendo las pruebas negativas de falta de modelo, identidades cruzadas, permisos y orden. La siguiente publicación se disparará una sola vez para el nuevo SHA; los 8/28 EF y los nuevos subchecks MEGA mantienen su estado mientras no haya PASS real.

### F6/F7 — recibos de preparación y fallo sintáctico del hijo Pi (2026-11-04)

El run `41797370720`, SHA `b47244facefe53a7a72234f84e8694e999a93a44`, confirmó `Provider-free static and ASEN validation: PASS` y `Frozen A/B source objects: PASS`. El artefacto `13305748173`, `ab-case-readiness.json`, declara `casesPrepared:20`, `sourceSlotsRequired:60`, `evidenceCaptured:0`, `casesBlocked:20`, `modelCalls:0` y `globalFull:false`. Por eso se marcan los checks acotados **MEGA-AB-04** y **MEGA-PI-04** (contrato offline del validador), sin cerrar EF-002/601/701 ni C01–C20.

**Fallo real de la prueba Pi padre/hijo:** el mismo run detuvo `Real Pi parent notices with Beam` antes de invocar el modelo: `SyntaxError: missing ) after argument list` en `scripts/t12-real-child-parent-consumption.mjs:76`, causado por un literal de aserción sin comillas. El intento no dejó recibo `PASS_REAL_PI_PARENT_AND_CHILD_BOUNDED`; **no contar como inferencia auténtica**. La siguiente tanda corrige solo las comillas y la etiqueta de log de éxito, sin cambiar el validador; agrega `node --check` de los cuatro entrypoints ESM al preflight sin proveedor. Ninguna llamada puede autorizarse si vuelve a fallar sintaxis.

**Estado estructural al cerrar este commit:** 8/28 EF cerrados; 6 checks MEGA verificados en su alcance concreto; MEGA-PI-03 (hijo modelo), MEGA-AB-03 (60 ejecuciones) y MEGA-WRITER-01 (consentimiento humano) todavía pendientes. El nuevo test con Beam requiere un recibo exact-SHA propio; tampoco demuestra revisión independiente ni FULL.

### Cierre F6/F7 — consumo real del padre a partir de un hijo Pi que también usa Beam (2026-11-04)

**Prueba ejecutada y recibo examinado, no previsión:** run `41798018569`, SHA exacto `616d2655bbcec263eea9afe6ce823a32697290d5`, job `Real Pi parent notices with Beam (fixture or real RPC child)` **SUCCESS**. Artefacto `13306048302` (`asen-parent-real-616d2655...-41798018569`), archivo `real-pi-parent-child-wake.json`, leído de GitHub Actions. Declaración `schema:"asen-real-pi-parent-child-consumption/v1"`, `status:"PASS_REAL_PI_PARENT_AND_CHILD_BOUNDED"`, `childUsesModel:true`, `childRole:"explorer"`, `childProvider:"ollama-cloud"`, `childModel:"beam"`, `childPiProcessObserved:true`, `childAssistantResponseObserved:true`, `verifiedParentToolActions:2`, `projectUnchanged:true`, `piVersion:"1.2.0"`, `platform:"linux"` y dos SHA256 de evidencia. Se verificaron el `agent_end` y el `message_end` del hijo y la selección de modelo efectivamente observada; el proceso padre efectuó `asen_agent_status` y `asen_agent_ack` sobre el mismo `eventId`.

**Gates de la tanda:** `Provider-free static and ASEN validation` PASS, `Frozen A/B source objects` PASS, `Writer authorization design lock` PASS; la batería de cinco llamadas de Explorer/Planner/Reviewer/Verifier fue `skipped` a propósito y su PASS histórico permanece atado a su SHA anterior. El script tuvo previamente un fallo sintáctico en `b47244f`, corregido por `node --check` como preflight obligatorio en `616d2655`. No reescribir el fallo histórico como PASS.

**Checklist reconciliado:** se marca `[x] MEGA-PI-03` con el recibo real. Los checks MEGA llegan a **7/9**; `MEGA-AB-03` (40+20 trazas auténticas) y `MEGA-WRITER-01` (consentimiento humano vivo) continúan abiertos. Los 28 EF del plan canónico se mantienen en **8/28 verificados**: EF-601/702/703 son PARCIAL porque faltan padre ocupado, recuperación, fallo de cuota y paridad A/B. No hay consentimiento Writer, revisor externo independiente ni FULL.

**Límite de SHA:** el resultado de Pi y el modelo corresponde al candidato `616d2655`; un commit posterior de documentación y checks no hereda automáticamente los gates de CI ni repite inferencias. No se fusiona `main`.

### Macrotanda EXTRA: T09 Windows, C13/C14/C15 continuidad y límites reales de A/B (2026-11-04)

**Incidencia nueva, no cerrada sin CI:** run `41798632460` del HEAD `c4547a23f75920f297d8365d38c262de311ff3d7` deja Release Gate Linux/macOS PASS, Windows FAIL en `Packed install smoke (Windows)`. El `managed upgrade` firmado/TLS localhost llega a descargar los objetos del manifiesto, pero T09 informa `Staging failed: Managed additional-version staging failed: Managed acquisition copy exceeded its cooperative deadline` y retiene la versión activa anterior `0.1.0`. No es evidencia de un update activado incorrectamente ni prueba de PASS. El `CI` general seguía verificando el job Windows.

**Unidad T09-WIN (riesgo de instalación/seguridad):**
- `src/runtime/managed-acquisition-copy.ts` introduce `MANAGED_ACQUISITION_COPY_DEADLINE_MS=60_000`, independiente del plazo estrictamente conservado de `MANAGED_ACQUISITION_DEADLINE_MS=30_000` en la verificación de paquetes. La copia npm empaquetada requiere `fsync`, identidad de descriptor y revalidación de TODOS los ancestros por archivo; el límite Windows anterior era insuficiente. Ambos plazos siguen siendo *cooperativos, monotónicos y finitos*; no se elimina ni se salta un hash, condición de `nlink`, confinamiento de ruta, modo de archivo ni comprobación de identidad.
- `scripts/t09-real-package-smoke.mjs` conserva el flujo real HTTPS firmado→upgrade→verificación del CLI actualizado→datos preservados→rollback→respaldo→recuperación, pero aplica un techo de proceso de 150 segundos **solo Windows** para no matar una copia cooperativa válida de hasta 60 segundos. Linux/macOS retienen 75 segundos. Sigue prohibida una publicación sin los checks de todo el flujo.
- `tests/managed-acquisition-copy.test.ts` comprueba ambos límites y simula el agotamiento del reloj monotónico sin permitir una publicación aparente o mutación del origen. Release Gate ejecutará el test adicional en sus tres sistemas antes del empaquetado. No se reclama corrección hasta PASS del Windows packed install real.

**Unidad F6 (riesgo de duplicación de turnos):**
- Se detectó el estado contradictorio `isIdle()===true` mientras `parentRunActive===true`: antes se elegía `idle`, lo que podía solicitar un turno nuevo con `agentTerminalWakeOptions` aunque el parent tuviera una ejecución viva. `agentParentRoute` ahora responde `hold` y registra el aviso como `pending`, para vaciarlo por la ruta existente al siguiente boundary validado. Esta es una decisión conservadora basada en el host, no una prueba Pi/Beam de padre ocupado.
- `tests/agent-terminal-delivery.test.ts` comprueba ese conflicto. `tests/agent-terminal-routing-journal.test.ts` cubre con journal físico real los cinco estados de entrega: ocupado/steer, inactivo/resultado almacenado + wake, contradicción/hold, compactación/hold y sin UI/headless/pending. También verifica recuperación tras reabrir el journal, `attempted` sin reenvío automático, terminal contradictorio rechazado y que un offline fixture jamás produce por sí solo un `acknowledged` Pi. Se integran en F6 y CI.

**Unidad F7 (riesgo de comparar ecosistemas distintos):**
- Los commits fuente congelados permanecen iguales. A = la referencia de agentes A, paquete el paquete nativo Pi de A con extensión Pi; B = la referencia de entorno B, paquete el paquete instalador de B y módulo Go de provisión. `scripts/agent-ab-source-witness.mjs` lee los blobs Git exactos de `package.json`/ `go.mod`, **sin ejecutar scripts de upstream**, y rechaza metadatos falsificados. El recibo conserva `SOURCE_OBJECTS_VERIFIED`, añade `identicalHostRuntime:false` y `referenceBRequiresProvisionedTarget:true`, para impedir interpretar B como un segundo runtime Pi sin instalar su entorno objetivo.
- `tests/agent-ab-source-witness.test.ts` contiene negativos de paquetes y módulo falsificados; el job fuente A/B exige las clasificaciones de fuente antes de publicar la huella. Esto no captura todavía los 20 casos de B ni cambia `evidenceCaptured:0` o `casesBlocked:20`.

**Checklist de macrotanda, todos sujetos a su propio CI exact-SHA:**
- [x] STAB-01 — **VERIFICADO** Release Gate `41802645970` / SHA `71f5bf89bc844e5f3c27158faeb5a61e1f459b95`: `package` Windows, Linux y macOS 3/3 PASS, incluido Windows `Packed install smoke` con actualización firmada, rollback, backup y uninstall; tres artefactos de sesión retenidos.
- [x] STAB-02 — **VERIFICADO en alcance T09** `src/runtime/managed-acquisition-copy.ts` + `tests/managed-acquisition-copy.test.ts`, Release Gate `41802645970` / SHA `71f5bf89bc844e5f3c27158faeb5a61e1f459b95`, 3/3 PASS: copia cooperativa 60 s, verificación 30 s y fallo sin staging aparente. Las pruebas de inyección en `tests/managed-acquisition-update.test.ts` usan todavía el límite anterior y se corrigen en esta revisión; CI global no estaba verde.
- [x] STAB-03 — **VERIFICADO** `tests/agent-terminal-routing-journal.test.ts` + `src/runtime/agent-terminal-delivery.ts`: 5 rutas del host y busy/idle contradictorio PASS, CI `41803698313` / SHA `3e74b1982a18c2a1b3533658f5aff507d185de0b` (3 OS). No acredita aún padre Pi real ocupado.
- [x] STAB-04 — **VERIFICADO** `tests/agent-terminal-routing-journal.test.ts` + `src/runtime/agent-notification-journal.ts`: reinicio con `attempted`, sin doble envío ni ack inventado, PASS, CI `41803698313` / SHA `3e74b1982a18c2a1b3533658f5aff507d185de0b` (3 OS). No acredita recuperación en Pi con modelo real.
- [x] STAB-05 — **VERIFICADO** `scripts/agent-ab-source-witness.mjs` + `tests/agent-ab-source-witness.test.ts`: procedencia A/B y divergencia de entornos Pi vs Go PASS, CI `41803698313` / SHA `3e74b1982a18c2a1b3533658f5aff507d185de0b`. Sigue `executedCases:0`.

**R4 autoauditoría de riesgo (NO independiente):** los cambios de T09 amplían solo el tiempo de una COPIA cooperativa, no la autoridad de instalación ni el plazo de VERIFICACIÓN; la ruta `hold` impide el segundo turno contradictorio y no concede permisos; el clasificador A/B trata blobs como datos, sin descargar plugins ejecutables ni inferir paridad. EF sigue **8/28**, MEGA **7/9** hasta obtener pruebas adicionales; no Writer humano, FULL ni merge a main.

### Reconciliación T09 Windows real y fix de tests ligados al plazo (2026-11-04)

El Release Gate `41802645970` / SHA `71f5bf89bc844e5f3c27158faeb5a61e1f459b95` terminó **SUCCESS** en package Linux, macOS y Windows. Los artefactos `package-sessions-{Linux,macOS,Windows}-71f5...` permanecen enlazados al mismo SHA. El flujo real firmado, instalación, upgrade y rollback empaquetados alcanzó PASS en Windows por primera vez desde el fallo `41798632460`. Esto cierra acotadamente STAB-01 y STAB-02, **no** EF-703 ni FULL.

El CI completo `41802645690` detectó tres regresiones en `tests/managed-acquisition-update.test.ts` (Windows) que aún fijaban artificialmente `now=30001` y, por tanto, **dejaron de disparar un rechazo después de separar el plazo COPIA a 60 s**. Son tres pruebas de cierre de descriptores y escritura parcial que deben seguir rechazando una operación cuando realmente vence el presupuesto. Se sustituyen sus tres puntos de inyección por `now=MANAGED_ACQUISITION_COPY_DEADLINE_MS+1`, sin modificar el cuerpo del staging ni relajar sus expectativas de cierre único, ruta retenida, no publicación y datos preservados. El source verifier conserva 30 s.

Además `Phase 0 Architecture` `41802645916` FAIL por nombres externos en código/tests/ODD. La identidad de paquetes y módulo se movió al registro de procedencia auditado, no se amplió el allowlist del auditor. Se requieren ahora **ambos** gates, CI global y arquitectura, PASS en el nuevo SHA; el PASS anterior de T09 se cita como recibo acotado, no como garantía del HEAD posterior.

**Balance tras reconciliar:** checks STAB-01/02 `[x]`, STAB-03/04/05 pendientes del CI nuevo; EF 8/28 y MEGA 7/9. No Writer autorizado, no auditor externo y ninguna ejecución A/B C01–C20 certificada.

### Macrotanda AB-HOST / Provider Security — fuente ejecutable y cierre de estabilización (2026-11-04)

**Base reconciliada:** el HEAD `3e74b1982a18c2a1b3533658f5aff507d185de0b` terminó con `Release Gate` run `41803698306` **SUCCESS 3/3 (Linux, Windows, macOS)** y `CI` run `41803698313` **SUCCESS**, incluidos los tres jobs de test. Los avisos de deadline T09 Windows y regresiones de copia ya están resueltos en ese alcance. En los logs aparecen `ok` para la ruta busy/idle `EF-601 C13`, el reinicio incierto `EF-604 C14/C15` y el test Windows de plazo de copia. Por ello se marcan ahora STAB-03/04/05 como **subchecks de estabilización**, sin declarar completos EF-601, EF-604, EF-701 ni FULL.

**Unidad 1 — Ejecutar hosts fuente A/B, no solo descargar archivos:** `scripts/agent-ab-host-smoke.mjs` obtendrá los dos commits SHA+tree congelados desde sus repositorios originales, realizará checkout en dos carpetas efímeras y ejecutará únicamente `--help` del punto de entrada Node/Pi de A y del ejecutable Go compilado de B. Entorno reducido sin credenciales, `PI_OFFLINE=1`, `GOTOOLCHAIN=local`, `GOFLAGS=-mod=readonly`, plazo y captura de salida acotados; las respuestas se conservan solo como huellas SHA-256 y tamaño, no texto libre. No se instala el ecosistema, no se activa proveedor y no hay permisos Writer. El resultado admisible se denomina `REFERENCE_HOST_HELP_ONLY` con `executedCases:0`, `referenceBProvisioned:false`, `fullParity:false`. La presencia de binarios y ayuda **no equivale** a ninguna de las 60 ejecuciones C01–C20.

**Unidad 2 — Verificador adversarial de host:** `tests/agent-ab-host-smoke.test.ts` ejecuta el flujo completo con dobles deterministas de comandos externos, confronta URL+SHA+árbol y rechaza reescritura de fuentes, resultados de ayuda vacíos, repositorios equivocados, falsificación de modelCalls/paridad o confusión del instalador Go de B con el runtime Pi de A. El workflow existente `ASEN real-agent functional acceptance` incorpora un job A/B separado `ab-native-host-smoke`, subordinado a ambos preflight y witness de objetos, con Go 1.25.10, disparador exacto `ci: one-time A/B native host smoke` y artefacto independiente. No relanza las llamadas de Beam previas.

**Unidad 3 — ECO-07/EF-702, privacidad ante fallos del proveedor:** `src/runtime/eco07-provider-failure.ts` dejará de devolver el `errorMessage` arbitrario de una respuesta Pi (puede incluir tokens, prompt, URL o secuencias terminales). Devuelve exclusivamente `Provider rate limit (HTTP 429)`, `Provider quota exhausted` o `Provider rate limit`. La prueba correspondiente exige además que un texto con secreto sintético no se publique. El cierre de cuotas auténticas y recuperación de proveedor **no se infiere** de una prueba local de clasificación.

**Checklist de este corte:**
- [x] ABSEC-01 — Release Gate exact-SHA `41803698306` y CI completo `41803698313`, tres OS, PASS; T09 preserva verificaciones y plazos finitos.
- [x] ABSEC-02 — STAB-03/04/05 respaldados con tests y CI exact-SHA, sin reclamar Pi real ocupado ni paridad A/B.
- [x] ABSEC-03 — **VERIFICADO** runtime `--help` de A (Node/Pi) y compilación + `--help` de B (Go) en dos checkouts Git con SHA y árbol exactos; ambos exit 0 y Git limpio. `scripts/agent-ab-host-smoke.mjs` + `tests/agent-ab-host-smoke.test.ts` · Actions run `41810325787` / SHA `cd114cbde1f31b5a45030acd39e30888ee0584cb`, artefacto `13312266529` `REFERENCE_HOST_HELP_ONLY`. `executedCases=0`.
- [ ] ABSEC-04 — Clasificación de cuotas normalizada y sanitizada supera las pruebas de CI exact-SHA y el auditor de seguridad.

**Estado global:** el plan mantiene **8/28 EF y 7/9 MEGA**, pendientes de acciones humanas Writer, A/B C01–C20 y auditoría verdaderamente independiente. Una ejecución de `--help` no marca `MEGA-AB-03` ni `EF-701`. No se hace merge a `main`.

### AB-HOST — preflight de primera publicación y corrección de expectativa (2026-11-04)

Run `41808663891` / SHA `792e76bef34abe872eb84597b291762025575378`: `Provider-free static and ASEN validation` FAIL en `tests/agent-ab-host-smoke.test.ts` por una **expectativa de texto incorrecta**. El mock devolvió realmente `A/B executable source mismatch for A` al simular un commit Git falsificado; la aserción esperaba `identity mismatch`. El propio mecanismo de rechazo funcionó como estaba diseñado. Preflight focalizado: 220 PASS, 1 FAIL. Jobs remotos `ab-frozen-source-witness`, `ab-native-host-smoke` y Pi/Beam quedaron SKIPPED, por dependencia; **no existe recibo remoto A/B de este SHA**. El test ahora acepta el código de rechazo exacto sin cambiar la comparación del commit o del árbol. Se solicita un nuevo único disparador de CLI nativo después de preflight íntegro, sin repetir inferencias Beam, Writer ni cuota.

### AB-HOST / ECO-07 — segundo preflight, rechazo HTTP 429 real (2026-11-04)

El run `41808956830` / SHA `8c26bb38acb1331c4bf6808fda63dba03497f0c1` pasó TypeScript, compilación y pruebas focalizadas del host A/B; fallaron **dos regresiones ECO-07** durante F6, porque el detector de `429` tenía barras invertidas duplicadas: `/\\b429\\b/u` buscaba literalmente `\\b` en lugar de un límite de palabra. El clasificador seguía devolviendo mensajes normalizados sin secretos, pero no detectaba el código numérico. Se sustituye por `/\b429\b/u` con dos límites regex reales; se conservan la clasificación genérica `Provider rate limit (HTTP 429)` y las negativas de exposición de tokens/URL/prompts. El job `ab-native-host-smoke` volvió a quedar **SKIPPED**, sin trabajo externo ni gasto de modelos. No se relaja el preflight; la siguiente ejecución verificará el cambio en el SHA nuevo. ABSEC-03 y ABSEC-04 continúan `[ ]` hasta recibos completos.

### AB-HOST — ejecución real de ambos puntos de entrada y reparación segura de CI (2026-11-04)

- **Fuente ejecutada:** run `41809353273`, SHA `a75fbf30a2475caf4867d83b36c8f1a503dcb56a`. El preflight y el witness de fuentes congeladas son PASS. El job `Native A/B pinned CLI help` alcanzó `ASEN_AB_NATIVE_HOST_HELP_ONLY` y produjo huellas SHA-256 de la ayuda real de A (Node/Pi) `f65425655f26c3904409511bb51d9d308f4c81583b664d9509088a0b0feec4b2` y B (Go) `6bffa35a3021a0d1be58edd7c24ebc610f3dd570e9be9de24cd723767fa7a8ad`. El job **no terminó en PASS** porque `rmSync` intentó borrar el caché de módulos Go con directorios de solo lectura y obtuvo `EACCES`. El resultado de ambos puntos de entrada es observable en el log, pero **no hay recibo de artefacto final de aceptación**. El nuevo intento usa `GOFLAGS=-mod=readonly -modcacherw` para conservar el modo de descargas Go en su caché temporal; mantiene el rechazo de modificaciones al checkout original.
- **Arquitectura:** `Phase 0 Architecture` run `41809360009` detectó nombres de referencias externas en el código/test nuevo, fuera del manifiesto de procedencia autorizado. La corrección no añade permisos ni excepciones al auditor: A resuelve la ruta de su ejecutable desde `package.json/bin` del commit congelado y B deduce la ruta Go del repositorio ya validado en `registry/parity/agent-ab-baselines-v1.json`. Los nombres externos dejan de estar escritos en `scripts/agent-ab-host-smoke.mjs` y `tests/agent-ab-host-smoke.test.ts`. El test simulado de checkout construye el `package.json` correspondiente para ejercer esta ruta nueva. Este cambio debe acreditar PASS del auditor en el SHA nuevo, no heredar el fallo del anterior.
- **Afirmaciones acotadas:** ninguna de estas pruebas implica un agente funcionando en A/B bajo C01–C20, permisos Writer, un runtime B ya provisionado, consentimiento humano ni FULL. `ABSEC-03` y `MEGA-AB-03` siguen sin marcar mientras no exista un recibo de job completo. El clasificador de errores 429 tuvo PASS en el preflight de este SHA, pero `ABSEC-04` seguirá pendiente hasta el cierre exact-SHA de la publicación consolidada.
- **Acción:** una sola nueva publicación para corregir fuente ejecutable A/B, limpieza y auditoría, con los gates habituales y sin repetir las cinco inferencias de Beam.

### AB-HOST — corrección TS de la prueba sintética (2026-11-04)

Run `41810035714` / SHA `255288e7fa1c0e9234226edb5ba48eb285391353`: la Arquitectura sí pasó, pero el preflight y R4 se detuvieron en `TS2345` de `tests/agent-ab-host-smoke.test.ts:34`: el test de checkout simulado pasaba `args[1]` como `string | undefined` bajo `noUncheckedIndexedAccess`. Se afirma expresamente `args[1]!` tras una estructura de argumentos de Git controlada por el harness; la producción no cambia. No se ejecutó el job remoto de referencia en ese SHA. El nuevo commit mantiene 8/28 EF, 7/9 MEGA; ninguna llamada adicional Beam ni permiso Writer.

### AB-HOST — dos binarios fuente ejecutados y recibo exacto (2026-11-04)

**Prueba externa, no inferida:** `ASEN real-agent functional acceptance` run `41810325787`, SHA `cd114cbde1f31b5a45030acd39e30888ee0584cb`. `Provider-free static and ASEN validation`, `Frozen A/B source objects` y `Native A/B pinned CLI help` terminaron **SUCCESS**. Artefacto `asen-ab-native-host-cd114cb...-41810325787`, ID `13312266529`, inspeccionado como JSON: `schema:"asen-ab-native-host-smoke/v1"`, `status:"REFERENCE_HOST_HELP_ONLY"`, dos entradas, `exitCode:0` ambas, `repositoryClean:true` ambas, `outputSha256` A `f65425655f26c3904409511bb51d9d308f4c81583b664d9509088a0b0feec4b2` (7219 bytes) y B `6bffa35a3021a0d1be58edd7c24ebc610f3dd570e9be24cd723767fa7a8ad` (4744 bytes). Se han verificado los commits y árboles del manifiesto de procedencia exacto. `modelCalls:0`, `executedCases:0`, `writerAuthorized:false`, `referenceBProvisioned:false`, `fullParity:false`. Se marca **ABSEC-03**, **no** MEGA-AB-03 ni EF-002/701: una ayuda CLI ejecutada no es una observación C01–C20.

**Integridad y límites:** el auditor de arquitectura `41810332860`, F5 `41810333103`, Pi Runtime `41810332912`, CodeGraph `41810332957`, R4 autoauditoría `41810332907` y Release Gate `41810333053` están en PASS para este SHA. El CI general `41810332929` permanece en curso mientras se redacta este recibo; `ABSEC-04` todavía no se cierra hasta observar el resultado exact-SHA. La clasificación ECO-07 se normaliza, no copia errores del proveedor y no autoriza reintentos ni costes. FULL y Writer humano siguen pendientes.

### Macrotanda de estabilización T09, integridad de bloqueo y aceptación A/B real (2026-11-04)

**Receipts ya comprobados, sin reclamar paridad inexistente.** `ASEN real-agent functional acceptance` run `41810325787`, SHA `cd114cbde1f31b5a45030acd39e30888ee0584cb`, produjo `Native A/B pinned CLI help: SUCCESS`, además de `Provider-free static and ASEN validation: SUCCESS`, `Frozen A/B source objects: SUCCESS` y `Writer authorization design lock: SUCCESS`. Artefacto de host `13312266529` de tamaño acotado. El ejecutable Node/Pi A y el instalador Go B llegaron a su ayuda real, con los objetos Git congelados; **no** se ejecutaron C01–C20 ni se obtuvo un runtime B equivalente. Se marca **ABSEC-03 [x]** por esa prueba estricta de arranque, no EF-002/701.

**Release Gate T09 cerrado en alcance de empaquetado.** Run `41810333053`, SHA `cd114cb`, `package (ubuntu-24.04)`, `package (windows-latest)` y `package (macos-latest)` **SUCCESS 3/3**. La copia gestionada Windows de 60 s y la verificación acotada de fuente de 30 s no necesitan elevarse de nuevo ni eludir controles. Se conserva el fallo histórico en `41798632460` como diagnóstico ya subsanado, no se presenta como estado actual.

**Nueva unidad de seguridad de bloqueo de mantenimiento Windows.** La suite completa Windows `41809359743`, SHA `a75fbf30a2475caf4867d83b36c8f1a503dcb56a`, detectó `tests/managed-maintenance-lock.test.ts` / `copied marker bytes on a different physical file are retained`: el candado podía considerar propio un archivo sustituido por otro de igual contenido y metadatos redondeados. La comparación anterior de `Stats` usaba solo `dev`, `ino` y `birthtimeMs`; un reloj de precisión milisegundo en Windows no proporciona identidad suficientemente precisa si se reescribe muy rápido.

- `src/runtime/managed-maintenance-lock.ts` cambia la prueba de **propiedad física** al `BigIntStats` capturado después de `writeFile` y `sync` del descriptor original. Un marcador se retira solo si el archivo actual conserva ID de archivo no nulo (`ino > 0`), dispositivo, único enlace, modo, tamaño, `birthtimeNs`, `ctimeNs` y `mtimeNs`, en observaciones anterior y posterior a la comprobación de bytes. Si el sistema no demuestra identidad, el archivo se **retiene**. No se conceden permisos de escritura ni se sustituyen los controles de ownership/canonical paths.
- `tests/managed-maintenance-lock.test.ts` añade pruebas de metadatos BigInt alterados (identidad de archivo, creación, cambio, modificación o enlaces); mantiene el caso real de sustitución por copia con bytes idénticos. Ninguna prueba que falle por identidad se transforma en `skip`.
- El nuevo cambio **no modifica** los plazos de adquisición, URLs remotas, rollback, instalación activa o permisos Writer. Debe obtener CI Windows + macOS + Ubuntu sobre **su propio SHA** y Release Gate correspondiente antes de cerrar cualquier subcheck de esta intervención.

**Checklist granular T09 (nuevo; independiente de los 28 EF y 9 MEGA):**
- [ ] T09-LOCK-01 — Pruebas de huellas BigInt y sustitución de un bloqueo de mantenimiento PASS en Windows, Linux y macOS, CI exact-SHA nuevo.
- [ ] T09-LOCK-02 — Release Gate 3/3 PASS y suite general completa tras el cambio de propiedad física del candado, sin nuevas retenciones legítimas.
- [ ] T09-LOCK-03 — Conservación de un bloqueo ajeno, fallo de cierre, estado original y archivos de usuario, sin elevación de autoridad, bajo regresión exact-SHA.

**Balance:** 8/28 EF completos, 7/9 MEGA completos. ABSEC-03 pasa a `[x]` por recibo real A/B de ayuda; ABSEC-04 depende de la suite global y del auditor de seguridad exact-SHA. EF-002/601/604/701/702/703 mantienen requisitos auténticos abiertos, y FULL NO alcanzado. No merge a `main`.

### Megatanda T09/ECO-07 — ampliación adversarial de regresiones (2026-11-04)

**Estado: IMPLEMENTED_PENDING_EXACT_SHA_CI.** Se amplían dos suites de seguridad sin cambiar el runtime ni las políticas:

- `tests/managed-maintenance-lock.test.ts`: rechazos adicionales de inode cero, dispositivo distinto, modo modificado y tamaño alterado; conserva los casos de sustitución física, hardlinks, tiempos nanosegundo y raíz reemplazada. Son pruebas de contrato local, no demostración de una carrera externa concurrente.
- `tests/eco07-provider-failure.test.ts`: prioridad de HTTP 429 frente al texto de cuota cuando coexisten, ausencia de filtración de secretos sintéticos y rechazo de estructuras Pi inválidas. No se crean reintentos automáticos ni cambios de proveedor o coste.

**Evidencia previa de la rama `8f848a037ab0f6d0a51c09fd5db26af482e45820`:** Phase 0, F5, Pi Runtime, CodeGraph, R4 y Release Gate SUCCESS; CI Ubuntu y macOS SUCCESS, Windows todavía `in_progress` durante la revisión. El cierre de `T09-LOCK-01/02/03` y `ABSEC-04` permanece sin marcar mientras no exista la suite global PASS del SHA de este commit. Esta ampliación no eleva EF ni MEGA a FULL, no ejecuta A/B C01–C20, no usa cuota de modelo y no autoriza Writer.

### Macrotanda EF-701 — recibos de observación con lectura acotada y anclaje físico (2026-11-04)

**Estado: IMPLEMENTED_PENDING_EXACT_SHA_CI; FULL NO ALCANZADO.** La auditoría de evidencia observacional usaba `lstat + realpath` seguidos de `readFile(path)`: una sustitución o ampliación posterior a la primera comprobación podía cambiar qué bytes se leían o permitir una lectura de tamaño no acotado. El resultado anterior seguía siendo `INTEGRITY_ONLY`, pero esa carrera no debe contaminar ni siquiera un recibo de integridad.

- `scripts/agent-observable-receipts.mjs` abre un descriptor de solo lectura, exige identidad de fichero nativa no nula, un único enlace y ruta canónica; lee como máximo 256 KiB + 1 byte para detectar ampliaciones y contrasta dispositivo/inodo, enlaces, modo, tamaño y marcas nanosegundo antes y después, tanto por descriptor como por ruta. Aplica `O_NOFOLLOW` donde el sistema lo admite. Toda duda produce `RECEIPT_FILE_UNAVAILABLE_OR_UNSAFE`, nunca una certificación.
- `tests/agent-observable-receipts.test.ts` comprueba divergencias de identidad física, rechaza un recibo con hardlink, y cubre el límite inclusivo de 256 KiB y su sobrepaso sin promoción a FULL. El auditor no descarga modelos ni ejecuta código de referencias.
- El límite de evidencia permanece: un digest local coincide con un archivo, **no** demuestra que A/B o ASEN hayan ejecutado C01–C20 bajo un host independiente. Los 60 escenarios y las decisiones humanas Writer continúan abiertos.

**Checklist específico sin sustituir las 28 tareas EF:**
- [ ] EF701-RCPT-01 — Typecheck, tests focalizados y auditoría de arquitectura sobre el SHA exacto de esta macrotanda.
- [ ] EF701-RCPT-02 — CI general en Windows, macOS y Ubuntu + Release Gate exact-SHA PASS con el lector acotado.
- [ ] EF701-RCPT-03 — Recibos independientes reales A/B/ASEN; **BLOQUEADO** hasta disponer del entorno B y 60 observaciones ejecutadas.

No se modifica el estado EF-701 [ ], EF-704 [ ], MEGA-AB-03 [ ] ni se autoriza merge a `main`.

### Macrotanda EF-701 — rechazo de alias simbólicos (2026-11-04)

**Implementación de regresión, pendiente de CI exact-SHA:** se añade un test de seguridad que intenta sustituir un recibo por un enlace simbólico al mismo contenido y, después, sustituir su directorio padre por un enlace simbólico. Ambos deben producir `RECEIPT_FILE_UNAVAILABLE_OR_UNSAFE` y mantener `globalFull:false`. Se verifica que la igualdad de bytes o digest no autoriza una ruta alternativa. No se altera el runtime ni se relajan gates.

**Evidencia previa observada en HEAD e866c2d:** Release Gate, arquitectura, F5, Pi runtime, CodeGraph y R4 PASS; CI Ubuntu PASS, Windows/macOS pendientes durante la consulta. Los tests añadidos requieren nuevo CI exact-SHA antes de marcar EF701-RCPT-01/02. EF-701 y EF-704 continúan abiertos: no hay ejecución independiente de C01–C20 ni consentimiento Writer genuino. No se consume cuota Ollama porque esta regresión es local y no requiere inferencia; el consumo futuro sigue condicionado a carriles reales y límites de cuota.

### EF-601/604 — tanda Pi ocupado + recuperación duradera (2026-11-04)

**Estado: IMPLEMENTED_PENDING_LIVE_CI.** Se incorpora una vía real opt-in para probar la ruta `run` del coordinador Pi, que hasta ahora tenía cobertura simulada y evidencia real solo de la ruta `idle`. Se usa un Explorer hijo Pi RPC de solo lectura y un padre Pi TUI con Ollama Beam. No se autoriza Writer.

- `scripts/t12-parent-real-child-probe.ts` incorpora una herramienta de aceptación aislada `asen_busy_parent_probe` que arranca **un único** Explorer y mantiene un tool call real del padre activo hasta recibir la notificación de ASEN. Registra los eventos del host `parent_turn_start`, `busy_tool_started`, `result_enqueued`, `busy_tool_finished`, consulta real de estado y acuse. No se espera por sondeo del estado del agente.
- `scripts/t12-real-child-parent-consumption.mjs` admite `ASEN_PARENT_WITNESS_MODE=busy`; el grader exige señal nativa `isIdle=false`, actividad efectiva del turno, `triggerTurn:true` y `deliverAs:steer`, **cero** `idle_wake`, un solo evento y acuse duradero en el mismo proyecto/sesión. El padre debe usar las herramientas de estado y acuse después de salir del tool call. Cualquier timeout, cambio de modelo o estado, falta de uso de herramientas o evento duplicado es FAIL.
- `tests/t12-real-busy-parent-grade.test.ts` aporta cobertura negativa de rutas sustituidas, actividad falsificada, duplicados, estados no confirmados y modelos ajenos. El workflow incluye pruebas sin proveedor y una ejecución real opt-in bajo `ci: one-time Pi busy-parent Beam proof`, con entorno `ollama-cloud-beam`, `run_attempt == 1`, SHA exacto, límite de tiempo y artefacto `real-pi-parent-child-busy.json`.
- La recuperación tras interrupción mantiene el contrato existente `pending/attempted/enqueued/acknowledged` y sus tests multiproceso. **No se declara recuperado un proceso Pi auténtico** sin un recibo separado con corte, reinicio y revisión humana de efectos inciertos.

**Checks de la tanda:**
- [x] EF601-BUSY-01 — **VERIFICADO:** Typecheck, build y pruebas negativas del grader en preflight `41815369175` / SHA `0578c3f17150d649f95296819c70a002380d791d` / job Provider-free static and ASEN validation SUCCESS.
- [x] EF601-BUSY-02 — **VERIFICADO:** Pi TUI ocupado + Explorer Pi RPC auténtico, Ollama Beam, entrega `steer` sin `idle_wake`, status+ack real y proyecto intacto: Actions `41815369175` / SHA `0578c3f17150d649f95296819c70a002380d791d` / artefacto `13313944479`; `PASS_REAL_PI_BUSY_PARENT_AND_CHILD_BOUNDED` y `globalFull:false`.
- [ ] EF601-BUSY-03 — CI tres sistemas y Release Gate exact-SHA PASS. CI `41815376939` y Release Gate `41815376988` estaban en ejecución durante la recepción del test Beam; no heredar pruebas incompletas.
- [ ] EF604-RESTART-01 — Recuperación Pi auténtica tras reinicio con entrega `attempted` sin reejecución ni permiso supuesto: **BLOQUEADO** sin experimento de reinicio provisionado. Se añade una regresión separada de terminación/reapertura de proceso Node, que prueba solo el journal, pendiente de CI.

EF-601/604 y C13–C15 continúan **PARCIAL**; A/B C01–C20 siguen sin ejecuciones completas, Writer humano bloqueado y FULL NO ALCANZADO. No merge a `main`.

### Recepción EF-601 Busy y nueva regresión EF-604 (2026-11-04)

El job `Real Pi parent notices with Beam` del run `41815369175` / SHA `0578c3f17150d649f95296819c70a002380d791d` finalizó **SUCCESS**. El log real informa `T12_REAL_PI_BUSY_PARENT_CHILD_CONSUMPTION_PASS` y el grader `PASS_REAL_PI_BUSY_PARENT_AND_CHILD_BOUNDED`, dos acciones verificadas del padre, `globalFull:false`; el artefacto `13313944479` contiene el recibo exact-SHA. El preflight provider-free y el witness A/B source-only también son SUCCESS. Se marcan **EF601-BUSY-01/02**, pero **no EF-601**: la comparación B provisionada, A/B C13 y las pruebas reales de reinicio permanecen abiertas.

**EF-604 — proceso real terminado en límite de entrega:** `tests/agent-notification-restart-process.test.ts` ejecuta un proceso Node independiente que registra una notificación terminal y sale con estado 73 justo después de un claim duradero, antes del transporte. Otro proceso independiente abre el mismo journal, intenta registro/reclamación/acuso y debe verificar: mismo ID, `attempted` intacto, `claim=false`, acuso rechazado, bytes sin cambios y aislamiento de sesión. Es una regresión del almacenamiento de producción, **no** la recuperación de un host Pi real ni una confirmación de modelo. El workflow la ejecuta dentro de F6 sin credenciales ni cuotas. La publicación requiere su CI exact-SHA; no se marca EF604-RESTART-01 ni EF-604.

Se mantienen las restricciones de permisos; Writer humano y paridad C01–C20 siguen pendientes. Sin merge a `main`.

### MEGATANDA — EF-403/502 RED→GREEN + dos agentes reales Pi (2026-11-04)

**Implementación preparada para CI exact-SHA y prueba Beam opt-in; ningún EF canónico promovido.** Esta unidad combina una regresión real de tres defectos con una nueva comprobación de Reviewer/Verifier sobre el resultado corregido. El harness corrige exclusivamente archivos creados en un directorio temporal; no ejecuta un Writer ni modifica código del repositorio mediante el modelo.

- `scripts/t12-revalidation-contract.mjs`: prueba tres defectos RED, corrige `src/access.js`, `src/parse.js` y `src/pricing.js` de un fixture desechable, verifica GREEN, compara SHA-256 de antes/después y conserva `README.md` y la topología exacta. `tests/t12-revalidation-contract.test.ts` incluye prueba positiva de ejecución y rechazos de resultados falsos, scope duplicado, SHA/huellas modificadas, razones genéricas y elevación Writer.
- `scripts/t12-real-repair-revalidation.mjs`: dos invocaciones separadas mediante Dispatcher/ArtifactRunner/PiProcessRunner ya integrados. Modelo registrado `ollama-cloud/beam` exclusivamente, `noTools:true`, resultado emitido con prueba de identidad ASEN; Reviewer y Verifier sobre el mismo candidato e informe de tests verificados. El segundo recibe el SHA-256 de la respuesta del primero. Dos reservas `1.claim` y `2.claim` de creación exclusiva antes de cada llamada; ni reinicio ni rerun reaprovechan un slot dentro del run.
- `.github/workflows/asen-real-agent-acceptance.yml`: job `real-repaired-review` aislado y opt-in con mensaje exacto `ci: one-time Pi repaired-review Beam proof`, SHA del commit, entorno con secreto `ollama-cloud-beam`, `run_attempt == 1`, sin fallback, timeout y artefacto `asen-repaired-review-<SHA>-<run>`. El preflight incluye el nuevo test sin consumir cuota.
- `EF-604` cerró únicamente la comprobación **Node multiproceso** `41815920521` / SHA `9d5d764a1258f8f48c24210e7d2375a2a189e50b`: preflight SUCCESS y terminal de proceso `attempted` no reproducible. El reinicio real del host Pi permanece abierto.

**Subchecks de la megatanda:**
- [x] EF604-NODE-01 — Proceso independiente terminó después del claim y otro lo reabrió sin replay/ack, prueba focal `tests/agent-notification-restart-process.test.ts` incluida en preflight `41815920521`, SHA `9d5d764a1258f8f48c24210e7d2375a2a189e50b`.
- [x] EF403-FIX-01 — **VERIFICADO en preflight provider-free:** RED 3/3, GREEN 3/3, PRESERVE en `tests/t12-revalidation-contract.test.ts` y código `scripts/t12-revalidation-contract.mjs`, Actions `41819341700` / SHA `4b15c494a8cad718b30d1b2c4e06eceebd4de15e` (Ubuntu). No equivale a Writer Pi con consentimiento.
- [x] EF403-FIX-02 — **VERIFICADO solo en SHA histórico `ebf5515d140a1f73f0d15f3060f1012500261994`:** Ollama Beam real Reviewer + Verifier, dos llamadas `noTools`, resultado `EF403_REPAIRED_READONLY_REVALIDATION_PASS`, Actions `41818629889` / artefacto `13315214638`. No equivale a ejecución Writer real ni acredita el SHA posterior.
- [x] EF502-REVIEW-01 — **VERIFICADO en alcance de fixture read-only:** rechazo negativo anterior en `41783370317` y validación positiva independiente por rol, pero **mismo modelo/proveedor**, en `41818629889` / SHA `ebf5515d140a1f73f0d15f3060f1012500261994` / artefacto `13315214638`; no equivale a revisión independiente externa ni comparación A/B.
- [ ] EF604-PI-RESTART — Recuperación de un host Pi real interrumpido, sin retransmisión incierta y sin permiso inventado; sigue pendiente.

**Limitaciones:** revisión de dos roles en el mismo proveedor no es auditoría externa independiente; corregir un fixture no equivale al flujo Writer con consentimiento humano genuino; A/B C01–C20 siguen sin 60 observaciones reales. El total canónico permanece **8/28**, FULL no alcanzado, sin merge a `main`.

### Megatanda EF-403/502 + EF-604: inmovilidad del fixture y autoridad del acuse (2026-11-04)

**Recepción real:** la ejecución `41818629889` del commit `ebf5515d140a1f73f0d15f3060f1012500261994` terminó `SUCCESS` en preflight y en el job `EF-403 real corrected read-only Reviewer and Verifier with Beam`, artefacto `13315214638`. El registro real imprime `EF403_REPAIRED_READONLY_REVALIDATION_PASS` con RED 3/3, GREEN 3/3 y `globalFull:false`. El resultado corresponde **solo a aquel SHA**; no se hereda automáticamente al nuevo HEAD.

**Nuevas regresiones seguras, pendientes de CI exact-SHA:**
- `scripts/t12-revalidation-contract.mjs` elimina credenciales de los subprocesos de assertions y comprueba además la integridad exacta de `README.md`, `package.json` y estructura de directorios **después** de las respuestas del modelo. `tests/t12-revalidation-contract.test.ts` introduce alteración de README, package y archivo de código como fallos obligatorios.
- `tests/agent-notice-ack-tool.test.ts` reinicializa la registración de herramientas (simulación controlada de un nuevo proceso del coordinador), rechaza un acuse heredado de una inspección previa, demuestra que listar no equivale a inspeccionar el agente y que una entrega `attempted` no queda confirmable aun tras consulta. Solo una inspección exacta de `enqueued` permite `asen_agent_ack`; conserva `writerAuthorized:false` y `humanReadConfirmed:false`.
- El preflight F6 de `.github/workflows/asen-real-agent-acceptance.yml` incluye explícitamente el nuevo test de herramienta pública. No necesita Ollama para esta regresión y no puede usar el resultado como consentimiento.

**Checks adicionales:**
- [x] EF403-PRESERVE-02 — **VERIFICADO en preflight provider-free:** huellas de README/package, árbol completo, fallos ante alteración y entorno sin claves en subprocesos; `tests/t12-revalidation-contract.test.ts`, Actions `41819341700` / SHA `4b15c494a8cad718b30d1b2c4e06eceebd4de15e`. El CI global tres OS sigue separado.
- [x] EF604-ACK-02 — **VERIFICADO en preflight provider-free:** nueva registración descarta autoridad de inspección previa, listado no cuenta como inspección y `attempted` no es acusado; `tests/agent-notice-ack-tool.test.ts`, Actions `41819341700` / SHA `4b15c494a8cad718b30d1b2c4e06eceebd4de15e`. No demuestra reinicio de host Pi.
- [ ] EF604-PI-RESTART-02 — Reinicio REAL del proceso Pi con sesión persistente, recibos y sin duplicados: no demostrado por estas pruebas, sigue pendiente.

**Global:** los 28 EF canónicos permanecen 8/28; FULL NO ALCANZADO, Writer humano, A/B C01–C20 y revisor externo aún abiertos. Sin merge a `main`.

### Recepción exact-SHA de las regresiones agrupadas (2026-11-04)

`ASEN real-agent functional acceptance` run `41819341700`, commit `4b15c494a8cad718b30d1b2c4e06eceebd4de15e`: `Provider-free static and ASEN validation` **SUCCESS**. TypeScript, build, nueva prueba `tests/agent-notice-ack-tool.test.ts`, matriz F6 y `tests/t12-revalidation-contract.test.ts` superaron el gate de aceptación; `Writer authorization design lock` SUCCESS. Se marcan los tres **subchecks** EF403-FIX-01, EF403-PRESERVE-02 y EF604-ACK-02, limitados a lo que cada uno verifica, sin afirmar reinicio auténtico Pi, permisos de Writer ni test real de proveedor en este SHA. La prueba real Beam positiva sigue atada al SHA `ebf5515d140a1f73f0d15f3060f1012500261994` y artefacto `13315214638`, no se hereda.

**Pendiente:** CI global y Release Gate del SHA `4b15c494a8cad718b30d1b2c4e06eceebd4de15e`; Writer humano EF-304, A/B real C01–C20, reinicio de Pi EF604-PI-RESTART y auditoría independiente. 8/28 EF canónicos, sin FULL ni merge.

### MEGATANDA EF-604 — reinicio auténtico de host Pi con journal y aislamiento (2026-11-04)

**Alcance publicado, pendiente de pruebas exact-SHA: Pi 1.2.0 real en RPC headless, SIN inferencia ni consentimiento Writer.** Se mejora respecto de la prueba anterior entre procesos Node: dos procesos independientes del CLI nativo `@earendil-works/pi-coding-agent` arrancan **con la misma sesión Pi persistida**; un tercero abre una sesión distinta. Se carga de verdad `createAsenExtension` en los tres hosts con `AgentRuntime` y `AgentNotificationJournal` existentes.

- `tests/ef604-native-pi-headless-restart.test.ts` crea un proyecto Git aislado, inicia una sesión mediante el `SessionManager` real, persiste dos tareas Explorer de solo lectura mediante el `AgentRuntime` real y su store con recibo autenticado; el runner es deliberadamente determinista, **no** Pi modelo. En el journal real deja una notificación `attempted` y otra `pending` antes de reiniciar.
- Dos arranques nativos independientes se verifican con RPC `get_state`, el mismo identificador de sesión y archivo de Pi, distintos PID y dos eventos `session_start` observados por una extensión probe. El store conserva sus resultados y el journal no retransmite, no acusa `attempted`, no transforma `pending` en entregado y no relanza trabajos. Un tercer host con otro sessionId no obtiene avisos ajenos.
- No hay llamadas de modelo, descarga de proveedores, funciones Writer, consentimiento ficticio ni cambios en los archivos Git. El test falla si hay un `agent_start` inesperado, cambio de SHA/identidad, cambio de bytes del journal o pérdida del recibo persistente. A diferencia de la evidencia histórica de recuperación solo de Node, aquí se ejercita **el CLI auténtico de Pi en tres procesos distintos**.
- El carril F6 existente en `.github/workflows/asen-real-agent-acceptance.yml` incluye el test provider-free. No se utiliza Ollama para un test que no necesita inferencia.

**Checklist:**
- [x] EF604-NATIVE-01 — **PASS en SHA `45586c0d0e25e97dc00578f91a12f54537071784`**: Pi 1.2.0 real RPC, tres procesos/dos reinicios de sesión, aislamiento, store autenticado y journal `attempted/pending` conservado; Actions `41821784608`, log `EF604_NATIVE_PI_HEADLESS_RESTART_PASS`. Cero inferencias y `globalFull:false`.
- [ ] EF604-NATIVE-02 — Suite completa tres OS + Release Gate del SHA publicado, PASS.
- [ ] EF604-FULL-RESTART — Prueba **interactiva** de interrupción durante ejecución real del hijo Pi y recuperación del coordinador con consulta/acuse legítimos; NO cubierta por RPC headless ni por el runner determinista.

**Recepción previa relevante:** Release Gate `41819643941` del commit `0f206263ca50ae78fa5f49d2c410017480f18a67` terminó PASS en Linux, macOS y Windows. Su CI general `41819644492` había terminado Ubuntu SUCCESS y seguía ejecutándose en otros sistemas durante la consulta. Estos recibos no certifican el nuevo SHA ni cambian las tareas canónicas: EF 8/28, MEGA 7/9, FULL NO ALCANZADO. No merge a `main`.

### EF-604 incidente detectado por prueba real — headless no puede afirmar `enqueued` (2026-11-04)

**Defecto real encontrado y solución implementada, pendiente de CI exact-SHA.** En el run `41820582785`, SHA `03e244b1e26e543ae30e6dc52d3f3e0dc3a3e75f`, el test `tests/ef604-native-pi-headless-restart.test.ts` arrancó un host real Pi RPC y detectó una modificación indebida del journal `pending`: el primer host pasó la validación de sesión nativa pero falló la aserción de bytes del journal después de iniciar el host. El F6 preflight terminó **FAIL** por esa regresión; no se marcó el test como completado.

La causa está en `extensions/asen.ts`, función `sendAgentNotice`: el código devolvía `false` solo para ruta `hold`; la ruta `headless` — que `agentParentRoute` produce explícitamente para RPC sin UI — podía reclamar una notificación `pending` y llamar a `pi.sendMessage` con `triggerTurn:false`, avanzando a `enqueued` **sin coordinador TUI real**. Aunque `agent-terminal-delivery.ts` clasificaba `headless` correctamente, el consumidor no respetaba esa clasificación.

**Fix:** `sendAgentNotice` solo permite transmisión si la ruta es exactamente `run` o `idle`. `hold` y `headless` conservan `pending` hasta un host TUI válido. La regresión de integración usa el ejecutable auténtico `pi --mode rpc --session`, el almacén real con HMAC y el journal persistente; exige que la sesión reiniciada no envíe ni reconozca ningún mensaje por ser headless, y comprueba además aislamiento de una sesión ajena. No se añaden sleeps ni bucles de polling a producción, ni permisos Writer.

**Checklist:**
- [x] EF604-HEADLESS-01 — **PASS en SHA `45586c0d0e25e97dc00578f91a12f54537071784`**: Typecheck + F6 con Pi nativo; `pending` intacto y `attempted` sin retransmisión; Actions `41821784608`. No acredita hijo LLM real.
- [ ] EF604-HEADLESS-02 — Preflight de seguridad, CI completo Windows/macOS/Ubuntu y Release Gate exact-SHA del fix PASS.
- [ ] EF604-LIVE-CHILD-01 — Pi real interactivo interrumpido durante trabajo de hijo y reanudado con autorización/acuse genuino: aún no realizado.

Se mantiene la semántica estricta: `enqueued` es solo transporte, nunca lectura humana, ni revisión independiente, ni aprobación Writer. EF-604 canónico sigue PARCIAL hasta pruebas de hijo/Writer genuinas y comparación A/B C14–C15. El estado global permanece 8/28 EF, FULL no alcanzado, sin merge.

### EF-604 — resultado real Pi y reconciliación del host falso en tests (2026-11-04)

En el run `41821175271`, SHA `b3eb026b76d4ff1541d3f8a04570301a62001f85`, la prueba nativa `tests/ef604-native-pi-headless-restart.test.ts` **PASÓ**: el log indica `EF604_NATIVE_PI_HEADLESS_RESTART_PASS`, Pi 1.2.0, 3 procesos reales, 2 reinicios de la misma sesión, una sesión extra aislada y journal intacto `attempted/pending`. El fix productivo del modo `headless` quedó confirmado. El **preflight global siguió en FAIL** en otra fase, por lo que no se hereda el PASS a una nueva versión ni se cierra EF-604 canónico.

El segundo fallo surgió en `tests/pi-agent-runtime.test.ts`: varios mocks tenían `mode:"rpc"` por defecto pero esperaban que `pi.sendMessage` entregase avisos al padre. Antes del fix, ese comportamiento erróneo permitía que los tests pasaran; después, el primer test EF-603 se quedó esperando una entrega que **correctamente no debe ocurrir en RPC headless**, causando ocho tests siguientes cancelados. El fix de los fixtures cambia a `mode:"tui"`, `isIdle:()=>true` solamente los casos que requieren entrega visible, conservando los casos RPC para aislamiento. Añade también una prueba negativa específica que ejecuta completado/arranque/reapertura de un host mock RPC y verifica `pending`, cero `asen.agent.result`, sin replay. No se debilita el test Pi nativo ni se concede Writer.

**Checks nuevos del corte:**
- [x] EF604-MOCK-HOST-01 — **PASS en SHA `45586c0d0e25e97dc00578f91a12f54537071784`**: mocks TUI fieles al host, EF-603 y EF-601 superaron prueba focal; Actions `41821784608`, cero tests cancelados.
- [x] EF604-MOCK-HOST-02 — **PASS en SHA `45586c0d0e25e97dc00578f91a12f54537071784`**: prueba negativa RPC y Pi 1.2.0 auténtico retienen `pending` sin modelo; Actions `41821784608`. No hay Writer ni FULL.
- [ ] EF604-CI-GATE-03 — CI tres OS y Release Gate del SHA publicado, sin heredar resultados de `b3eb026`.

**Límite:** la recuperación auténtica del host Pi ahora es observable en RPC sin proveedor; la recuperación de un hijo Pi modelo interrumpido durante una ejecución TUI y la decisión humana Writer continúan pendientes. 8/28 EF canónicos, FULL NO ALCANZADO.

### EF-604 — regresión de señal de actividad Pi desconocida (2026-11-04)

La regresión `tests/agent-terminal-delivery.test.ts` comprueba que señales `isIdle` ausentes, indefinidas o que lanzan excepción, y hosts RPC/JSON/sin UI, nunca producen `run`, `idle`, steering ni wake. Es una prueba determinista sin proveedor: no demuestra Pi TUI auténtico, hijo LLM ni consentimiento Writer. Se ejecutará con CI del nuevo SHA; no se marca ningún EF adicional ni se reutilizan recibos anteriores. FULL sigue bloqueado.

### Recepción de los subchecks nativos, sin promover EF canónico (2026-11-04)

`ASEN real-agent functional acceptance` run `41821784608`, commit `45586c0d0e25e97dc00578f91a12f54537071784`: **SUCCESS** en el preflight provider-free. Ejecutó TypeScript, build, F6, tres procesos auténticos Pi 1.2, reanudación RPC de la sesión, ensayo contra otra sesión y las regresiones EF-601/603/604 con `fail=0` y `cancelled=0`. El log incluye `EF604_NATIVE_PI_HEADLESS_RESTART_PASS`, con `globalFull:false` y ningún uso de proveedor. Quedan marcados los cuatro checks de alcance específico anteriores. El commit concurrente `62d094ef1f34cb73a5ca2b385266b9a7d116d34e` añade una regresión diferente sobre estado de inactividad desconocido, que exige su propio CI: no hereda el PASS de `45586c0d0e25e97dc00578f91a12f54537071784`.

EF-604 canónico sigue **PARCIAL** porque falta prueba de hijo LLM auténtico interrumpido, recuperación TUI con acuse legítimo, decisiones Writer humanas y comparación C14–C15 A/B. El CI general y Release Gate del último HEAD continúan como validaciones exact-SHA separadas. 8/28 EF completos, FULL NO ALCANZADO, sin merge a `main`.

### EF-604 — ajuste de tipado de la regresión de señal Pi inválida (2026-11-04)

El test nuevo de `62d094ef` provocó errores TypeScript TS2345 en `tests/agent-terminal-delivery.test.ts:124–127`: una señal `isIdle:()=>undefined` es deliberadamente inválida en ejecución, pero el contrato estático `AgentDeliveryContext.isIdle` exige `()=>boolean`. La compilación detenía por ello preflight `41821936272`, Release Gate `41821947295` y auditoría `41821947541`, todos del SHA exacto de esa prueba.

**Corrección quirúrgica:** la prueba conserva íntegra la señal malformada en ejecución mediante un *cast* limitado al valor del callback, sin cambiar el contrato de producción, el runtime ni las expectativas de seguridad de las rutas `hold/headless`. La nueva publicación requiere Typecheck, preflight, CI y Release Gate exact-SHA; no se declara PASS antes de recibirlos. Las cuatro comprobaciones de reinicio Pi marcadas arriba siguen respaldadas específicamente por `41821784608` / `45586c0d`, no se extienden automáticamente a otro HEAD. No permisos Writer, FULL ni merge.

### MEGATANDA CONSOLIDADA EF-601/603/604 + EF-002/701/704 (2026-11-04)

**Una única publicación con múltiples bloques y un preflight consolidado.** Se trabaja sobre la rama `feat/t12-integrated-acceptance-merge`, sin mezclar resultados de SHAs anteriores, sin inferencia adicional y sin permitir ningún cambio de Writer por estos tests. Los tres bloques son independientes y se ejecutan dentro de un único workflow de aceptación; los tres OS y el Release Gate siguen como validaciones posteriores del mismo SHA.

**Bloque A — EF-601/604: traspaso RPC headless → TUI con journal y acuse duradero.**
- Nuevo `tests/agent-rpc-tui-handoff.test.ts` ejerce la extensión y el runtime ASEN reales con un runner **deliberadamente determinista y sin proveedor**, el almacén con recibos y el journal de producción. Un Explorer finalizado en RPC deja `pending`, el arranque de otra sesión no ve ni consume el aviso, el TUI de la sesión correcta lo reclama/enfila una vez, el coordinador debe consultar el ID exacto antes de `asen_agent_ack`, y el siguiente arranque no lo retransmite ni crea una ejecución duplicada.
- Caso adversarial separado: el envío TUI puede lanzar después de haber reclamado, creando `attempted`. La nueva instancia conserva el resultado pero no lo reenvía ni acepta acuse. Un resultado de TUI encolado no implica lectura humana, decisión Writer, autorización ni revisión externa.

**Bloque B — EF-603: identidad fuerte de deduplicación con varios roles y rutas.**
- Nuevo `tests/agent-coalesce-role-scope.test.ts` valida el `AgentRuntime` y su `PersistentAgentStore` auténticos con solicitudes concurrentes. Tres exploraciones ad hoc idénticas reutilizan un solo ID; diferencias de prompt, modelo, thinking, sesión, proyecto o propietario, así como Reviewer/Verifier repetidos, conservan identidades distintas. Dos exploraciones planificadas mediante frontera `onPrepared` tampoco heredan la exploración ad hoc y el ciclo posterior a completar exige ID nuevo. Sin llamadas a un modelo.

**Bloque C — EF-002/701: contraste acoplado de 20 casos y 60 recibos.**
- Nuevo `scripts/agent-ab-combined-gate.mjs` reúne inventario C01–C20, comparador de seis campos y auditoría de los 60 archivos de evidencia A/B/ASEN. La matriz muestra por caso la causa de bloqueo y si existe fallo de integridad, distingue `MATCH` textual de `INDEPENDENT_EXECUTION_NOT_ATTESTED`, conserva las seis casuísticas de consentimiento explícito, nunca acepta por sí sola Writer ni `globalFull`, y permite posteriormente consumir registros reales sin convertirlos en pruebas externas independientes.
- Nuevo `tests/agent-ab-combined-gate.test.ts` ejerce 60 huecos, tres recibos íntegros falsamente declarados `real`, digest corrupto, SHA de referencia alterado, divergencia A/B autodeclarada y CLI create-only. Todos los casos carecen aún de captura de referencias A/B auténticas y del consentimiento requerido.
- `.github/workflows/asen-real-agent-acceptance.yml` añade las tres suites al preflight existente y produce el informe `asen-acceptance-evidence/ab-combined.json` para el SHA del commit con `casesBlocked:20`, `expectedSlots:60`, `globalFull:false`; la evidencia es provider-free y no supone ejecución C01–C20.

**Checks de esta tanda — NO cerrar hasta recibir pruebas del commit:**
- [x] MEGA-EF604-TRANSFER-01 — **PASS exact-SHA:** `tests/agent-rpc-tui-handoff.test.ts` (RPC pending → TUI enqueued, inspección exacta, ack, reinicio sin replay). Preflight `41824882694` / SHA `68847c330fe677942610d32a687f150e3c58896d`, test `ok 22`, `fail=0`. Runner determinista, no modelo.
- [x] MEGA-EF604-UNCERTAIN-02 — **PASS exact-SHA:** `tests/agent-rpc-tui-handoff.test.ts` `attempted` permanece incierto, sin retransmisión ni acuse tras reinicio; preflight `41824882694` / SHA `68847c330fe677942610d32a687f150e3c58896d`, test `ok 23`. No Writer.
- [x] MEGA-EF603-SCOPES-01 — **PASS exact-SHA:** `tests/agent-coalesce-role-scope.test.ts` prueba 3→1 Explorer y separación por rol, modelo, thinking, owner, sesión, proyecto y tarea planificada. Preflight `41824882694` / SHA `68847c330fe677942610d32a687f150e3c58896d` (`ok 2` y `ok 3`). Sin agente Pi auténtico en esta unidad.
- [x] MEGA-EF701-RECEIPTS-01 — **PASS exact-SHA:** `tests/agent-ab-combined-gate.test.ts` cubre 20/60 slots y rechaza falsos `real`, digest, SHA y divergencias no atestadas; preflight `41824882694` / SHA `68847c330fe677942610d32a687f150e3c58896d`, 5/5 nuevos tests PASS. Ninguna ejecución A/B acreditada.
- [x] MEGA-EF704-GATES-01 — **PASS exact-SHA:** Typecheck, build, F6, F7 y el informe combinado `EF701_AB_COMBINED_BLOCKED` con `cases=20`, `receiptSlots=60`, `integrityOnly=0`, `globalFull=false`, preflight `41824882694` / SHA `68847c330fe677942610d32a687f150e3c58896d`. No certifica FULL.
- [ ] MEGA-EF703-3OS-01 — CI Windows/Ubuntu/macOS y Release Gate PASS del SHA final de la megatanda.

**Bloqueos que permanecen y NO se simulan:** los 40 casos ejecutados en referencias A/B, las 20 ejecuciones de ASEN, un modelo/hijo real interrumpido en Pi interactivo, la autorización Writer humana vinculada a la tarea y la verificación externa. Se mantienen las 28 tareas canónicas **8/28**, sin FULL y sin merge a `main`. La CLI de preparación y el informe de digests `INTEGRITY_ONLY` no pueden elevar C01–C20 a ejecutados.

### Recepción de la megatanda agrupada (2026-11-04)

**Commit verificado:** `68847c330fe677942610d32a687f150e3c58896d`. El job `Provider-free static and ASEN validation` de `ASEN real-agent functional acceptance`, run `41824882694`, terminó **SUCCESS**. Los logs muestran ejecución real del runtime de ASEN bajo runner de prueba de solo lectura: handoff headless→TUI `ok 22`, incertidumbre `ok 23`, coalescing/aislamiento `ok 2` y `ok 3`; el bloque C01–C20 5/5 PASS en tests de validez del auditor, con `EF701_AB_COMBINED_BLOCKED {cases:20, receiptSlots:60, integrityOnly:0, globalFull:false}`. Los cinco subchecks anteriores se marcan solo con ese alcance y ese SHA.

**No heredamos ejecución A/B ni ningún test de modelo desde estos fixtures.** La suite CI global `41824890185` y Release Gate `41824890191` estaban en ejecución en los tres sistemas al registrar este recibo. El subcheck `MEGA-EF703-3OS-01` sigue abierto; la ejecución Pi con un hijo LLM interrumpido, el consentimiento Writer de una persona real y la revisión externa independiente siguen pendientes.

La equivalencia canónica conserva `8/28` EF verificados; `globalFull=false`. No merge a `main`.

### Macrotanda EF-701 — raíz de recibos canónica y sin alias (2026-11-04)

**Defecto concreto identificado:** el auditor de recibos verificaba que cada fichero individual fuese regular, único y no simbólico, pero aceptaba una `root` que fuese enlace simbólico o atravesase un ancestro simbólico porque `realpath(resolve(root))` normalizaba silenciosamente el alias. Esto podía ocultar la identidad física de la ubicación aportada por el operador, aunque nunca autorizaba FULL.

**Corrección acotada:** rechazar una raíz que no sea directorio real, sea enlace simbólico o cuyo camino canónico difiera del solicitado; conservar las comprobaciones por descriptor, inode, tamaño y digest de cada recibo. Añadir regresión con raíz simbólica y control positivo de raíz ordinaria; en Windows sin permiso para crear enlaces, el caso negativo se declara SKIP explícito. No se modifica la política de permisos, no se amplía el alcance del auditor y no se acepta una observación autoatestada como ejecución real.

**Recepción pendiente del SHA de esta tanda:** typecheck, prueba `tests/agent-ab-combined-gate.test.ts`, auditoría de arquitectura, CI y Release Gate. No marcar EF-701 ni EF-704 como FULL por esta corrección; la matriz C01–C20 sigue necesitando 60 trazas reales y auditoría independiente. El plan canónico permanece 8/28 hasta evidencia adicional. Sin Writer ni merge.

### Macrotanda EF-701 — recibos vacíos y alias físicos (2026-11-04)

**Cambios propuestos, sujetos a CI exact-SHA:** rechazo temprano de recibos vacíos en el lector acotado y regresiones para archivo vacío y enlace físico (nlink>1). Los casos deben permanecer BLOCKED, Writer no autorizado y globalFull=false. Ningún digest ni test local acredita ejecuciones A/B/ASEN. Criterios de recepción: typecheck, pruebas focales, Architecture, CI y Release Gate en SHA publicado. EF-701/704 siguen abiertos; 8/28 EF, sin FULL ni merge.

### SUPERMEGATANDA ÚNICA — EF-601/604 + EF-002/701 + EF-702/703/704 (2026-11-04)

**Objetivo:** resolver tres riesgos de producción independientes en una sola publicación, con preflight consolidado y **un único trigger opt-in de Pi real con Ollama Beam**, sin permitir Writer, proveedores de pago ni merge. **BASE**: `9bc8ca0b1d4a94be75bbc24ad926a3034e60deaa`, cuyos `CI` `41831048003` y Release Gate `41831047915` se verificaron **SUCCESS**, junto a arquitectura, F5, Pi 1.2, CodeGraph y R4 automático. Los nuevos cambios deben superar **su propio SHA**; ningún PASS se hereda automáticamente.

**Bloque A — EF-601/604: cerrar la carrera de ruta de avisos**
- `extensions/asen.ts` revalida la ruta exacta `idle`/`run` **antes del claim y después del I/O de claim**; un cambio de modo Pi no permite enviar por el canal equivocado, crear un nuevo turno o conservar `enqueued` ficticio. Si cambia tras el claim, la notificación queda `attempted` incierta, se informa al usuario y **no se retransmite automáticamente**.
- El envío usa las opciones capturadas y verificadas, no vuelve a calcular la ruta dentro de `pi.sendMessage`. El despertar por `idle` sigue condicionado a la comprobación posterior en `requestAgentWake`.
- `tests/agent-rpc-tui-handoff.test.ts` incorpora dos regresiones con el runtime/almacén/journal reales, pero runner determinista sin modelo: cambio de ruta **antes** de reclamar conserva `pending` y permite entrega en TUI nuevo; cambio **después** de reclamar conserva `attempted`, sin mensaje, replay ni acuse. Complementa los tests Pi RPC auténticos previos, no los sustituye.

**Bloque B — EF-701/002: entrada segura de datos A/B**
- Nuevo `scripts/agent-ab-manifest-reader.mjs` limita a **1 MiB** cada manifiesto, usa descriptores abiertos, compara metadatos antes/después, rechaza symlinks y hardlinks y requiere UTF-8/JSON válidos. Esto reduce riesgo de archivos sustituidos o entrada masiva; una coincidencia criptográfica sigue siendo solo `INTEGRITY_ONLY`, no ejecución A/B auténtica.
- `scripts/agent-ab-combined-gate.mjs` aplica el lector nuevo a documentos de referencia/candidato en modo CLI y rechaza un directorio de salida alias/symlink. El modo sin manifest mantiene explícitamente `casesBlocked:20`, `sourceCasesExecutedAndAttested:0` y `globalFull:false`.
- `tests/agent-ab-manifest-reader.test.ts` y `tests/agent-ab-combined-gate.test.ts`: pruebas de límite, archivo alias, JSON/UTF-8 inválido, sustitución de origen, salida alias, CLI con dos manifiestos reales de fixture, sin falsificar fuentes A/B.

**Bloque C — EF-702: errores de proveedor sin ejecución de propiedades peligrosas**
- `scripts/t12-provider-failure.mjs` no accede a getters, stacks, causas ni propiedades de un Error de origen no confiable. Acepta solo propiedades *data* propias de un Error o texto explícito acotado; `Proxy` con trampas o Error con getter malicioso se clasifica `UNKNOWN` sin fuga, excepción ni fallback de pago.
- `tests/t12-provider-failure.test.ts` cubre mensajes de cuota/billing normales, credenciales sintéticas, getters que lanzan, proxy y cadena `cause` no inspeccionada. **No** se pretende haber agotado una cuota real.

**Bloque D — EF-703: integración exact-SHA y consumo Beam autorizado**
- `.github/workflows/asen-real-agent-acceptance.yml` ejecuta en el mismo preflight las nuevas pruebas de seguridad, A/B y rutas; conserva los gates previos de Pi nativo y 60 slots.
- La publicación usa el mensaje exacto `ci: one-time Pi busy-parent Beam proof` para ejecutar una vez el **Pi TUI padre ocupado y Pi RPC Explorer auténticos con Ollama Beam**, `environment: ollama-cloud-beam`, sin herramientas Writer, sin fallback, `run_attempt=1` y recibo exact-SHA. La inferencia real solo demuestra EF-601 ocupado para ese SHA; no prueba recuperación de hijo LLM interrumpido.

**Checks del bloque — dejar sin marcar hasta recibir evidencia:**
- [x] SUPER-EF601-ROUTE-01 — **VERIFICADO**: transiciones antes/después de claim, pending/attempted sin wake/replay ni acuse; tests 24/25 PASS, preflight `41839113451` / SHA `e980fed72f8a63144a202acd4e7d17d0585fa579`. Runner determinista, no consentimiento.
- [x] SUPER-EF701-INPUT-01 — **VERIFICADO**: entrada A/B acotada a 1 MiB, UTF-8/JSON/alias, tests de manifest y combined CLI PASS, preflight `41839113451` / SHA `e980fed72f8a63144a202acd4e7d17d0585fa579`. Sin fuentes A/B realmente ejecutadas.
- [x] SUPER-EF702-SAFE-01 — **VERIFICADO**: clasificador de cuota/billing/auth con errores, proxies y getters peligrosos sin evaluar causas/secretos; `tests/t12-provider-failure.test.ts` PASS, `41839113451` / SHA `e980fed72f8a63144a202acd4e7d17d0585fa579`. No agotamiento real de cuota.
- [x] SUPER-EF601-BEAM-01 — **VERIFICADO**: padre Pi TUI ocupado e hijo Explorer Pi RPC auténticos con Ollama Beam, `PASS_REAL_PI_BUSY_PARENT_AND_CHILD_BOUNDED`, Actions `41839113451` / SHA `e980fed72f8a63144a202acd4e7d17d0585fa579`, artefacto `13327788719`; 2 acciones reales del coordinador, `globalFull:false`.
- [x] SUPER-EF703-MATRIX-01 — **VERIFICADO**: CI `41839122226` 14/14 jobs SUCCESS, suites completas Ubuntu/macOS/Windows y Release Gate `41839122026` 3/3 SUCCESS, ambos SHA `e980fed72f8a63144a202acd4e7d17d0585fa579`.
- [x] SUPER-EF704-ODD-01 — **VERIFICADO EN SU ALCANCE**: gate `audit:ef-plan` dentro del preflight `41839113451` PASS, resultados exact-SHA `e980fed72f8a63144a202acd4e7d17d0585fa579`, sin promover EF canónico (8/28) ni FULL. La recepción documental posterior se conserva separada.

**Limitaciones no negociables:** 8/28 EF completos en su alcance anterior; las 40 trazas reales A/B, 20 ASEN y el host B de agentes provisionado faltan; la escritura por Writer exige autorización humana genuina que ninguna CI puede conceder; una autoauditoría R4 no reemplaza una revisión externa independiente; no se ha probado el reinicio de un hijo LLM auténtico interrumpido. **FULL NO ALCANZADO**, sin merge ni release.

### Recepción de la SUPERMEGATANDA previa y nueva tanda EF-604/701/703 — 2026-11-04

**Recepción cerrada para el SHA histórico `e980fed72f8a63144a202acd4e7d17d0585fa579`:** preflight + prueba Beam `41839113451` SUCCESS; `T12_REAL_PI_BUSY_PARENT_CHILD_CONSUMPTION_PASS` con `globalFull:false` y artefacto `13327788719`; Release Gate `41839122026` PASS en 3 sistemas y CI `41839122226` SUCCESS en 14/14 jobs (Windows, macOS y Ubuntu incluidos). Los **seis subchecks SUPER-** de arriba se marcan sin promover EF-601, EF-604, EF-701, EF-702 o EF-704 canónicos. El consentimiento humano Writer y A/B C01–C20 continúan sin acreditarse.

**Nueva megatanda agrupada, cambios preparados para un SHA nuevo y sin herencia de PASS:**

- **EF-604 — terminación forzada del host Pi real:** `tests/ef604-native-pi-headless-restart.test.ts` amplía la prueba Pi 1.2 nativo RPC sin proveedor: crea un proceso Pi auténtico, obtiene `get_state` de una sesión persistida con mismo `sessionId`, mantiene abierto su stdin, lo termina con `SIGKILL` desde el proceso padre **sin `session_shutdown`** y reinicia otro CLI nativo. Exige identidades de sesión/PID distintas, cinco arranques observados, dos tareas Explorer persistidas, journal `attempted/pending` sin replay, proyecto Git intacto y cero modelo/Writer. Este test prueba la muerte del **host**, **NO** un LLM hijo a mitad de inferencia.
- **EF-701 — ambas CLIs protegen igual los manifiestos A/B:** `scripts/agent-observable-receipts.mjs` reutiliza el lector de documentos descriptor-bound `readAgentABManifest` ya usado por `agent-ab-combined-gate.mjs`, evitando la lectura por pathname sin límites del CLI antiguo. Pruebas añadidas a `tests/agent-ab-combined-gate.test.ts` exigen rechazo de entrada superior a 1 MiB, UTF-8 inválido, enlace simbólico y preservación del estado `globalFull:false` incluso con manifiestos ordinarios. El CLI conserva salida 1 en modo auditoría no atestada.
- **EF-703 — validación consolidada:** el preflight `.github/workflows/asen-real-agent-acceptance.yml` verifica sintaxis del auditor reforzado y ejecuta en su matriz existente tanto EF-604 nativo como EF-701 legacy. El SHA nuevo no requiere cuota Ollama: la inferencia Beam acreditada queda vinculada al commit anterior.

**Nuevos subchecks, pendientes hasta PASS exact-SHA:**
- [x] MEGAF604-KILL-01 — **VERIFICADO**: Pi nativo 1.2.0 en cinco procesos reales, terminación forzada del host y reapertura con estado durable `attempted/pending`, sin replay. Preflight `41843178923`, SHA `40e454ff8809bc4d52bb26732cb3ec60218ab9fc`, `EF604_NATIVE_PI_HEADLESS_RESTART_PASS`, cero llamadas LLM.
- [x] MEGAF701-LEGACY-01 — **VERIFICADO**: auditor legacy acepta solo manifiestos bounded descriptor-based; negativos symlink, oversize y UTF-8 PASS, nunca FULL. Preflight `41843178923`, SHA `40e454ff8809bc4d52bb26732cb3ec60218ab9fc`, tests EF-701 `ok 11/12`.
- [ ] MEGAF703-3OS-01 — CI, Release Gate y arquitectura exact-SHA del nuevo commit, PASS Windows/macOS/Ubuntu.

**Bloqueos globales no simulados:** 8/28 EF canónicos, falta inferencia LLM interrumpida y reanudada, consentimiento Writer real, las 60 capturas A/B/ASEN, host B y auditor externo. `FULL=false`; `main` intacta.

### Macrotanda EF-604 — inferencia Pi auténtica interrumpida durante streaming y reapertura estricta (2026-11-04)

**Ejecución agrupada en un solo commit, estado PENDIENTE de CI exact-SHA en esta sección.** La tanda anterior `40e454ff8809bc4d52bb26732cb3ec60218ab9fc` ya obtuvo SUCCESS en `41843178923` para el preflight provider-free y `41843189183` para Release Gate (Ubuntu/macOS/Windows). Dos subchecks acotados MEGAF604-KILL-01 / MEGAF701-LEGACY-01 se marcaron con el run exacto; el CI general `41843188676` mantenía macOS y Windows ejecutándose en el momento de preparar este corte. El resto del plan sigue 8/28 EF completos.

**Bloque A — observación nativa segura de streaming en el ejecutor real.** `src/agents/pi-process-runner.ts` incorpora un callback opcional `onAssistantTextDelta`, que solo se activa después de confirmar la política Pi, ante un evento RPC **nativo** `message_update` con emisor `assistant`, `assistantMessageEvent.type=text_delta` y fragmento de texto no vacío; no expone texto al callback, solo PID, ID del agente y longitud acotada. El observador no tiene privilegios de escritura ni altera el resultado de un agente normal; cualquier excepción del listener queda aislada.

**Bloque B — aborto después de evidencia real de inferencia Ollama Beam.** `scripts/t12-real-stream-interruption.mjs` reserva exactamente una ejecución antes de contactar el proveedor, crea un proyecto Git desechable, arranca un Explorer ASEN de solo lectura a través de `AgentRuntime`, `Dispatcher` y `PiProcessRunner` nativos `1.2.0`, usando exclusivamente el modelo registrado `ollama-cloud/beam`, `noTools:true`. En cuanto aparece el primer delta de texto real, aborta mediante la cadena productiva `AbortSignal`→Dispatcher→PiProcessRunner y comprueba la cancelación durable, la terminación del proceso hijo y la integridad del Git temporal. Si el proveedor falla, no emite un PASS ni reintenta una segunda solicitud.

**Bloque C — recuperación en otro proceso OS sin credencial.** `scripts/t12-stream-interruption-reopen.mjs` se ejecuta en un **proceso Node separado**, con las claves de acceso eliminadas del entorno. Lee el store HMAC auténtico y el journal `AgentNotificationJournal`, exige tarea `cancelled` y aviso `pending`, impide `AgentRuntime.continue` por falta de estado `interrupted` y comprueba cero invocaciones del runner. La cancelación es **del hijo**, no una terminación host-Pi TUI ni un reinicio que reanude automáticamente la inferencia; eso continúa fuera del alcance demostrado.

**Bloque D — grader y casos adversariales.** `scripts/t12-stream-interruption-grade.mjs` valida esquema exacto, SHA del commit, modelo/proveedor, delta observado, estado `cancelled`, límites y cero autoridad Writer, consentimiento o A/B. `tests/pi-process-runner.test.ts` añade prueba positiva de un flujo RPC sintético y rechazos de delta vacío, usuario suplantado y evento de pensamiento; `tests/t12-stream-interruption-grade.test.ts` añade 25 mutaciones que deben fallar; `tests/t12-stream-interruption-reopen.test.ts` verifica el contrato entre procesos sin gastar cuota. Las pruebas sintéticas no se presentan como inferencia real.

**Bloque E — un solo carril proveedor CI.** `.github/workflows/asen-real-agent-acceptance.yml` incorpora un job `real-stream-interruption` estrictamente opt-in, activado **solo** por `ci: one-time Pi streamed-child interruption Beam proof`, `github.run_attempt == 1`, rama exacta y preflight provider-free ya aprobado. Pin del runtime y plugin `npm:pi-ollama-cloud@0.13.1`, secreto del entorno `ollama-cloud-beam`, sin fallback a pago ni herramientas, una reserva atómica de llamada, timeout y artefacto `real-pi-stream-interruption.json` sin transcript. `tests/t12-stream-interruption-workflow.test.ts` audita los guardas del job.

**Plan ejecutable de recepción, todo pendiente de evidencias del SHA nuevo:**
- [x] EF604-STREAM-01 — **VERIFICADO**: Pi 1.2 real Ollama Beam, `message_start` del asistente seguido de `message_update(text_delta)`, delta auténtico observado (1 carácter) antes de cancelación. Run `41847539626` / SHA `ed1e1aa7989791f4287882ee1281d658ff2d2b6d` / artefacto `13331078633`; `globalFull:false`.
- [x] EF604-STREAM-02 — **VERIFICADO**: estado durable `cancelled` recuperado en segundo proceso OS sin claves, `pending` sin replay/ack y `providerCallsReserved:1`; Run `41847539626` / SHA `ed1e1aa7989791f4287882ee1281d658ff2d2b6d` / artefacto `13331078633`, `writerAuthorized:false`.
- [x] EF604-STREAM-03 — **VERIFICADO**: preflight `41847539626` SUCCESS, Typecheck/Build, F6 y regresiones de streaming sin mensaje acumulativo, usurpación, delta huérfano y grader adversarial; SHA `ed1e1aa7989791f4287882ee1281d658ff2d2b6d`. No son pruebas de referencia A/B.
- [x] EF703-STREAM-04 — **VERIFICADO**: job `EF-604 real Pi Beam streaming interruption and separate-process recovery` SUCCESS en `41847539626` / SHA `ed1e1aa7989791f4287882ee1281d658ff2d2b6d`, modelo `ollama-cloud/beam`, una sola reserva y artefacto `13331078633`, sin Writer ni fallback a pago.
- [x] EF704-STREAM-05 — **VERIFICADO**: SHA `45833560045b24e29d27d1cdad31ec0f7c1ae511` incluye la evidencia real Beam previa `41847539626` (SHA productor `ed1e1aa7989791f4287882ee1281d658ff2d2b6d`) y ha superado CI `41848389509` con 14/14 jobs SUCCESS (Windows/macOS/Ubuntu), Release Gate `41848389207` 3/3 SUCCESS y Arquitectura `41848389638` SUCCESS. No prueba A/B, Writer o EF-604 FULL.
- [ ] EF604-FULL-CHILD-RESTART — Interrupción host TUI **durante** una inferencia Pi real, reactivación legítima del coordinador y correlación completa del resultado. El test actual de `cancelled` no demuestra `interrupted` de una inferencia ni reanudación automática y **no permite declarar EF-604 FULL**.

**Resto de bloqueos:** 60 trazas reales C01–C20 (A+B+ASEN), Writer con consentimiento humano auténtico, auditoría externa y resto de criterios EF. No se fusiona a `main`; 8/28 EF canónicos FULL incompleto, `globalFull:false`.

### EF-604 streaming — corrección de compatibilidad de Pi RPC 1.2 y diagnósticos sin transcript (2026-11-04)

El primer intento opt-in real `41846495640` / SHA `c565ef715e99c526bf89477b33d1202399cdf2b3` superó Typecheck, Build y la prueba F6, pero el job `EF-604 real Pi Beam streaming interruption and separate-process recovery` terminó **FAIL**, fase `REAL_BEAM_STREAMING`, `AssertionError`, artefacto `13332275212`. **No es evidencia positiva** del streaming interrumpido ni se marca ninguno de los checks EF604-STREAM. Hubo un único slot de proveedor reservado.

La inspección del contrato RPC vigente de Pi mostró una incompatibilidad con el observador: `message_update` puede ser **delta-only**, sin `message.role`, aunque esté precedido por `message_start` de asistente. El observador inicial de ASEN exigía `message.role=assistant` dentro del propio delta, condición no garantizada por Pi 1.2. La corrección productiva **no** admite deltas anónimos: mantiene un estado local `assistantStreamActive` que solo se abre después de `message_start(role=assistant)`, se cierra con `message_end/agent_end` y exige un `assistantMessageEvent(type=text_delta,delta no vacío)` dentro de ese intervalo. Si el delta trae un `message.role` explícito incompatible, se rechaza. Nada del contenido es registrado ni enviado al observador, solo contadores acotados.

`tests/pi-process-runner.test.ts` incluye ahora traza RPC 1.2 *delta-only* positiva y rechazos de delta huérfano, rol usuario, delta vacío, pensamiento y delta posterior a `message_end`. El harness real `scripts/t12-real-stream-interruption.mjs` escribe en su recibo de fallo la fase de validación y solo cuatro datos no sensibles (PID observado, número de deltas, estado durable y cierre no exitoso). El intento opt-in en el nuevo SHA sigue estrictamente **una llamada reservada**, sin fallback a pago, sin Writer ni declaración FULL.

**Pendiente:** ejecutar preflight exact-SHA, un nuevo intento Beam una sola vez si procede, y comprobar que `cancelled` se conserva en la reapertura por proceso distinto. La mera documentación del protocolo no se considera ejecución real. El objetivo global permanece 8/28 EF, `globalFull:false`, sin merge.

### Recepción exact-SHA — Pi 1.2 streaming real interrumpido, segundo proceso sin inferencia (2026-11-04)

**Recibo real positivo:** en la ejecución `ASEN real-agent functional acceptance` `41847539626` / SHA `ed1e1aa7989791f4287882ee1281d658ff2d2b6d` el preflight **SUCCESS** habilitó el job opt-in `real-stream-interruption`, que también acabó **SUCCESS**, e imprimió `EF604_REAL_BEAM_STREAM_INTERRUPTED_REOPEN_PASS`. El artefacto `13331078633` fue descargado y contrastado; contiene `PASS_REAL_PI_STREAM_INTERRUPTED_AND_REOPENED_BOUNDED`, Pi 1.2.0, Ollama Cloud modelo Beam, un `assistantTextDelta` auténtico de un carácter, proceso hijo cerrado sin éxito, `durableState:"cancelled"`, reapertura desde otro proceso OS, `noticeDelivery:"pending"`, `replayedCalls:0`, `providerCallsReserved:1`, proyecto Git intacto, `noTools:true`, `writerAuthorized:false`, `humanConsent:false`, `fullInteractiveHostRecovery:false`, `independentABParity:false`, `globalFull:false`.

**Límites de la afirmación:** un fragmento de texto de Beam anterior a la terminación demuestra streaming real iniciado, **no** una inferencia completamente terminada, ni reanudación de ese mismo flujo, ni reinicio TUI padre/hijo a mitad del turno, ni Writer aprobado. El estado `cancelled` requiere una tarea nueva para inferir de nuevo; no hay reintento silencioso. El preflight positivo no demuestra 60 capturas A/B/ASEN. Por ello solo se marcan los cuatro subchecks indicados; **EF-604 canónico permanece PARCIAL y el total 8/28**.

`Release Gate` `41847547056` y `CI` `41847546958` estaban en curso en Windows/Ubuntu/macOS al documentar el recibo; `EF704-STREAM-05` sigue sin marcar hasta finalizar el SHA exacto. Ningún merge a `main`.

### MEGATANDA AGRUPADA EF-002/701 + EF-604/703/704 — reinicio TUI nativo y tres auditores convergentes (2026-11-04)

**Plan de implementación en una sola publicación funcional (sin merge, sin llamada de modelo):** base exacta `45833560045b24e29d27d1cdad31ec0f7c1ae511`, Release Gate `41848389207` SUCCESS, Phase 0/F5/T07/Pi/R4 SUCCESS; CI `41848389509` seguía abierto al iniciar la tanda. No se permite heredar esos PASS al nuevo SHA. Las pruebas se añaden a `.github/workflows/asen-real-agent-acceptance.yml`, que conservará la separación entre pruebas provider-free y jobs Ollama opt-in.

**Bloque 1 — EF-002/701: cerrar la última entrada no acotada de manifests A/B.** `scripts/agent-observable-parity.mjs` ya no carga `JSON.parse(await readFile(resolve(path)))` directamente. Utiliza `readAgentABManifest`, el mismo lector con límite de 1 MiB, metadatos de descriptor, checks de symlink/hardlink, UTF-8 estricto y detección de sustitución empleado por los otros dos comandos. `tests/agent-ab-triple-cli-security.test.ts` lanza **tres ejecutables reales** (parity, receipts, combined) sobre fixtures aislados; los tres deben rechazar igualmente sobresize, JSON y UTF-8 corruptos, alias físicos/simbólicos y seguir declarando `globalFull:false` incluso con JSON aparentemente válido. La CLI de comparación sigue devolviendo estado !=0 cuando no existe paridad externamente acreditada.

**Bloque 2 — EF-604: caída forzada REAL de un padre Pi TUI con un Pi RPC hijo activo.** `scripts/t12-native-tui-crash-probe.ts` se carga junto a `extensions/asen.ts` dentro de un host Pi 1.2.0 TUI auténtico. Arranca un único Explorer ASEN durable de solo lectura, cuyo runner lanza un subproceso Pi 1.2 `--mode rpc`, verifica realmente `get_state` en él y mantiene ambos procesos vivos. Journal de producción crea dos avisos **sintéticos etiquetados explícitamente como fixture**, uno `pending` y otro `attempted`: no equivalen a un resultado LLM ni a una entrega humana. El proceso padre se termina por SIGKILL del sistema operativo, **sin** `session_shutdown`; el subproceso observado se elimina explícitamente después, evitando procesos huérfanos.

**Bloque 3 — EF-604: reapertura Pi TUI nativa de la MISMA sesión.** `scripts/t12-native-tui-crash-recovery.mjs` arranca un segundo host Pi TUI con el mismo archivo `--session`, mismo proyecto y almacén duradero; debe comprobar cambio de PID, mismo `sessionId`, Explorer `interrupted` sin relanzar el runner, avisos `pending/attempted` intactos, acuse rechazado para ambos, cero credenciales de proveedor, cero Writer y árbol Git sin cambios. El test verifica que el Pi RPC hijo estaba vivo inmediatamente antes del SIGKILL. Esta prueba sí cruza una muerte de TUI y recuperación real de ASEN, pero **NO** un turno de modelo activo; no basta para cerrar `EF604-FULL-CHILD-RESTART`.

**Bloque 4 — EF-704/703: grader adversarial y CI consolidado.** `scripts/t12-native-tui-crash-grade.mjs` valida identidad exact-SHA, dos hosts, Pi hijo RPC auténtico, SIGKILL, sesión, `interrupted`, cero llamadas/replay y ausencia de autoridad; `tests/t12-native-tui-crash-grade.test.ts` rechaza 23 variaciones adversariales. El preflight provider-free ejecuta realmente el escenario native TUI en Linux con timeout explícito y conserva `asen-acceptance-evidence/native-tui-crash-recovery.json`. Los checks Source/Build/Release Gate/CI Windows/macOS/Ubuntu permanecen independientes.

**Checklist de recepción:**
- [x] MEGA-EF701-TRIPLE-CLI-01 — Los tres CLI usan lectura estricta acotada e idéntica; rechazan entradas corruptas/alias sin reportes engañosos; preflight del SHA final PASS. **VERIFICADO SOLO EN SU ALCANCE:** Pruebas de los tres CLI y rechazo de manifiestos corruptos/alias en preflight `41855777234` / SHA `f867016dcef28200332427aa460775c1e53d58cb`; integridad de entrada, no ejecución A/B.
- [x] MEGA-EF604-TUI-CRASH-01 — Un padre TUI Pi 1.2 auténtico muere por SIGKILL con un Pi RPC hijo vivo y Explorer ASEN durable, recibo exact-SHA PASS y cero modelo. **VERIFICADO SOLO EN SU ALCANCE:** TUI Pi 1.2 y subproceso Pi RPC vivos; SIGKILL y recibo `EF604_NATIVE_TUI_CRASH_NO_MODEL_PASS`; preflight `41855777234` / SHA `f867016dcef28200332427aa460775c1e53d58cb`.
- [x] MEGA-EF604-TUI-REOPEN-02 — Segundo host TUI reabre misma sesión y marca Explorer `interrupted`; ambos avisos conservan estado, acuses bloqueados y replay=0; preflight PASS. **VERIFICADO SOLO EN SU ALCANCE:** Reapertura del mismo JSONL Pi y `sessionId`, Explorer `interrupted`, pending/attempted y 2 acuses bloqueados; preflight `41855777234` / SHA `f867016dcef28200332427aa460775c1e53d58cb`.
- [x] MEGA-EF704-TUI-GRADER-03 — Grader de identidad/autoridad, 23 mutaciones negativas y pruebas F6/F7 PASS, sin convertir fixture en inferencia real. **VERIFICADO SOLO EN SU ALCANCE:** 23 mutaciones adversariales y pruebas F6/F7 PASS provider-free, `41855777234` / SHA `f867016dcef28200332427aa460775c1e53d58cb`; nunca constituye consumo modelo ni FULL.
- [ ] MEGA-EF703-3OS-04 — Release Gate + CI completo de Ubuntu/macOS/Windows para el **mismo** SHA de esta megatanda, no extrapolado de commits anteriores.
- [ ] MEGA-EF604-REAL-INFERENCE-TUI-05 — Host TUI interrumpido DURANTE inferencia LLM auténtica de un hijo y reanudación/correlación segura con el coordinador. **Pendiente: esta tanda provider-free no demuestra dicho criterio.**

**Reglas de salida:** solo marcar subchecks con recibos reales y SHA del mismo commit; mantener `8/28` tareas EF canónicas, `EF-604 PARCIAL`, `FULL=false`, sin consentimiento Writer simulado, sin ejecuciones A/B inventadas ni merge a `main`.

**Cierre histórico adicional:** el CI `41848389509` del HEAD `45833560045b24e29d27d1cdad31ec0f7c1ae511` acabó 14/14 jobs SUCCESS, incluidos Windows/macOS/Ubuntu; Release Gate `41848389207` 3/3 SUCCESS. Se marca únicamente `EF704-STREAM-05` por su alcance propio. Este cierre histórico no certifica por anticipado el nuevo SHA de la megatanda.

### EF-604 — reconciliación de sesión Pi nativa tras primera caída (2026-11-04)

El preflight del commit `7d46cf00c3c40b0bcd9b18c0bb8ed04ca93240e2` y el ensayo diagnóstico `08953d2d834144e3c363a9afcf076e9b93fad168` detectaron un **defecto del fixture de reinicio, no una prueba PASS**: `EF604_NATIVE_TUI_CRASH_FAILED NATIVE_TUI_RESTART_SAME_SESSION` por cambio de identidad en la sesión. El padre y el hijo Pi nativos habían arrancado correctamente y el primero fue eliminado por SIGKILL. Sin embargo, en Pi un identificador de sesión recién creado puede existir solo en memoria hasta guardar la primera entrada; el primer TUI se cerraba **antes** de materializar su sesión JSONL, de modo que el segundo TUI recibía otra sesión. No es legítimo exigir identidad conservada de un archivo aún inexistente ni marcar `MEGA-EF604-TUI-REOPEN-02`.

**Corrección segura:** `scripts/t12-native-tui-crash-probe.ts` llama a `pi.appendEntry("asen.ef604.tui-crash-seed",{readOnly:true,modelCalls:0})` al comenzar la primera sesión. Es una entrada nativa de extensión guardada por Pi, fuera del contexto LLM; el fixture verifica `getSessionFile()` y existencia del JSONL **antes** de arrancar el Explorer. El segundo host exige que `getEntries()` contenga realmente ese marcador, además de comparar `sessionId` y proyecto; `scripts/t12-native-tui-crash-recovery.mjs` verifica también existencia del archivo antes del SIGKILL. Esto comprueba persistencia real y no una sustitución manual de UUID o escritura de JSONL fabricado.

**Recepción aún pendiente:** nuevo preflight exact-SHA con TUI/Pi RPC nativos, mismo sessionId, `interrupted` recuperado, pendientes inciertos no retransmitidos, y CI Release Gate tres OS. No se hace ningún consumo de modelo; `FULL=false`, `8/28` EF canónicos y Writer desautorizado.

**Ajuste de identidad por contrato Pi:** la primera ruta `--session` puede ser solo una selección inicial. El probe guarda la ruta **real** `ctx.sessionManager.getSessionFile()` después de `pi.appendEntry`; el segundo host la utiliza explícitamente y comprueba tanto archivo JSONL como `sessionId` y entrada de extensión restaurada. De este modo, la prueba no asume que Pi eligió la ruta sugerida por el harness. El recibo sigue pendiente de un PASS real del nuevo commit.

### EF-604 — contrato Pi 1.2 de materialización de JSONL y fixture sin inferencia (2026-11-04)

El run `41854314881` / SHA `fb80a4a43d1e85bf3eb756b5ba5fc70d262c8a3c` reprodujo un segundo fallo temprano en el primer TUI: `Native Pi session file did not persist before forced TUI death`. La inspección de `@earendil-works/pi-coding-agent@1.2.0/dist/core/session-manager.js` confirmó explícitamente que `_hasConversation()` es el requisito de `_persist()`: **un `appendCustomEntry` no materializa JSONL si todavía no existe un mensaje de usuario o asistente**. El marcador anterior era correcto como dato de extensión, pero no forzaba grabación de archivo; por ello el test no debía declararse PASS.

La corrección del fixture nativo incorpora un único `ctx.sessionManager.appendMessage` con un mensaje de **usuario sintético y etiquetado como fixture**, exclusivamente en el repositorio temporal `ASEN_SYNTHETIC_TUI_CRASH_SESSION_FIXTURE_NO_MODEL_TURN`. No llama a `session.prompt`, no usa clave de API, no simula consentimiento humano ni escribe en proyecto de usuario. El TUI reabierto exige que ese mensaje y la entrada de extensión `asen.ef604.tui-crash-seed` estén presentes en los datos Pi realmente restaurados. Esto prueba la persistencia que Pi 1.2 exige y evita crear manualmente un JSONL falso.

**Pendiente:** preflight y prueba de dos anfitriones TUI nativos con SIGKILL, persistencia de la tarea `interrupted` y los avisos `pending/attempted`. Si el experimento falla, ninguna casilla nueva se marcará. Sin consumo de modelo, `globalFull:false`, 8/28 EF canónicos, sin merge.

### MEGATANDA EF-703 — reparación del disparador exact-SHA para probes TS y CLIs A/B (2026-11-04)

La corrección `1fbde08fcc006f3a8a6ebaca15efdeee407dde06` cambió el probe TypeScript `scripts/t12-native-tui-crash-probe.ts`, pero el workflow `asen-real-agent-acceptance.yml` **no lo ejecutó**, porque `on.push.paths` solo incluía `scripts/t12-*.mjs`, dos probes TypeScript concretos y `scripts/agent-ab-*.mjs`. También dejaba fuera `scripts/agent-observable-parity.mjs` si era el único archivo modificado. Se trata de un fallo comprobado de cobertura CI, independiente de que las suites de Arquitectura y Release Gate sí se ejecutaran.

**Corrección estructural:** añadir `scripts/t12-*.ts` y `scripts/agent-observable-*.mjs` a las rutas observadas. `tests/t12-native-tui-crash-workflow.test.ts` comprueba que esos patrones y los anteriores estén presentes, que la prueba de SIGKILL TUI y los tests triple-CLI estén realmente en el preflight, y que el job sea sin credenciales Ollama y no pueda atribuir `globalFull:true`. Se integra el test en F2/F3 para proteger el filtro en futuras tandas.

El propio cambio del workflow activará una aceptación provider-free exact-SHA con el probe de sesión persistida, los tres CLIs A/B y los gates existentes. **No se marcarán los checks MEGA-EF604-TUI-CRASH-01/REOPEN-02 ni EF703 hasta un PASS positivo de ese SHA.** 8/28 EF canónicos, `FULL=false`, sin merge, sin Writer inventado ni inferencia en este lote.

### EF-604 / EF-703 — recepción del preflight exact-SHA (2026-11-04)

El run de aceptación `41855777234` sobre `f867016dcef28200332427aa460775c1e53d58cb` terminó SUCCESS. Su job `Provider-free static and ASEN validation` (`126663873464`) pasó las regresiones del grader de crash TUI, los tests de cobertura de workflow y el resto de pruebas sin proveedor. Los jobs de Pi/Ollama reales quedaron SKIPPED: este run no acredita nueva inferencia ni recuperación LLM. El run anterior no debe atribuirse al SHA de futuros commits. Release Gate y CI de este SHA estaban aún en cola durante la inspección; no se infiere PASS. La prueba de crash nativo debe acreditarse separadamente con el recibo `native-tui-crash-recovery.json` de este mismo SHA antes de cerrar sus subchecks. Se mantienen 8/28 EF, Writer no autorizado y FULL=false.

### Megatanda adicional EF-002/701/704 — textos de procedencia confiables (2026-11-04)

**Cambio funcional agrupado en una única publicación, pendiente del CI de su propio SHA:** `scripts/agent-observable-parity.mjs` rechaza controles ANSI/C1, caracteres de dirección Unicode, y separadores invisibles en `environment`, `model` y `receipt` de observaciones A/B/ASEN. `scripts/agent-ab-case-readiness.mjs` limita descripciones a 1024 y escenarios a 512 caracteres y aplica el mismo filtro antes de generar el informe C01–C20. `scripts/agent-ab-manifest-reader.mjs` compara también `birthtimeNs` y exige inode físico positivo, alineado con el lector de recibos. Las pruebas nuevas son adversariales y se integran en los tests F0/F7 existentes. Las mutaciones se rechazan **antes** de la comparación; no transforman datos fraudulentos en MATCH.

- [ ] EF701-PROVENANCE-01 — Typecheck y pruebas de los tres módulos en preflight provider-free exact-SHA de esta publicación, PASS; salida no puede elevar `globalFull`.
- [ ] EF703-PROVENANCE-3OS-02 — CI y Release Gate Windows/macOS/Ubuntu del mismo SHA, PASS.

**Evidencia histórica que sí queda cerrada sin heredar al SHA nuevo:** los cuatro subchecks `MEGA-EF701-TRIPLE-CLI-01`, `MEGA-EF604-TUI-CRASH-01`, `MEGA-EF604-TUI-REOPEN-02` y `MEGA-EF704-TUI-GRADER-03` corresponden exclusivamente al preflight PASS `41855777234`, SHA `f867016dcef28200332427aa460775c1e53d58cb`. El recibo CI verificó JSON del crash con `status=PASS_NATIVE_TUI_PARENT_CRASH_WITH_ACTIVE_PI_RPC_CHILD`, `providerCalls=0`, `replayedCalls=0`, `writerAuthorized=false`, `globalFull=false`. Los checks globales EF-002/601/604/701/703/704 permanecen abiertos. Siguen faltando 60 observaciones A/B/ASEN reales, Writer con consentimiento humano, hijo LLM bajo caída TUI y auditoría externa independiente. **8/28 EF, FULL NO ALCANZADO. Sin merge a main.**

### SUPERMEGATANDA F6 — objetivo de cierre EF-603 con Pi real y deduplicación exacta (2026-11-04)

**Una sola publicación; evidencia exact-SHA obligatoria para cambiar la casilla canónica.** Se combina la ruta de producción ya existente (`AgentRuntime.startReadOnly`, `PersistentAgentStore.enqueueAdHocExplorerOrReuse` con mutex interproceso y veto de equivalencia planificada en `SessionTodoStore.withAgentLaunch`) con pruebas negativas de roles/modelo/propietario y una ejecución **nativa Pi 1.2 + Ollama Cloud Beam**, solo Explorer read-only, en un proyecto Git desechable.

- **Bloque 1 — concurrencia y roles:** conservar `tests/agent-coalesce-role-scope.test.ts`, `tests/agent-coalesce-multiprocess.test.ts`, `tests/planned-explorer-multiprocess.test.ts`: Explorer ad hoc idéntico reusa ID mientras está activo; Explorer planificado no hereda una tarea ad hoc, y Reviewer/Verifier conservan ejecuciones independientes. El Writer no participa ni adquiere permisos.
- **Bloque 2 — una inferencia verdadera:** `scripts/t12-real-ef603-coalescing.mjs` lanza tres llamadas simultáneas `AgentRuntime.startReadOnly` del mismo Explorer y el mismo modelo registrado `ollama-cloud/beam`. Exige un solo ID persistido, **un único proceso nativo Pi RPC**, un resultado terminal `completed`, una sola reserva de llamada al proveedor, sin herramientas y con Git intacto. No infiere el éxito del modelo solo por lanzar un proceso.
- **Bloque 3 — evidencia inalterable y adversarial:** `scripts/t12-ef603-coalescing-grade.mjs` y `tests/t12-ef603-coalescing-grade.test.ts` rechazan doble inferencia, identidad cruzada, roles falsos, SHA obsoleto, modelo diferente, autoridad Writer, consentimientos inventados y `globalFull:true`. Los recibos omiten transcript, claves y prompts.
- **Bloque 4 — una ejecución Ollama opt-in:** `.github/workflows/asen-real-agent-acceptance.yml` añade carril aislado activado SOLO por mensaje exacto `ci: one-time Pi EF-603 coalesced Explorer Beam proof`, HEAD exacto, `run_attempt=1`, prerequisito provider-free PASS, modelo Beam registrado y sin fallback a pago. La llamada real tiene una reserva de creación exclusiva. `tests/t12-ef603-coalescing-workflow.test.ts` audita el candado y el preflight.
- **Bloque 5 — cierre verificable:** una vez que el preflight, el carril Beam auténtico y la suite CI/Release Gate del mismo SHA terminen PASS, verificar el recibo real y **solo entonces** cambiar `EF-603` a `[x]` con prueba y SHA, y el resumen a **9/28**. No confundir un éxito local o de fixtures con esas tres recepciones.

**Checklist:**
- [ ] EF603-MEGA-01 — Preflight provider-free, typecheck, build, tests de coalescing entre procesos y roles, grader y guardas CI: PASS en exact-SHA.
- [ ] EF603-MEGA-02 — Beam/Pi 1.2 REAL: tres solicitudes concurrentes y un solo proceso/inferencia con registro duradero; PASS en exact-SHA, una sola cuota reservada.
- [ ] EF603-MEGA-03 — CI completo tres OS y Release Gate exact-SHA PASS; no reutilizar recibos de otros commits.
- [ ] EF603-MEGA-04 — Reconciliar `EF-603` con recibo exact-SHA, actualizar checks canónicos 8→9 y auditar `audit:ef-plan`. Requiere los tres checks anteriores y no promueve C01–C20 ni FULL.

**Límites:** se demuestra deduplicación de Explorer bajo identidad exacta, no una heurística de equivalencia semántica universal. Por diseño Reviewer y Verifier deben ser invocaciones distintas para asegurar contraste. EF-002/701 requieren fuentes A/B reales y Writer humano permanece bloqueado; FULL global NO alcanzado.

### EF-603 — reconciliación de cardinalidad Pi/proveedor (2026-11-04)

**Defecto de evidencia detectado:** el grader devolvía `oneProviderCall:true` basándose únicamente en `providerCallsReserved:1` y `nativePiProcessCount:1`. Un proceso nativo Pi puede emitir más de una petición a un proveedor (reintentos, regeneración o errores) y el candado local solo limita los procesos iniciados, no acredita el número de solicitudes autenticadas remotas. Por tanto, **no se puede concluir una llamada efectiva** a partir de esa reserva.

- El evaluador pasa a informar `oneNativePiProcess:true`, `oneProviderCallReserved:true` y `providerCallsActuallyObserved:null`; elimina el campo ambiguo `oneProviderCall`. El recibo generado por el runner también explicita `providerCallsActuallyObserved:null` en el resumen del log. No se modifica el mecanismo de deduplicación, los límites de inferencia, los secretos ni la autorización Writer.
- La prueba negativa exige que el grader no eleve una reserva a cardinalidad remota. **Recepción pendiente:** CI exact-SHA y Release Gate de los tres OS; el trabajo macOS del run `41861267479` quedó CANCELLED, por lo que ese Release Gate no es PASS, aunque Ubuntu y Windows terminaron SUCCESS.
- El job real EF-603 del run `41861255486` fue PASS en el SHA `52a731a1`, pero demuestra una única ejecución Pi y tres solicitudes coalescidas; **no acredita por sí solo el número real de peticiones HTTP**. La casilla canónica EF-603 permanece abierta (8/28), a la espera de trazas fiables de llamadas, CI completo y contraste de los roles pendientes. No reutilizar ese recibo como éxito del nuevo SHA. FULL no alcanzado.

### MEGATANDA EF-002/603/701/703/704 — integridad de informes, comparación canónica y atribución Pi (2026-11-04)

**Cuatro defectos reales y sus regresiones, agrupados en un único commit; recepción CI exact-SHA pendiente:**

1. **EF-701:** el lector de recibos comparaba trazas con `JSON.stringify(record.trace)===JSON.stringify(entry.trace)`, atribuyendo falsos `RECEIPT_CONTENT_MISMATCH` a campos semánticamente iguales con distinto orden de propiedades JSON. Ahora compara las seis claves canónicas por nombre y conserva el orden de los arrays; rechaza claves adicionales o ausentes. Prueba positiva reordenada y negativa de autoridad extra.
2. **EF-703/704:** `t12-acceptance-ledger.mjs` escribía el informe sin `flag:wx`, permitiendo sobrescribir un recibo anterior. Ahora el output es create-only en un directorio físico/canónico y sigue declarando `globalFull:false`. Pruebas de repetición, alias por enlace simbólico, ruta no normalizada y preservación de bytes.
3. **EF-002/701:** el generador de readiness C01–C20 permitía atravesar directorios simbólicos en `ASEN_AB_CASE_READINESS_OUTPUT`. Ahora exige directorio físico/canónico y ruta normalizada, rechaza `globalFull:true` y conserva create-only. Pruebas de alias, sobrescritura y falsificación.
4. **EF-603/704:** el grader de coalescing devolvía `authenticatedNativePi:true` basándose en un JSON autoemitido, sin independencia criptográfica ni atestación de tercero. El resultado se limita a `receiptConsistentWithOneNativePiProcess:true`, `independentPiAttestation:false`, reserva observada y llamadas remotas no contadas. El job real previo `41861255486` en SHA `52a731a1` sigue siendo evidencia acotada, no recibo nuevo.

**Requisitos de recepción:** los cuatro tests focalizados deben aprobar el preflight provider-free y CI + Release Gate exact-SHA en los OS exigidos. No heredar PASS de commits anteriores ni marcar nuevas casillas canónicas hasta verificar los recibos. Estado canónico 8/28; EF-002/603/701/703/704 abiertos, C01–C20 sin 60 ejecuciones, consentimiento Writer humano y auditoría independiente aún no demostrados. Sin cuotas de pago, sin Writer falso y sin merge a main.

### EF-002/701/703 — corrección de prueba detectada en CI (2026-11-04)

El job provider-free `41867876731` del SHA `242ba26b` terminó FAIL: 232/233 pruebas PASS y `tests/agent-ab-case-readiness.test.ts:81` falló con `Missing expected exception`. Causa real: `path.join(dir,"..","evidence","new.json")` normaliza `..` ANTES de entregar la ruta al validador; la prueba afirmaba probar una ruta no normalizada, pero suministraba una ruta ya normalizada. La protección de producción `resolve(file)===file` no falló. Se corrigen los dos tests afectados (readiness y ledger) construyendo literalmente `dir+"/../..."`, de modo que el validador reciba efectivamente `..`. No se rebaja ningún gate ni se altera código de producción. Pendiente confirmar preflight, CI y Release Gate del nuevo SHA; mantener 8/28 y `globalFull:false`.

### MEGATANDA EF-603/604/601 — lanzamiento ODD de una sola vez y recuperación de identidad Pi (2026-11-04)

**Defecto observado en el código:** `SessionTodoStore.withAgentLaunch` aceptaba una tarea ya `running` como permiso para volver a invocar su callback de dispatch. La protección de `TrustedTaskAgentBinder` rechazaba un segundo agente diferente cuando el vínculo anterior seguía activo, pero aceptaba reutilizar el **mismo** ID previamente vinculado (el histórico lo trataba como idempotente); por tanto, un lanzamiento repetido del mismo agente podía ejecutar por segunda vez su callback. También se aceptaba relanzar una tarea `running` sin vínculo anterior al utilizar directamente la primitiva de almacenamiento.

**Corrección de producción:** `withAgentLaunch` solo inicia normalmente tareas `planned`; un Todo `running` necesita el canal explícito de recuperación del binder. Dentro del candado Todo, el binder impide reutilizar cualquier ID ya vinculado, verifica que exista un vínculo anterior y que cada intento anterior tenga estado real `interrupted`; prohíbe relanzar tareas huérfanas o tareas con resultados `completed`/`failed`/`cancelled` disfrazados de interrupción. Solo un **ID nuevo** puede ocupar el intento de recuperación, manteniendo el resultado previo para auditoría. No hay reinicio automático de Writer, ni nuevos permisos.

**Pruebas nuevas:** (1) mismo ID en ejecución y tras interrupción siempre rechazado; (2) Todo `running` sin enlace previo no permite inferir autorización; (3) dos recuperaciones concurrentes bajo lock solo admiten una; (4) resultado `completed` no autoriza recuperación; (5) reabrir el Todo en una segunda instancia no convierte `running` en otro permiso de lanzamiento. Workflow provider-free actualizado para ejecutar `trusted-task-agent-binder` y `planned-explorer-multiprocess` y test de cobertura exact-SHA.

**Recepción:** pendiente PASS del preflight, suites de tres OS, Release Gate y validación en una instancia Pi auténtica para la recuperación de host. No se ha utilizado una llamada de inferencia en esta tanda, no se ha simulado consentimiento Writer; EF-601/603/604 continúan PARTIAL, no se han tocado las casillas canónicas (8/28). Se mantiene FULL=false y sin merge.


**Compatibilidad del planificador:** el rechazo temprano de Todo `running` produce un error tipado `TodoAlreadyRunningError`; `TrustedTaskAgentBinder.launchExact` conserva el contrato público `TodoLaunchConflictError`, de forma que el planificador devuelve el estado `blocked` y pide refrescar el plan, en lugar de propagar una excepción genérica. La regresión existente de snapshots Writer sigue siendo aplicable; no se concede autoridad nueva.

### MEGATANDA EF-603/604/701 — invariantes de vinculación nativa Pi y equivalencia de planes (2026-11-04)

**Hallazgos en la ruta de producción:** el binder vinculaba agentes de cualquier estado (incluidos `completed`, `running`, `failed` e `interrupted`) al llamar a `launch`, y no exigía que el rol de agente coincidiera con el rol del Todo planificado. Para un Todo todavía `planned` con vínculo anterior, también podía añadir otro agente si el primero era terminal: un crash entre vínculo y transacción Todo no es una nueva autorización. Por separado, `equivalentPlannedExplorer` usaba `JSON.stringify` sobre `dependsOn` y `skillSelection`: una permutación de dependencias o del orden de claves JSON eludía la deduplicación entre planes idénticos.

**Correcciones agrupadas:** `TrustedTaskAgentBinder.#bindOwned` requiere ahora agente **nuevo en estado `queued`**, coincidencia estricta del rol si hay plan, y cero vínculos previos al lanzar un Todo `planned`. La ruta de recuperación de un Todo `running` sigue requiriendo que todos los agentes anteriores estén realmente `interrupted`; no se inventan permisos ni consentimiento Writer. `equivalentPlannedExplorer` normaliza solo el orden del conjunto de dependencias y las claves del objeto `skillSelection`, sin normalizar texto, órdenes de skills ni diferencias de modelo/candidato.

**Pruebas negativas y positivas:** agente terminal/running/interrupted no se puede vincular, cambio de rol no se admite, Explorer `queued` correcto sí; Todo `planned` con vínculo previo completed queda bloqueado; agente anterior sin registro no habilita recuperación; equivalencia de planes con dependencias y claves JSON permutadas impide segundo lanzamiento, pero cambiar de modelo mantiene un trabajo independiente. Cobertura CI del provider-free ya incluye `tests/trusted-task-agent-binder.test.ts` y `tests/planned-explorer-multiprocess.test.ts` en el SHA exacto.

**Recepción pendiente:** CI + Release Gate de los tres OS del nuevo SHA y recibos Pi nativos para las rutas que se declaren completas; no debe heredarse el `SUCCESS` de `41871323714` (SHA anterior). EF-603/604 siguen parciales; EF-701 no ha observado C01–C20. La revisión independiente, Writer humano y evidencia A/B siguen bloqueadas. Casillas canónicas: 8/28; FULL=false, sin merge.


### MEGATANDA EF-601/603/604 — proyección de disponibilidad y recuperación de vínculos inciertos (2026-11-04)

**Defectos demostrables por inspección:** la vista `TaskAgentCoordinator.snapshot` presentaba como `ready` cualquier Todo `planned` sin dependencias, aunque el journal de vínculos conservara un intento de agente que todavía necesita reconciliación. Con un almacén de links explícito, además aceptaba la coincidencia heurística `taskId:role` de agentes que no estaban vinculados al Todo, dando falsa correlación visual. El `TaskAgentTodoReconciler.reconcile` dejaba eternamente `running` tanto los Todos sin vínculo como los que referían a un ID de agente perdido o ausente tras reinicio/quarantine.

**Correcciones:** la proyección distingue `linkedAttempts` y `launchRequiresReconciliation` y declara `ready:false` ante un link previo incierto. La heurística antigua `taskId:role` se conserva solo en modo legado **sin** journal de vínculos, nunca para una correlación que asegura ser explícita. El reconciliador bloquea con motivo claro los trabajos `running` sin link o con link a agente ausente; conserva en `running` trabajos con agente realmente `queued` o `running`. Las transiciones conservan revision/CAS y no relanzan ningún agente; Writer no se autoriza.

**Pruebas añadidas:** ventana pre-dispatch con vínculo y Todo planned, coincidencia simbólica sin link, vínculo a ID perdido, Todo running huérfano y agente real running que no debe bloquearse. Workflow provider-free ejecuta también las suites `task-agent-coordinator-links` y `task-agent-automation` bajo el SHA exacto. El riesgo de carrera residual de snapshots de varios ficheros se preserva como límite conocido: el estado mostrado es observacional, no un permiso para ejecutar.

**Recepción:** preflight, CI multi-OS y Release Gate exact-SHA pendientes. No se infiere Pi real ni llamadas Ollama por un test mock. Se mantienen EF-601/603/604 PARTIAL, 8/28 verificados, Writer humano y las 60 observaciones A/B/ASEN aún pendientes. Sin merge, sin acceso de pago y FULL=false.


### MEGATANDA EF-601/603/604/302/703 — reconciliación de cadenas reales de intentos (2026-11-04)

**Bug de producción confirmado por inspección:** al recuperarse una tarea, el binder preserva inmutable el vínculo del agente interrumpido y añade un vínculo nuevo, pero `TaskAgentTodoReconciler` exigía `related.length === 1` para admitir cualquier resultado satisfactorio. Todo intento recuperado con dos o más vínculos terminaba necesariamente `blocked`, aunque el último agente hubiera completado un Explorer válido. Esto impedía el cierre de la propia recuperación diseñada en EF-604.

**Corrección:** el reconciliador ahora evalúa la **cadena completa y ordenada por journal**: todos los predecesores deben estar `interrupted` y tener el rol del Todo; el último intento debe corresponder al rol y ámbito de la tarea, terminar `completed` y conservar un resumen no vacío. Solo entonces Explorer puede pasar a `done`, y un Worker *ya ejecutado con autoridad propia* pasa a `succeeded` **pendiente de revisión independiente**, nunca `done` ni Writer autorizado por el reconciliador. Reviewer/Verifier permanecen `blocked` hasta aceptación humana explícita. La ausencia de registros, contradicciones en los intentos, estados activos o cambio de rol siguen bloqueando o esperando de forma conservadora.

**Mejoras de coordinación:** la proyección del Todo identifica `latestLinkedAgentId` como último intento persistido, únicamente informativo; jamás equipara el vínculo con ejecución Pi auténtica, notificación consumida ni llamada real al proveedor. Se añaden pruebas de encadenamiento con journal y almacenamiento reales, reinicio de objetos, tres intentos, último intento activo, predecesor fraudulento, Worker sin resumen, Worker correcto aún sujeto a revisión y Reviewer sin permiso. El preflight del workflow ejecuta el nuevo test `task-agent-recovery-chain.test.ts`, y su prueba de cobertura exige su presencia.

**Recepción exact-SHA:** pendiente PASS del preflight, CI tres sistemas, Release Gate y recibos Pi auténticos de recuperación/consumo. Los tests con runtime simulado no cuentan como Ollama ejecutado ni como Writer autorizado. Se mantienen EF-601, EF-603, EF-604, EF-302 y EF-703 PARTIAL; EF-002/701 sin A/B C01–C20, EF-304 sin consentimiento humano real. Casillas canónicas: 8/28. FULL=false; sin merge a main ni proveedores de pago.


### MEGATANDA EF-601/603/604/703 — visualización de coalescing y recuperación de identidad anterior (2026-11-04)

**Dos defectos funcionales observados por inspección:** la vista `TaskAgentCoordinator.snapshot` podía presentar un segundo Todo Explorer como `ready:true` mientras un Explorer semánticamente equivalente seguía `running` en el mismo journal, aunque `withAgentLaunch` lo rechazaba bajo lock; esto daba instrucciones contradictorias al operador. Además, `TrustedTaskAgentBinder` exigía que el agente anterior estuviese `interrupted`, pero no comparaba expresamente su ID, sesión, proyecto y rol con el vínculo/tarea al decidir si un nuevo intento tenía antecedentes legítimos.

**Corrección agrupada:** `equivalentPlannedExplorer` se exporta como criterio compartido por el lock de lanzamiento y la proyección de coordinación; la vista expone `equivalentRunningExplorerId` como bloqueo observacional y `ready:false`, sin convertir la vista en permiso de inferencia. Un Explorer de distinta sesión, modelo o rol no hereda bloqueo impropio. En el binder, toda recuperación de Todo `running` exige verificar identidad real (ID/sesión/proyecto) y rol del agente interrumpido contra la cadena de vínculos. Los cambios de ámbito/rol o sustituciones del ID producen rechazo antes de crear otro vínculo o invocar el callback de despacho.

**Recepción probatoria:** pruebas nuevas de mismo Explorer con skillSelection reordenado, modelo distinto, Reviewer distinto, separación por sesión, coincidencia entre proyección y rechazo autoritativo; pruebas negativas de agente anterior con rol/proyecto/ID falsificados y positiva con recuperación real del journal (runner mock). El workflow ya ejecuta `task-agent-coordinator-links` y `trusted-task-agent-binder` en preflight; su prueba de cobertura exact-SHA se amplía. No se cuenta el mock como prueba Pi/Ollama ni como consentimiento Writer.

**Estado:** pendiente PASS exact-SHA de preflight, suite global multiplataforma y Release Gate del nuevo commit. EF-601/603/604/703 continúan parciales. 8/28 checks cerrados, C01–C20 A/B sin capturas auténticas, auditoría independiente y autorización Writer humana todavía pendientes. FULL=false; sin merge.


### MACROTANDA EF-603/604/703 — no permitir predecesores activos tras reemplazo (2026-11-04)

**Defecto real:** `TaskAgentTodoReconciler` comprobaba si *cualquier* agente vinculado estaba activo antes de validar la cadena de recuperaciones. Con un predecesor `running` y un reemplazo `queued` o `completed`, la función salía silenciosamente y mantenía el Todo `running` para siempre, ocultando un solapamiento imposible de autorizar. La comprobación del historial debía preceder al atajo para el último agente activo.

**Corrección:** se comprueba primero que todos los intentos previos estén `interrupted` y sean del rol planificado; si no, el Todo pasa a `blocked` con motivo explícito, respetando revision/CAS. Solo el último intento puede permanecer `queued` o `running` sin bloquearse. Se añaden tres regresiones (predecesor running + reemplazo queued, predecesor running + reemplazo completed, predecesor interrupted + reemplazo queued), incluidas en la suite de aceptación provider-free existente. No hay inferencia, consentimiento Writer ni lanzamiento automático.

**Recepción:** pendiente PASS exact-SHA del nuevo commit y evidencias nativas Pi. Se conservan 8/28 checks; EF-603/604/703 PARTIAL, FULL=false, sin merge.

- **2026-11-04 — EF-603 real Explorer + CI regression:** El run de aceptación funcional [41881354363](https://github.com/asenbanskaliev/ASEN/actions/runs/41881354363) del SHA `a6b1d193a433fd54c037e1b2faaffe5bbb246a44` informó PASS en el job real cuya etiqueta decía `EF-603 real Pi Beam concurrent Explorer coalescing one provider call` (tres solicitudes concurrentes, un proceso Pi en el fixture). El recibo acotó la evidencia a deduplicación de proceso; no midió llamadas HTTP, pese al texto de la etiqueta. **No demuestra el resto de roles, la paridad A/B ni FULL.** El CI general [41881368751](https://github.com/asenbanskaliev/ASEN/actions/runs/41881368751) falló en los tres OS: 7 pruebas Ubuntu, 1 macOS, 6 Windows, todas relacionadas con el reintento confirmado de agente `failed` que la protección de recuperación `interrupted` había bloqueado.
- **2026-11-04 — Corrección agrupada pendiente de exact-SHA CI:** se separan los dos tipos de reemplazo en `TrustedTaskAgentBinder`: una recuperación de `interrupted` sigue exigiendo el agente anterior interrumpido; el reintento de `failed` solo admite una autorización UI previa y comprobada por el llamador, identidad/sesión/proyecto, plan y rol de solo lectura, motivo y revisión exactos, una única vinculación anterior fallida y un ID nuevo. El reconciliador reconoce exclusivamente esa secuencia confirmada y conserva bloqueados los historiales contradictorios; las pruebas nuevas cubren reintentos válidos, repetición, revisión obsoleta, ausencia de consentimiento durable y resultados falsos. EF-603/604 continúan **PARTIAL** hasta CI del SHA y resto de escenarios reales. EF-702 conserva pruebas negativas de cuota/facturación sin consumo del proveedor ni reclasificación como FULL.


### Macrotanda de estabilización EF-603/604 — CI Windows y reintento fail-closed (2026-11-04)

- **Diagnóstico exact-SHA:** CI [41888406539](https://github.com/asenbanskaliev/ASEN/actions/runs/41888406539), SHA `b0e721093202b73b823e9f6b26981a46d38010cb`, reportó fallo Windows en `tests/agent-coalesce-role-scope.test.ts`: `Durable agents did not settle after releasing the deterministic runner` tras ~10,23 segundos de espera; el test limitaba a 300 sondeos de 10 ms pero cada lectura del journal podía tardar mucho más bajo carga. No se atribuye el fallo al proveedor: runner determinista sin llamada externa. La nueva prueba conserva todas las aserciones de aislamiento de rol/modelo/ámbito, utiliza plazo de tiempo real de 20 segundos y muestra los estados observados en caso de agotarse; el test conserva timeout finito de 45 segundos. La espera del último intento se acota a 10 segundos. **No se relajan gates ni las expectativas funcionales.**
- **Defensa adicional de EF-603/604:** el camino excepcional de retry de `failed` ahora exige un plan persistido explícito de Explorer/Reviewer/Verifier y su fase de skills correspondiente; no acepta un Todo sin plan con un motivo textual de confirmación. El reconciliador aplica la misma restricción antes de aceptar una cadena con antecesor fallido. Los fixtures negativos ahora construyen planes auténticos para seguir ejercitando el rechazo de predecesores `interrupted`, `running` y `completed` en ese camino. No hay consentimiento Writer implícito.
- **Recepción:** nueva ejecución exact-SHA, CI Windows/macOS/Ubuntu y Release Gate pendientes. EF-603/604 siguen PARTIAL, sin nuevas casillas verificadas ni declaración FULL. A/B C01–C20, Writer humano y recibos reales de proveedor siguen siendo requisitos separados.


### Megatanda de reconciliación CI — reintento `failed` y Todo legacy (2026-11-04)

- **Diagnóstico exact-SHA:** CI [41888858269](https://github.com/asenbanskaliev/ASEN/actions/runs/41888858269), SHA `7df1980b5d909d966d76782dbfdd5b5c5366866e`: `test (ubuntu-24.04)` falló en tres pruebas (`tests/pi-agent-runtime.test.ts` retry vinculado; `tests/retry-routing.test.ts` rutas legacy ×2) con `Confirmed failed-agent retry snapshot or linked scope changed`. Los demás workflows de ese SHA (Release Gate, Phase 0, F5, Pi 1.2, CodeGraph, R4 self-audit, aceptación real) terminaron en success; macOS/Windows seguían en ejecución. Reproducido localmente (3 fallos) antes del cambio.
- **Causa raíz única:** la restricción de `7df1980` exigía un plan persistido también para Todos legacy sin plan (creados con `asen_agent_start` + `todoId`), que son Explorer por construcción y tienen pruebas de retry vigentes.
- **Corrección fail-closed:** `TrustedTaskAgentBinder` y `TaskAgentTodoReconciler` aplican la misma regla: con plan persistido, rol y fase de skills deben coincidir; sin plan, solo se admite un agente `explorer`. Siguen exigidos predecesor `failed` exacto, enlace único, revisión `running`, motivo UI confirmado y descripción. Reviewer/Verifier sin plan se rechazan.
- **Pruebas deterministas (locales, no reales):** `typecheck` PASS; 42/42 en `trusted-task-agent-binder`, `task-agent-recovery-chain`, `eco07-launch-recovery`, `legacy-todo-single-launch`, `retry-routing`; nueva regresión legacy-Explorer admitido / legacy-Reviewer rechazado / plan con rol discordante rechazado. Nota: `ECO-06 worker dispatch` exige árbol Git limpio (candidato = HEAD); falla con cambios sin confirmar y no es una regresión.
- **Recepción:** PASS exact-SHA del commit que contenga esta entrada pendiente. Sin casillas nuevas: EF-603/604/601/702 siguen PARTIAL; no se heredan recibos. Bloqueos reales restantes: A/B C01–C20 (EF-002/701), consentimiento humano Writer (EF-304), Reviewer externo independiente (EF-503), interrupción TUI durante inferencia real (EF-604) y cuota real (EF-702). FULL=false, sin merge.

### Macrotanda EF-201/202/304/603/702 — observación CodeGraph, cuota Pi y vínculo legacy (2026-11-04)

**Contexto y alcance:** commit basado en el HEAD exacto `6e9617d3dab5a4a780d042ee90bd7919907bdabc`, cuyo CI `41908018477`, Release Gate `41908018571` y aceptación provider-free `41908008953` fueron SUCCESS. Se conserva expresamente la clasificación 8/28 sin nuevos recibos humanos/proveedor. Esta tanda cubre defectos de observación y guardas adicionales sin consumir modelos.

- **EF-201/202 — CodeGraph-first:** `ExplorerBudgetTelemetry` privilegiaba `args.operation` sobre `result.details.operation`: podía contar como lectura una ejecución `sync` aunque los argumentos afirmasen `query`. También contaba operaciones desconocidas como lecturas. Ahora exige que cualquier operación declarada o observada sea exactamente `query`, admitiendo ausencia de ambos campos para compatibilidad. Los eventos `init`, `sync`, reindexado desconocido y discrepancias quedan excluidos. Las pruebas verifican que ninguna escritura infla consultas/bytes ni dispara Explorer y que cuatro lecturas reales sí activan una única recomendación.
- **EF-702 — señal de cuota:** `eco07ProviderRateLimitError` aceptaba eventos no terminales cuyo `message.stopReason` incluyera un error, produciendo falsos avisos de cuota a partir de herramientas o deltas; ahora, cuando existe `event.type`, solo acepta `message_end` o `turn_end`. Los eventos sin tipo antiguos siguen compatibles. El análisis de error se limita a 64 KiB y devuelve únicamente etiquetas estáticas, sin copiar secretos. Pruebas positivas/negativas no afirman agotamiento real de proveedor.
- **EF-603/304 — vínculo Todo legacy:** `TrustedTaskAgentBinder.#bindOwned` admitía agentes `worker`/`reviewer`/`verifier` sin un plan persistido. Aunque el propio runner protege las escrituras, un enlace sin rol permitido generaba atribución falsa en el coordinador. Ahora, sin plan exacto, únicamente puede vincularse un Explorer `queued` de solo lectura. Se actualizan los mocks de pruebas para reflejar roles reales y se añaden regresiones para Worker, Reviewer, Verifier, rol ausente y Explorer legítimo. No se emite ni reproduce consentimiento Writer.

**Recepción pendiente del nuevo SHA:** preflight provider-free, CI en los tres OS, Release Gate y criterio original de las casillas EF. Los tests son deterministas, no ejecuciones Pi/Ollama reales. EF-201/202/304/603/702 no se declaran FULL; EF-002/701 requieren las 60 observaciones A/B/ASEN, y las autorizaciones reales siguen pendientes. Sin merge a `main`, sin proveedores de pago.



### Reconciliación de autopiloto y CI exact-SHA (2026-11-04)

- HEAD confirmado del PR #45: `f2f993c817f837f08f2eff4a4d41e06b22f50590`; commit: `fix(ef-201/702/603): reject CodeGraph writes, false quota signals and legacy non-Explorer dispatch`. Este commit contiene guardas provider-free y regresiones EF-201/202, EF-603 y EF-702; no ejecuta inferencia, Writer ni referencia A/B.
- Evidencia exacta de Actions para este SHA: [CI #2190](https://github.com/asenbanskaliev/ASEN/actions/runs/41926003150) sigue `in_progress`; [Release Gate #1783](https://github.com/asenbanskaliev/ASEN/actions/runs/41926004817), [Phase 0 #1792](https://github.com/asenbanskaliev/ASEN/actions/runs/41926003325), [F5 #233](https://github.com/asenbanskaliev/ASEN/actions/runs/41926001097), [Pi 1.2 runtime #1173](https://github.com/asenbanskaliev/ASEN/actions/runs/41926002575), [CodeGraph #236](https://github.com/asenbanskaliev/ASEN/actions/runs/41926000975) y [R4 automated self-audit #224](https://github.com/asenbanskaliev/ASEN/actions/runs/41926002166) están SUCCESS. R4 está rotulado automáticamente y no es independiente. [Pi Free Smoke #1535](https://github.com/asenbanskaliev/ASEN/actions/runs/41926002232) está SKIPPED.
- La matriz canónica F0–F6 conserva **8/28 EF verificados**. Las casillas [x] de recibos auxiliares que aparecen en el Log no sustituyen tareas EF ni elevan esta cuenta. No se marcan nuevos EF: falta terminar CI exact-SHA y la última tanda no aporta evidencia de referencia, Writer humano o consumo real de proveedores.
- Código revisado en este HEAD: `ExplorerBudgetTelemetry` rechaza operaciones CodeGraph declaradas como escritura/desconocidas y contradicciones entre entrada/salida; el binder limita los vínculos de Todo legacy sin plan a Explorer queued; el clasificador de cuota solo acepta errores Pi terminales tipados y acota el texto de error. Pruebas deterministas ya presentes en las suites EF-201/202, `trusted-task-agent-binder` y EF-702. Esto verifica contratos locales, no ejecución real A/B.
- Bloqueos que siguen abiertos: EF-002/701 necesitan 60 observaciones C01–C20 de A/B/ASEN y un host B provisionado; EF-304 necesita decisión humana auténtica ligada al candidato Writer; EF-503 requiere Reviewer realmente independiente; EF-604 requiere interrupción/reinicio del host TUI durante inferencia real y recuperación/consumo observados; EF-702 requiere recibos de proveedor gratuito realmente ejecutado sin gasto. No se simula ni se rebaja ninguno.
- Próximo paso: recoger el resultado completo del CI exacto `41926003150`; corregir cualquier fallo antes de acumular cambios dependientes. Después continuar la macrotanda EF-601/603/604 con harness provider-free y recibos Pi disponibles, sin alterar los 8/28 hasta que los criterios canónicos se satisfagan.



### Macrotanda EF-603/604 — validar también el último intento activo tras reinicio (2026-11-04)

**Defecto encontrado en revisión de código:** `TaskAgentTodoReconciler` validaba rol y estado de los predecesores, pero devolvía `running` sin transición cuando el último agente estaba `queued` o `running`, incluso si su rol no coincidía con el plan persistido. Un vínculo contradictorio podía mantener la tarea aparentemente activa indefinidamente tras reinicio. El binder bloquea el lanzamiento normal, pero el reconciliador debe ser seguro ante historial durable legado o corrupto.

**Corrección implementada:** antes del atajo para intentos activos, el reconciliador valida identidad session/project y el rol exacto del último agente contra el plan; un Todo legacy sin plan solo admite Explorer. Las discrepancias se marcan `blocked` con motivo explícito y CAS, sin despacho, replay ni restauración de permisos. Se agrega regresión con último Reviewer activo vinculado a Todo Explorer.

**Verificación pendiente:** la prueba determinista está añadida a `tests/task-agent-recovery-chain.test.ts`, que ya forma parte de las suites CI y de aceptación provider-free. Aún no se atribuye PASS al candidato nuevo. No se cierra EF ni cambia 8/28 hasta CI exact-SHA y recibos nativos exigidos. El commit se prepara para ejecutar la aceptación limitada Ollama Cloud Beam de máximo cinco inferencias; solo se contará si Actions confirma el run exact-SHA y sus recibos.



### Recepción EF-503/702 — primera aceptación Beam exact-SHA rechazada por Reviewer (2026-11-04)

- Run real [41928158752](https://github.com/asenbanskaliev/ASEN/actions/runs/41928158752), SHA `46ab623731f1493ba5fd60703089b821f54653cc`, instaló el plugin Ollama Cloud y registró el modelo gratuito `beam`; la llamada de humo independiente se omitió por diseño dentro del máximo de cinco inferencias. La ejecución auténtica de Explorer y Planner terminó PASS. El primer juicio Reviewer terminó `REVIEWER_FINDING_UNGROUNDED`; Verifier y el segundo juicio no se ejecutaron. El contador final registró 3/5 reservas y 2 restantes; no se excedió el límite.
- El artefacto [13370920410](https://github.com/asenbanskaliev/ASEN/actions/runs/41928158752/artifacts/13370920410) conserva SHA de respuesta, tamaño y estado, pero omite intencionadamente la respuesta cruda. El estado agregado no expone qué campo del contrato exacto falló. No se atribuye la causa a cuota ni se declara Reviewer PASS.
- **Corrección de aceptación:** el siguiente intento pide explícitamente copiar literalmente `codeEvidence` y `acceptanceCriterion`, manteniendo todas las comprobaciones originales. El recibo fallido añade solo un código de diagnóstico estático (esquema, candidato, veredicto, recuento, razón, evidencia o criterio); no persiste texto del modelo. No se han reducido expectativas ni se simula independencia: ambos jueces siguen usando el mismo Beam.
- Estado canónico EF-503 continúa PARTIAL; EF-702 continúa PARTIAL; 8/28 checks verificados; FULL=false. Repetir la aceptación requiere un workflow nuevo exact-SHA y vuelve a estar limitado a cinco llamadas.



### Aceptación Beam real y siguiente prueba de coordinador — 2026-11-04

- En el SHA exacto `c1542b48d187f575fc360fc8e6c0e2f1b4120516`, la aceptación [41929195297](https://github.com/asenbanskaliev/ASEN/actions/runs/41929195297) terminó SUCCESS. Artefactos: [provider 13371211276](https://github.com/asenbanskaliev/ASEN/actions/runs/41929195297/artifacts/13371211276) y [provider-free 13371440803](https://github.com/asenbanskaliev/ASEN/actions/runs/41929195297/artifacts/13371440803).
- El recibo auténtico registra Beam gratuito de Ollama Cloud en Explorer, Planner y dos juicios Reviewer separados, más Verifier; se reservaron exactamente 5 llamadas máximas. Los tres defectos del fixture fueron rechazados y la revisión/verificación determinista quedaron en `PASS_NEGATIVE_REJECTION`; Writer no autorizado, herramientas deshabilitadas, sin respuesta cruda persistida. Esto no es una revisión externa independiente ni Writer humano.
- A/B solo aportó testigos de objetos fuente, con cero escenarios ejecutados. C01–C20 siguen bloqueados. Las etapas Pi parent/child, EF-603 y EF-604 con modelo real se omitieron en este workflow por el disparador opt-in separado.
- En la misma revisión exact-SHA, Release Gate `41929204975`, Phase 0 `41929204955`, F5 `41929204958`, CodeGraph `41929204826`, runtime Pi `41929204898` y autoauditoría R4 `41929204803` SUCCESS; CI general `41929204808` aún IN_PROGRESS al consultar. Pi Free Smoke SKIPPED. Ningún resultado se hereda para el SHA siguiente.
- No se eleva el total canónico: **8/28 EF**, FULL=false. EF-503 sigue PARTIAL porque ambos revisores usan el mismo Beam y no son independientes; EF-702 sigue PARTIAL porque no se probó recuperación real de cuota/proveedor; EF-601/603/604 permanecen PARTIAL sin sus pruebas parent/child, coalescing o restart requeridas.
- Siguiente megatanda: añadir regresión de concurrencia con dos procesos independientes compitiendo por el acuse del mismo evento persistido; después disparar la aceptación nativa Pi parent + Pi RPC child con Beam en el entorno aislado mediante el único mensaje opt-in `ci: one-time Pi parent-child Beam proof`. Es prueba acotada de EF-601, no de A/B ni FULL.


### Revisión de la prueba concurrente de acuse — pendiente de CI exact-SHA (2026-11-04)

La prueba multiproceso de EF-601/604 compite con dos procesos independientes por confirmar el mismo evento encolado y exige que exactamente uno devuelva `acknowledged=true`, con el diario persistente en estado final `acknowledged`. La auditoría detectó un escape duplicado en el separador de salida antes de aceptar CI; se corrigió en el commit siguiente y la validación exact-SHA sigue pendiente. Esta prueba de concurrencia no acredita por sí sola consumo de un turno Pi.


### EF-601 recibo real de consumo parent-child Pi — 2026-11-04

- [x] EF601-REAL-PARENT-CHILD-01 — **PASS acotado**, SHA exacto `03be1c4c9a772f54b4f6c9ee77dc5fe4ba36ed5a`: workflow [41930346960](https://github.com/asenbanskaliev/ASEN/actions/runs/41930346960), artefacto [13372350121](https://github.com/asenbanskaliev/ASEN/actions/runs/41930346960/artifacts/13372350121), `PASS_REAL_PI_PARENT_AND_CHILD_BOUNDED`. Evidencia: proceso hijo Pi RPC Explorer real, inferencia Ollama Cloud Beam observada, Pi TUI 1.2.0 padre real, entrega terminal, idle wake, mismo-turno status exacto y ack confirmado; un resultado en diario `acknowledged`; checkout desechable intacto. Sin Writer ni consentimiento simulado.
- La ruta probada fue **padre inactivo**. No cubre padre ocupado, reinicio del TUI durante una inferencia, la comparación A/B C13 ni independencia externa. Por ello EF-601 canónico permanece PARTIAL, y EF-604 permanece PARTIAL. FULL=false.
- La regresión de concurrencia del acuse (dos procesos sobre un solo evento) pasó dentro del job provider-free de esta misma aceptación exact-SHA; no equivale a consumo de un turno Pi.
- En SHA `03be1c4`: Release Gate `41930355820` SUCCESS, Phase 0 `41930355793`, F5 `41930355717`, Pi Runtime `41930355971`, R4 self-audit `41930356042` y CodeGraph `41930355931` SUCCESS; CI general `41930355876` seguía IN_PROGRESS al registrar. Autoauditoría no es revisión independiente. A/B tiene cero escenarios ejecutados y el total canónico permanece 8/28.
- Siguiente megatanda: lanzar el test aislado de EF-604 que interrumpe una inferencia real de Pi RPC tras observar el primer text-delta y verifica el estado durable desde otro proceso sin credenciales; reforzar su prueba de workflow para exigir el mensaje opt-in exacto. No lo presentará como reanudación de TUI interactivo.


### Corrección de la regresión del gate de opt-in EF-604 — 2026-11-04

La auditoría del test añadió una comprobación para impedir que el job de Beam se ejecute por coincidencia parcial de mensaje. Detectó un escape duplicado en la regex negativa, que podía dejar el bypass sin comprobar. La expresión se corrigió para detectar `contains(github.event.head_commit.message)` incluso con espacios. La condición productiva continúa siendo igualdad exacta del mensaje. Evidencia del test queda pendiente de CI exact-SHA.


### EF-604 recibo real de interrupción Beam — 2026-11-04

- [x] EF604-REAL-STREAM-01 — **PASS acotado**, SHA exacto `1b5f1e4358a2032c1f97fe19ccc1b89693743566`: workflow [41931282240](https://github.com/asenbanskaliev/ASEN/actions/runs/41931282240), artefacto [13372590402](https://github.com/asenbanskaliev/ASEN/actions/runs/41931282240/artifacts/13372590402). Pi 1.2 RPC real, modelo child-reported Ollama Cloud Beam, un text-delta auténtico observado (6 caracteres), proceso cancelado no-cero, estado terminal durable `cancelled`, reapertura desde otro proceso sin credenciales y cero replay; proyecto sin cambios y sin herramientas/Writer.
- No es reinicio interactivo del host/TUI ni reanudación de la inferencia; la entrega quedó `pending`. EF-604 canónico sigue PARTIAL por esas brechas, Writer humano y A/B C14–C15.
- Release Gate `41931293807` y CI `41931293790` estaban IN_PROGRESS al avanzar a la tanda siguiente; no heredar sus resultados. Phase 0 `41931293782`, F5 `41931293839`, Pi Runtime `41931293840`, R4 SELF_AUDIT_ONLY `41931293783` y CodeGraph `41931293869` SUCCESS; Pi Free Smoke SKIPPED.
- La revisión del siguiente EF-603 live harness detectó que recibía solo el resultado final, sin evidencia separada de selección del modelo ni de text-delta. Nueva tanda: exigir una única selección child-reported Ollama Cloud/Beam y al menos un text-delta del único Pi RPC; conservar explícitamente `providerCallsActuallyObserved: null` porque no existe telemetría autenticada del HTTP exacto. Ejecutar el job coalescing real con exactamente una reserva, sin declarar cardinalidad HTTP.


### Corrección sintáctica de test EF-603 exact opt-in — 2026-11-04

La nueva aserción de workflow tenía una comilla final mal colocada. La inspección estática antes del resultado del CI la detectó y el test se corrigió para compilar y exigir la igualdad exacta del mensaje. No cambia el workflow productivo. El resultado exact-SHA queda pendiente.


### Corrección del fixture de modelo Beam EF-603 — 2026-11-04

- El preflight provider-free exact-SHA del commit `853b9f76b478d0068fc93f9983d38a7257c216d4` falló en `tests/t12-ef603-coalescing-grade.test.ts`: el fixture declaraba `beam`, mientras que el contrato del grader permite que Pi informe el identificador canónico `beam:cloud`. No fue un fallo de producción ni se ejecutó el carril Beam real, porque depende del preflight PASS.
- Se normaliza el fixture positivo a `beam:cloud`; el grader sigue admitiendo los dos nombres Beam documentados y conserva los rechazos para proveedor/modelo ajenos. La regresión conserva el rechazo de cambios no permitidos.
- Esta corrección no añade evidencia ni cambia el estado canónico: **8/28**, EF-603 PARTIAL, FULL=false. Pendientes el preflight, aceptación Beam real exact-SHA, CI y Release Gate para el SHA correctivo.


### EF-603 Beam alias regression and exact-SHA live run — 2026-11-04

- La aceptación provider-free `41932735996` sobre `18c0ce712115b491a0abfd9c23794f5101fa4786` terminó SUCCESS: preflight y regresiones EF-603/604 pasaron. Esto valida el fixture normalizado `beam:cloud`; todavía no prueba la ejecución Beam EF-603.
- Se añade una aserción explícita para el alias `beam:cloud` y para rechazar una discrepancia entre el modelo solicitado y el modelo child-reported. El grader conserva el resultado `globalFull:false` y no convierte una reserva en conteo HTTP.
- Este commit usa el único disparador autorizado de la lane real: `ci: one-time Pi EF-603 coalesced Explorer Beam proof`. La ejecución está limitada a un Pi RPC Explorer read-only, máximo una reserva, sin herramientas ni Writer y sin fallback. Clasificación EF-603 continúa PARTIAL; 8/28, FULL=false hasta recibir el artefacto, CI y Release Gate del mismo SHA.


### EF-603 — recibo real de Explorer Pi coalescido — 2026-11-04

- [x] EF603-REAL-COALESCING-01 — **PASS acotado**, SHA `8d1859bd2edda5e6a39fb7e7681fdba68119d93b`: aceptación exacta [41933062639](https://github.com/asenbanskaliev/ASEN/actions/runs/41933062639), job Pi Beam [126935392524](https://github.com/asenbanskaliev/ASEN/actions/runs/41933062639/job/126935392524), artefacto [13371799033](https://github.com/asenbanskaliev/ASEN/actions/runs/41933062639/artifacts/13371799033). El job verificó SHA exacto, Pi 1.2.0, Ollama Cloud Beam child-reported, tres peticiones concurrentes exactas, un ID durable, un proceso Pi RPC y text-delta real; selección y recibo superaron el grader estricto. Project git quedó intacto, no tools, no Writer, `globalFull:false`.
- El recibo registra `providerCallsReserved:1` y `providerCallsActuallyObserved:null`; no afirma conteo autenticado de HTTP. No demuestra deduplicación entre roles Pi, A/B, Reviewer independiente ni cierre EF-603 global.
- El preflight provider-free exact-SHA del mismo run fue SUCCESS; las acciones CI `41933070344` y Release Gate `41933070271` permanecían IN_PROGRESS al revisar. No elevar 8/28 ni cerrar la casilla canónica hasta verificar CI y Release Gate. FULL=false.


### EF-604 — repetición exact-SHA de recuperación nativa Pi y muerte de TUI — 2026-11-04

- [x] EF604-HEADLESS-RESTART-02 — **PASS acotado**, SHA `8d1859bd2edda5e6a39fb7e7681fdba68119d93b`, aceptación [41933062639](https://github.com/asenbanskaliev/ASEN/actions/runs/41933062639), artefacto provider-free [13373215682](https://github.com/asenbanskaliev/ASEN/actions/runs/41933062639/artifacts/13373215682). Log estructurado `EF604_NATIVE_PI_HEADLESS_RESTART_PASS`: Pi 1.2.0, 5 procesos, 3 reinicios misma sesión, aislamiento de sesión ajena, 2 tareas read-only persistidas, `attempted/pending`, 0 llamadas de modelo, Writer=false, coordinador-consumption=false, globalFull=false.
- [x] EF604-TUI-CRASH-03 — **PASS acotado**, mismo SHA/run/artefacto. El recibo `native-tui-crash-recovery.json` pasó el grader exact-SHA: SIGKILL del padre Pi TUI mientras un Pi RPC hijo nativo seguía vivo; segundo TUI reabrió misma sesión, tarea Explorer `interrupted`, 1 aviso pending, 1 attempted, 2 acuses bloqueados, 0 provider calls, 0 replay, Writer=false, FULL=false. Log `EF604_NATIVE_TUI_CRASH_NO_MODEL_PASS`.
- Estos recibos cubren reinicios/crash de host con procesos Pi reales pero sin inferencia y sin consumo del coordinador. No cierran EF-604 ni prueban recovery de stream/modelo; esos criterios siguen pendientes. En SHA `8d1859bd...`, Release Gate `41933070271` PASS; CI `41933070344` continuaba IN_PROGRESS al registrar. Mantener 8/28 y FULL=false.


### EF-601 — no replay of stale terminal reports after delayed delivery — 2026-11-04

- La comparación del código congelado de referencia A (identidad exacta en `registry/parity/agent-ab-baselines-v1.json`) fija un umbral de 90 segundos: una finalización vieja se anuncia de forma compacta y su informe completo no vuelve al contexto LLM; el resultado puede consultarse explícitamente en el almacén de tarea. ASEN conserva el aviso durable, pero hasta ahora inyectaba el resumen completo siempre que el registro siguiera `pending` al volver el host, aunque fuera muy antiguo.
- Cambio propuesto en esta tanda: usar el mismo umbral al enviar avisos pendientes; un recibo de al menos 90 segundos conserva ID/rol/estado/evento y la indicación `asen_agent_status`, pero omite el resumen completo. Eventos frescos conservan el mensaje completo. No se altera el estado durable, permisos, ack, wake ni reintento.
- Regresiones para umbral exacto, reloj adelantado, fecha inválida, texto antiguo omitido e identidad preservada pasaron en aceptación provider-free `41934910473`, SHA de código `0fc9ddc65559892d64bb0cda3fd7a4085b85d5e1`, jobs `ok 53`/`ok 54`, 242/242 y 240/240 en las suites relacionadas, `fail=0`. **Subcheck cerrado:** EF601-STALE-RESULT-01, alcance de test y formato de mensaje. EF-601 canónico sigue PARTIAL: falta validar la totalidad de CI/Release Gate, demostrar la política en una reanudación real con aviso pending envejecido y cerrar A/B.


- [x] EF601-STALE-RESULT-01 — **PASS de preflight exact-SHA**, SHA `0fc9ddc65559892d64bb0cda3fd7a4085b85d5e1`, run [41934910473](https://github.com/asenbanskaliev/ASEN/actions/runs/41934910473), job provider-free SUCCESS. Tests 53 y 54 prueban que un aviso de al menos 90 s no reinyecta el resumen y preserva el eventId, umbral y fechas inválidas. Acredita policy/message con suite, no una recuperación TUI real; el EF-601 canónico permanece PARTIAL.


### EF-601 — cableado de frescura al envío real de avisos — 2026-11-04

- La aceptación anterior verificó el umbral y el formato, pero la antigüedad todavía se combinaba inline dentro de `extensions/asen.ts`. Nueva regresión agrupada: extraer el compositor `agentTerminalNoticeContent`, que recibe el `createdAt` durable y decide en una sola función si conserva u omite el resumen antes de que `sendMessage` lo reciba; la extensión consume directamente ese resultado.
- [x] EF601-STALE-WIRING-01 — **PASS provider-free exact-SHA** en `886bb7f702f8e853ee2815cf37d0024dfaface29`, aceptación `41935953720`, job provider-free SUCCESS. Prueba composer contrasta resumen viejo/fresco en el límite de 90 s y conserva eventId; test de frescura previo `ok 53`/`ok 54`. Sin llamada al modelo ni Writer.
- EF601-STALE-RESULT-01 permanece PASS para contrato/filtro; ambos son subchecks acotados y no incrementan la cuenta canónica. EF-601 sigue PARTIAL, 8/28, FULL=false.

- **No promoción canónica:** esto no demuestra reanudación TUI real con aviso envejecido, acción de lectura efectiva ni A/B C14; EF-601 canónico sigue `[ ]`.


- [x] EF601-STALE-REOPEN-01 — probar reapertura del journal `pending` con edad real >90 s y usar el compositor de `extensions/asen.ts` para omitir el reporte obsoleto sin alterar estado/eventId. **VERIFICADO, alcance provider-free acotado:** SHA `f474f2e5559c976ff711e4c03b33a980b912966c`; aceptación exact-SHA [41936460150](https://github.com/asenbanskaliev/ASEN/actions/runs/41936460150), job provider-free [126946454007](https://github.com/asenbanskaliev/ASEN/actions/runs/41936460150/job/126946454007), test `ok 23`, `fail 0`; artefacto [13375210264](https://github.com/asenbanskaliev/ASEN/actions/runs/41936460150/artifacts/13375210264). Verifica timestamp >90 s, summary omitido, eventId y estado `pending` preservados, sin claim/ack. No acredita TUI reiniciado, consumo real ni modelo; EF-601 permanece PARTIAL.

- Nota de revisión antes de validación: la primera transcripción del nuevo fixture dejó `\\n` literal en vez de un salto de línea JSON. Se corrige en el commit siguiente antes de considerar el preflight; no se atribuye validez al fixture anterior.

### EF-604 — interrupción de TUI durante inferencia real (2026-11-05)

- Nueva lane exact-SHA implementada en `scripts/t12-real-tui-stream-crash.mjs` y `scripts/t12-real-tui-stream-probe.ts`. Usa la extensión ASEN real con un `PiProcessRunner` read-only inyectado, exige modelo Beam reportado por el hijo, observa texto delta auténtico, mata el host TUI por SIGKILL mientras el RPC hijo está vivo, mata después su grupo de procesos y abre la misma sesión Pi en un segundo host. El test revalida taskId, sessionId, proyecto y estado `interrupted`; rechaza replay y aviso terminal no acreditado.
- El lane está ligado al mensaje exacto `ci: one-time Pi Beam TUI child crash proof`, un único intento y máximo 1 agente/1 reserva Beam. La recuperación no recibe credenciales; herramientas del hijo desactivadas; no Writer, no modelo de pago ni fallback.
- [x] EF604-REAL-TUI-STREAM-RESTART-01 — crash de Pi TUI real durante delta de texto de un Explorer Pi RPC Beam; reabrir el mismo TUI/sesión y reconciliar taskId/sessionId/proyecto como `interrupted`, sin replay, tools, Writer ni aviso terminal inventado. Evidencia exact-SHA `cb064f231fffbfee120f6cb2d6c8fc0160d77c8c`, aceptación [41943098995](https://github.com/asenbanskaliev/ASEN/actions/runs/41943098995), job [126969263635](https://github.com/asenbanskaliev/ASEN/actions/runs/41943098995/job/126969263635), artifact [13377266928](https://github.com/asenbanskaliev/ASEN/actions/runs/41943098995/artifacts/13377266928). El log registra PASS_REAL_PI_TUI_CRASH_DURING_CHILD_STREAM_AND_RECOVERY, modelo Beam, una reserva lógica; HTTP efectivamente observado null. El script exige delta nativo >0, proceso hijo vivo al matar el TUI, reapertura vinculada, cero replay y proyecto sin cambios.
- La prueba es un recibo acotado de interrupción/reapertura, no paridad A/B, reanudación de la inferencia, consumo por coordinador ni FULL. EF-604 y global siguen PARTIAL; canónicos 8/28 y FULL=false.


## EF-604 real Pi TUI crash durante live Beam stream — fallo y corrección — 2026-11-05

- En SHA `2a07846117f57bc0d1b2e3a94b6317753375342f`, la aceptación [41940058136](https://github.com/asenbanskaliev/ASEN/actions/runs/41940058136) pasó el preflight provider-free y los objetos fuente A/B. El job EF-604 [126958937944](https://github.com/asenbanskaliev/ASEN/actions/runs/41940058136/job/126958937944) falló al arrancar la TUI, antes de capturar marcador de stream. El registro subido [13374789516](https://github.com/asenbanskaliev/ASEN/actions/runs/41940058136/artifacts/13374789516) dice `FAIL_OR_INCOMPLETE`, `providerCallsReserved:1`, `providerCallsActuallyObserved:null`; no prueba que haya habido una petición HTTP ni un delta Beam.
- Causa raíz aún no confirmada. Hallazgo de auditoría: la TUI arrancaba con `--no-extensions` y solo cargaba la sonda, aunque el proveedor se había instalado en el home efímero; por tanto el proveedor podía no estar registrado en el host padre. Corrección: cargar explícitamente la extensión fijada `npm:pi-ollama-cloud@0.13.1` junto con la sonda y conservar la selección explícita de Ollama Cloud + Beam sin fallback.
- Diagnóstico adicional limitado a categorías (sin guardar salida de proveedor, texto del modelo ni secretos): clasificación de error de arranque, último marcador y estado de salida de TUI. La regresión provider-free exige el argumento explícito de extensión. No se ha relanzado una llamada de proveedor a ciegas.
- La casilla `EF604-REAL-TUI-STREAM-RESTART-01` sigue sin marcar; el recibo fallido no cierra criterio. Los otros CI de SHA anterior no se transfieren al siguiente. 8/28, EF-601/603/604 PARTIAL, FULL=false.
- Siguiente: ejecutar preflight y CI exact-SHA de la corrección; revisar que la TUI registre extensión y que no haya errores de tipo/flujo antes de permitir el siguiente intento único Beam.


## EF-601 — recepción real de aviso por coordinador Pi — preparación exact-SHA — 2026-11-05

- El gate provider-free actual comprueba recuperación del journal y el test de la extensión `tests/agent-rpc-tui-handoff.test.ts` recorre la ruta producción: aviso pendiente en RPC, registro nuevo de herramientas TUI, enqueue único, inspección exacta con `asen_agent_status`, ACK durable con `asen_agent_ack`, y ninguna reinyección tras reinicio. Esto continúa siendo evidencia determinista con runner fixture, no padre Pi/modelo auténtico.
- La lane existente `real-parent-consumption` ofrece un caso más fuerte: Pi TUI real con Beam como padre, Pi RPC Explorer hijo real con Beam, envío por la ruta de notificación de producción y recibos de acciones efectivas de status+ack correlacionadas con el mismo eventId/agentId. Es un test de un escenario, no A/B C13 ni FULL. La ejecución tiene `run_attempt == 1`, proveedor gratuito Ollama Beam, un Explorer, sin herramientas/Writer/permiso de escritura; el número HTTP observado sigue sin afirmarse.
- Defensa añadida al harness: rehusar cualquier run attempt que no sea 1 y cualquier ruta de test que no sea `idle` o `busy`; la prueba provider-free verifica las condiciones exactas del lane. No cambia los controles del producto ni concede autorización.
- **[x] EF601-REAL-COORDINATOR-CONSUMPTION-01** — subcheck acotado PASS con Pi TUI coordinador y Explorer hijo Pi RPC reales, ambos reportando Beam; el coordinador consumió el aviso real mediante asen_agent_status y asen_agent_ack con el mismo eventId/agentId, y el journal terminó acknowledged. Evidencia exact-SHA 41f4b8d79323d8a738934f24773d40e8b3fe4097, aceptación [41941897703](https://github.com/asenbanskaliev/ASEN/actions/runs/41941897703), job [126965116445](https://github.com/asenbanskaliev/ASEN/actions/runs/41941897703/job/126965116445), artifact [13376622656](https://github.com/asenbanskaliev/ASEN/actions/runs/41941897703/artifacts/13376622656). Prueba una entrega/consumo bounded; contador de llamadas HTTP no observado, y no acredita busy-parent, reinicio/recuperación, A/B C13–C15 ni EF-601 canónico.
- Estado global permanece 8/28; EF-601 PARTIAL; C01–C20 A/B, Writer humano, revisión externa independiente y FULL siguen abiertos. El subcheck real de consumo se verificó en el SHA y recibo indicados arriba. Próximo: hardening del scope de credencial EF-604 y su prueba provider-free; después, si preflight exact-SHA aprueba, ejecutar solo el lane opt-in `ci: one-time Pi Beam TUI child crash proof` y auditar el recibo sin reintentos ciegos.


## F5 exact-SHA actionlint — corrección SC2155 — 2026-11-05

- F5 [41941906230](https://github.com/asenbanskaliev/ASEN/actions/runs/41941906230) sobre SHA `41f4b8d79323d8a738934f24773d40e8b3fe4097` falló en `actionlint`: ShellCheck `SC2155` en la lane EF-604 TUI porque `export ASEN_SELECTED_MODEL="$(cat ...)"` podía ocultar el status del comando de sustitución.
- Corrección: asignar el valor primero y exportarlo en línea separada. No cambia el comportamiento del modelo/proveedor ni afloja lint. El resultado exact-SHA del parche todavía está pendiente; F5 no se marca PASS con el SHA fallido.
- La acceptance `41941897703` continúa ejecutando su preflight provider-free; el job Beam parent+child solo puede empezar después de este gate, no atribuirlo antes del registro del job. Mantener no-FULL.


## EF-604 — reducción del alcance de la credencial Beam — 2026-11-05

- En el workflow autenticado, OLLAMA_API_KEY deja de estar en el entorno de todo el job. El secreto se inyecta solo en los dos pasos que instalan/seleccionan el proveedor y ejecutan la prueba live; checkout, npm ci y upload de artefactos no lo reciben.
- Prueba workflow exige ausencia de secreto a nivel job y presencia únicamente en esos pasos autenticados. No amplía permisos del agente ni cambia el límite de una llamada.
- SHA base inspeccionado: 0f2eef941e768e0f5fb3235d08d96c8a2c3b5630. Acceptance [41942195379](https://github.com/asenbanskaliev/ASEN/actions/runs/41942195379) provider-free y fuentes A/B solo-procedencia SUCCESS; jobs de proveedor SKIPPED por gate; CI [41942202876](https://github.com/asenbanskaliev/ASEN/actions/runs/41942202876) seguía IN_PROGRESS al preparar esta tanda; Release Gate [41942202877](https://github.com/asenbanskaliev/ASEN/actions/runs/41942202877), Phase 0 [41942202858](https://github.com/asenbanskaliev/ASEN/actions/runs/41942202858) y F5 [41942203089](https://github.com/asenbanskaliev/ASEN/actions/runs/41942203089) SUCCESS.
- EF604-REAL-TUI-STREAM-RESTART-01 sigue pendiente hasta resultado provider-free y ejecución auténtica Beam en SHA exacto. Estado canónico 8/28; EF-601/603/604 PARTIAL; FULL=false.


## EF-604 — resultado live de crash TUI durante Beam — 2026-11-05

- [x] EF604-REAL-TUI-STREAM-RESTART-01 — lane auténtico PASS en commit cb064f231fffbfee120f6cb2d6c8fc0160d77c8c, run 41943098995, job 126969263635, artifact 13377266928. El TUI Pi 1.2.0 fue terminado por SIGKILL mientras el proceso Pi RPC hijo seguía emitiendo delta de texto Beam; el segundo TUI reabrió misma sesión y correlacionó taskId, sessionId y proyecto, con estado interrupted y cero replay. El grader interno exige herramientas desactivadas, Writer no autorizado, aviso terminal falso ausente y proyecto intacto. Log final: PASS_REAL_PI_TUI_CRASH_DURING_CHILD_STREAM_AND_RECOVERY; reserva lógica 1; llamadas HTTP observadas: null.
- La lane valida una única inferencia lógica del harness y usa un solo agente; no se atribuye conteo HTTP ni recuperación de la inferencia. No cierra EF-604 canónico, recuperación del host completo, A/B ni FULL; total canónico 8/28.
- Autorrevisión: el key se entrega solo a los pasos de setup y ejecución autenticada; la reapertura del TUI elimina ambos nombres de variable de credencial. El siguiente cambio aplica el mismo límite al lane real del coordinador y comprueba con test que no hay secreto job-wide.


## EF-601 — consumo real de notificación con padre ocupado — 2026-11-05

- [x] EF601-REAL-COORDINATOR-BUSY-PARENT-01 — prueba real bounded PASS en SHA 6b0034a1d9d8a674a0f920130a2254d558b09b5c, aceptación [41944160827](https://github.com/asenbanskaliev/ASEN/actions/runs/41944160827), job [126972883497](https://github.com/asenbanskaliev/ASEN/actions/runs/41944160827/job/126972883497), artifact [13377143664](https://github.com/asenbanskaliev/ASEN/actions/runs/41944160827/artifacts/13377143664). Pi TUI padre real ejecutó una tool call de test mientras el Explorer Pi RPC hijo finalizó; la extensión ASEN encoló un único evento y el padre consumió la notificación con status + ack. Grade exige que la inferencia del hijo ocurra dentro de la tool call activa, un Pi RPC hijo autenticado con Beam, evento/identidad coincidentes, journal terminal único, sin tools hijas, sin cambios de proyecto, sin Writer ni FULL. Log: T12_REAL_PI_BUSY_PARENT_CHILD_CONSUMPTION_PASS; HTTP efectivamente observado no informado.
- Este subcheck complementa EF601-REAL-COORDINATOR-CONSUMPTION-01 (padre idle). No prueba reactivación después de reinicio, C13 A/B, ni cierra EF-601 canónico; 8/28 y FULL=false.


## EF-603 — coalescing real concurrent Explorer requests — 2026-11-05

- [x] EF603-REAL-COALESCING-01 — PASS bounded real Pi/Beam test on SHA d76070265583e42bca003d40d33c2ccb0deb3e9e, acceptance [41945298981](https://github.com/asenbanskaliev/ASEN/actions/runs/41945298981), job [126976621404](https://github.com/asenbanskaliev/ASEN/actions/runs/41945298981/job/126976621404), artifact [13378860407](https://github.com/asenbanskaliev/ASEN/actions/runs/41945298981/artifacts/13378860407). Three concurrent identical ASEN Explorer requests received one durable ID, created one native Pi 1.2.0 RPC process, observed one child-selected Ollama Cloud Beam model and real assistant text delta, ended in one durable completed Explorer record, and left the disposable project unchanged. No child tools or Writer.
- Receipt/log explicitly states providerCallsReserved=1 and providerCallsActuallyObserved=null. Evidence proves durable task/process coalescing, not HTTP request count or provider-side billing count. Historical workflow label corrected to say one Pi RPC process.
- Subcheck only; canonical EF-603 remains partial because multi-session/process, real provider call counting, all role-scope cases, and frozen A/B C02-C03 comparison are still not closed. 8/28; FULL=false.


## EF-403 — preflight corrigido antes de la prueba live — 2026-11-05

- La aceptación [41945944693](https://github.com/asenbanskaliev/ASEN/actions/runs/41945944693) en SHA 505d5bb467f068b75976d8f31f3110ca1732a79a bloqueó correctamente todas las lanes de proveedor porque falló el test provider-free `EF-403 live repaired Reviewer and Verifier lane cannot authorize or write`.
- Causa: el test exigía `humanConsent:false` en el texto del harness; el reporte no incluye ese campo. El contrato comprobable sí expresa `writerAuthorized:false`, `authorization:NOT_GRANTED` y `independentReview:false`. La expectativa adicional era ajena al contrato y se elimina; no se debilita ninguna autorización de Writer.
- Resultado: cero llamada/reserva de proveedor en ese run, ningún subcheck EF-403 cerrado. Se vuelve a ejecutar solo después del preflight exact-SHA corregido.


## EF-403 — Reviewer/Verifier live Beam fallo sin causa observable — 2026-11-05

- En SHA 7d99b3cde60f82d0be288fe7fbac4dee308aff14, preflight provider-free PASS y carga/selección del proveedor Beam PASS; el job live [126980183141](https://github.com/asenbanskaliev/ASEN/actions/runs/41946364721/job/126980183141) falló durante la etapa `REVIEWER_PI_RPC` en acceptance [41946364721](https://github.com/asenbanskaliev/ASEN/actions/runs/41946364721). El log no distingue cuota, respuesta del modelo, RPC o contrato del artifact; llamada HTTP efectiva desconocida.
- La lane no llegó a invocar Verifier. El harness reserva el slot Reviewer antes de Pi RPC y no permite reintentos dentro del workflow. No hay subcheck EF-403 PASS ni se repetirá el proveedor a ciegas; el recibo no demuestra que haya habido HTTP.
- La siguiente mejora de evidencia clasifica fallos a un enum acotado, guarda la cantidad de slots lógicos reservados y conserva `providerCallsActuallyObserved:null`, sin almacenar output/model transcript/credenciales. El test no convierte el fallo actual en PASS ni promete recuperación del proveedor.


## EF-403 — corrección de expectativa del recibo — 2026-11-05

- La aceptación provider-free [41947366698](https://github.com/asenbanskaliev/ASEN/actions/runs/41947366698), SHA bafe83e5788219fb5782efd986026c832bd90718, falló antes de cualquier lane autenticado en el subtest EF-403: esperaba el literal callsReserved:2, mientras la mejora sustituyó correctamente ese literal por un contador dinámico.
- Corrección: el harness valida explícitamente que el contador sea exactamente dos antes del recibo PASS; el test verifica esa aserción. La ejecución Beam fue SKIPPED por el gate fallido, por lo que esta falla no reservó proveedor ni cambia el resultado live anterior.


### EF-601 — auditoría de implementación de la referencia externa — 2026-11-05

Se consultó el código de repositorio externo de referencia, rama `main`, árbol exacto `7ecb826a2b1eafa6b522ee16d905a99e998f0c89`: `lib/agents-completion-delivery.ts`, `lib/agents-message-delivery.ts` y la extensión de agentes de la referencia.

- La referencia externa mantiene las finalizaciones en una cola en memoria, suprime duplicados/consumidos, aplica frescura de 90 segundos y las vacía en límites de turno o cuando queda inactivo. `dropAll()` elimina la cola y sus marcadores al iniciar o cerrar la sesión; no recupera avisos terminales desde un journal durable tras reinicio.
- ASEN conserva avisos por sesión/proyecto en un journal durable, valida el agente terminal antes de encolar, distingue `pending → attempted → enqueued → acknowledged`, y no vuelve a transmitir `attempted` porque el transporte pudo haberlos aceptado antes de un crash. También omite el resumen de avisos pendientes con antigüedad ≥90 s. Esta diferencia amplía la recuperación, pero mantiene explícita la incertidumbre de transporte y no equivale a probar consumo por el modelo padre.
- Evidencia ASEN acotada ya registrada en los subchecks de coordinador idle/ocupado y reinicio TUI. El recibo ocupado prueba que Pi padre llamó a status y ack; no demuestra por sí solo que el modelo haya leído/razonado sobre el mensaje. No modifica el criterio del caso C13.
- **Clasificación:** documentación de referencia verificada; EF-601 canónico permanece PARTIAL, sin marcar checks nuevos. Para cerrar hacen falta ejecución comparable C13 en A/B/ASEN y evidencia auténtica del consumo/recuperación tras reinicio. FULL=false.


### Tanda conjunta EF-601/604/702/703 — validación autenticada acotada (2026-11-05)

- Se habilita un único disparador de commit para ejecutar **dos jobs existentes** de aceptación real con Pi/Ollama Beam tras preflight provider-free: EF-601 padre ocupado con hijo RPC auténtico y EF-604 SIGKILL de TUI durante streaming del hijo, con reapertura y comprobación de no replay. Ambos conservan su selección de modelo registrado, entorno efímero, límite de tiempo, recibos exact-SHA y ausencia de autorización Writer. No se añaden llamadas de proveedor para EF-702: se inspeccionan los recibos de selección y fallos de estos mismos jobs, sin simular agotamiento real de cuota.
- EF-703 se evalúa contra la matriz CI Ubuntu/macOS/Windows, Release Gate, F5, Arquitectura, Pi runtime, CodeGraph y R4 automático del **mismo SHA**, sin confundir auditoría automática con independiente. Los jobs Beam corren solo en Ubuntu; no constituyen prueba Beam multiplataforma.
- **Pendiente de ejecución y verificación:** los dos jobs y todos los gates de este nuevo SHA. No se heredan recibos anteriores ni se promocionan EF canónicos por el mero lanzamiento. EF-601/604/702/703 permanecen [ ] y PARTIAL; A/B C01–C20, recuperación completa, errores de cuota reales, consentimiento Writer y revisión independiente siguen pendientes. FULL=false.


### F9 validación de Release Gate y F8 Windows ECO-06 — 2026-11-05

- **F9 PASS exact-SHA:** `d6e785b6fc6b2277e1302782c77a0da65ed30374`; Release Gate `41982608404`, tres OS PASS. Instrumentación T09 en el paquete real: Ubuntu total 19.435 ms (upgrade/rollback 15.181 ms), macOS 36.792 ms (27.628 ms), Windows 87.951 ms (69.388 ms). Se conservan firmas, comprobación TLS, rollback, SQLite, SIGKILL y pruebas Pi. Este PASS es de Release Gate, **no** de EF-703 integral.
- **F8 Windows aún no validado como suite completa:** CI `41982608112` (mismo SHA F9) terminó FAILURE: el shard 2 falló en el test ECO-06 `Pi worker dispatch binds one write to persisted ODD scope`, tras consumir su ventana asíncrona de 10 s antes de observar la llegada al runner; el gate `test-shard-coverage` rechazó correctamente la matriz fallida. La ejecución anterior `41980435796` falló en el mismo punto con la ventana de 3 s. Los demás controles F9 (F5, Arquitectura, Pi Runtime, CodeGraph, R4 auto y aceptación funcional) PASS. No se atribuye a los agentes una causa no demostrada.
- **Corrección focalizada pendiente de CI:** conservar identidad, consentimiento, permiso acotado, persistencia y revisión obligatoria del test; ampliar únicamente el plazo de observar el arranque en el runner Windows a 30 s (10 s en otros SO) y emitir al fallar el estado durable del agente/Todo y el número de diálogos de confirmación, sin registrar prompts ni credenciales. No se altera código de autorización ni se marca EF-304/303/703. Revalidar suite exact-SHA antes de contar FULL. Estado EF canónico: 8/28, FULL=false.


### F10 — megatanda EF-601 / EF-604 / EF-702 y diagnóstico F8 Windows (2026-11-05)

- **EF-601/604:** AgentNotificationJournal.recoveryReview() expone, sin modificar estado, las cuatro clases de aviso terminal tras reinicio: pendiente sin reclamar; entrega incierta que nunca se reenvía automáticamente; encolada pendiente de inspección; y acuse de coordinador que **no demuestra consumo por el modelo**. La opción explícita asen_agent_status({includeNotices:true}) devuelve los agentes del alcance y los avisos cotejados con el estado terminal durable; la llamada sin opción mantiene su forma de salida. No reanuda ni autoriza Writer.
- **EF-702:** eco07ProviderRateLimitError lee solo propiedades de datos propias de sobres terminales Pi, sin ejecutar getters, con proxies hostiles o revocados cerrados de forma conservadora. No confunde pago con cuota aunque el error mencione 429. No añade fallback de pago, reintentos ni inferencias.
- **Evidencia provider-free:** pruebas para recuperación sin mutación, aislamiento de scope, ausencia de permisos/consumo inventados, compatibilidad del status y rechazo de getters, proxies, mensajes no terminales y reclamaciones de facturación.
- **F8 bloqueado:** CI 41984827167, Windows shard 2 FALLÓ otra vez en ECO-06: agentState=failed, todoState=blocked, writerConfirmations=2 tras 30 s. Esto descarta un simple problema de temporización. Gate de cobertura FAIL correctamente. Es preciso capturar la clase acotada de fallo del dispatcher antes de tocar seguridad. No se autoriza reintento de Writer real ni se marca EF-304.
- Esta tanda no acredita C01–C20 A/B, consumo auténtico del padre, Writer humano, cuota real del proveedor ni R4 independiente. EF-601/604/702 permanecen PARTIAL; checks canónicos [ ]; FULL=false. Pendiente aceptación exact-SHA de CI tres OS, Release Gate, R4 auto y preflight sin proveedor.


### F10 preflight cleanup corrective slice (2026-11-05)

- En SHA 2be30ab6e7d6921c9b03e8c58f5a1382a37225cb, la aceptación provider-free 41986693917 superó typecheck y build, pero falló antes de pruebas reales al limpiar el fixture de profile-selection: ENOTEMPTY en un directorio temporal bajo .asen. No demuestra fallo de modelo ni de los cambios EF-601/604/702.
- Corrección focalizada: la limpieza tras session_shutdown conserva eliminación obligatoria, pero admite hasta 10 reintentos acotados con pausa de 150 ms ante carreras de handles del sistema. No se ignoran errores persistentes, no se cambia el flujo de permisos y el test sigue verificando invalidación y ausencia de encolados. Pendiente nueva ejecución exact-SHA. No marcar FULL.

### FUI — procedencia y auditoría de límite upstream (2026-11-05)

- El primer CI documental del SHA `adb44b61aadb980f09302af1decb506f910ecfcc` encontró que `scripts/audit-upstream-boundary.mjs` prohíbe referencias a los repos originales también en documentos ODD (Phase 0 run `41993385054`, FAIL). La auditoría impide arrastrar fuentes externas al código de producción y **debe mantenerse**.
- Para poder conservar el nombre, comandos y SHAs exactos en la documentación de referencia, se añaden únicamente **dos documentos ODD** a una excepción explícita de procedencia del auditor: este plan y `odd/tasks/gentle-shell-v4.6.0-paridad-ui-odd.md`. Todos los demás archivos y código siguen sujetos a la prohibición anterior. No se importan módulos del upstream, no se cambia autorización o provider y no se certifica FULL.
- La validación completa de la excepción y los gates restantes queda pendiente del nuevo SHA exacto; no atribuir PASS de anteriores.


### M1 / FUI — primera implementación Pi pública y estabilización de CI (2026-11-05)

- **Implementado, pendiente de aceptación exact-SHA:** src/runtime/ide-panel.ts proyecta seis secciones en el orden TODOS, JOBS, AGENTS, CHANGES, REVIEW, INTEGRATIONS. La proyección es read-only, plegable, sensible a anchura y sanitiza caracteres de control. Todo succeeded sigue pendiente de revisión, nunca done; Agent interrupted requiere inspección. No inventa modelos, tokens, precios, conexiones MCP ni revisión completada.
- **Integración parcial real:** /asen-panel abre un selector nativo Pi en TUI o acepta all|status|todos|jobs|agents|changes|review|integrations. Vuelve a validar sesión y proyecto antes de consultar stores, muestra Git real y unavailable si falla. La fila asen-live-work usa setWidget únicamente en TUI; se actualiza con cambios de Todo, turn_end y agent_settled. Estado asen:workspace actualiza rama y dirty count a fin de turno y se limpia al cerrar. Ninguna UI concede autoridad, lanza un modelo o recupera avisos automáticamente.
- **Limitación actual:** esto todavía NO constituye el rail fullscreen único a 140 columnas, visor Changes de dos paneles, overlay de threads Agents, integración MCP ni footer completo con métricas Pi. Ninguna tarea UI-01..UI-14 pasa a [x] por esta implementación parcial.
- **Pruebas nuevas sin proveedor:** tests/ide-panel.test.ts cubre orden, colapso, estados, separación succeeded/done, jobs, estado incompleto, sanitización y ancho 12/35/80/140. Las pruebas TUI reales, mouse y A/B siguen pendientes.
- **Correcciones de CI observadas en SHA f0e572f:** journal EF-601/604 comparaba orden indeterminado entre sistemas: comprobar deliveries/dispositions por eventId exacto; Windows ECO-06 rechazaba Writer antes de llegar al runner (failureClass AUTHORIZATION): el test usa Git temporal limpio aislado del checkout compartido, sin cambiar guards; timeout de espera worker en migraciones de memoria Windows pasa de 10s a 30s (15s en otros sistemas) sin modificar SQLite ni migración.
- **Estado hasta nuevo CI:** 28 EF originales y 8 checks históricos inalterados; FULL=false. No merge a main; cada nueva observación debe provenir de la ejecución del SHA publicado.

### M1b — aislamiento de sesión en panel y reparación del inventario (2026-11-05)

- La primera publicación M1 (SHA 7a45a4b) supera arquitectura, F5, Pi runtime, CodeGraph, R4 automático, Release Gate en tres sistemas y aceptación funcional con preflight; el CI aún no ha terminado. En macOS shard 1 y Windows shard 1 falló el contrato estático del inventario de comandos porque el nuevo /asen-panel no estaba en su lista exacta; se actualiza dicha prueba manteniendo la comprobación estricta de todos los comandos.
- Se exige al panel aplicar sesión y raíz de proyecto también en el proveedor de agentes inyectado (además de los stores persistentes, ya acotados). Nueva prueba de regresión con agentes de otra sesión y proyecto y con selector nativo Pi que cambia de sesión antes de confirmar. Ningún dato externo se devuelve.
- Estos ajustes todavía no convierten UI-01..UI-14 en FULL ni acreditan el rail IDE o la paridad A/B. No se cambia la política de permisos ni se fusiona main.


### M2 — panel TUI nativo, ciclo de agentes y Git Changes inspect (2026-11-05)

- **Baseline antes de publicar:** último HEAD e5654e8: Phase 0, F5 y Release Gate PASS, pero R4 auto, Pi Runtime, aceptación offline y CI fallaron todos por `TS2304` al faltar import de `join` en `tests/extension-runtime-commands.test.ts`. Este error es estático y previo a los tests. Se corrige el import sin modificar los criterios de seguridad. No atribuirle PASS.
- **Panel real limitado a modal TUI:** `createNativeWorkPanel` usa la capacidad pública opcional `ctx.ui.custom` para una hoja al ancho del terminal, con j/k/flechas, Tab para cambiar sección, Space plegar, Enter abrir sección y Esc/q cerrar. Si Pi no soporta esta capacidad, `/asen-panel` sigue usando `ctx.ui.select` o salida de texto. Ningún elemento crea permisos, turnos o subagentes. Aún no es la rail fullscreen persistente del shell de referencia ni hay garantía de input mouse sin pruebas reales.
- **Agents:** nuevo `/asen-agent-inspect [id]` consulta únicamente el agente del proyecto y sesión, imprime los eventos persistidos en orden, state/updated/owner y marca `interrupted` como requerimiento de inspección. Un historial de estado no equivale al thread de mensajes o herramientas Pi; no se inventan tokens, modelos ni la conversación completa. Selección interactiva opcional con revalidación de scope al salir.
- **Changes:** nuevo `/asen-changes-view [path]` lista Git status real y permite selección del archivo cambiado. `previewWorkspaceFileDiff` lee `git diff HEAD` mediante `execFileSync` con argumentos fijos y sin shell, con límite 256 KiB, 150 líneas, ancho máximo y control de identidad de Git; preview de untracked sólo mediante descriptor O_NOFOLLOW y regular file in-root, rechazando symlinks, binarios, rutas absolutas/../.. y archivos no presentes en snapshot. No ejecuta editor/commit ni autoriza worktree ajeno; multi-root y diff nativo dos paneles siguen pendientes.
- **Regresiones provider-free nuevas:** prueba de overlay nativo y sus atajos, lectura de agentes aislada entre sesiones, catálogo estricto de comandos actualizado, Git fixtures tracked/untracked, bytes/tamaño, symlinks, salida UTF-8/ANSI, anchos 35/80/139/160. Sin evidencia de mouse y sin declarar C01–C20 completado.
- **Estado esperado:** UI-01, UI-02, UI-04, UI-10 y UI-11 son PARTIAL, no FULL; los checks `[ ]` siguen pendientes hasta pruebas TUI reales y 3 OS exact-SHA. Los 28 EF y ocho checks previos no cambian; FULL=false. No merge a main.

### M2 typecheck follow-up (2026-11-05)

- En SHA `30ad4b7b907414b32e318fa0d5434e7a6348fcb9`, la aceptación provider-free `41999351141` falló durante typecheck antes de realizar las pruebas, porque la firma local de `ui.custom` devolvía `unknown` y no era asignable al contrato genérico `ExtensionContext` de Pi. El problema afectó dos llamadas de composición que admiten el host real.
- Corrección localizada: mantener `ui.custom` como entrada **opcional de host**, con comprobación `typeof` y componente de lectura, usando una firma adaptadora compatible con el genérico de Pi. No cambia `hasUI`, permisos ni autorización Writer. Se requiere preflight exact-SHA antes de aceptar M2.


## Autopilot execution checkpoint and original authorization

# ASEN full-equivalence autopilot checkpoint

IN_PROGRESS; FULL=false. Branch `feat/t12-integrated-acceptance-merge`, PR #45.
Execution supplement to `equivalencia-funcional-agentes-full.md`; neither historical checks nor frozen reference manifests are replaced.

## Specs

- S1: "Tu misión es **completar ASEN hasta conseguir equivalencia funcional FULL con Gentle Shell**."
- S2: "Primero comprueba el entorno y la integración de REA."
- S3: "No declares FULL sin evidencias suficientes."
- S4: "No ejecutes toda la matriz CI por cada cambio pequeño. Consolida las verificaciones completas cuando corresponda."
- S5: "Trabaja exclusivamente en la rama autorizada."
- S6: "No modifiques Gentle Shell."
- S7: "Mantén un checkpoint persistente para poder reanudar el trabajo."
- S8: "Investiga también cómo implementar en ASEN un supervisor de ejecución que pueda reanudar tareas cuando Pi termine o se interrumpa, con límites de reintentos, presupuesto y permisos."
- S9: "Prioriza implementación real, pruebas y avances verificables sobre informes repetitivos."
- S10: "Puedes crear commits y publicar cambios validados en la rama de trabajo."
- S11: "No hagas merge a main sin autorización explícita."

## Tasks

- T0 | S2,S5,S6 | DONE bounded environment/map; route: parent + read-only explorer after evidence-budget trigger; commit: pending | Dependency: none. ASEN local/remote `094c76b59add3b791a4c24b949f9be7950e3116b`, clean authorized branch; reference `7ecb826a2b1eafa6b522ee16d905a99e998f0c89`, clean main. Read-only map covers all 1719 master lines. REA CLI/MCP checked; Pi registration not ready. Next: T1, not FULL admission.
- T1 | S3,S4,S5,S9 | IN_PROGRESS M0 stabilization; route: bounded worker because parent runtime context backstop fired; commit: pending | Dependency: T0. Validate pending M2 Pi adapter, scoped panel/catalog/Changes behavior. Reproduce and correct concrete failures without weakening contracts. Focused tests, typecheck, build, EF audit. Next: integrate evidence and select M1 unit.
- T2 | S1,S3,S9 | PENDING M1: EF-102/703, UI-01/03/08/10/11 | Dependency: T1 and immutable source mapping. Reuse existing projections and public Pi contracts; rail/responsive/TODO/status/palette gaps remain open. Next: source-derived bounded unit after T1.
- T3 | S1,S3,S8,S9 | PENDING M2: EF-201/203/601–604, UI-02/05/13 | Dependency: T2 shell contracts. Agents, Jobs, parent-child recovery; investigate supervisor without claiming it exists. Next: reference-derived safety and persistence map.
- T4 | S1,S3,S9 | PENDING M3: EF-301–304/401–503, UI-04/06 | Dependency: shell contracts. Git, Review, Writer with genuine operation-specific consent; no provider/native authority fabricated. Next: dependency-ready read-only composition.
- T5 | S1,S3,S9 | PENDING M4: EF-702/703, UI-07/09/12 | Dependency: immutable reference; profiles additionally Agents/status. Integrations, model routing, installer. Next: source comparison before changes.
- T6 | S1,S3,S4 | PENDING M5: EF-002/701/704, UI-14 | Dependency: T2–T5. Actual A/B, native Pi UI, three-OS exact-SHA CI/Release Gate and genuinely independent evidence. Next: run consolidation only after bounded checks.

Delivery: owner-selected existing branch and PR #45; no new PR, merge or release. Reviewable work-unit commits, roughly 400 authored lines per slice. Forecast for T1: 0–150 authored source/test/doc lines; later megabatches require measured scopes before forecast. No global FULL forecast asserted.

## Log

### L1 — original owner request (verbatim)

# ASEN — AUTOPILOTO FULL CON GENTLE SHELL Y REA

## 1. MISIÓN

Actúa como ingeniero principal de software, arquitecto de agentes Pi, especialista en TypeScript, REA, ingeniería inversa, interfaces TUI, GitHub Actions y auditoría técnica R4.

Tu misión es **completar ASEN hasta conseguir equivalencia funcional FULL con Gentle Shell**.

No te limites a analizar, planificar o explicar lo que habría que hacer. Debes implementar directamente, ejecutar pruebas, corregir errores, actualizar el plan y continuar con las siguientes tareas.

## 2. DIRECTORIOS

**Proyecto que debes desarrollar:**
`D:\Asen`

**Proyecto de referencia, exclusivamente de lectura:**
`D:\gentle-shell`

**Plan maestro de ASEN:**
`D:\Asen\odd\tasks\equivalencia-funcional-agentes-full.md`

**Repositorio ASEN:**
`asenbanskaliev/ASEN`

**Rama:**
`feat/t12-integrated-acceptance-merge`

**Pull Request:**
`#45`

IMPORTANTE: La referencia es **Gentle Shell**, no Gentle AI. No modifiques archivos del repositorio Gentle Shell.

## 3. INVESTIGACIÓN INICIAL OBLIGATORIA

Antes de implementar:

1. Comprueba los commits actuales de ASEN y Gentle Shell.
2. Consulta el HEAD remoto real de ASEN.
3. Comprueba si existen cambios locales sin publicar.
4. Lee íntegramente el plan ODD.
5. Examina el código fuente de Gentle Shell.
6. Comprueba que REA está instalado y accesible desde Pi.
7. Investiga la arquitectura, extensiones, comandos, agentes, estado y componentes de interfaz de Gentle Shell.
8. Compara todo con la implementación actual de ASEN.
9. Identifica qué funcionalidades están FULL, PARTIAL, BLOCKED o pendientes.

Utiliza REA cuando aporte evidencias adicionales que no puedan obtenerse suficientemente mediante la lectura directa del código.

No inventes resultados de ejecución ni funcionalidades no observadas.

## 4. EQUIVALENCIA EXACTA CON GENTLE SHELL

Investiga y reproduce en ASEN, respetando su arquitectura, las funcionalidades de Gentle Shell.

### Interfaz

- Diseño general de la TUI.
- Panel lateral.
- Sección TODOS.
- Sección AGENTS.
- Sección CHANGES.
- Sección INTEGRATION.
- Barra inferior de estado.
- Paleta de comandos.
- Atajos de teclado.
- Indicadores de ejecución.
- Navegación entre paneles.
- Estados visuales.
- Visualización de tareas, agentes y cambios.

### Agentes

- Descubrimiento y registro.
- Lanzamiento desde comandos.
- Lanzamiento desde la interfaz.
- Ejecución paralela.
- Delegación.
- Comunicación entre agentes.
- Seguimiento de progreso.
- Cancelación.
- Recuperación.
- Persistencia de tareas.
- Historial y resultados.

### Funcionalidades adicionales

- Integraciones MCP.
- Skills.
- CodeGraph.
- Memoria.
- ODD.
- Revisiones.
- Permisos y consentimientos.
- Gestión de modelos.
- Cambios Git.
- Notificaciones.
- Recuperación de sesiones.
- Comandos y herramientas disponibles.

Para cada funcionalidad, investiga exactamente cómo funciona Gentle Shell, cómo se inicia, qué código utiliza y qué comportamiento observable debe reproducir ASEN.

## 5. PLANIFICACIÓN EN MEGATANDAS

Reorganiza los puntos pendientes del plan ODD en **megatandas grandes**, agrupando funcionalidades relacionadas y sus dependencias.

No trabajes un EF por turno cuando varios puedan implementarse conjuntamente.

Para cada megatanda:

1. Selecciona los EF.
2. Comprueba las dependencias.
3. Investiga su implementación en Gentle Shell.
4. Diseña los cambios necesarios en ASEN.
5. Implementa todas las funcionalidades del bloque.
6. Añade o actualiza pruebas.
7. Ejecuta las comprobaciones focalizadas.
8. Corrige los errores.
9. Actualiza los checks del plan ODD.
10. Registra evidencias verificables.
11. Crea un commit coherente cuando corresponda.
12. Continúa con la siguiente megatanda.

No ejecutes toda la matriz CI por cada cambio pequeño. Consolida las verificaciones completas cuando corresponda.

## 6. PALETA Y SISTEMA DE TAREAS

Utiliza el sistema de tareas disponible en Pi.

Registra todas las fases y megatandas para que pueda consultarse su progreso.

Cada tarea debe contener:

- Identificador EF.
- Descripción.
- Dependencias.
- Estado.
- Implementación realizada.
- Pruebas.
- Evidencias.
- Próxima acción.

Mantén sincronizado el estado de las tareas con el plan ODD.

Si el sistema de tareas no permite alguna operación, investiga su implementación y utiliza un mecanismo persistente compatible sin fingir que existe una funcionalidad que todavía no está implementada.

## 7. VALIDACIÓN

Prioriza inicialmente:

- `npm run typecheck`
- `npm run check:fast`
- Pruebas focalizadas de los módulos modificados.
- `npm run build`
- `npm run audit:ef-plan`

Ejecuta pruebas completas y Release Gate en puntos de consolidación, especialmente antes de declarar equivalencia FULL.

Cuando sea posible, realiza pruebas A/B reales entre Gentle Shell y ASEN.

Distingue claramente las pruebas reales, las simuladas y las no ejecutadas.

No declares FULL sin evidencias suficientes.

## 8. AUTOPILOTO Y CONTINUIDAD

Quiero que trabajes con la máxima autonomía posible.

- No te detengas después de una megatanda.
- Selecciona automáticamente la siguiente.
- No solicites confirmación para decisiones técnicas ordinarias y reversibles.
- Si encuentras un error, investígalo y corrígelo.
- Si un EF queda bloqueado, registra la causa y continúa con otro independiente.
- Mantén un checkpoint persistente para poder reanudar el trabajo.
- Guarda el estado antes de finalizar una sesión o agotar el contexto.
- Si existe un mecanismo de recuperación automática, compruébalo y utilízalo.

Investiga también cómo implementar en ASEN un supervisor de ejecución que pueda reanudar tareas cuando Pi termine o se interrumpa, con límites de reintentos, presupuesto y permisos.

No presupongas que dicho supervisor existe ni afirmes que está funcionando sin haberlo probado.

## 9. DECISIONES TÉCNICAS

Si necesitas decidir cómo debe funcionar algo:

1. Consulta primero el código de Gentle Shell.
2. Investiga su comportamiento real.
3. Utiliza REA cuando sea útil.
4. Comprueba cómo está implementado ASEN.
5. Adapta la solución manteniendo la compatibilidad con Pi.

No me preguntes por decisiones que puedan resolverse técnicamente mediante esta investigación.

Solicita autorización cuando sea imprescindible para acciones destructivas, cambios sensibles o permisos que no estén concedidos.

## 10. GIT Y GITHUB

Trabaja exclusivamente en la rama autorizada.

Antes de publicar:

- Verifica el HEAD remoto.
- Comprueba cambios concurrentes.
- Ejecuta las pruebas correspondientes.
- Evita sobrescribir trabajo ajeno.

Puedes crear commits y publicar cambios validados en la rama de trabajo.

No hagas merge a main sin autorización explícita.

No modifiques Gentle Shell.

## 11. CRITERIO DE FINALIZACIÓN

El objetivo es conseguir **FULL en todos los EF del plan maestro**.

Para declarar un EF FULL debe existir:

- Implementación completa.
- Comportamiento equivalente demostrado.
- Pruebas relevantes satisfactorias.
- Evidencias reproducibles.
- Documentación actualizada.
- Check correspondiente marcado en el plan ODD.

No declares FULL global mientras existan puntos pendientes o sin verificar.

## 12. EJECUTA AHORA

Empieza inmediatamente.

Primero comprueba el entorno y la integración de REA.

Después analiza ambos repositorios, reconcilia el plan ODD, registra las megatandas en el sistema de tareas y **comienza a implementar la primera megatanda sin esperar nuevas instrucciones**.

Continúa con las siguientes mientras la sesión y los recursos estén disponibles.

Prioriza implementación real, pruebas y avances verificables sobre informes repetitivos.

### L2 — observed environment and permission incident

Git initially refused both repositories with `detected dubious ownership`. Owner explicitly authorized only the two exact global safe.directory entries; both were added successfully, with no wildcard. Owner also authorized read-only installed Pi docs, Gentle assets and the named work-unit/docs skills. Both repository working trees were initially clean, ASEN local HEAD equalled `git ls-remote` for the authorized branch. Reference package declares 4.6.0 but current SHA is not the normative `1f74e9e24473e7e121a96b1680444ae0196d3009`; no baseline substitution permitted.

REA 6.8.0 is callable from this Pi session's Bash. `rea mcp doctor --json`: exit 0, healthy true, production-stdio, 229/229 tools, 6/6 prompts, protocol 2025-11-25, target-free request OK. This proves CLI-launched MCP startup, not Pi registration. `rea doctor` reports unhealthy environment, unsupported Node 24.14.0 (REA requires >=24.22.1 on this major), missing analysis engines and Pi registration drift. No setup, installation, provider state or external config changed for REA.

Engram `mem_context` and bounded `mem_search` failed; full mirror `odd/asen-full-autopilot/tasks` is PENDING, not persisted. Files are the available durable checkpoint. Generic explorer read the entire master and canonical latest log; corrupted canonical bytes were not modified. Master remains 8/28 historical verified scopes and FULL=false. No new tests, UI screenshots, provider calls, reference A/B executions or approvals are claimed by this initial checkpoint.


### Autopilot M0 — baseline failure checkpoint

Worker mw3cluka-2-xymz remains running. Focused baseline: 24 tests, 16 pass, 7 fail, 1 Windows skip. Panel/catalog cases pass; reported history EISDIR in hard-link directory claims, usage count mismatch and isolated Git fixture configuration failures remain unresolved. No source fixes or guard/config changes made. Remaining required checks pending; exact task evidence in odd/tasks/asen-full-autopilot.md. No EF promotion; FULL=false.


### Autopilot M0 disposition and independent M1 continuation

T1 worker finished PARTIAL with zero source edits: focused 16 pass/7 fail/1 Windows skip; check:fast 19 pass/9 fail/1 skip. Typecheck, build and EF audit PASS (28 EF, 8 verified, 15 partial, 5 blocked). Parent probe confirms regular-file hard links on D: fail EISDIR even with absent destination; isolated Git init succeeds but status rejects dubious ownership and config reports not in a git directory. No lock, Git guard or assertion changed. T1 waits for authorized suitable test storage. Pure-panel M1 keybinding compatibility can proceed independently, using public Pi contracts and literal-key preservation. No new EF checks; FULL=false. Current tasks/evidence: odd/tasks/asen-full-autopilot.md.


### Autopilot M1 — interaction-local keybinding unit verified, not FULL

The native panel now forwards Pi interaction-injected keybindings and matches public selection/input/editor actions, preserves unavailable-manager literal fallback and local j/k/Space/q aliases, and closes on changed scope. Worker observed RED for configured down and configured Tab, then GREEN 8/8 focused and 3/3 selected integration; typecheck/build/EF audit exit 0. Fifteen base/current preservation scenarios matched stdout/exit and stderr after PID normalization. Parent repeated 8/8 focused tests successfully and inspected the diff/docs. T1 environmental baseline failures remain disclosed, not suppressed. No native visual/mouse/rail or FULL equivalence claim. Reference evidence: current 7ecb826 source extensions/gentle-shell.ts:2249–2295; extensions/ask-user-choice.ts:103–110,259–276; installed Pi extension docs:2611,3035–3056. No normative baseline change. Parallel supervisor map mw3dj0fm-4-mr9m remains read-only. Commit pending; 8/28 EF unchanged, FULL=false.


### Parallel recovery map and published M1 candidate

Owner requested another subagent work in parallel. Explorer mw3dj0fm-4-mr9m mapped recovery without edits: existing task/agent/link/checkpoint and notification journals support guarded recovery, not a demonstrated autonomous Pi-restarting daemon or aggregate spend controller. Reference Jobs stop with their parent session. Dependency-ready advisory coordinator projection is now delegated to mw3dsu3t-5-zivn with in-memory tests, no execution grants or permission/journal changes. Implementation pending.

Checkpoint commit 173b2cd3 and panel source/test/doc commit 5267e6b28f4ea51c1664481bdaf3f7f296adf825 published with fresh remote-HEAD guard and normal non-force push; remote and PR45 HEAD subsequently confirmed exact 5267e6b2. Native assessment for panel unit: medium, reviewDue=false/under_budget, self-verification/no independent verifier; no approval invented. Phase 0 42008493697 and F5 42008493787 SUCCESS; Pi Free Smoke 42008493704 SKIPPED. CI 42008493792, Release Gate 42008493857, R4 auto 42008494029 (SELF_AUDIT_ONLY / NOT independent), Pi runtime 42008493860, CodeGraph 42008494418 and functional acceptance 42008483988 pending; job-3 watches existing runs. T1 environmental failures remain blocked and documented. No EF promotion; FULL=false.


### Parallel preparation expanded at owner request

Owner: vete lanzado subagenes para ir adealntando y asi ganamos tiempo en el desarollo. Worker mw3dsu3t-5-zivn continues the advisory recovery projection on coordinator-only surfaces. Explorer mw3e3t21-6-dsxe now maps truthful statusbar/context and integrations/profile inspection for further disjoint behavior units. No overlapping writers, duplicated full-matrix checks, provider/config mutation or supervisor activation. Parent retains shared integration and Git ownership. Task projection synchronized; CI watch job-3 still pending. FULL=false.


### M1/M4 parallel writers launched; recovery unit locally committed

Advisory recovery T3a committed locally as 0d9b2011ed0076199a3a629702e27a316149ba2e: worker RED 26 failures then GREEN 33 new cases and 2 existing pure cases; parent repeated 35/35. Typecheck/build/EF audit and boundary audit pass. No automatic dispatch, grant, supervisor or new public command behavior. Native assessment medium, reviewDue=false/under_budget; no independent/native approval claim. Publication deferred to consolidation; published CI still binds 5267e6b2.

Two writers launched together with disjoint new module/test/doc surfaces: mw3ecfvl-7-nm9z implements truthful public-host status projection; mw3ecg1h-8-fqg1 implements read-only integration/profile inspection. Both test-first in memory. Shared extension/renderer wiring remains parent-owned T2c after join; no concurrent writes to shared dist, parent consolidates build. These are not delivered UI until integration and checks. Original EF checklist unchanged, FULL=false.


### Parallel integrations/profile component checked; wiring still pending

T5a worker mw3ecg1h-8-fqg1 completed read-only inspectIntegrationProfiles derivation, tests and caller documentation. RED 11/11 then GREEN 11/11 plus typecheck exit 0; parent repeated 11/11 and read module/docs. Registered inventory is not connectivity; project load failure is unavailable, not a default; configured routes retain actual unknown and in-process snapshot provenance is not restart durability. No raw configuration/auth reads or mutations. Host-status sibling remains pending; T2c wiring and consolidated build have not run. No UI-delivery, independent review or FULL claim, no EF checks changed.


### Observation modules joined; shared wiring and CI diagnosis in parallel

Both components passed 73/73 in parent verification. Host-status component committed as 49bfe61fe34ea9427d2d6a1d2a11a033ae303e53 (264 authored lines); integrations/profile component as 26cd645f8c2a03e115dfa49c81c998d3197a2343 (327 lines), each with tests/docs. Native assessment medium, reviewDue=false/under_budget; no independent/native approval claim. Neither component alone is delivered UI. T2c shared extension/renderer integration is delegated to worker mw3ew0sx-9-81qh with fake-host tests and one consolidated build.

Published 5267e6b2 watch finished: CI42008493792 FAIL; ReleaseGate42008493857, R4auto42008494029 NOT independent, PiRuntime42008493860, CodeGraph42008494418 and functional workflow42008483988 exited successfully. Optional/live job status is not inferred from workflow success. Captured result/failed logs under .cache/ci-5267e6b2; read-only explorer mw3ewt74-a-gugw diagnoses exact failure and correction surfaces separately from integration. No matrix rerun or evidence inheritance to local HEAD. EF checklist unchanged, FULL=false.


### Consolidated uncommitted UI checkpoint and profile disposition

Retained local UI work (not published): host/context and registered integrations composition with production forwarding regression; metadata-only Jobs inspection; live registered-command palette; agent-output withholding characterization; read-only profile scope inspection plus existing-binding accessor. Jobs independent109/109 and parent4/4, palette independent58/58 plus two consumer checks and parent4/4. Profile writer retry was explicitly authorized by owner after provider_unavailable; final13/13 binding,48/48 integration,types/build/audit and parent13/13 passed. Independent profile functional20/20+48/48+1/1/types/audit passed, but no-network confinement FAILED because npm update notifier made a public-registry GET during typecheck. Evidence retained, no install/model invocation observed; no clean isolation certification, retrospective consent or repeat verifier. Existing old exact-shape profile consumers remain unrun compatibility debt.

Owner explicitly accepted: Aceptar avance parcial con incidencia registrada. Profiles remain PARTIAL; original differential0/10 exhausted, native preparation unavailable, visual/provider/restart-durability proof missing. No global EF promotion, no publishing UI as complete. Read-only Changes explorer mw3ohhlr-s-ycze now maps a safe independent unit without index/branch/review/permission mutations. All source work remains inside authorized D:/Asen, no external validation worktree. Original eight historical EF checks unchanged, FULL=false.


### Owner-authorized UI WIP validation delivery

Owner selected Publicar candidato WIP para CI, explicitly including missing public-Git/differential/native/visual/legacy-profile proof; no FULL, merge, native consent or model-consumption authority. Available local consolidated checks passed184 tests (165focused+16nonGitChanges+1ECOstructural+2legacy consumers), direct typecheck/build/EF audit. Final boundary audit in isolated HOME failed Git ownership; parent retained failure and read-only audit in already-authorized repository environment passed1151paths without config/guard change. Logs .cache/wip-ui-validation-jJbK85.

Committed work units: f719547dd3388eddccd5b3724c44b36850b42fe7 Agents withholding characterization; b37f9d5317686a15195cf5423e3480d1daf328fd readonly existing-binding accessor/tests; d41bc378a92ca1deb8746aa925caedad6a1ef5e7 Jobs metadata helper/tests; cd36c7b76ffca7c5464ad7de914997595d34d772 registered-command discovery helper/tests;966040cd8513a3277d3d502befc98b76504318b9 shared scoped UI composition/tests/docs (explicit larger WIP slice1044add63delete, reviewer workload disclosed). Risk item2; scoped independent results remain bounded, including recorded profile npm-network confinement incident. Native committed ASSESS medium escalated high, reviewDue=false/under_budget; no native approval invented or unavailable-verifier retry.

Changes final-publication bug was dynamically reproduced RED0/5 then fixedGREEN5/5, same-verifier targeted5/5+29/29;13 successful public-Git cases remain unrun locally and are the hosted validation objective. Old exact-shape profiles compatibility remains pending, not falsely preserved. No source code removed or guards weakened to get checks. Final tracking commit and normal remote-HEAD-guarded WIP push pending; original8/28 checks unchanged and FULL=false.


### WIP beb4b4ab hosted failures and test-only correction

Published UI WIP beb4b4abf2c8d764e8e146bab78778268ef926e6: R4auto42064156294 FAIL, generalCI42064156119 FAIL; ReleaseGate42064156193 and functional42064145858 workflowSUCCESS, not model/independent proof. Read-only exact logs classified three root causes: missing.cache parent before fixture mkdtemp across fivehelpers; three old exact profile DTO assertions incompatible with documented sanitized contract; valid journal-private-directory refusal on freshly created broad-mode fixture. Coverage/witness failures follow failed suite. All13Git cases scheduled but setupfailed, zero successful behavior proof.

Correction ddf5d2ea4547a242614c2fdde2beb80d55a46e17 is test-only sixfiles(+33/-4): mkdirparent, freshmode0700, three full DTO expectations; production/guards/assertions/timeouts unchanged. Worker29 integration+16nonGit+inventory1+missingDTO/UI2 andtypes/audit passed; two profile writes remain locally EISDIR-before-assertion. Parent reviewed diff and repeated missingDTO/UI2/2. FreshCWD proof job15 starts with cacheAbsentBefore true and ends cacheExistsAfter true for29integration+inventory1, bothpass, withinD:without sharedcachedeletion/Git workaround. Source .cache/ci-clean-fixture-proof-mNHvpS logs retained. Old parent typecheck tool rejection remains unverified history, not relabelled asPASS; worker new-candidate typecheck exit0 is separate. Native ASSESS medium,reviewDue=false/under_budget,selfverification only, no extra verifier/native retry.

New exact-SHA hosted verification required for13Git,two profile assertions,POSIX privacy and fullCI/R4; do not mark done or FULL before results. Original8/28 EF checklist unchanged. Owner-authorized WIP follow-up normal remote-guarded push pending, no merge/provider activation/false independent R4 claim.


### CI fixture correction — background-job journal privacy

Base HEAD `fbcc4c41d9799cc8dc555c8e05545c6dbe920923`; CI run `42070066360` failed on Ubuntu shard 0 and macOS shard 1, with shard coverage failing downstream. Reproduction on Linux showed 18 pass / 2 fail in the focused integration and journal suites. The production journal correctly rejects a Unix parent directory accessible to group/other; `tests/job-inspection-integration.test.ts` had created the fixture home with default permissions.

Correction is test-only: create this fixture home as `0700`, and add a negative journal regression that rejects a `0755` parent on POSIX. No production guard or existing assertion was weakened. Corrected focused result is 21/21; `npm run typecheck` and `npm run audit:ef-plan` pass. The latter still reports 8/28 EF verified and `globalFull:false`. New exact-SHA CI on Ubuntu/macOS/Windows and shard coverage is pending; no EF or UI task is marked complete.

### EF-601/604 — wake diferido y cambio de proyecto con sesión Pi constante (2026-11-05)

Corrección acotada de producción: el callback diferido de `requestAgentWake` revalidaba `sessionManager.getSessionId()` y una identidad capturada, pero podía enviar `asen.agent.wake` después de que `ctx.cwd` cambiase de proyecto **sin cambiar el ID de sesión**. Se revalida `sessionIdentity(ctx)` (proyecto canónico y sesión) en el límite real de envío, además de la identidad capturada, del propietario actual del contexto y del evento pendiente. Un cambio o error de identidad conserva el evento duradero y bloquea el despertar: no concede Writer, no relanza el hijo, no simula consumo del modelo ni hace replay.

Se añaden dos pruebas de integración con la extensión real y runner proveedor-free: cambio de proyecto sincronizado justo durante `asen.agent.result` impide el wake tardío; control de mismo proyecto conserva exactamente un wake posterior al enqueue. Se preserva el alcance original de seguridad y no se alteran las reglas de consentimiento, las garantías de journal ni las comparaciones A/B.

**Estado probatorio:** pendiente de CI, Release Gate y aceptación exact-SHA del commit; no es prueba de proveedor ni verificación total de EF-601/604. Se mantienen los checks canónicos 8/28 y FULL=false. Los workflows anteriores en SHA `810f08068889e3effb05bbe6951b1ab4739def3b` estaban `action_required` por el actor Copilot, sin jobs ejecutados; esta integración no obtiene ni elude dicha aprobación.

### R4-01/02/03 — aceptación técnica integrada por SHA sin modelo (2026-11-05)

Se añade un inventario calculado del ODD (28 EF, S01–S20, 14 tareas UI, C01–C20, UI-C01–UI-C24 y propietario de casos UI) y un gate separado de **evidencias técnicas del mismo workflow**. UI-C08 se asigna explícitamente a UI-02 sin marcar pruebas como completadas. El gate obtiene exclusivamente `needs.*.result` desde GitHub Actions, exige SHA exacto, rama/PR y todos los jobs obligatorios de la misma corrida: cobertura íntegra de shards, arquitectura, seguridad T12, matriz Pi y diálogo TUI real; un job skipped/failure/action_required rechaza PASS. Ejecuta únicamente pruebas deterministas del validador y emite un artefacto JSON bajo `r4-integrated-evidence/`.

**Límites explícitos:** `R4_TECHNICAL_PASS` no certifica Release Gate (workflow distinto), artefactos históricos, UI real C01–24, observaciones A/B, llamadas de modelo, Writer humano ni Reviewer independiente. `globalFull:false` constante; conteo EF canónico sin modificaciones. R4-04–06 (evidencias autenticadas A/B/UI, IA opcional y certificación final independiente) siguen pendientes de sus dependencias y permisos; no se activan modelos de pago ni se fusiona main. La nueva corrida exact-SHA debe pasar antes de declarar esta macrotanda verificada.
