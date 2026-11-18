# ASEN — Comprobar NVIDIA desde GitHub

## Objetivo
La tarea manual **Comprobar NVIDIA** ayuda a distinguir un modelo que no aparece en el catálogo de uno que no responde a una solicitud real. Esta comprobación **no** ejecuta Pi, T06 ni escritores.

## Ejecución
1. Abrir **Actions → Memory OpenRouter E2E → Run workflow** en la rama `feat/flujo-de-agentes-20261115`.
2. Elegir `modo=nvidia_diagnostico` e introducir el **SHA actual exacto** de esa rama en `candidate_sha`.
3. Revisar si se desea aceptar un posible consumo: solo al marcar `coste_desconocido_autorizado=true` comienza la tarea. Si no se marca, el trabajo queda omitido.
4. También puede abrirse el flujo manual independiente **Comprobar NVIDIA**, con los mismos controles. No se ejecuta por PR, cambios, horarios ni repeticiones del mismo run.

## Alcance fijo y límites
Se consulta `GET https://integrate.api.nvidia.com/v1/models`. Si la respuesta es válida, se buscan **solo** los modelos:
- `nvidia/nemotron-3-nano-30b-a3b`
- `nvidia/nemotron-3-super-120b-a12b`

Cada modelo **presente** recibe como máximo **una solicitud** `POST /v1/chat/completions`, con una instrucción de dos palabras, `stream:false` y `max_tokens:32`. No se hacen llamadas a los modelos ausentes. No existe repetición automática, ni aun por `429`, `503` o agotamiento de tiempo.

**Límites:** 20 segundos para el catálogo y 45 segundos por petición. Las respuestas están acotadas a 3 MB. **Aunque el contenido máximo sea pequeño, el coste exacto no está garantizado**. La cuota y la facturación dependen de NVIDIA. Solo el operador puede dar consentimiento explícito en cada run.

## Seguridad y resultados
- Requiere cuenta que inicia la operación, repositorio, rama, SHA y **primer intento** exactos. No admite volver a ejecutar un trabajo fallido del mismo run para gastar cuota.
- La clave **NVIDIA_API_KEY** se lee desde Secrets de GitHub, exclusivamente en el paso de consulta. No se añade a la URL ni se muestra en los informes.
- Se rechazan redirecciones. No hay herramientas de edición, credenciales Git persistentes, permisos de escritura, reintentos ni ejecución de código generado.
- El informe `resultado-nvidia.json` guarda **solo** aparición en catálogo, códigos HTTP, categorías de fallo y éxito de comunicación. Jamás respuestas, contenido de mensajes, clave, cabeceras de autorización ni instrucciones enviadas.
- `200`: petición aceptada y respuesta JSON con elección de asistente. `401/403`: autorización; `404`: modelo/ruta; `429`: límite de peticiones; `503`: saturación; agotamiento: sin respuesta en tiempo. Esto **no** demuestra que Pi pueda usar el modelo ni valida T06 como completo.

El artefacto se publica únicamente al finalizar el trabajo; una petición fallida deja un informe y hace fallar el trabajo. Si falta la clave, el coste, el SHA o permisos adecuados, se bloquea **sin solicitudes**.
