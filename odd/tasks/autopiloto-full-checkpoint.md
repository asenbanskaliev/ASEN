# ASEN — Autopiloto FULL: checkpoint de continuidad

Actualizado: 2026-11-04 (Europe/Madrid)

## Estado remoto confirmado

- Repositorio: `asenbanskaliev/ASEN`
- PR #45: abierto, sin merge; rama autorizada: `feat/t12-integrated-acceptance-merge`
- HEAD remoto observado antes de este checkpoint: `f2f993c817f837f08f2eff4a4d41e06b22f50590`
- Commit: `fix(ef-201/702/603): reject CodeGraph writes, false quota signals and legacy non-Explorer dispatch`
- El checkpoint documental se publica como un commit hijo directo del HEAD anterior; no modifica código ni hereda resultados para un SHA diferente.

## Tanda reconciliada

La última tanda de implementación inspeccionada endureció EF-201/202 (telemetría CodeGraph de solo lectura), EF-603/304 (enlace de Todo legacy solo con Explorer sin plan), y EF-702 (clasificación de errores de cuota terminales y acotados). El código y sus regresiones están en el HEAD indicado. Las pruebas son deterministas/provider-free; no acreditan proveedor real, consentimiento Writer, reinicio de host Pi ni equivalencia A/B.

## Validaciones observadas para el HEAD anterior

| Workflow | Run | Estado |
| --- | ---: | --- |
| CI | [41926003150](https://github.com/asenbanskaliev/ASEN/actions/runs/41926003150) | En curso al consultar |
| Release Gate | [41926004817](https://github.com/asenbanskaliev/ASEN/actions/runs/41926004817) | SUCCESS |
| Phase 0 Architecture | [41926003325](https://github.com/asenbanskaliev/ASEN/actions/runs/41926003325) | SUCCESS |
| F5 exact-SHA static verification | [41926001097](https://github.com/asenbanskaliev/ASEN/actions/runs/41926001097) | SUCCESS |
| Pi 1.2 runtime evidence | [41926002575](https://github.com/asenbanskaliev/ASEN/actions/runs/41926002575) | SUCCESS |
| T07 CodeGraph real CLI probe | [41926000975](https://github.com/asenbanskaliev/ASEN/actions/runs/41926000975) | SUCCESS |
| R4 automated self-audit | [41926002166](https://github.com/asenbanskaliev/ASEN/actions/runs/41926002166) | SUCCESS, self-audit only; NOT independent |
| Pi Free Smoke | [41926002232](https://github.com/asenbanskaliev/ASEN/actions/runs/41926002232) | SKIPPED |

## Estado de aceptación

- Matriz canónica F0–F6: **8/28 EF verificados**, según casillas actuales del plan. Los checks auxiliares del Log no incrementan la cuenta.
- FULL: **no alcanzado**.
- Evidencia pendiente: 60 observaciones de C01–C20 en A/B/ASEN; Writer con consentimiento humano real; Reviewer independiente; interrupción/reinicio TUI durante inferencia auténtica y consumo observado; recibos gratuitos de proveedor real.

## Reanudación exacta

1. Volver a consultar HEAD remoto de PR #45; no asumir que sigue en `f2f993c817f837f08f2eff4a4d41e06b22f50590`.
2. Obtener el resultado y logs del CI `41926003150` asociado a `f2f993c817f837f08f2eff4a4d41e06b22f50590`; si falla, corregir la causa antes de cambios dependientes y volver a probar con CI exact-SHA.
3. Leer el final actualizado de `odd/tasks/equivalencia-funcional-agentes-full.md` y los últimos workflows.
4. Continuar EF-601/603/604 con cambios provider-free verificables; conservar los requisitos de reinicio/consumo real como pendientes hasta que exista el recibo auténtico.
5. No marcar casillas canónicas ni declarar FULL sin los criterios de aceptación y evidencia exigidos. No merge a `main`, no force push y no usar modelos de pago.


## Siguiente tanda publicada desde este checkpoint

- Base confirmada: `a2369372084b8ec5bf867e6f5c96f800647e0b37`.
- Cambio preparado en `src/runtime/task-agent-reconciler.ts`: el reconciliador bloquea el Todo si el último intento queued/running tiene identidad/rol incompatible; legacy sin plan solo admite Explorer.
- Regresión añadida en `tests/task-agent-recovery-chain.test.ts` para un Reviewer activo enlazado a un Todo Explorer.
- El plan maestro registra la causa y conserva 8/28; las pruebas del nuevo SHA quedan pendientes. Reconsultar HEAD y workflows al reanudar. No tratar el CI cancelado o en curso del SHA base como evidencia del nuevo commit.
- Próxima validación: CI multiplataforma + Release Gate y, por el mensaje exacto del commit, aceptación Ollama Cloud Beam limitada a cinco inferencias. Comprobar que el proveedor/modelo registrado es Beam y no aceptar fallback de pago.


## Recepción real posterior — 2026-11-04

- En `46ab623731f1493ba5fd60703089b821f54653cc`, la aceptación Beam real ejecutó Explorer y Planner con PASS y el primer Reviewer fue rechazado como `REVIEWER_FINDING_UNGROUNDED`; run [41928158752](https://github.com/asenbanskaliev/ASEN/actions/runs/41928158752), artefacto [13370920410](https://github.com/asenbanskaliev/ASEN/actions/runs/41928158752/artifacts/13370920410).
- Se usaron 3 de 5 llamadas permitidas; no se ejecutó Verifier ni el segundo Reviewer y no se dio Writer consentimiento. El proveedor/modelo fue Ollama Cloud Beam real.
- Root cause exacta no estaba en el recibo agregado porque conserva solo hash y longitud. El candidato siguiente mejora el prompt de copia literal y registra un código de error determinista sin texto crudo; conserva intactos los criterios de aceptación.


## Recepción y continuación — 2026-11-04

- HEAD confirmado: `c1542b48d187f575fc360fc8e6c0e2f1b4120516`.
- La aceptación exact-SHA `41929195297` pasó con Beam real y 5/5 llamadas máximas para Explorer, Planner, dos Reviewer y Verifier; rechazo negativo del fixture PASS. Artefacto provider `13371211276`; sin Writer ni herramientas. No son dos revisores independientes.
- Release Gate `41929204975`, Phase 0 `41929204955`, F5 `41929204958`, CodeGraph `41929204826`, Pi Runtime `41929204898` y R4 self-audit `41929204803` SUCCESS; CI `41929204808` seguía ejecutándose al comprobar. Pi Free Smoke SKIPPED.
- Siguiente cambio consolidado: prueba multiproceso de concurrencia del acuse de una notificación persistente, junto con actualización del ODD. Después publicar con el mensaje opt-in de Pi parent + Pi RPC child Beam y revisar sus recibos. Reconciliar todos los resultados por SHA.
- Continuar con 8/28 EF; EF-601/603/604 PARTIAL, A/B C01–C20 BLOCKED, Writer humano BLOCKED, Reviewer independiente ausente, FULL=false. No merge a main ni modelos pagados.


## Corrección preventiva de la regresión multiproceso — 2026-11-04

- El commit `156309e497a17574114c42872cbea72be1bf04a5` añadió competencia de dos procesos por acuse y activó CI más la lane Beam parent-child.
- La revisión inmediata detectó escapes demasiado duplicados en el literal de entrada y la separación de líneas de la nueva prueba. La prueba habría reconocido el evento READY, pero no habría separado de forma fiable la respuesta ACK. Se corrigieron los literales antes de atribuir cualquier resultado; no se usa evidencia de CI del SHA previo para este test.
- Base de la corrección: `156309e497a17574114c42872cbea72be1bf04a5`. Volver a inspeccionar HEAD antes de publicación. Los EF permanecen 8/28, FULL=false.


## Recibo parent-child real y próxima prueba — 2026-11-04

- Último commit confirmado: `03be1c4c9a772f54b4f6c9ee77dc5fe4ba36ed5a`.
- Aceptación [41930346960](https://github.com/asenbanskaliev/ASEN/actions/runs/41930346960) provider-free + parent-child real terminó SUCCESS. Artefacto [13372350121](https://github.com/asenbanskaliev/ASEN/actions/runs/41930346960/artifacts/13372350121): Pi RPC Explorer y Pi TUI 1.2.0 parent consumieron una notificación real con Ollama Cloud Beam; status y ack del evento exacto, proyecto sin cambios, Writer no autorizado. Esto verifica el carril de padre inactivo solamente.
- Sobre ese SHA: Release Gate `41930355820` SUCCESS; Phase 0 `41930355793`, F5 `41930355717`, Pi Runtime `41930355971`, R4 SELF_AUDIT_ONLY `41930356042`, CodeGraph `41930355931` SUCCESS; CI general `41930355876` IN_PROGRESS al checkpoint. No heredar CI al SHA posterior.
- La nueva regresión de dos coordinadores/procesos compitiendo por un ack de journal terminó dentro del preflight provider-free SUCCESS. La salida solo prueba una transición de diario.
- Estado canónico 8/28, EF-601/603/604 PARTIAL, EF-002/701 A/B BLOCKED, Writer humano BLOCKED, EF-503 independencia externa ausente, FULL=false.
- Próxima tanda publicada: reforzar el gate que exige el mensaje opt-in exacto para stream interruption y lanzar `ci: one-time Pi streamed-child interruption Beam proof`. El job limita a una inferencia autenticada, no reintenta, limpia credenciales del proceso revisor y no autoriza Writer.


## Corrección de auditoría R4 al gate de opt-in EF-604 — 2026-11-04

- Commit base `a081046f1ff84a903577d39d2f87cc70799bc3ff` activó el job Beam de interrupción en streaming.
- La revisión del nuevo test detectó que la expresión regular negativa tenía backslashes duplicados; podía pasar sin inspeccionar un `contains(...)` con el mensaje de commit. Se reemplazó por una regex válida, sensible a espacios, que detecta ese bypass. No se cambia el workflow ni se relaja el disparador exacto.
- No atribuir el resultado del test fallido/anterior a este SHA. Volver a verificar las pruebas y el recibo del proveedor con el nuevo HEAD.


## Recibo de interrupción real y siguiente EF-603 — 2026-11-04

- SHA confirmado del recibo EF-604: `1b5f1e4358a2032c1f97fe19ccc1b89693743566`; workflow [41931282240](https://github.com/asenbanskaliev/ASEN/actions/runs/41931282240), artifact [13372590402](https://github.com/asenbanskaliev/ASEN/actions/runs/41931282240/artifacts/13372590402).
- Resultado auténtico: 1 text-delta de Beam por Pi RPC, cancelación observada, persistencia `cancelled`, proceso separado sin credenciales reabre el resultado, 0 replay. Esto no cubre reinicio TUI/host interactivo y no cambia EF-604 canónico PARTIAL.
- En ese SHA, CI `41931293790` y Release Gate `41931293807` IN_PROGRESS al checkpoint; Phase 0/F5/Pi Runtime/R4 self-audit/CodeGraph SUCCESS, Pi Free Smoke SKIPPED. R4 no es independiente.
- Siguiente tanda: aumentar EF-603 live proof para exigir selección de modelo reportada por el hijo Pi y respuesta text-delta observada mientras se coalescen tres solicitudes; el número de llamadas HTTP real sigue sin observación autenticada y permanecerá `null`. Disparar solo Beam registrado, una reserva y sin Writer.
- Canonical: 8/28; EF-601/603/604 PARTIAL; A/B bloqueado; FULL=false.


## Corrección de sintaxis del guard EF-603 — 2026-11-04

- En el commit `bdc3301ca075efdc1924b50970fae6e4995f8586`, la nueva aserción de igualdad exacta del mensaje del workflow tenía una comilla final mal colocada.
- La auditoría de la fuente la detectó antes de aceptar CI; se corrigió sin cambiar la condición productiva ni habilitar un trigger más amplio. No tratar los resultados del SHA anterior como validación de este test.


## Fallo de preflight EF-603 y corrección del fixture — 2026-11-04

- HEAD confirmado antes de corregir: `853b9f76b478d0068fc93f9983d38a7257c216d4`; aceptación exact-SHA [41932099773](https://github.com/asenbanskaliev/ASEN/actions/runs/41932099773) falló en el preflight provider-free. La prueba estricta comparó `beam` esperado con `beam:cloud` real y permitido por el grader. El carril real EF-603 no se ejecutó por su dependencia del preflight.
- Corrección preparada: hacer que el fixture positivo use `beam:cloud`, manteniendo las variantes negativas de modelo y proveedor. La clasificación no cambia y no se atribuye PASS al SHA fallido.
- CI y Release Gate exact-SHA `853b9f76b478d0068fc93f9983d38a7257c216d4`: CI `41932107288` y Release Gate `41932107562` seguían en curso al inspeccionarlos. Phase 0, F5, Pi runtime, CodeGraph y R4 autoauditoría SUCCESS; Pi Free Smoke SKIPPED.
- Próxima reanudación: verificar que el HEAD siga siendo el padre previsto, publicar fixture y este registro como un commit consolidado; después comprobar preflight, carril Beam EF-603, CI y Release Gate por su SHA. EF canónicos verificados: **8/28**; EF-601/603/604 PARTIAL, A/B y consentimiento humano Writer pendientes, FULL=false. Sin merge.


## EF-603: preflight corregido y lanzamiento Beam acotado — 2026-11-04

- SHA `18c0ce712115b491a0abfd9c23794f5101fa4786`: aceptación provider-free [41932735996](https://github.com/asenbanskaliev/ASEN/actions/runs/41932735996) SUCCESS; se corrigió el fixture de alias Beam que falló en `853b9f76b478d0068fc93f9983d38a7257c216d4`. Phase 0, F5, Pi runtime, CodeGraph y autoauditoría R4 SUCCESS; Pi Free Smoke SKIPPED. CI `41932742617` y Release Gate `41932742617` estaban en curso; comprobar run IDs individuales antes de atribuir estado.
- Próximo SHA contiene una regresión explícita que acepta `beam:cloud` solo cuando coincide con el identificador child-reported y rechaza alias discordantes. Commit con el mensaje exacto opt-in lanzará la ejecución auténtica de un Explorer Pi RPC y Beam.
- Sin nueva casilla canónica hasta PASS de la aceptación real y CI/Release Gate exact-SHA. Estado 8/28; EF-603 PARTIAL; no se prueba cardinalidad HTTP (permanece `null`), A/B no ejecutado, Writer no autorizado, FULL=false.


## Recibo real EF-603 Explorer coalescido — 2026-11-04

- HEAD confirmado: `8d1859bd2edda5e6a39fb7e7681fdba68119d93b` (commit opt-in exacto). Aceptación `41933062639` terminó con preflight provider-free SUCCESS y job EF-603 real `126935392524` SUCCESS. Artefacto de recibo Pi [13371799033](https://github.com/asenbanskaliev/ASEN/actions/runs/41933062639/artifacts/13371799033); el log verificó `PASS_REAL_PI_EXPLORER_ONE_EXECUTION`, 3 solicitudes, 1 proceso nativo Pi, 1 reserva Beam, `providerCallsActuallyObserved:null`, `writerAuthorized:false`, `globalFull:false`. A/B source artifact `13372527108` únicamente verifica objetos, no C01–C20.
- Phase 0 `41933070426`, F5 `41933070170`, Pi Runtime `41933070251`, CodeGraph `41933070094`, R4 self-audit `41933070063` SUCCESS; Pi Free Smoke `41933070235` SKIPPED. CI `41933070344` y Release Gate `41933070271` IN_PROGRESS. No se heredan PASS al SHA posterior.
- Avance real: subcheck EF603-REAL-COALESCING-01 agregado al plan. Casillas canónicas se mantienen 8/28; EF-603 PARTIAL por falta de roles Pi restantes, CI + Release Gate, paridad A/B y contador HTTP autenticado. EF-601/604 PARTIAL; 60 observaciones C01–C20, consentimiento Writer humano y Reviewer independiente siguen pendientes. FULL=false.
- Siguiente tanda: continuar EF-601/604 con pruebas de host Pi tras caída/reapertura y reconciliación durable, y validar el contrato de consumo de notificaciones por el coordinador con identidad de tarea/evento exacta. No confundir crash provider-free con recuperación de inferencia Beam tras reinicio. Antes de publicar, volver a comparar PR #45 HEAD y branch ref.


## EF-604: Pi headless restart y TUI hard-crash exact-SHA — 2026-11-04

- Confirmado HEAD base `7fb5a8c79bc1d7e1c6a94953b8d1404125f0038d`; SHA con evidencia `8d1859bd2edda5e6a39fb7e7681fdba68119d93b`. Aceptación `41933062639` SUCCESS; preflight provider-free, prueba real EF-603 Beam y prueba de restart/crash Pi sin modelo SUCCESS. Artifact offline `13373215682`, recibos verificados por el propio job y hash del log `EF604_NATIVE_PI_HEADLESS_RESTART_PASS` = `e66f1e6fe8cf9f23c06da64c37acc7243e08d7f3a022b1369154005766f490b6`.
- Evidencia específica: 5 procesos Pi, 3 reinicios misma sesión, scope ajeno aislado, estado durable `attempted/pending`, 0 llamadas de modelo; y SIGKILL de TUI con RPC Pi hijo vivo, reapertura de la sesión, Explorer `interrupted`, 2 avisos no re-enviados/acuse bloqueado, 0 replay. Sin consumo por coordinador ni Writer.
- Release Gate `41933070271` SUCCESS; CI `41933070344` aún IN_PROGRESS al comprobar. El total canónico sigue 8/28 y EF-601/603/604 siguen PARTIAL. Hay recibo Beam EF-603 de una ejecución Explorer en artifact `13371799033`; contador real HTTP no observado. A/B, Writer humano, reviewer independiente y consumo tras restart pendientes.
- Próxima macrotanda: preparar un lane opt-in exact-SHA para un único stream Beam durante reinicio TUI, si se puede vincular el hijo durable y garantizar no reejecución/doble llamada; incluir consumption/ack exactos al reabrir. Mantener provider-free preflight y no falsear `interrupted`/resumed. Antes de publicar, leer HEAD de PR y rama.


## Próxima tanda EF-601 — comparación de frescura con referencia A

- Base observada: PR #45 / rama `feat/t12-integrated-acceptance-merge`, HEAD `d4676ce1398b441b96ce932ac7445d00d41861d5`. La auditoría de la referencia A congelada (fila A en `registry/parity/agent-ab-baselines-v1.json`) encontró que un resultado con antigüedad ≥90 s se comunica como aviso compacto y no se vuelve a inyectar completo; su lectura queda bajo acción explícita de herramienta.
- ASEN conservaba avisos durablemente (protege frente a pérdidas) pero reinyectaba el resumen íntegro al restaurar cualquier aviso `pending`, sin caducidad. Cambio agrupado: misma ventana de 90 s, con aviso compacto y salida completa omitida al superar el umbral; frescos no cambian. Pruebas unitarias cubren límite/clock skew/fecha inválida, resumen suprimido, ID/estado preservados.
- CI `41933969890` y Release Gate `41933969684` del commit documental `d4676ce1398b441b96ce932ac7445d00d41861d5` estaban IN_PROGRESS; se cancelarán al publicar el nuevo SHA y no se reutilizarán. Cabeza del nuevo commit debe verificarse contra PR y ref antes de actualizar.
- Estado base: 8/28 EF, EF-601/603/604 PARTIAL, A/B C01–C20 sin ejecuciones, Writer sin consentimiento humano, Reviewer independiente pendiente, FULL=false.


## Corrección de gate externo — referencia de frescura — 2026-11-04

- CI de `0fc9ddc65559892d64bb0cda3fd7a4085b85d5e1`: Phase 0 Architecture run `41934918613` falló en `audit-upstream-boundary` porque la nota de continuidad incluía el nombre de una referencia congelada. La semántica y las pruebas no fueron causa del fallo.
- La nota ahora usa la etiqueta local `referencia A` y enlaza a `registry/parity/agent-ab-baselines-v1.json`, cuya fila A guarda la procedencia. No se cambia el código funcional ni se relaja el auditor.
- La siguiente inspección volvió a fallar porque el encabezado de checkpoint conservaba la etiqueta externa; se elimina en este commit. Los resultados previos no se heredan. Preflight/CI/Release Gate del SHA correctivo pendientes. EF-601 PARTIAL; 8/28; FULL=false.


## EF-601 stale notice: recepción de pruebas y progreso CI — 2026-11-04

- Implementación en SHA `0fc9ddc65559892d64bb0cda3fd7a4085b85d5e1`: aceptación provider-free [41934910473](https://github.com/asenbanskaliev/ASEN/actions/runs/41934910473) SUCCESS; test `EF-601 stale terminal results...` = `ok 53`, frescura durable = `ok 54`; suites foco `242/242`, `240/240`, `106/106`, todas con `fail=0`. Carriles reales quedaron SKIPPED por mensaje de commit no opt-in. No se ejecutó modelo.
- El primer Architecture run `41934918613` falló solo en audit-upstream-boundary porque docs/comentario usaban una etiqueta de origen fuera de la ubicación de procedencia permitida. Corrección publicada. `audit-upstream-boundary` del SHA `5035e5d7da619363d4465dbfd26773ef773e35c0` terminó PASS en Phase 0 `41935325296`.
- Para SHA `5035e5d7da619363d4465dbfd26773ef773e35c0`: CI `41935325288` y Release Gate `41935325237` estaban IN_PROGRESS. El siguiente commit documental cancelará esos runs y lanzará la validación exacta de su propio SHA; no se atribuirá PASS. Último HEAD de trabajo confirmado: `5035e5d7da619363d4465dbfd26773ef773e35c0`.
- 8/28 EF canónicos; EF-601 PARTIAL. FULL=false. Pendientes: recuperación real TUI con resultado/modelo y aviso stale, CI + Release Gate exact-SHA, A/B C01–C20, Writer humano y Reviewer independiente.
- Próximo: seguir EF-601/604 con el mismo journal: prueba provider-free de aviso terminal envejecido en restauración + revisión de consumo exacto post-reinicio; preservar el límite de no replay y el estado incierto.


## EF-601 stale notice composer — integración de política

- Base de trabajo: HEAD `519192dd36743c52947dae61af952feecc1eac2c`. La tanda anterior pasó el preflight exact-SHA `41934910473` para helper/formatter, y Phase 0 de `5035e5d7da619363d4465dbfd26773ef773e35c0` pasó tras corregir el límite de procedencia.
- Cambio agrupado: `agentTerminalNoticeContent` combina el timestamp persistido, resumen y eventId; `extensions/asen.ts` usa su `content` directamente. Regresión separa fresco (summary presente) de viejo (summary ausente) y mantiene identidad. No modifica wake, ack, journal state, ni autoriza replay.
- Run CI `41935809966` y Release Gate `41935809746` del HEAD anterior estaban queued/pending; este commit los cancela y lanza exact-SHA nuevos. No heredar resultados. Mantener 8/28 y EF-601 PARTIAL.
- Próxima verificación: preflight completo, Phase 0, CI y Release Gate del SHA nuevo. Registrar resultado antes de la siguiente macrotanda.


## EF-601 composer receipt — 2026-11-04

- SHA `886bb7f702f8e853ee2815cf37d0024dfaface29`: aceptación provider-free [41935953720](https://github.com/asenbanskaliev/ASEN/actions/runs/41935953720) preflight SUCCESS; test integrado composer fresco/viejo y Typecheck/Build pass. Carriles reales se omitieron, no hubo modelo ni Writer. Phase 0 `41935962862`, F5 `41935963039`, Pi runtime `41935962883`, CodeGraph `41935962853` y R4 self-audit `41935962849` SUCCESS; Pi Free Smoke `41935962852` SKIPPED.
- CI `41935962856` y Release Gate `41935962878` estaban IN_PROGRESS al registrar. La publicación de este checkpoint cancela esos resultados parciales; consultar nuevos workflows del nuevo SHA exacto. No afirmar CI/RG PASS.
- Checkpoints EF601-STALE-RESULT-01 y EF601-STALE-WIRING-01 acotan el formato y su composición con timestamp persistente. EF-601 global continúa PARTIAL, canónicos 8/28. Falta recovery TUI con inferencia/reinicio, consumo después de restart, A/B C01–C20, Writer humano, Reviewer independiente. FULL=false.
- Próxima macrotanda elegida: EF-601/604, cubrir pending viejo en flujo de restauración del host y evento/ack real, usando el mismo journal; conservar regla de no replay de `attempted` y sin notificar como leído hasta acción de status+ack.


## EF-601 — pending envejecido después de reabrir journal

- Nueva regresión agrupada: escritura de aviso durable `pending`, envejecimiento controlado de sus marcas de tiempo válidas, reapertura desde instancia de journal separada y composición stale sin resumen. Comprueba eventId/estado y que el compositor no claim/ack.
- Pendiente preflight exact-SHA del próximo commit. La prueba no representa host TUI ni un LLM real. Estado global 8/28 y FULL=false.


## Corrección preventiva del fixture EF-601 pending-stale — 2026-11-04

- La revisión de fuente antes de ejecutar CI encontró `\\n` literal en la escritura JSON del nuevo fixture; `JSON.parse` habría fallado por el sufijo. Se reemplaza por el salto de línea escapado correcto. No se hereda ni declara PASS para `074e0d1720c98c4faec5fdc81b1b87cc6d6b5814`.
- Ejecutar preflight provider-free y CI exact-SHA del commit correctivo; EF601-STALE-REOPEN-01 permanece sin marcar. 8/28, FULL=false.

## Recepción EF-601-STALE-REOPEN-01 — 2026-11-04

- SHA exacto: `f474f2e5559c976ff711e4c03b33a980b912966c`. La aceptación provider-free [41936460150](https://github.com/asenbanskaliev/ASEN/actions/runs/41936460150) terminó SUCCESS. En el job [126946454007](https://github.com/asenbanskaliev/ASEN/actions/runs/41936460150/job/126946454007), `tests/agent-notification-restart-process.test.ts` registró `ok 23` para pending envejecido reabierto; `fail 0`. Artefacto offline [13375210264](https://github.com/asenbanskaliev/ASEN/actions/runs/41936460150/artifacts/13375210264).
- CI general [41936469377](https://github.com/asenbanskaliev/ASEN/actions/runs/41936469377) seguía IN_PROGRESS en macOS y Windows (Ubuntu ya SUCCESS); Release Gate [41936469546](https://github.com/asenbanskaliev/ASEN/actions/runs/41936469546) SUCCESS; Phase 0 [41936469861](https://github.com/asenbanskaliev/ASEN/actions/runs/41936469861), F5 [41936469347](https://github.com/asenbanskaliev/ASEN/actions/runs/41936469347), Pi runtime [41936469383](https://github.com/asenbanskaliev/ASEN/actions/runs/41936469383), CodeGraph [41936469530](https://github.com/asenbanskaliev/ASEN/actions/runs/41936469530) y autoauditoría R4 [41936469494](https://github.com/asenbanskaliev/ASEN/actions/runs/41936469494) SUCCESS; Pi Free Smoke SKIPPED. No se atribuye el PASS de CI completo al SHA.
- Subcheck de reapertura obsoleta marcado en el plan. EF canónicos 8/28; EF-601/603/604 PARTIAL, A/B C01–C20 no ejecutado, Writer humano y Reviewer independiente pendientes, FULL=false.
- Próxima macrotanda seleccionada: fortalecer EF-601/604 con una regresión integrada de inspección específica y acuse del coordinador tras volver a registrar herramientas Pi, conservando el rechazo de eventos inciertos y de otra sesión. Ejecutar provider-free primero; solicitar lane real solo si el disparador existente permite un recibo legítimo sin Writer.

## EF-604 live Pi TUI stream interruption — 2026-11-05

- HEAD remoto confirmado antes de esta publicación: `e7153145f6039113f5a07141aeda44d8cc481b6b`; PR #45 y ref de rama coincidían.
- Tanda agrupada: nueva lane provider-free + opt-in Beam real para matar un host Pi TUI 1.2.0 mientras un Explorer de ASEN está ejecutando Pi RPC y ya observó un text delta auténtico. En reapertura exige identidad durable exacta y estado `interrupted`, sin relanzamiento automático, permisos, mensaje terminal o llamadas de modelo atribuibles falsamente. Child sin tools; el host de reapertura no recibe credenciales.
- CI exact-SHA de la base: Release Gate [41937975710](https://github.com/asenbanskaliev/ASEN/actions/runs/41937975710) SUCCESS; CI [41937975707](https://github.com/asenbanskaliev/ASEN/actions/runs/41937975707) seguía IN_PROGRESS en Windows y macOS durante la preparación; no heredar sus resultados al nuevo SHA. Phase 0 [41937975719](https://github.com/asenbanskaliev/ASEN/actions/runs/41937975719) y F5 [41937975737](https://github.com/asenbanskaliev/ASEN/actions/runs/41937975737) SUCCESS.
- Validación local de esta tanda: `node --check` para el harness MJS y el test de workflow PASS; YAML de workflow parseado correctamente. No se ejecutó ni se reservó un modelo.
- [ ] `EF604-REAL-TUI-STREAM-RESTART-01` permanece pendiente hasta PASS provider-free + CI exact-SHA + recibo de la lane Beam disparada por el mensaje exacto `ci: one-time Pi Beam TUI child crash proof`. Cualquier fallo se corrige antes de atribuir evidencia; no reintentar una llamada de proveedor a ciegas.
- Mantener 8/28 EF canónicos, EF-601/603/604 PARTIAL, FULL=false; C01–C20 A/B, Writer humano y Reviewer independiente bloqueados por sus evidencias reales.
- Próximo paso: comprobar que esta publicación dejó el branch en su nuevo SHA y que arrancaron CI/Release Gate/aceptación; leer primero el preflight. Si aprueba, revisar el único job Beam y su artefacto sanitizado. Si falla, clasificar el error por fase y corregir sin reclamar PASS.


## Checkpoint — 2026-11-05 — depuración de EF-604

- HEAD remoto confirmado para PR #45 y rama: `2a07846117f57bc0d1b2e3a94b6317753375342f`. Último commit publicado: mismo SHA. No se ha actualizado branch aún.
- Tanda ejecutada: EF-604 TUI crash durante inferencia Beam. Preflight provider-free SUCCESS; A/B pinned source objects SUCCESS (solo procedencia, sin escenarios C01–C20); Writer authorization design lock SUCCESS. Job real TUI falló al iniciar antes del stream, run [41940058136](https://github.com/asenbanskaliev/ASEN/actions/runs/41940058136), job [126958937944](https://github.com/asenbanskaliev/ASEN/actions/runs/41940058136/job/126958937944), artefacto [13374789516](https://github.com/asenbanskaliev/ASEN/actions/runs/41940058136/artifacts/13374789516). Se reservó 1 intento; número real HTTP no observado. No reintentar hasta corregir el arranque.
- Corrección preparada: incluir explícitamente el proveedor fijado Pi Ollama Cloud en la TUI que usa `--no-extensions`; añadir clasificación diagnóstica de error sin transcript/credenciales y prueba del gate. Hipótesis de causa, no evidencia concluyente.
- CI [41940065647](https://github.com/asenbanskaliev/ASEN/actions/runs/41940065647) y Release Gate [41940065659](https://github.com/asenbanskaliev/ASEN/actions/runs/41940065659) seguían ejecutándose al checkpoint. Comprobar cierres exact-SHA; no heredar al nuevo SHA.
- Canonical sigue 8/28; EF601/603/604 PARTIAL; EF002/701 A/B bloqueados (60 capturas auténticas ausentes), Writer humano bloqueado, revisión independiente externa pendiente; FULL=false.
- Próximos pasos: revisar/preflight del parche; verificar PR/ref HEAD antes de publicar un único commit consolidado; revisar workflows exact-SHA. Solo si el proveedor queda correctamente cargado y el preflight pasa, un nuevo commit con mensaje opt-in exacto puede lanzar una única prueba Beam. Luego continuar con consumo/acuse de avisos tras registrar de nuevo el coordinador y con otros EF provider-free.


## Checkpoint — 2026-11-05 — próxima prueba EF-601 live parent+child

- HEAD publicado confirmado: `bf5c6bd62e93aea6434265b0284f16143ed6dcaa`, PR/ref coincidían. Último commit: `fix: load Ollama provider in live TUI proof`.
- La aceptación exact-SHA [41941173091](https://github.com/asenbanskaliev/ASEN/actions/runs/41941173091) provider-free completó SUCCESS; revisión de fuentes congeladas A/B seguía en curso cuando se preparó la siguiente tanda. Los jobs de proveedores se SKIPPED por no coincidir el mensaje opt-in. Phase 0 Architecture [41941180813](https://github.com/asenbanskaliev/ASEN/actions/runs/41941180813) SUCCESS. Release Gate [41941180886](https://github.com/asenbanskaliev/ASEN/actions/runs/41941180886) y CI exact-SHA aún en curso.
- El lane anterior EF-604 TUI de SHA `2a07846117f57bc0d1b2e3a94b6317753375342f` falló antes de observar stream: job [126958937944](https://github.com/asenbanskaliev/ASEN/actions/runs/41940058136/job/126958937944), artifact [13374789516](https://github.com/asenbanskaliev/ASEN/actions/runs/41940058136/artifacts/13374789516). Corrige explícitamente la carga del proveedor en SHA actual, pero la lane real no ha sido repetida; no se atribuye salida Beam ni HTTP observada.
- Próxima tanda: hardening de un solo intento y ruta explícita del harness EF-601 parent+child real; ejecutar su único lane opt-in `ci: one-time Pi parent-child Beam proof`. Este recibe tanto Pi TUI padre como Explorer Pi RPC hijo con Beam, y necesita que provider-free preflight pase antes de reservar el proveedor.
- EF601-REAL-COORDINATOR-CONSUMPTION-01 pendiente. 8/28; EF-601/603/604 PARTIAL; A/B C01–C20 sin capturas reales, Writer consentimiento humano y Reviewer independiente externos pendientes, FULL=false.


## Checkpoint — 2026-11-05 — F5 ShellCheck corregido

- HEAD publicado: `41f4b8d79323d8a738934f24773d40e8b3fe4097`. La rama/PR #45 confirmados en ese SHA.
- F5 `41941906230` falló en `actionlint` con `SC2155` en la declaración/export de modelo de la TUI live EF-604. Cambio preparado: separar asignación y `export` en el step del workflow. No se cambia el modelo Beam, el scope de key ni la lógica de autoridad.
- El run provider-free de acceptance `41941897703` aún estaba en el test de reinicio Pi no-modelo al preparar el parche. Su lane autenticado parent-child permanece detrás de `offline-static-validation`; comprobar el estado antes de seguir. No repetir el proveedor del lane EF-604 de SHA `2a078...` a ciegas.
- Próximo: publicar esta corrección consolidada, revisar F5 exact-SHA, CI/RG y acceptance; el primer fallo permanece asociado a su SHA, no se hereda PASS.
- EF601-REAL-COORDINATOR-CONSUMPTION-01 pendiente; total 8/28; EF-601/603/604 PARTIAL; C01–C20, Writer humano, Reviewer independiente, FULL=false.


## Checkpoint — 2026-11-05 — EF-604 credential scope

- HEAD remoto PR #45/ref confirmado: 0f2eef941e768e0f5fb3235d08d96c8a2c3b5630. Próximo commit consolidado se publicará solo tras revalidar HEAD y el PR.
- Acceptance exact-SHA [41942195379](https://github.com/asenbanskaliev/ASEN/actions/runs/41942195379): provider-free SUCCESS; A/B frozen source witness SUCCESS (fuentes únicamente; 0 escenarios); Writer lock SUCCESS; lanes autenticados SKIPPED por mensaje. CI [41942202876](https://github.com/asenbanskaliev/ASEN/actions/runs/41942202876) aún IN_PROGRESS; Release Gate [41942202877](https://github.com/asenbanskaliev/ASEN/actions/runs/41942202877), Phase 0 [41942202858](https://github.com/asenbanskaliev/ASEN/actions/runs/41942202858), F5 [41942203089](https://github.com/asenbanskaliev/ASEN/actions/runs/41942203089) SUCCESS.
- EF-601 bounded coordinator consumption PASS at SHA 41f4b8d79323d8a738934f24773d40e8b3fe4097, run 41941897703, job 126965116445, artifact 13376622656; no HTTP call count claim. Canonical EF-601 remains PARTIAL.
- Tanda preparada: workflow acceptance, test de workflow EF-604, ODD y checkpoint. Credential key scoped to provider selection and live inference steps only. Test must pass locally and exact-SHA preflight.
- Tras publicar con mensaje exacto ci: one-time Pi Beam TUI child crash proof, comprobar preflight, luego el único lane Beam; no reintentar a ciegas. Aceptación del lane requiere delta Beam observado, TUI muerta durante RPC hijo, reinicio mismo task/session, estado interrupted y sin replay.
- EF604 crash/provider test pendiente; EF-002/701 requieren 60 capturas auténticas A/B/ASEN y host B; Writer exige consentimiento humano legítimo; revisión externa independiente falta. Canonical 8/28, FULL=false.


## Checkpoint — 2026-11-05 — EF-604 live crash PASS; EF-601 busy-parent siguiente

- HEAD publicado PR #45/ref: cb064f231fffbfee120f6cb2d6c8fc0160d77c8c. Commit: ci: one-time Pi Beam TUI child crash proof. Acceptance [41943098995](https://github.com/asenbanskaliev/ASEN/actions/runs/41943098995) SUCCESS, provider-free preflight SUCCESS, frozen A/B source witness SUCCESS (solo identidad/procedencia; 0 escenarios C01-C20). EF-604 live job [126969263635](https://github.com/asenbanskaliev/ASEN/actions/runs/41943098995/job/126969263635) SUCCESS, artifact [13377266928](https://github.com/asenbanskaliev/ASEN/actions/runs/41943098995/artifacts/13377266928); log exact-SHA registra PASS_REAL_PI_TUI_CRASH_DURING_CHILD_STREAM_AND_RECOVERY, modelo Beam y 1 reserva lógica. HTTP real no contado.
- En cb064f231fffbfee120f6cb2d6c8fc0160d77c8c, Release Gate [41943104323](https://github.com/asenbanskaliev/ASEN/actions/runs/41943104323) SUCCESS; F5 [41943104349](https://github.com/asenbanskaliev/ASEN/actions/runs/41943104349), Phase 0 [41943104404](https://github.com/asenbanskaliev/ASEN/actions/runs/41943104404), Pi Runtime [41943104321](https://github.com/asenbanskaliev/ASEN/actions/runs/41943104321), CodeGraph [41943104385](https://github.com/asenbanskaliev/ASEN/actions/runs/41943104385), R4 self-audit [41943104311](https://github.com/asenbanskaliev/ASEN/actions/runs/41943104311) SUCCESS. CI [41943104436](https://github.com/asenbanskaliev/ASEN/actions/runs/41943104436) estaba IN_PROGRESS al verificar; no heredar a otro SHA.
- La siguiente tanda aplica scope step-level del secreto en real-parent-consumption, añade prueba de ausencia job-wide/presencia solo en setup + ejecución, refuerza el test de scope EF-604 y ejecuta `ci: one-time Pi busy-parent Beam proof` una sola vez tras el preflight exact-SHA.
- Bounded parent-child idle ya PASS en SHA 41f4b8d79323d8a738934f24773d40e8b3fe4097/run 41941897703/job 126965116445/artifact 13376622656. El busy-parent puede confirmar entrega durante una tool call activa; no equivale a despertar tras reinicio.
- Estado: 8/28 canónicos; EF-601/603/604 PARTIAL; EF604 subcheck crash/restart PASS, EF601 idle-consumption PASS. A/B C01-C20, consentimiento Writer humano, Reviewer independiente y restart parent-consumption pendientes. FULL=false.


## Checkpoint — 2026-11-05 — EF-601 busy parent PASS; EF-603 siguiente

- HEAD publicado: 6b0034a1d9d8a674a0f920130a2254d558b09b5c; mensaje `ci: one-time Pi busy-parent Beam proof`. Acceptance [41944160827](https://github.com/asenbanskaliev/ASEN/actions/runs/41944160827) SUCCESS: provider-free preflight SUCCESS, fuentes A/B verificadas únicamente por identidad (0 casos), real Pi busy-parent/Explorer Beam SUCCESS [job 126972883497](https://github.com/asenbanskaliev/ASEN/actions/runs/41944160827/job/126972883497), artifact [13377143664](https://github.com/asenbanskaliev/ASEN/actions/runs/41944160827/artifacts/13377143664). Log: T12_REAL_PI_BUSY_PARENT_CHILD_CONSUMPTION_PASS; 2 acciones padre status/ack; contador HTTP no reportado.
- En 6b0034a1d9d8a674a0f920130a2254d558b09b5c, Release Gate [41944170689](https://github.com/asenbanskaliev/ASEN/actions/runs/41944170689) SUCCESS; Phase 0 [41944170592](https://github.com/asenbanskaliev/ASEN/actions/runs/41944170592), F5 [41944170547](https://github.com/asenbanskaliev/ASEN/actions/runs/41944170547), Pi Runtime [41944170554](https://github.com/asenbanskaliev/ASEN/actions/runs/41944170554), CodeGraph [41944170540](https://github.com/asenbanskaliev/ASEN/actions/runs/41944170540), R4 auto self-audit [41944170553](https://github.com/asenbanskaliev/ASEN/actions/runs/41944170553) SUCCESS. CI [41944170587](https://github.com/asenbanskaliev/ASEN/actions/runs/41944170587) aún IN_PROGRESS. CI del SHA anterior cb064f fue CANCELLED tras push del siguiente candidato, no heredado.
- Siguiente tanda EF603: eliminar el secreto job-wide del lane real de coalescing y de los otros lanes de proveedor que aún lo tenían; inyectar solo por step a setup/ejecución autenticada; regresión general sobre conteos y scopes exactos; lanzar el único lane `ci: one-time Pi EF-603 coalesced Explorer Beam proof` tras su preflight.
- EF-604 subcheck TUI crash/reopen PASS en cb064f231fffbfee120f6cb2d6c8fc0160d77c8c/run 41943098995/job 126969263635/artifact 13377266928; EF-601 idle y busy subchecks PASS. Canonical 8/28, EF-601/603/604 PARTIAL; reinicio de host y despertar tras restart, 60 observaciones A/B/ASEN, Writer humano y Reviewer independiente pendientes; FULL=false.


## Checkpoint — 2026-11-05 — EF-603 real coalescing PASS; EF-403 next

- HEAD published: d76070265583e42bca003d40d33c2ccb0deb3e9e; commit `ci: one-time Pi EF-603 coalesced Explorer Beam proof`. Acceptance [41945298981](https://github.com/asenbanskaliev/ASEN/actions/runs/41945298981) SUCCESS: provider-free preflight and frozen-source A/B provenance SUCCESS; actual EF-603 lane job [126976621404](https://github.com/asenbanskaliev/ASEN/actions/runs/41945298981/job/126976621404) SUCCESS, artifact [13378860407](https://github.com/asenbanskaliev/ASEN/actions/runs/41945298981/artifacts/13378860407). Log confirms 3 logical requests, 1 native Pi process, 1 reserved inference, HTTP calls observed null.
- Workflow now scopes the Ollama key to authenticated setup/execution steps for all six real-provider lanes (parent, TUI crash, stream interruption, EF-603, repaired review, provider acceptance); provider-free tests assert no job-wide key and exact step counts. EF-603 flow and provider-free tests passed in acceptance preflight.
- At checkpoint CI [41945306452](https://github.com/asenbanskaliev/ASEN/actions/runs/41945306452) and Release Gate [41945306292](https://github.com/asenbanskaliev/ASEN/actions/runs/41945306292) were still IN_PROGRESS; Phase 0, F5, CodeGraph, Pi Runtime and R4 self-audit were SUCCESS. The preceding candidate CI was cancelled by the later push; no result is carried to this SHA.
- Next macro: exact one-time `ci: one-time Pi repaired-review Beam proof`. It runs corrected read-only Reviewer and Verifier on a disposable fixture, two logical reservations, deterministic RED/GREEN evidence, no tools/Writer, exact-SHA artifacts. Record actual provider call count as unknown unless observed.
- EF-601 idle and busy-parent subchecks PASS, EF-604 TUI crash/reopen subcheck PASS, EF-603 one-process coalescing subcheck PASS. Canonical EF count remains 8/28; all canonical EF-601/603/604 remain PARTIAL; 60 A/B/ASEN observations, Writer human consent and independent review remain external blockers. FULL=false.


## Checkpoint — 2026-11-05 — EF-403 preflight mismatch

- HEAD publicado: 505d5bb467f068b75976d8f31f3110ca1732a79a. Acceptance [41945944693](https://github.com/asenbanskaliev/ASEN/actions/runs/41945944693) FAIL en provider-free job [126978046314](https://github.com/asenbanskaliev/ASEN/actions/runs/41945944693/job/126978046314), etapa F2/F3 deterministic. Test nuevo exigió un campo `humanConsent:false` que el harness no emite; su contrato mantiene writerAuthorized=false y authorization=NOT_GRANTED. El preflight bloqueó la lane; no se ejecutaron modelos ni se reservó cuota.
- Corrección preparada: quitar solo la aserción del campo ausente. Mantener checks de run_attempt=1, noTools, dos reservas, writerAuthorized false y NOT_GRANTED. Ejecutar el mismo lane exacto una sola vez tras PASS del preflight.
- La siguiente commit hereda los cambios de scope de secretos y la prueba de receipt EF603, pero la evidencia EF403 sigue abierta. No marcar nada de EF403 como PASS y no arrastrar éxito de otra SHA.


## Checkpoint — 2026-11-05 — EF-403 live lane inconclusa

- SHA publicado 7d99b3cde60f82d0be288fe7fbac4dee308aff14, mensaje `ci: one-time Pi repaired-review Beam proof`. Provider-free preflight SUCCESS; lane [126980183141](https://github.com/asenbanskaliev/ASEN/actions/runs/41946364721/job/126980183141) FAILED at `REVIEWER_PI_RPC` after model setup succeeded. No Verifier call. Job logs omit cause by design; provider request count unknown. The script reserves the Reviewer slot before dispatch; do not repeat a provider request without cause/quota evidence.
- Corrección preparada solo para observabilidad provider-free: enum de fallo cuota/auth/billing/network/timeout/artifact/role assertion; número de slots lógicos reservados; HTTP count null; sin guardar response, secret o transcript. Añadir regresión determinista a tests existentes.
- Esta falla no cierra EF-403. Próximo: ejecutar regression/provider-free exact-SHA de la clasificación, revisar CI/RG del SHA correcto y avanzar el siguiente EF provider-free. Mantener otros Beam lanes en espera hasta conocer acceso/cuota real.
- Estado canónico 8/28; EF-601 idle/busy, EF-603 one-process, EF-604 TUI crash/reopen subchecks PASS; EF-403 subcheck no verificado; A/B 60 slots, consentimiento Writer, Reviewer independiente y FULL pendientes.


## Checkpoint — 2026-11-05 — ajustar contador de reservas en test

- SHA bafe83e5788219fb5782efd986026c832bd90718: acceptance [41947366698](https://github.com/asenbanskaliev/ASEN/actions/runs/41947366698) falló en provider-free stage F2/F3. Test nuevo esperaba texto `callsReserved:2` y no reconocía el contador dinámico de dos slots; la lane EF403 fue SKIPPED, sin ejecución Beam.
- Corrección preparada: afirmar assert.equal(callsReserved,2,...) en éxito del harness y buscar ese contrato en `tests/t12-real-provider-workflow.test.ts`. El contador exacto no se relaja; evidencia de fallo preserva HTTP count unknown y ningún output crudo.
- El fallo anterior sigue siendo EF403 live stage REVIEWER_PI_RPC, sin causa distinguida ni repetición; no heredar resultado de otro SHA.


## Checkpoint — 2026-11-05 — auditoría de referencia de notificaciones EF-601

- HEAD remoto confirmado antes de esta tanda: `024713d2c83accd876201b4064698d609bafb638`, PR #45 abierto, rama autorizada.
- CI exact-SHA: Acceptance [41947799124](https://github.com/asenbanskaliev/ASEN/actions/runs/41947799124) SUCCESS (preflight provider-free y procedencia congelada A/B; cero casos C01–C20; lanes autenticadas SKIPPED). Release Gate [41947809311](https://github.com/asenbanskaliev/ASEN/actions/runs/41947809311) SUCCESS. Phase 0, F5, CodeGraph, Pi runtime y autoauditoría R4 SUCCESS. CI [41947809052](https://github.com/asenbanskaliev/ASEN/actions/runs/41947809052) seguía IN_PROGRESS: Ubuntu PASS; macOS y Windows sin resultado final al último sondeo. No heredar esos resultados a un SHA distinto.
- Auditoría de Gentle Shell en rama `main`, árbol `7ecb826a2b1eafa6b522ee16d905a99e998f0c89`: completion/message queue in-memory, freshness 90 s, flush en límites de turno/idle y `dropAll()` en session start/shutdown. ASEN persiste estado exacto sesión/proyecto y nunca reenvía `attempted` incierto; esta diferencia de recuperación está documentada en el plan, sin declararla equivalencia C13.
- Conteo canónico permanece 8/28. EF-601/603/604 siguen PARTIAL; EF-403 sin PASS; EF-002/701 C01–C20 y consentimiento Writer real continúan bloqueos externos. FULL=false.
- Siguiente macrotanda: esperar y registrar el resultado final del CI exact-SHA antes de reutilizarlo; continuar revisión provider-free de EF-601/604 y los recibos de consumo/reapertura. No repetir el Beam EF-403 que falló en `REVIEWER_PI_RPC` hasta tener causa/cuota observada. En cualquier nuevo lane gratuito, conservar el presupuesto de una ejecución, sin reintentos ni fallback de pago.
