# T08/H4 — Recuperación estricta de artefactos Pi de solo lectura

Fecha: 16/11/2026. PR #61. Revisión del código sobre SHA `999518695d87d9f444cdd04982f29cfe60cc37aa`.

## Evidencia y motivo

La documentación RPC oficial establece que `agent_end` puede preceder a una recuperación, mientras que
`agent_settled` certifica que no quedan continuaciones automáticas. El adaptador de
artefactos existente exigía exactamente un fin de intento. No debe relajarse
globalmente: un Worker podría repetir efectos de escritura.

## Cambio acotado

- Se añade extracción estricta opcional de hasta ocho intentos correlacionados.
- Cada intento requiere `agent_start`, un mensaje final de asistente y
  `agent_end`; los intermedios tienen `willRetry:true` y el último `willRetry:false`.
- Una única respuesta RPC coincidente, un único `agent_settled` no abortado,
  orden válido, sin actividad posterior ni uso de herramientas son obligatorios.
- El último mensaje debe contener exactamente un texto final útil según el
  validador de artefactos ya existente. No se rescatan textos parciales.
- Para activar esta ruta, el llamador debe configurar explícitamente
  `PiArtifactRunner(...,{allowSettledReadOnlyRecovery:true})` y un
  `PiProcessRunner` con `requireFinalSettlement:true` y `noTools:true`.
- El adaptador rechaza Worker, superficies de escritura, permisos Writer y
  cadenas de modelos alternativos **antes de ejecutar Pi**.
- El comportamiento anterior sigue predeterminado. Ningún flujo de
  producción cambia a esta modalidad automáticamente.

## Pruebas y límites

Pruebas puras y negativas: `tests/pi-artifact-runner-recovery.test.ts`.
El CI del commit nuevo debe validarlas en los sistemas configurados.

No se realizaron llamadas a NVIDIA, no hay consentimiento de gasto y no se
reclama prueba autenticada de recuperación. Esta preparación parcial no
resuelve la recuperación con escrituras, el cierre global de Pi ni T08 FULL.
`globalFull:false`; sin reintentos ni merge.
