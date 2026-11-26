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

## Orden operativo aprobado — seis megatandas (26/11/2026)

Aplicar conjuntamente los 18 objetivos + 12 criterios de la matriz canónica, P01–P06, G01–G08 y CTX/E1–E4/F. Esta secuencia organiza, no sustituye los criterios ni amplía la autoridad de escritura. P06 y seguridad son transversales desde el primer cambio.

| Tanda | Alcance y responsable | Salida exigida |
|---|---|---|
| M1 Estabilización | E: candidato #137, reconciliar #136 y pieza aislada #138; comprobar ancestros y no volver a integrar #127–135 | Un candidato de desarrollo con revisión independiente, CI y Release Gate exactos; ramas anteriores preservadas hasta verificar equivalencia |
| M2 Modelos y compatibilidad | B/E: G01, G08, P02, perfiles, procedencia vigente antes de despacho, alternativas seguras | Pi compatible; versiones y tres sistemas comprobados, modelos observados sin inventar identidad; rollback aislado |
| M3 Delegación y continuidad | A/B/E: E1/CTX-2, P04, G03, planificación, modos, Explorer, Writers y sucesoras | Dos raíces y 2+1; máximo dos Writers, permisos exactos, reinicios sin doble efecto, preguntas y avisos únicos |
| M4 Calidad y seguridad | C/B/E: P01, G04–G06, Verifier, juicio independiente, Fix y escalado proporcional | Revisión y reparación del mismo candidato, sin permisos heredados ni rutas sensibles; pruebas negativas |
| M5 Contexto y rendimiento | D/E: G02/G07, CTX, P05 y preparación E4 | Indicador conectado sin sustituir protecciones; métricas conservadoras; comparación 1/2 agentes y 3/4 solo si evidencia justifica |
| M6 Aceptación | E con A–D: P03/P06, E4/F, 18+12, mejoras aplicables | Petición natural a entrega y sucesora real sobre mismo linaje; A/B controlada; 3 sistemas × 4 modos; revisión independiente y controles del SHA final |

Ejecutar trabajos independientes de M2–M5 mientras M1 valida, con un propietario por archivo, máximo dos reservas de escritura simultáneas y E como dueño de archivos compartidos. No duplicar código ni iniciar CI completa de cada pieza si puede consolidarse de forma segura. No borrar ramas ni cerrar PR por antigüedad. No fusionar #61/#115 a sus bases ni main. No ejecutar modelos externos mientras el registro vigente lo prohíba; los ensayos reales quedan sujetos a autorización aplicable y presupuesto. No marcar globalFull:true por pruebas parciales, omitidas o de SHA distinto. Mantener las condiciones de consentimiento y aceptación del plan original.


## Corte de ejecución comprobado · 26/11/2026

Consulta realizada directamente en GitHub. Las evidencias quedan ligadas al SHA indicado y no elevan por sí solas los estados 18+12 ni `globalFull`.

### M1 y M2

- **M1/#144** — SHA `ef3a91053b553f01e22e8d396ac3173a10357caf`: CI, CI rápida, Phase 0, Pi 1.2, Release Gate y matriz Pi terminaron correctamente. Pi Free Smoke quedó `skipped`. CodeRabbit indicó cero observaciones accionables y una sugerencia menor; esta revisión no sustituye aceptación humana.
- **M2/#148** — SHA `e1e225d1951f819a055ac597a798171b70a71b0f`: CI, matriz Pi, arquitectura, Release Gate, Pi 1.2 y CI rápida correctos. Pi Free Smoke quedó `skipped`. CodeRabbit recibió solicitud de revisión completa; aún no hay resultado de esa revisión.
- **G02/#149** — SHA `8acbfe56284077bb94c5396dfb3a12659d56fad4`: arquitectura, Release Gate, Pi 1.2 y CI rápida correctos. La CI completa seguía en curso en el corte; Pi Free Smoke quedó `skipped`. La revisión CodeRabbit fue solicitada y está pendiente.
- **G08 sigue pendiente:** no hay implementación de actualización Windows recuperable en la cadena auditada. Hace falta una PR aislada con bloqueo concurrente, rollback, cancelación, comprobación de integridad y versión, y pruebas exactas.
- Por tanto, **M2 no está cerrada**. No se deben reutilizar los resultados de un SHA distinto ni contar un trabajo omitido como aprobado.

### Auditoría de M3 sobre el código de #115

En `integration/megatanda-b-consolidada-20261124`, SHA `815786af4d7b1f91cdc33c579ef78775b09761bf`, existe ya una base funcional: ruta ODD, división de tareas, worktrees separados, sesiones Pi mediante `SessionManager`, despacho por el `AgentRuntime` existente, límite de dos Workers, ámbitos ligados a ODD, diarios persistentes, recibos terminales y preparación de sucesora. CI, arquitectura, Pi 1.2 y Release Gate están correctos para ese SHA; los 94 hilos de revisión aparecen resueltos.

Esto **no demuestra M3 completo**. La aceptación integral de P03 no tiene un ensayo natural único sobre este SHA; G03 no demuestra todavía continuidad de un turno que el proveedor mantiene abierto; P04 requiere reinicios en cada punto de corte, recuperación de recibos y prevención de efectos duplicados. La continuación bloqueada o ambigua debe seguir requiriendo inspección/consentimiento cuando el resultado no sea demostrable.

La coordinación actual conserva `noModelCalls:true`. No se ejecutan modelos reales mientras esa regla permanezca activa. No se marca `globalFull:true`.

### Siguiente orden

1. Cerrar la CI de #149 y obtener resultados completos de CodeRabbit para #148/#149.
2. Implementar y validar G08 en una rama reservada, sin tocar las ramas protegidas.
3. Avanzar G03/P04 en el runtime existente y añadir las regresiones de reinicio/turno abierto antes de ensayos reales.
4. Completar el recorrido natural M3 en una sola fixture aislada y con evidencia exacta por SHA; respetar las autorizaciones vigentes.
5. Actualizar esta tabla solo después de comprobar los resultados, no al publicar la PR.

Registro: [coordination/megatandas.json](https://github.com/asenbanskaliev/ASEN/blob/coordination/asen-megatandas-20261125/coordination/megatandas.json). Última actualización del registro: `655b3940f15a7fcf7d4b696d44fcfcd37c55e6e7`.
