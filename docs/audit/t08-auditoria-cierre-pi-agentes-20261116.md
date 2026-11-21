# Auditoría de cierre Pi y ciclo de vida de agentes — T08

Fecha: 16/11/2026. PR #61, rama `feat/flujo-de-agentes-20261115`.

## Alcance y hechos verificados

La auditoría recorre las rutas productivas de `AgentRuntime` a `Dispatcher`,
`PiProcessRunner`, el adaptador `PiArtifactRunner`, el registro de jueces
T08 y la adaptación de recuperación del agente principal
(`parent-model-fallback.ts`). El código de los ensayos T06 usa directamente
`PiProcessRunner`. No se consideran equivalentes la prueba simulada y una
prueba de extremo a extremo con NVIDIA.

| Ruta | Inicio y finalización | Cancelación y autoridad | Resultado de la auditoría |
| --- | --- | --- | --- |
| Aclarador | `AgentRuntime.startReadOnly` → `Dispatcher` → `AgentRunner` | Sin escritura | Ruta común, susceptible a cierre temprano si se usa Pi sin modalidad estricta |
| Explorador | Misma ruta con fase de exploración | Solo lectura, control de presupuesto | Cierre estricto probado en simulación; no activado globalmente |
| Revisor | Misma ruta y adaptador de revisiones | Solo lectura; `noTools:true` en ensayo T08 | T08 exige `agent_settled`, conserva el último dictamen acreditado |
| Verificador | `startReadOnly` / `Dispatcher` | Solo lectura | Cierre estricto probado en simulación; no activado globalmente |
| Worker | `startControlledWorker` / `Dispatcher` | Requiere permiso, alcance exacto y evidencia de escritura | Sin cambio global de cierre: esperar puede repetir efectos si no se revisa la autoridad de recuperación |
| Artefactos de ciclo de vida | `PiArtifactRunner` → `PiProcessRunner` | Permiso heredado del Dispatcher | **Corregido:** propagación de `AbortSignal` y bloqueo de resultados posteriores a cancelación |
| Agente principal | `createParentModelFallback` | Identidad de sesión, intento y perfil | Ya diferencia `onAgentEnd` de `onAgentSettled`; no modificado |
| Jueces T08 | `scripts/t08-github-real-fix.ts` | Dos aprobaciones separadas; sin herramientas | Ya exige `requireFinalSettlement:true`, cierre no abortado y dictamen final no vacío |
| Ensayos T06 | Scripts con Pi directo | Autoridad individual, aprobación humana | No se activa automáticamente el cierre estricto; se mantiene la compatibilidad existente |

## Hallazgos (riesgo, legibilidad, fiabilidad y recuperación)

### H1 — Alto: cancelación perdida en artefactos (corregido)

`PiArtifactRunner.run` ignoraba la señal de cancelación del Dispatcher
al llamar `PiProcessRunner.run`. Una operación podía seguir consumiendo
tiempo de proceso, aunque la tarea superior ya hubiera sido cancelada.

Se pasa ahora la señal al proceso Pi y se rechaza cualquier artefacto
recibido después de la cancelación. No se emiten recibos de autoría
ni estados de éxito al recibir un resultado tardío.

Prueba: `tests/pi-artifact-runner-cancellation.test.ts`; casos
de proceso Pi local cancelado, sesiones paralelas independientes y
resultado tardío sin autoridad. No requieren credenciales.

### H2 — Medio: pérdida de confidencialidad entre intentos (corregido para T08)

El colector de mensajes del proceso mantenía eventos recibidos tras
`agent_end`. En cierre estricto, eso podía conservar un fragmento de
texto fuera de intento, aunque dicho fragmento no constituya un
dictamen ni un evento válido.

Ahora el cierre estricto de T08 únicamente conserva eventos finales,
recibos correlacionados y señales de herramientas. No guarda
`message_update` fuera de un intento activo. La prueba incluye una
cadena privada de ejemplo y comprueba que no aparece en los resultados
retenidos.

### H3 — Medio: combinación ambigua de cierre estricto y fallback (corregido)

Si se pedía `requireFinalSettlement:true` y también una cadena de
modelos alternativos, el motor aplicaba silenciosamente el comportamiento
antiguo de fallback, sin la garantía estricta solicitada.

Ahora se **bloquea antes de crear Pi**. No hay cambio automático
de modelo ni llamada al proveedor al detectar esta configuración.
La recuperación con modelos alternativos necesita un contrato conjunto
diseñado y probado expresamente.

### H4 — Pendiente: recuperación de artefactos de ciclo de vida

`extractPiArtifact` exige un solo `agent_end` y rechaza cualquier
actividad posterior no autorizada. Esta restricción es segura
ante duplicaciones y escritura involuntaria, pero impide admitir
una recuperación legítima con varios intentos. Sigue **cerrada por
defecto**: no convertir múltiples mensajes en un artefacto
válido hasta verificar la correlación, el cierre definitivo
y los permisos de cada fase. No se ha desactivado esta protección.

### H5 — Pendiente: adopción global del cierre estricto

La ruta sin fallback todavía acepta el contrato anterior:
respuesta correlacionada, `agent_end` y salida normal.
No se modifica de forma indiscriminada porque algunos flujos
y fixtures antiguos dependen de él. Especialmente los Workers
necesitan garantías de que una recuperación no repita una escritura.

La modalidad estricta se ha probado sin modelos reales para los
cuatro roles de solo lectura, pero únicamente la utiliza
actualmente el ensayo T08. Su extensión global exige pruebas
de compatibilidad con Pi auténtico y evaluación de permisos,
sin suponer equivalencia completa.

## Pruebas añadidas o ampliadas

- `tests/pi-artifact-runner-cancellation.test.ts`: finalización de hijo,
  cancelación, múltiples procesos y rechazo de una respuesta tardía.
- `tests/t08-pi-settlement.test.ts`: recuperación simulada, cierre
  prematuro, ausente o abortado; cuatro roles de lectura en paralelo;
  contenido privado fuera de turno; configuración incompatible.
- Las pruebas están vinculadas al chequeo T08 previo a aprobaciones
  y a `CI`, con compilación de TypeScript específica.

## Restricciones preservadas

- Sin llamadas a NVIDIA ni proveedores de pago para esta auditoría.
- Sin nuevas herramientas para los revisores, sin aumento de privilegios.
- Sin reintentos de escritura ni fusión automática.
- Sin inventar dictámenes ni tratar un mensaje final vacío como válido.
- Sin marcar T08 como FULL ni `globalFull:true`.

## Cierre

La cancelación del adaptador de artefactos es un defecto concreto reparado.
Los otros cambios endurecen el modo estricto de T08 y mejoran su comprobación
sin ampliar su ámbito. Las causas exactas de las respuestas vacías observadas
en NVIDIA siguen **sin demostrarse**.

**Estado:** implementación local en PR #61; confirmar CI del SHA final,
solicitar revisión independiente y solo entonces valorar un ensayo
mínimo de Pi con consentimiento de coste.
