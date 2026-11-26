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
- **G02/B1/#149** — SHA `c6a2d47c83ab9fe61741f83ecae78ff74c2c82d6`: el refresco de presión ya no ejecuta Git síncrono; el observador informa si sigue activo para poder recrearlo tras una cancelación. CI y revisión completa se ejecutan sobre este SHA; Pi Free Smoke omitida.
- **G08 está parcialmente implementado en #147/#148:** `managed-acquisition-update.ts` prepara versiones declaradas; el instalador ya aplica bloqueo de mantenimiento, controles de integridad y reintentos Windows limitados. Hay 24 pruebas de instalación y 13 de composición. La actualización declara selección y activación como `not-run`; falta demostrar restauración de versión activa después de fallo/interrupción y cancelación segura.
- Por tanto, **M2 no está cerrada**. La matriz Pi sin modelos y la prueba de cola no acreditan la identidad efectiva ni la independencia de dos modelos ejecutados; esa evidencia continúa pendiente bajo `noModelCalls:true`. La regresión de cambio tras el inicio ya está añadida en B1 y espera CI exacta; cubre snapshot del ejecutor sin acreditar intentos de proveedor ni identidad real de modelos. No se deben reutilizar resultados de un SHA distinto ni contar trabajos omitidos como aprobados.

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


## Plan operativo actualizado para cerrar M2 — 26/11/2026

La política general conserva `noModelCalls:true` y `globalFull:false`. Sigue vigente la excepción NVIDIA limitada de #149: dos solicitudes API de hasta 128 tokens y dos sesiones Pi reales Explorer/Verifier, sin herramientas ni escrituras. La autorización es por PR, rama, SHA, actor y etiqueta. Marcadores persistentes separados impiden repetir ambas fases.

### Puertas concretas de M2

1. **Pi y cola:** validar compatibilidad 1.2/1.6, dependencias alineadas, cola y snapshot durante y después de la ejecución en el SHA consolidado.
2. **Perfiles e identidad:** cerrar los hallazgos B1; verificar selección de perfil, alternativas, modelo devuelto y dos sesiones reales distintas. No atribuir identidad física cuando solo se conoce la declaración del proveedor.
3. **G02:** probar cambios de ajuste en reposo, API ausente, lectura fallida y presión en ambos sentidos. No recorrer historial ni ejecutar Git síncrono por cada sondeo.
4. **G08:** usar solamente `managed-lifecycle.ts`. Windows prueba instalación, fallos antes/después de activar, interrupción de diario y rollback. El staging CLI huérfano se retiró.
5. **T06:** conservar permisos mínimos y marcadores no repetibles para API y sesiones Pi. Ejecutar después de CI completa, Release Gate y CodeRabbit exactos.
6. **Cierre:** registrar resultados y SHA final. No fusionar ramas protegidas sin admisión y autorización.

La prueba Windows del SHA `ddffab1cc6ea0354e4b1f800f1bc5dece544b6ca` falló: `ownMarker` exigía que la ruta lexical del marcador coincidiera con `realpath`. En Windows, la ruta temporal podía resolverse mediante alias 8.3; el bloqueo devolvía `LOCK_RETAINED`, por lo que el verificador no iniciaba el CLI y cinco regresiones de actualización no llegaban a probar rollback.

El SHA `9f5dbeb2bd710ba169e9446d55899b621378c354` corrige el bloqueo comparando la identidad física del archivo lexical y resuelto y comprobando que ambos siguen dentro del directorio de instalación. También corrige los cuatro hallazgos CodeRabbit de ese corte: orden de publicación G02, consultas fallidas del marcador NVIDIA/Pi, límites del bloque Windows en su prueba y propagación de fallos PowerShell. La revisión automática posterior identificó tres aserciones de pruebas que aún esperaban el diagnóstico antiguo de deriva; `b186e7d655824b0613959772b86651f93f2c8bf2` actualiza esas aserciones sin relajar los controles.

En `b186e7d` pasaron CI rápida, Phase 0 y Pi 1.2, pero G08 Windows falló en cinco casos T09: el inventario rechazó una ruta temporal alias al compararla con `realpath`. Las pruebas del bloqueo Windows sí pasaron. `59a0fdab58d0301120f4f0c262f26e172954d1ca` no bastó: G08 volvió a fallar en las cinco pruebas de ciclo porque la ruta física no coincidió con la resolución síncrona. `762c9cb7bc46fb0da07f02cdd10afa4bc257bdea` pasó G08 Windows: typecheck y pruebas de instalación, bloqueo, upgrade, rollback e interrupción del diario. CodeRabbit revisó después y encontró una aserción T06 con una expresión jq mal copiada y que G02 podía sincronizar el fingerprint antiguo de ajustes con el estado más reciente. `ccada704cbf029632d9c2cf914e2d95c39de2c23` corrige ambos casos; CI exacta y revisión final siguen pendientes. Pi Free Smoke quedó omitido y no acredita ensayo real. La revisión completa CodeRabbit del SHA final y el ensayo acotado de NVIDIA/Pi siguen pendientes. #149 permanece abierta y sin fusionar.

La observación sobre `getSettings` ausente se corrigió en `4c1264a` y su hilo quedó resuelto.



### Actualización de validación M2 — 26/11/2026

La suite completa del SHA ccada704cbf029632d9c2cf914e2d95c39de2c23 detectó una diferencia de diagnóstico en Windows al alterar el binario mientras la sonda esperaba el bloqueo. El proceso no se ejecutó y no creó datos temporales; Windows rechazó el inventario como owned-installation-not-recognized, mientras otras plataformas informaron candidate-drift-before-launch. La regresión ahora acepta ambos motivos de rechazo seguro y conserva las comprobaciones de cero intentos, salida vacía, ningún temporal y bloqueo eliminado.

La corrección se publicó como SHA 1d44a763b12703ad2e597b450087c977faf66143 en #149. La actualización segura G08 ya pasó en Windows en el SHA ccada704 (job 140140299346) y en 762c9cb (run 45886658455). Esas pruebas no reemplazan la CI completa del nuevo SHA. La validación de 1d44a76, la revisión completa CodeRabbit y el ensayo acotado NVIDIA/Pi siguen pendientes; Pi Free Smoke omitido no cuenta como evidencia real. #149 permanece abierta y sin fusionar. globalFull:false.


### Correcciones CodeRabbit G02 — 26/11/2026

En la revisión completa del SHA 1d44a763b12703ad2e597b450087c977faf66143, CodeRabbit señaló que una captura de ajustes con valor undefined podía disparar una segunda lectura y que un refresco completo antiguo podía publicar después de perder la propiedad del estado. Ambos hallazgos (comentarios 4712914863 y 4712914868) se corrigieron en el SHA 586f7a0b08bb544c71cc7a873da13c99560ac23c. Se eliminó el valor predeterminado que releía ajustes, se hizo explícita la captura en los dos puntos de observación, y se añadió al control de publicación la comprobación de que el mismo UI conserva la propiedad. Las pruebas de G02 exigen estas garantías.

Las validaciones del SHA 1d44a76 quedan supersedidas para la admisión: CI completa/Release Gate del SHA nuevo deben volver a pasar. G08 Windows y T02–T11 sí habían pasado en el SHA anterior, pero no se atribuyen al nuevo. La nueva revisión independiente exacta también queda pendiente. No ejecutar el permiso NVIDIA/Pi hasta cerrar esas puertas. globalFull:false.

### Corrección de recuperación parcial G08 — 26/11/2026

CodeRabbit detectó en el SHA 586f7a0 que dos gates de recuperación parcial comparaban la ruta física guardada en el recibo con la ruta lexical solicitada. En Windows, un alias 8.3 válido podía causar rechazo seguro antes de recuperar. El SHA 315fc98d3fee6014e5a0b8f3d1bfa0f34eaee28c alinea ambos gates con realpath(root) y amplía la prueba Windows: alias 8.3, inventario alterado, recuperación parcial, callback ejecutado una sola vez y marcador retirado con seguridad.

Este cambio vuelve a invalidar como evidencia de cierre la CI anterior. G08 había pasado en sus pruebas dedicadas, pero la nueva regresión requiere CI completa y revisión CodeRabbit sobre 315fc98. Solo después de ambas, y del Release Gate y Pi exactos, se consumirá la única autorización NVIDIA/Pi. globalFull:false.

### Evidencia exacta de CI G02/G08 — SHA 315fc98 — 26/11/2026

El SHA 315fc98d3fee6014e5a0b8f3d1bfa0f34eaee28c pasó CI completa (run 45890471242), CI rápida (45890472526), Release Gate (45890471359), Phase 0 (45890471186), Pi 1.2 runtime (45890471273) y la matriz Pi de Linux, macOS y Windows. El job Windows G08 140151640110 ejecutó typecheck, 34 pruebas de instalación, 12 del bloqueo, 5 de upgrade/rollback/interrupción y la prueba de alias 8.3 con inventario alterado; todas pasaron. Pi Free Smoke quedó omitido y no se cuenta.

CodeRabbit completó una revisión anterior sobre 586f7a0 que encontró el desajuste de raíz física; 315fc98 lo corrige y la prueba Windows exacta lo cubre. La revisión completa para 315fc98 está en curso. Las puertas automáticas aún muestran el permiso real NVIDIA/Pi como omitido; ese ensayo acotado solo se ejecutará después de que CodeRabbit cierre el SHA exacto sin hallazgos accionables abiertos. #149 sigue abierta y sin fusionar; globalFull:false.

### Endurecimiento del permiso T06 — SHA 472547ae — 26/11/2026

La consulta del marcador de consumo ahora solo considera comentarios publicados por `github-actions[bot]`. Un comentario de otro usuario no puede reservar ni bloquear el permiso de una sola ejecución. La prueba negativa comprueba ambos lectores (API y Pi) y rechaza la consulta sin filtro de autor. El SHA 472547ae809be6e1a8f485ff404eed3bc5953688 vuelve a requerir CI completa, CI rápida, Release Gate, Phase 0, Pi 1.2 y revisión CodeRabbit exactas. La llamada NVIDIA/Pi permanece bloqueada hasta que todas pasen; Pi Free Smoke omitido no cuenta. #149 sigue abierta y sin fusionar; globalFull:false.


La CI rápida de `472547ae` encontró una prueba general de ramas que rechazaba cualquier igualdad con comillas dobles, incluida la nueva comprobación del autor. Se restringió esa prueba a comparaciones de `github.head_ref` en `3eafc1951776d19c8a21d525904be95acded984b`. Todas las puertas y la revisión independiente se vuelven a exigir sobre este SHA. La autorización NVIDIA/Pi sigue bloqueada.
