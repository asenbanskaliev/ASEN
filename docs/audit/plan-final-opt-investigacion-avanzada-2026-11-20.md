# ASEN — Auditoría crítica del plan final tras investigación avanzada

**Fecha:** 20/11/2026. **Estado:** AUDITORÍA TÉCNICA DOCUMENTAL COMPLETADA; **NO** revisión independiente, **NO** prueba ejecutada de Pi/proveedor y **NO** validación de ahorro.
**Código de referencia:** PR #61, rama `feat/flujo-de-agentes-20261115`, SHA observado `a05424fec15ba5770b45695fefd126638c88b1a7`, cuya dependencia `@earendil-works/pi-coding-agent` está fijada a **1.2.0** en `package-lock.json`.
**Plan revisado:** [Plan final de ejecución CTX-0–CTX-6](../plan-final-opt-contexto-y-agentes-2026-11-20.md), subordinado a los 18 objetivos E0–E4/F y sus puertas G0–G6.
**Fuentes internas:** [anexos 11–13 del plan rector](../../odd/tasks/flujo-de-agentes-plan-implantacion-4.9.0.md), [auditoría previa](opt-contexto-skills-asen-2026-11-20.md), [18 sesiones P16](p16-gentle-4.9.0-18-sesiones-2026-11-20.md). **No se ha manipulado el código del producto ni llamado a un proveedor de pago.**

## 1. Conclusión

**Diseño aprobado únicamente para comenzar CTX-0 offline y preparar las pruebas de CTX-1. No aprobar todavía modificación de prompts, activación por defecto, equivalencia con Gentle, cambio de permisos ni cierre de los 18 objetivos.**

La investigación aporta un patrón útil (contexto más selectivo), pero su texto final contiene recomendaciones que necesitan corrección. La fuente decisiva es el **código del SHA**, seguido de las pruebas del **Pi 1.2.0 fijado**, no la documentación de otra versión.

**Calidad de la evidencia:** la investigación avanzada llegó a emitir un informe, pero su estado de trabajo no demuestra que todos los pasos de comparación, medición y diseño se hayan verificado experimentalmente. Por ello, el presente dictamen se basa en comprobaciones concretas de código y considera lo demás hipótesis.

## 2. Auditoría de afirmaciones de la investigación avanzada

| ID | Afirmación o recomendación recibida | Dictamen | Corrección vinculante |
| --- | --- | --- | --- |
| **IA-01** | «ASEN gasta 3–4 veces más que Gentle» como conclusión general | **RECHAZAR** | P16 midió solo el entorno reducido y **no** cargó el coordinador completo de Gentle; no extrapolar |
| **IA-02** | «El bloque fijo de ~929 palabras causa exactamente la diferencia» | **NO PROBADO** | La guía es candidata evidente; aislar su contribución en la composición final con CTX-0 |
| **IA-03** | «Usar `event.systemPrompt = ""` o reemplazar el mensaje completo» | **RECHAZAR — RIESGO ALTO** | Nunca vaciar o reemplazar todo el prompt; conservar el ensamblador de Pi y modificar solo la sección propia admitida |
| **IA-04** | «Verificar si `registerTool` o `setActiveTools` está habilitado» | **INCORRECTO COMO DETECCIÓN** | `registerTool` registra; `setActiveTools` cambia herramientas. Probar `event.systemPromptOptions.selectedTools` del Pi exacto **sin mutar** la selección |
| **IA-05** | «Al no haber herramientas, ASEN tampoco carga skills» | **FALSO COMO REGLA GENERAL** | `--no-tools` y `--no-skills` son controles diferentes; observar `skills`, metadatos, herramientas de lectura y su relación real |
| **IA-06** | «Seleccionar skills de nuevo o cambiar `registry.ts` como primera mejora» | **DUPLICACIÓN** | ASEN ya dispone de `selectSkills`, rutas exactas y validación del contexto; preservar y medir antes de modificar |
| **IA-07** | «Cargar programación cuando haya archivos de código» | **CRITERIO INSUFICIENTE** | Una petición de código puede no citar archivos; usar estado, herramientas verificadas, plan y tarea; incertidumbre = ruta conservadora |
| **IA-08** | «Todo lo crítico de seguridad está en código» | **NO PROBADO PARA TODAS LAS REGLAS** | Crear tabla regla→guardia→caso negativo. No quitar del núcleo una obligación sin cobertura equivalente |
| **IA-09** | «Los primeros metadatos de skills bastan; se leen automáticamente» | **PARCIAL** | Pi anuncia habilidades, pero el agente debe leer el archivo cuando corresponda; comprobar la ruta y casos de fallo |
| **IA-10** | «Reducir memoria y planes a un máximo menor» | **SIN EVIDENCIA** | Conservan presupuestos ya acotados de 4096 y 2048 bytes. Eliminar solo duplicados o recuerdos irrelevantes demostrados |
| **IA-11** | «30–50 % de ahorro como objetivo garantizable» | **RECHAZAR COMO RESULTADO** | Definir antes del A/B un umbral operativo por escenario; el plan propone 15 % en tareas simples **solo como criterio de decisión sujeto a línea base**, no como predicción |
| **IA-12** | «Repetir las 18 sesiones P16 demuestra la equivalencia» | **RECHAZAR** | Ensayo ASEN anterior vs optimizado por separado; Gentle completo exige carga equivalente; incluir agentes reales y fallos |
| **IA-13** | «Esconder herramientas al estilo Gentle» | **CONDICIONAL** | No hay garantía de que el Pi de ASEN disponga de idéntica capacidad; CTX-4 es opcional y posponible |
| **IA-14** | «Activar al acabar con CI verde» | **INCOMPLETO** | Exigir pruebas de seguridad y continuidad, A/B justo, caché, revisión independiente, mismo SHA y marcha atrás |
| **IA-15** | «Los costes monetarios bajarán» | **NO PROBADO** | Sin precios reales/caché/importe del proveedor, consignar `unknown`; no inventar ahorro |
| **IA-16** | «El texto central de Gentle es casi nulo» | **FALSO** | Su núcleo de orquestación tiene varios KB; la decisión buena es modularidad con presupuestos, no ausencia de reglas |
| **IA-17** | «Los XML internos de Pi deben editarse directamente» | **EVITAR** | La estructura exacta de Pi depende de versión y ensamblado; conservar API pública y sección propia |
| **IA-18** | «Con una mejora de tokens ya se cierra el flujo de 18 puntos» | **FALSO** | G2/G3/G4/G5/G6 mantienen exigencias de concurrencia, estados, revisión, evidencia de proveedores y CI |

## 3. Evidencias ancladas a código

- **ASEN, guía inyectada:** [`request-guidance.ts`](https://github.com/asenbanskaliev/ASEN/blob/a05424fec15ba5770b45695fefd126638c88b1a7/src/runtime/ui/request-guidance.ts); [`extensions/asen.ts#L1196-L1249`](https://github.com/asenbanskaliev/ASEN/blob/a05424fec15ba5770b45695fefd126638c88b1a7/extensions/asen.ts#L1196-L1249). Hay varias secciones condicionales, no solo guía fija.
- **ASEN, skills:** [`registry.ts`](https://github.com/asenbanskaliev/ASEN/blob/a05424fec15ba5770b45695fefd126638c88b1a7/src/skills/registry.ts) y [`pi-process-runner.ts#L146-L161`](https://github.com/asenbanskaliev/ASEN/blob/a05424fec15ba5770b45695fefd126638c88b1a7/src/agents/pi-process-runner.ts#L146-L161).
- **ASEN, memoria y planes:** [`pi-integration.ts#L82-L96`](https://github.com/asenbanskaliev/ASEN/blob/a05424fec15ba5770b45695fefd126638c88b1a7/src/memory/pi-integration.ts#L82-L96) y [`plan-context.ts#L23-L52`](https://github.com/asenbanskaliev/ASEN/blob/a05424fec15ba5770b45695fefd126638c88b1a7/src/runtime/lifecycle/plan-context.ts#L23-L52).
- **ASEN, protocolo P16:** [`scripts/p16-comparacion-real.mjs#L82-L90`](https://github.com/asenbanskaliev/ASEN/blob/a05424fec15ba5770b45695fefd126638c88b1a7/scripts/p16-comparacion-real.mjs#L82-L90); se ve la asimetría de extensiones y el uso de `--no-tools --no-skills`.
- **Pi 1.2.0, ejemplo del ensamblado por secciones:** [`prompt-customizer.ts`, distribución publicada de @earendil-works/pi-coding-agent@1.2.0](https://app.unpkg.com/@earendil-works/pi-coding-agent@1.2.0/files/examples/extensions/prompt-customizer.ts). Muestra `systemPromptOptions.selectedTools` y `skills`; la ejecución en el SDK real de ASEN sigue pendiente.
- **Gentle 4.9.0:** [`gentle-ai.ts`](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/extensions/gentle-ai.ts), [`child-context-files.ts`](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/lib/child-context-files.ts), [`orchestrator.md`](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/assets/orchestrator.md), [presupuesto documentado](https://github.com/Gentleman-Programming/gentle-shell/blob/ce64a9a708e50c0ca899c8023140e63f29f293e1/docs/prompt-budget.md).
- **Terceras opciones oficiales:** [Agent Skills de Anthropic](https://www.anthropic.com/research/equipping-agents-for-the-real-world-with-agent-skills), [documentación técnica de Agent Skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview). El patrón de carga progresiva no demuestra por sí solo ahorro real de ASEN.

## 4. Riesgos que el plan debe mantener visibles

| Riesgo | Gravedad | Test obligatorio o decisión |
| --- | --- | --- |
| Se omite una regla que no está implementada en una guardia del host | **P0** | Matriz por instrucción y prueba negativa |
| El padre escribe en `full-delegation` | **P0** | Intento de edición denegado, sin efecto, incluso con sección corta |
| Reanudar un Writer incierto o duplicarlo | **P0** | Caída, reinicio, permisos caducados, mensaje duplicado |
| Cambia el SHA o ámbito entre autorización y escritura | **P0** | Invalidar permiso; no reintentar ni cambiar de ejecutor |
| Se deja de mostrar una herramienta necesaria por filtrado | **P0** | `selectedTools` vacío, ausente, real; herramienta descubrible y accionable |
| Se filtra contexto de otra sesión/proyecto | **P0** | Cruce de identidades, memoria/plan/adjuntos con datos sintéticos |
| Métricas contienen contenido privado o claves | **P0** | Solo categorías, tamaños y recuentos; no prompts, respuestas ni huellas reversibles |
| Se duplica una skill o queda sin leer | **P1** | Pi padre/hijo, `--skill` explícito, error de lectura, repetición y reinicio |
| La variación de contexto rompe caché o dispara latencia | **P1** | Medir caché y tiempo global en vueltas sucesivas |
| Interferir con cambios simultáneos E1A–E3 en `extensions/asen.ts` | **P0** | Cambios seriales, SHA exacto, pruebas y nada de sobrescritura de trabajo ajeno |
| Activar automáticamente el flujo P16 de pago | **P0** | Sin provider en fases 0–2, presupuesto y permiso para A/B posterior |
| Tratar muestras pequeñas o respuestas exactas como certificación de seguridad | **P1** | Casos adversos, revisión de salidas sintéticas y sin declarar paridad total |

## 5. Auditoría del orden final y pruebas por fase

| Etapa única | Veredicto ahora | Condición para pasar a la siguiente |
| --- | --- | --- |
| **CTX-0 / E0** — medir y aislar | **PREPARABLE** | Muestra sin red, Pi exacto, secciones reales, baseline reproducible y guardas inventariadas |
| **CTX-1 / E1B** — selección de herramientas | **CONDICIONAL** | Prueba SDK `selectedTools` en Pi 1.2.0, casos faltantes, sin permisos añadidos |
| **CTX-2 / E1B** — módulos de guía | **CONDICIONAL** | Diff mínimo, obligaciones críticas presentes, calidad y seguridad sin regresiones |
| **CTX-3 / E1B/E2B** — memoria y skills | **SOLO SI HAY DUPLICADOS** | Se identifica par de reglas idénticas/caso de uso con prueba |
| **CTX-4 / E4** — herramientas ocultas | **OPCIONAL / POSPONER** | API y funcionalidad demostradas; si no, no tocar |
| **CTX-5 / E4** — comparación | **PENDIENTE** | Presupuesto, modelo, costes, caché, 3+ réplicas por caso si procede y trazas reales de agentes |
| **CTX-6 / F** — aceptación y reversión | **PENDIENTE** | CI exacto, revisión externa/independiente, A/B con calidad, opción de volver atrás sin migraciones |

### Matriz de decisiones

1. **Permitir ahora:** documentación, inventario, pruebas sin red, análisis de composición y simulaciones sintéticas, sin modificar el comportamiento de producción.
2. **Permitir tras CTX-0:** parches pequeños a la guía y detección de herramientas, siempre con pruebas negativas, sin habilitación por defecto.
3. **No autorizar por la investigación:** proveedores o ejecuciones pagadas, escrituras de Writer fuera de permisos ya existentes, lanzamiento automático de planes peligrosos, publicación, aceptación ni fusión.
4. **Requerir posteriormente:** autorización explícita para ensayo que pueda facturarse con límites, autorización exacta de escritura cuando Pi la exija y permiso separado para publicar/fusionar.

## 6. Comprobación de coherencia y reservas

- **Trazabilidad completa:** el plan final mapea **01–18** a las unidades CTX y las puertas E0–E4/F. No crea un «objetivo 19» ni marca fases previas como completadas.
- **Duplicados históricos:** existen anexos 11, 12 y 13, solapados por trabajo concurrente. La **sección 14** del rector y su documento enlazado deben indicar qué versión es ejecutable; los anteriores pasan a ser justificación, no instrucciones adicionales de implementación.
- **Cierre negativo:** el diseño **no** asegura ahorro, igualdad de respuestas, coste reducido ni velocidad superior; tampoco demuestra hoy que los 18 objetivos estén cerrados.
- **Alcance real de esta auditoría:** revisión de documentos, fuentes de código accesibles y contrato publicado de Pi; no se ejecutaron tests, no se instaló nada y no hay revisión independiente de un tercero. Los resultados de CI tras estos cambios documentales deberán comprobarse por commit.

**Dictamen final:** **APROBADO EL PLAN DOCUMENTAL PARA COMENZAR CTX-0 SIN MODELOS**. **Bloqueado el despliegue de OPT y la declaración de eficacia superior** hasta pruebas reales, resultados medidos, revisión independiente y permiso de integración. No fusionar a `main`.
