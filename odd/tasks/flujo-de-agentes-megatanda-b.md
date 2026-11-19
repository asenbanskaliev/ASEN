# Megatanda B — coordinación, comunicación, fallos y continuidad

**Fecha:** 2026-11-19.
**Rama:** `feat/flujo-de-agentes-20261115`; PR #61, sin fusión.
**Referencia de comportamiento:** versión 4.9.0, cuya investigación completa ya está enlazada desde el plan principal.
**Estado:** IMPLEMENTACIÓN_CONECTADA / PRUEBAS_AÑADIDAS; el CI exacto del último SHA y la equivalencia entre proveedores requieren evidencias separadas. `globalFull:false`.
**Prohibido:** repetir escrituras inciertas, cambiar el objetivo, reutilizar permisos, pagar modelos no consentidos, fusionar automáticamente, reemplazar el motor Pi o anunciar como consumido un aviso meramente encolado.

## Auditoría antes de modificar

Se siguieron las rutas productivas del mismo repositorio:

1. **Tareas y planificación:** `src/runtime/lifecycle/todo-store.ts`, `plan-dispatcher.ts`. Ya tienen grafo de dependencias, versión por tarea, admisión por ámbito, comprobación de SHA y enlace a la sesión.
2. **Paralelismo con permisos:** `src/runtime/agents/parallel-parent-supervisor.ts`, `parallel-parent-supervisor-claims.ts` y `parallel-worktree-reconciliation.ts`. La intención del lote se registra antes de iniciar los hijos y cada Worker requiere nueva confirmación. No hay fusión ni segundo intento automáticos.
3. **Agentes y resultados:** `src/agents/agent-runtime.ts`, `src/runtime/agents/task-agent-reconciler.ts`, `agent-terminal-delivery.ts` y `agent-notification-journal.ts`. El evento terminal se registra; una escritura completada no equivale a revisión aceptada y un mensaje encolado no prueba lectura del padre.
4. **Enlace real al host:** `extensions/asen.ts`. El resultado correcto del hijo ya podía avanzar el siguiente Todo. Cuando fallaba, se bloqueaba su Todo, pero **no se volvía a examinar** la posibilidad de continuar una tarea independiente.
5. **Hueco en el supervisor:** ante un **rechazo humano explícito** de un Worker individual, el lote terminaba inmediatamente. Una tarea distinta y preparada, con su propio ámbito, sesión y consentimiento, quedaba innecesariamente parada. Las paradas ambiguas, por permisos cambiados o Git inseguro **deben seguir siendo terminales**.

## Cambios ejecutados y razón

| Subtanda | Archivo conectado | Decisión de seguridad |
| --- | --- | --- |
| B1 · Independencia real del Worker | `src/runtime/agents/parallel-parent-supervisor.ts` | Un rechazo explícito de una unidad no impide preguntar por otra preparada e independiente. Antes de seguir comprueba que el Worker rechazado no arrancó, que el Todo sigue planificado, que no existe agente Worker ni enlace durable. **Ante la mínima incertidumbre, se detiene todo el lote restante.** |
| B2 · Continuación tras fallo | `src/runtime/lifecycle/plan-dispatcher.ts` | Ruta adicional exclusivamente para continuación independiente: requiere ID de Todo bloqueado y previamente persistido; solo permite Explorer, Reviewer o Verifier con todas las dependencias cubiertas y modelo de coste cero comprobado. **Nunca selecciona Worker ni Clarifier.** No altera la ruta normal ni la selección exacta del supervisor. |
| B3 · Conexión terminal efectiva | `extensions/asen.ts` | Solo si el estado terminal es `failed`, la sesión/proyecto coinciden, hay un único enlace al agente y la tarea quedó `blocked` tras reconciliar, se solicita la continuación segura. `cancelled` y escrituras dudosas **no se reintentan**. |
| B4 · Precio y estado cambiantes | `extensions/asen.ts` y `plan-dispatcher.ts` | Se resuelve el modelo exacto mediante el catálogo de Pi, verificando cuatro tarifas de valor cero. La comprobación se repite inmediatamente antes del enlace del hijo con su Todo. Un cambio de credencial o de coste hace fallar esa ejecución. |
| B5 · Protección de los resultados y Git | Componentes actuales, sin reemplazos | Se preservan diarios de intento único, versión de Git, ámbitos exactos, bloqueo por contradicciones, avisos terminales persistentes, aceptación humana y prohibición de fusionar. No se ha añadido una cola ni un nuevo proceso supervisor. |

## Casuísticas A/B obligatorias

| Caso | Situación A | Situación B | Resultado exigido |
| --- | --- | --- | --- |
| B-01 | Dos trabajos independientes, cada uno con permiso | Uno depende del otro | A pueden ejecutarse a la vez; B espera su dependencia |
| B-02 | Primer Worker aprobado | Primer Worker rechazado con estado probado | A arranca; B no arranca pero el segundo independiente puede pedir su propio permiso |
| B-03 | Rechazo antes de iniciar hijo | Rechazo con algún enlace o Worker ya presente | A permite continuar; B se detiene por resultado incierto |
| B-04 | Dos ejecuciones comparten el mismo ámbito | Ámbitos diferentes y confirmados | A se bloquea; B conserva los controles por Worker |
| B-05 | Uno falla con resultado confirmado | Otro falla tras posible escritura no confirmada | A se bloquea solo para esa unidad; B no obtiene una repetición automática |
| B-06 | Al fallar A queda un Explorer libre | Queda solo un Worker | A puede empezar sin nuevo permiso de escritura; B no se lanza |
| B-07 | El Explorer alternativo tiene cuatro tarifas cero | Falta alguna tarifa o hay una positiva | A admite la lectura; B se bloquea por coste no verificado |
| B-08 | Modelo continúa siendo gratuito al lanzar | Cambia el precio durante preparación | A puede empezar; B se detiene antes de ejecutar |
| B-09 | Fallo Pi terminal `failed` | Usuario cancela `cancelled` | A puede evaluar otros Todos; B no provoca continuación automática |
| B-10 | Todo fallido con enlace único y estado bloqueado | Todo inventado o contradictorio | A puede evaluar otras unidades; B no continúa |
| B-11 | Sesión y proyecto originales | El padre cambió de sesión o proyecto | A puede continuar; B detiene nuevas acciones |
| B-12 | Dos Explorers con instrucciones diferentes | Dos lanzamientos equivalentes simultáneos | A usa concurrencia real; B reutiliza el resultado activo según deduplicación existente |
| B-13 | El aviso terminal llega al padre ocupado | El padre está inactivo | Solo un aviso y despertar según la política existente; no doble turno |
| B-14 | Falla una lectura y otra acaba correctamente | Un Worker acaba y falta revisión | Lectura independiente puede cerrar su propio Todo; Worker jamás se autoacepta |
| B-15 | Dos intentos de confirmar el mismo lote | Se reinicia después de confirmar | No hay segunda reclamación ni relanzamiento silencioso |
| B-16 | Git limpio en Worktrees hijos | SHA, rutas o archivos ajenos cambiados | Solo A se prepara; B se bloquea |
| B-17 | El modelo entrega un informe | Existe recibo auténtico de revisión | El informe no equivale a aceptación; recibos y confirmaciones siguen siendo necesarios |

## Pruebas y evidencias

- `tests/parallel-worktree-todos.test.ts`: rechazo del primer Writer, segundo independiente aprobado, intento único y no fusión; además conserva pruebas de rechazo final, SHA, cancelación y estado ambiguo.
- `tests/megatanda-b-continuation.test.ts`: rechazos de permisos de Worker, tareas no persistidas, modelos pagados, cambio de tarifa y control exacto del supervisor.
- `tests/megatanda-b-terminal-pi.test.ts`: conexión de eventos de Pi (con ejecutor simulado): primer Explorer falla, su Todo se bloquea, el segundo arranca solo si es gratuito, se registra el resultado y no hay escritor.
- `tests/megatanda-b-parallel-runtime.test.ts`: dos Explorers distintos realmente solapados en ejecución dentro del Dispatcher de ASEN, sin lanzar procesos de modelos externos.
- Pruebas existentes de `task-agent-coordinator`, `task-agent-reconciler`, `agent-notification-journal`, `parallel-parent-supervisor-claims`, `parallel-worktree-reconciliation` deben seguir pasando.

**Significado de las pruebas:** `IMPLEMENTADO` y `CABLEADO_EN_PUNTO_DE_ENTRADA` sí pueden evidenciarse en GitHub. Los dobles de ejecutor no certifican generación con un proveedor real ni equivalencia externa `AB_PARITY`. El número de Workers realmente solapados con sesiones Pi de distintos proveedores requiere observación autenticada adicional.

## Cierre y pendientes reales

1. **Cierre técnico:** typecheck, pruebas B y anteriores, arquitectura, Pi 1.2, paquetes para los sistemas admitidos, CI exacto del SHA final sin fallos.
2. **Cierre de comportamiento real:** ejecutar los 17 casos con sesiones Pi reales y configuraciones autorizadas; medir errores, continuidad, duplicados, tiempo y modelos consumidos.
3. **Costo:** cero llamadas deliberadas a modelos de pago en esta megatanda. Un precio de catálogo cero es un filtro conservador, **no una factura real de coste cero**.
4. **Seguridad:** si existe escritura dudosa, consentimiento nuevo, Git divergente o identidad cambiada, detener y conservar los datos para revisión. Nunca rebajar ese bloqueo para presumir paridad.

**Conclusión:** se corrigen dos puntos de interrupción innecesaria sin duplicar motor de agentes. La equivalencia externa y la aceptación del flujo completo siguen pendientes hasta obtener evidencias independientes.
