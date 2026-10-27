# T09 — Plan de ejecución autónoma y cierre verificable

## Estado y alcance

Este plan se fija sobre PR #37, rama `feat/t09-managed-update-stage`, HEAD remoto observado `3635ca8e2ef0a206ac2cbe74f5f098486c28a09c`. En ese SHA los workflows observados (CI, Release Gate, Phase 0 Architecture y Pi 1.2 runtime evidence) terminaron en éxito; Pi Free Smoke fue omitido por condición. Esos resultados no prueban el ciclo de mantenimiento ni corrigen el histórico de Windows.

T09 permanece **PARTIAL** hasta demostrar instalación limpia de paquete real, autenticidad y adquisición, actualización/rollback, backup/restauración, desinstalación con preservación de datos, navegador real donde corresponda, plataformas requeridas, auditoría R4 y CI verde en el SHA final. Este plan no autoriza merge a `main`, releases, mutaciones de instalaciones personales, cambios de permisos para forzar tests ni debilitamiento de validaciones.

## Reglas de ejecución

1. Trabajar únicamente en la rama y PR existentes. Antes de cada tanda, reconciliar HEAD remoto con el árbol local y preservar cambios concurrentes.
2. Mantener paquetes, homes, datos, claves de prueba, SQLite y temporales bajo directorios desechables del propio test. No usar credenciales reales ni claves privadas de producción.
3. Primero reproducir; después corregir la causa mínima; conservar prueba de regresión que falle con el comportamiento previo y pase tras el arreglo.
4. No elevar timeouts como remedio sin evidencia de que el límite era incorrecto. No ampliar permisos ni eliminar controles de seguridad.
5. Hacer commits coherentes con código, regresiones y actualización de evidencia. Evitar commits de documentación aislados y no lanzar workflows manuales repetidamente.
6. Usar Work para inspección, implementación y pruebas disponibles localmente; CI para Windows/Linux/macOS. Una prueba HTTP no se contabiliza como apertura real de navegador.
7. No volver a ejecutar un job fallido hasta revisar logs, artefactos y causa probable; reintentar solo tras una corrección o demostrar fallo transitorio del runner.

## Fase 0 — Baseline del candidato

**Work:** leer `AGENTS.md`, `docs/remote-continuation.md`, el ODD canónico, mapa de paridad, `docs/installation.md`, package scripts y workflows. Comparar código, tests y recibos con el HEAD remoto; identificar si las 14 pruebas Windows siguen fallando, los nombres exactos, jobs, comandos y último punto observado.

**Criterio:** tabla de requisitos T09 con estado `demostrado`, `pendiente` o `bloqueado`, SHA y evidencia asociada. Las entradas históricas se conservan; la evidencia de otro SHA no se atribuye al candidato actual.

## Tanda A — Windows y estabilidad

### A1. Diagnóstico reproducible

En el log original, enumerar las 14 pruebas y operación que realizan. Revisar spawn/exec, cierre de stdout/stderr, hijos y descendientes, handles abiertos, temporales, canonicalización de rutas, rutas 8.3, permisos, limpieza y coste de arranque de Pi/tsx/runner. No asumir causa por el mero uso de nombres cortos.

Si no hay Windows local, instrumentar solo las pruebas implicadas con etapas y duraciones, ruta temporal absoluta/canónica, PID, eventos de salida/cierre y resultado de cleanup; evitar datos sensibles. Ejecutar una vez el job Windows controlado para capturar diagnóstico completo.

### A2. Corrección causal y regresión

Crear primero el caso mínimo que reproduce el bloqueo, corregir el origen más pequeño (CLI, test harness, proceso hijo o fixture) y añadir regresión con rutas relevantes: 8.3/canónica, espacios y caracteres soportados, además de control de fin del proceso y ausencia de residuos. Mantener los mismos límites salvo que mediciones repetibles justifiquen otro valor. Confirmar que no hay handles/streams que mantengan vivo al proceso.

### A3. Validación local enfocada

Ejecutar las 14 pruebas y su familia, tests de procesos/CLI relacionados, typecheck, build y `git diff --check`. Revisar efectos de filesystem y cleanup incluso cuando el test falla. Adjuntar una nota de causa con tiempos observados antes/después.

**Salida de Tanda A:** causa respaldada por logs, regresión reproducible, corrección probada localmente y job Windows verde. Si el runner revela un bloqueo externo, conservar el log y declarar el impedimento concreto; no atribuir PASS.

## Tanda B — ciclo funcional y seguridad

### B1. Paquete e instalación

Desde el checkout limpio y lockfile, generar el paquete real y guardar su SHA. En un home temporal vacío, instalar con el flujo soportado; verificar manifiestos/recibos, archivos, precedencia de config, permisos esperados, espacios/Unicode y arranque con Pi 1.2.0. Repetir instalación para idempotencia. Interrumpir una instalación desechable en puntos seguros y verificar recuperación sin adoptar archivos ajenos. Diferenciar `verify:pack`/fixtures del test de instalación ejecutada.

### B2. Confianza y actualización

Usar una clave de prueba Ed25519 generada para el test y anclaje de confianza explícito. Verificar manifiesto y bytes del paquete antes de ejecutar o activar. Cubrir firma inválida, bytes alterados, clave desconocida/revocada, manifiesto inconsistente y descarga truncada. Instalar versión A, adquirir/verificar versión B por el canal real admitido, preparar y activar B, ejecutar y comprobar identidad/versión. Inducir fallo controlado y verificar rollback a A, no replay/ejecución duplicada y datos invariantes. No confundir staging, selección, activación, readiness ni rollback de versión con restore de datos.

### B3. Backup y restauración

Poblar datos no sensibles identificables; crear backup con SQLite activo mediante estrategia definida (API de backup/snapshot consistente o cierre coordinado comprobado); verificar formato, integridad y hashes/manifest según diseño. Restaurar a instalación limpia y comparar registros/archivos antes-después. Probar truncamiento/corrupción, espacio/permiso insuficiente e interrupción durante copia/commit. Exigir que el destino previo siga válido o que el estado parcial quede claramente recuperable; ninguna restauración debe seguir enlaces/rutas sustituidas fuera de la raíz permitida.

### B4. Desinstalación

Instalar bajo raíz temporal que incluya vecinos ajenos y datos personales ficticios. Desinstalar y comparar inventario: desaparece únicamente el componente propio reconocido por identidad/recibo; permanecen configuración personal, proyectos y datos que el contrato conserva. Probar interrupción/reanudación, symlink/junction, renombrado/reemplazo entre validación y borrado y carrera de mismo usuario. Ante identidad incierta, fallar cerrado y conservar desconocidos. No cambiar ACLs para facilitar limpieza; restaurar fixtures solo con identidad y propiedad positivas.

### B5. Asistente de navegador

Automatizar consentimiento permitido/denegado, cancelación, cierre, expiración, error y puerto ocupado; comprobar callback de interfaz local prevista, validación anti-CSRF/state, no exposición de secretos, límite de espera y limpieza del listener. Registrar claramente que son pruebas HTTP automatizadas. En host interactivo, hacer recorrido adicional que confirme apertura real del navegador, consentimiento, retorno/cancelación y estado resultante. Si no existe host gráfico, queda pendiente esa evidencia, no se simula.

### B6. Auditoría R4 independiente

Revisar en código y pruebas: Ed25519 y trust anchors; formato/fijación/rotación/revocación de claves; autenticidad y bytes descargados; no ejecución antes de validar; symlinks, junctions, traversal y carreras; límites de propiedad/desinstalación; atomicidad, integridad y recuperación de backup; cierre SQLite; rollbacks y datos; comportamiento POSIX/Windows/macOS; duplicidad y complejidad accidental. Cada hallazgo se registra con severidad, escenario, impacto y prueba; Critical/High debe corregirse antes de aceptación. Diferenciar hallazgos de código de falta de evidencia de host.

## Validación final y CI

1. Ejecutar primero tests enfocados por cambio; luego `npm run typecheck`, `npm run build`, suite `npm test`, auditorías del proyecto, `npm run verify:pack`, `npm run verify:pi-matrix` y controles aplicables declarados en `package.json`/workflow.
2. Publicar código, regresiones, docs de comportamiento y recibos reales en un commit coherente del PR existente.
3. Ejecutar la ronda final de workflows obligatorios una sola vez sobre ese SHA. Confirmar CI y Release Gate en Windows, Linux y macOS, además de Architecture y Pi 1.2 runtime evidence. Pi Free Smoke omitido por condición se registra como omitido, no como aprobado.
4. Para fallos, inspeccionar logs/artifacts/step output antes de actuar; corregir y volver a ejecutar solo validación afectada y la ronda necesaria para el nuevo SHA final.
5. Actualizar el ODD canónico, el mapa y `docs/installation.md` solo con resultados comprobables y SHA/artefacto. No tocar el preámbulo binario del ODD como texto UTF-8: preservar bytes o usar una edición binaria controlada y validada.

## Evidencia mínima de entrega

| Requisito | Evidencia necesaria |
|---|---|
| Windows | Lista de 14 pruebas, causa soportada, regresión y job Windows verde en SHA final |
| Instalación | Artefacto real con SHA, instalación limpia ejecutada, arranque y reinstalación |
| Confianza/actualización | Firmas y bytes validados, versión B ejecutada, rechazo negativo y rollback probado |
| Backup/restore | Backup íntegro y SQLite consistente, restore en entorno limpio y comparación de datos; corrupción/interrupción cubiertas |
| Desinstalación | Inventario antes/después, datos conservados, interrupción/reanudación y sustitución/race probadas |
| Navegador | Tests automatizados identificados y recorrido de apertura real en host interactivo |
| Plataformas | CI obligatorio verde en Windows, Linux y macOS sobre SHA final |
| R4 | Informe ligado al candidato y sin Critical/High pendientes |

Si cualquiera de estos elementos no se puede ejecutar o falla sin resolver, mantener T09 **PARTIAL** y nombrar el requisito pendiente. Solo todos los criterios demostrados permiten proponer `FULL`; CI verde por sí solo no basta.

## Límites de autorización

Autopiloto permite implementar, probar y publicar una tanda en el PR #37 existente. No permite merge a `main`, release, instalar/desinstalar software del host, usar claves de producción, elevar permisos, limpiar rutas no identificadas ni omitir pruebas requeridas. Las operaciones de mantenimiento se limitan a entornos desechables creados por la prueba.
