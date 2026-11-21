# T06 — Dos agentes Pi programadores reales desde GitHub

Estado del 18/11/2026: **variante T06 de escritura y comprobación estática preparada, pendiente de aprobación humana y ensayo NVIDIA real sobre el SHA nuevo**. La ejecución histórica [43915611666](https://github.com/asenbanskaliev/ASEN/actions/runs/43915611666) no valida esta variante.

**Importante:** el nuevo modo T06 permite que dos Pi Writer creen archivos con su herramienta nativa, dentro de worktrees Git independientes y bajo dos autorizaciones humanas individuales. El controlador solo inspecciona sintaxis, herramientas, modelos, ámbito y autoría: **NO ejecuta el JavaScript generado ni acredita que funcione**. No precisa Docker. La modalidad anterior de prueba completa de comportamiento sigue bloqueada hasta disponer de garantías suficientes. El resultado favorable será `PASS_TWO_WRITERS_STATIC_ONLY_BEHAVIOR_NOT_TESTED`, que **no es T06 FULL ni aceptación T10**.

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
- Solapamiento real de los procesos, sintaxis y ausencia de archivos fuera de ámbito. **No se ejecuta el código generado ni sus pruebas de comportamiento.**
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


## 6. Comprobación de comportamiento aislada sin NVIDIA

- En un **nuevo ensayo manual T06 aprobado** (dos revisiones humanas, SHA actualizado y aceptación expresa del posible coste), el primer trabajo ejecuta dos Pi Writer reales y guarda sus fuentes SOLO si comprueba una escritura auténtica, el único archivo autorizado, su huella, el mismo commit y la sintaxis.
- El siguiente trabajo, `comprobar-comportamiento-aislado`, recupera el archivo **de ese mismo número de ejecución**. Comprueba de nuevo ambas huellas y realiza **17 pruebas de comportamiento** dentro de contenedores Docker Linux **sin red, con solo lectura, sin privilegios y sin claves de NVIDIA**. Cada caso tiene respuesta esperada definida por el controlador y finalización observada.
- Docker solo se utiliza en ese trabajo especial de GitHub. **La ejecución normal de ASEN/Pi en el ordenador no necesita Docker**. El paso no efectúa nuevas llamadas a modelos.
- Los dos archivos y un manifiesto se conservan como evidencias junto al informe, con acceso según permisos del repositorio. Se genera por separado `t06-veredicto-aislado.json`. Una vez iniciado el verificador, un error de huella, un archivo cambiado o un fallo de prueba producen `blocked`. Si falla antes un paso como `docker pull` o `docker image inspect`, el trabajo falla sin generar ese informe. Ninguno de los dos casos concede aprobación.
- **No es posible aplicar retroactivamente esta fase a la ejecución [44373591222](https://github.com/asenbanskaliev/ASEN/actions/runs/44373591222)**: allí se subieron los recibos, pero no las fuentes creadas por Pi, y la máquina temporal ya finalizó. No se vuelve a llamar a NVIDIA ni a pedir aprobaciones por esta modificación.
- Incluso con `candidate-behavior-passed`, siguen pendientes las pruebas de integración, T07/T08/T09/T10, revisión independiente y equivalencia general. El resultado conserva `accepted:false` y `globalFull:false`.


## 7. T06 completo en una sola ejecución manual: Writers → pruebas → revisores

La opción **`modo=t06`** encadena ahora tres fases en **el mismo número de ejecución**:

1. **Generación NVIDIA:** dos Pi 1.2 nativos generan dos archivos diferentes, con carpetas Git separadas. Se necesitan las dos aprobaciones históricas ya existentes: `asen-t06-writer-a` y `asen-t06-writer-b`.
2. **Comprobación sin modelos:** un trabajo GitHub distinto recupera **los archivos del mismo run**, comprueba sus huellas y ejecuta **17 casos** en contenedores Linux sin red y sin claves del proveedor. Un fallo detiene el proceso antes de consultar a los revisores.
3. **Revisión independiente NVIDIA:** únicamente cuando las 17 pruebas pasan, GitHub solicita **otras dos aprobaciones separadas** para los entornos nuevos `asen-t06-reviewer-a` y `asen-t06-reviewer-b`. Dos modelos distintos del Writer y entre sí revisan ambos archivos sin herramientas ni permisos de escritura.

**Preparación obligatoria antes de ejecutar:**

- En **Settings → Environments**, crear y proteger los cuatro entornos con **Required reviewers**, en particular los nuevos `asen-t06-reviewer-a` y `asen-t06-reviewer-b`. Si no están protegidos, el verificador de GitHub rechazará los consentimientos y no enviará solicitudes a los revisores. No desactivar estos controles.
- En **Actions → Memory OpenRouter E2E → Run workflow**, elegir la rama `feat/flujo-de-agentes-20261115`, `modo=t06`, el **SHA actual de 40 caracteres**, y los dos identificadores reales `t06_revisor_a` y `t06_revisor_b` con forma `nvidia/... ` (sin el espacio final). El autor utiliza `nvidia/nemotron-3.5-lightning-30b-a3b`; ningún revisor puede utilizar ese mismo modelo ni repetirse entre ellos. Verificar que los modelos existen y se encuentran accesibles antes de autorizar consumo.
- Marcar `coste_desconocido_autorizado` **solo si el operador acepta el posible gasto desconocido del proveedor**. No se activa por cambios, PR ni CI. Solo se permite el primer intento; no se ejecutan reintentos parciales que consuman NVIDIA.
- Aprobar **uno a uno** los entornos Writer A y Writer B. Tras superar el aislamiento, aprobar **uno a uno** Revisor A y Revisor B. Son **cuatro consentimientos humanos distintos** en una sola ejecución, no cuatro ejecuciones.

**Evidencias:** se guardan fuentes y huellas, `t06-veredicto-aislado.json` y `t06-revisiones.json`, siempre con `accepted:false` y `globalFull:false`. Una revisión `candidate-reviewed-by-two-models` representa dos opiniones verificadas, **no** aceptación de producción, gastos verificados, pruebas del ciclo completo ODD o equivalencia con la referencia de paridad.

**Estado de implantación:** código y pruebas de autorización conectados; **no se ha ejecutado todavía un T06 real de las tres fases bajo el SHA nuevo**. La ejecución histórica `44373591222` valida únicamente escritura estática y no permite recuperar retroactivamente las fuentes. Esta incorporación no llama por sí sola a NVIDIA.


## 8. Reutilizar el ensayo 44389671458 sin pagar otra vez por los Writers

La ejecución [44389671458](https://github.com/asenbanskaliev/ASEN/actions/runs/44389671458)
**generó dos archivos Pi auténticos y superó las 17 pruebas aisladas**. El último trabajo
no llegó a ejecutar revisores: los entornos de revisión habían terminado
sin dejar las dos aprobaciones humanas en la API de GitHub. Las fuentes
y los informes originales permanecen como dos artefactos de esa ejecución.

La nueva opción `modo=t06_revision` del flujo manual
`Memory OpenRouter E2E` **no vuelve a ejecutar escritores**, ni repite Docker
ni consume cuota de generación. Recupera directamente los **dos artefactos
del run 44389671458** con su SHA original
`a33da9eebb92ac3131c958b14846945c31cd24a7`.

Pasos:

1. En Actions → **Memory OpenRouter E2E → Run workflow**, seleccionar la rama
   `feat/flujo-de-agentes-20261115`, `modo=t06_revision` y el **último SHA de
   la rama** en `candidate_sha` (es distinto del SHA de los archivos históricos).
2. Elegir `t06_revisor_a` y `t06_revisor_b`: dos identificadores NVIDIA reales,
   distintos entre sí y del escritor
   `nvidia/nemotron-3.5-lightning-30b-a3b`.
3. Marcar `coste_desconocido_autorizado` solo si se acepta explícitamente el
   posible coste de **dos revisiones nuevas**. No existe consentimiento implícito
   por el ensayo previo.
4. Una vez que la preparación sin modelos compruebe las evidencias originales,
   GitHub solicitará aprobación humana individual de
   `asen-t06-reviewer-a` y, después, `asen-t06-reviewer-b`.
   Deben estar protegidos con **Required reviewers**.
5. Antes de llamar a NVIDIA se validan por API las dos aprobaciones Writer del
   **run anterior** y las dos aprobaciones de revisores del **run nuevo**.
   Cualquier falta de evidencia o rechazo bloquea la revisión.

**Conserva los controles:** primer intento, cuenta propietaria, rama y SHA
exactos, dos revisores Pi sin herramientas ni permiso de escritura,
artefactos ligados al número de ejecución, sin fusión automática y
`accepted:false`/`globalFull:false`.

**No usar «Re-run failed jobs» del ensayo 44389671458**: la repetición tiene
otro número de intento y debe ser bloqueada por seguridad. El nuevo modo
manual es la vía prevista para aprovechar sus evidencias sin repetir los
escritores.
