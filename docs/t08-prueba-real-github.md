# T08 — Prueba real y controlada en GitHub

## Objetivo

Comprobar una cadena auténtica **dos jueces Pi -> propuesta Fix genuina ->
nueva tarea ODD persistida -> autorización humana de escritura ->
Pi Writer -> prueba de comportamiento -> dos jueces Pi posteriores**.

La prueba opera exclusivamente en un **repositorio Git mínimo y temporal**, sin modificar
el árbol original de la PR, sin fusionar ramas ni usar credenciales Git de escritura.
El código generado se verifica estáticamente y, si supera el filtro, se ejecuta
en un **proceso Node con restricciones de lectura, sin red ni permiso de escritura**.
Ninguna revisión de la IA constituye por sí sola una autorización de entrega.

## Activación manual

1. Configurar en **Settings > Environments** los entornos:
   - `asen-t08-revisores`: Required reviewers, sin omitir la aprobación.
   - `asen-t08-reparacion`: Required reviewers, sin omitir la aprobación.
2. La entrada manual existente es
   [Memory OpenRouter E2E](https://github.com/asenbanskaliev/ASEN/actions/workflows/memory-openrouter-e2e.yml).
   Seleccionar la rama `feat/flujo-de-agentes-20261115`, `modo=t08`.
3. Copiar el **SHA de 40 caracteres** del último commit de esa rama en
   `candidate_sha`. No usar un SHA antiguo ni repetir un mismo intento.
4. Introducir tres modelos `nvidia/<identificador>` **distintos**:
   `t08_revisor_a`, `t08_revisor_b`, `t08_modelo_reparador`.
   Deben existir en la cuenta y permitir llamadas Pi. No se presupone
   que sean gratuitos ni que estén operativos.
   Para el próximo intento se proponen estos modelos diferentes:
   - Revisor A: `nvidia/nemotron-3.5-bolt-e4b`.
   - Revisor B: `nvidia/nemotron-3.5-super-vl-120b-a12b`.
   - Reparador: `nvidia/nemotron-3.5-lightning-30b-a3b`.
   Son rutas publicadas por NVIDIA, pero su funcionamiento con la clave y
   esta versión de Pi debe comprobarse; no se garantiza coste cero.
   **No utilizar** `nvidia/nemotron-3-ultra-550b-a55b` en T08:
   el 11/11/2026 se notificaron respuestas vacías con HTTP 200 en la API
   y en el entorno de pruebas oficial. Como prevención, la ejecución se
   bloquea **antes de pedir aprobaciones o consumir cuota**.
   Referencia: https://forums.developer.nvidia.com/t/nemotron-3-ultra-550b-a55b-corrupted-reasoning-and-empty-responses-on-nvidia-api-and-playground/388780
5. Marcar `coste_desconocido_autorizado` solamente si se acepta el posible
   coste desconocido de **hasta cinco llamadas** (dos iniciales, una escritura,
   dos finales) y las posibles operaciones del proveedor.
6. Pulsar **Run workflow**. Se comprueban dependencias, SHA exacto y pruebas
   negativas **antes de solicitar aprobación**.
7. Aprobar el primer entorno de revisores. La API de GitHub debe confirmar una
   entrada `approved` auténtica, individual y del mismo run.
8. Dos jueces diferentes inspeccionan el defecto controlado y deben fallar
   sobre el mismo archivo. ASEN crea y guarda **una propuesta no ejecutable**.
   Si faltan hallazgos coherentes, se detiene sin reparador.
9. Se solicita la **segunda aprobación**, ahora para `asen-t08-reparacion`.
   No utilizar opciones para saltarse la revisión.
10. El controlador recrea el mismo candidato, verifica propuesta y árbol,
    guarda una tarea ODD nueva con fuente Fix, vuelve a consultar las
    aprobaciones y solicita una sola escritura Pi sobre `t08-fix.mjs`.
11. Se comprueba herramienta nativa, identidad, registro de autoría,
    ámbito Git exacto, pruebas funcionales aisladas y dos dictámenes nuevos.
    Se guarda `t08-result.json` solo si todas las comprobaciones pasan.

## Protecciones y límites reales

- Solo ejecución manual desde la rama de la PR por la cuenta autorizada.
- Permisos Actions:read + contents:read. Ningún job tiene contents:write.
- Dos entornos protegidos y dos decisiones separadas. Aprobación rechazada,
  omitida, reutilizada, agrupada o de otro SHA/intento **bloquea**.
- Clave NVIDIA solo en trabajos de revisión y corrección, jamás en preparación.
- Informe inicial descargado exclusivamente del mismo workflow run; se
  revalida su identidad, propuesta, ámbito y hash de la fuente antes de usarlo.
- El reparador no dispone de la aprobación para revisar como permiso Writer.
  El ámbito de escritura es solo `t08-fix.mjs` en un repositorio Git temporal.
- El defecto se define por código fuente estático suministrado por la prueba,
  no por instrucciones propuestas por los modelos.
- Si hay error o interrupción **no hay reintento automático** ni fusión.
- La evidencia declarada por el controlador no es un recibo independiente
  del proveedor ni una revisión externa de seguridad.
- No prueba la interfaz Pi TUI, ni todo el flujo productivo de
  `/asen-review fix-plan ... save` y su despachador. El ensayo usa los
  componentes reales de Judgment Day, el diario Fix, ODD y Pi, **en un
  controlador controlado por GitHub**.
- Se declara siempre `accepted:false`, `autoRetry:false`,
  `autoMerge:false` y `globalFull:false`. No se afirma T08 FULL.

## Incidente del 16/11/2026 — respuesta vacía del proveedor

La ejecución https://github.com/asenbanskaliev/ASEN/actions/runs/43941733529
superó preparación y primera aprobación. El revisor devolvió un mensaje
Pi con **cero bloques de respuesta** y ASEN bloqueó correctamente el
proceso: sin segundo juez acreditado, tarea Fix, Writer ni segunda aprobación.

Un informe público de NVIDIA de cinco días antes reproduce el mismo
resultado para el modelo revisor A. No es lícito interpretar el mensaje
vacío como dictamen ni fabricar texto a partir del razonamiento. La medida
es **cambiar de modelo** y conservar el rechazo de dictámenes vacíos.

## Estado al publicar

**IMPLEMENTADO_PENDIENTE_CI_Y_PRUEBA_REAL_CON_APROBACIONES**.
Una prueba unitaria con un modelo falso no valida esta misión.
El cierre requiere el informe real, la revisión de resultados y una
auditoría separada de seguridad y permisos.

## Incidente adicional — 16/11/2026, ejecución 43944108837

La prueba con un modelo alternativo para el juez A,
`nvidia/nemotron-3.5-bolt-e4b`, volvió a bloquearse en el
mismo punto: `T08: dictamen Pi sin bloques (0)`. Preparación y
primera aprobación correctas, pero sin segundo juez, propuesta Fix,
segunda aprobación, escritura ni informe final.

**Consecuencia:** la anomalía no se limita al modelo Ultra. La causa
puede estar en el proveedor, el ajuste de Pi, el protocolo RPC o en una
combinación. **No hay pruebas para afirmar una causa raíz definitiva.**

Se incorporó un observador de señales ya disponibles en Pi
(`onAssistantTextDelta`) y el módulo
`src/runtime/agents/t08-pi-review-diagnostics.ts`. En un fallo solo
se informa de: número de bloques finales, señal de fin, presencia de
error, salida en tokens si Pi la facilita, número de fragmentos de texto
observados y si hubo herramientas. **No se publica contenido, texto
parcial, razonamiento, mensaje de error del proveedor ni credenciales.**
El texto parcial nunca suple un dictamen final vacío.

**Antes de consumir cuota otra vez:** comprobar CI del controlador,
revisar la configuración de Pi/NVIDIA y, si se autoriza una nueva
ejecución, interpretar los contadores del diagnóstico. Si se observan
fragmentos de texto y el final está vacío, investigar el contrato RPC y
el proveedor; si no hay fragmentos ni tokens de salida, revisar el
modelo y la respuesta de la API. Ninguno de estos indicios equivale
por sí mismo a una prueba de causa raíz.

Estado: `PENDIENTE_DIAGNOSTICO_REAL`; sin fusión, sin permiso Writer
y `globalFull:false`.

## Prueba del cierre de Pi sin NVIDIA

En los intentos reales 43941733529 y 43944108837, el juez A produjo
`message_end` con `content:[]`. **No está probado** que lo provocara el
cierre temprano de ASEN; también puede ocurrir si NVIDIA no generó texto.

Se ha demostrado un riesgo distinto mediante una prueba de Pi simulado:

1. Un primer intento emite respuesta vacía y `agent_end(willRetry:true)`.
2. Pi inicia automáticamente un segundo intento y sí produce texto.
3. Solo `agent_settled` certifica el final de toda la ejecución.

El controlador T08 espera ahora `agent_settled`. Si el segundo intento
produce texto, ASEN conserva el resultado final comprobado; si Pi no recupera
el texto o no emite el cierre definitivo, **la revisión sigue bloqueada**.
No se reconstruyen dictámenes con textos parciales, ni se deshabilitan
herramientas prohibidas, controles de coste o aprobaciones.

`tests/t08-pi-settlement.test.ts` reproduce el caso sin ninguna API real,
y prueba también cierres incompletos y falsos finales. El resto de usos
de Pi conserva su contrato anterior. El paso siguiente es una revisión
independiente y, solo con autorización expresa de la prueba de modelos,
una comprobación real y pequeña, inspeccionando los contadores seguros.

Referencia del protocolo: https://docs.pi.dev/latest/rpc
