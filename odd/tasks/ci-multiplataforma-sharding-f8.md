# F8 — Optimización verificable del CI multiplataforma de ASEN

**Estado: IMPLEMENTADO EN CÓDIGO / PENDIENTE CI EXACT-SHA.** No confundir un cambio de workflow con una ejecución certificada. Rama del PR #45; no merge a main.

## Diagnóstico medido
Referencia: GitHub Actions CI run 41972127550, SHA d47f5911f76bd4b698336bb84d55521bf487ba60, jobs de test Ubuntu 127062567842, Windows 127062567862 y macOS 127062567741. Tiempos de npm test observados: Ubuntu 289,9 s, Windows aprox. 1632 s, macOS aprox. 642 s. La duración estaba dominada por bloques ejecutados secuencialmente, no por npm ci o auditorías rápidas.

## Diseño implementado
- Conserva planTestRuns y los chunks de Windows de cuatro archivos con --test-concurrency=1; no rebaja tests, timeouts de watchdog ni controles de seguridad.
- Distribución determinista LPT con pesos observados por chunk: 3 shards Windows, 2 macOS, 1 Ubuntu. Si cambia el número de archivos se redescubren todos y se asignan chunks nuevos con peso de reserva.
- Los seis runners usan el SHA exacto y ejecutan únicamente su subconjunto. Los tests afectados por carreras de procesos siguen serializados dentro de cada chunk y físicamente aislados por runner. El resto de controles por OS permanece en el primer shard; preparar objetos Git congelados sigue en los seis.
- Cada shard escribe un recibo JSON solamente después de npm test PASS. Un gate final descarga exclusivamente artefactos de la misma ejecución y SHA y comprueba exactamente seis recibos, identidad de OS/shard, lista de chunks, ausencia de duplicados y presencia exacta de todos los archivos de prueba por OS. Si falta un job o se cancela un shard, el gate falla.
- npm test local, sin variables de shard, conserva ejecución completa tradicional. No hay uso de proveedor ni permiso Writer en este cambio.

## Validación y objetivos
1. Pruebas de planificador y recibos: detectar shard faltante/repetido, SHA incorrecto, archivos omitidos/duplicados, orden determinista, aislamiento de Windows y entorno inválido.
2. Typecheck, suite y audits en GitHub para SHA publicado. Revisar el gate test-shard-coverage y los seis artefactos. No declarar éxito únicamente por YAML correcto.
3. Medir tiempo real y consumo de runners frente a baseline de 27,2 min Windows y 10,7 min macOS. Objetivo orientativo: unos 10–13 min de ruta crítica, condicionado por colas y variación de tests.
4. Si hay fallos, corregir en una sola tanda sin eliminar pruebas. Mantener Release Gate, F5, R4 automático y aceptaciones Pi independientes.
5. No activar selección parcial por cambios ni marcar EF-703 como FULL hasta tener una ejecución global correcta y el resto de evidencias canónicas.

**Restricciones:** no se cambia main, no se conceden permisos Writer, no se modifican recibos A/B C01–C20 y ningún PASS de otro SHA se hereda.
