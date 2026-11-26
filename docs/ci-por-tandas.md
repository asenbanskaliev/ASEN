# Pruebas de ASEN por tandas

## Objetivo
Reducir la espera entre cambios sin eliminar las pruebas completas ni reutilizar
evidencias de una revisión anterior.

## Durante el desarrollo
- Cada apertura o actualización de una PR ejecuta **CI rápida** en Linux: identidad
  exacta del commit, tipos, pruebas de contratos esenciales y aislamiento.
- La PR permanece **en borrador** mientras se trabaja. No se integra al
  destino definitivo con solo pruebas rápidas.
- Los cambios se agrupan por unidad y se publican como tanda.

## Cuando la tanda está lista
- Marcar la PR **Lista para revisión** dispara **CI completa** y
  **Release Gate** en Linux, Windows y macOS. Cada cambio posterior de una
  PR ya lista también repite el cierre sobre su SHA nuevo, sin reutilizar el anterior.
- La etiqueta `validacion-completa` también dispara la validación completa.
- Cualquier otra etiqueta vuelve a ejecutar los controles obligatorios, para impedir
  que una comprobación omitida aparezca como aprobada. Evitar etiquetas innecesarias.
- El cierre se acredita solo si los trabajos correspondientes al **mismo SHA**
  finalizan correctamente y las revisiones independientes requeridas están hechas.
- Windows usa cuatro grupos en paralelo en vez de tres. La comprobación
  `test-shard-coverage` exige siete recibos (1 Linux + 4 Windows + 2 macOS)
  con todos los archivos y sin duplicados.

## Si hay más cambios después del cierre
- No reutilizar los resultados del commit anterior.
- Para continuar desarrollando muchas correcciones, volver primero a **borrador**.
- Si se modifica una PR ya lista, **CI completa se relanza para ese SHA**.
- Volver a marcar la PR lista cuando termine la nueva tanda.
- Si ya está lista, usar `validacion-completa` para solicitar un cierre nuevo.
- Las etiquetas ajenas a `validacion-completa` no cancelan una validación activa,
  pero tampoco pueden sustituirla por un resultado omitido.
- **No fusionar** mientras falte la CI completa del SHA nuevo.

## Seguridad y proveedores
- La CI rápida y la CI completa ordinaria no autorizan llamadas pagadas.
- Ninguna prueba `skipped` o `unknown` equivale a `success`.
- Mantener las autorizaciones independientes, la protección de `main` y
  `globalFull:false` hasta que existan las evidencias de aceptación exigidas.
- Cualquier prueba real NVIDIA requiere su propia autorización y controles
  exactos. No repetir una llamada ante un fallo desconocido.
