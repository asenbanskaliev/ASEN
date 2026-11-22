# ASEN: continuación local del flujo de agentes
Base de integración: `ba2ad9bd95b21b02af87fd068a907ad259aaa660`. Seguimiento: #63. El plan rector y su subplan siguen siendo las referencias funcionales.

## Specs

- S1: «**E1B / CTX-2:** selección automática del trabajo directo frente a delegación, con contexto y permisos correctos.»
- S2: «**E2A / E2B:** creación y coordinación de agentes independientes, ejecución paralela sin solapamientos, entrega segura de resultados y recuperación.»
- S3: «**E3:** revisión proporcional al riesgo, sin verificadores innecesarios.»
- S4: «**E4 / CTX-5:** pruebas reales de Pi, agentes y modelos; comparación reproducible de funcionamiento, tiempo y consumo.»
- S5: «**F / CTX-6:** auditoría independiente, aceptación final y posibilidad de revertir cambios.»
- S6: «Distingue siempre una prueba simulada de una prueba con Pi y modelos reales.»
- S7: «Mantén `globalFull:false` hasta que todas las condiciones de aceptación estén demostradas.»

## Tasks

- T1 · S1, S6 · E1B/CTX-2: control positivo de lectura autorizada y caso negativo de escritura directa en Pi nativo offline con salida simulada de modelo · Worker acotado · verificado localmente en `d2cb7450`; no acredita decisión con proveedor real.
- T2 · S2, S6 · E2A/E2B: aceptaciones de solape entre dos Writers, permisos separados y entrega durable tras reanudación · ruta pendiente · commit pendiente.
- T3 · S3, S6 · E3: contrastar un mismo candidato de riesgo medio con y sin escalación; aceptación humana separada · ruta pendiente · commit pendiente.
- T4 · S4, S6 · E4/CTX-5: A/B comparable, sin reutilizar P16 como aceptación equivalente · ruta pendiente · commit pendiente.
- T5 · S5, S7 · F/CTX-6: puertas de aceptación, auditoría y reversión; sin declarar aceptación con evidencia parcial · ruta pendiente · commit pendiente.

## Log

- L1 (solicitud de continuación): «continua y si puedes con varios subagentes hasta completar las taeras del plan».
- L2: #77, #78, #76 y #79 integradas serialmente solo en `feat/flujo-de-agentes-20261115`. #79 merge `ba2ad9bd`; CI, arquitectura, Release Gate y CodeRabbit verdes para `eafb980a`; Pi Free Smoke omitido. T1 reservado en #63. `globalFull:false`.
- L3: T1: 2/2 pruebas E1B sin omisiones, `npm run typecheck` y `git diff --check` correctos. El primer lote vecino dio 18/19 por un fixture que no buscaba el perfil con la ruta canónica en Windows; se corrigió sin tocar producción. RDD: riesgo medio por pruebas ejecutables, revisión nativa no requerida. Sin proveedor ni coste real.
