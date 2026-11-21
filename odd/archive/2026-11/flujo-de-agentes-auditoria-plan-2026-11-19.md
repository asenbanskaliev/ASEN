# ASEN — Auditoría del plan rector de implantación (19/11/2026)

## Alcance y fuentes
Revisión documental de `flujo-de-agentes-plan-implantacion-4.9.0.md`, `flujo-de-agentes-comparativa-actual-4.9.0.md` y `flujo-de-agentes.md`, rama `feat/flujo-de-agentes-20261115`. Referencia de comportamiento: Gentle Shell 4.9.0. Esta revisión no constituye una auditoría independiente del código nuevo de E0–E4 ni prueba de ejecución real.

## Resultado
**Plan completo para iniciar implantación, con reservas verificables.** Hay 18 objetivos numerados (01–18), fases E0, E1A, E1B, E2A, E2B, E3, E4 y F, orden de dependencias, pruebas negativas, criterios de aprobación y límites de escritura. Los 18 objetivos quedan asignados a una fase. No declarar E1–E4 finalizadas ni `globalFull:true`.

## Lo que está bien definido
1. Automatización continua sin solicitar «continúa» para cada unidad segura.
2. Modelos gratuitos y de pago **ya configurados** como parte de la elección del perfil, sin confundir autorización de modelo con autorización para editar.
3. Dos modos: `organic` y `full-delegation`, con prohibición de edición directa por el padre en el segundo.
4. Ejecución paralela inicial de dos unidades independientes, conservando identidad, dependencias y permisos exactos.
5. Entrega única, conservación de estados e incertidumbre; ningún reintento oculto de escritura.
6. Revisión proporcionada al riesgo, dos jueces cuando proceda y reparación separada.
7. Ensayo real comparativo, registro de gasto desconocido como `unknown`, y auditoría final antes de declarar equivalencia.

## Hallazgos y condiciones que deben resolverse
- **A1 · Bloqueante para E2A:** confirmar que el anfitrión Pi admite autorización única acotada al lote con concesiones individuales comprobables. Si no, mantener aprobación por Worker; no fingir el permiso.
- **A2 · Bloqueante para E4/F:** la evidencia simulada del flujo no equivale a dos Writers auténticos ni a comparación de costes y calidad con Gentle Shell.
- **A3 · Alta:** congelar SHA del último CI completo y comprobar resultados de Windows, macOS, Linux y Release Gate en el SHA que se vaya a aprobar. No heredar el verde de otro commit.
- **A4 · Alta:** antes de ejecutar E1, probar migración o compatibilidad de perfiles existentes y los dos modos frente a sesiones reanudadas y tareas en marcha.
- **A5 · Alta:** validar entrega única y continuación automática con reinicio, padre ocupado, cancelación, fin vacío y fallo incierto, sin doble ejecución.
- **A6 · Alta:** comprobar que la revisión por riesgo es obligatoria en el camino real de producción; las recomendaciones informativas no bastan.
- **A7 · Media:** no suponer que Pi y Gentle Shell comparten idénticas capacidades; mantener la matriz de capacidades por versión y sistema.
- **A8 · Media:** definir con medidas reales umbral del investigador, número óptimo de agentes, tiempo y gasto; no prometer mayor rapidez antes de medir.

## Puertas de aceptación
- **E0:** capacidades Pi y estados conocidos; pruebas negativas y SHA base; no regresión grave.
- **E1:** rutas y perfiles probados; modelos configurados usados sin permisos de escritura implícitos.
- **E2:** dos agentes reales aislados y en solape; una sola entrega; continuación tras fallos sin reintentos dudosos.
- **E3:** verificación de riesgos, doble juicio y reparación con permisos.
- **E4:** escenarios A/B repetibles con métricas y evidencia de modelo real, `unknown` cuando faltan datos.
- **F:** auditoría independiente, 0 fallos graves abiertos, CI/Gate del mismo SHA y aprobación humana. Nunca fusión automática.

## Dictamen
**APTO PARA COMENZAR E0; NO APTO PARA DECLARAR PARIDAD O IMPLANTACIÓN COMPLETA.** Mantener `globalFull:false`, PR #61 sin fusionar, sin relajar escritura o seguridad. La siguiente actuación es E0 (capacidades Pi y pruebas negativas), seguida de E1A (modelos configurados) y E1B (modos y decisiones).
