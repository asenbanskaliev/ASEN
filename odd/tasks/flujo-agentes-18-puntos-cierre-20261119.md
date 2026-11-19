# ASEN — Control de cierre de los 18 puntos (19/11/2026)

## Fuente de verificación
- PR: https://github.com/asenbanskaliev/ASEN/pull/61
- Rama: `feat/flujo-de-agentes-20261115`
- SHA de referencia anterior a este registro: `4b83981399de9a4e86dc4ac06e66681054b178eb`
- En este SHA, GitHub Actions mostró `success` para CI, Release Gate, Phase 0 Architecture y Pi 1.2 runtime evidence. Pi Free Smoke quedó `skipped`; no acredita modelo autenticado.
- PR en borrador, no fusionada. Este documento **no equivale a aceptación funcional**, ni puede sustituir pruebas de un SHA posterior.

## Lista verificable de los 18 puntos

| Nº | Resultado que debe quedar probado | Estado de cierre |
| --- | --- | --- |
| 1 | Decisión automática entre trabajar directamente y delegar | Pendiente de evidencia E2E |
| 2 | Dos modos de delegación con conducta diferenciada | Pendiente de evidencia E2E |
| 3 | Explorer investiga cuando aporta valor | Pendiente de evidencia E2E |
| 4 | Divide trabajos manteniendo dependencias y ámbitos | Pendiente de evidencia E2E |
| 5 | Varios Workers reales en paralelo, sin pisarse | Parcial: evidencias Pi/NVIDIA de Writer estático; flujo completo no probado |
| 6 | Cada Writer respeta su propia autorización y archivos | Parcial: controles y pruebas de aislamiento; aceptación global no probada |
| 7 | El padre recoge y muestra los resultados reales | Parcial: atribución y paneles; falta prueba integral |
| 8 | Falla, cancela y recupera sin repetir escrituras dudosas | Parcial: controles y pruebas negativas; falta ejecución integral |
| 9 | Alterna modelo ante fallo sin perder permisos ni contexto | Pendiente de evidencia E2E |
| 10 | Aplica el modelo configurado por perfil y registra el real | Parcial: selección y pruebas; recibo real E2E pendiente |
| 11 | Verifica resultados y riesgos antes de aceptar cambios | Parcial: controles existentes; falta aceptación integral |
| 12 | Revisa cambios con pruebas y criterios independientes | Parcial: revisión conectada; falta prueba integral |
| 13 | Dos jueces distintos deciden sin elevar permisos | Parcial: vía de revisión; falta revisión autenticada y evidencia final |
| 14 | Pregunta solo lo necesario, respetando autorizaciones exigidas | Pendiente de evidencia E2E |
| 15 | Protege rama, HEAD, credenciales y archivos autorizados | Parcial: controles y gates; falta ataque integral sobre versión final |
| 16 | Mide duración, errores y coste auténticos de 1/2/4 agentes | Parcial: comparación instrumental; falta A/B real comparable |
| 17 | Prueba el flujo desde petición hasta revisión y resultado | Pendiente de prueba E2E completa |
| 18 | Demuestra compatibilidad entre Pi, agentes y ASEN | Parcial: Pi 1.2 runtime verde; falta integración con modelos reales |

**Criterio único:** `TERMINADO` solo cuando existe evidencia enlazada de ejecución de producción o Pi real con las condiciones completas para ese punto, pruebas de error relevantes, revisión de permisos y CI/Release Gate del mismo SHA. `skipped`, pruebas simuladas, documentación o un modelo que no contesta no cuentan como FULL.

## Megatandas de ejecución
- A: 1, 2, 3, 4, 9, 10, 14, 18 — planificación, perfiles y modelos.
- B: 5, 6, 7, 8, 11, 12, 13, 15 — Workers, resultados, recuperación, revisiones y seguridad.
- C: 16, 17 — medida y ensayo completo.

## Dependencias de cierre
1. Confirmar los escenarios reales que ya cubre el código actual, evitando añadir un segundo orquestador.
2. Completar pruebas negativas y de integración sobre la ruta Pi/Dispatcher vigente.
3. Ejecutar los ensayos autenticados y de escritura exclusivamente bajo los permisos por Writer, modelos reales y controles de coste aprobados; **no simular consentimientos**.
4. Comparar con Gentle Shell con la misma entrada y condiciones, y revisar los 18 recibos.
5. Mantener `globalFull:false` y la PR abierta hasta que los 18 puntos superen su criterio y se compruebe el último SHA. **No fusionar con main automáticamente.**

## Próxima prioridad
La siguiente tanda funcional es cerrar las pruebas E2E de selección de perfiles y flujo de delegación (A) y sus controles negativos, aprovechando `DelegationTurnLatch`, `applyStartupOrchestratorModel` y los tests `e1-*` existentes. Después conectar prueba Writer→Verifier→revisión→recogida (B) y ensayos medidos (C). Este registro no declara ningún punto finalizado.
