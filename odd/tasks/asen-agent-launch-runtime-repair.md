# ASEN — Auditoría y reparación del lanzamiento de agentes (2026-11-15)

## Alcance y baseline

- Rama origen: `feat/t12-integrated-acceptance-merge`.
- Baseline anterior: `9529b6c16a78bf94d46a1de30204e7f57245357b`.
- HEAD investigado: `5b00627029d82c694bce8e7299b7de2153c35d7c`.
- Cambio reciente: 7 commits, incluidos `768bc662` (presupuestos Pi) y `5b006270` (traslado de 106 módulos).
- Rama de corrección: `fix/agent-launch-runtime-migration-20261115`.
- No se autoriza una fusión a `main`. Los intentos nativos fallidos del usuario son hechos históricos y **no se reintentan**.

## Flujo real de un agente

`src/cli.ts` inicia Pi, `extensions/asen.ts` registra `asen_agent_start` y prepara `AgentRuntime` con `PiProcessRunner`; `AgentRuntime.startReadOnly` hace la inserción durable en `agents.json` y despacha a `Dispatcher`. El runner resuelve el ejecutable real `node_modules/@earendil-works/pi-coding-agent/dist/cli.js`, crea un directorio privado con `extensions/authority.ts` y sus imports con digest fijado, inicia el proceso Pi, exige `get_commands` con la extensión exacta y **sólo entonces** envía el prompt. La finalización necesita respuesta correlacionada y, cuando hay fallback, `agent_settled`.

Los tests de `AgentRuntime` con runners simulados prueban la coordinación, pero **no** prueban que el binario nativo de Pi se inicie correctamente en el host de usuario. Los CI generales y Release Gate verifican otras propiedades; su color verde no constituye una sesión real de agente con proveedor.

## Hallazgos confirmados con CI

| ID | Severidad | Causa | Síntoma | Reparación |
| --- | --- | --- | --- | --- |
| AR-01 | P1 | 106 módulos redistribuidos sin actualizar 19 rutas en `registry/parity/ecosystem-claims-v1.json` | ECO-05, 06, 07, 09, 10, 11, 12, 13 y 14 fallan por `invalid implementation paths` | Rutas de implementación reconciliadas con los renombres Git; sin modificar la validez de las evidencias |
| AR-02 | P1 | Comprobantes EF mantienen cuatro rutas antiguas | `audit:ef-plan` detiene tests en EF-103 y después EF-202 | EF-103, EF-202, EF-301 y EF-602 apuntan a los módulos trasladados; SHA y CI históricos conservados |
| AR-03 | P1 | Test del paquete usa `dist/runtime/home-backup.js` después del traslado a `lifecycle/` | T09 `ERR_MODULE_NOT_FOUND` en macOS, Release Gate FAIL | Import corregido a `dist/runtime/lifecycle/home-backup.js` |
| AR-04 | P1 | Documento comparativo nuevo, sin identificación de procedencia para escáner upstream | Phase 0 Architecture FAIL | Se fija sólo la ruta literal del documento de arquitectura, sin excluir código fuente ni permitir nuevos imports |
| AR-05 | P2 | Test de CLI dependía de `dist/cli.js`, ausente antes del build en la suite de tests | `tests/cli-setup.test.ts` falla en macOS | Ejecutar `src/cli.ts` bajo `tsx`; Release Gate sigue comprobando por separado el paquete compilado |

## Incidente nativo de Windows: estado del diagnóstico

`odd/tasks/asen-native-agent-crash-diagnostics.md` documenta dos intentos reales de agentes verificadores que terminaron en el código decimal `3221226505`, Windows NTSTATUS `0xC0000409`, antes de que se acreditara un turno de modelo, escritura o resultado. Es un *fail-fast* del proceso nativo; el código de salida **no identifica** el módulo responsable. No existe aún un informe WER de módulo/stack, ni un stderr acotado previo al cierre. La hipótesis de error de Pi, Node, un addon nativo o configuración del equipo permanece **sin confirmar**; tampoco se ha demostrado causalidad con los movimientos de archivos, que son posteriores al incidente.

**Nuevo control no invasivo:** `tests/pi-native-agent-preflight.test.ts` arranca el CLI exacto del ejecutor con `PI_OFFLINE=1` y un home temporal, sin clave API, sin herramienta de escritura y enviando únicamente `get_commands`. Compara arranque sin extensión frente a arranque con el mismo paquete de autoridad ASEN que recibe el hijo; comprueba registro del comando `asen-authority-status`. No envía nunca `prompt`. Ante error sólo publica fase, código decimal y hexadecimal, señal y presencia de stderr; nunca contenido, credenciales o conversación.

Posibles resultados:
- **Falla Pi bare:** investigar ejecutable, Node y sistema Windows, no el coordinador ASEN.
- **Pasa Pi bare, falla authority:** investigar carga de extensión o dependencia, versión Pi y ruta del home.
- **Pasan ambos:** sólo demuestra arranque/RPC del binario, no un agente que completa una tarea con modelo; continuar investigando el host afectado con eventos Windows WER y el mismo entorno autorizado.
- **CI Windows pasa y host local falla:** comparar diferencias de versión, arquitectura, configuración, seguridad del endpoint y WER; no atribuir el fallo al refactor sin pruebas.

## Criterios de cierre de esta reparación

1. `npm run typecheck` sin errores.
2. `npm run audit:ef-plan` válido en el SHA propuesto.
3. `npm run audit:ecosystem` válido (sin ascender afirmaciones PARTIAL a FULL).
4. `npm run audit:upstream-boundary` válido y sin excepciones ejecutables.
5. Pruebas `pi-native-agent-preflight` y `cli-setup` en CI real Linux/macOS/Windows, sin proveedor.
6. Release Gate 3 plataformas PASS, incluyendo el paquete T09.
7. CI completo y test-shard-coverage/R4 exact SHA.
8. **Aparte del cierre de rutas:** la estabilidad del lanzamiento en el Windows afectado requiere capturar el módulo WER real o una reproducción del fallo nativo con Pi; no confundir una prueba proveedor-free en CI con solución demostrada del error local.

La auditoría no realiza merges, no repite las dos ejecuciones anteriores y conserva todas las barreras de permisos/consentimiento. `globalFull:false` permanece.
