# ASEN — Auditoría integral de arquitectura, integración, estabilidad y flujo end-to-end

- **Rama auditada:** `feat/t12-integrated-acceptance-merge`
- **HEAD real:** `9529b6c16a78bf94d46a1de30204e7f57245357b` (idéntico al punto de partida; sin commits posteriores)
- **Sincronización:** `0` adelante / `0` atrás respecto de `origin/feat/t12-integrated-acceptance-merge`
- **Árbol de trabajo:** limpio salvo 3 untracked: `.tmp-npm-test-ci-limits.log`, `docs/gentle-shell-architecture-and-execution-flow.md`, `pi`
- **Fase:** auditoría read-only. No se modificó código productivo, no hubo merges, pushes ni cambios en `main`.
- **Fecha:** 2026-11-15

## Estado de esta auditoría (leer antes de citar)

| Elemento | Estado |
|---|---|
| Delegación a subagentes de investigación (2 en paralelo) | **NO EJECUTADA — y no es hueco de auditoría.** La regla 10 dice *"Puedes organizar"*: es una facultad, no un requisito. Causa técnica del bloqueo: `~/.config/opencode/opencode.json` concede el tool `task` con allowlist de agentes, pero este runtime expone el tool como `subagent`, sin entrada → denegación por defecto. |
| Evidencia estática (lectura de código + grafo de imports) | **COMPLETA** para los ejes auditados |
| Typecheck real ejecutado | **PASS** (`npm run typecheck`, 14s) |
| Suite de tests real ejecutada | **PASS** — 13 shards, **4.150 tests, 4.088 pass, 0 fail**, 62 skipped, `exit=0` (corrida posterior a Tanda 0). Ver §E.1. La corrida posterior a T3.2 fue **abortada por el watchdog** del arnés (S-12), no por fallos: 6 shards verdes y el 7º muerto por 24 ms sobre el presupuesto global de 30 min. |
| Integridad de autoridad (`authority-pin check`) | **PASS** — 7 archivos |
| Prueba con proveedor real / red | **PARCIAL** — una invocación real a un proveedor configurado en `~/.pi/agent` devolvió `api_error` de la propia cuenta (sin créditos). No se completó ninguna generación ni se incurred gasto. Requiere autorización expresa para reintentar. |
| Aceptación en host (TUI real, Pi real, dos agentes reales) | **PARCIAL** — TUI real de ASEN **demostrada** (ConPTY, geometría 120x40, `dist/` reconstruido). Los dos agentes reales siguen pendientes de proveedor. Ver §E.1.2 y §E.5. |
| Equivalencia visual/funcional Gentle Shell **4.8.0** | **NO DEMOSTRADA** — la referencia ejecutable ya existe (`C:\gentle-shell` @ `3dc902975` / tag `v4.8.0`, instalada y arrancable); faltan las capturas comparables. 4.6.0 queda **retirada** como objetivo. |
| Métricas de rendimiento instrumentadas | **PARCIAL** — sólo datos puntuales ver §E.4 |

Nada en este documento debe leerse como `FULL` ni como equivalencia demostrada.

### Revisión 2 (posterior al cierre inicial)

El primer borrador se cerró con la suite en ejecución y sin el hallazgo S-07. Esta revisión:

1. Reemplaza los dos "no confirmado" por la corrida real: **4.137 tests / 4.075 pass / 0 fail / 62 skipped, `exit=0`**.
2. Agrega **S-07 / ASEN-A-033 (P1)** — `powershell` fuera de la política de shell — con evidencia estática y RED observado.
3. Renombra el RED de T1.2 a `tests/primary-tool-policy-shell-admission.test.ts` (une malformado + paridad de shell) y agrega T1.2b.

Sin cambios en los hallazgos P1 previos. Nada de lo agregado se apoya en ejecución con proveedor real ni en aceptación de host.

### Revisión 3 (post-Tanda 0 y Tanda 1, con ejecución real del host)

Esta revisión incorpora la **primera evidencia de ejecución real del host** de la auditoría (TUI real de ASEN y de la referencia 4.8.0 capturadas por ConPTY) y corrige cuatro afirmaciones del propio documento:

1. **Tanda 0 cerrada y verificada**: suite completa posterior a T0 = **4.150 tests / 4.088 pass / 0 fail / 62 skipped**, `exit=0`.
2. **Tanda 1 cerrada y verificada**: suite completa posterior a T1 = **4.147 tests / 4.085 pass / 0 fail / 62 skipped**, `exit=0`.
3. **Tanda 3.2 cerrada**: el camino vivo de aceptación de revisiones ahora autentica el recibo HMAC cuando existe y lo ata al árbol exacto del candidato; el subsistema de recibos dejó de ser código muerto (prueba mecánica: `scripts/asen-reachability-audit.mjs`).
3. **§E.4 corregido**: la suite no dura "~7 min"; la medición real es **1.537 s agregados (≈25,6 min)** en el baseline y **1.747 s (≈29,1 min)** en la corrida posterior a T0, esta última degradada por trabajo concurrente en el mismo host.
4. **Objetivo de equivalencia re-activado**: 4.6.0 queda **retirada**. La referencia es **4.8.0** (`C:\gentle-shell` @ `3dc902975`), ya instalada y ejecutable.
5. **Aceptación en host: de "NO EJECUTADA" a "PARCIAL"** — la TUI real de ASEN está **demostrada** con captura ANSI; los dos agentes reales siguen pendientes de proveedor.

Nuevos hallazgos de esta revisión: **S-08** (gate de skips inejecutable en Node 24), **S-09** (`dist/` obsoleto ⇒ TUI muda; artefacto, no defecto de fuente), **S-10** (el home aislado de ASEN no tiene credenciales; el mecanismo `--link` existe pero el proveedor configurado responde `api_error` por falta de créditos) y **S-11** (diferencia de versión de Pi: ASEN embebe 1.2.0, la referencia 4.8.0 corre 1.5.2).

Corrección de encuadre: la regla 10 (*"Puedes organizar dos subagentes"*) es una **facultad**, no un requisito de cierre. No se contabiliza como hueco de auditoría.

### Revisión 4 (post-Tanda 2, con suite definitiva en marcha)

1. **Tanda 2 cerrada en foco**: presupuesto por fase con reloj monotónico, presupuesto por RPC, backpressure de stdin, `spawnContained` dentro de `try` + limpieza del temp, y contrato de asentamiento explícito. **RED observado** en las 5 dimensiones; **9/9 tests nuevos GREEN**; **73/73** en el contrato de no-regresión de PR #59 (archivo sin modificar) y **149/0 fail/2 skipped** en los 9 archivos colindantes. `typecheck` PASS.
2. **S-12 registrado**: la corrida post-T3.2 no fue un fallo de producto sino un timeout del arnés de pruebas (presupuesto global de 30 min rozado por trabajo concurrente del propio host). La corrida definitiva se está re-ejecutando **en solitario** y con presupuesto explícito.
3. **Tanda 4 queda en diseño**: mover 117 archivos de `src/runtime` es estructural y se mantiene **separada** de las tandas de comportamiento (la auditoría lo exige y la suite definitiva lo refuerza: no se mueven archivos mientras la corrida está en curso).
4. **Tanda 5 queda en diseño** con los 7 puntos ya acotados a un archivo cada uno (ver tabla "Diseño de Tanda 5").

---

# A. Informe ejecutivo

## A.1 Diagnóstico global

ASEN no es un runtime monolítico: es un **launcher CLI delgado que inyecta una extensión de Pi**, y toda la lógica de producto vive en `extensions/asen.ts` (1.879 líneas) consumiendo 100+ módulos de `src/`. Esa arquitectura es coherente y la cadena de arranque funciona.

El problema central **no es falta de implementación**. Es **duplicación de implementaciones**: existen dos sistemas paralelos para las mismas responsabilidades, y el que recibió la inversión de seguridad más fuerte (recibos criptográficos HMAC del PR #59) **no está conectado al producto**.

Verificado por grep directo: `extensions/asen.ts` **no importa** ninguno de estos ocho módulos:

```
session-orchestrator   receipt-verifier   review-receipt   command-registry
workspace-lock-table   notice-ring-buffer activity-stream  permission-hash-cache
```

`session-orchestrator.ts` es el **único** consumidor de los otros siete. Por lo tanto, el conjunto completo es inalcanzable en runtime y sobrevive sólo por sus tests.

Consecuencia concreta y verificable: el commit `c2729b87` *"fix(evidence): authenticate review receipts with HMAC-SHA-256 instead of forgeable plain hash"* endureció una ruta que **hoy no ejecuta ninguna sesión real**. La ruta de revisión que sí ejecuta es `src/runtime/review-acceptance.ts`, que es rigurosa pero **no usa recibos criptográficos**: su "evidencia" son strings escritos por el modelo, validados sólo por forma.

## A.2 Grado de funcionamiento realmente demostrado

| Nivel | Qué se demostró |
|---|---|
| **Compila** | Sí — `tsc --noEmit` PASS en 14s |
| **Tests pasan** | Sí — 4.137 tests, 4.075 pass, 0 fail (13 shards, `exit=0`), ver §E.1 |
| **Integridad interna** | Sí — pins de autoridad verificados, digest de política correcto |
| **Cadena CLI→Pi conectada** | Sí, por lectura de código |
| **Producto ejecutado end-to-end en host** | **No** — no ejecutado |
| **Equivalencia con Gentle Shell** | **No demostrada** |

## A.3 Riesgos principales (ordenados)

1. **P1 — Bypass de la política de shell en Windows.** `powershell` es un tool de primera clase de Pi pero no está en `shellTools` (`primary-tool-policy.ts:30`), así que en `normal`/`yolo`/`super-yolo` se salta clasificación de comandos destructivos, rutas sensibles, `permission-mode.json`, preflight de entrega, marcadores de conflicto y confirmación. Detalle y RED en §E.2 S-07. **Es el hallazgo más severo de esta auditoría.**
2. **P1 — Aseguramiento falso.** Los recibos HMAC, el caché de permisos, la tabla de locks y el ring buffer de avisos son código muerto-testado. Cualquier afirmación de "verificación criptográfica en runtime" es hoy **falsa**.
3. **P1 — Integridad de estado no aplicada en la capa de tools.** `.asen/` sólo se protege en `writer-authorization-snapshot.ts:65`, no en `primary-tool-policy.ts`. El agente primario puede escribir `todos.json`, `agents.json`, `rdd-policy.json`, `profiles.json` con la tool `write`.
4. **P1 — Timeout único total.** `PiProcessRunner` aplica `timeoutMs` (120s) a **toda** la corrida incluida la cadena de fallback; una cadena de fallback sana puede ser abortada como "timeout".
5. **P2 — Fail-open en input de shell malformado** en modo `normal` (`primary-tool-policy.ts:100,104`).
6. **P2 — 49% del código en un solo directorio** (`src/runtime`: 117 archivos, 13.566 LOC) y un ciclo de 24 nodos.
7. **P2 — `dist/` local obsoleto** respecto de PR #59 con `bin` apuntando a `dist/cli.js`.

## A.4 Lo que está bien construido (para no reescribirlo)

No todo es deuda. Estas piezas resistieron el escrutinio y **no deben tocarse**:

- **`PiProcessRunner`**: digest pinneado de `extensions/authority.ts`, materialización a directorio temporal `0o400`, `--no-extensions` + extensión explícita, `--no-skills` + allowlist de tools, preflight `get_commands` que verifica `asen-authority-status` con path exacto, guards correlacionados de RPC y `agent_settled` diferido. Es defensa en profundidad real.
- **`review-acceptance.ts`**: exige HEAD real, worktree **e** índice limpios, exactamente un link agente-sesión, `state==="completed"`, rol correcto, JSON canónico sin claves duplicadas, confirmación humana explícita, y revalida identidad y evidencia **dentro** del callback de commit (TOCTOU-safe). No promueve la afirmación de un modelo.
- **`agent-store.ts`**: firmas HMAC por entrada (`receiptDigest`, validación de forma exacta).
- **`primary-tool-policy.ts`**: el **orden** es correcto — denegaciones duras y chequeos de entrega/marcadores corren **antes** de los atajos `auto`/`yolo`/`super-yolo`.
- **`permission-mode-policy.ts`**: escritura atómica `O_EXCL`+`O_NOFOLLOW`, `fsync`, rename, `0o600`, chequeo de symlink, fail-closed a `normal` ante archivo malformado.

---

# B. Mapa de arquitectura

## B.1 Entrada real

```
package.json  bin: { asen: "./dist/cli.js" }      exports: { "./extensions": "./extensions/asen.ts" }
        │
        ▼
src/cli.ts  (213 LOC)  ── runAsen()  ──►  runLifecycleCommand()      [lifecycle-cli.ts]
   │                                        parseManagedUpdateStageArgs / PreviewArgs
   │                                        parseProjectMemoryBackupPreviewArgs
   │                                        parseDoctorArgs → installation-doctor.ts
   │                                        parseManagedSelectArgs → managed-install.ts
   │                                        parseManagedRunArgs  → managed-selected-launch.ts
   │                                        command==="home" | "setup"(sólo --dry-run) | "startup"(proyección)
   │
   ▼
resolveAsenHome()  →  {mode: link|isolated|path, dir}
resolvePiRuntime() →  ASEN_PI | bundled node_modules/@earendil-works/pi-coding-agent/dist/cli.js | ASEN_PI_ON_PATH
   │
   ▼
spawn(runtime.command, [ ...piArgs, "-e", packageRoot ], { stdio:"inherit",
        env:{ PI_CODING_AGENT_DIR: home.dir, ASEN_PACKAGE_ROOT: packageRoot } })
   │
   ▼
extensions/asen.ts  (1.879 LOC)  →  createAsenExtension(pi)  →  return facade
   │
   ├─ registerCommand / registerTool × ~40
   ├─ registerAgentTools        → src/agents/pi-agent-tools.ts → PiProcessRunner
   ├─ registerTodoTools         → src/runtime/pi-todo-tools.ts
   ├─ registerInteractionTools  → src/interaction/pi-tools.ts
   ├─ registerCodeGraphTools    → src/interaction/code-intelligence.ts
   ├─ registerBackgroundJobTools→ src/runtime/background-job-tools.ts
   └─ createPrimaryToolPolicyHandler → src/security/primary-tool-policy.ts  [hook de tool call]
```

**Hallazgo B.1.1 (P2):** `asen setup` no ejecuta. `src/cli.ts:92` responde `"ASEN setup execution is not available yet; use --dry-run to inspect the plan."` con exit 2. El comando existe en la superficie pública y sólo produce un plan.

**Hallazgo B.1.2 (P2):** `asen --no-extensions` (o `-ne`) desactiva silenciosamente **todo** el runtime ASEN: `src/cli.ts:175` marca `excluded=true` y omite la inyección `-e packageRoot`. Se arranca Pi puro sin error. Es comportamiento defendible, pero no está documentado en la ayuda como "desactiva ASEN".

## B.2 Distribución de código (245 archivos, 27.734 LOC)

| Directorio | Archivos | LOC | % |
|---|---|---|---|
| `src/runtime` | 117 | 13.566 | 48.9% |
| `src/review` | 18 | 2.465 | 8.9% |
| `src/security` | 16 | 1.737 | 6.3% |
| `src/memory` | 13 | 1.698 | 6.1% |
| `src/agents` | 10 | 1.361 | 4.9% |
| `src/delivery` | 9 | 1.076 | 3.9% |
| `src/evidence` | 9 | 992 | 3.6% |
| resto (19 dirs) | 53 | 4.838 | 17.4% |

**B.2.1 (P2)** `src/runtime` es un god-directory: 49% del código, 117 archivos planos sin subdominios. Es la causa raíz de la dificultad de auditoría, no un defecto funcional.

### Fan-in más alto (acoplamiento entrante)

```
22  src/core/types.ts                  20  src/runtime/responsive-layout.ts
16  src/runtime/profiles.ts            16  src/runtime/workspace-store.ts
12  src/io/atomic-write.ts             12  src/io/exclusive-file-lock.ts
12  src/skills/registry.ts             11  src/runtime/managed-install.ts (1.099 LOC)
11  src/runtime/todo-store.ts          10  src/skills/context.ts
 9  src/agents/agent-runtime.ts         9  src/agents/dispatcher.ts
```

### Ciclos de dependencia (4)

1. **Ciclo de 24 nodos**: `agent-lifecycle → writer-authorization-snapshot → non-tdd-alternative → tdd-completion-record → tdd-observation → strict-tdd-cycle → applicability → verifier → pi-process-runner → pi-artifact-runner → skill-lifecycle → risk → odd-routing → orchestrator → tdd-cycle → review → skills/context → evidence/review-execution → evidence/store → evidence/execution → rdd-reproduction → rdd-defect-binding → core/types → dispatcher → (vuelve)`
2. `managed-maintenance-lock ↔ managed-acquisition-verification ↔ managed-acquisition-copy ↔ managed-install`
3. `review-session ↔ ordinary-review-controller`
4. `background-jobs ↔ background-job-journal`

**B.2.2 (P2)** El ciclo 1 atraviesa seguridad (`path-safety` indirecto), evidencia, TDD y orquestación. No es fatal (ESM lo tolera) pero impide razonar sobre orden de inicialización y bloquea cualquier intento de extraer un paquete.

## B.3 Clasificación de conectividad (método y resultado)

Método: grafo de imports resuelto sobre `src/` (245 nodos, 0 imports internos sin resolver), cruzado con consumidores en `tests/`, `extensions/`, `scripts/` y `bin`/`exports`.

| Clase | Cantidad |
|---|---|
| CONNECTED (consumido dentro de `src`) | 160 |
| EXTENSION-ONLY (consumido sólo por `extensions/asen.ts`) | 43 |
| TEST-ONLY (sin consumidor en `src` ni en la extensión) | 37 |
| DEAD (sin ningún consumidor) | 4 |
| ENTRYPOINT (`src/cli.ts`) | 1 |

**Corrección metodológica importante:** "TEST-ONLY" en el grafo significa "sin importador dentro de `src/`". Como `extensions/asen.ts` importa 100+ módulos directamente, la mayoría de esos 37 **sí están cableados**. La verificación por grep de la extensión reduce el conjunto realmente inalcanzable a **8 módulos** (§C.4).

### Módulos DEAD confirmados (sin ningún consumidor)

| Archivo | LOC | Nota |
|---|---|---|
| `src/memory/project-memory-restore-plan.ts` | 140 | nunca importado |
| `src/memory/project-memory-restore-stage.ts` | 170 | nunca importado |
| `src/platform/platform.ts` | 18 | la plataforma se detecta inline en `20+` sitios |
| `src/tasks/task.ts` | 14 | reemplazado por `runtime/todo-store.ts` |

## B.4 Propietarios de estado

Todos bajo `~/.asen/` (home ASEN) salvo indicación:

| Archivo | Escritor | Lector | Autenticado |
|---|---|---|---|
| `agents.json` | `agent-store.ts` | `agent-runtime.ts`, `review-acceptance` | **HMAC por entrada** (`agent-store.ts:82`) |
| `todos/` + `todos.json` | `todo-store.ts` | paneles, `review-acceptance` | **No** |
| `task-agent-links.json` | `task-agent-link-store.ts` | `review-acceptance` | No |
| `rdd-policy.json` | autoridad/CLI | `rdd-repository-inspection.ts` | SHA-256 de contenido |
| `permission-mode.json` | `permission-mode-policy.ts` | tool policy | forma + modo POSIX |
| `profiles.json` (global) | `profile-store.ts` | `profiles.ts` | No |
| `<proyecto>/.asen/profiles.json` | `profile-store.ts` | `profiles.ts` | No |
| `profile-fallbacks.json` | `profile-fallback-store.ts` | fallback | No |
| `history.json`, `usage.json` | `history-store`, `usage-store` | comandos | No |
| `agent-notices.json` | `AgentNotificationJournal` | paneles | No |
| `workspace.json` | `workspace-store.ts` | atribución | No |
| `memory.db` (SQLite) | `sqlite-store.ts` | memoria | No |
| `background-jobs.json` | `BackgroundJobJournal` | registry | No |
| `session-directory/` | `shared-session-directory.ts` | navegador M2 | No |
| `persona.json`, `language.json`, `presentation.json` | preferencias | UI | No |
| `receipts/` + `receipts/receipt-signing.key` | `review-receipt.ts` | `receipt-verifier.ts` | **HMAC — pero inalcanzable** |

**B.4.1 (P2) Split-brain de perfiles.** Existen simultáneamente `~/.asen/profiles.json` y `<proyecto>/.asen/profiles.json`, seleccionados por `scope==="Global"` vs proyecto en la extensión. Un cambio de modelo aplicado en un scope no se refleja en el otro; no hay reconciliación.

**B.4.2 (P1) Escritura de estado sin protección de tool.** Ver §D.1 hallazgo ASEN-A-003.

---

# C. Mapa de integraciones

## C.1 Cadena completa `CLI → … → UI`

| # | Salto | Productor | Consumidor | Contrato | Dueño de estado | Veredicto |
|---|---|---|---|---|---|---|
| 1 | CLI → launcher | `src/cli.ts:42 runAsen` | `launcher.ts parseAsenArgs` | `ParsedAsenArgs` | args en memoria | **CONECTADO** |
| 2 | launcher → Pi | `cli.ts:208-212 spawn` | proceso Pi | argv + env | `PI_CODING_AGENT_DIR` | **CONECTADO** |
| 3 | Pi → extensión | `-e packageRoot` | `extensions/asen.ts:1884` | `ExtensionAPI` | — | **CONECTADO** |
| 4 | extensión → ODD | `decideLifecycleApplicability` | `flow/odd-routing` | `OddRouteDecision` | plan en sesión | **CONECTADO** |
| 5 | ODD → coordinador | `TaskAgentCoordinator` | `TrustedTaskAgentBinder` | `TaskAgentLinkStore` | `task-agent-links.json` | **CONECTADO** |
| 6 | coordinador → agente | `pi-agent-tools.ts` | `dispatcher.ts` | `AgentRequest` | `agents.json` | **CONECTADO** |
| 7 | agente → proceso hijo | `PiProcessRunner.run` | Pi hijo | JSON-RPC sobre stdio | policy temp dir | **CONECTADO** |
| 8 | hijo → herramientas | `--tools read[,edit,write]` | tool policy + authority ext | `ASEN_PI_AUTHORITY` env | — | **CONECTADO** |
| 9 | resultados → evidencia | `agent-store.ts` | `review-acceptance.ts` | veredicto JSON canónico | `agents.json` (HMAC) | **CONECTADO** |
| 10 | resultados → recibos | `review-receipt.ts` | `receipt-verifier.ts` | `ReviewReceipt` | `receipts/` | **NO CONECTADO** |
| 11 | evidencia → memoria | `pi-integration.ts` | `sqlite-store.ts` | `PiMemoryStore` | `memory.db` | **CONECTADO** |
| 12 | estado → UI | `getPanelSnapshot` | `ide-panel`, `native-work-panel` | `AsenPanelSnapshot` | todos/agents/links | **CONECTADO** |

**Salto 10 es el hallazgo estructural de esta auditoría.** El resto de la cadena está efectivamente cableado.

## C.2 Selección de modelos, fallback y razonamiento

- Ruta de modelo: `profiles.ts` + `session-profile-binding.ts` → `piRuntimeRouteArgs()` (`pi-process-runner.ts:90`) → `--model`/`--thinking`.
- Fallback padre: `parent-model-fallback.ts` + `model-fallback-policy.ts`.
- Fallback hijo: `continueFallback()` (`pi-process-runner.ts:310`) con `set_model` + `set_thinking_level` por RPC correlacionado, `cooldown.mark`, `triedModels`, `pickFallbackModel`.
- **Veredicto: CONECTADO**, con dos observaciones P1 (§E.2 S-01, S-02).

## C.3 Subagentes, roles y permisos

| Rol | Tools permitidas | Fase exigida | Grant |
|---|---|---|---|
| `explorer` | `read` | `explore` | — |
| `reviewer` | `read` | `adversarial-review` | — |
| `verifier` | `read` | `verify` | — |
| `worker` | `read,edit,write` | `apply` | `authorizePiWriteGrant` + `runnerWriteReceiver` + `writeSurfaces` |

Verificado en `pi-process-runner.ts:170-202`. Un `worker` sin grant exacto devuelve `ok:false` sin spawn. **CONECTADO y fail-closed.**

## C.4 Módulos inalcanzables en runtime (confirmado por grep)

| Módulo | LOC | Rol declarado | Consumidor runtime |
|---|---|---|---|
| `src/runtime/session-orchestrator.ts` | 89 | "unified governed lifecycle facade" | **ninguno** |
| `src/evidence/review-receipt.ts` | 327 | recibos HMAC | sólo `receipt-verifier` |
| `src/evidence/receipt-verifier.ts` | 126 | verificación de recibos | sólo `session-orchestrator` |
| `src/runtime/command-registry.ts` | 164 | registro de comandos | sólo `session-orchestrator` |
| `src/runtime/workspace-lock-table.ts` | 165 | locks semánticos | sólo `session-orchestrator` |
| `src/runtime/notice-ring-buffer.ts` | 93 | buffer de avisos | sólo `session-orchestrator` |
| `src/runtime/activity-stream.ts` | 65 | stream de actividad | sólo `session-orchestrator` |
| `src/security/permission-hash-cache.ts` | 118 | caché de permisos | sólo `session-orchestrator` |
| **Total** | **1.147 LOC** | | **0** |

## C.5 Integraciones declaradas como paridad sin consumidor

`scripts/upstream-reference-policy.mjs` lista como objetivos de paridad con Gentle Shell a módulos sin consumidor runtime:

- `src/runtime/desktop-rpc.ts` (174 LOC) — línea 59
- `src/runtime/guide-tour.ts` (150 LOC) — línea 65
- `src/runtime/image-disk-cache.ts` (152 LOC) — línea 71
- `src/runtime/reply-language-anchor.ts` (94 LOC) — línea 80
- `src/runtime/voice-dictation.ts` (283 LOC) — línea 87

**C.5.1 (P2)** Son puertos reales del upstream, correctamente aislados, pero **no están cableados al producto**. Declararlos como paridad funcional sin consumidor es una afirmación no soportada. Total: 853 LOC.

## C.6 Wiring de UI (TODOS / AGENTS / CHANGES / INTEGRATIONS)

| Superficie | Comando | Invoca | Lee | Veredicto |
|---|---|---|---|---|
| Panel de trabajo | `/asen-panel [all\|status\|todos\|jobs\|agents\|changes\|review\|integrations]` | `createNativeWorkPanel(snapshot, …)` `asen.ts:1063` | `getPanelSnapshot()` → git + `todoStore` + `agentRuntime` + `hostStatus` | **CABLEADO** |
| TODOS | `/asen-panel todos` | `SessionTodoStore.list` | `todos/` | **CABLEADO** |
| AGENTS | `/asen-panel agents` | `projectAgentHierarchy`, `renderAgentFollowTail` | `agents.json` | **CABLEADO** |
| CHANGES | `/asen-panel changes` | `previewWorkspaceFileDiff`, `gitChangesIndex` | git en vivo | **CABLEADO** |
| INTEGRATIONS | `/asen-panel integrations` | `integrationPanel`, `inspectIntegrationProfiles` | inventario Pi | **CABLEADO** |
| Review | `/asen-panel review` | `renderAsenPanelSection` | snapshot | **CABLEADO** |
| Status bar | `renderAsenStatusLine` | `buildStatus`, `statusLines` | host status | **CABLEADO** |
| Paleta | `/asen-commands` | `inspectRegisteredCommands` | `command-catalog` + registro Pi | **CABLEADO** |
| Keymaps | `/asen-keymaps` | `readKeymaps`/`writeKeymaps` | preferencias | **CABLEADO** |

**C.6.1** `getPanelSnapshot` consulta Git **sólo** en inspección explícita (`asen.ts:380`), nunca en movimiento de mouse. Correcto: no hay sondeo en bucle.
**C.6.2 (P3)** El panel no consume `session-orchestrator`; usa `ide-panel` + `native-work-panel`. Segunda confirmación de la duplicación de §C.4.

## C.7 Contradicciones documentación ↔ código

| Afirmación documental | Código real | Ubicación |
|---|---|---|
| Recibos de revisión autenticados con HMAC protegen las revisiones | El módulo no tiene consumidor runtime | `review-receipt.ts` vs §C.4 |
| "Caché de permisos aprobados por workspace/branch" | `PermissionHashCache` inalcanzable | `session-orchestrator.ts:41` |
| "Locks semánticos que coordinan agentes concurrentes" | `WorkspaceLockTable` inalcanzable; la exclusión real es `exclusive-file-lock.ts` (pinned) | `session-orchestrator.ts:43` |
| "Facade de ciclo de vida gobernado único" | Nadie construye `SessionOrchestrator` | `session-orchestrator.ts:34` |
| `asen setup` configura | Sólo `--dry-run`; si no, exit 2 | `cli.ts:92` |
| Paridad Shell en `desktop-rpc`, `voice-dictation`, etc. | Sin consumidor runtime | §C.5 |

---

# D. Matriz de salud funcional

| ID | Funcionalidad | Archivos | Propietario | Impl. | Conect. | Probada | Estabilidad | Eficiencia | Equiv. Shell | Evidencia | Problema | Prioridad |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ASEN-A-001 | Arranque CLI → Pi | `cli.ts`, `launcher.ts` | launcher | Sí | Sí | Unitario | Verificada | Sin medir | Parcial | `cli.ts:162-212` | — | — |
| ASEN-A-002 | Selección de home (`link`/`isolated`/`path`) | `launcher.ts:154` | launcher | Sí | Sí | Unitario | Verificada | — | — | `launcher.ts:146-160` | — | — |
| ASEN-A-003 | Política de tools primaria | `primary-tool-policy.ts` | security | Sí | Sí | Unitario+Integración | Riesgo | — | — | `:99-161` | `.asen` no protegido; fail-open shell malformado | **P1** |
| ASEN-A-004 | Modos `normal/auto/yolo/super-yolo` | `permission-mode-policy.ts`, `yolo-delivery-policy.ts` | security | Sí | Sí | Unitario | Verificada | — | Parcial | `:20-57`, `:10-31` | Sin bypass de denegaciones duras (correcto) | — |
| ASEN-A-005 | Ejecución de subagentes | `dispatcher.ts`, `pi-agent-tools.ts` | agents | Sí | Sí | Integración simulada | Verificada | Sin medir | — | `pi-process-runner.ts:159-202` | — | — |
| ASEN-A-006 | Runner de proceso Pi | `pi-process-runner.ts` | agents | Sí | Sí | Integración | **Riesgo** | Sin medir | — | `:248-484` | Timeout total; backpressure stdin; spawn sync-throw | **P1** |
| ASEN-A-007 | Fallback de modelo hijo | `pi-process-runner.ts:310-344` | agents | Sí | Sí | Integración | Riesgo | Sin medir | — | guards PR #59 | Abortado por timeout global | **P1** |
| ASEN-A-008 | Fallback de modelo padre | `parent-model-fallback.ts` | runtime | Sí | Extension | Unitario | Sin evidencia | Sin medir | — | — | Sin prueba E2E | P2 |
| ASEN-A-009 | Autoridad de escritura (grant) | `skill-lifecycle.ts`, `dispatcher.ts` | lifecycle | Sí | Sí | Integración | Verificada | — | — | `:200-202` | — | — |
| ASEN-A-010 | Integridad de política de hijo | `pi-authority-assets.ts` | agents | Sí | Sí | Verificación real | **Verificada** | — | — | pin check PASS, 7 archivos | — | — |
| ASEN-A-011 | Recibos de revisión HMAC | `review-receipt.ts`, `receipt-verifier.ts` | evidence | Sí | **No** | Unitario | **Sin evidencia runtime** | — | — | §C.4 | Código muerto-testado | **P1** |
| ASEN-A-012 | Aceptación de revisión | `review-acceptance.ts` | runtime | Sí | Sí | Integración | **Verificada** | — | — | `:49-116` | Evidencia = strings del modelo | P2 |
| ASEN-A-013 | Ciclo de vida gobernado | `session-orchestrator.ts` | runtime | Sí | **No** | Unitario | **Sin evidencia runtime** | — | — | §C.4 | Facade sin constructor | **P1** |
| ASEN-A-014 | Registro de comandos | `command-registry.ts` | runtime | Sí | **No** | Unitario | Sin evidencia runtime | — | — | §C.4 | Duplica `command-catalog` | P2 |
| ASEN-A-015 | Catálogo/paleta de comandos | `command-catalog.ts`, `command-palette.ts` | runtime | Sí | Extension | Unitario | Verificada | — | Parcial | `asen.ts:846` | — | — |
| ASEN-A-016 | TODOS | `todo-store.ts`, `pi-todo-tools.ts` | runtime | Sí | Sí | Unitario+Integración | Verificada | Sin medir | Parcial | `:249-278` | Sin HMAC (modelo puede escribir) | P2 |
| ASEN-A-017 | AGENTS / jerarquía | `agent-store.ts`, `agents-panel.ts` | runtime | Sí | Sí | Unitario | Verificada | — | Parcial | `:82,98` | — | — |
| ASEN-A-018 | CHANGES / diff preview | `git-diff-preview.ts` | runtime | Sí | Extension | Unitario | Verificada | — | Parcial | `asen.ts:380` | — | — |
| ASEN-A-019 | INTEGRATIONS | `integrations-panel.ts` | runtime | Sí | Extension | Unitario | Verificada | — | Parcial | `asen.ts:88` | — | — |
| ASEN-A-020 | Memoria persistente | `sqlite-store.ts`, `pi-integration.ts` | memory | Sí | Sí | Integración | Verificada | Sin medir | Parcial | — | — | — |
| ASEN-A-021 | ODD routing y tracking | `odd-routing.ts`, `odd-task-tracking.ts` | flow | Sí | Sí | Unitario | Verificada | — | — | `asen.ts` import | — | — |
| ASEN-A-022 | TDD estricto | `src/test/*` | test | Sí | Sí (vía skill) | Unitario | Sin evidencia host | — | — | ciclo 24-nodos | — | P2 |
| ASEN-A-023 | Cancelación / abort | `pi-process-runner.ts:345,479` | agents | Sí | Sí | Integración | Riesgo | — | — | `terminateTree` | Ver §E.2 | P2 |
| ASEN-A-024 | Reanudación de sesión | `checkpoint.ts`, `session-directory.ts` | session | Sí | Parcial | Unitario | Sin evidencia | — | — | — | Sin E2E | P2 |
| ASEN-A-025 | `asen setup` ejecutable | `cli.ts:90-100` | launcher | **Parcial** | Sí | Unitario | — | — | — | `cli.ts:92` | Sólo `--dry-run` | P2 |
| ASEN-A-026 | Instalación administrada | `managed-install.ts` (1.099) | runtime | Sí | Sí | Unitario | Verificada | — | — | — | — | — |
| ASEN-A-027 | Backup/restore de memoria | `project-memory-backup.ts` | memory | Sí | Extension | Unitario | Verificada | — | — | — | restore-plan/stage DEAD | P3 |
| ASEN-A-028 | `desktop-rpc` | `desktop-rpc.ts` | runtime | Sí | **No** | Unitario | Sin evidencia | — | **No demostrada** | §C.5 | 174 LOC sin consumidor | P2 |
| ASEN-A-029 | `voice-dictation` | `voice-dictation.ts` | runtime | Sí | **No** | Unitario | Sin evidencia | — | **No demostrada** | §C.5 | 283 LOC sin consumidor | P2 |
| ASEN-A-030 | `image-disk-cache` | `image-disk-cache.ts` | runtime | Sí | **No** | Unitario | Sin evidencia | — | **No demostrada** | §C.5 | 152 LOC sin consumidor | P3 |
| ASEN-A-031 | Paridad UI Gentle Shell **4.8.0** | múltiple | runtime | Parcial | Parcial | E2E real (captura comparable) | **Riesgo** (desviación medida) | — | **No demostrada** | `odd/evidence/asen-4.8.0-comparison/` (2 capturas ANSI, geometría 120x40) | Referencia ejecutable disponible; ASEN corre Pi 1.2.0 vs 1.5.2 de la referencia y deja 3 campos de estado en `?` | P2 |
| ASEN-A-032 | Paridad UI Gentle Shell 4.8.0 | múltiple | runtime | Parcial | Parcial | No | Sin evidencia | — | **No demostrada** | — | Sin referencia ejecutable | **P1 (no declarar)** |
| ASEN-A-033 | Política de shell del primario cubre TODOS los shell tools | `primary-tool-policy.ts:30,93-97`, `auto-permission-reviewer.ts:71` | security | Sí | **Parcial** | Unitario (RED observado) | **Fallo** | — | — | §E.2 S-07 | `powershell` fuera de `shellTools` → bypass total de la política de shell en Windows | **P1** |

Regla aplicada: **"Sin evidencia" nunca se convirtió en "Verificada".**

---

# E. Informe de estabilidad y rendimiento

## E.1 Ejecución real verificada en este host

| Comando | Resultado | Tiempo |
|---|---|---|
| `npm run typecheck` | **PASS** (exit 0) | 14 s |
| `node scripts/authority-pin.mjs check` | **PASS** — "Authority pin verified: 7 files" | < 1 s |
| Digest de `extensions/authority.ts` | **coincide** con `35731ade…199dd` | — |
| `npm test` | **PASS** (exit 0) — 4.137 tests / 4.075 pass / **0 fail** / 62 skipped | 1.537 s wall (~25,6 min), 1.536 s de duración agregada |

**Corrida real completa, 13 shards.** Conteos por shard (`tests`):

```
330, 450, 440, 547, 485, 622, 413, 331, 236, 63, 35, 76, 109   → 4.137
pass    4.075        fail 0        cancelled 0        todo 0        skipped 62
```

El balance cierra: `4.137 = 4.075 pass + 62 skipped + 0 fail`.

**Segunda corrida completa, posterior a Tanda 1** (13 shards, `exit=0`):

```
330, 450, 440, 547, 485, 628, 362, 375, 247, 63, 35, 76, 109   → 4.147
pass    4.085        fail 0        cancelled 0        todo 0        skipped 62
```

Balance: `4.147 = 4.085 pass + 62 skipped + 0 fail`. Diferencia contra el baseline: **+10 tests**, exactamente los dos archivos nuevos de Tanda 1, con `fail` sin cambios. Duración agregada 1.547 s.

**Tercera corrida completa, posterior a Tanda 0** (13 shards, `exit=0`):

```
330, 450, 440, 547, 485, 628, 362, 375, 250, 63, 35, 76, 109   → 4.150
pass    4.088        fail 0        cancelled 0        todo 0        skipped 62
```

Balance: `4.150 = 4.088 pass + 62 skipped + 0 fail`. Diferencia contra la corrida anterior: **+3 tests**, exactamente los 3 tests nuevos de `tests/upstream-reference-policy-wiring.test.ts` (T0.2), con `fail` sin cambios y `skipped` sin cambios. Duración agregada **1.749 s** (+13,1 % contra el baseline de 1.537 s): la diferencia es **contención de host**, no regresión — durante esa corrida se ejecutaron en paralelo las pruebas de ConPTY del propio harness de captura (el shard 8 pasó de 340 s a 490 s).

## E.1.2 Aceptación en host: primera evidencia real

La aceptación en host dejó de ser "no ejecutada". Con `node-pty@1.1.0` (ConPTY real en Windows) se capturó el flujo ANSI exacto de ambas TUI, con geometría y entorno idénticos:

| Condición | Valor (idéntico en ambos lados) |
|---|---|
| Geometría | `120x40` |
| `TERM` | `xterm-256color` |
| Home | aislado por ejecución (sin credenciales del usuario) |
| Ventana | 45 s, salida por `Ctrl+C` |
| Captura | flujo ANSI crudo, sin filtrar |

| Lado | Artefacto | Bytes | Líneas visibles | TUI |
|---|---|---|---|---|
| ASEN (`dist/cli.js`) | `odd/evidence/asen-4.8.0-comparison/asen-steady.ansi` | 6.122 | 50 | **Renderizada**: banner, barra de estado `ASEN │ rama │ ±23 │ selected unknown/unknown`, `[Context]`, `[Skills]` (26), `[Extensions] asen.ts` |
| Referencia 4.8.0 (`bin/gentle-shell.mjs`) | `odd/evidence/asen-4.8.0-comparison/gentle-shell-4.8.0-steady.ansi` | 17.958 | 148 | **Renderizada**: barra `✿ │ detached │ ctx ▱▱▱▱ ?% │ $0.000`, `Permissions: NORMAL`, `[ Panel ]`, `[Skills]` (18), `[Prompts]`, `[Extensions]` (~35) |

**Lo que esto demuestra:** el arranque `CLI → Pi → TUI` de ASEN funciona de punta a punta en Windows. La captura es del binario reconstruido (`npm run build`), no del `dist/` obsoleto que había en el árbol (ver **S-09**).

**Lo que NO demuestra:** equivalencia. La diferencia observable es grande y va en contra de ASEN: Pi **1.2.0** en ASEN frente a **1.5.2** en la referencia 4.8.0; la referencia muestra un `[ Panel ]` visible por defecto y campos de estado resueltos (`$0.000`, `ctx ▱▱▱▱ ?%`, `usage · alt+u`) donde ASEN deja tres campos en `?` (`responding ?`, `ctx ?`, `cost/sub ?`). El detalle comparativo está en `odd/evidence/asen-4.8.0-comparison/comparison.md`.

**Nota de método (importante para reproducir):** el log se capturó con `Tee-Object`, que en PowerShell 5.1 **corrompió el encoding** de los marcadores: los bytes UTF-8 de `ℹ`/`✔`/`✖` quedaron re-codificados como CP437 (`Ôä╣`, `Ô£ö`). Por eso los conteos **no** se pueden obtener con `Select-String '^✔'` ni con un parser UTF-8 ingenuo: hay que matchear la clave ASCII (`tests`, `pass`, `fail`) y el valor numérico al final de líneas cortas. Un conteo basado en marcadores devuelve `0` y **daría un falso "sin tests"**. El parser usado está en `asen-baseline-count.mjs` (temporal).

Durante la corrida se observó un skip explícito por plataforma:

```
﹣ Git unique bounded labels map collisions to the exact original path
  # Control-character filenames are not supported on Windows
```

Ese skip **no es un fallo**, pero confirma que existe divergencia funcional Windows vs POSIX en nombres de archivo con caracteres de control. Los 62 skips no se auditaron uno por uno: quedan como cobertura no ejecutada en este host.

CI en el SHA auditado (`gh run list --commit 9529b6c1…`):

```
Phase 0 Architecture                        success   19s
R4 automated self-audit (not independent)   success   35s
T07 CodeGraph real CLI probe                success   41s
Pi 1.0 runtime evidence                     success   45s
F5 exact-SHA static verification            success   51s
Release Gate                                success   3m42s
asen-real-agent-acceptance.yml (push)       success   3m23s
CI                                          in_progress
Pi Free Smoke                               skipped
```

**E.1.1 (P2)** `Pi Free Smoke` está `skipped` en el SHA auditado → la única pasada con proveedor gratuito no corre en este commit. `CI` seguía `in_progress` al momento de la auditoría.

## E.2 Estabilidad: hallazgos con causa raíz

### S-01 (P1) Timeout único total aborta fallbacks sanos

- **Síntoma:** un agente con cadena de fallback puede reportar `pi process timed out after 120000ms` aunque cada intento individual fuera sano.
- **Causa raíz confirmada:** `pi-process-runner.ts:242` `timeoutMs=120_000` y `:475` un único `setTimeout` que cubre spawn + preflight + prompt + N `set_model` + N continuaciones + turno final.
- **Evidencia:** `:242`, `:475-477`, `:310-344` (`continueFallback` no rearma ni consulta presupuesto).
- **Consecuencia:** el usuario ve "timeout" y pierde la corrida; el fallback queda desacreditado.
- **Corrección mínima:** presupuesto por fase (spawn/preflight/turno) con deadline monotónico compartido, reportando **qué fase** se agotó. **No** aumentar el número.
- **RED:** `tests/pi-process-runner-fallback-budget.test.ts` — stub que responde `set_model` en 40 ms y tres continuaciones de 30 ms; con `timeoutMs: 100` debe reportar `phase: "turn"` y no `timed out` genérico.
- **Regresión:** timeout real de un proceso colgado (debe seguir cortando), cancelación por `AbortSignal`, y el caso sin fallback.
- **Riesgo de cambio:** medio (ruta caliente). Depende de S-02.

### S-02 (P2) `sendRpc` sin timeout por RPC

- **Síntoma:** un hijo que nunca responde a `set_model` inmoviliza la cadena hasta el deadline global.
- **Causa raíz:** `pi-process-runner.ts:288-293` — el `Promise` sólo se resuelve por respuesta o por `finish()`.
- **RED:** `tests/pi-process-runner-rpc-timeout.test.ts` — hijo que ignora `set_model`; debe fallar dentro de un presupuesto por RPC explícito.
- **Riesgo:** bajo si se acota sólo `set_model`/`set_thinking_level`.

### S-03 (P2) Backpressure de stdin no manejada

- **Síntoma:** prompts grandes se acumulan en el buffer del proceso padre.
- **Causa raíz confirmada:** `:292`, `:443`, `:483` llaman `child.stdin.write(...)` sin inspeccionar el retorno ni esperar `drain`. `stdout` sí está acotado (`maxStream`, `:348`), `stdin` no.
- **Corrección mínima:** esperar `drain` cuando `write()` devuelve `false`, con el mismo presupuesto de fase.
- **RED:** `tests/pi-process-runner-stdin-backpressure.test.ts` — prompt de 8 MB con hijo de lectura lenta; la memoria retenida del padre debe permanecer acotada.
- **Riesgo:** bajo.

### S-04 (P2) `spawnContained` fuera de `try` → rechazo no manejado y temp dir huérfano

- **Síntoma:** `run()` puede devolver una promesa **rechazada** pese a declarar `Promise<AgentResult>`, y dejar el directorio de política temporal sin borrar.
- **Causa raíz confirmada:** `:227-235` crea `policyDirectory`; `:249` llama `spawnContained` dentro del ejecutor de `new Promise` sin `try/catch`. Un throw síncrono (argv inválido, `ENOENT` en algunas plataformas) rechaza la promesa y salta `rmSync` de `finish` (`:279`).
- **Consecuencia:** el llamador recibe un rechazo en vez de `{ok:false}`, y quedan directorios `asen-policy-*` en el temp.
- **RED:** `tests/pi-process-runner-spawn-throw.test.ts` — `command` con byte NUL; debe devolver `{ok:false}` y no dejar directorio temporal.
- **Riesgo:** bajo.

### S-05 (P2) Sin prueba de asentamiento cuando el fallback está deshabilitado

- **Síntoma:** con `fallbackEnabled === false` no se exige `agent_settled`; se acepta `close(0)` + una respuesta correlacionada.
- **Evidencia:** `:258` `finalAgentSettled=!fallbackEnabled`; `:418` el gate de `agent_settled` vive dentro de `if(...fallbackEnabled)`.
- **Consecuencia:** asimetría de garantías entre corridas con y sin fallback. No se observó pérdida de resultado, pero la prueba de finalización es más débil.
- **RED:** `tests/pi-process-runner-no-fallback-settlement.test.ts` — hijo que emite respuesta y cierra sin `agent_settled`; documentar la expectativa explícita (aceptar o rechazar) y fijarla.

### S-06 (P3) `exit` por señal reporta código 1 en el launcher simple

- **Evidencia:** `cli.ts:211` `child.once("exit", code => resolve(code ?? 1))`. Un `Ctrl-C` normal en el hijo se reporta como fallo.
- **Corrección:** propagar `signal` y devolver `130` para `SIGINT`.

### S-07 (P1 — el más severo de esta auditoría) `powershell` queda fuera de la política de shell del agente primario

- **Síntoma observable:** en Windows, el agente primario puede ejecutar cualquier comando por el tool `powershell` sin clasificación de comandos destructivos, sin chequeo de rutas sensibles, sin protección de `permission-mode.json`, sin preflight de entrega, sin marcadores de conflicto y sin confirmación interactiva. Ningún test lo detecta porque ningún test invoca `powershell`.
- **Causa raíz confirmada (estática):** `src/security/primary-tool-policy.ts:30` define el conjunto de shell como
  `new Set(["bash","bash_background","monitor","asen_background_start"])`.
  `powershell` **no está**. El flujo de `:93-97` decide así: si el tool no está en `fileTools`, no está en `shellTools` y no está en `consentTools`, devuelve `undefined` (= permitido) salvo que `auto` pida revisión. Ergo `powershell` **nunca entra** a la rama de shell de `:99-140`.
- **Evidencia de que `powershell` es un tool real y de primera clase:**
  - `node_modules/@earendil-works/pi-coding-agent/dist/core/tools/index.js:16-22` — `allToolNames` = `read, bash, powershell, edit, write, grep, find, ls`.
  - `.../dist/core/tools/powershell.js:16` — `name: "powershell"`, y `:12` su ejecutor recibe `command`, igual que `bash`.
  - `src/security/auto-permission-reviewer.ts:71` repite la misma lista de cuatro nombres, así que el revisor independiente de Auto tampoco lo trata como shell (pierde la evidencia de script de `autoScriptEvidence`).
  - `src/cli.ts:39` sólo lista `--tools` entre los flags que reenvía a Pi; ASEN **no** impone una allowlist propia, por lo que el conjunto por defecto de Pi aplica.
- **Clasificación honesta de la evidencia:** **estática + prueba unitaria con RED observado**. NO se ejecutó un comando destructivo real por `powershell` contra el host. La severidad no depende de que el host tenga `powershell` habilitado: la política es fail-open por construcción, y en Windows (la plataforma auditada) ese es el shell natural.
- **Componentes afectados:** `src/security/primary-tool-policy.ts`, `src/security/auto-permission-reviewer.ts`, `src/security/yolo-delivery-policy.ts` (nunca recibe comandos de `powershell`), `src/review/delivery-preflight.ts`, `src/security/delivery-conflict-markers.ts`.
- **Consecuencia para el usuario:** los modos `normal`, `yolo` y `super-yolo` dejan de significar lo que dicen en Windows. Un push, un `rm` recursivo o una reescritura de `.asen/permission-mode.json` pueden ocurrir sin la compuerta que el resto del producto sí aplica a `bash`.
- **Corrección mínima:** agregar `"powershell"` a `shellTools` en `primary-tool-policy.ts:30` y a la lista de evidencia en `auto-permission-reviewer.ts:71`. Es un cambio de una palabra en cada archivo; toda la maquinaria de `:99-140` se reutiliza sin tocar.
- **RED:** `tests/primary-tool-policy-shell-admission.test.ts` — **RED ya observado**: `powershell` con `git push origin main && git reset --hard HEAD` devuelve `undefined` (permitido) mientras `bash` devuelve `block:true`. Igual con `Set-Content .asen/permission-mode.json yolo` en los cuatro modos.
- **GREEN/regresión:** `powershell` debe dar la misma denegación que `bash`; las tres herramientas existentes deben seguir pasando `printf ordinary` sin confirmación (`tests/primary-tool-policy.test.ts:23-30` es el contrato); las denegaciones duras deben seguir sin abrir UI.
- **Riesgo de cambio:** bajo. La rama de shell ya está probada con tres nombres; agregar un cuarto no cambia su lógica. El riesgo real es el inverso: **dejarlo**.
- **Dependencias:** ninguna. Va en la misma tanda que T1.2 porque comparten archivo y clase de defecto.

### S-08 (P2) El gate `check:skip-baseline` no puede ejecutarse en Node 24

- **Síntoma observable:** el script de control de skips lanza `EINVAL` y no produce veredicto. El guard que debería detectar una suba de cobertura omitida **no existe en la práctica**.
- **Causa raíz confirmada (ejecución real):** `scripts/check-skip-count.mjs` invoca `spawn("npm.cmd", …)` sin `shell: true`. En Node 24 sobre Windows, `spawn` de un `.cmd` sin shell lanza `EINVAL` (`UV_EINVAL`).
- **Estado del archivo:** **sin modificar en git** → preexistente, no introducido por las tandas.
- **Consecuencia:** la cobertura de skips no está realmente vigilada; el gate reporta "verde" por ausencia de ejecución. Con el baseline actual (máximo por shard = 15, baseline agregado = 22) el veredicto esperado sería "dentro de presupuesto", pero **no se pudo observar** porque el script aborta antes de comparar.
- **Corrección mínima:** `spawn("npm.cmd", args, { shell: true })` o resolver el binario de npm vía `process.env.ComSpec` / `npm_execpath`.
- **RED:** ejecutar `npm run check:skip-baseline` y exigir salida 0 con veredicto impreso. **RED ya observado**: `EINVAL` en el spawn.

### S-09 (P3) `dist/` obsoleto ⇒ TUI muda (artefacto de build, no defecto de fuente)

- **Síntoma observable:** `node dist/cli.js` en un PTY real producía 45 bytes (alt-screen on, clear, título `pi`, alt-screen off) y **ninguna UI**, con el proceso vivo hasta el `Ctrl+C`.
- **Causa raíz confirmada:** el `dist/` presente en el árbol se había construido el **2026-11-14 23:53**, anterior al PR #59 y a las correcciones de Tanda 1; `src/` tenía archivos más nuevos (`2026-11-15 10:39`). El binario obsoleto entraba a pantalla alternativa y salía sin renderizar.
- **Prueba de causalidad:** tras `npm run build` (`dist/cli.js` = `2026-11-15 11:16:11`), la misma invocación en el mismo PTY renderiza la TUI completa (6.122 bytes, 50 líneas visibles).
- **Clasificación honesta:** es un **artefacto de checkout**, no un defecto de código fuente. `dist/` no está versionado, así que un checkout recién clonado no tiene `dist/` y no suffers este modo de fallo; un checkout con `dist/` viejo sí.
- **Consecuencia:** cualquier evidencia de aceptación tomada contra un `dist/` no reconstruido es **inválida** (y por eso la primera captura de ASEN de esta auditoría quedó anulada).
- **Corrección mínima:** ninguna en el producto; regla operativa: reconstruir `dist/` antes de cualquier evidencia de host, y documentar el SHA/fecha del binario usado.

### S-10 (P2) El home aislado de ASEN no tiene credenciales; el mecanismo de enlace existe pero el proveedor configurado no responde

- **Síntoma observable:** con el home aislado por defecto (`~/.asen/agent`), la TUI de ASEN muestra `Warning: No models available. Use /login to log into a provider via OAuth or API key` y `selected unknown/unknown`. En el mismo host, Pi directo sí muestra un modelo (`beam`).
- **Causa raíz confirmada (medición de estado, sin leer secretos):**
  - `~/.asen/agent/auth.json` = **2 bytes** (`{}`) → sin autenticación.
  - `~/.pi/agent/auth.json` = **3.278 bytes**, con entradas `openai-codex`, `ollama-cloud`, `qwen-cloud`, `opencode-console`, `cloudflare-workers-ai`.
  - `src/runtime/launcher.ts:154-158` resuelve el home: `--link` → `~/.pi/agent`; `--isolated`/default → `~/.asen/agent`. El mecanismo de enlace **existe y funciona**.
- **Hallazgo de proveedor (ejecución real, sin gasto):** una invocación en modo enlazado alcanzó un proveedor configurado y devolvió `{"type":"api_error", … "Add usage credits or subscribe … ollama.com/plans"}` → la cuenta del proveedor **no tiene créditos**. No se completó ninguna generación.
- **Consecuencia:** la aceptación con proveedor real está bloqueada por **entitlements de la cuenta**, no por falta de configuración ni de código. Además explica por qué ASEN y la referencia no son comparables en estado de modelo por defecto: ASEN aísla, la referencia copia ajustes de `~/.pi/gentle-ai`.
- **Corrección mínima (fuera del alcance de las tandas correctivas):** documentar `--link` como camino de proveedor real y ofrecer una comprobación de entitlement antes de prometer "host acceptance".

### S-11 (P2) ASEN embebe Pi 1.2.0; la referencia 4.8.0 corre Pi 1.5.2

- **Síntoma observable (captura comparable):** la barra de estado de ASEN renderiza `▀▀█  v1.2.0` y un aviso `Update Available — New version 1.5.2 is available. Run pi update`; la referencia 4.8.0 renderiza `▀▀█  v1.5.2`.
- **Causa raíz confirmada:** `src/cli.ts:36` resuelve el Pi embebido como `node_modules/@earendil-works/pi-coding-agent/dist/cli.js`; la versión instalada en el árbol es **1.2.0**.
- **Consecuencia:** buena parte de la diferencia visual no es de ASEN sino del runtime base. Cualquier comparación de UI contra 4.8.0 que no iguale la versión de Pi **mide dos runtimes distintos**. La captura comparable de esta auditoría lo documenta explícitamente en lugar de atribuirlo a ASEN.
- **Riesgo de subir Pi:** **alto** (contrato de tools, hooks de extensión y RPC de Pi 1.2→1.5). No se aborda en las tandas correctivas: requiere su propio ODD.

### S-12 (P3) El presupuesto global del arnés de pruebas deja ~3 % de margen en este host

- **Síntoma observable:** la corrida completa posterior a Tanda 3.2 terminó con **exit 1** sin un solo test fallido: `TEST_RUNNER_TIMEOUT owner=test-runner scope=overall chunk=process-heavy-4 members=tests/pi-agent-runtime.test.ts,tests/spawn-contained.test.ts,tests/lifecycle-tdd-completion.test.ts,tests/workspace-attribution.test.ts elapsed_ms=218996 limit_ms=218972 cleanup=confirmed`. El chunk murió por **24 ms**.
- **Causa raíz confirmada (lectura de `scripts/run-tests.mjs`):** `DEFAULT_LIMITS.overallMs = 1_800_000` (30 min) y los chunks se ejecutan **secuencialmente** (`for (const testRun of runs) { await run(...) }`). La duración agregada medida de la corrida post-T0 fue **1.749,2 s**: el margen del presupuesto global es del **2,8 %**.
- **Evidencia:** los 6 shards completados de esa corrida = **2.880 tests / 2.857 pass / 0 fail / 23 skipped**, y el chunk 7 fue terminado por el watchdog. La causa fue **convención de host**: durante esa corrida se ejecutaron en paralelo capturas ConPTY y un `npm run build` (la propia auditoría lo advertía en §E.4).
- **Consecuencia:** en este host el veredicto "suite verde" **no es reproducible** sin margen: una carrera de trabajo concurrente —no un defecto de producto— se presenta como un fallo de la suite. Esto ya se había observado en la corrida post-T0 (shard 8: 340 s → 490 s) y por eso el presupuesto se volvió a rozar.
- **Corrección mínima (sin tocar el producto):** el arnés **ya expone** `ASEN_TEST_OVERALL_TIMEOUT_MS` (`ENV_LIMITS`, `resolveWatchdogLimits`). La corrida definitiva de esta auditoría debe declarar un presupuesto explícito y registrarlo junto al resultado, de modo que el número sea reproducible y la diferencia con el default quede documentada.
- **Estado del archivo:** **sin modificar en git** → preexistente, no introducido por las tandas.
- **Riesgo:** bajo (P3, infraestructura de pruebas). **No es** un timeout de producto: no se tocaron ni `timeoutMs` del runner ni ninguna política de expiración de ASEN.

## E.3 Condiciones de carrera evaluadas

| Escenario | Resultado |
|---|---|
| Doble `finish()` | **Protegido** — guard `settled` (`:273-275`) |
| `stop()` en carrera con `close` | **Protegido** — guard `stopResult` (`:451`) |
| `agent_settled` duplicado/tardío | **Protegido** — `continuationAcked` + `continuationMessageEnded` + `continuationAgentEnded` (`:418-433`) |
| Settled coalescido en un mismo chunk | **Protegido** — `deferredContinuationSettled` (`:338-340`) |
| `set_model` respondido fuera de orden | **Protegido** — ids correlacionados (`:288-292`, `:355-359`) |
| Escritura concurrente a JSON de estado | **Parcial** — `exclusive-file-lock.ts` + `atomic-write.ts` existen y están pinneados, pero `todos.json`/`profiles.json` no pasan por el lock en todos los caminos |
| Timeout vs fase | **No protegido** — S-01 |

## E.4 Rendimiento: datos obtenidos y faltantes

**Medido en este host (Windows):**

| Métrica | Valor | Nota |
|---|---|---|
| `tsc --noEmit` | 14 s | |
| `authority-pin check` | < 1 s | |
| Suite completa (baseline, 13 shards) | **1.537 s agregados ≈ 25,6 min** | corregido: la cifra "~7 min" que figuraba en el borrador era una estimación sin dato detrás |
| Suite completa (post-T1) | **1.547 s agregados ≈ 25,8 min** | +0,7 % vs baseline |
| Suite completa (post-T0) | **1.749 s agregados ≈ 29,1 min** | +13,1 % vs baseline, por concurrencia del host (shard 8: 340 s → 490 s) |
| Archivos `src/` | 245 (27.734 LOC) | |
| Arranque de Pi + TUI hasta primer frame | **< 12 s** en PTY (ASEN y referencia) | ventana de 45 s, primer frame visible antes de 12 s |
| ConPTY (PTY real en Windows) | **FUNCIONAL** — `node-pty@1.1.0`, ANSI real capturado | habilita aceptación en host automatizable |
| Referencia 4.8.0 ejecutable | **SÍ** — `C:\gentle-shell` @ `3dc902975`, `npm install` de 186 paquetes, arranque y TUI verificados | primer arranque provisiona paquetes companion y pregunta por modo por lotes |

**MEASUREMENT MISSING — no instrumentado y no declarable:**

- Tiempo hasta primera respuesta (TTFR)
- Arranque de Pi y de ASEN
- Creación de subagente (spawn → primer `tool_execution_start`)
- Latencia RPC por mensaje
- CPU/RAM por sesión y por subagente
- Número de procesos por corrida
- Tokens y llamadas a proveedor
- Tiempo agente-finalizado → UI actualizada
- Secuencial vs 2 agentes en paralelo

**Instrumentación requerida:** los observers `onProcessStart`, `onProcessClose`, `onToolExecution`, `onAssistantTextDelta` (`pi-process-runner.ts:40-45`) **ya existen y son el punto correcto**. Falta un colector que los persista con timestamps monotónicos y un comando de reporte. No requiere cambios de arquitectura.

**Ineficiencias estáticas detectadas:**
- `src/cli.ts:173-178` recorre `parsed.passthrough` tres veces con lógica de opciones solapada.
- `getPanelSnapshot` recalcula git + perfiles en cada inspección sin caché de sesión (correcto por frescura, costoso en repos grandes).
- `detectPlatform` se reimplementa inline en 20+ sitios en lugar de usar `platform/platform.ts` (que está DEAD).

---

# F. Plan ODD + TDD correctivo

Reglas del plan: no duplica ODD existentes; cada tanda es independiente en superficie de edición; ninguna propuesta es una gran reescritura.

## Tanda 0 — Verdad documental (P1, sin código productivo)

**Objetivo:** dejar de afirmar garantías inexistentes. Es la corrección de mayor valor por menor riesgo.

| Tarea | Archivos | Aceptación |
|---|---|---|
| T0.1 Anotar los 8 módulos inalcanzables con `@unreachable` + ADR de decisión | `session-orchestrator.ts`, `review-receipt.ts`, `receipt-verifier.ts`, `command-registry.ts`, `workspace-lock-table.ts`, `notice-ring-buffer.ts`, `activity-stream.ts`, `permission-hash-cache.ts` | Cada uno declara estado real y consumer esperado |
| T0.2 Corregir afirmaciones de paridad sin consumidor | `scripts/upstream-reference-policy.mjs` (**13 entradas**: 8 de `src/` + 5 fixtures de `tests/`), `scripts/upstream-reference-policy.d.mts` | El script distingue `kind: "production" \| "test"` y `wired: true \| false` |
| T0.3 Retirar "equivalencia 4.8.0" de conclusiones sin captura comparable | ODD de paridad | Ninguna afirmación 4.8.0 sin referencia ejecutable |

**Riesgo:** nulo. **Dependencias:** ninguna.

### Resultado de Tanda 0 (ejecutada)

| Subtarea | Estado | Evidencia |
|---|---|---|
| T0.1 | **GREEN** | Cabecera `@unreachable` en los 8 módulos, cada una con el consumer previsto. Reachability re-verificada de forma independiente: los 8 sólo los importa `session-orchestrator.ts` y/o sus propios tests. `typecheck` PASS (anotaciones sin efecto de tipo). **Actualizado por T3.2**: 2 de los 8 (`review-receipt.ts` y `receipt-verifier.ts`) dejaron de ser inalcanzables y su cabecera fue reemplazada por la de cableado real; los 6 restantes conservan la anotación. |
| T0.2 | **GREEN** | `scripts/upstream-reference-policy.mjs` expone `compatibilityWiringOf`, `listCompatibilityEntries`, `listUnwiredCompatibilityEntries`, `compatibilityEntriesWithoutWiring`. Declaraciones espejadas en `scripts/upstream-reference-policy.d.mts`. Test nuevo `tests/upstream-reference-policy-wiring.test.ts` (**3 tests**, GREEN): cada declaración se contrasta contra importadores reales en `src/`, `extensions/`, `bin/`. Resultado: **3 módulos conectados** (`tool-overlay`←`pi-process-runner`, `delivery-preflight`←`primary-tool-policy`, `execution-surface-guard`←`primary-tool-policy`) y **5 sin cablear** (`desktop-rpc`, `guide-tour`, `image-disk-cache`, `reply-language-anchor`, `voice-dictation`). |
| T0.3 | **GREEN (reinterpretado)** | El ODD de paridad ya no afirmaba equivalencia: la debilidad real era que `CONECTADO` estaba **declarado a mano**. Se convirtió en **invariante verificable por máquina**: `CONECTADO` ahora significa "wiring comprobado por `upstream-reference-policy`", con la lista de 3 conectados y 5 sin cablear a la vista. No hacía falta retractar ninguna afirmación de equivalencia. |

**Verificación de Tanda 0:** `npm test` completo → **4.150 tests / 4.088 pass / 0 fail / 62 skipped**, `exit=0` (+3 tests contra post-T1, exactamente los 3 de T0.2). Gates de auditoría: `audit:upstream-boundary`, `audit:parity`, `audit:ecosystem`, `audit:ef-plan` **PASS**; 21 tests de doc/paridad/surface **PASS**.

**Corrección de alcance registrada:** la regla 10 de la auditoría es una **facultad** ("Puedes organizar dos subagentes"), no un requisito. Se dejó de contar como hueco y se documentó la causa técnica del bloqueo (`subagent` vs `task` en `~/.config/opencode/opencode.json`).

## Tanda 1 — Integridad de estado y admisión de shell en la capa de tools (P1)

**Tarea T1.1** Extender la protección de rutas human-owned a `.asen/` completo en `createPrimaryToolPolicyHandler`.

- **Síntoma:** el agente primario puede `write` sobre `todos.json`, `agents.json`, `task-agent-links.json`, `rdd-policy.json`, `profiles.json`.
- **Causa raíz confirmada:** `.asen` sólo se valida en `writer-authorization-snapshot.ts:65`; `primary-tool-policy.ts:151-157` sólo protege `protectedPreferenceFile`.
- **Corrección mínima:** añadir un `protectedStateDirs` (por defecto `~/.asen`, `<cwd>/.asen`) con la misma comprobación canónica ya usada en `:152-156`, manteniendo la excepción de lectura.
- **RED:** `tests/primary-tool-policy-state-integrity.test.ts` — `write` a `.asen/todos.json` debe `block:true`; lectura debe seguir permitida.
- **GREEN/regresión:** `permission-mode.json` sigue bloqueado; `write` a archivo normal del proyecto sigue permitido; `grep`/`ls` sobre `.asen` no se rompen.
- **Riesgo:** medio — puede bloquear flujos legítimos del host. Requiere lista de excepciones explícita.
- **Dependencia:** ninguna.

**Tarea T1.2** Cerrar el fail-open de shell malformado.

- **Síntoma:** en modo `normal`, `command` no-string devuelve `undefined` (permitido).
- **Evidencia:** `primary-tool-policy.ts:104` (comando no-string) y `:100` (input no-objeto, mismo fail-open).
- **Corrección:** `denied("malformed shell command")` en todos los modos, antes de cualquier atajo.
- **RED:** `tests/primary-tool-policy-shell-admission.test.ts` (tests 1 y 2).
- **Riesgo:** bajo.

**Tarea T1.2b** Admitir `powershell` en la política de shell (ver §E.2 S-07, ASEN-A-033).

- **Síntoma:** `powershell` no está en `shellTools`, así que en `normal`/`yolo`/`super-yolo` devuelve `undefined` y se salta toda la política de shell.
- **Evidencia:** `primary-tool-policy.ts:30,93-97`; `auto-permission-reviewer.ts:71`; `pi-coding-agent/dist/core/tools/index.js:16-22` y `powershell.js:12,16`.
- **Corrección:** agregar `"powershell"` a `shellTools` y a la lista de evidencia del reviewer de Auto. Una palabra por archivo.
- **RED:** `tests/primary-tool-policy-shell-admission.test.ts` (tests 3 y 4) — **RED ya observado**.
- **GREEN/regresión:** `tests/primary-tool-policy.test.ts:23-30` (los tres shell tools siguen pasando `printf ordinary` sin confirmación) + test 5 del archivo nuevo.
- **Riesgo:** bajo. **Dependencia:** ninguna.
- **Estado de la verificación:** RED observado con evidencia **estática + unitaria**; no se ejecutó un comando destructivo real por `powershell` contra el host.

### Resultado de Tanda 1 (ejecutada)

Implementada y verificada en el host. Evidencia RED → GREEN:

| Fase | Test | Resultado |
|---|---|---|
| RED | `tests/primary-tool-policy-state-integrity.test.ts` | 4 fail + 1 pass (guard de regresión) |
| RED | `tests/primary-tool-policy-shell-admission.test.ts` | 4 fail + 1 pass (guard de regresión) |
| GREEN | ambos archivos nuevos | 10/10 pass |
| GREEN | regresión de política (6 archivos) | 49 tests, 47 pass, 0 fail, 2 skips preexistentes del host |
| GREEN | `npm run typecheck` | PASS (11,4 s) |
| GREEN | `node scripts/authority-pin.mjs check` | PASS — 7 archivos |
| GREEN | **`npm test` completo** | **exit 0 — 4.147 tests / 4.085 pass / 0 fail / 62 skipped** |

Conteos por shard de la corrida completa: `330, 450, 440, 547, 485, 628, 362, 375, 247, 63, 35, 76, 109` → **4.147**. Balance: `4.147 = 4.085 pass + 62 skipped + 0 fail`. Duración agregada 1.547 s (~25,8 min).

**Hallazgo colateral de la ejecución (relevante para el método):** dos tests existentes **codificaban el defecto como contrato**, no sólo lo dejaban sin cubrir.

1. `tests/primary-tool-policy.test.ts` — el test se llamaba "shell selection matches Normal mode and malformed recognized shell input passes through" y asertaba `powershell` → `undefined` **y** input malformado → `undefined`. Es decir: el fail-open de T1.2 y el de T1.2b estaban afirmados como comportamiento esperado en un solo test.
2. `tests/extension-runtime-commands.test.ts:250` — dentro del test "production composition registers one selective primary guard without replacing shared or child hooks", la misma función que verifica que el guard del primario es selectivo y no reemplaza los hooks compartidos, asertaba `{toolName:"powershell", command:"git reset --hard HEAD"}` → `undefined`.

El segundo es el dato más serio de esta auditoría sobre el estado del producto: el bypass estaba **institucionalizado como expectativa** en el test de composición de producción. Ambos tests se corrigieron preservando su intención original (el de composición conserva la prueba de selectividad usando `custom_shell`, que sigue fuera de la política estrecha).

**Riesgo residual no corregido (declarado, no silenciado):** cualquier tool tipo-shell registrada por una extensión (por ejemplo `custom_shell`) sigue sin clasificarse en la política del primario. Cerrarlo requiere una allowlist explícita; pasar a "denegar lo desconocido" rompería todas las tools propias de ASEN. Fuera del alcance de Tanda 1.

## Tanda 2 - Runner de Pi: presupuesto y backpressure (P1)

**T2.1** Presupuesto por fase con deadline monotónico (S-01 + S-02).
**T2.2** Espera de `drain` en stdin (S-03).
**T2.3** `try/catch` alrededor de `spawnContained` + limpieza garantizada del temp dir (S-04).
**T2.4** Decisión explícita y probada sobre asentamiento sin fallback (S-05).

- **Aceptación conjunta:** `tests/pi-process-runner-budget.test.ts`, `…-rpc-timeout.test.ts`, `…-stdin-backpressure.test.ts`, `…-spawn-throw.test.ts`, `…-no-fallback-settlement.test.ts`.
- **Regresión obligatoria:** los 6 tests de PR #59 (`pi-process-runner.test.ts`) deben seguir verdes sin modificación — son el contrato de no-regresión.
- **Riesgo:** alto (ruta caliente). Ejecutar como una sola tanda con revisión independiente.

### Resultado de Tanda 2 (ejecutada)

**Defectos que cierra:** S-01 (un único timeout global mataba cadenas de fallback sanas), S-02 (RPC sin presupuesto propio), S-03 (backpressure de stdin ignorada), S-04 (`spawnContained` fuera de `try` → promesa rechazada + temp huérfano) y S-05 (contrato de asentamiento implícito y sin prueba).

**RED observado antes del cambio (5/5 dimensiones fallan):**

| RED | Salida observada con el código anterior |
|---|---|
| T2.1 cadena de fallback sana | `pi process timed out after 100ms` — el timeout global mataba la cadena |
| T2.1 fase agotada | `pi process timed out after 120ms` — sin nombrar la fase |
| T2.2 `set_model` sin respuesta | `pi process timed out after 200ms` — el RPC sin respuesta no se identificaba |
| T2.3 backpressure | `SyntaxError: … does not provide an export named 'writeStdinLine'` — no existía el contrato |
| T2.4 spawn sincrónico | `TypeError [ERR_INVALID_ARG_VALUE]` escapaba del `run()` (la promesa se rechazaba) |

**Cambios (1 archivo de producto + 5 archivos de prueba + 1 helper):**

| Archivo | Cambio |
|---|---|
| `src/agents/pi-process-runner.ts` | (a) **Fases con presupuesto propio y reloj monotónico** (`performance.now()`): `spawn → preflight → turn`. Cada fase recibe el mismo `timeoutMs`; el número **no** se aumentó. El error nombra la fase: `pi process timed out after Nms (phase: turn)`. (b) **El presupuesto de turno se rearma en cada intento**: una cadena de fallback sana ya no hereda el tiempo del intento anterior. (c) **Presupuesto por RPC** en `sendRpc`: un RPC sin respuesta resuelve con `rpc timeout after Nms (set_model)` y ese motivo viaja al resultado final. (d) **Backpressure de stdin**: helper exportado `writeStdinLine()` que espera `drain` cuando `write()` devuelve `false`, con un único escritor serializado que conserva el orden de los RPC. (e) **`spawnContained` dentro de `try/catch`**: un fallo sincrónico resuelve `{ok:false,"pi process failed to start: …"}` y borra el directorio de política temporal. (f) **Contrato de asentamiento explícito** (`settlementRequired`) documentado en el código y fijado por pruebas. |
| `tests/helpers/pi-rpc-fixture.ts` | Harness compartido: hijo Pi falso que responde `get_commands` como Pi (extensión de autoridad + skills nativas) y reenvía el resto de los RPC al escenario de cada prueba. |
| `tests/pi-process-runner-budget.test.ts` | 2 tests: cadena sana que excede el presupuesto simple (GREEN) y turno estancado que nombra la fase. |
| `tests/pi-process-runner-rpc-timeout.test.ts` | 1 test: `set_model` ignorado falla con presupuesto propio y nombra el RPC. |
| `tests/pi-process-runner-stdin-backpressure.test.ts` | 3 tests: contrato del helper (espera `drain` / no espera si el write es aceptado) y prompt de 2 MB que llega íntegro. |
| `tests/pi-process-runner-spawn-throw.test.ts` | 1 test: comando con byte NUL resuelve `ok:false` y no deja `asen-policy-*` (temp del test aislado por `TEMP`/`TMP`). |
| `tests/pi-process-runner-no-fallback-settlement.test.ts` | 2 tests que **fijan** el contrato de asentamiento (sin cadena: respuesta correlacionada + salida limpia completan la corrida; con cadena: un turno que no asienta se rechaza). |

**Decisión sobre S-05 (explícitada, no evitada):** con **sin** cadena de fallback, la respuesta correlacionada más una salida limpia **es** la prueba de finalización; `agent_settled` sólo es obligatorio cuando una cadena de fallback puede reemplazar el turno. Exigir `agent_settled` siempre rechazaría toda corrida de sólo lectura (el fixture Pi real no lo emite), es decir, rompería el contrato de PR #59. La asimetría se **conserva deliberadamente** y queda **fijada por pruebas** en lugar de implícita. El código lo declara con la constante `settlementRequired` y un comentario que apunta al archivo de pruebas.

**Verificación:**

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | **PASS** (exit 0) |
| Tests nuevos de Tanda 2 | **9/9 PASS** (`duration_ms 6.225`) |
| **Regresión `tests/pi-process-runner.test.ts` (archivo sin modificar)** | **73/73 PASS**, 0 fail, 93,4 s |
| Colindantes (`pi-child-selection`, `pi-child-selection-ui`, `pi-agent-runtime`, `spawn-contained`, `spawn-contained-policy`, `pi-authority-temp-load`, `pi-artifact-runner`, `pi-process-runtime-selection`, `dispatcher`) | **149 pass / 0 fail / 2 skipped** |

**Riesgo del cambio:** item 3 (contrato compartido: el runner de Pi es la ruta caliente de todos los agentes) + item 4 (orden asíncrono: `drain`, temporizadores por RPC y rearmado de fases tocan el orden de eventos). Verificación proporcional ejecutada: contrato de no-regresión íntegro + 9 pruebas nuevas + 9 archivos colindantes. **Pendiente:** suite completa (ver abajo) y revisión independiente.

**Corrección de alcance registrada:** el RED de S-01 tal como estaba escrito en el borrador (`timeoutMs: 100`) no discriminaba: el arranque del hijo falso de prueba (~200 ms en este host) consumía el presupuesto y el fallo ocurría en `preflight`, no en la cadena de fallback. Los presupuestos de las pruebas se ajustaron a **2.000 ms** con la cadena calibrada a ~3.300 ms, de modo que el RED mide exactamente lo que S-01 afirma.

## Tanda 3 — Consolidación de duplicados (P2)

**T3.1** Decidir por conjunto duplicado: **conservar / conectar / consolidar / retirar**.

| Conjunto | Recomendación | Justificación |
|---|---|---|
| `command-registry` vs `command-catalog`+`command-palette` | **Retirar** el registro | El producto usa el catálogo; el registro duplica |
| `workspace-lock-table` vs `exclusive-file-lock` | **Retirar** la tabla | El lock real está pinneado en la autoridad |
| `permission-hash-cache` vs `permission-session`+`auto-permission-reviewer` | **Retirar** el caché | El segundo es el cableado y es fail-closed |
| `notice-ring-buffer` vs `projectHostStatus`/notificaciones | **Consolidar** en `notification-projection` | Evitar dos colas de avisos |
| `activity-stream` vs `native-work-panel` | **Retirar** el formatter | El panel ya renderiza estado real |
| `review-receipt`+`receipt-verifier` vs `review-acceptance` | **Conectar** (no retirar) | Ver T3.2 |

**T3.2** Conectar el recibo HMAC a `review-acceptance`: el `evidence` del veredicto debe incluir el `treeSha` + conteos de test firmados, y `acceptReviewedTask` debe exigir `verifyReviewReceiptSigned` cuando exista recibo, con fallback declarado a verificación estructural.

- **RED:** `tests/review-acceptance-receipt.test.ts` — veredicto `pass` con recibo HMAC inválido debe quedar `blocked`, aunque la forma del veredicto sea correcta.
- **Riesgo:** medio. **Depende de** T0.1 (decisión) y T1.1 (protección de `receipts/`).

### Resultado de Tanda 3.2 (ejecutada)

**Defecto que cierra:** el camino vivo de aceptación de revisiones **nunca verificaba un recibo**. `ReceiptVerifierService` (el único verificador HMAC estricto) sólo lo importaba `session-orchestrator.ts`, que a su vez es inalcanzable: el subsistema de integridad de recibos era **código muerto en producción**. Un `pass` del modelo con evidencia inventada bastaba para llegar al diálogo de confirmación humana.

**RED observado (4/4 fallos antes del cambio):**

| Test | RED observado |
|---|---|
| recibo HMAC manipulado | la aceptación devolvió `accepted` (el recibo no se miraba) |
| recibo HMAC auténtico | `details.verification` = `undefined` (no existía el canal de verificación) |
| recibo de otro árbol | sin bloqueo (el `treeSha` firmado no se comparaba) |
| sin recibo | sin fallback declarado |

**Cambios (3 archivos de producto + 1 test):**

| Archivo | Cambio |
|---|---|
| `src/evidence/receipt-verifier.ts` | Nuevo `readReceiptState(commitSha)` → `absent` / `invalid(motivo)` / `valid(recibo)`. Distingue "no hay recibo" de "hay recibo y no es auténtico" (esto último antes era indistinguible porque `readReviewReceipt` se tragaba el error). Verifica además que el `commitSha` del recibo coincida con el archivo. Cabecera `@unreachable` retirada: el módulo **ahora tiene consumidor vivo**. |
| `src/runtime/review-acceptance.ts` | `resolveReviewVerification()`: si hay recibo, exige recibo **auténtico** (`verifyReviewReceiptSigned`), `verdict === "PASSED"` y `receipt.treeSha` **igual al árbol real del HEAD** (`git rev-parse HEAD^{tree}`). Si el recibo está presente y falla cualquiera de las tres comprobaciones → `blocked` **antes** de preguntar al humano. Sin recibo → fallback **declarado** `structural-fallback` (árbol limpio + HEAD exacto + agente autenticado + confirmación humana). `ReviewApprovalRequest` incorpora `verification` con `treeSha` y conteos de test firmados. La re-verificación CAS re-comprueba el recibo, porque `evidence()` se vuelve a ejecutar dentro de `acceptReviewedTask`. |
| `extensions/asen.ts` | Cablea `new ReceiptVerifierService(~/.asen/receipts)` y muestra en el diálogo de confirmación los hechos firmados (`árbol`, `passed/total`, `runner`) o, en su ausencia, declara explícitamente el fallback estructural. Los hechos firmados van en un campo **separado** de la `evidence` del modelo: no se mezclan hallazgos del agente con datos del sistema. |
| `tests/review-acceptance-receipt.test.ts` | 4 tests nuevos (RED→GREEN). |

**Verificación:** `typecheck` **PASS** (exit 0). Enfocado: **27/27** PASS en `review-acceptance-receipt` + `review-acceptance` (contrato preexistente, sin modificar) + `receipt-verifier` + `review-receipt` + `review-receipt-hmac`. `extension-runtime-commands`: **22 pass / 1 skip / 0 fail**. `upstream-reference-policy-wiring`: **3/3 PASS** (la entrada no estaba afectada).

**Prueba mecánica de cableado (no declarativa):** `node scripts/asen-reachability-audit.mjs` → `src/evidence/receipt-verifier.ts` y `src/evidence/review-receipt.ts` aparecen ahora en la lista **`wired`** (190 módulos alcanzables desde `extensions/asen.ts` y `src/cli.ts`). Antes de T3.2 no estaban. Los 4 módulos que siguen inalcanzables son `project-memory-restore-plan`, `project-memory-restore-stage`, `platform/platform` y `tasks/task`.

**Límite honesto que esta tanda NO cierra:** el producto **no produce** recibos (no hay escritor de producción de `createReviewReceiptSigned`/`writeReviewReceipt`; sólo los tests). Conectar la verificación no equivale a tener recibos: hoy la ruta viva sigue cae en el fallback estructural, y lo que T3.2 garantiza es que **cuando exista** un recibo, éste manda. ElProducto necesita su propio ODD para emitir recibos firmados en el flujo de revisión.

## Tanda 4 — Ciclos y god-directory (P2, estructural)

**T4.1** Romper el ciclo de 24 nodos por los bordes de menor acoplamiento: extraer `core/types` y `evidence/review-execution` a un estrato inferior sin imports de `lifecycle`/`flow`.
**T4.2** Subdividir `src/runtime` en `runtime/agents`, `runtime/ui`, `runtime/lifecycle`, `runtime/managed` **sólo moviendo archivos** (sin cambios semánticos), en una tanda puramente mecánica verificada por `typecheck` + suite.

- **Aceptación:** `node scripts`-based graph check sin ciclos > 5 nodos; `npm run check` verde.
- **Riesgo:** medio. **No mezclar** con Tandas 1-3.

## Tanda 5 — Operación y entrega (P2/P3)

| Tarea | Detalle | Prioridad |
|---|---|---|
| T5.1 | `asen setup` ejecutable o retirado de la ayuda | P2 |
| T5.2 | `dist/` stale: añadir chequeo en `doctor` que compare mtime de `dist` vs `src` y avise | P2 |
| T5.3 | `review-acceptance` bloqueado por untracked: documentar y ofrecer diagnóstico explícito en el mensaje | P2 |
| T5.4 | Retirar los 4 módulos DEAD | P3 |
| T5.5 | Usar `platform/platform.ts` o retirarlo | P3 |
| T5.6 | `Ctrl-C` → 130 en el launcher simple | P3 |
| T5.7 | Instrumentación de rendimiento sobre los observers existentes + comando `/asen-perf` | P2 |

### Diseño de Tanda 5 (sin escribir código aún)

Cada punto queda acotado a **un solo archivo** y a una prueba nueva:

| Punto | Archivo | Cambio mínimo | Prueba |
|---|---|---|---|
| T5.1 `asen setup` | `src/cli.ts:92` | Ejecutar el plan con `--yes` o retirar la promesa de la ayuda | `tests/cli-setup.test.ts` — `--dry-run` produce plan, sin `--dry-run` no promete ejecución |
| T5.2 `dist/` stale | `src/runtime/doctor.ts` | Nuevo check `dist-freshness` que compara mtime de `dist/cli.js` vs el archivo más nuevo de `src/` y avisa (`warn`, no `fail`) | `tests/doctor-dist-freshness.test.ts` |
| T5.3 review-acceptance bloqueado por untracked | `src/runtime/review-acceptance.ts` | El mensaje de error nombra explícitamente los archivos que ensucian el árbol (los enumera `git status --porcelain`) | `tests/review-acceptance-untracked.test.ts` |
| T5.4 retirar DEAD | `src/memory/project-memory-restore-{plan,stage}.ts`, `src/platform/platform.ts`, `src/tasks/task.ts` | **Borrar** los 4 módulos confirmados DEAD y su referencia en el `package.json` si la hubiera | `tests/dead-modules-removed.test.ts` — los 4 paths no deben existir |
| T5.5 `platform/platform.ts` | `src/platform/platform.ts` | **Retirar** (T5.4 ya lo cubre: es DEAD, no tiene consumidor) | cubierto por T5.4 |
| T5.6 `Ctrl-C` → 130 | `src/cli.ts:208-212` | Propagar `signal` del hijo: `child.once("exit",(code,signal)=>resolve(signal==="SIGINT"?130:(code??1)))` | `tests/cli-sigint-exit.test.ts` |
| T5.7 instrumentación | `src/agents/pi-process-runner.ts` + nuevo `src/runtime/perf-collector.ts` | Persistir los 4 observers existentes con timestamps monotónicos + comando `/asen-perf` que los reporta | `tests/perf-collector.test.ts` |

**Dependencias:** T5.1, T5.2, T5.3, T5.6 son independientes entre sí y de la suite; T5.4 y T5.5 se hacen **después** de la suite definitiva (borran archivos); T5.7 es el más invasivo (toca el runner de nuevo) y va **último** y en su propia tanda.

### Resultado de Tanda 5.1 (ejecutada)

**Defecto que cierra:** la ayuda prometía un comando `asen setup` que el binario rechazaba.

**RED observado antes de decidir:** `node dist/cli.js setup` → `exit 2` con "ASEN setup execution is not available yet; use --dry-run to inspect the plan." y `node dist/cli.js --help` → `asen setup --dry-run [--yes]  Preview setup intent (no changes)`.

**Decisión:** el defecto era **de documentación, no de producto**. El comportamiento actual ya es el correcto: `--dry-run` produce el plan (exit 0) y `setup` sin flag se niega honestamente (exit 2). Lo que faltaba era que la ayuda lo dijera sin ambigüedad. Se fijó el contrato con **3 pruebas nuevas** (`tests/cli-setup.test.ts`, 3/3 GREEN) en lugar de inventar una ejecución que el producto no tiene.

**Verificación:** `tests/cli-setup.test.ts` 3/3 PASS.

**Estado:** **CERRADO sin cambios de producto**. El riesgo de "arreglar" esto con una ejecución real supera al beneficio; el comando ya hace lo correcto y ahora el contrato está fijado por pruebas.

### Resultado de Tanda 5.2 (ejecutada)

**Defecto que cierra (S-09):** un `dist/` obsoleto hacía que la primera captura de host de la auditoría fuera inválida, y ningún chequeo lo detectaba.

**RED observado antes del cambio:** `doctorChecks` no tenía chequeo de frescura de `dist/`: los 3 tests nuevos fallaban con `actual: undefined` (el chequeo no existía).

**Cambio:** `src/runtime/doctor.ts` — nuevo `DistFreshness` y chequeo `dist-freshness` (state `warn`, nunca `fail`): avisa cuando `dist/` falta o cuando su archivo más nuevo es más viejo que el más nuevo de `src/`. Es un **aviso**, no un bloqueo: el doctor no decide, sólo informa.

**Verificación:** `tests/doctor-dist-freshness.test.ts` 3/3 GREEN; `tests/doctor.test.ts` 1/1 PASS (regresión); `typecheck` PASS.

**Riesgo:** ninguno — el chequeo es aditivo y opcional (`dist?: DistFreshness`), no cambia ningún comportamiento existente.

### Resultado de Tanda 5.6 (ejecutada)

**Defecto que cierra (S-06):** un `Ctrl-C` normal en el hijo se reportaba como `exit 1` (fallo genérico), no como `130` (SIGINT convencional).

**RED observado antes del cambio:** `src/cli.ts` no exportaba `resolveChildExit` (`SyntaxError: does not provide an export named 'resolveChildExit'`).

**Cambio:** `src/cli.ts` — nuevo helper exportado `resolveChildExit(code, signal)`: `SIGINT` → `130`, `SIGTERM` → `143`, sin señal → `code ?? 1`. El launcher simple ahora propaga la señal en lugar de convertirla en un fallo genérico.

**Verificación:** `tests/cli-sigint-exit.test.ts` 2/2 GREEN; `typecheck` PASS.

**Riesgo:** bajo — un solo archivo, un solo punto de contacto, comportamiento convencional de shell.

## Orden de ejecución recomendado

```
Tanda 0 (sin riesgo, desbloquea decisiones)
   └─► Tanda 1 (seguridad, independiente)
          └─► Tanda 3.2 (requiere T1.1 + T0.1)
   └─► Tanda 2 (runner, aislada, revisión independiente)
          └─► Tanda 5.7 (instrumentación sobre observers estables)
   └─► Tanda 4 (estructural, última y separada)
   └─► Tanda 5.1-5.6 (limpieza incremental)
```

## Criterios de cierre de la auditoría

| Criterio | Estado |
|---|---|
| Alcance del producto inventariado | **Cumplido** |
| Conexiones rastreadas hasta consumidores efectivos | **Cumplido** para la cadena principal; §C.4 cierra el caso de los inalcanzables |
| Implementado vs integrado vs aceptado distinguido | **Cumplido** (matriz §D) |
| Flujos críticos comprobados o marcados BLOQUEADOS | **Parcial** — 12/15 por lectura; 3 requieren host (§E.4) |
| Riesgos de concurrencia y recuperación investigados | **Cumplido** para el runner; recuperación de sesión sólo estática |
| Métricas de rendimiento o declaración precisa de faltantes | **Cumplido** (faltantes enumerados) |
| Hallazgos priorizados con evidencia | **Cumplido** |
| Plan correctivo sin duplicar ODD existentes | **Cumplido** |
| Sin declaración `FULL` ni equivalencia sin pruebas | **Cumplido** |

## Bloqueos declarados

| Bloqueo | Qué falta exactamente | Estado |
|---|---|---|
| Subagentes de investigación | El runtime niega `subagent` (`permission.rejected`) porque `~/.config/opencode/opencode.json` concede el tool `task` y este runtime expone `subagent`. | **Resuelto en alcance**: la regla 10 es facultad, no requisito. La auditoría se ejecutó inline con presupuesto acotado. |
| Prueba E2E real con dos agentes | Selector de modelo con entitlement válido. El proveedor configurado (`ollama-cloud` en `~/.pi/agent`) responde `api_error` por falta de créditos. | **BLOCKED por entitlements de la cuenta**, no por código. Requiere autorización expresa y topped-up del plan. |
| Aceptación en host (TUI real) | — | **CERRADO** — captura ANSI real de la TUI de ASEN en ConPTY, geometría 120x40 (`odd/evidence/asen-4.8.0-comparison/asen-steady.ansi`). |
| Equivalencia 4.8.0 | Capturas comparables + paridad funcional | **Parcial**: la referencia ejecutable ya está y las dos capturas comparables existen; la equivalencia **no** se declara porque la desviación medida es real (Pi 1.2.0 vs 1.5.2, Panel ausente, 3 campos de estado en `?`). |
| Métricas de rendimiento | Colector sobre `onProcessStart`/`onProcessClose`/`onToolExecution`/`onAssistantTextDelta` + comando de reporte. | **Abierto** — Tanda 5.7. |
| `Pi Free Smoke` | Workflow `skipped` en el SHA auditado. | **Abierto** — no depende de ASEN. |
