# T10 — Plan de cierre auditado

## Alcance

T10 cubre la experiencia de workspace: jobs y monitores en segundo plano, agentes y resultados push, cambios Git por raíz/worktree, coordinación entre sesiones, perfiles ligados a sesión, notificaciones y terminales adaptables.

## Decisiones de referencia

La implementación de referencia separa `bash_background` de `monitor`, entrega el fin del proceso como evento, limita el tail a 20 líneas de 2.000 caracteres, mata el árbol de procesos, limpia logs al cerrar sesión y rechaza background en modos sin padre interactivo. Los resultados de agentes son push-driven y los cambios se agrupan por raíz Git. ASEN adopta esa semántica, pero conserva sus propios límites de autoridad y no copia implementaciones ni permisos.

## Tanda única implementada

1. `BackgroundJobRegistry`: estados explícitos, eventos únicos, tail acotado, límite anti-flood, timeout, parada y aislamiento por sesión.
2. Regresiones de salida larga, aislamiento, parada y flood.
3. El registro ya ejecuta procesos reales mediante `spawnContained`, captura stdout/stderr y registra el código de salida; todavía no se declara FULL hasta conectarlo al ciclo de herramientas de Pi y demostrarlo en los tres sistemas.
4. Los resúmenes generados por agentes no autorizan la aceptación: reviewer/verifier quedan pendientes de aceptación explícita en la UI de Pi y no cierran automáticamente el Todo del escritor relacionado.

## Cierre restante obligatorio

- conectar el registro al proceso real y a `bash_background`/`monitor`;
- entregar resultados de agentes sin polling ni duplicados;
- demostrar recuperación sin reejecución;
- completar snapshot Git de worktrees y conflictos;
- registro cross-session con permiso y TTL;
- perfiles por sesión;
- bus de notificaciones con replay/dedupe;
- snapshots de UI a 120/80/60/40 columnas;
- pruebas Windows/Linux/macOS y Pi 1.2.0;
- auditoría R4 y CI final del SHA.

## Criterio de FULL

T10 solo es FULL cuando todos los puntos anteriores tienen pruebas ejecutadas sobre el candidato final. La presencia de módulos o una suite verde parcial no es suficiente.

## Estado actual

T10 continúa en **PARTIAL**. La corrección R4 de L480 impide que una salida de modelo acepte por sí sola una revisión o cierre el Todo escritor; no completa la entrega push, la recuperación, la vista Git por worktree, la coordinación, las notificaciones, la accesibilidad ni la matriz final de plataformas.
