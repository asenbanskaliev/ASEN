# Megatanda D — cierre técnico del flujo de agentes y regresiones globales

**Fecha:** 2026-11-19. **Rama:** `feat/flujo-de-agentes-20261115`; PR #61 en borrador.
**Alcance:** continuidad entre A (rutas), B (agentes y errores), C (revisión) y controles de aceptación; no se modifican pantallas ajenas al flujo.
**Estado:** correcciones implementadas y pruebas añadidas; el CI completo del SHA final y la comparación A/B autenticada son requisitos independientes. `globalFull:false`.

## 1. Auditoría: resultado verificable anterior

El commit base `061265997aed046e6239cebe707a3d094364f40c` tenía `Phase 0 Architecture: success`, `Pi 1.2 runtime evidence: success`, `Release Gate: success` y **CI: failure** (ejecución 44487559905). La matriz falló en Linux, macOS y Windows por tres pruebas idénticas de `tests/pi-agent-runtime.test.ts`:

1. **Dos contratos de lanzamiento desactualizados:** `asen_agent_start` incorporó `budgetExplorer` en A2, opcional y de lectura. Dos pruebas seguían esperando exactamente `prompt`, `root`, `todoId`, aunque el esquema real contiene también esa opción.
2. **Aviso de fallo de C:** la mejora de diagnóstico quitó del aviso de error las palabras `di «continúa»`; la prueba de entrega esperaba esa ruta natural hacia la revisión manual y terminaba por espera agotada.
3. **Cobertura bloqueada por los fallos anteriores:** `test-shard-coverage` rechazó correctamente una matriz incompleta. El rechazo no era una incidencia independiente.

**Diagnóstico:** compatibilidad rota por A/C en contratos públicos y mensaje; no se ha observado fuga de autoridad, nueva ejecución del proveedor ni error causado por B. No presentar un CI parcial en verde como aceptación de todas las plataformas.

## 2. Correcciones de bajo impacto

| Código | Intervención | Límite conservado |
| --- | --- | --- |
| D-01 | `tests/pi-agent-runtime.test.ts` incorpora `budgetExplorer` en dos comprobaciones de parámetros | La propiedad sigue siendo opcional; no añade `model`, `thinking`, permisos Writer ni autorización implícita |
| D-02 | `extensions/asen.ts` mantiene código de diagnóstico y recupera `di «continúa»` cuando un hijo falla | Continuar significa revisar la causa; **no vuelve a ejecutar automáticamente** el agente fallido |
| D-03 | `tests/megatanda-d-e2e-pi.test.ts` recorre el punto de entrada de ASEN con host Pi y modelo simulados | Dos tareas con dependencia; Explorer termina, Verifier espera, se exige recibo firmado y consentimiento verdadero |
| D-04 | `.github/workflows/ci.yml` introduce una comprobación temprana de regresiones | Reutiliza pruebas reales y ejecutor local sin red ni proveedor externo; CI general sigue siendo obligatorio |
| D-05 | Bitácora y matriz de aceptación en este archivo y `flujo-de-agentes.md` | `globalFull:false`, sin fusión ni autocorrección de escrituras |

## 3. Escenarios A/B de D y evidencias

| Caso | Camino correcto | Camino que debe bloquearse | Evidencia |
| --- | --- | --- | --- |
| D-01 | Lectura normal sin nuevo indicador | Indicador de presupuesto sin agotarlo | A2 + prueba del contrato público |
| D-02 | Aviso terminal entregado al padre correcto | Entrega dañada o padre desconectado | Prueba existente `pi-agent-runtime.test.ts` |
| D-03 | Sesión y proyecto coinciden | Identidad cambió durante un `await` | Pruebas de host y reconciliación existentes |
| D-04 | Tarea 1 finaliza y habilita tarea 2 | Tarea 2 se lanza antes de su dependencia | Nueva prueba D |
| D-05 | Verificador acaba y su Todo queda bloqueado | Dictamen libre autoaceptado | Nueva prueba D + EF-502/503 |
| D-06 | Recibo firmado, SHA/árbol actual y prueba positiva | Falta recibo, está manipulado, no corresponde a SHA o Git cambió | Nueva prueba D + pruebas de recibos existentes |
| D-07 | Confirmación humana `true` y explícita | `false`, diálogo interrumpido o texto ambiguo | Nueva prueba D + C |
| D-08 | Una aceptación y solo dos agentes ejecutados | Aceptación duplicada o nueva ejecución | Nueva prueba D |
| D-09 | Dos lecturas independientes se solapan | Workers con archivos superpuestos | Pruebas B + límites del supervisor |
| D-10 | Un fallo deja el Todo bloqueado y puede avanzar otro Explorer gratuito independiente | Escritura incierta, reintento o modelo de coste desconocido | Pruebas B + diagnóstico C |
| D-11 | Revisión con jueces independientes y observaciones visibles | Discrepancias escondidas, aceptación o Fix sin ODD nuevo | Pruebas C y Judgment Day |
| D-12 | Reinicio conserva evidencias y bloquea entregas inciertas | Repetición o fusión por el simple reinicio | Pruebas existentes de diario y recuperación |
| D-13 | Ejecuciones reales de proveedores con permiso y precio conocido | Modelos de pago no autorizados | **No se ejecutó ensayo externo en D** |
| D-14 | Dos Workers Pi de escritura y revisión independiente auténticos | Simulación confundida con ejecución real | **No demostrado por la nueva prueba D** |
| D-15 | Matriz Linux/macOS/Windows y publicación completas en un SHA | Usar controles de commits anteriores | **Pendiente de CI del SHA final** |

## 4. Cierre: reglas exactas

- **Cierre técnico D:** la prueba específica D, `tests/pi-agent-runtime.test.ts`, `typecheck`, arquitectura, Pi 1.2, CI completo en Linux/macOS/Windows, `test-shard-coverage` y `Release Gate` deben terminar en verde **para el mismo SHA**.
- **Cierre funcional completo:** comparar las rutas con la referencia 4.9.0 en sesiones Pi auténticas y proveedores previamente autorizados, incluyendo simultaneidad de dos Workers, cancelación, resultados, correcciones con consentimiento y coste observado. Estas pruebas **no** se han realizado en esta intervención.
- **Separación de estados:** `IMPLEMENTED`, `RUNTIME_WIRED`, `HOST_TESTED_SIMULATED`, `CI_EXACT_SHA`, `LIVE_AUTHENTICATED`, `AB_PARITY` y `FULL` no son equivalentes.
- **Sin regresiones de permisos:** Writer no se inicia con una señal de lectura, revisión no equivale a aceptación, los diarios inciertos no se reenvían solos y no se toca `main`.

## 5. Resultado de la intervención

La corrección directa de los tres fallos anteriores y el ensayo Pi de investigación → verificación → firma → aceptación están incorporados en el código de PR #61. **Este documento no atribuye estado PASS al SHA final sin el resultado de GitHub**. Dejar `globalFull:false` hasta demostrar la equivalencia real.
