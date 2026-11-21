# T06 — Revalidación tras el consentimiento del Worker

Fecha: 16/11/2026. PR #61. SHA anterior: `b00c48774a805d6cd3d8abe1c47654a68b3b684a`.

## Hallazgo confirmado
El supervisor creaba `validateExact`, pero el comando `/asen-worktrees supervise`
transmitía `validateParent` a `launchChildWorker`. El planificador tenía
controles adicionales, pero no repetía la comprobación completa de la
procedencia del lote al avanzar hacia el despacho.

## Cambio
Se entrega `validateExact` al despachador ya existente, sin crear permisos
ni mecanismos nuevos. Si una lectura de datos del hijo falla después de
reclamar el intento único del lote, el supervisor devuelve
`partial-needs-review` con los IDs iniciados y sin reintentos.

Se añaden pruebas negativas para el cambio de modelo posterior al
consentimiento y para errores de lectura durante el segundo Worker.

## Límites
La prueba es instrumentada; no acredita dos Writers Pi autenticados.
Sin llamadas a proveedores, sin permisos adicionales ni merge. T06 parcial,
`globalFull:false`. Validación CI del nuevo SHA pendiente.