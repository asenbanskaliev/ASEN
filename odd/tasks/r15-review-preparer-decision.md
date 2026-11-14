# Decisión técnica R15 / UI-06 Review preparer

Estado: decisión preparada, implementación funcional no autorizada.

## Disposición del candidato actual

Candidato objetivo `sha256:a2d1b645...` queda explícitamente no revisado para este turno: la tarea actual es investigación y documentación de R15, no entrega de código ni cierre de candidato. No se inicia revisión nativa.

## Recomendación

Mantener R15 como bloqueador de owner/interface. No inventar productor, preparer, API, request ID ni contrato.

La arquitectura existente ya provee contratos genuinos:

- `src/delivery/work-unit-evidence.ts::recordCompletedWorkUnit`: consume un boundary listo y records evidencia.
- `src/delivery/work-unit-review-candidate.ts::recordWorkUnitReviewCandidate`: transforma el work unit completado en candidato y `claimWorkUnitReviewCandidate` evita consumo duplicado.
- `src/review/ordinary-review-controller.ts::prepareOrdinaryReview`: genera `requestId` determinista por hash de candidato + participantes; `bindOrdinaryReviewCheckout` verifica Git exacto/discreto.
- `src/review/ordinary-review-command.ts::registerOrdinaryReviewCommand`: mantiene una única instancia `pending: Map<string, OrdinaryReviewRequest>` dentro del closure.

El bloqueante es que no existe productor runtime observado para `recordCompletedWorkUnit`/`recordWorkUnitReviewCandidate`, y `createPiExtension` retiene solo `startSession`, descartando `review`. Por eso cualquier puente debe preservar exactamente esa misma instancia y su mapa privado; crear otro mapa/preparer/ID constituye nuevo contrato no autorizado.

## Evento real que debe generar revisión

El trigger legítimo no es un evento de UI ni un check suelto, sino el consumo de un work unit completado ya cerrado (`CompletedWorkUnit`) y la construcción válida del candidato (`WorkUnitReviewCandidate`). Sólo esos objetos marcados por las WeakSet internas son elegibles. No existe aún un llamador productivo en `src`/`extensions`.

## Componente propietario

El dueño del lifecycle debe ser el mismo productor del work unit completado. La extensión Pi (`extensions/asen.ts`) sólo es host/runtime y bridge; no es dueño de evidencia ni de Git.

## Instancia única del controller

`registerOrdinaryReviewCommand` ya garantiza una sola instancia via `const pending`. El bridge correcto es conservar `facade.review` como controller y usarlo exclusivamente, no recrearlo.

## Request ID

`prepareOrdinaryReview` deriva `requestId = sha256("asen.ordinary-review.preparation.v1\0" + JSON.stringify({candidate, participants}))`. Es determinista, no se inventa un formato adicional. El wiring no debe generar IDs alternativos.

## Vinculación segura a sesión/repositorio

`claimOrdinaryReviewRequest`, `bindOrdinaryReviewCheckout` y `showPreparedReviewCandidate` comprueban sesión, `cwd`, `realpath`, identidad HEAD/tree/parent, estado Git limpio y revalidan al renderizar. El candidate view es descriptivo y no consume autoridad nativa.

## Fallos, reintentos, cancelaciones, retiro

- Si `pending` no contiene el ID: error explícito; no se crea fallback.
- Si binding/check fails: la solicitud se retira o se consume según el código actual.
- Escapes en `showPreparedReviewCandidate` operan por scope check y cierran sin autorizar.
- No se reintenta automáticamente una solicitud fallida; debe prepararse otra genuina.

## Archivos/símbolos/pruebas necesarios para implementación futura

- Archivos: `extensions/asen.ts`, `src/delivery/work-unit-evidence.ts`, `src/delivery/work-unit-review-candidate.ts`, `src/review/ordinary-review-controller.ts`, `src/review/ordinary-review-command.ts`, `src/runtime/review-panel.ts`, `tests/review-panel.test.ts`, `tests/ordinary-review-command-ui.test.ts`, `tests/work-unit-review-candidate.test.ts`.
- Símbolos: `recordCompletedWorkUnit`, `recordWorkUnitReviewCandidate`, `claimWorkUnitReviewCandidate`, `prepareOrdinaryReview`, `bindOrdinaryReviewCheckout`, `registerOrdinaryReviewCommand`, `prepare`, `pending`.
- Pruebas RED iniciales: demostrar el trigger productivo o su ausencia; demostrar retención de una única instancia del controller; demostrar que `prepare` consume el candidato solo una vez; demostrar fallo si la sesión/repositorio cambian.

## Criterios de aceptación para una futura implementación

1. No se inventa productor ni ID.
2. Una única instancia closure-scoped del controller.
3. Prepare exitoso solo con `WorkUnitReviewCandidate` y `OrdinaryReviewInput` genuinos.
4. Bind/revalidate/scope checks pasan.
5. Fallos no autorizan entrega ni native RDD.
6. R19 sigue gate independiente; R18/R18 no se reabren.

## Investigación específica R15 — resolución del último bloqueo

Se inspeccionó el lifecycle de agentes, task tracking y la búsqueda global por `ReadyWorkUnitBoundary`, `recordCompletedWorkUnit` y `recordWorkUnitReviewCandidate`. Resultado: no existe productor productivo de un work unit completado fuera de tests. Las funciones y contracts son genuinos y testeados, pero ninguna ruta runtime los ejecuta.

Reference Shell v4.6.0 tampoco aporta un productor implícito: la evidencia de revisión sigue siendo candidate-only, descriptiva, sin autoridad nativa ni producer inventado.

Conclusión: R15 no puede implementarse sólo con contracts existentes. Requiere una decisión arquitectónica adicional: definir quién produce el boundary genuino desde commit/documento/checkpoint y cuándo publica el request ID. La alternativa mínima y recomendada es un puente explícito, dueño del work unit, que llame `recordCompletedWorkUnit` → `recordWorkUnitReviewCandidate` → `facade.review.prepare`, conservando exactamente la única closure instance. Sin ese producer, mantener API-only es la opción correcta.
