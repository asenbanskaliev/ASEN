# T06 — Dos agentes Pi programadores reales desde GitHub

Estado: **ensayo histórico realizado**, sin aceptación automática; `globalFull:false`. La [ejecución 43915611666](https://github.com/asenbanskaliev/ASEN/actions/runs/43915611666) registró dos Writers en el SHA `4ec48beec8a191cc276c7532fd579eeeb2004f10`. **No valida el SHA actual**. Nuevos ensayos quedan BLOQUEADOS hasta verificar aislamiento seguro y consentimiento/presupuesto nuevo.

## 1. Crear dos entornos protegidos

En el repositorio ASEN, abrir **Settings → Environments** y configurar por separado:

- **asen-t06-writer-a**
- **asen-t06-writer-b**

Activar **Required reviewers** y escoger revisores autorizados en **cada** entorno. Es recomendable impedir que el administrador salte la protección. Si se activa Prevent self-review, el usuario que inicia la ejecución no podrá aprobarla personalmente.

GitHub puede crear automáticamente un entorno SIN reglas si no existe. **No basta con declarar los entornos en el archivo.** El programa de ASEN consulta el historial real de revisiones en la API de GitHub, en este mismo número de ejecución, y bloquea cualquier escritura sin dos aprobaciones humanas independientes. Aprobar ambos entornos en un único clic no sirve.

## 2. Iniciar la prueba manual desde GitHub

El modo T06 está incluido en el flujo **Memory OpenRouter E2E**, que ya existe en main y tiene botón de ejecución manual. Su modo memoria anterior sigue disponible.

1. Ir a **Actions → Memory OpenRouter E2E → Run workflow**.
2. Elegir la rama **feat/flujo-de-agentes-20261115**.
3. Seleccionar el **modo t06**. Si no aparecen estos campos en la interfaz, no ejecutar: hay que habilitar esa vía previamente sin tocar main sin autorización.
4. Introducir en **candidate_sha** los 40 caracteres del último commit de esa rama.
5. Activar **coste_desconocido_autorizado** solo si se acepta conscientemente el posible coste. No está demostrado que el modelo de NVIDIA sea gratuito.
6. Iniciar la ejecución. GitHub solicitará autorización para cada entorno.
7. En **Review deployments**, aprobar **una solicitud cada vez**: primero un entorno y después el otro, con dos acciones separadas.
8. ASEN vuelve a contrastar esos eventos con GitHub **justo antes de empezar a escribir**.

## 3. Qué comprueba y qué no

- Dos Pi 1.2.0 genuinos trabajando sobre dos carpetas Git separadas con el mismo commit.
- Dos sesiones distintas, herramientas de escritura nativas observadas y ámbitos de archivo diferentes.
- Solapamiento real de los procesos, sintaxis, pruebas de comportamiento y ausencia de archivos fuera de ámbito.
- Informe de resultados con huellas y estados, sin contraseñas, códigos producidos ni respuestas completas.
- Sin commits, fusión, reintentos automáticos ni aprobación final del trabajo.

La comprobación solo acredita el escenario T06 cuando todos sus controles pasan. No demuestra la ejecución completa del supervisor ODD/Todo, aceptación T10, gastos reales ni equivalencia FULL.

## 4. Bloqueos seguros

Se rechaza cualquier prueba con SHA equivocado, rama distinta, coste sin confirmar, aprobaciones faltantes o agrupadas, cuenta robot, rechazo, historial inaccesible, segunda ejecución del mismo trabajo, modelo o Pi no disponible y archivos fuera del ámbito autorizado.

**CI normal, PR y push nunca lanzan estos dos Writers.** La ejecución requiere solicitud manual y las dos aprobaciones verificables. La clave NVIDIA solo se entrega al paso final que ejecuta los Writers.

## 5. Diagnóstico de la ejecución real 43904432551 y corrección

En GitHub Actions, la prueba con SHA `ad770bb171c527936c62e53badd4263a12f959d5`
registró dos aprobaciones reales, dos procesos Pi con el modelo NVIDIA pedido y
ejecuciones temporales solapadas. Sin embargo, **ninguno produjo un archivo válido**.
El agente A devolvió una ejecución Pi correcta sin una escritura observada; B
devolvió una ejecución Pi fallida. El resultado fue
`BLOCKED_OR_PARTIAL_NEEDS_REVIEW`, sin revisión independiente ni FULL.

La auditoría encontró un problema verificable del controlador T06: la instancia
`PiProcessRunner` se creaba **sin `attributionFile`**. La extensión
`extensions/authority.ts` deniega por diseño las llamadas nativas `write` y
`edit` si no existe un registro de atribución configurado. Esta ausencia
bloqueaba cualquier intento de escritura, pero por sí sola no demuestra por
qué A no llegó a emitir una llamada nativa. No se desactiva la protección.

**Corrección:** cada Pi Writer dispone ahora de un fichero de atribución
privado y separado, ubicado fuera de su worktree. Para considerar la escritura
válida, la prueba exige el evento nativo de `write`, la anotación persistida
con agente, sesión, worktree y ruta exactos, el único archivo autorizado y
las comprobaciones de sintaxis y comportamiento. El mensaje al modelo enfatiza
la llamada a `write`, pero una respuesta en texto **nunca** cuenta como escritura.
El informe registra códigos de bloqueo (sin secretos ni contenido del modelo).

Las pruebas nuevas comprueban los casos negativos de ausencia de herramientas,
rechazo, eventos cruzados, sesiones y actores falsos, duplicados y directorios
fuera del ámbito. La reparación **aún necesita repetir la prueba real** en un
nuevo SHA y con dos aprobaciones humanas nuevas; no se relanza sola ni usa
aprobaciones anteriores. Si no hay una llamada `write`, habrá que investigar
la compatibilidad del modelo NVIDIA con herramientas nativas Pi antes de
cambiar los perfiles o el modelo.

Estado: **reparación de código, pendiente de aceptación real**.
