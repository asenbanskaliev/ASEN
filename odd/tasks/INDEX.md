# ASEN — Índice ODD operativo

**Actualizado:** 21/11/2026. **Ámbito:** flujo de agentes de la PR #61. No sustituye los planes generales de Pi, seguridad o instalación.

## Lectura mínima antes de trabajar

1. [Plan rector de 18 objetivos](flujo-de-agentes-plan-implantacion-4.9.0.md): reglas, fases E0–E4/F y requisitos para avanzar.
2. [Estado verificable de los 18 objetivos](flujo-de-agentes-estado-18-objetivos.md): avance real, pruebas y pendientes.
3. [Plan único CTX-0…CTX-6](../../docs/plan-final-opt-contexto-y-agentes-2026-11-20.md): diagnóstico y optimización del contexto.
4. [Ejecución PR #61](pr61-18-puntos-megatandas-a-e.md): tareas activas y registro por fases.
5. [Coordinación en GitHub #63](https://github.com/asenbanskaliev/ASEN/issues/63): reservas, responsables, resultados, revisiones y SHA exactos.

## Corte comprobado · 21/11/2026

- **PRE-0/PRE-1:** corregidos e incorporados mediante [PR #64](https://github.com/asenbanskaliev/ASEN/pull/64). Se validó el CI exacto y la revisión externa antes de incorporar.
- **CTX-0:** pruebas sintéticas integradas mediante [PR #65](https://github.com/asenbanskaliev/ASEN/pull/65). No suponen ahorro de tokens real demostrado.
- **Rama de trabajo PR #61:** `508b31f543bf2547c6104ec562b1f826308746f2` es un **corte histórico**, anterior a la integración Windows de la [PR #69](https://github.com/asenbanskaliev/ASEN/pull/69). Consultar siempre el HEAD actual de la [PR #61](https://github.com/asenbanskaliev/ASEN/pull/61) y el CI de ese SHA antes de dar un paso dependiente; no fijar un SHA antiguo como referencia vigente.
- **CTX-1:** [PR #66](https://github.com/asenbanskaliev/ASEN/pull/66) con prueba de SDK Pi para herramientas seleccionadas; no equivale a activar nuevas guías.
- **Revisión de propuestas:** CodeRabbit y controles CI independientes. Ninguna revisión convierte pruebas omitidas en superadas.
- **18 objetivos:** aceptación funcional global pendiente; `globalFull:false`.

## Archivo histórico

[Documentos sustituidos de noviembre de 2026](../archive/2026-11/README.md): inventario anterior, megatandas y registros antiguos. Son referencias de trazabilidad, no órdenes vigentes.

## Otros planes ODD que siguen activos en su propio ámbito

- [Capacidades de Pi — documento dañado](pi-capability-completion.md): perdió parte de su historial y contiene caracteres corruptos. **No usarlo como única fuente de tareas ni de estados.** Ver [auditoría de recuperación, apartado F1](../archive/2026-11/INDEX-inventario-2026-11-14.md) y [última versión intacta anterior a la truncación](https://github.com/asenbanskaliev/ASEN/blob/a3977fe553a00cf0e3b76cc566d4093358da166b/odd/tasks/pi-capability-completion.md), solo para consulta histórica. La decisión documentada fue **no reconstruir** el archivo sin nueva autorización.
- [Continuación general](../../docs/remote-continuation.md): incluye traspasos antiguos; contrastar código, pruebas y SHA actuales antes de seguir cualquier prioridad.
- Planes de memoria, instalación, seguridad o tareas específicas conservan sus requisitos; no declarar completados por aparecer en el índice.

**Regla para no sobrecargar contexto:** empieza por este índice y abre solo el plan relacionado con la tarea. No cargues todos los archivos de `odd/tasks/`, `docs/audit/` ni `odd/archive/` automáticamente.
