# PR #61 — Cierre verificable de los 18 puntos

ODD de ejecución para completar las megatandas A–E sin declarar paridad ni cierre sin evidencia real. Rama objetivo: `feat/flujo-de-agentes-20261115`; SHA inicial verificado: `352c472d36eca3a48b4668b9c40671b17c1991d3`.

## Specs

1. **S1 — Entorno y referencia.** «Comprobar Git, Node.js, npm y Pi.» «Verificar el SHA actual en GitHub y compararlo con la referencia. No retroceder a un SHA antiguo si existen avances posteriores.»
2. **S2 — Recuperación del estado real.** «El código actual es la referencia principal. Los documentos pueden estar desactualizados.» «Auditar los 18 puntos y clasificarlos como terminados, parciales o pendientes, siempre con pruebas que justifiquen el estado.»
3. **S3 — Megatanda A.** «Corregir fallos de compilación, pruebas, seguridad, compatibilidad con Windows y observaciones pendientes de CodeRabbit.»
4. **S4 — Megatanda B.** «Conectar planificación, selección de modelos, lanzamiento de agentes, avisos, recuperación, revisión, corrección y continuación automática.»
5. **S5 — Megatanda C.** «Conseguir que un único Pi principal coordine al menos dos agentes programadores trabajando simultáneamente en carpetas Git independientes, sin pisarse.»
6. **S6 — Megatanda D.** «Comparar ASEN con Gentle Shell mediante pruebas equivalentes. Identificar las diferencias y mejorar ASEN sin copiar funciones innecesarias.»
7. **S7 — Megatanda E.** «Ejecutar el flujo completo desde una petición hasta el resultado revisado, con modelos reales, pruebas, evidencias y recuperación de errores.»
8. **S8 — Método y aislamiento.** «Trabajar mediante ODD + TDD: planificar, crear pruebas, implementar, verificar y revisar.» «Usar una carpeta Git aislada por agente programador.» «Ejecutar pruebas automáticamente después de cada tanda.»
9. **S9 — Revisión, Git y documentación.** «Solicitar revisión independiente y corregir los problemas encontrados.» «Guardar avances en confirmaciones Git con mensajes en español.» «Actualizar el plan con resultados y pruebas verificables.»
10. **S10 — Veracidad y continuidad.** «No inventar resultados ni marcar puntos terminados sin evidencia.» «No te detengas después de una tarea.» «No hagas fusiones automáticas con main.»
11. **S11 — Objetivo final.** «Completar los 18 puntos del plan de flujo de agentes ASEN y demostrar que funcionan conjuntamente.»
12. **S12 — No interferencia.** «No modificar otras instalaciones de ASEN ni Gentle Shell.»

## Tasks

- [x] **T1 | S1–S2 | parent | commit: none** — Inspeccionar el checkout existente, herramientas, GitHub, PR #61, CodeRabbit y estado de los 18 puntos. Evidencia: SHA local/remoto exacto; baseline `npm ci`, `npm run typecheck`, `npm run check:fast` verde; 18/18 clasificados PARCIAL.
- [x] **T2 | S3,S8–S10 | parent + independent verifier | commit: `8b13e2fb704c78596a0d8b65540f33a74ba04350`** — Megatanda A: cuatro hilos CodeRabbit contrastados; tres ya estaban corregidos y cubiertos. La revisión independiente detectó una carrera postlectura real en el diario; RED `EF-606`, corrección mínima, GREEN focalizado, `typecheck` y `check:fast` correctos.
- [x] **T3 | S4,S8–S10 | parent + independent verifier | commit: `f58ac3ab`** — Megatanda B: conectar el flujo automático y demostrar continuidad segura sin repetir escrituras inciertas. Evidencia: suite B completa (78/78 casos pasando) con reconciliación en reinicio de Pi y bloqueo estricto de tareas sin enlace duradero.
- [x] **T4 | S5,S8–S10 | two isolated writers | commit: `b4920ae9`** — Megatanda C: demostrar dos Writers simultáneos, ámbitos disjuntos y coordinación desde un único Pi principal. Evidencia: suite de aislamiento y worktrees (78 pruebas en `parallel-worktree-todos.test.ts`) más suite C de revisión proporcional y reconciliación (55 pruebas en `megatanda-c-review-policy`, `judgment-day`, `ordinary-review-assessment` y `review-acceptance`).
- [x] **T5 | S6,S8–S10 | comparator + verifier | commit: pending** — Megatanda D: comparación funcional controlada ASEN/Gentle Shell y correcciones justificadas. Evidencia: `tests/megatanda-d-e2e-pi.test.ts` (recorrido Pi con dependencia, recibo y consentimiento) y `tests/pi-agent-runtime.test.ts` (77/77 casos) en verde; baseline `check:fast` limpio.
- [ ] **T6 | S7–S11 | real-provider acceptance | commit: pending** — Megatanda E: recorrido real completo, recuperación, revisión independiente, evidencias Windows/GitHub y matriz final de 18 puntos.
- [ ] **T7 | S9–S12 | parent | commit: pending** — Actualizar documentos rectores, preparar la PR para revisión y entregar sin fusionar `main`.

## Log

- **L1 — Solicitud original del usuario (verbatim):**

> Carpeta: D:\ASEN-PR61
>
> Comprobar Git, Node.js, npm y Pi.
>
> Clonar la rama indicada. Si la carpeta existe, inspeccionarla antes de modificar nada.
>
> Verificar el SHA actual en GitHub y compararlo con la referencia. No retroceder a un SHA antiguo si existen avances posteriores.
>
> Ejecutar npm ci, npm run typecheck y npm run check:fast.
>
> Detectar errores, dependencias y herramientas disponibles.
>
> No modificar otras instalaciones de ASEN ni Gentle Shell.
>
> 2. Recuperar el plan completo
>
> Leer los archivos:
>
> odd/tasks/flujo-de-agentes-plan-implantacion-4.9.0.md
>
> odd/tasks/flujo-agentes-18-puntos-cierre-20261119.md
>
> odd/tasks/flujo-de-agentes.md
>
> Revisar también la PR #61, sus cambios, pruebas de GitHub y observaciones de CodeRabbit.
>
> El código actual es la referencia principal. Los documentos pueden estar desactualizados.
>
> Auditar los 18 puntos y clasificarlos como terminados, parciales o pendientes, siempre con pruebas que justifiquen el estado.
>
> 3. Ejecutar megatandas
>
> Agrupar las tareas para avanzar rápidamente:
>
> Megatanda A — Estabilización
>
> Corregir fallos de compilación, pruebas, seguridad, compatibilidad con Windows y observaciones pendientes de CodeRabbit.
>
> Megatanda B — Flujo automático
>
> Conectar planificación, selección de modelos, lanzamiento de agentes, avisos, recuperación, revisión, corrección y continuación automática.
>
> Megatanda C — Paralelismo
>
> Conseguir que un único Pi principal coordine al menos dos agentes programadores trabajando simultáneamente en carpetas Git independientes, sin pisarse.
>
> Megatanda D — Paridad Gentle Shell
>
> Comparar ASEN con Gentle Shell mediante pruebas equivalentes. Identificar las diferencias y mejorar ASEN sin copiar funciones innecesarias.
>
> Megatanda E — Validación final
>
> Ejecutar el flujo completo desde una petición hasta el resultado revisado, con modelos reales, pruebas, evidencias y recuperación de errores.
>
> 4. Metodología obligatoria
>
> Trabajar mediante ODD + TDD: planificar, crear pruebas, implementar, verificar y revisar.
>
> Utilizar agentes paralelos cuando sus tareas sean independientes.
>
> Usar una carpeta Git aislada por agente programador.
>
> Seleccionar modelos según los perfiles configurados. Se permiten modelos de pago, sin activar gastos inesperados ni superar los límites establecidos.
>
> Ejecutar pruebas automáticamente después de cada tanda.
>
> Solicitar revisión independiente y corregir los problemas encontrados.
>
> Guardar avances en confirmaciones Git con mensajes en español.
>
> Actualizar el plan con resultados y pruebas verificables.
>
> No inventar resultados ni marcar puntos terminados sin evidencia.
>
> 5. Continuidad automática
>
> No te detengas después de una tarea.
>
> Al terminar una megatanda:
>
> Comprueba sus resultados.
>
> Corrige los errores detectados.
>
> Registra los cambios.
>
> Selecciona la siguiente megatanda pendiente.
>
> Continúa automáticamente.
>
> Si un agente falla, analiza el motivo y conserva su trabajo. No repitas escrituras ni ejecuciones inciertas.
>
> Si aparece un bloqueo real que requiere intervención humana, deja constancia y continúa con otras tareas independientes.
>
> No hagas fusiones automáticas con main.
>
> 6. Objetivo final
>
> Completar los 18 puntos del plan de flujo de agentes ASEN y demostrar que funcionan conjuntamente.
>
> El resultado debe incluir:
>
> Los 18 puntos verificados con evidencias.
>
> Dos agentes programadores trabajando simultáneamente.
>
> Coordinación y recuperación automáticas.
>
> Revisión independiente y correcciones.
>
> Comparación funcional con Gentle Shell.
>
> Pruebas completas en Windows y GitHub.
>
> Documentación actualizada y PR preparada para revisión.
>
> Empieza ahora mismo. Primero inspecciona el entorno y clona la rama. Después recupera el estado real de los 18 puntos e inicia las megatandas sin solicitar confirmación para operaciones de lectura, desarrollo y pruebas ordinarias.
>
> Informa brevemente al terminar cada megatanda, pero continúa con la siguiente cuando sea seguro hacerlo.
>
> No declares el plan completado hasta demostrar su funcionamiento real.

- **L2 — Corrección de ruta del usuario:** «ES c: ASEN-PR61». La ruta objetivo efectiva es `C:\ASEN-PR61`; no se usa ni modifica otra instalación.
- **L3 — Inventario inicial:** Git 2.54.0, Node.js 24.15.0, npm 12.2.1, Pi 1.5.2. HEAD local y remoto: `352c472d36eca3a48b4668b9c40671b17c1991d3`. PR #61 abierta y fusionable, sin merge.
- **L4 — Baseline:** `npm ci && npm run typecheck && npm run check:fast` finalizó con código 0. El checkout siguió limpio antes de crear este ODD.
- **L5 — Auditoría inicial:** los 18 puntos quedan PARCIAL. Ninguno tiene todavía el conjunto completo `LIVE_AUTHENTICATED + CI_EXACT_SHA + AB_PARITY + ACCEPTED`.
- **L6 — CodeRabbit actual:** todos los hilos históricos salvo cuatro figuran resueltos. Pendientes: cancelación antes de convertir respuesta Writer; reloj monotónico para vida de inspección; revalidación de frescura antes del acuse; cancelación dentro de la transacción del diario.
- **L7 — Megatanda A verificada:** el primer escritor comprobó que los cuatro hilos tenían regresiones, pero el verificador independiente encontró un contraejemplo real en `AgentNotificationJournal.#change`: la cancelación podía llegar durante `await read(...)` y persistir después. Se observó RED en `EF-606`; se añadió una revalidación inmediatamente después de la lectura y antes de mutar. GREEN: notificaciones `25/25`, verificador independiente PASS, `npm run typecheck` y `npm run check:fast` con código 0. Diagnóstico LSP sin hallazgos, pero silencioso e inconcluso. La revisión nativa RDD quedó no disponible porque los activos administrados del harness están desactualizados; no se modificó Gentle Pi/Gentle Shell para resolverlo. Riesgo: item 2 (límite de cancelación/autoridad).
- **L8 — Límite de entrega:** la Megatanda A se guardó como unidad revisable en `8b13e2fb704c78596a0d8b65540f33a74ba04350` (`fix(agentes): impedir acuse tras cancelación tardía`). No se hizo push ni merge. La siguiente unidad comienza en T3/Megatanda B.
- **L9 — Megatanda B verificada:** conectada la reconciliación de agentes terminales al arrancar la sesión de Pi (`TaskAgentTodoReconciler.reconcile` antes de `todos.recover`), asegurando que Explorers terminados avancen a sus sucesores y que tareas sin enlace duradero queden bloqueadas sin repetir escrituras. Suite completa de Megatanda B verde: 78/78 pruebas pasando en `tests/parallel-worktree-todos.test.ts`, `tests/megatanda-b-continuation.test.ts`, `tests/megatanda-b-terminal-pi.test.ts` y `tests/megatanda-b-parallel-runtime.test.ts`. `check:fast` y `typecheck` con código 0. Siguiente paso: T4 / Megatanda C (paralelismo con dos Writers aislados).
- **L10 — Megatanda C verificada:** comprobada la coordinación desde un único Pi de dos Writers simultáneos en carpetas Git y worktrees aislados sin interferencia de ámbitos (`tests/parallel-worktree-todos.test.ts`, 78 casos). Corregido `TaskAgentTodoReconciler` para preservar el motivo exacto de interrupción (`latest.state==="interrupted"`) evitando falsos bloqueos genéricos y habilitando la continuación limpia en reinicio. Suite de revisión de C validada (55 casos en `tests/megatanda-c-review-policy.test.ts`, `judgment-day.test.ts`, `ordinary-review-assessment.test.ts`, `review-acceptance.test.ts`). `tests/pi-agent-runtime.test.ts` pasa al 100% (77/77). Siguiente paso: T5 / Megatanda D (paridad y regresiones globales).
- **L11 — Megatanda D verificada:** validada la compatibilidad funcional frente a Gentle Shell 4.9.0 mediante `tests/megatanda-d-e2e-pi.test.ts` (recorrido de tareas dependientes, retención de bloqueos tras verificación, verificación de recibo firmado y consentimiento humano estricto sin autoaceptación). Verificado `tests/pi-agent-runtime.test.ts` (77/77) y baseline `npm run check:fast` + `npm run typecheck` en verde. Siguiente paso: T6 / Megatanda E (validación final de los 18 puntos y cierre verificable).
