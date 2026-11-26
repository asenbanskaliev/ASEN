# ASEN — Ampliación Gentle Shell 5.0.0 (G01–G08)

Fecha: 26/11/2026. Complemento aprobado por el usuario del plan rector #61. No reemplaza los 18 objetivos, 12 criterios, P01–P06, CTX ni E1–E4/F. Estado: pendiente de implementación y aceptación; globalFull:false. Sin modelos externos hasta nueva autorización. No modificar main ni fusionar #61/#115 a sus bases.

## Referencias y corte de partida

- [Gentle Shell 5.0.0](https://github.com/Gentleman-Programming/gentle-shell/releases/tag/v5.0.0), commit be74d44cec564fae3c9cc66f392d1396fd432fe8.
- [Comparación 4.9.0…5.0.0](https://github.com/Gentleman-Programming/gentle-shell/compare/v4.9.0...v5.0.0).
- [Gentle AI 5.0.0](https://github.com/Gentleman-Programming/gentle-ai/releases/tag/v5.0.0), commit 4716b3cbca158c35c3b316dbd517f54e5f240f97.
- ASEN #115 815786af4d7b1f91cdc33c579ef78775b09761bf; candidato #137 69a0e16d751fdb2fbb41ce079088fd9b3b8b255b (CI, arquitectura, Release Gate y Pi correctos en este corte; revisión independiente pendiente; Pi Free Smoke omitido). #136 A1a con pruebas rápidas correctas, sin admisión. Revalidar refs al ejecutar.

## Unidades de trabajo y aceptación

| ID | Cambio y decisión | Reutilizar / ubicación inicial | Pruebas obligatorias | Dependencia |
|---|---|---|---|---|
| G01 | Actualizar compatibilidad a Pi 1.6.0 y alinear sus paquetes; no elevar mínimo sin evidencia | package.json, package-lock.json, scripts/pi-support-matrix.mjs, workflows y contratos SDK actuales | instalación empaquetada Windows/Linux/macOS, matriz 1.2/1.5/1.6 (si disponibles), eventos RPC, procesos hijos, abortos, permisos, interfaz y regresiones | estabilización; E coordina |
| G02 | Indicador adicional de presión de compactación según configuración efectiva; no sustituir porcentaje de ventana ni los límites de seguridad 80/95 | host-status-projection.ts, ide-panel.ts, t11-compact-status.ts, pruebas P32 y CTX | reserva global y por modelo, límite exacto, desactivado, API ausente/errónea, ventana inválida, reserva >= ventana, ancho terminal, cero llamadas y cero lectura de historial | puede prepararse aisladamente sin tocar extensiones compartidas; conexión después de G01 si requiere SDK nuevo |
| G03 | Continuidad de turnos que el proveedor acredita abiertos; no repetir escritura ni llamada incierta | pi-process-runner.ts, agente runtime, diarios y reconciliación T06/T11/P01/P02 | respuesta correlacionada abierta vs terminal, cancelación, timeout, reinicio, un resultado único, límite de reintentos y cero duplicidad; validar proveedor/SDK antes de adoptar | G01 y E2 |
| G04 | Unificar decisión de revisión/escalado en todos los recorridos, incluidos STOP/START si aplican; mantener puertas propias | review-assessment-policy.ts, native-rdd-control.ts, ordinary-review-controller.ts, plan-risk-verifier-binding.ts, P04/P06 | tabla de riesgos, escalado explícito, modo off, candidato cambiado, fallo cerrado, recibo exacto, no eliminar revisión requerida; adaptar protocolo Gentle AI 5 solo si se usa de verdad | E3/P04, G01 |
| G05 | Diagnósticos accionables del Fix y recuperación limitada | judgment-day.ts, judgment-fix-odd-*, journal, t08-pi-review-diagnostics.ts, P03 | motivo de bloqueo por cláusula, candidato y ámbito exactos, consentimiento nuevo, intentos limitados, no filtrar secretos, no repetir inferencia incierta | G04/P03 |
| G06 | Auditar exclusión de rutas sensibles en preparación de Verifier y staging | review-tree-paths.ts, security, pi-verifier, P06 | rutas ignoradas, secretos, symlinks, traversal, staging delimitado, árbol y recibo exactos, fail-closed | P06/G04 |
| G07 | Desglose de uso por día, proveedor y modelo, sin inferir costes ni duplicar eventos | pi-history-stats.ts, flow-metrics.ts, usage-store.ts, P05/CTX-5 | días/zona horaria definida, aliases, datos parciales, coste desconocido, no duplicidad, privacidad, comparación reproducible | P05/CTX-5, G01 |
| G08 | Actualización recuperable Windows: conservar versión previa y restaurar tras fallo; serializar instalación y tratar bloqueos transitorios con límite | managed-acquisition-update.ts, managed-install.ts, managed update y launcher | bloqueo concurrente, fallo de sustitución, rollback, cancelación, integridad/versión exacta, sin elevación ni tocar instalación real del usuario | G01, pruebas aisladas |

## Secuencia

1. Prioridad vigente: estabilizar #137, reconciliar #136 y defectos de perfiles, completar 18+12/P01–P06. No saltar CI/revisión.
2. Compatibilidad: G01/G03/G08; G02 puede preparar una pieza pura independiente de los archivos compartidos mientras se espera CI, sin afirmar integración.
3. Revisión y seguridad: G04/G05/G06, absorber trabajo ya existente.
4. Optimización: G02/G07, con métricas reales solo tras autorización.

RPC de escritorio, credenciales, eventos de perfil, avisos de configuración, referencias de habilidades y Tower quedan como auditorías complementarias, no nuevos trabajos obligatorios. No copiar Go /v5 ni protocolos antiguos si no se consumen. Mantener bloqueo de entrega de ASEN; no copiar la conversión a simple aviso. Cualquier adopción se valida por comportamiento y no por igualdad de arquitectura.

Registro de ejecución: [coordinación](https://github.com/asenbanskaliev/ASEN/blob/coordination/asen-megatandas-20261125/coordination/megatandas.json). Reservar solo escritura, liberar antes de CI; un propietario por archivo y pruebas del SHA exacto. G01–G08 no suman criterios a los 30 originales ni acreditan paridad automáticamente.
