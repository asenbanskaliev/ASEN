# F9 — Optimización del Release Gate multiplataforma

**Estado:** IMPLEMENTADO EN CÓDIGO / PENDIENTE DE VALIDACIÓN EXACT-SHA. No declarar PASS a partir del diseño.

## Diagnóstico y baseline

El Release Gate `41980435916`, SHA `8ab885fd71c55a1a0a16bcd68197ffeec52bc406`, cerró PASS en los tres OS. Sus jobs fueron: Ubuntu `127089041189` (aprox. 1:29), macOS `127089041430` (aprox. 2:03) y Windows `127089041338` (aprox. 4:02). Windows concentró más tiempo en el humo de paquete real T09 (~113 segundos), incluidos upgrade HTTPS firmado, rollback, SQLite WAL, backup/restore y recuperación tras terminación forzada.

## Cambios incluidos

- Reemplazar la instalación inicial mutable `npm install` por `npm ci --no-audit --no-fund` con caché npm en `actions/setup-node`. La caché es de paquetes y respeta `package-lock.json`; no restaura `node_modules` entre candidatos.
- Conservar `npm run build` por sistema operativo. En el Release Gate de PR y de `main`, el typecheck del SHA exacto ya es parte de CI; no duplicarlo en este workflow. En ramas `release/**` (donde CI no corre por evento push), mantener el typecheck propio, sin depender de otros workflows.
- Crear una sola vez un `.tgz` desde los artefactos compilados en **cada runner**, usando `npm pack --ignore-scripts --silent` para no lanzar otra compilación mediante el hook `prepack`. Reutilizar el archivo físico para `pi install` y `npm install` de su mismo OS. No compartir el `.tgz` entre sistemas ni entre commits; ruta y nombre se verifican antes de instalar.
- Emitir las duraciones reales internas de `scripts/t09-real-package-smoke.mjs` por fases de nombre fijo: instalación firmada, actualización/rollback por HTTPS, copia y recuperación SQLite, recuperación SIGKILL y desinstalación. Guardar recibo de fase de `PASS` o `FAIL` con OS y SHA, sin transcripción de modelo, credenciales ni ruta de usuario. El recibo se conserva como artefacto exact-SHA durante 14 días.
- Conservar el contenido de los smoke tests de T09, los recibos ECO-02A, las comprobaciones de Pi 1.2.0 y la matriz completa Ubuntu/Windows/macOS. No cambiar permisos Writer ni proveedor.

## Validación requerida

1. `node --check scripts/t09-real-package-smoke.mjs` y `node --import tsx --test tests/release-gate-optimization.test.ts`; typecheck, build, auditorías y suite CI en SHA exacto.
2. Release Gate PASS en los tres OS con el mismo SHA y tres artefactos `t09-phase-timings-*`. Inspeccionar que `npm pack` se ejecutó una sola vez por runner y los dos smoke tests instalaron el mismo candidato.
3. Comparar Windows `npm ci`, compilación, `verify:package-receipts`, empaquetado e instalación T09 con la baseline. Objetivo inicial orientativo de 2–3 minutos para Windows, sin garantizarlo antes de medir.
4. Si la duración T09 sigue dominando, investigar fases individualmente antes de considerar separar tareas en nuevos jobs. No eliminar pruebas de recuperación ni acortar sus timeouts para simular mejora.
5. No promocionar EF-703 ni FULL por resultados de rendimiento. Los controles completos del ODD conservan sus criterios propios.

**Límite:** F9 mejora orquestación y observabilidad del Release Gate; no cambia funciones del agente ni supone equivalencia funcional nueva.

## Corrección acotada del CI F8 detectada en el mismo seguimiento

La CI exact-SHA `41980435796` sobre `8ab885fd71c55a1a0a16bcd68197ffeec52bc406` cerró FAIL: cinco de seis shards de suite PASS; Windows shard 2 falló en `tests/pi-agent-runtime.test.ts`, en la espera de tres segundos de `authorized worker reached the runner`. El límite era un timeout de sincronización del **test** y no un requisito de latencia del Worker. Se amplía esa espera aislada a 10 segundos, conservando el control de identidad, alcance, autorización, ejecución única y estado. Ninguna prueba se omite; nueva validación exact-SHA pendiente. El fallo hace que `test-shard-coverage` se bloquee correctamente y no admita cobertura global incompleta.
