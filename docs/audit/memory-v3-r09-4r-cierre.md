# Cierre de memoria v3 — auditoría 4R de R09

Fecha: 2026-10-05
Rama: `feat/engram-v3-memory-parity`
PR de verificación: #31
Base de referencia: core `15a2f78885d7ad8ced23b2d1d88383e9bb472c17`; Pi `ce51810bd351f397e49728d6a5be81679cf18554`.

## Regla de cierre

Esta matriz no sustituye los contratos SOURCE_INSPECTED ni convierte pruebas sintéticas en equivalencia total. Un estado CERRADO significa únicamente que el alcance admitido de ASEN tiene implementación y evidencia ejecutable suficiente. PARCIAL conserva cualquier obligación que dependa de integración real, servicio externo o superficie no admitida.

## 4R

1. **Revisar:** contrastar contrato, implementación, pruebas y evidencia remota.
2. **Reproducir:** exigir una prueba determinista o recorrido autorizado para cada comportamiento admitido.
3. **Reparar:** corregir el hueco sin ampliar silenciosamente el alcance.
4. **Revalidar:** ejecutar comprobaciones enfocadas y después CI multiplataforma sobre el mismo HEAD.

## Matriz final de 18 familias

| Familia | Estado R09 | Evidencia ASEN | Límite pendiente |
|---|---|---|---|
| E3-01 contrato y procedencia | CERRADO | manifiestos fijados y `audit:memory-parity` | la inspección de fuente no es prueba de ejecución |
| E3-02 almacenamiento/migraciones | CERRADO | migraciones, persistencia, durabilidad, rollback y CI multiplataforma | diferencia futura de esquema documentada |
| E3-03 identidad de proyecto | CERRADO | resolución explícita/config/Git/hijo/directorio y ambigüedad sintética | no implica autenticación |
| E3-04 sesiones/continuación | CERRADO | registro, fin, continuación idempotente, carrera y reinicio | host externo no demostrado |
| E3-05 observaciones | CERRADO | admisión, revisión, deduplicación, actualización, borrado, pin y privacidad | alcance admitido local |
| E3-06 búsqueda/contexto | CERRADO | búsqueda acotada, aislamiento, vistas previas Unicode y contexto | no afirma equivalencia de todos los clientes |
| E3-07 resumen/captura | PARCIAL | extracción curada y resumen único al cierre | compactación real de Pi/modelo no demostrada |
| E3-08 relaciones/revisión | CERRADO | relaciones tipadas, aislamiento, negativos y revisión idempotente | no se afirma semántica externa no admitida |
| E3-09 momento de integración | PARCIAL | cierre, reinicio, recuperación y biblioteca local | ciclo completo de host Pi real pendiente |
| E3-10 herramientas/ciclo Pi | PARCIAL | superficies locales y recorrido E2E preparado | prueba Pi Free específica requiere ejecución autorizada |
| E3-11 cierre/fallos/reanudación | CERRADO | resumen único, reconciliación unknown y preservación de respuesta | sin afirmar compactación real |
| E3-12 doctor/copia/reparación | CERRADO | integrity check y copia previa a reparación en almacén temporal | reparación automática de almacén real prohibida |
| E3-13 export/import/sync Git | CERRADO | export/import sin pérdida, rechazo atómico y sync reanudable/corrupto | sin push/publicación de red |
| E3-14 Cloud/autosync | NO APLICA | decisión explícita de arquitectura: la memoria de ASEN será local | Cloud queda fuera del producto y no bloquea R09 |
| E3-15 interfaces externas | PARCIAL | biblioteca local acotada | CLI/HTTP/MCP completos no demostrados |
| E3-16 vistas/clientes opcionales | PARCIAL | no requerido para núcleo local | TUI/dashboard/Obsidian no demostrados |
| E3-17 runtime/plataformas | CERRADO para paquete actual | CI Ubuntu 24.04, macOS y Windows en PR #31 | no equivale a distribución standalone |
| E3-18 verificación independiente | PARCIAL | CI, auditorías, reinicios, concurrencia, privacidad y corrupción sintética | Pi Free real pendiente; Cloud no aplica |

## Resultado 4R

El núcleo local admitido R01–R08 dispone de evidencia sintética y remota. El PR #31, HEAD `54914a7f21eb62da3c0e75966b03ea8bb91b2b3f`, pasó CI, Phase 0 Architecture y Release Gate en las plataformas configuradas. La prueba `Memory Pi Free E2E` no se ejecutó en ese PR porque su workflow actual responde a `push` y `workflow_dispatch`, no a `pull_request`.

El histórico timeout de 180 segundos del `npm test` independiente **no se declara resuelto**. Que `npm run check` haya pasado en CI no borra esa evidencia histórica.

## Decisión de cierre

- R01–R06: cierre del alcance admitido respaldado por las pruebas existentes.
- R07: implementación local cerrada; equivalencia de compactación Pi/modelo permanece PARCIAL.
- R08: cierre del alcance local admitido, incluido sync reanudable; no incluye red/push. Cloud no aplica por decisión de arquitectura.
- R09: **NO CERRADO todavía**. Para cerrarlo honestamente faltan:
  1. ejecutar la prueba Pi Free de memoria sobre el candidato final, si el proveedor/secretos están disponibles;
  2. revalidar el HEAD final después de esta evidencia con CI multiplataforma;
  3. conservar como PARCIAL, no como fallo, las superficies externas/optativas aplicables no implementadas o no autorizadas; Cloud se clasifica como NO APLICA;
  4. no declarar resuelto el timeout histórico sin una ejecución específica que lo pruebe.

No autoriza merge, release, publicación, reparación de datos reales ni operaciones de red.
