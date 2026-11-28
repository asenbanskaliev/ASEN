# ASEN — Continuación híbrida con Pi Agent en Windows

Corte: 28/11/2026. Proyecto de desarrollo: C:\ASEN. El ejecutor de desarrollo es Pi local; ChatGPT supervisa y audita. Las cinco tareas programadas quedan pausadas. No trabajar en D:\ASEN ni sobre main. No reutilizar permisos de otras máquinas. No borrar ni sobrescribir trabajo local existente.

## Punto de partida comprobado

- Candidato de código: PR #163, rama feat/asen-equipo-E-M3-M4-g2-consolidacion-20261128, SHA 7b8c727bd7db21f80596a514a7ea5bc25f6ec3ee.
- Base de consolidación: integration/megatanda-b-consolidada-20261124, SHA ca0ff94d62c0f3cf81cf2e2287b5631c1dc38f0c. M1 y M2 cerradas en su alcance acreditado; no reabrir sin regresión reproducible.
- CI #46124949068, Release Gate #46124949035, CI rápida #46124949023, arquitectura #46124949021 y Pi 1.2 #46124949018 correctas en el SHA indicado. Pi Free Smoke omitida, no acredita ensayo real.
- Un hilo CodeRabbit histórico sobre firmas hexadecimales sigue abierto; verificar la corrección del SHA y responder con evidencia, no confundir CI correcta con revisión independiente terminada.
- M3/M4: dos tandas incorporadas (recuperación desde comandos públicos, firmas de recibo, protección anticipada de rutas sensibles, turno Pi y bloqueo de reintento Writer, guardado Fix no duplicado). Falta auditoría completa de consumidores G04, cobertura de G03/P04 y G05/P01/P06, revisar seguridad residual de vistas y aceptación real.
- M5: G02/G07/CTX/P05, métricas y comparación de agentes. M6: aceptación integral según 18 objetivos, 12 puntos, P01–P06, G01–G08 y CTX/E1–E4/F. globalFull:false.

## Preparación

Requiere Git, Node >=22.19.0 (preferible Node 24 LTS), npm y Pi instalado con sus propias credenciales. GitHub CLI es opcional pero recomendable para revisar CI y PR. Comprobar `git status --short`, `git remote get-url origin` y rama antes de modificar una copia existente. Si contiene cambios locales, preservar y detener el cambio de rama. No reset, clean, stash automático ni force push.

En una carpeta nueva:
```powershell
git clone --branch feat/asen-equipo-E-M3-M4-g2-consolidacion-20261128 https://github.com/asenbanskaliev/ASEN.git C:\ASEN
Set-Location C:\ASEN
git status --short
git log -1 --oneline
node --version
npm ci
npm run check:fast
```

Leer en cada sesión el registro vigente mediante:
```powershell
git fetch origin
git show origin/coordination/asen-megatandas-20261125:coordination/megatandas.json
git show origin/coordination/asen-megatandas-20261125:coordination/continuacion-local-pi.md
```

Las refs remotas son dinámicas; si el registro identifica otro candidato, verificar el cambio con el coordinador antes de modificar. El plan rector #61 está en feat/flujo-de-agentes-20261115: consultar allí las rutas canónicas si no existen en el candidato. No usar el plan histórico de continuación remota como estado actual.

## Prompt para Pi Agent

Actúa como coordinador técnico y desarrollador principal de ASEN en C:\ASEN. Trabaja en español, con cambios y commits reales, ODD + TDD, y agrupa implementaciones por megatanda. Lee AGENTS.md, el índice odd/tasks/INDEX.md, el registro remoto de coordinación y este traspaso. Contrasta código, pruebas y GitHub; los resúmenes históricos no son prueba. Empieza en la PR #163 vigente y preserva M1/M2.

Utiliza como máximo dos agentes escritores si están realmente disponibles; si no, ejecuta secuencialmente. Asigna M3 y M4 en ámbitos disjuntos, cada uno con rama y worktree independientes derivados del mismo SHA, sin modificar archivos compartidos ni usar main. El coordinador resuelve interfaces comunes y consolida. No inicies una segunda instalación de dependencias si los recursos del PC no lo permiten; no compartir node_modules mutable entre escritores. Reserva previamente archivos, unidad, rama, base y generación en coordination/megatandas.json mediante actualización no forzada del HEAD exacto. Revalida la reserva antes de publicar. Solo E coordina integración. Si otro escritor está activo, no invadas su ámbito. ChatGPT revisa en solo lectura mientras Pi desarrolla, salvo transferencia explícita del usuario.

1. Verifica CI y revisión actuales de #163; conserva resultados válidos por SHA. Audita el código de objetivos 01–08 y 14, P04 y G03 (M3), objetivos 11–13, G04–G06, P01/P06 (M4). No repetir implementaciones existentes.
2. Identifica carencias funcionales reproducibles; implementa todas las relacionadas en una tanda. Prioriza G03 continuidad de turno y reinicio real de padre, G04 consumidores de política proporcional, G05 Fix y límite de correcciones, G06 rutas sensibles. Pruebas positivas y negativas antes de consolidar. Mantén los límites de autorización y no dupliques acciones inciertas.
3. En local, ejecuta pruebas dirigidas con node --import tsx --test <archivos-de-prueba>, npm run check:fast, npm run check:import-cycles, npm run build y pruebas conjuntas pertinentes. Antes de publicar ejecuta npm run check si es viable; si no, registra qué no se ejecutó y valida remotamente. No ejecutes pruebas completas tras cada modificación pequeña.
4. Publica un lote coherente en GitHub solo por el coordinador, mediante push normal, tras revisar diferencias, ausencia de secretos y reserva vigente. Actualiza la PR candidata existente o una sucesora autorizada; no crear duplicados. No fusionar main, #61 ni #115 a sus bases. No aprobar tu propia revisión ni saltar puertas.
5. Consulta CI/Release Gate y CodeRabbit del SHA publicado. Repara en bloque los hallazgos reproducibles. No resolver hilos solo por antigüedad ni contar trabajos omitidos como correctos. Repite validaciones completas tras cambios materiales. Para pruebas reales NVIDIA, separar desarrollo con tu propio proveedor de los ensayos de aceptación del producto: usar exclusivamente autorización exacta vigente, secreto permitido, modelo gratuito verificado, límites explícitos, sin reintento automático ni consumo duplicado. No copiar OAuth, claves ni sesiones privadas entre procesos. Si falta permiso concreto, registrar el bloqueo.
6. Deja M3/M4 cerradas solo cuando todos sus criterios de fase y la revisión exacta estén acreditados; si una prueba real integral pertenece a M6, deja ese límite visible. Continúa M5 y M6 en el orden rector con el mismo protocolo. No declarar globalFull:true sin aceptación integral.
7. Guarda cada avance material, SHA, archivos, pruebas ejecutadas, fallos, reservas y siguiente tarea en el registro de coordinación. Libera la reserva al terminar o fallar y antes de esperar CI/revisión. No retomar una ejecución incierta sin comprobar diario y efecto. Si no hay avance posible, detén esa unidad y trabaja otra independiente; no simular éxito ni quedarse repitiendo.

Tras cada lote, entrega a ChatGPT un resumen verificable: PR, SHA, requisitos cerrados/parciales, pruebas, hallazgos y siguiente unidad. No solicitar confirmación para cada lectura; sí para acciones protegidas, costes o alcance no autorizado. Si Pi no dispone de subagentes reales, no fingir paralelismo. No activar tareas programadas.

## Reanudación

En cada nueva sesión repetir la lectura del registro y verificar HEAD, cambios locales y reservas. El checkout de código es una copia local, no el estado rector. Si hay cambios ajenos o conflicto, conservarlos y reconciliar; no sobrescribir. No se exige copiar archivos de memoria o credenciales del ChatGPT ni de otros agentes.
