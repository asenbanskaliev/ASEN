# T11 — Plan auditado de clientes adicionales y adaptadores

Estado: `PARTIAL_BY_ACCEPTED_SCOPE`
Alcance adoptado: integración Pi 1.2 únicamente; runtimes externos quedan diferidos.
Orden: después de T10 y antes de T04/T07 pendientes y T12.

## Decisión de alcance adoptada — 2026-10-27

Por instrucción del usuario y siguiendo la arquitectura observada de Gentle Shell, T11 queda limitado a la integración Pi 1.2 de ASEN. Los runtimes externos del ecosistema Gentle-AI no forman parte de este cierre y se difieren como futuros adaptadores independientes. Esta decisión queda registrada en S11/L480 del ODD. No implica `FULL`: la admisión todavía requiere evidencia del comportamiento real del host por modo/plataforma, revisión R4 y candidato exacto. Las secciones históricas de este documento que condicionan el alcance Pi-only a una decisión futura quedan supersedidas por esta decisión.

## 1. Resultado de la auditoría

La documentación ODD y el código actual muestran una integración Pi nativa, pero no una capa de adaptadores para clientes externos. `extensions/asen.ts` y los módulos de runtime Pi son el punto de composición real. No se ha encontrado un adaptador implementado y ejercitado para Claude Code, Codex, OpenCode, Cursor, Gemini CLI u otro runtime externo.

La comparación con Gentle Shell corrige una ambigüedad importante:

- Gentle Shell es principalmente una extensión Pi-native: sesión, comandos, herramientas, agentes, trabajos en segundo plano, cambios de workspace, perfiles y notificaciones.
- La lista multi-runtime pertenece al ecosistema Gentle-AI y no demuestra que Gentle Shell implemente todos esos clientes.
- MCP es un transporte o puente opcional; no debe convertirse en una nueva autoridad ni confundirse con un cliente.

Por tanto, T11 valida el contrato de integración Pi de ASEN. Los clientes externos quedan fuera de este alcance y requerirán tareas y evidencias propias si se abordan más adelante.

## 2. Alcance adoptado

### Incluido

1. Reutilizar la frontera existente `src/runtime/pi-host.ts` para Pi 1.2.
2. Declarar solo los modos y capacidades demostrados por el SDK y pruebas.
3. Probar registro, aislamiento, permisos, errores, cancelación y cierre.
4. Obtener evidencia reproducible por modo, plataforma y candidato.

### No incluido por defecto

- Implementar adaptadores para todos los runtimes mencionados por Gentle-AI.
- Inferir soporte porque exista un binario instalado.
- Convertir MCP en un segundo sistema de permisos.
- Prometer idénticas herramientas, delegación o permisos a todos los clientes.
- Marcar como `not applicable` una capacidad que todavía no se ha investigado.

Los clientes externos permanecerán `unsupported`, `unavailable` o `blocked` hasta disponer de runtime, interfaz y evidencia propios.

## 3. Contrato Pi existente

No se crea una interfaz genérica adicional. `src/runtime/pi-host.ts` valida Pi 1.2, métodos públicos, modos admitidos, inventarios y colisiones; `extensions/asen.ts` compone los handlers y políticas existentes. Las pruebas deben verificar esa frontera sin duplicar sesión, permisos, procesos o stores.

## 4. Fases de implementación

### T11-A — Inventario y matriz

- Fijar versión y revisión de cada referencia consultada.
- Enumerar clientes realmente soportados por ASEN, no por inferencia externa.
- Para cada cliente registrar runtime, transporte, sesión, comandos, herramientas, permisos, delegación, memoria, workspace, notificaciones y apagado.
- Clasificar cada celda como `implemented`, `unsupported`, `unavailable`, `blocked` o `not-applicable`, con razón y evidencia.

### T11-B — Contrato Pi

- Mantener la composición existente de `extensions/asen.ts` y `src/runtime/pi-host.ts`.
- Mantener un único registro de comandos y herramientas.
- Mantener stores, controladores, grants y políticas existentes.
- Probar solo modos admitidos por Pi 1.2 con ejecución real o evidencia SDK.
- Rechazar operaciones que requieran una sesión padre cuando se ejecuten en modo no interactivo.

### T11-C — Pruebas de comportamiento

Añadir pruebas para:

1. aislamiento por proyecto y sesión;
2. registro único de comandos y herramientas;
3. correlación y rechazo de respuestas RPC incorrectas;
4. proveedor ausente o no disponible;
5. salida observada sin inferir éxito;
6. cancelación y cierre de procesos descendientes;
7. reinicio y recuperación sin reejecución automática;
8. cierre idempotente;
9. rechazo de autoridad aportada por el llamador;
10. notificaciones y errores sin filtrar secretos;
11. límites de logs y salida;
12. rutas y workspace correctos en Windows, Linux y macOS cuando Pi esté disponible.

### T11-D — Clientes externos, solo con evidencia

El primer adaptador externo podrá ser OpenCode, Codex o Claude Code, pero la elección debe salir de una correspondencia concreta de API y de un runtime disponible. Cada adaptador debe incluir:

- prueba positiva;
- rechazo de permisos insuficientes;
- error de transporte o runtime ausente;
- cancelación;
- recuperación/reinicio;
- aislamiento de proyecto;
- evidencia independiente de Pi.

Si el runtime no existe en el entorno de prueba, el resultado será `unavailable`; no se instalará ni se invocará un proveedor únicamente para fabricar un verde.

### T11-E — Auditoría R4

Verificar específicamente:

- no bypass de grants, revisión ni autenticidad;
- no sustitución de sesión o proyecto;
- no elevación de permisos;
- no fuga de rutas, credenciales o logs;
- no acceso cruzado entre sesiones;
- no procesos huérfanos;
- no falsa equivalencia entre clientes;
- no duplicación de stores, políticas o autoridad.

La revisión debe ser independiente del autor del adaptador y estar ligada a la misma revisión de código y a los mismos recibos.

### T11-F — Evidencia y cierre

Cada ejecución debe conservar:

- SHA del candidato;
- cliente y versión;
- adaptador y versión;
- plataforma;
- escenarios ejecutados;
- resultado y error;
- hash de salida y logs;
- limitaciones y dependencias ausentes.

No se reutilizarán recibos Pi para declarar soporte de otro cliente.

## 5. Criterio de FULL

### FULL de alcance Pi-only

El alcance Pi-only ya está adoptado en S11/L480 del ODD. Para FULL falta que la evidencia cubra Pi 1.2, sus modos realmente soportados, aislamiento, permisos, procesos, cancelación, recuperación, cierre y plataformas aplicables. La implementación actual ya cuenta con una frontera de host en `src/runtime/pi-host.ts`; no se debe crear un `PiClientAdapter` duplicado.

### FULL multi-cliente

Requiere además un adaptador probado para cada cliente incluido en el inventario adoptado, con capacidades diferenciadas, pruebas positivas y negativas, recuperación, permisos y evidencia por plataforma.

El alcance Pi-only ya está adoptado. T11 permanece `PARTIAL_BY_ACCEPTED_SCOPE` hasta cerrar las pruebas y revisión exigidas para Pi.

## 6. Dependencias y orden de ejecución

1. Confirmar HEAD y estado del PR.
2. Completar T10 y conservar su evidencia.
3. Reconciliar la matriz de capacidades con la API pública Pi existente.
4. Añadir solo pruebas para brechas demostradas y completar revisión R4.
5. Solo entonces evaluar un cliente externo.
6. Generar recibos y actualizar el Log ODD.
7. Ejecutar una única ronda final de CI sobre el SHA integrado.
8. Actualizar T11 únicamente con resultados reproducibles.

No se debe marcar T11 como FULL mientras la integración siga siendo solo Pi sin contrato y evidencia formal.

## 7. Decisión auditada

La ruta es cerrar la evidencia del host Pi conforme al alcance adoptado en S11/L480 del ODD. Esto coincide con el alcance v1 de ASEN y con la arquitectura Pi-native de Gentle Shell.

## 8. Especificación quirúrgica de implementación

Esta sección elimina decisiones abiertas durante la ejecución. La tanda debe ser pequeña, reversible y limitada a la frontera de cliente; no se debe reescribir el núcleo de autoridad.

### 8.1 Archivos y responsabilidades

Crear únicamente estas superficies nuevas, salvo que el código existente obligue a adaptar nombres:

Usar `src/runtime/pi-host.ts` y `tests/pi-host-compatibility-matrix.test.ts` como superficies existentes. No crear una jerarquía nueva de clientes, un segundo store de sesión, un segundo sistema de grants, otro dispatcher, otro registro de herramientas ni un nuevo gestor de procesos. Añadir un módulo o una prueba nuevos solo si la auditoría encuentra una brecha conductual concreta y el cambio no duplica las garantías existentes.

### 8.2 Contrato existente y requisitos

`src/runtime/pi-host.ts` ya verifica la versión mínima `1.2.0`, modos admitidos, métodos públicos del host, inventarios completos y ausencia de colisiones antes de mutar el host. La extensión ya impide activación duplicada. Por tanto, el trabajo debe probar y documentar ese contrato antes de ampliarlo.

```ts
type ClientOutcome =
  | "completed"
  | "blocked"
  | "failed"
  | "unsupported"
  | "unavailable";

type ClientAvailability = Readonly<{
  clientId: string;
  version: string;
  available: boolean;
  reason?: string;
}>;

// No introducir otra interfaz genérica de cliente para la integración Pi.
```

Reglas del contrato:

- La admisión Pi no ejecuta modelos ni modifica configuración/workspace.
- El contexto Pi debe validarse antes de los callbacks que lo necesiten.
- El registro de comandos/tools debe ocurrir una vez y después del preflight de colisiones.
- Toda operación de escritura pasa por las políticas/grants existentes.
- La ausencia del proveedor no se convierte en éxito simulado.
- Un cliente no soportado produce `unsupported`; un binario ausente produce `unavailable`.
- El cierre libera listeners, procesos, temporizadores y archivos temporales.

### 8.3 Integración con la extensión Pi

La adaptación debe seguir esta secuencia:

1. `extensions/asen.ts` conserva su composición actual con preflight antes del registro.
2. Las dependencias siguen inyectadas; no introducir globales mutables.
3. Los handlers delegan en los controladores existentes.
4. Los resultados preservan errores y estados propios.
5. El shutdown conserva el orden de cancelación/cierre ya implementado.

No se debe mover lógica de autorización a `PiClientAdapter`; solo debe traducir ciclo de vida y eventos del host.

### 8.4 Secuencia TDD de la tanda

#### RED

Ejecutar primero los casos existentes de `pi-host-preflight.test.ts` y `pi-host-compatibility-matrix.test.ts`. Solo añadir RED para una brecha demostrada por el contrato público fijado. No duplicar casos ya cubiertos. Los casos actualmente cubiertos incluyen:

- identidad `pi-1.2` y versión declarada;
- registro duplicado de comandos/herramientas;
- proyecto no canónico;
- sesión cruzada;
- proveedor ausente;
- respuesta RPC con identificador incorrecto;
- cierre repetido;
- proceso o listener pendiente tras cierre;
- intento de autoridad aportada por el llamador;
- recibo que contenga secretos o rutas absolutas no permitidas.

Capturar los identificadores exactos de los casos RED y la huella del comando de prueba.

#### GREEN

Implementar el mínimo código necesario para que pase la brecha. Comandos enfocados:

```text
npm run typecheck
npm test -- tests/pi-host-preflight.test.ts tests/pi-host-compatibility-matrix.test.ts
```

#### REGRESIÓN

Ejecutar la suite existente de la extensión y los tests de autoridad, RPC, procesos, memoria, revisión y workspace. Un fallo preexistente debe aislarse con evidencia; no se debe relajar ninguna aserción.

### 8.5 Matriz de pruebas Pi

| Área | Caso positivo | Caso negativo | Recuperación |
|---|---|---|---|
| Sesión | abre proyecto correcto | proyecto/ruta incorrectos | cierre y reapertura sin contaminación |
| Registro | comandos y herramientas visibles | doble registro/reemplazo | reinicio conserva una sola instancia |
| RPC | respuesta correlacionada | `requestId` incorrecto/malformado | timeout y cierre limpios |
| Permisos | operación con grant válido | autoridad del llamador | requiere nueva autorización |
| Procesos | trabajo termina observado | hijo huérfano/cancelación | grupo de procesos cerrado |
| Workspace | cambios del proyecto activo | ruta externa o symlink | sesión permanece aislada |
| Proveedor | proveedor disponible | ausente/no disponible | estado explícito sin falso éxito |
| Cierre | shutdown normal | shutdown repetido | listeners, timers y temp eliminados |

### 8.6 Evidencia obligatoria

El recibo T11 debe incluir solamente datos no sensibles:

```json
{
  "schemaVersion": 1,
  "clientId": "pi",
  "clientVersion": "1.2",
  "adapterId": "pi-client-adapter",
  "candidateRevision": "<sha>",
  "platform": "<platform>",
  "scenarios": ["session-isolation", "rpc-correlation", "shutdown"],
  "outcomes": ["completed", "blocked", "failed"],
  "commandFingerprint": "<sha256>",
  "logFingerprint": "<sha256>",
  "limitations": []
}
```

El validador debe rechazar secretos, tokens, contenido de variables de entorno, rutas fuera del proyecto de evidencia y revisiones incompletas.

### 8.7 Revisión independiente

La revisión R4 debe ejecutarse sobre el mismo SHA y comprobar, como mínimo:

1. que el adaptador no crea autoridad;
2. que el registro no duplica handlers;
3. que el cierre no deja procesos ni listeners;
4. que las rutas se validan antes de usarse;
5. que `unsupported` y `unavailable` no se confunden;
6. que las evidencias no transfieren resultados a otros clientes;
7. que no se han añadido dependencias runtime externas;
8. que la matriz refleja el código, no solo documentación.

### 8.8 Criterio de aceptación de la tanda

La tanda se acepta solo si se cumplen simultáneamente:

- typecheck sin errores;
- RED registrado y GREEN sobre los mismos casos;
- tests Pi enfocados en verde;
- regresión existente en verde;
- revisión R4 independiente en verde;
- recibo T11 válido y ligado al SHA final;
- documentación de capacidades y limitaciones actualizada;
- ningún cliente externo presentado como soportado sin adapter y evidencia propia.

Si falla una prueba de autoridad, aislamiento, integridad de evidencia o cierre de procesos, T11 queda `BLOCKED` hasta corregirla. Si solo falta un runtime externo, T11 puede cerrarse como `FULL Pi-only` siempre que ese alcance esté declarado explícitamente.

## 9. Entrega y actualización ODD

La implementación debe publicarse en una única tanda coherente, junto con:

- el código del adaptador;
- las pruebas;
- el recibo de evidencia;
- la actualización de `odd/tasks/ecosystem-final-parity-map.md`;
- la entrada correspondiente del Log ODD.

No se debe lanzar CI por el documento aislado. La ronda final de CI se ejecutará una sola vez después de integrar código, pruebas y evidencia. El SHA que no contenga todos esos elementos no puede promover T11.

## 10. Auditoría final del plan y correcciones aplicadas

Se ha revisado el plan contra el ODD, el alcance v1, la frontera de autoridad y el patrón de Gentle Shell. La revisión detectó y resolvió estos riesgos:

### 10.1 Riesgo: confundir Pi-only con FULL normativo

La etiqueta `FULL Pi-only` no puede cambiar por sí sola la fila normativa `Additional clients — T11`. El cierre solo será `FULL` si el alcance Pi-only queda adoptado explícitamente en la entrada del ODD y en la documentación de producto. Si esa decisión no está registrada, el resultado correcto es:

```text
Pi adapter: FULL de implementación
T11 global: PARTIAL por clientes adicionales pendientes
```

La implementación no debe modificar automáticamente el registro global para aparentar completitud.

### 10.2 Riesgo: inventar rutas o APIs durante la implementación

Las rutas indicadas en §8.1 son superficies objetivo, no permiso para duplicar módulos. Antes de crear cada archivo se debe ejecutar una búsqueda de consumidores y contratos existentes. Si ya existe una abstracción equivalente, se reutiliza y el plan se actualiza con la ruta real. Un cambio que solo reorganice nombres no cuenta como capacidad nueva.

### 10.3 Riesgo: declarar compatibilidad por detección

`probe()` solo acredita disponibilidad técnica del runtime. No acredita compatibilidad funcional. La matriz debe conservar dos campos separados:

```text
runtimeAvailable
adapterImplemented
```

Un binario presente con adaptador ausente permanece `unsupported`; un adaptador correcto sin runtime disponible permanece `unavailable`.

### 10.4 Riesgo: el contrato ocultar diferencias de capacidad

El contrato común normaliza ciclo de vida y resultados, pero no obliga a que todos los clientes tengan las mismas capacidades. Cada adaptador debe publicar una matriz propia y rechazar explícitamente las operaciones que no soporte. Nunca se debe simular una herramienta, delegación, memoria o permiso que el cliente no pueda garantizar.

### 10.5 Riesgo: evidencia insuficiente de procesos y cierre

La prueba de cierre debe comprobar observables, no solo promesas:

- número de procesos descendientes antes y después;
- listeners y timers registrados antes y después;
- archivos temporales creados y eliminados;
- resultado de cancelación;
- ausencia de reejecución tras reinicio;
- diagnóstico conservado cuando el cierre falla.

Si la plataforma no permite una medición concreta, el escenario queda `blocked`, no `passed`.

### 10.6 Riesgo: falta de control de reversión

La tanda debe incluir un plan de rollback local:

1. desregistrar el adaptador;
2. restaurar los handlers anteriores;
3. no tocar stores ni datos de usuario;
4. eliminar únicamente recursos creados por la tanda;
5. demostrar que la extensión vuelve a arrancar sin el adaptador.

El rollback no debe borrar configuraciones personales ni ejecutar comandos destructivos fuera del directorio temporal de prueba.

### 10.7 Riesgo: plataforma no definida

La evidencia se separará en:

- Linux: ejecución local y CI;
- Windows: ejecución CI o host Windows real;
- macOS: ejecución CI o host macOS real.

No se debe llamar “multiplataforma” a una prueba ejecutada solo en Linux. Una plataforma sin runtime Pi disponible se marca `unavailable`, conservando la razón exacta.

### 10.8 Riesgo: Gentle Shell usado como fuente normativa incorrecta

Gentle Shell se usa para comparar semántica de integración Pi, trabajos, sesión y cierre. Gentle-AI solo se usa para inventariar posibles runtimes externos. Ninguna de las dos fuentes autoriza copiar permisos, herramientas o equivalencia sin contrato ASEN y evidencia propia.

### 10.9 Puerta de decisión antes del cierre

Antes de cambiar el estado T11, el ejecutor debe rellenar esta tabla en la evidencia:

| Pregunta | Respuesta obligatoria |
|---|---|
| ¿Está implementado `PiClientAdapter`? | SHA y archivos |
| ¿Se probaron interactivo, RPC y print? | casos y resultados |
| ¿Se probaron aislamiento y permisos? | casos y resultados |
| ¿Se verificó cierre de procesos/listeners/temp? | mediciones |
| ¿Existe cliente externo con adaptador real? | cliente, versión y SHA |
| ¿Se ha adoptado formalmente alcance Pi-only? | referencia ODD/documental |
| ¿Qué plataformas tienen evidencia? | recibos por plataforma |
| ¿Hay defectos R4 críticos? | lista y resolución |

Si cualquiera de las respuestas críticas está vacía, T11 no puede ser `FULL`.

### 10.10 Resultado de la auditoría

El plan queda completo para implementación, pero no anticipa el resultado. El estado de partida permanece:

```text
T11 = PARTIAL
Pi = integración existente, pendiente de contrato y prueba formal
Clientes externos = sin adaptadores admitidos
FULL = solo después de satisfacer la puerta de decisión y actualizar el ODD
```

## 11. Ajuste tras inspeccionar la composición real de ASEN

La inspección del código corrige la hipótesis de §8.1 y §8.2: no se debe crear una nueva familia `src/clients/*` ni una capa que vuelva a registrar comandos, herramientas o eventos. ASEN ya tiene en `src/runtime/pi-host.ts` la frontera Pi pública: versión mínima `1.2.0`, modos admitidos `tui`, `rpc`, `json`, `print`, validación del host/contexto y detección de colisiones. `extensions/asen.ts` comprueba esa frontera antes de componer handlers; hay pruebas de preflight, activación única, colisiones, recuperación y matriz de modos.

La implementación quirúrgica debe limitarse a:

1. Mantener `src/runtime/pi-host.ts` como único adaptador Pi y contrato del host.
2. Añadir allí, o en un módulo puro adyacente solo si el tamaño lo justifica, una descripción declarativa de capacidades por modo; sin callbacks de registro ni autoridad.
3. Probar la matriz declarativa contra los modos y la versión ya admitidos, incluyendo que `json` no se confunda con `print`.
4. Documentar los resultados y límites en `docs/installation.md` o en el documento de capacidades ya existente; no crear un recibo de runtime nuevo si el esquema de evidencia vigente no lo admite.
5. Mantener clientes externos como pendientes en la matriz ODD.

No se deben añadir `ClientAdapter.openSession`, `launchAgent`, `observeBackgroundJob` ni `closeSession` genéricos: el host Pi actual no ofrece necesariamente esas operaciones como API pública, y ASEN ya tiene ciclos de vida propios. Inventar esos métodos produciría una abstracción especulativa y duplicaría la composición.

### 11.1 Tabla de capacidades objetivo

La matriz por modo debe distinguir `supported`, `conditional` y `unsupported`, con evidencia apuntando a una prueba existente o nueva:

| Modo Pi | Registro de extensión | UI interactiva | RPC visible | Tools | Límites |
|---|---|---|---|---|---|
| `tui` | soportado por host validado | condicional a `hasUI` | no aplica | según API pública disponible | validar contexto antes de callbacks |
| `rpc` | soportado por host validado | condicional; no inferir diálogos | sí, con salida del host | sí, registrados por Pi | sin inferir aceptación humana |
| `json` | soportado por host validado | no presumir | salida estructurada según Pi | según host | no asumir interacción ni callbacks visibles |
| `print` | soportado por host validado | no presumir | no presumir | según host | operaciones que exigen sesión/UI deben fallar cerradas |

Esta tabla es una hipótesis de documentación que debe verificarse contra el SDK Pi 1.2 fijado y las pruebas. Si una celda no tiene evidencia, debe declararse `unknown`/`blocked` hasta verificarla; no se convierte en `supported` por el nombre del modo.

### 11.2 Alcance de implementación revisado

La primera tanda no necesita un adaptador adicional. Debe cerrar únicamente el contrato de capacidades Pi si existe una brecha funcional demostrable. Si la matriz ya se puede derivar de `ASEN_PI_SUPPORTED_MODES` y del comportamiento existente sin añadir código, el cambio será de pruebas/documentación y T11 seguirá `PARTIAL` global mientras el alcance adicional no se adopte formalmente.

No ejecutar una prueba Pi “real” que invoque proveedor/modelo para cerrar T11: las pruebas del adaptador son host-contract, provider-free. La aceptación de una operación que requiera UI humana debe seguir marcada como no disponible en modos sin UI.

## 12. Ejecución local actual y conclusión

En el worktree actual, `PiClientAdapter` no existe ni es necesario: la frontera está implementada por `src/runtime/pi-host.ts` y la extensión. Se corrigieron las expectativas antiguas de inventario en `tests/pi-host-preflight.test.ts` para incluir las tres herramientas de background ya registradas y las herramientas condicionales de la configuración de prueba.

Evidencia de esta revisión:

- `node --import tsx --test tests/pi-host-preflight.test.ts tests/pi-host-compatibility-matrix.test.ts`: 67/67 PASS, 0 fallos, 0 skips.
- `npm run typecheck`: PASS.
- `git diff --check`: PASS.
- La suite anterior disparada accidentalmente por el runner completo no se toma como verde: tuvo fallos en esas expectativas, que son precisamente las que se corrigieron y verificaron después en la ejecución dirigida.

Esto prueba el contrato local del host Pi, no prueba multiplataforma. No se afirma compatibilidad de clientes externos, que están fuera del alcance adoptado. Resultado: pruebas locales de frontera Pi admitidas como evidencia de worktree, no ligadas a SHA; T11 permanece `PARTIAL_BY_ACCEPTED_SCOPE` hasta la evidencia host/plataforma y revisión exacta pendientes.
