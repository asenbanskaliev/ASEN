# Auditoría 4R — Flujo de agentes, PR #61

**Fecha:** 2026-11-16. **Alcance:** rama `feat/flujo-de-agentes-20261115`, cambios del plan T02–T10 y del flujo ODD → perfiles → revisión → propuesta de reparación. Baseline observado: `9dcb6cf125ebd6879aa8d9448e8764170a1b6a76`.

**Tipo de auditoría:** revisión técnica interna de código y registros de GitHub Actions. No equivale a una auditoría independiente ni a pruebas en la interfaz TUI del usuario. Los resultados posteriores se califican únicamente por las comprobaciones del SHA exacto.

## 1. Risk — permisos, exposición y autorización

| Hallazgo | Gravedad | Evidencia | Intervención |
| --- | --- | --- | --- |
| RISK-01: una respuesta del proveedor que solo **contuviese** el marcador sintético podía contar como recibo positivo; el modelo real podía deducirse de una sola de dos fuentes, ocultando discrepancias | Alta | `scripts/t06-nvidia-pi-concurrent.ts`, lectura de `message_end` y evento de selección | **Corregido en código:** `src/runtime/agents/t06-pi-receipt-validator.ts` exige texto exacto, un único mensaje final y correspondencia entre metadatos de respuesta y selección Pi; pruebas negativas en `tests/t06-pi-receipt-validator.test.ts` |
| RISK-02: el Todo ODD podía cambiar una vez concluida la última llamada de revisión y antes de consolidar los dictámenes | Alta | `src/review/ordinary-review-command.ts`: pasos posteriores a 4R y Judgment Day | **Corregido en código:** revalidación del Todo tras los modelos y antes de publicar; caso negativo de mutación durante un revisor |
| RISK-03: una propuesta Fix no debe heredar el consentimiento de lectura de los jueces ni ampliar rutas desde sus hallazgos | Control obligatorio | `src/review/odd-agent-review-flow.ts`, `src/runtime/agents/parallel-parent-supervisor.ts` | Se mantiene **sin escritura**: rutas dentro del candidato revisado, nuevo ODD y consentimiento Writer **individual**; no se ha ejecutado Fix Writer |

No se han inspeccionado ni publicado secretos. Los modelos de revisión obtienen acceso al diff **solo tras consentimiento**. La prueba T06 utiliza datos sintéticos y `noTools:true`; **no acredita dos Workers de escritura**.

## 2. Readability — legibilidad y mantenimiento

| Hallazgo | Gravedad | Evaluación |
| --- | --- | --- |
| READ-01: `ordinary-review-command.ts` concentra UI, candidatos Git, resolución de modelos, 4R, dos jueces, consulta ODD y propuestas Fix | Media | Conviene separar los adaptadores de comandos y el ciclo de revisión, sin duplicar los controles de identidad ni abrir nuevas rutas de autorización |
| READ-02: el módulo `odd-agent-review-flow.ts` aporta contratos tipados y no mezcla propuestas de revisión con ejecución de agentes | Favorable | Conservar los estados `review-setup-required`, `manual-triage-required` y `fix-planning-required` como **solicitudes**, no resultados aprobados |
| READ-03: los estados de modelos `requested`, `resolved` y `actual` deben permanecer visualmente distintos | Media | No mostrar el modelo solicitado como consumido sin recibo Pi auténtico; `actual:unknown` sigue siendo necesario cuando falta evidencia |

La extracción estructural de `ordinary-review-command.ts` se deja pendiente para una tanda con pruebas completas, a fin de no romper el flujo existente.

## 3. Reliability — lógica y pruebas negativas

| Hallazgo | Gravedad | Evidencia e intervención |
| --- | --- | --- |
| REL-01: CI fallaba en tres sistemas porque una prueba de interfaz exigía literalmente la ayuda anterior al nuevo subcomando ODD | Alta para integración | `tests/ordinary-review-command-ui.test.ts` actualizado; el fallo se constató en CI `43818572987`. Requiere CI del SHA nuevo para cerrar |
| REL-02: sesión o HEAD obsoletos durante una llamada al modelo podían acabar mostrando una revisión aparentemente vigente | Alta | Se refuerza la revalidación después de las últimas respuestas. Prueba de cambio de Todo: `tests/odd-agent-review-command.test.ts` |
| REL-03: falsos recibos Pi, mensajes duplicados, proveedor equivocado y respuestas parciales | Alta | Nuevas pruebas exhaustivas del validador puro, sin consumir NVIDIA ni fabricar una ejecución live |
| REL-04: los resultados Pi de solo lectura son válidos únicamente cuando la ejecución real, el modelo y los dos árboles Git permanecen demostrados | Control obligatorio | La prueba NVIDIA del nuevo SHA debe pasar; no reutilizar un resultado del SHA anterior |

## 4. Resilience — fallos, cancelación, recuperación

| Hallazgo | Gravedad | Evidencia e intervención |
| --- | --- | --- |
| RES-01: un error al resolver el perfil `jd-fix-agent` **después** de dos llamadas de juez podía hacer perder el informe ya obtenido | Media-alta | Se conserva el dictamen y se devuelve `fixHandoff.status=blocked`, sin lanzar Fix. Pruebas unitarias e integración en el comando |
| RES-02: si fallaba la escritura del recibo T06, la limpieza de worktrees y directorios temporales podía no ejecutarse | Media | Se fuerza limpieza mediante `finally` anidado incluso con fallo del recibo |
| RES-03: un despachador Pi cuya llamada no regrese o cuyo estado sea ambiguo no se puede reintentar automáticamente como Writer | Alta, pendiente de evidencia live | El supervisor ya usa reclamación de un solo intento y detiene el lote ambiguo; faltan pruebas reales de proceso muerto, cancelación y recuperación en dos sesiones Writer independientes |
| RES-04: las revisiones mediante flujo del proveedor no tienen todavía un plazo propio validado de punta a punta | Media, pendiente | Confirmar cancelación/tiempo de espera en la interfaz Pi real, sin introducir un reintento que pudiera duplicar gasto o escrituras |

## Evidencia y aceptación

- Las correcciones de RISK-01, RISK-02, REL-01, RES-01 y RES-02 están **publicadas en la rama**, pero solo se consideran **validadas** cuando las pruebas de su SHA exacto finalicen correctamente.
- Resultado esperado: Phase 0, Pi 1.2, CI de tres sistemas, Release Gate y prueba T06 NVIDIA; los trabajos omitidos no son PASS.
- La auditoría ha examinado código y pruebas existentes de `parallel-parent-supervisor.ts`; **no** ha ejecutado dos Writers reales ni dado autorizaciones humanas.
- Pendientes prioritarios: T06 Writer dual autenticado por dos confirmaciones, T08 vinculación durable de Fix a nueva tarea ODD **sin autoridad heredada**, T07 comprobación TUI, T09 medición A/B auténtica y T10 revisión independiente.

**Estado de aceptación:** `globalFull:false`; PR #61 en borrador. Prohibidos fusión automática, consentimiento Writer implícito y modelos de pago no autorizados.

## Ampliación 4R — integridad de recibos de Workers (2026-11-16)

**Risk:** hallazgo RISK-04, gravedad alta para la trazabilidad: el diario de observaciones T06 no impedía atribuir dos Workers a una misma sesión Pi si las raíces Git eran diferentes. Tampoco bloqueaba reutilizar una sesión hija en un lote posterior cuando cambiaba el directorio. Corregido en `parallel-worker-observation-journal.ts`: sesiones únicas dentro de cada lote y entre recibos ya almacenados; sin autorización ni ejecución nueva.

**Readability:** READ-04, claridad de validación: se extrae `portablePath` como regla común para validar rutas en el momento de grabar y al volver a leer. Los estados `clean`, `scoped-changes`, `out-of-scope`, `head-diverged` y `unavailable` se tratan como hechos Git que deben ser compatibles con las listas de rutas y la verificación de origen; no como pruebas de calidad.

**Reliability:** REL-05, gravedad media-alta: antes podían persistirse combinaciones imposibles de `status`, `headMatchesBase`, `sourceVerified`, `changedPaths` y `outOfScopePaths`. Un registro `clean` con archivos modificados creaba una apariencia falsa. El registro ahora rechaza dichos datos **antes de grabar** y bloquea registros antiguos alterados **al leer**, sin intentar repararlos silenciosamente. Nuevas pruebas negativas en `tests/parallel-worker-observation.test.ts`.

**Resilience:** RES-05, gravedad media: los recibos de un lote siguen grabándose en una sola transacción y fallan por completo si uno está mal formado o si hay sesión repetida; no se reintenta automáticamente un Worker ni se sustituye un recibo anterior. Las pruebas existentes de competencia concurrente se conservan y se amplían con falsificación y corrupción en disco.

**Alcance de esta ampliación:** revisión estática y pruebas publicadas; el resultado definitivo depende del CI/Release Gate del SHA exacto. No hay demostración de dos Workers Writer reales ni auditoría independiente. `globalFull:false` y PR #61 en borrador.
