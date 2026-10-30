# Alcance renegociado para FULL local de T04/T05

Fecha de acuerdo: 2026-10-30. El usuario autorizó renegociar el alcance de FULL y completarlo. Este anexo define FULL únicamente para los contratos acotados de abajo; no reescribe los requisitos históricos S5/S6, no cambia el registro global de paridad, y no afirma equivalencia total con Reference Shell.

## Alcance de aceptación

### T04 — FULL del contrato local de recuperación de escritores autorizados

Incluye:

- Un escritor autorizado que queda interrumpido se recupera como `interrupted`, sin resultado inventado ni autoridad restaurada.
- La inspección valida sesión/proyecto/candidato/superficies, no muta archivos ni expone contenido privado.
- La reconciliación distingue no-escritura, bytes exactos y estado parcial/externo/HEAD cambiado; los resultados inciertos fallan cerrados.
- No existe replay automático. La continuación solo puede ser una operación nueva, con candidato y autorización explícita nuevos y de un solo uso.
- Las ediciones parciales permanecen para resolución explícita y la recuperación sobrevive reinicio del store.

Fuera de este FULL: interrupción de un proceso Pi/provider real, juicio de salida del modelo, compatibilidad del controlador histórico Pi 1.1 y prueba multiplataforma del host. El ciclo NVIDIA es evidencia separada y nunca asciende por sí mismo este estado.

### T05 — FULL del contrato público determinista de revisión exacta

Incluye el flujo público `/asen-review workspace` con un proveedor/revisor sustituible de prueba:

- Snapshot/tree y selección exactos; rutas fuera de alcance se rechazan antes del dispatch.
- Resultado ligado al candidato y al estado del workspace; deriva, identidad cambiada o sesión distinta invalida el resultado.
- El revisor no recibe autoridad de escritura; corrección limitada a findings y al scope original.
- Cancelación, interrupción, corrección inválida o fallo de limpieza no producen aprobación; los intentos válidos pueden volver a revisar el estado corregido.
- La aceptación explícita está separada del resultado del modelo y no concede commit, merge ni entrega.

Fuera de este FULL: autenticación/respuesta válida de un proveedor real, persistencia de la sesión pública de revisión tras crash/restart, sandbox de sistema operativo para ejecutar tests del candidato, y signoff R4 externo. El test executor actual no es un sandbox. Estos riesgos permanecen visibles y el FULL acotado no significa que T05 histórico S6 esté totalmente satisfecho.

## Evidencia requerida y ejecutada

El FULL acotado se admite solo con los tests provider-free existentes, enfocados en los contratos anteriores, typecheck/build y auditorías aplicables. En este checkout:

- T04: `eco06-interrupted-writer`, `authorized-write-recovery` y `authorized-job-retry` — 9/9 PASS.
- T05: `ordinary-review-workspace-flow`, `workspace-review-session` y `t05-nvidia-review-workflow` — 42/42 PASS.
- Typecheck y build — PASS; auditoría de parity y validación de metadata/claims del ecosistema — PASS.

El full check local en Node 26 falló en otras cinco pruebas; se conserva como limitación, no se declara verde. El SHA `dc80a9880136c4dd6199c2c00b9120a3c6f5896c` también tiene CI Windows fallido por contención del journal y gate Pi/NVIDIA omitido. Esos resultados bloquean el FULL amplio/multiplataforma, pero no invalidan los contratos deterministas que pasan sus tests enfocados. No se altera ni aumenta el límite de lock de 3 segundos.

## Estado y límites

Se puede declarar **T04 FULL (contrato local de recuperación)** y **T05 FULL (contrato público determinista de revisión)** al cumplir la evidencia anterior. No se debe cambiar las filas del registro global de paridad de PARTIAL a FULL ni declarar T04/T05 FULL bajo el alcance original S5/S6. Cualquier claim breve debe incluir el descriptor entre paréntesis o enlazar este alcance.

La contención Windows, el ciclo Pi/NVIDIA auténtico, el controlador Pi 1.1, la recuperación pública durable de T05, sandbox y revisión R4 externa quedan como deuda explícita para el FULL amplio. Sin provider/credits, publicación, commits ni mutación remota; solo pruebas locales provider-free autorizadas.
