# Continuidad autónoma del plan «Flujo de agentes» — ASEN

Estado del plan: **PREPARADO PARA TANDA A**; ningún arreglo nuevo se acredita por crear este documento.
Fecha del diagnóstico: 2026-11-16. Fuente histórica: \`eaed07883703461ee225d61540265b1e478217e2\`.
PR objetivo: https://github.com/asenbanskaliev/ASEN/pull/61
Rama de trabajo exclusiva: \`feat/flujo-de-agentes-20261115\`.
Rama padre: \`feat/t12-integrated-acceptance-merge\`.
Informe íntegro: [auditoría independiente](../../docs/audit/auditoria-independiente-flujo-agentes-pr61-20261116.md)
Plan rector: [flujo-de-agentes.md](./flujo-de-agentes.md)

## Cola priorizada y relación con la auditoría

- **A — Bloqueo antes de escritura**: N1 + P1/P2/P5 + T06. Prioridad CRÍTICA DE OPERACIÓN. Pendiente; evitar repetir prueba pagada hasta pruebas negativas locales.
- **B — Ciclo de vida Pi/cancelación**: N7/N8 y hallazgos 2/3/8 + P4/P6/P7 + T01/T02/T08. Pendiente, después de A.
- **C — T06 + T07 conectados**: N2/N3 + P3/P8; unión real de sesiones/estado, actualización de paneles y TUI. Pendiente; tests de simulación insuficientes.
- **D — ODD, revisión y Fix**: N4/N5 y hallazgos 5/6/7 + P9 + T03/T04/T05/T08. Pendiente; las condiciones de aceptación humanas se mantienen.
- **E — Seguridad, regresión y auditoría**: N6 y hallazgos pendientes + P10 + T09/T10. Pendiente.
- **F — A/B y equivalencia**: mediciones auténticas y cierre T09/T10. Pendiente.

## Bitácora mínima de cada ejecución

Usar este formato y mantener solo hechos demostrados:

| Ejecución (hora España) | Tanda | SHA inicial → final | Cambios | RED/GREEN/CI/Gates | Estado | Siguiente decisión |
|---|---|---|---|---|---|---|
| 2026-11-16 · configuración inicial | preparación | \`eaed078…\` → commit de plan | Guardado de auditoría y plan, sin correcciones funcionales | No aplican pruebas de producto | PREPARADO | A |

## Límites de autonomía

**Permitido sin nuevas consultas:** auditar código, planificar, agrupar, editar código y pruebas en rama de desarrollo de la PR #61, publicar commits, comprobar resultados y reparar CI. Todo con controles de identidad/seguridad existentes.

**No permitido sin consentimiento válido y específico:** iniciar proveedores con coste/desconocido, aprobar entornos protegidos de GitHub, saltar gates, usar secretos nuevos, editar otras ramas, fusionar PR/main, borrar datos o reintentar ejecuciones Writer cuyo resultado sea incierto.

**Si una tanda queda bloqueada:** registrar causa y seguir con tareas **independientes** y seguras, sin rebajar prioridades ni cambiar artificialmente a FULL. Si la PR, la rama o el SHA cambian por otro actor, releer y reconciliar antes de escribir; no sobrescribir.

**Criterio global:** ningún cierre de T06/T07 por el ensayo externo aislado. Requiere ruta Pi/TUI real conectada, una sola escritura cuando se exige, modelo autenticado, permisos individuales, estado durable y revisión verificable. \`globalFull:false\` hasta ese punto.
