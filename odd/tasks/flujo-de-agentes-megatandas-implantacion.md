# ASEN — Implantación acelerada en tres megatandas

**Fecha:** 19/11/2026 · **Rama:** `feat/flujo-de-agentes-20261115` · **PR:** #61 (borrador).
**Fuente:** `flujo-de-agentes-plan-implantacion-4.9.0.md`.
**Estado global:** implantación parcial; `globalFull:false`. Esta tabla no declara paridad ni pruebas reales superadas.

## A · Modelos, perfiles y decisiones (8 de 18 puntos)
**Puntos 01, 02, 03, 04, 09, 10, 14, 18.**
- Seleccionar el modelo principal y el investigador desde el perfil guardado, incluidos modelos de pago configurados.
- Crear modos `organic` y `full-delegation` con compatibilidad de perfiles anteriores, sin que un modelo conceda permisos de edición.
- Bloquear edición directa del padre en el segundo modo; permitir planificación, lectura y entrega a agentes autorizados.
- Conservar las cadenas de sustitución de modelos ya existentes; evitar crear motores duplicados.
- Completar reglas observables para cuándo trabajar directamente y cuándo delegar; distinguir preguntas de decisiones de consentimiento.
- Comprobar versiones y capacidades reales de Pi antes de asumir compatibilidad.

**Cambios publicados en esta ejecución:** elección inicial de modelos configurados, investigador de lectura con modelo configurado, control de modo y editor del perfil, controles de herramientas para impedir escritura directa; pruebas iniciales. **Pendiente:** verificar en Pi auténtico el recorrido completo de un Writer, su aceptación y los permisos exactos; el planificador ya prepara un Writer separado en modo de delegación completa.

## B · Trabajo paralelo, continuidad y revisión (8 de 18 puntos)
**Puntos 05, 06, 07, 08, 11, 12, 13, 15.**
- Reutilizar el supervisor, el planificador, los diarios y los controles de Git existentes.
- Preparar desde el padre hasta dos agentes de escritura independientes; iniciar solo cuando haya permisos válidos y comprobar la simultaneidad real.
- No ampliar automáticamente archivos, objetivos o autorizaciones.
- Entregar resultados una sola vez; continuar otras unidades independientes tras un fallo sin repetir ninguna escritura de resultado incierto.
- Revisar más los cambios de riesgo alto, sin encarecer todos los cambios sencillos.
- Mantener dos jueces cuando proceda, observaciones completas, límite de correcciones y una autorización separada para reparar.

**Cambios publicados en esta ejecución:** mejora de la continuación segura de tareas de lectura pendientes con un modelo exacto elegido en el perfil, gratuito o de pago, sin heredar permiso de escritura. **Pendiente:** lanzamiento autónomo de dos escritores reales, permiso de lote comprobado, revisiones integradas y pruebas de recuperación.

## C · Comprobación real y cierre (2 de 18 puntos)
**Puntos 16 y 17.**
- Comparar resultados bajo las mismas condiciones: corrección, tiempo, llamadas, precio conocido o desconocido, y autorización.
- Completar la comprobación integrada con agentes y modelos reales, fallos y cancelaciones.
- Pedir revisión independiente y comprobar las pruebas en el mismo cambio exacto de GitHub.
- Mantener la propuesta sin fusionar hasta que exista aceptación humana.

**Estado:** pendiente de pruebas de campo, comparación real y dictamen independiente. `skipped`, `unknown` o pruebas simuladas nunca cuentan como `pass`.

## Orden de admisión y evidencias
1. **A:** controles de perfiles, selección real de modelo y prohibición de escritura directa; pruebas de compatibilidad y negaciones.
2. **B:** dos procesos realmente simultáneos, permisos individuales con alcance exacto, entrega única y revisión de resultados.
3. **C:** comparación repetible, ausencia de fallos graves, resultados de Windows, macOS, Linux y puertas de publicación para **un mismo SHA**.
4. **Cierre:** nunca declarar los 18 puntos completados solo por tener código, y nunca fusionar automáticamente la PR.

## Límites invariables
- Un perfil de pago habilita la selección del modelo, **no** una nueva autorización de archivos.
- Solo ejecutar cambios dentro de la petición y de las autorizaciones verificadas.
- Si una escritura termina con resultado incierto: guardar el estado, detener esa unidad y revisar antes de repetir.
- No ocultar fallos de pruebas ni declarar éxito si el último cambio de GitHub no ha sido validado.
