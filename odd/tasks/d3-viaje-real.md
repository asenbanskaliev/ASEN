# Preparación del viaje real D3

Issue: https://github.com/asenbanskaliev/ASEN/issues/33. PR de trabajo: #32.

## Política propuesta

`.asen/rdd-policy.json` activa revisión y exige `status:approved`, etiqueta ya requerida por la inspección ASEN. La política describe requisitos; no concede autoridad. El issue no se autoaprueba. El usuario autorizó preparar esta propuesta, no fusionar el PR #32.

## Incorporación pendiente

El cambio propuesto para main contiene exclusivamente las nueve líneas de `.asen/rdd-policy.json`; no incorpora código ni tracker. Requiere autorización expresa para main y aprobación humana del issue. No se ha creado otra rama ni fusionado nada.

## Selección de reproducción

Los cuatro defectos del issue se observaron en `f605dcbef3197bd62b6644c847e5cce34dddac64` y se repararon en `b465ff816713603fa4133921182a12ca524d4c9c`. El binder no existe en el main consultado `e67d2618f466ecee757a519e1b68049588a2db1e` (GitHub 404). No constituyen una reproducción sobre main. Hace falta un defecto real de main aprobado para el viaje; no se introducirá uno artificial ni se moverá el base para eludir D2.

## Ejecución después de resolver los requisitos

1. Consultar de nuevo main, política exacta, issue abierto aprobado y todos los PR relacionados, con paginación completa y sin inferir conflictos.
2. Usar la ruta autorizada de inspección ASEN; no fabricar snapshots ni autoridad RDD.
3. Crear un candidato limpio hijo directo del main observado, solo con tests del defecto real y controles negativos. No iniciar D4 ni mezclar implementación correctiva con reproducción.
4. Ejecutar dos observaciones deterministas; ligar el comando completo y resultado al candidato, consumir procedencia una sola vez y exigir fallo cerrado.
5. Registrar viaje, rollback, incertidumbres, hashes y presupuesto; obtener HIGH independiente del candidato exacto. Cerrar el tracker en commit separado solo si satisface D3.

## Límites observados

La política de rama es preparación, no política observada en main. El issue real no convierte las pruebas sintéticas anteriores en viaje real. No se ha ejecutado la integración original ni emitido revisión nativa. Pi Free/OpenRouter y CI remoto siguen diferidos; no se usa un modelo de pago. El presupuesto completo se recalcula antes de publicar.
