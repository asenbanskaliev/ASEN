# ASEN — Unified Command Registry and Immutable Review Receipts (Bloque 1)

**Fecha:** 2026-11-14
**Rama:** `feat/t12-integrated-acceptance-merge`
**Objetivo:** Implementar el Bloque 1 de la adaptación quirúrgica (P1 y P2):
1. **P1:** `CommandRegistry` unificado y tipado para alimentar menú, catálogo y ayuda con arranque lineal.
2. **P2:** Recibos criptográficos inmutables de revisión (`.asen/receipts/<commit-sha>.json`) con firma SHA-256 de integridad.

**Metodología:** ODD + TDD estricto (Red → Green → Refactor → Verificación).
**Ejecutor de pruebas:** `node --import tsx --test <test-file>` y `npm run typecheck`.

---

## 1. Especificaciones (Specs)

### P1: CommandRegistry
* **S1:** La clase `CommandRegistry` permite registrar comandos tipados (`CommandDefinition`) con `{ name, alias, description, category, handler, flags, isHidden }`.
* **S2:** Provee métodos `register()`, `get()`, `has()`, `list(category?)`, `renderHelp(cmdName?)` y `toPaletteItems()`.
* **S3:** Rechaza nombres duplicados o aliases colisionantes (`throws Error("Command ... already registered")`).
* **S4:** Soporta búsqueda insensible a mayúsculas y normalización de guiones.
* **S5:** Genera proyecciones de paleta de comandos y formateo de ayuda alineado para terminal.

### P2: Review Receipts
* **S6:** `createReviewReceipt(input)` produce un objeto `ReviewReceipt` inmutable que sella:
  * `schemaVersion`: `"1.0.0"`
  * `receiptId`: identificador único con prefijo `rcpt_`
  * `commitSha`: hash de 40 caracteres hexadecimales del commit auditado
  * `treeSha`: hash del árbol git congelado
  * `timestamp`: ISO-8601 UTC
  * `testSuite`: `{ total, passed, failed, durationMs, runner }`
  * `verdict`: `"PASSED"` | `"FAILED"`
  * `signature`: `sha256(treeSha + ":" + testSuite.passed + ":" + verdict + ":" + commitSha)`
* **S7:** `verifyReviewReceipt(receipt)` valida criptográficamente que la firma coincida exactamente con los datos declarados. Si el veredicto, tests, commitSha o treeSha fueron alterados, retorna `false`.
* **S8:** `writeReviewReceipt(storageDir, receipt)` escribe atómicamente el recibo en `<storageDir>/<commitSha>.json`.
* **S9:** `readReviewReceipt(storageDir, commitSha)` recupera y valida el recibo de disco; retorna `null` si no existe o si está corrupto/adulterado.

---

## 2. Tareas (Tasks)

| ID | Spec | Ruta | Estado | Evidencia |
| :--- | :--- | :--- | :--- | :--- |
| **T1** | S1-S5 | inline | done | `tests/command-registry.test.ts` (RED observado: `ERR_MODULE_NOT_FOUND`) |
| **T2** | S1-S5 | inline | done | `src/runtime/command-registry.ts` (5 tests GREEN) |
| **T3** | S6-S9 | inline | done | `tests/review-receipt.test.ts` (RED observado: `ERR_MODULE_NOT_FOUND`) |
| **T4** | S6-S9 | inline | done | `src/evidence/review-receipt.ts` (4 tests GREEN) |
| **T5** | S1-S9 | inline | done | Typecheck limpio (`npm run typecheck` exit 0) y suite de pruebas (`tests/command-registry.test.ts`, `tests/review-receipt.test.ts`, `tests/command-catalog.test.ts`, `tests/startup-flow.test.ts` exit 0) |

---

## 3. Bitácora de Ejecución (Log)

* **L1 — Inicio ODD:** Definición de especificaciones S1 a S9 basada en la auditoría de eficacia de `asen-vs-gentle-shell-plain-language-and-adaptation.md`.
* **L2 — TDD P1 (CommandRegistry):**
  * Creación de `tests/command-registry.test.ts`.
  * RED observado: `ERR_MODULE_NOT_FOUND` para `src/runtime/command-registry.js`.
  * Implementación de `src/runtime/command-registry.ts`.
  * GREEN observado: 5 pruebas pasando limpiamente.
* **L3 — TDD P2 (Review Receipts):**
  * Creación de `tests/review-receipt.test.ts`.
  * RED observado: `ERR_MODULE_NOT_FOUND` para `src/evidence/review-receipt.js`.
  * Implementación de `src/evidence/review-receipt.ts`.
  * GREEN observado: 4 pruebas pasando con validación criptográfica y atomicidad de disco.
* **L4 — Ajuste TypeScript exactOptionalPropertyTypes:**
  * Typecheck estricto detectó incompatibilidades con propiedades opcionales (`metadata?: Record<string, unknown> | undefined` y `flags?: Readonly<Record<string, CommandFlagDefinition>> | undefined`).
  * Ambos archivos corregidos y tipados exactamente. `npm run typecheck` completado con código de salida 0.
* **L5 — Verificación:**
  * 16 pruebas ejecutadas y pasando con 100% de éxito en 4 suites clave: `command-registry.test.ts` (5), `review-receipt.test.ts` (4), `command-catalog.test.ts` (2) y `startup-flow.test.ts` (5).
