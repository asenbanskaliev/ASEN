# Cierre de memoria v3 — auditoría 4R de R09

Fecha: 2026-10-05
PR de verificación: #31
Base de referencia: contratos de memoria v3 fijados en `registry/parity/` y versión de Pi fijada por el proyecto.

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
| E3-07 resumen/captura | CERRADO local | extracción curada, resumen único e idempotente al cierre y rollback de cierre inválido | compactación real de Pi/modelo queda para la evidencia E2E, no para el contrato local |
| E3-08 relaciones/revisión | CERRADO | relaciones tipadas, aislamiento, negativos y revisión idempotente | no se afirma semántica externa no admitida |
| E3-09 momento de integración | CERRADO local | cierre, reinicio, recuperación, continuidad y biblioteca local | ciclo Pi real se valida separadamente en E3-10/E3-18 |
| E3-10 herramientas/ciclo Pi | CERRADO | recorrido E2E real con Pi y OpenRouter: reinicio, recuperación de memoria y recuerdo correcto del token sintético | validado con proveedor/modelo real; `llm7` permanece temporalmente limitado por cuota |
| E3-11 cierre/fallos/reanudación | CERRADO | resumen único, reconciliación unknown y preservación de respuesta | sin afirmar compactación real |
| E3-12 doctor/copia/reparación | CERRADO | integrity check y copia previa a reparación en almacén temporal | reparación automática de almacén real prohibida |
| E3-13 export/import/sync Git | CERRADO | export/import conserva sesiones, observaciones activas, relaciones, resúmenes y borrados suaves/duros sin reactivar datos; rechazo atómico y sync reanudable/corrupto | sin push/publicación de red |
| E3-14 Cloud/autosync | NO APLICA | decisión explícita de arquitectura: la memoria de ASEN será local | Cloud queda fuera del producto y no bloquea R09 |
| E3-15 interfaces externas | NO APLICA al núcleo local | biblioteca local acotada y aislada por proyecto | CLI/HTTP/MCP no forman parte del cierre local; requerirían decisión de producto separada |
| E3-16 vistas/clientes opcionales | NO APLICA al núcleo local | no requerido para la memoria local | cualquier cliente adicional requerirá alcance y evidencia propios |
| E3-17 runtime/plataformas | CERRADO para paquete actual | CI Ubuntu 24.04, macOS y Windows en PR #31 | no equivale a distribución standalone |
| E3-18 verificación independiente | CERRADO | CI, auditorías y E2E real con Pi + OpenRouter sobre el candidato exacto | Cloud no aplica; el fallo actual de `llm7` es únicamente de cuota externa |

## Resultado 4R

El candidato final verificado es `5f3a723208ca2ad861ed9d02290cf25c1f12b472`.

Evidencia remota sobre ese mismo HEAD:

- Phase 0 Architecture — PASS, run `37288725501`.
- CI — PASS, run `37288725522`.
- Release Gate — PASS, run `37288725495`.
- Memory OpenRouter E2E — PASS, run `37288725534`: Pi real reinicia el almacén sintético, recupera `COBALT-731` y el modelo real lo recuerda correctamente.
- Memory Pi Free E2E (`llm7`) — FAIL, run `37288725512`, exclusivamente por `429 quota_exceeded`; el contexto recuperado contiene correctamente `COBALT-731`. No se utiliza ese fallo externo como evidencia negativa del núcleo de memoria.
- Pi Free Smoke — `skipped`, run `37288725487`.

El histórico timeout de 180 segundos del `npm test` independiente **no se declara resuelto**. El CI final verde demuestra el candidato en los recorridos configurados, pero no borra esa evidencia histórica.

## Decisión de cierre

- R01–R06: CERRADOS para el alcance admitido.
- R07: CERRADO para el núcleo local: cierre, resumen, captura curada, reconciliación y preservación de respuesta.
- R08: CERRADO para el núcleo local: export/import con round-trip de borrados suaves/duros, vista previa de conflictos, diagnóstico/copia y sync reanudable. No incluye red/push. Cloud no aplica.
- R09: CERRADO para el **núcleo local, multiplataforma configurado e integración Pi/modelo probada** sobre el HEAD anterior. E3-10 y E3-18 quedan cerrados con el E2E real de OpenRouter. El bloqueo temporal de cuota de `llm7` no reabre el cierre.nterior. E3-10/E3-18 conservan como evidencia externa pendiente la prueba Pi Free específica; esto impide afirmar equivalencia de host/modelo o FULL global, pero no reabre el núcleo local.
- Interfaces/vistas opcionales y Cloud no son deuda de este cierre. Si se incorporan en el futuro necesitarán alcance y evidencia propios.
- El timeout histórico queda registrado como limitación histórica, no como evidencia de fallo del candidato final verificado.

Este cierre no autoriza merge, release, publicación, reparación de datos reales ni operaciones de red.
