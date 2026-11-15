# ASEN — Agent Efficiency and Concurrency (Bloque 2)

**Fecha:** 2026-11-14
**Rama:** `feat/t12-integrated-acceptance-merge`
**Objetivo:** Implementar el Bloque 2 de la adaptación quirúrgica (P4, P5 y P6):
1. **P4:** Ruteo de modelos por rol de subagente (`src/agents/model-router.ts`).
2. **P5:** Streaming dinámico de actividad en una sola línea (`src/runtime/activity-stream.ts`).
3. **P6:** Tabla de locks semánticos de archivo para concurrencia (`src/runtime/workspace-lock-table.ts`).

**Metodología:** ODD + TDD estricto (Red → Green → Refactor → Verificación).

---

## 1. Especificaciones (Specs)

### P4: Model Routing by Agent Role
* **S1:** Enum `AgentRole`: `EXPLORER`, `ARCHITECT`, `IMPLEMENTER`, `AUDITOR`.
* **S2:** Mapping `ROLE_MODEL_TIERS`:
  * `EXPLORER` → `"flash_lite"` (rápido, económico, de solo lectura).
  * `ARCHITECT` → `"pro"` (máximo razonamiento para diseño/especificaciones).
  * `IMPLEMENTER` → `"inherit"` (hereda modelo del orquestador para TDD/código).
  * `AUDITOR` → `"pro"` (jueces y revisión adversarial).
* **S3:** Función `resolveAgentModel(role, overrides?)`: devuelve el modelo resuelto. Valida la regla dura de ASEN: los roles `IMPLEMENTER` y `AUDITOR` jamás pueden ser degradados a modelos ligeros/lite (lanza error si se intenta).

### P5: Lightweight Activity Stream (Single-line Spinner)
* **S4:** Clase `ActivityStreamFormatter`: formatea eventos de actividad de subagentes en una sola línea con secuencias ANSI de borrado (`\r\x1b[K`) y truncamiento seguro por ancho de terminal.
* **S5:** Formato estandarizado: `[<agentId>] ⚡ <actionDescription> (<step>)`.
* **S6:** Admite `abortSignal` para detección de cancelación cooperativa e indicador de finalización limpia (`finish(status)`).

### P6: Workspace Lock Table for Concurrency
* **S7:** Clase `WorkspaceLockTable`: gestiona exclusión mutua de archivos en memoria con `Map<string, LockRecord>`.
* **S8:** `tryLock(filePath, agentId, ttlMs?)`:
  * Retorna `true` y adquiere el lock si el archivo está libre o el lock previo expiró por TTL.
  * Retorna `true` si ya pertenecía al mismo `agentId` (reentrante / renueva TTL).
  * Retorna `false` si el archivo está tomado por otro agente activo.
* **S9:** `releaseLock(filePath, agentId)` y `releaseAll(agentId)` liberan locks exclusivamente para el agente propietario.
* **S10:** Normaliza rutas de archivo de forma canónica (case-insensitive en Windows, forward slashes).

---

## 2. Tareas (Tasks)

| ID | Spec | Ruta | Estado | Evidencia |
| :--- | :--- | :--- | :--- | :--- |
| **T1** | S1-S3 | inline | done | `tests/model-router.test.ts` (RED observado inicialmente) → `src/agents/model-router.ts` (4 tests GREEN) |
| **T2** | S4-S6 | inline | done | `tests/activity-stream.test.ts` (RED observado inicialmente) → `src/runtime/activity-stream.ts` (4 tests GREEN) |
| **T3** | S7-S10 | inline | done | `tests/workspace-lock-table.test.ts` (RED observado inicialmente) → `src/runtime/workspace-lock-table.ts` (4 tests GREEN) |
| **T4** | S1-S10 | inline | done | `npm run typecheck` limpio (código 0) y 21 tests pasando en conjunto |

---

## 3. Bitácora de Ejecución (Log)

* **L1 — Inicio ODD Bloque 2:** Apertura formal de bitácora y especificación de S1 a S10.
* **L2 — TDD P4 (Model Router):**
  * Creación de `tests/model-router.test.ts`.
  * RED observado: `ERR_MODULE_NOT_FOUND` para `src/agents/model-router.js`.
  * Implementación de `src/agents/model-router.ts` con regla dura anti-degradación de implementers/auditors.
  * GREEN: 4 pruebas pasando.
* **L3 — TDD P5 (Activity Stream):**
  * Creación de `tests/activity-stream.test.ts`.
  * RED observado: `ERR_MODULE_NOT_FOUND` para `src/runtime/activity-stream.js`.
  * Implementación de `src/runtime/activity-stream.ts` con soporte ANSI, truncamiento elíptico y detección de abort signal.
  * GREEN: 4 pruebas pasando.
* **L4 — TDD P6 (Workspace Lock Table):**
  * Creación de `tests/workspace-lock-table.test.ts`.
  * RED observado: `ERR_MODULE_NOT_FOUND` para `src/runtime/workspace-lock-table.js`.
  * Implementación de `src/runtime/workspace-lock-table.ts` con normalización de rutas y TTL dinámico.
  * GREEN: 4 pruebas pasando.
* **L5 — Verificación y Typecheck:**
  * `npm run typecheck` completado con código 0.
  * 21 pruebas pasando simultáneamente (Bloque 1 + Bloque 2).
