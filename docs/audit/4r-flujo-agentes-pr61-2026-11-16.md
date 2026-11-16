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

## Verificación 4R de tres fallos CI multiplataforma (16 de noviembre de 2026)

**Alcance comprobado:** ejecución CI `43825122036` del SHA `9d4766038b65`, revisión del código de las pruebas y de los contratos de revisión. Estos hallazgos son de una revisión interna, **no** equivalen a la auditoría independiente T10.

| Área | Hallazgo y causa | Corrección segura | Prueba de cierre |
| --- | --- | --- | --- |
| **Risk** | En T08 la prueba borraba el directorio padre de la vista protegida antes de llamar a `closeWorkspaceReview`; la limpieza fallaba por `EACCES` en POSIX. La vista está protegida deliberadamente. | Se cierra mediante la función de propiedad verificada **antes** de borrar directorios, y no se ignoran las excepciones del cierre. No se cambian permisos ni se eliminan las comprobaciones de pertenencia. | `tests/judgment-fix-proposal-journal.test.ts` en Linux y macOS, incluyendo ambos escenarios anteriores con `hookFailed`. |
| **Readability** | El ayudante `git()` de las pruebas aplica `trim()`, que borra el primer espacio significativo del formato `--porcelain`. | La comprobación que necesita distinguir índice y árbol de trabajo lee Git sin `trim()` y elimina solo espacios finales. | `tests/odd-agent-review-command.test.ts` en los tres sistemas. |
| **Reliability** | La prueba del perfil Fix esperaba `blocked` aunque ambos jueces daban `pass` y no había ninguna reparación que preparar. | La prueba negativa pide dictámenes genuinos con fallos para verificar el bloqueo de Fix cuando su perfil no se puede consultar; un segundo caso prueba `not-needed` sin hallazgos. No se transforma un PASS en permiso de escritura. | `tests/ordinary-review-assessment.test.ts` en Windows, macOS y Linux. |
| **Resilience** | El orden de los ganchos de fin de prueba ocultaba un fallo de limpieza al convertirlo en fallo incidental de permisos. | Un solo gancho cierra la vista genuina y después elimina los directorios creados para la prueba. Si el cierre no funciona, **la prueba falla** en lugar de suprimir el error. | Repetir CI completo y comprobar que no aparece `hookFailed`, `EACCES` ni trabajo omitido contado como aprobado. |

### Evidencia anterior y criterio de cierre

- `43825122036` tenía las pruebas específicas T02/T05/T06, NVIDIA API y Pi nativo en verde, pero el **CI general falló**. Release Gate, Phase 0 y Pi 1.2 habían pasado para ese SHA.
- Los fallos generales eran reproducibles en los registros de Linux, macOS y Windows y no justifican relajar ninguna barrera de autorización.
- Los cambios de esta corrección se limitan a archivos de **pruebas y documentación**; no se altera el código de producción, el flujo de permisos ni el límite de gasto.
- **Cierre condicionado:** los cuatro errores identificados solo pasan a `corregido y verificado` cuando el CI completo de un mismo SHA final sea correcto en los tres sistemas. Release Gate y Pi 1.2 también deben superar **ese SHA**, sin considerar los trabajos omitidos como PASS.
- PR #61 sigue en borrador; `globalFull:false`. T06 Writer dual, T08 Fix autorizado, T09 y T10 siguen sin evidencia FULL.

## Ampliación 4R — conexión de Fix persistido con borrador ODD (2026-11-16)

**RISK / Seguridad.** El nuevo comando `/asen-review fix-plan <id>` verifica que la propuesta almacenada pertenece a la **sesión Pi y proyecto originales**, compara la identidad persistida del informe, bloquea ámbitos sensibles o fuera del proyecto y vuelve a leer el registro antes de presentar el borrador. No hereda credenciales, aprobación Writer ni facultad de fusión. La salida queda en `authorized:false` y `modelActuallyUsed:unknown`. Un atacante que falsifique un registro solo puede intentar producir un **borrador no ejecutable**, nunca un permiso; el diario privado existente continúa siendo una frontera de confianza.

**READABILITY / Legibilidad.** La transformación está aislada en `src/review/judgment-fix-odd-draft.ts`. El comando principal solo verifica sesión, consulta registro y devuelve el resultado. Se distinguen `draft-only` y `manual-triage-required`. No se expone contenido textual libre de los modelos como instrucciones de programación.

**RELIABILITY / Confiabilidad.** Dos grupos de pruebas negativas cubren identidad manipulada, otra sesión/proyecto, rutas inseguras y duplicadas, permisos heredados, registro ausente y modificación durante su lectura. Se preservan explícitamente `sourceCandidateTree` y `candidateStatus:not-revalidated`: **no se declara verificado el árbol Git actual**.

**RESILIENCE / Resiliencia.** Si la sesión cambia, el diario no está disponible, el registro se modifica o existe desacuerdo entre jueces, se bloquea o requiere revisión humana. El comando no escribe un Todo, no lanza Worker, no consulta modelos y no ejecuta reintentos que pudieran duplicar escrituras.

**Limitaciones que impiden T08 FULL:** no existe todavía una conversión segura del borrador a un nuevo ODD/Todo ejecutable con instrucciones humanas concretas, candidato vigente y autorización individual. También falta auditoría independiente T10 y evidencia de dos Writers Pi reales. **Solo se podrá acreditar esta tanda con CI y Release Gate correctos para su SHA exacto; globalFull:false.**

## Revisión 4R de la persistencia Fix → ODD (2026-11-16)

- **Risk (riesgo):** la petición `fix-plan save` no convierte un informe de modelo en permiso. Exige sesión y proyecto originales, propuesta guardada sin disputa, coincidencia de árbol Git, instrucción y datos escritos por la persona y una confirmación de guardado. `plan.fixSource` fija la huella del árbol de referencia y el despachador la comprueba antes, después y en el instante de preparar el Writer. No se elude el diálogo Writer habitual ni se usa un modelo de pago.
- **Readability (legibilidad):** las responsabilidades están separadas en `judgment-fix-odd-preflight.ts` (Git), `judgment-fix-odd-planning.ts` (datos humanos) y el planificador y almacén de tareas existentes. El comando `ordinary-review-command.ts` solo organiza confirmación y consulta; queda como deuda dividir ese archivo grande cuando el flujo tenga aceptación.
- **Reliability (confiabilidad):** se bloquea el uso de árboles diferentes, archivos nuevos no incluidos, rutas expandidas, metadatos de origen falsificados, sesiones cruzadas o datos ODD incompletos. Los identificadores de tareas derivan de la propuesta, de modo que `SessionTodoStore.addPlan` aplica su control de duplicación y cambios de contenido. Un resultado `saved` no equivale a trabajo completado.
- **Resilience (resiliencia):** las interrupciones durante edición, consulta o consentimiento no inician nada. El plan se guarda con lanzamiento diferido y no se reintenta automáticamente. Si el guardado se completa pero cambia el árbol o se pierde la respuesta, las tareas deben inspeccionarse antes de reintentarlo; las comprobaciones de origen en cada Worker siguen bloqueando una ejecución insegura.

**Pruebas negativas:** `tests/judgment-fix-odd-preflight.test.ts`, `tests/judgment-fix-odd-planning.test.ts`, `tests/judgment-fix-odd-save.test.ts` y `tests/todo-store.test.ts`. Estas afirmaciones son una **auditoría interna sobre código y pruebas**, no una aceptación independiente T10. Para declarar la tanda verificada, debe aprobar CI y Release Gate del SHA exacto en las tres plataformas; `globalFull:false`.
