# ASEN — R4 integrada: arquitectura de aceptación por evidencia

**Estado:** R4-01/02/03 implementadas, pendientes de CI exact-SHA. **No equivale a FULL.**
**Rama:** `feat/t12-integrated-acceptance-merge`; **PR:** #45. No merge ni modelos pagados.
**Fuente de verdad:** `equivalencia-funcional-agentes-full.md` y `anexo ODD de paridad de interfaz v4.6.0`.

## Alcance y estado

| Unidad | Cardinalidad | Regla de inventario | Cierre |
| --- | ---: | --- | --- |
| EF-000…EF-704 | 28 | Identidades/orden canónicos; check histórico se distingue de evidencia actual | Cada EF exige su contrato específico |
| S01…S20 | 20 | Encabezados normativos del ODD maestro | Son requisitos, no PASS autónomos |
| UI-01…UI-14 | 14 | Dependencias y casos de prueba por tarea | Interacción real y evidencia por SHA |
| C01…C20 | 20 | Matriz A/B del ODD maestro | 60 observaciones auténticas A/B/ASEN |
| UI-C01…UI-C24 | 24 | Casos del anexo UI; dueño funcional distinto de UI-14 | UI-14 certifica el conjunto, no sustituye las pruebas |

`scripts/r4-requirement-inventory.mjs` calcula la matriz estructural y falla si falta o se duplica una identidad. Se exige propietario de implementación para cada UI-C, con UI-14 como agregador final. **UI-C08 pertenece a UI-02** (coalescencia por rol); no se ha marcado como superado. Las casillas antiguas conservan la etiqueta `CHECKED_HISTORICAL`, que no equivale a ejecución reciente ni revisión externa.

## R4-02 — límites del validador de evidencias

`scripts/r4-integrated-gate.mjs` solo se ejecuta con contexto genuino de GitHub Actions y `pull_request` de la rama de trabajo. Comprueba `git rev-parse HEAD` contra el SHA de la PR y recibe cinco conclusiones **del mismo workflow** por `needs.*.result`:

1. `test-shard-coverage`: seis shards, cobertura global sin huecos/solapamientos en tres OS.
2. `architecture`: aislamiento arquitectónico existente.
3. `t12-integrated-security`: recorridos integrados de seguridad.
4. `pi-support-matrix`: contratos del host y ejecución Pi.
5. `t12-real-pi-tui-dialog`: pruebas nativas Pi TUI en tres OS.

Solo `success` para **todos** permite `R4_TECHNICAL_PASS`. Los estados `skipped`, `failure`, `cancelled`, `action_required` y los SHAs o eventos incorrectos impiden PASS. El validador falla con recibos incompletos o claves desconocidas. `tests/r4-integrated-gate.test.mjs` verifica casos positivos y adversariales.

**Límite de confianza:** `needs` permite atestiguar el estado de los jobs dentro de la propia ejecución GitHub, no firma por separado el código de cada test, ni inspecciona históricamente ejecuciones de otros workflows. El `audit:ef-plan` estructural sigue siendo una comprobación diferente.

## R4-03 — coste y arquitectura de CI

Se incorpora `r4-integrated` al final de `.github/workflows/ci.yml`; depende de los jobs **ya existentes** y no repite `npm ci`, los tests principales, ni la matriz de tres sistemas. Ejecuta solo un test de validador Node y agrega estados del workflow. Publica `r4-integrated-evidence/r4-integrated-report.json` como artefacto de 30 días para el SHA del PR.

**Semántica inalterable:**
- `R4_TECHNICAL_PASS`: gates técnicos del mismo CI completos.
- `R4_TECHNICAL_FAIL`: al menos una condición obligatoria falla.
- `globalFull:false`, `independentReviewPerformed:false`, `writerAuthorized:false`: no se infieren de los tests.
- Release Gate es un workflow **distinto**; permanece `NOT_EVALUATED` dentro de este recibo, aunque deba aprobarse por separado.
- Modelo por rol, proveedor, cuotas, revisión externa, Writer humano y observaciones A/B/UI reales permanecen `NOT_ATTESTED` salvo aceptación legítima posterior fuera de este gate.

## R4-04 — aceptación real A/B y UI (pendiente)

Mantener el harness de procedencia e integridad. Añadir mecanismos de **captura auténtica y validación de origen** de las 60 ejecuciones para C01–C20; un hash JSON no demuestra ejecución. Requerir 24 casos de interfaz con entrada, estado inicial/final, Pi TUI nativo y evidencia observable. Resolver la discrepancia de Pi 1.2/1.5 antes de considerar la paridad UI.

## R4-05 — IA opcional (pendiente)

Solo riesgo alto y proveedor gratuito expresamente habilitado. Presupuesto explícito, sin fallback a proveedor de pago y sin guardar claves. Una respuesta de Beam no es una revisión independiente por sí sola. Si no hay cuota, el gate técnico sigue operativo y el gate de IA obligatorio, si lo hay para ese caso, permanece pendiente.

## R4-06 — certificación FULL (pendiente)

Agregador **separado** que verifique CI + Release Gate exactos, S01–S20, 28 EF, 14 tareas UI, 20 casos A/B, 24 casos UI, Writer humano genuino, proveedor/host real cuando corresponda e independencia de auditor. Todos los casos obligatorios deben estar acreditados; una exclusión esencial impide FULL.

**No implementar un cambio de etiquetas de estado ni permitir un atajo de certificación cuando un proveedor, una herramienta o una referencia esté inaccesible.**

## Reanudación

1. Confirmar HEAD tras publicación y comprobar R4-01/02/03 en CI exact-SHA.
2. Si falla, localizar el test/contrato exacto; corregir sin rebajar gates.
3. Continuar R4-04 con capturas auténticas A/B/ASEN, y en paralelo cerrar UI por tareas.
4. Mantener R4-05 opcional por riesgo; solicitar intervención humana legítima para R4-06 donde corresponda.

### R4-04 — evidencia Pi TUI nativa reutilizada en tres OS (2026-11-05)

Se amplía el probe host real de `t12-real-pi-tui-dialog` a anchuras 120/80/60/40/139/140/160 (Pi 1.2.0, sin inferencia ni proveedor). El job `r4-integrated-evidence` descarga **exclusivamente** los artefactos nativos de los tres sistemas de **la misma corrida** y candidato, verifica SHA, versión de host, identidad de plataforma, lista de anchuras, eventos reales de sesión/error/reinicio/cierre, render y ausencia de wrapping. Emite un informe acotado separado (`r4-native-ui-report.json`) y pruebas negativas de SHA cruzado, simulación, anchuras ausentes, estados falsos y enlaces inseguros. No duplica el arranque de Pi ni usa otro modelo.

**Alcance certificado por el recibo R4-04:** observación técnica de 21 celdas host/anchura, si el CI exact-SHA concluye PASS. La observación de filas `/asen-status`, `/asen-agents` y `/asen-changes` **no demuestra** rail paritario, overlay, mouse, permisos ni UI-C01–UI-C24 completos. Las 24 UI-C siguen bloqueadas para comparación externa real y las 14 tareas UI conservan `[ ]`. El contrato A/B C01–C20 conserva 60 slots, cero casos observados con ambas fuentes y `globalFull:false`. Los CLIs `--help` de las fuentes no equivalen a su host funcional ni a A/B auténtico; R4-04 requiere posterior provisión de hosts/modelos/consentimiento y capturas reales antes de ascender un caso.

**No emitir `R4-04 FULL`:** el gate técnico puede pasar con estado `PARTIAL_NATIVE_HOST_OBSERVED`. Queda abierta la matriz comparada A/B, controles nativos ratón/teclas y Pi 1.5 de referencia, Writer humano y revisión externa. El estado histórico 8/28 EF, 0/14 UI no se altera. CI y Release Gate pendientes de validar el nuevo SHA.

### R4-04 — corrección causal del CI y preparación ejecutable C01–C05 (2026-11-05)

**Fallo observado:** CI `42100195135` del SHA `c734e67d83985c97fe6e6c5e5673dca5e0d1f04a` concluyó FAIL exclusivamente en el agregador `r4-integrated-evidence`: los tres jobs `t12-real-pi-tui-dialog` fueron SUCCESS y las nueve pruebas negativas R4-04 PASS, pero una celda real tenía `rendered:[]` y `R4_NATIVE_UI_REJECTED: Actual terminal-rendered rows must be captured and bounded`. No se atribuye al proveedor ni se rebaja el rechazo de evidencia vacía.

**Corrección:** el probe TUI guarda el marcador de salida real del propio PTY recibido por `send('/asen-status')` y `send('/asen-changes')` cuando la división en líneas del buffer pierde las filas por reescritura con cursor. Identifica `PTY_BUFFER_ROWS` o `PTY_COMMAND_RESPONSE_MARKERS`; la auditoría exige origen permitido, render no vacío y marcador auténtico de estado/Git. Pruebas negativas nuevas rechazan marcadores simulados y datos sin contenido observable. La validez de la corrección requiere el CI de un **nuevo SHA**, no hereda el PASS de los tres jobs anteriores.

**Discrepancia bloqueante de las referencias:** la fuente A actualmente fijada para C01–C20 (`813ec110...`) anuncia paquete **4.5.1**, mientras que el objetivo de UI declarado es **4.6.0**. La referencia B fijada es un instalador Go con comando `--help`, no un agente B ya provisionado. No se modifica la baseline canónica sin decisión explícita, ni se afirma que `--help` ejecute un escenario de agentes.

**Paso real preparatorio:** `agent-ab-host-smoke.mjs` registra las versiones del paquete leídas de los checkouts de commits congelados; el disparador opt-in de la acción ejecuta ambos binarios `--help` sin inferencia ni instalaciones. `r4-first-five-preflight.mjs` comprueba procedencia/estado y prepara cinco prompts/escenarios sobre un fixture de código acotado con digest determinista. C01–C05 permanecen `BLOCKED` y `scenariosExecuted:0` hasta disponer de sesiones auténticas de A, B y ASEN, proveedor permitido cuando sea necesario y recibos de cada ejecución. No conceder Writer ni cambiar C01–C20 para hacerlos pasar.

**Invariantes:** 8/28 EF, 0/14 UI, cero C01–C20 certificados, 60 recibos A/B/ASEN todavía exigibles, `globalFull:false`; no merge, no modelo de pago, no permiso humano simulado. Próximo objetivo: ejecutar primero los cinco escenarios reales tras provisionar un host compatible para B y reconciliar la versión congelada de A con la normativa de UI, conservando ambas procedencias.
