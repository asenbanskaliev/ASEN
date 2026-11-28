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

- T1 [S1–S4,S6–S7] M3 G03/P04: ensayo de reinicio de padre Pi tras escritura parcial, sin proveedor; inline; evidencia local obtenida; commit de esta unidad.
- T2 [S1–S4,S6–S7] M4: comprobar y cerrar las brechas G04–G06/P01/P06 que puedan validarse; ruta tras acotar cada unidad; commit pendiente.
- T3 [S4–S7] Consolidar, verificar y publicar M3/M4; coordinador E; commit pendiente.
- T4 [S1,S3,S6–S7] M5 G02/G07/CTX/P05; rama y reserva por definir; commit pendiente.
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
