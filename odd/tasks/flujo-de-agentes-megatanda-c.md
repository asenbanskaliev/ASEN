# Megatanda C — fallos, revisión proporcional y correcciones (auditoría y ejecución)

**Fecha:** 2026-11-19. **Rama:** `feat/flujo-de-agentes-20261115` · PR #61.
**Estado:** IMPLEMENTACIÓN_CONECTADA / PRUEBAS_AÑADIDAS / CI_EN_VALIDACIÓN; `globalFull:false`. No hay paridad autenticada confirmada.
**Referencia:** investigación 4.9.0 enlazada desde `flujo-de-agentes.md`. Solo el flujo de agentes, sin Desktop ni cambios de interfaz ajenos al flujo.

## Auditoría del código productivo

| Tema | Código real y hallazgo | Decisión |
| --- | --- | --- |
| Cambio de modelos | `src/runtime/lifecycle/model-fallback-policy.ts` y `parent-model-fallback.ts` ya limitan alternativas, errores, 2/30 minutos y máximo ocho modelos. | **MANTENER.** No crear otro motor de reintentos ni probar proveedores de pago. |
| Revisión proporcional | `review-assessment-policy.ts` existe, pero estaba declarada solo descriptiva, sin conexión con `ordinary-review-command.ts`, que ya usa una lectura real `native assess`. | **CONECTAR COMO DIAGNÓSTICO** a la revisión ejecutada, sin nuevas llamadas, sin conceder permisos ni sustituir el plan conservador existente. |
| Dictámenes Judgment Day | `judgment-day.ts` usa dos jueces auténticos y validación de candidato, pero podía calificar `analysis-complete` cuando ambos emitían `pass` y había observaciones de gravedad baja/media. `odd-agent-review-flow.ts` entonces proponía `not-needed`. | **EVITAR PÉRDIDA DE HALLAZGOS.** Marcar `findings-require-review` si existe cualquier hallazgo; mantener explícita la falta de aceptación y consentimiento nuevo para Fix. |
| Corrección ordinaria | `bounded-correction.ts` limita una corrección y revisión nueva; `ordinary-review-command.ts` revalida Git, alcance y sesión, y reserva la corrección una sola vez. | **MANTENER** su barrera. No reiniciar presupuestos ni otorgar Writer a partir del texto de un modelo. |
| Correcciones dobles | `dual-rejudgment.ts` ya limita dos rondas y escala lo no resuelto. No es por sí solo un motor conectado que escriba. | **MANTENER**, probar alcance congelado, discrepancias y agotamiento. Sin tercera ronda. |
| Recepción y aceptación | `task-agent-reconciler.ts` distingue Writer ejecutado de revisión aceptada. `review-acceptance.ts` exige recibo auténtico, SHA exacto, Git limpio y aprobación humana. | **MANTENER** la prohibición de autoaceptación; añadir diagnóstico cerrado de fallos, sin guardar texto sensible del proveedor. |
| Continuidad de la Megatanda B | Solo otro Todo de lectura ya independiente y modelo de tarifa cero puede continuar tras un fallo; no se reintenta la escritura dudosa. | **CONSERVAR**, con diagnóstico que evite clasificar una salida vacía como éxito o reparación. |

## Cambios quirúrgicos previstos

1. **C1 — Diagnóstico proporcional conectado:** reutilizar la evaluación nativa ya efectuada dentro de la revisión ordinaria. Publicar separadamente la recomendación de verificación, su estado de disponibilidad, el origen y `lifecycleAuthority:false`. No modificar los permisos ni rebajar verificaciones ya exigidas.
2. **C2 — Judgment Day sin hallazgos ocultos:** si cualquier juez aporta observaciones, mantenerlas visibles como pendientes aunque ambos digan `pass`. El traspaso a corrección sigue siendo solo una propuesta ODD, sin ejecución.
3. **C3 — Diagnóstico cerrado de fallos terminales:** usar exclusivamente el estado persistido (`failed`, `cancelled`, `interrupted`, `completed`) y señales estructurales (resultado vacío, rol), nunca analizar instrucciones ni contraseñas de los resúmenes. Informar acción segura, sin reintentos ni permisos.
4. **C4 — Verificación de regresiones:** pruebas de éxito/fallo/discrepancia, coste/no-autoridad, hallazgos leves, salida vacía, autor distinto de revisor, SHA alterado, corrección agotada y mantenimiento de todas las barreras previas.

## Casos de prueba obligatorios

| Caso | A | B | Resultado |
| --- | --- | --- | --- |
| C-01 | La evaluación nativa indica pasivo | No está disponible | Advertencia proporcional pasiva / diagnóstico desconocido; jamás autoaceptar |
| C-02 | Riesgo nativo alto sin escalada explícita | Riesgo alto con escalada nombrada | Mantener controles vigentes; política descriptiva distingue requerimiento adicional |
| C-03 | La revisión no está pendiente | El dato de revisión está ausente | Diferenciar `not-due` de `unknown` |
| C-04 | Los dos jueces dicen `pass` y no hay hallazgos | Ambos dicen `pass` pero hay hallazgos leves | Solo A marca análisis sin hallazgos; B exige seguimiento |
| C-05 | Los jueces discrepan | Ambos fallan | Triage humano / propuesta Fix ODD, ambas sin autoejecución |
| C-06 | Modelo revisor no autenticado | Modelo del autor reutilizado | Rechazo antes de llamar al proveedor |
| C-07 | El mismo SHA y árbol siguen vigentes | Git o árbol cambia entre jueces | En B, detener antes de la segunda llamada |
| C-08 | Fallo técnico confirmado | Cancelación o resultado incierto | Diagnóstico explícito; ninguna repetición de escritura |
| C-09 | Agente indica finalizado, sin salida útil | Agente termina con evidencia real | A no se considera éxito aceptado |
| C-10 | Dos rondas de corrección consumidas | Una ronda resuelve hallazgos | Escalar / concluir solo el dictamen, nunca integración |
| C-11 | Hay dictamen de revisión | Hay recibo válido y aprobación humana | El dictamen solo no acepta código |
| C-12 | Modelo gratuito permitido | Precio desconocido o positivo | No efectuar llamadas no autorizadas |

## Criterios estrictos de cierre

- Cambios comprobados por pruebas del ejecutor y el código real de Pi, sin usar modelos externos de pago.
- `npm run typecheck`, prueba específica de C, CI y Release Gate **sobre el mismo SHA exacto**.
- No afirmar paridad completa sin pruebas con proveedores reales autorizados y comparación A/B.
- Mantener PR como borrador, no fusionar y conservar `globalFull:false`.

## Ejecución y pruebas realizadas

- **C1:** `review-assessment-policy.ts` se conecta al consumidor real `ordinary-review-command.ts`, reutilizando su única lectura `native assess`. La recomendación conserva `lifecycleAuthority:false`; `mode:"unavailable"` cuando la lectura no acredita el modo RDD, sin inventar escaladas por texto nativo.
- **C2:** `judgment-day.ts` conserva observaciones leves aunque ambos jueces den `pass`; `odd-agent-review-flow.ts` mantiene propuesta ODD, no ejecución ni aprobación.
- **C3:** `agent-terminal-diagnostic.ts` y `extensions/asen.ts` muestran códigos cerrados `failed-unknown`, `interrupted`, `cancelled` y `completed-without-evidence`; no clasifican errores por texto de proveedor no confiable.
- **C4:** los dos controles de consentimiento de revisión exigen `===true`; se añaden pruebas frente a valores ambiguos.
- **Pruebas nuevas y ampliadas:** `tests/megatanda-c-review-policy.test.ts`, `tests/judgment-day.test.ts`, `tests/ordinary-review-assessment.test.ts` y `tests/review-acceptance.test.ts`. Se conserva `tests/review-assessment-policy.test.ts`.
- **Estado de evidencia:** código y pruebas subidos a PR #61; todavía no se considera demostrada la ejecución con modelos reales ni el CI exacto al momento de esta actualización. No se ejecutó ningún modelo pago ni se fusionó la PR.

**Pendiente:** observar las comprobaciones de GitHub del último SHA; probar con Pi y proveedores autorizados para `LIVE_AUTHENTICATED`; comparar casos A/B externos antes de declarar paridad. No cerrar `globalFull` solo por esta tanda.
