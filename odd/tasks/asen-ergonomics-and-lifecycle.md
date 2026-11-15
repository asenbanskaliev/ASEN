# ASEN — Ergonomics and Lifecycle (Bloque 3)

**Fecha:** 2026-11-14
**Rama:** `feat/t12-integrated-acceptance-merge`
**Objetivo:** Implementar el Bloque 3 de la adaptación quirúrgica (P7, P8 y P9):
1. **P7:** Memoria de permisos por hash criptográfico con blacklist inmutable (`src/security/permission-hash-cache.ts`).
2. **P8:** Desinstalador limpio con snapshot y resguardo previo (`src/runtime/asen-uninstall.ts`).
3. **P9:** Notificación pasiva de actualización verificada no bloqueante (`src/runtime/update-notifier.ts`).

**Metodología:** ODD + TDD estricto (Red → Green → Refactor → Verificación).

---

## 1. Especificaciones (Specs)

### P7: Permission Hash Cache
* **S1:** Clase `PermissionHashCache`: almacena autorizaciones previas con clave `sha256(canonicalCwd + "\0" + normalizedCommandLine)`.
* **S2:** Lista negra inmutable (`IMMUTABLE_BLACKLIST`): comandos destructivos como `rm -rf`, `git push --force`, `git reset --hard`, `drop table`, `format` jamás se autorizan por caché (siempre exigen confirmación).
* **S3:** `isAllowed(cwd, command, branch?)`: verifica si el comando exacto ya fue aprobado en ese directorio y rama git.
* **S4:** `remember(cwd, command, branch?)`: registra la aprobación si el comando no está en la lista negra. Lanza error o rechaza si se intenta cachear un comando prohibido.

### P8: Clean Uninstall with Pre-Snapshot
* **S5:** Función `createUninstallSnapshot(asenDir, destinationDir)`: crea un snapshot/backup empaquetado de la memoria y configuración de ASEN antes de desinstalar.
* **S6:** Función `executeUninstall(options)`:
  * Exige frase de confirmación `"UNINSTALL"` cuando no es `dryRun`.
  * Modo `dryRun`: reporta la lista de archivos, symlinks y variables que serían removidos sin tocar el disco.
  * Modo real: remueve exclusivamente binarios y configuración de ASEN en el Home del usuario, sin tocar jamás el repositorio de trabajo.

### P9: Passive Update Notifier
* **S7:** Clase `UpdateNotifier`: consulta versiones de forma asíncrona sin bloquear la consola.
* **S8:** Filtro de frecuencia: no consulta si han transcurrido menos de 24 horas (86,400,000 ms) desde la última comprobación guardada en caché.
* **S9:** Comparación SemVer: solo emite aviso si `latestVersion` es estrictamente mayor que `currentVersion`.
* **S10:** Formato pasivo: genera aviso de una sola línea informativa al pie sin wizards ni pausas interactivas.

---

## 2. Tareas (Tasks)

| ID | Spec | Ruta | Estado | Evidencia |
| :--- | :--- | :--- | :--- | :--- |
| **T1** | S1-S4 | inline | done | `tests/permission-hash-cache.test.ts` (RED observado) → `src/security/permission-hash-cache.ts` (4 tests GREEN) |
| **T2** | S5-S6 | inline | done | `tests/asen-uninstall.test.ts` (RED observado) → `src/runtime/asen-uninstall.ts` (3 tests GREEN) |
| **T3** | S7-S10 | inline | done | `tests/update-notifier.test.ts` (RED observado) → `src/runtime/update-notifier.ts` (3 tests GREEN) |
| **T4** | S1-S10 | inline | done | `npm run typecheck` limpio (código 0) y 31 tests pasando en conjunto |

---

## 3. Bitácora de Ejecución (Log)

* **L1 — Inicio ODD Bloque 3:** Definición de especificaciones S1 a S10 para P7, P8 y P9.
* **L2 — TDD P7 (Permission Hash Cache):**
  * Creación de `tests/permission-hash-cache.test.ts`.
  * RED observado: `ERR_MODULE_NOT_FOUND` para `src/security/permission-hash-cache.js`.
  * Implementación de `src/security/permission-hash-cache.ts` con lista negra inmutable anti-destructiva y binding a rama git.
  * GREEN: 4 pruebas pasando.
* **L3 — TDD P8 (Clean Uninstall):**
  * Creación de `tests/asen-uninstall.test.ts`.
  * RED observado: `ERR_MODULE_NOT_FOUND` para `src/runtime/asen-uninstall.js`.
  * Implementación de `src/runtime/asen-uninstall.ts` con snapshot JSON previo y frase de confirmación obligatoria.
  * GREEN: 3 pruebas pasando.
* **L4 — TDD P9 (Update Notifier):**
  * Creación de `tests/update-notifier.test.ts`.
  * RED observado: `ERR_MODULE_NOT_FOUND` para `src/runtime/update-notifier.js`.
  * Implementación de `src/runtime/update-notifier.ts` con comparador semver y límite de tasa de 24 horas.
  * GREEN: 3 pruebas pasando.
* **L5 — Verificación Global:**
  * `npm run typecheck` completado con código 0.
  * **31 pruebas unitarias pasando al 100%** en conjunto (Bloques 1, 2 y 3).
