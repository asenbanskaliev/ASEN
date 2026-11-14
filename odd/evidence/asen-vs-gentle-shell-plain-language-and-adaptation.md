# ASEN vs Gentle Shell — diferencias explicadas en simple, y qué conviene adaptar

**Fecha:** 2026-11-14
**Comparación contra:** Gentle Shell (paquete `gentle-pi`) **4.8.0**, copia local en `C:\gentle-shell`, punto exacto `3dc90297`
**ASEN comparado:** `asen` 0.1.0, rama `feat/t12-integrated-acceptance-merge`, punto `f4bc7a90`
**Base del mapa técnico:** `odd/evidence/asen-vs-gentle-shell-difference-map.md` (275 operaciones comparadas una por una)

Este documento no repite el mapa técnico. Traduce las diferencias a lenguaje común y propone **qué adaptar en ASEN**, no qué copiar.

---

## 1. La idea en una frase

Gentle Shell es una **cabina**: pantallas, avisos, sonidos, lienzo de diseño, editor con atajos, panel lateral, aplicación de escritorio.
ASEN es un **motor de trabajo**: ordena las fases, obliga a probar antes de escribir, prepara las entregas, guarda evidencia de lo que se ejecutó.

No están uno adelante del otro. Están **en extremos distintos**. Por eso "falta todo" y "sobra todo" son las dos respuestas falsas.

Y el dato que ordena todo lo demás: de las **80 cosas que Gentle Shell tiene y ASEN no**, **48 son pantallas** y solo **12 son reglas de fondo**.

---

## 2. Tabla de diferencias

Cómo leerla: *Gentle Shell* y *ASEN* describen **qué hace cada uno hoy**, en palabras simples. La última columna es la propuesta: **adaptar** (aprovechar algo que ya existe en ASEN y mejorarlo) o **no conviene** (con el motivo).

### A. Cómo se arranca y se maneja el producto

| Área | Cómo lo hace Gentle Shell | Cómo lo hace ASEN | Propuesta para ASEN |
| --- | --- | --- | --- |
| Arranque | Una sola secuencia ordenada: identifica el programa, revisa si hay versión nueva, saluda, y entra. Todo en un lugar. | El arranque está repartido en cuatro piezas distintas (preparación, ciclo de vida, lanzador, interfaz). Funciona, pero nadie puede leer "qué pasa al abrir" en un solo sitio. | **Adaptar.** Unir las cuatro piezas en una secuencia única y visible, sin código nuevo de fondo: es reordenar lo que ya existe y dejarlo escrito. |
| Nombre y saludo | El nombre, el color y el mensaje de bienvenida se pueden cambiar y quedan guardados. | Hay identidad fija. Se ve bien, pero no se ajusta. | **Adaptar, al final.** Bajo valor. Solo si aparece un pedido real de personalización. |
| Menú de comandos | Un solo catálogo alimenta el menú, la búsqueda y la ayuda. Si agregás algo, aparece en los tres. | Hay catálogo, paleta y ayuda como piezas separadas; se pueden desincronizar. | **Adaptar. Prioridad alta y bajo costo.** Un catálogo que alimente a los tres. No hay que inventar nada: las tres piezas ya están. |
| Ayuda guiada | Tiene un recorrido que te lleva de la mano por las funciones. | Hay una guía, pero no está enganchada al producto. | **Adaptar, opcional.** Solo vale la pena si el producto se va a mostrar a alguien nuevo. |
| Autodiagnóstico | No tiene. Solo revisa cosas durante la instalación. | Tiene un "médico" que revisa el estado del entorno y explica qué falta. | **Mantener ASEN.** Acá ASEN está mejor. Lo que falta es mostrarlo desde el menú, no esconderlo en un comando. |

### B. Instalación, actualización y desinstalación

| Área | Cómo lo hace Gentle Shell | Cómo lo hace ASEN | Propuesta para ASEN |
| --- | --- | --- | --- |
| Instalación | Un asistente paso a paso, con pantallas, que explica antes de tocar nada. | Instala por programa, con firma y verificación de lo que baja. Es más seguro y menos visible. | **Adaptar solo la cara.** Poner un asistente encima de lo que ya hace. La parte de firma y verificación de ASEN es superior: no se toca. |
| Actualización | Avisa, muestra un panel y actualiza. | Prepara la actualización, la verifica y la deja lista para elegir. No avisa bien. | **Adaptar el aviso.** El trabajo fino ya está hecho; falta que el usuario se entere. |
| Desinstalación | Tiene un flujo completo de desinstalación, con copia de seguridad y limpieza. | No tiene desinstalación. | **Adaptar. Prioridad media.** Un producto que se instala y no se puede sacar limpio es un problema de confianza, no de funciones. |
| Copia de seguridad | Respalda la instalación antes de sacarla. | Respalda la memoria del proyecto, no la instalación. | **Adaptar la idea, no el código.** Son cosas distintas: ASEN ya sabe respaldar, hay que aplicarlo al caso instalación. |
| Quién manda la versión | Busca la instalación que ya existe y la usa. | Elige versión, la verifica y la lanza. | **Mantener ASEN.** Es más estricto y es la razón por la que ASEN puede prometer lo que promete. |

### C. Ayudantes (los que hacen el trabajo por partes)

| Área | Cómo lo hace Gentle Shell | Cómo lo hace ASEN | Propuesta para ASEN |
| --- | --- | --- | --- |
| Lanzar un ayudante | Una pieza grande maneja todo: creación, avance, cierre, informe. | Está partido en tres: quién arranca, quién corre, quién guarda el resultado. | **Mantener el corte de ASEN.** Partirlo es mejor. Lo que falta es el resumen de estado que la pieza grande sí da. |
| Ver qué está haciendo un ayudante | Tiene vista de conversación completa, vista de panel y vista chica dentro del chat. | Tiene un panel y una ficha de estado. No hay vista de conversación ni vista chica. | **Adaptar. Prioridad alta.** Es la queja número uno de cualquier sistema con ayudantes: "no sé qué está pasando". Reusar el panel que ya existe y sumarle la conversación. |
| Hablar con un ayudante | Se le puede mandar un mensaje y continuar la conversación. | Solo hay una consulta puntual, con permiso. | **Adaptar con cuidado.** La consulta con permiso de ASEN es una garantía; no hay que abrir un canal libre. Sumar "continuar la misma tarea", no "chatear con cualquiera". |
| Ayudante que quedó a medias | Queda el historial y se puede retomar. | Existe un mecanismo explícito para retomar un ayudante interrumpido. | **Mantener ASEN.** Y documentarlo: hoy existe y casi nadie lo sabe. |
| Elegir modelo por ayudante | Cada ayudante puede tener su modelo fijado, con resolución automática. | Hay perfiles y cadena de respaldo, pero atados a la sesión, no al ayudante. | **Adaptar. Prioridad media.** Reusar los perfiles que ya existen; el cambio es "a quién pertenece el perfil", no un motor nuevo. |
| Repartir trabajo en paralelo | Tiene reglas de admisión para varios escritores a la vez. | Tiene preparación de escritores en paralelo y un contrato de propiedad del espacio de trabajo. | **Mantener ASEN.** Es más estricto. Falta la parte visible: quién está escribiendo qué. |

### D. Revisión del trabajo y permisos

| Área | Cómo lo hace Gentle Shell | Cómo lo hace ASEN | Propuesta para ASEN |
| --- | --- | --- | --- |
| Revisar un cambio | Congela el cambio exacto, le pone un número de identidad, pide permiso, revisa, y emite un recibo que después se puede consultar. | Congela una foto del espacio de trabajo, pide permiso y devuelve un resultado que **no** autoriza a publicar. | **Adaptar el recibo, no el motor.** ASEN ya congela y ya pide permiso. Lo que falta es un nombre único para cada revisión, para poder decir "esta revisión, de este cambio exacto, terminó así". |
| Pedir permiso para revisar | Muestra un cartel con el motivo, el riesgo y las opciones, y espera. | Delega ese cartel a la herramienta externa de revisión. | **Mantener la delegación.** Duplicar el cartel es justo lo que hay que evitar. |
| Corregir después de la revisión | Permite **una** corrección acotada y después valida solo lo corregido. | Tiene un presupuesto de corrección acotada. | **Mantener ASEN.** Está alineado. Lo que falta es que el "presupuesto" se pueda ver. |
| Publicar después de aprobar | La aprobación habilita la publicación. | La aprobación **no** habilita nada: publicar es una decisión aparte. | **Mantener ASEN, y decirlo.** Es una diferencia de criterio, no una falta. ASEN es más conservador a propósito. |
| Comandos peligrosos | Bloquea comandos destructivos con un analizador propio. | Bloquea comandos destructivos, valida rutas, tacha secretos y analiza la sintaxis del comando. | **Mantener ASEN.** Está más cubierto. |
| Permisos automáticos | Recuerda lo que ya autorizaste y clasifica lo nuevo. | Clasifica y guarda evidencia, pero no recuerda entre sesiones. | **Adaptar. Prioridad media.** La memoria de permisos ahorra fricción real. Reusar la evidencia que ASEN ya guarda como memoria. |
| Permiso para tocar otro proyecto | Tiene permisos por destinatario. | Hay acceso puntual con permiso, sin registro por destinatario. | **Adaptar, solo si aparece el caso.** Hoy no hay necesidad demostrada. |

### E. Trabajo por fases, pruebas y entrega

| Área | Cómo lo hace Gentle Shell | Cómo lo hace ASEN | Propuesta para ASEN |
| --- | --- | --- | --- |
| Ordenar el trabajo por fases | Dos piezas: adivinar en qué fase está y aplicarla. El resto es texto de instrucciones. | Un sistema completo: contrato de ejecución, ruteo por tamaño, seguimiento en un documento, riesgo, aplicabilidad. | **Mantener ASEN. Es su ventaja principal.** Documentarlo como producto, no como nota interna. |
| Probar antes de escribir | Solo reparte un documento de "pruebas primero" entre los ayudantes. | Ciclo completo: prueba que falla, arreglo, prueba que pasa, registro de cierre, y una salida explícita cuando no aplica. | **Mantener ASEN. Es su segunda ventaja.** Falta que el registro de cierre se vea, porque hoy es invisible. |
| Entregar cambios | Una señal de "corte de commit" y reglas de alcance de escritura. | Política de ramas, de commits, de cadena de entregas, de etiquetas, y contabilidad de qué va en cada entrega. | **Mantener ASEN.** Falta la vista: cuántos cambios van, cuánto pesa la entrega, si conviene partirla. |
| Reportar un problema | No tiene. | Prepara el reporte y lo publica. | **Mantener ASEN.** No hay nada que adaptar. |
| Atar un defecto a su causa | No tiene. | Liga el defecto, lo reproduce y lo ata al cambio que lo causó. | **Mantener ASEN.** |
| Guardar prueba de lo ejecutado | Guarda evidencia de revisión y de comandos, con su formato. | Guarda evidencia de ejecución, de comandos, de linaje y de proceso. | **Mantener ASEN.** Lo que falta es que el usuario pueda leer esa evidencia sin abrir archivos. |

### F. Datos, memoria y habilidades

| Área | Cómo lo hace Gentle Shell | Cómo lo hace ASEN | Propuesta para ASEN |
| --- | --- | --- | --- |
| Memoria del proyecto | No tiene propia: usa una herramienta externa, y lo explica como instrucciones. | Tiene memoria propia completa: guarda, resuelve proyecto, recupera tras compactar, respalda, restaura. | **Mantener ASEN.** Diferencia a favor, no en contra. Un ajuste útil: permitir apuntar a una memoria compartida por el equipo, que es la ventaja real de la externa. |
| Habilidades reutilizables | Un registro grande, con búsqueda en disco y etiquetas de alcance. | Registro partido en tres: registro, lista generada y ciclo de vida; 27 habilidades propias. | **Mantener ASEN.** La búsqueda en disco y las etiquetas de alcance sí valen: son dos ideas chicas sobre algo que ya existe. |
| Repartir documentos entre ayudantes | Reparte por "dueño" del documento, para que dos no escriban lo mismo. | No tiene ese reparto. | **Adaptar. Prioridad baja y costo bajo.** Es una regla, no una pantalla. |

### G. Pantallas, avisos, sonido y escritorio

| Área | Cómo lo hace Gentle Shell | Cómo lo hace ASEN | Propuesta para ASEN |
| --- | --- | --- | --- |
| Barra y panel lateral | Barra con grupos, panel lateral con secciones, avisos y estados. | Barra de foco simple y un riel de lectura. | **Adaptar solo lo que informa.** Un panel lateral que muestre estado real (trabajos, cambios, revisión). No un panel decorativo. |
| Avisos | Servicio de avisos con cola, horario, política y varios canales. | Proyecta avisos y lleva un diario. No tiene cola ni horario. | **Adaptar la cola, no los canales.** Un aviso que se pierde es peor que ninguno. |
| Sonidos | Sonido de aviso en Windows y en el sistema, configurable. | No tiene. | **No conviene, salvo pedido explícito.** Un producto de terminal que suena molesta más de lo que ayuda. Si se quiere, va como opción apagada por defecto. |
| Aviso en el escritorio | Un canal que empuja avisos a una app de escritorio. | No tiene. | **No conviene todavía.** Primero tiene que existir la app. |
| Voz | Hablar y que se escriba: mantener apretado, sesión, ajustes, instalación, plataforma. | Dictado, sin mantener apretado ni ajustes. | **Adaptar solo si hay uso real.** Es la función que más mantiene y menos devuelve. |
| Lienzo de diseño | Servidor de lienzo, piezas, fuentes, comentarios, entrega, colores del sistema. | No tiene. | **No conviene.** Es un producto dentro del producto. Si se necesita, va aparte. |
| Editor con atajos tipo vim | Motor completo: normal, operadores, visual, política. | No tiene. | **No conviene.** El editor no es de ASEN; es del anfitrión. Duplicarlo es la peor inversión posible. |
| Temas y apariencia | Temas, personalización visual, perfiles visuales, vista previa de acomodo. | Tema de foco, sin personalización. | **No conviene, salvo pedido.** Cosmético y caro de mantener. |
| Contadores de uso | Contadores, medidores, costo por modelo, aviso de segundos por token. | Uso y estadísticas de historial. | **Adaptar lo barato:** mostrar costo y ritmo en el mismo lugar donde ya se muestra uso. Nada más. |
| App de escritorio | Nueve servicios con un canal de comunicación propio. | Un canal mínimo, sin servicios. | **No conviene.** ASEN no es un producto de escritorio. Construir eso lo convierte en otro producto. |
| Documentos de contrato | 81 documentos que fijan el formato exacto de cada mensaje entre piezas. | 21 fichas de capacidad y libros de evidencia. | **Adaptar el hábito, no el volumen.** Escribir el formato de **una** cosa que hoy se rompe seguido, y nada más. |
| Pruebas del propio producto | 672 archivos de prueba. | 459 archivos de prueba. | **Mantener ASEN.** Menos archivos, más reglas duras. Lo que falta es una prueba de recorrido completo, no más pruebas sueltas. |

---

## 3. Qué adaptar primero, y por qué

Ordenado por **cuánto mejora por unidad de trabajo**. Todo lo de abajo reusa algo que ASEN ya tiene.

**1. Un solo arranque y un solo catálogo.** Hoy el inicio y los comandos están repartidos; se desincronizan solos. Unificar es barato, se nota en el primer minuto de uso y no agrega superficie nueva.

**2. Vista de conversación del ayudante.** ASEN ya tiene panel de agentes y ficha de estado: falta la parte que la gente mira. Es la mejora con más impacto emocional del listado, y no requiere motor nuevo.

**3. Desinstalación limpia.** ASEN instala y no se puede sacar. Reusar el respaldo que ya sabe hacer.

**4. Recibo de revisión.** ASEN ya congela el cambio y ya pide permiso; falta ponerle nombre a cada revisión para poder decir "esta, exactamente esta, terminó así". Es un identificador y un documento, no un motor.

**5. Cola de avisos.** El diario ya existe. Falta que no se pierda ninguno cuando la interfaz está ocupada.

**6. Permisos recordados.** La evidencia de permisos ya se guarda; convertirla en memoria entre sesiones es el paso siguiente, no un sistema nuevo.

**7. Cara visible de instalación y actualización.** El trabajo fino está hecho y es mejor que el de Gentle Shell. Lo que falta es que el usuario lo vea antes de que pase.

---

## 4. Qué NO hay que copiar, y por qué

| No copiar | Motivo |
| --- | --- |
| Lienzo de diseño | Es un producto independiente. Metido adentro, ASEN deja de ser un motor de trabajo. |
| Editor con atajos tipo vim | El editor pertenece al anfitrión. Duplicarlo crea dos editores que se pelean. |
| Nueve servicios de escritorio | Convierte a ASEN en una app de escritorio, que es otro producto con otro mantenimiento. |
| Sonidos y avisos en pantalla del sistema | Molestan en un producto de terminal. Solo con pedido explícito y apagado por defecto. |
| Los 81 documentos de contrato | El volumen es un costo, no una virtud. ASEN necesita uno, donde hoy se rompe seguido. |
| Su forma de instalar (sin firma) | ASEN firma y verifica. Copiar la forma de Gentle Shell sería **bajar** el nivel. |
| Su forma de autorizar publicación | Gentle Shell usa la aprobación como permiso para publicar. ASEN decidió lo contrario a propósito. Ese criterio se defiende, no se copia. |
| Su versión de "pruebas primero" | Es un documento repartido. ASEN tiene el ciclo real. |

---

## 5. Cómo se verificó esto

1. **Mapa de fuente, operación por operación:** 275 operaciones comparadas en 22 áreas, cada una con su archivo en los dos productos y un veredicto (`odd/evidence/asen-vs-gentle-shell-difference-map.md`).

2. **Análisis de lo que realmente se entrega, con REA 6.9.0.** No se analizó solo el código fuente: se analizaron los **archivos compilados que cada producto publica**, que es lo que el usuario recibe. Comando usado: `analyze-javascript-application <dir> --artifact-format directory`. Gentle Shell 4.8.0 (`C:\gentle-shell\runtime`) y ASEN (`C:\Asen\dist`).

| Medida | Gentle Shell 4.8.0 | ASEN |
| --- | --- | --- |
| Archivos entregados leídos | 17 de 17 | 208 de 208 |
| Fallos de lectura | 0 | 0 |
| Nudos de código leídos | 51.602 | 240.683 |
| Hallazgos registrados | 469 | 1.311 |
| Ventanas de escritorio detectadas | 0 | 0 |
| Canales internos de escritorio | 0 | 0 |
| Salidas a la red desde el código entregado | 7 | **0** |
| Creación de procesos hijos | 5 | 27 |
| Relaciones sin resolver | 19.989 | 39.372 |
| Identificador de la evidencia | `ev_885323bb…7213ce2c` | `ev_acac4da0…b29c30b86` |

   Qué agrega esto, y qué no:

   - **Confirma que el inventario del mapa no está inventado.** El artefacto que se entrega tiene exactamente las piezas que el mapa dice: 17 archivos en Gentle Shell, 208 en ASEN, cero fallos. No hay capacidad escondida en el compilado que el mapa no haya visto.
   - **Gentle Shell no es una aplicación de escritorio.** Cero ventanas y cero canales internos: lo que llama "escritorio" es un canal aparte, no una app. La conclusión del mapa ("no conviene construir nueve servicios") se sostiene.
   - **El código que ASEN entrega no habla con la red.** Cero salidas. Todo lo que sale pasa por las herramientas del anfitrión. Eso respalda su promesa de no inventar aprobaciones: no hay un camino de atrás.
   - **ASEN arranca más procesos** (27 contra 5). Es un dato neutral, no un defecto, pero es la superficie donde conviene mirar si alguna vez algo se cuelga.
   - Los "sin resolver" **no son una nota de calidad**. ASEN tiene doce veces más archivos; el número absoluto no compara nada. Se informa porque está medido, no porque signifique algo.

3. **Límites, dichos de frente:** esto es lectura de código, no ejecución de los productos. No hay comparación de pantallas en vivo, ni medición de velocidad, ni prueba de que dos cosas que se parecen se comporten igual. Cada "se parece" del mapa significa "tiene la misma forma", nada más.

4. **Cómo se instaló y se corrió, por si hay que repetirlo:** REA 6.9.0 no arranca con Node 24.15 (exige 24.22.1 o superior). Se instaló un Node 24.22.1 aparte en `C:\Users\asenb\.local\node\24.22.1` — sin tocar el Node del sistema — y REA se ejecutó con ese intérprete. Los paquetes de análisis nativo (Ghidra, Hopper, IDA, jadx) no están instalados y **no hacen falta** para este caso: el análisis de JavaScript entregado no los usa.

---

## 6. Una diferencia de criterio que conviene dejar escrita

Gentle Shell trata la aprobación de una revisión como **permiso para publicar**.
ASEN trata la aprobación como **información**, y publicar como **decisión aparte**.

Eso no es una falta de ASEN. Es una decisión más conservadora, y es la que hace que ASEN pueda decir "no inventé ninguna aprobación". Cualquier propuesta de adaptación de este documento respeta esa línea: se adapta la **visibilidad**, nunca la **autoridad**.
