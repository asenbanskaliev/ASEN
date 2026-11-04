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
