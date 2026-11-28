# ASEN: continuación local de las megatandas

Candidato inicial: PR #163, `7b8c727bd7db21f80596a514a7ea5bc25f6ec3ee`. Registro vigente en `coordination/asen-megatandas-20261125`.
Plan rector: `odd/tasks/INDEX.md`. `globalFull:false`.

## Specs

- S1: «Completar M3, M4, M5 y M6 de forma autónoma, preservando M1 y M2.»
- S2: «Comienza comprobando la PR #163 y continúa por los requisitos pendientes de M3 y M4.»
- S3: «Trabaja mediante megatandas y ODD + TDD.»
- S4: «Agrupa las implementaciones antes de ejecutar las pruebas completas.»
- S5: «Publica los cambios en GitHub.» «Revisa CI, Release Gate y CodeRabbit.»
- S6: «Guarda el progreso para poder continuar tras cualquier interrupción.»
- S7: «No modifiques main ni dupliques desarrollos.» «Respeta las autorizaciones y los límites de consumo NVIDIA.»

## Tasks

- T1 [S1–S4,S6–S7] M3 G03/P04: ensayo de reinicio de padre Pi tras escritura parcial, sin proveedor; inline; evidencia local obtenida; `9eadc6d3`.
- T2 [S1–S4,S6–S7] M4 G05/P06 parcial: bloquear rejuicio de Todo Fix sin linaje verificable; worker y verificador independiente; `5100fb01`, consolidado `b344b54a`.
- T3 [S4–S7] Publicar y verificar las tandas parciales M3/M4; coordinador E; `08b72241` publicado; `b0959476` corrige la ayuda histórica.
- T6 [S1–S4,S6–S7] M3/M4 pendientes: matriz G04/P01 `d7fb89e5`, acuse M3 `7d137c7b`, vista ordinaria G06 `c2d09243`; quedan Verifier, linaje y límite durable G05/P06 y fronteras restantes G03/P04.
- T4 [S1,S3,S6–S7] M5 G02/G07/CTX/P05; costes `20af9866`, comparador sintético `6fc98ef2` y ensayo pareado de runtime local `c4ddd1e0`. Faltan mediciones reales de modelos y CTX.
- T5 [S1,S3,S5–S7] M6: aceptación integral y límites de la evidencia; rama y reserva por definir; commit pendiente.

## Log

### L1

Actúa como coordinador técnico y desarrollador autónomo del proyecto ASEN.

Repositorio: https://github.com/asenbanskaliev/ASEN
Carpeta local: C:\ASEN

Lee y aplica íntegramente las instrucciones del traspaso mediante estos comandos:

```
git fetch origin

git show origin/coordination/asen-megatandas-20261125:coordination/continuacion-local-pi.md

git show origin/coordination/asen-megatandas-20261125:coordination/megatandas.json
```

**Misión:**

Completar M3, M4, M5 y M6 de forma autónoma, preservando M1 y M2.

- Audita el código existente antes de implementar.
- Trabaja mediante megatandas y ODD + TDD.
- Utiliza hasta dos subagentes en paralelo, con ramas y carpetas independientes.
- Agrupa las implementaciones antes de ejecutar las pruebas completas.
- Corrige los errores en local.
- Publica los cambios en GitHub.
- Revisa CI, Release Gate y CodeRabbit.
- Guarda el progreso para poder continuar tras cualquier interrupción.
- Trabaja siempre en español.
- No modifiques main ni dupliques desarrollos.
- Respeta las autorizaciones y los límites de consumo NVIDIA.

Comienza comprobando la PR #163 y continúa por los requisitos pendientes de M3 y M4.

No te limites a elaborar planes. Implementa, prueba, corrige y continúa hasta completar los objetivos pendientes.

### L2

CI `46124949068` y Release Gate `46124949035` sin fallos en las puertas ejecutadas para `7b8c727b`. CodeRabbit omitido; respuesta con 6 pruebas correctas en `discussion_r4726268974`, sin resolver el hilo. `npm run check:fast`: 36 correctas y 1 omitida. Reserva M3 `pi-local-E-M3-g2-writer-restart-7b8c727b` publicada en `4177976c`. La auditoría estática distinguió el reinicio de Pi RPC (solo lectura), la cuarentena de Writer (fixture) y el límite de rejuicio dual sin consumidor de producción encontrado. Ningún ensayo con NVIDIA.

### L3

T1: RED `job-11` falló por ausencia de la escritura parcial. `job-10` detectó un alias de ruta Windows; `job-12` detectó una expectativa errónea (`null` público para alcance ajeno). GREEN `job-13`: 4 correctas, 1 omitida por ser POSIX, 0 fallos. Padre Pi 1.6 RPC terminado y reiniciado de verdad; con un Writer en cola y otro iniciado por un fixture sin proveedor, se conservaron bytes, commit y diario de avisos, sin nuevo despacho ni historial duplicado. No acredita admisión Writer real, todas las fronteras de P04 ni aceptación M3 integral.

### L4

T2: primer alcance no implementable con el formato histórico del informe; el Todo sí tiene `fixSource`, pero el informe no conserva hallazgos congelados ni dicta cada resolución. El segundo alcance bloquea el camino ambiguo antes de consultar perfiles. RED 1, GREEN 0; verificador `mx077fjz-4-h9u9` favorable a la protección parcial. `job-17` reproduce fallo Windows de ruta en base y cambio; con TEMP largo nativo, `job-18` dio 24 correctas en el cambio y salida 0 en la base. `job-19` dio 17 correctas para comando y ayuda. `job-21` comparó stdout, stderr y código de salida idénticos para cuatro modos de Todo no modificados. Sin llamadas a proveedores.

### L5

T6, auditoría `mx07h3xd-5-aixv`: el servicio interno ya contempla 1/2/3 identidades para la doble revisión, pero el comando público `asen_plan_resume_batch` no tiene esa matriz. El candidato de prueba es `tests/native-partition-flow.test.ts`, lote exacto con recibo e integración denegada; permite contrastar modo proporcional, doble insuficiente, alias canónico y diálogo de doble suficiente sin ejecutar modelos. El Verifier de riesgo nombrado necesita una comprobación canónica separada en el flujo E3; el resultado del lote nativo no la acredita.

### L6

`job-20`: `check:fast`, `build`, import cycles y typecheck correctos; la suite local frenó con 1 fallo en `tests/lifecycle-applicability.test.ts:163`. El test compara una expresión regular que incluye `git` contra un JSON con rutas del candidato. El árbol se había creado debajo de `.git`, y esa cadena aparecía dos veces, sin que cambiara ningún permiso. Se movió mediante `git worktree move` a `C:/ASEN/worktrees/pr163` conservando rama, commits y dependencias, sin modificar el test ni `main`.

### L7

`08b72241`: lifecycle 15/15 tras mover el árbol; las siete auditorías pasaron. La suite local no quedó verde: Pi nativo M2 `0xC0000409` con proveedor simulado, idéntico en base y candidato (`job-25`). La PR #163 se actualizó; Release Gate `46133172796` correcto. El control Pi `46133172744` y cuatro shards CI detectaron que la ayuda añadida cambió la salida exacta histórica. RED `job-33`; `b0959476` preserva la salida sin argumentos y mantiene la nota en `help`. GREEN: 97 pruebas de compatibilidad, 7 de UI, typecheck y fachada Pi correctos. CodeRabbit omitido e hilo histórico abierto.

### L8

G04/P01 `d7fb89e5`: matriz pública adicional sin proveedor. El modo proporcional separa el consentimiento de integración; el dual bloquea identidades insuficientes o alias del autor; con tres identidades válidas muestra el candidato y los dos jueces, y se deniega antes de transporte. No prueba independencia real ni el camino del Verifier E3. G06 se acota al contrato de rutas: staging ya rechaza sensibles cambiadas antes de blobs; el Verifier lee el repo del proyecto y la vista completa merece una comprobación separada para sensibles ya rastreadas. G06 no exige reescribir contenido de archivos permitidos. M5 auditado en solo lectura: falta prueba pública de coste cero versus desconocido y evidencia pareada P05/CTX. `globalFull:false`.

Validación estándar: `job-41` pasó ciclos, typecheck y las 8 pruebas de `tests/native-partition-flow.test.ts`, sin omisiones. Las menciones Git a un lock corresponden al negativo ya existente. No se repitió la suite completa local tras el fallo reproducido en el SHA base.

### L9

En `3904bed0` pasaron CI `46135817672` y Release Gate `46135817554`. CodeRabbit señaló la ruta Docker raíz (`4726622134`); la corrección exacta está en `91e34d64`, con 88 pruebas correctas y 2 omisiones POSIX, más verificación independiente y diferencial. CodeRabbit confirmó el cambio en `4726756449`, sin ejecutar pruebas ni resolver el hilo. Release Gate `46139246770` pasó; CI `46139246834` falló porque faltaba actualizar el hash de `path-safety.ts`. RED local reproducido; `ae0d41af` actualiza solo ese hash, con los siete assets verificados y sin alterar guardas. Las vistas exactas y el Verifier de G06 siguen abiertos: no se materializaron archivos sensibles rastreados para probar esa brecha.

### L10

M3 `7d137c7b`: la TUI simulada se vuelve a registrar entre inspección y acuse; conserva IDs y diario, rechaza inspección anterior y no repite avisos o despachos. Es otra frontera del diario real, no una caída de TUI nativa ni prueba de consentimiento humano. M5/P05 `6fc98ef2`: `node --import tsx scripts/agent-flow-asen-scaling.ts <synthetic-pair.json>`. El objeto debe contener `observations`: dos filas con `system:"asen"`, `synthetic:true`, `requirementPassed:true`, `runId` distinto, `workerCount` 1 y 2, y `durationMs` positivo finito. Ambas deben compartir `commit` (SHA hexadecimal completo de 40 caracteres) y `taskDigest`, `toolsDigest`, `permissionsDigest`, `configDigest` (SHA-256 hexadecimal de 64 caracteres). Devuelve delta `t1−t2`, razón `t1/t2`, `costUsd:null`, `costConclusion:"unknown"` y `acceptance:"not-accepted"`. Sin proveedor, datos reales, recibo ni afirmación de mejora; rechaza 3 y 4 Workers. `globalFull:false`.

### L11

`9a45d980` se publicó con 142/142 pruebas locales. Pasaron CI `46141315723`, Release Gate `46141315701`, Pi runtime `46141315732` y check de CodeRabbit, sin hilos abiertos. M6: se revalidaron individualmente los 12 recibos Pi 1.2.0 de Linux, Windows y macOS (artefacto agregado `15261184583`); punto 18 listo para auditoría independiente, puntos 16/17 bloqueados, `globalFull:false`. El caso P04 de terminal recuperado quedó sin publicar (registro `db6389e9`): fallos variables antes o después de la reconciliación, sin causa estable; diff preservado.

### L12

G06 `c2d09243`: revisión ordinaria y corrección materializan solo los archivos regulares cambiados autorizados. Se verifica localmente cada blob por bytes antes de descartar los omitidos, sin codificarlos en el manifiesto, copiarlos a la vista ni enviarlos al revisor. No se cambian árbol, recibo, límites, preparación de vista completa ni rechazo de enlaces/gitlinks. RED/GREEN público con fixture sintético; revisión independiente inicialmente detectó la comprobación de metadatos insuficiente, corregida y rerrevisada (5/5). Verificación G06 del Verifier y aceptación real quedan abiertas.

### L13

`0ce7708e`: CI `46145560859`, Release Gate `46145560946` y CodeRabbit correctos para el SHA exacto, sin hilos abiertos. M5 `c4ddd1e0` ejecutó la misma carga de dos Explorers sintéticos con una y dos plazas. En `job-101` se observaron picos 1 y 2, solapamiento 0 y 4,17 ms, dos terminales exactos por corrida y ninguna repetición. Typecheck y batería M5: 16/16, sin omisiones. Es una observación del runtime local con barreras de prueba, no una medición de Pi, inferencia, CTX, calidad de modelo o ahorro. Coste desconocido, `globalFull:false`.

M4 identidad observada: aún no se integra. Las 26 pruebas funcionales pasaron en local, pero la inspección de seguridad detectó que el lector del anexo no liga la preparación de la ruta al descriptor abierto. El HMAC no evita lecturas de rutas sustituidas. Falta también justificar el límite de anexos huérfanos. No se modifican recibos históricos ni permisos en esta tanda.
