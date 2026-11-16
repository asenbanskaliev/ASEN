# Tanda agrupada T06 + T09, revisión T04/T07/T08/T10 — 16/11/2026

## T06 — ejecución real bajo autorización separada

- Se mantiene la prueba manual de dos escritores Pi: sin aprobación humana literal no arranca ninguno. No se han aportado esas dos aprobaciones ni ejecutado modelos Writer desde esta tanda.
- La comprobación de las funciones generadas usa ahora Node con `--permission` y lectura permitida **solo** del archivo correspondiente. No se habilitan escritura, red ni procesos hijos; se eliminan variables heredadas con claves de proveedores y `NODE_OPTIONS`.
- Se rechazan enlaces simbólicos y rutas distintas de los dos archivos de ejemplo. Las pruebas negativas comprueban que Node deniega leer un archivo distinto.
- El modelo de permisos de Node es **defensa adicional, no un aislamiento de sistema operativo**. Ejecutar únicamente en un equipo de pruebas sin secretos ni datos productivos. No aceptar un informe Writer como prueba de integración de un Todo.

## T09 — comparación conjunta 1/2/4

- `compareAgentFlowABSeries` exige **seis observaciones**, una de ASEN y una de Gentle Shell para 1, 2 y 4 agentes.
- Los pares deben compartir entradas, herramientas, permisos, sistema operativo, modelo y grado de razonamiento; dentro de cada producto la misma revisión y contexto deben mantenerse para los tres grados de paralelismo.
- Se bloquean recibos o identidades repetidas, falta de consumo medido, defectos críticos y requisitos incumplidos. Solo compara duración y velocidad relativa cuando todos los pares son admisibles; coste sigue **desconocido** sin verificación de cobro.
- No se han ejecutado seis pruebas reales en este cambio. Los datos de las pruebas unitarias son sintéticos y no se pueden publicar como cifras de rendimiento.

## T04 + T07 + T08 — controles que siguen en vigor

- T04: ningún dictamen `succeeded` da por aprobado un Todo ni concede permisos de escritura.
- T07: el panel continúa mostrando `unknown` para modelos no acreditados, y el cambio sigue sin aceptar automáticamente.
- T08: una propuesta Fix guardada necesita una nueva instrucción ODD, comprobación del árbol y consentimiento Writer antes del lanzamiento.
- No se ha declarado en esta tanda la equivalencia completa de estos módulos ni una reparación Writer ejecutada de extremo a extremo.

## T10 — condiciones pendientes de auditoría independiente

1. Auditor distinto del autor revisa el cambio y la separación de permisos; la auditoría interna no equivale a T10.
2. Ejecutar CI, Release Gate, Phase 0 y Pi runtime para el SHA exacto tras publicar.
3. Ejecutar manualmente dos Writers auténticos, mantener los dos consentimientos independientes y conservar recibos sin secretos.
4. Contrastar los recibos A/B verdaderos de ASEN y Gentle Shell en los tres niveles, sin inferir coste a partir de precio publicado.
5. Mantener abierta la incidencia Windows `0xC0000409` hasta evidencia reproducible de causa y corrección.

**Estado:** T06/T09/T10 parciales; T04/T07/T08 conectados en fases previas pero pendientes de pruebas funcionales finales. `globalFull:false`. Sin fusión ni pago autorizado.
