# T06 — Prueba real de dos Workers Pi con NVIDIA

## Qué demuestra y qué no

Este procedimiento **no es un ensayo simulado**: usa dos procesos Pi 1.2 reales, autenticados con NVIDIA, en dos worktrees Git separados, con scopes, sesiones y consentimientos diferentes. Cada proceso debe utilizar la herramienta nativa `write` para crear una función JavaScript. El controlador observa procesos y llamadas de herramienta, valida el modelo reportado por Pi, el archivo modificado y su comportamiento con pruebas deterministas.

**No demuestra todavía** que la confirmación ocurra dentro del TUI de Pi: los dos consentimientos se introducen manualmente en la terminal del operador ANTES de iniciar los procesos hijos. Tampoco sustituye el ciclo ODD/Todo → Supervisor completo, la revisión de Pull Request independiente, pruebas A/B ni FULL.

El informe nunca declara `accepted:true`, `writerAuthority:true` ni `globalFull:true`. No hace commits, fusiones ni reintentos.

## Preparación manual en Windows (solo D:\\Asen)

1. Abrir una terminal PowerShell **interactiva** en `D:\\Asen`.
2. Confirmar que la rama es `feat/flujo-de-agentes-20261115`, con árbol limpio y última versión descargada. No utilizar otras carpetas de código ni modificar `main`.
3. Instalar dependencias locales: `npm ci`. Comprobar Node >= 22.19 y Pi exactamente 1.2.0.
4. Disponer de `NVIDIA_API_KEY` en el entorno local. La clave **no** se copia al informe ni se pega en la conversación. El modelo Writer está fijado a `nvidia/nemotron-3.5-lightning-30b-a3b`; **su precio real no está verificado**. Confirmarlo con el proveedor antes de autorizar consumo.
5. Configurar las variables de la sesión y ejecutar:

```powershell
Set-Location D:\Asen
git status --short
$env:ASEN_T06_EXPECTED_SHA = (git rev-parse HEAD).Trim()
npx tsx scripts/t06-nvidia-dual-writer-native.ts
```

El controlador rechazará cualquier rama con cambios, SHA distinto, ausencia de NVIDIA, Pi incompatible o sesión sin terminal interactiva. Se crean dos worktrees temporales y **no** se ejecutan los Workers sin DOS respuestas literales independientes. Pulsar Intro para denegar.

Si quiere revisar el código con dos **modelos distintos del autor y entre sí**, configure antes dos identificadores `nvidia/...` comprobados y autorizados por el proveedor:

```powershell
$env:ASEN_T06_REVIEW_MODEL_A = "nvidia/IDENTIFICADOR_REVISOR_A"
$env:ASEN_T06_REVIEW_MODEL_B = "nvidia/IDENTIFICADOR_REVISOR_B"
```

Son nombres de ejemplo; no se asume que esos modelos existan ni sean gratuitos. El programa solicita dos confirmaciones adicionales antes de llamar a los revisores. Si no se configuran, **NO** se ejecuta una revisión independiente y se declara `NOT_RUN`. Si se configuran y son incorrectos o fallan, no se declara revisión aprobada.

## Evidencia admitida

- SHA del código fuente, versión Pi y modelo solicitado y observado por **cada** hijo.
- Dos procesos Pi distintos, dos sesiones, dos worktrees Git limpios inicialmente, ámbitos disjuntos y escritura nativa observada.
- Dos funciones JavaScript creadas por los modelos, con revisión sintáctica y pruebas de comportamiento **ejecutadas** por el controlador; sin permitir cambios fuera de los dos archivos declarados.
- Solapamiento real de los intervalos de los dos procesos; si no hubo solapamiento, no se declara simultaneidad.
- Si se han autorizado, dos respuestas Pi sin herramientas, de modelos distintos del autor y entre sí, con referencias SHA de ambos archivos. Son informes de análisis, **no** una aceptación independiente de Pull Request.

Se guarda un fichero `t06-dual-native-evidence.json` en una carpeta temporal privada o en `ASEN_T06_WRITER_REPORT_DIR`. No contiene claves, mensajes completos de modelos ni contenidos de código. Su existencia no significa que se hayan ejecutado pruebas si el resultado indica `BLOCKED`.

## Recuperación y controles

Si hay caída del proveedor, timeout, error de permisos, denegación o resultado dudoso, **no se reintenta automáticamente**. Se conservan los worktrees después del inicio para inspeccionar los archivos reales y los eventos Pi. El operador debe comprobar el proceso, el árbol Git y el diario antes de un intento nuevo. No eliminar o fusionar un worktree con un Writer de estado incierto.

Los tests sin modelos `tests/t06-live-consent.test.ts` y `tests/t06-native-review-receipt.test.ts` se ejecutan en CI para evitar aceptar respuestas falsas, consentimientos cruzados, modelo de pago implícito, huellas diferentes o revisiones incompletas.

## Criterio final de T06

La salida `PASS_TWO_REAL_WRITERS_NEEDS_INDEPENDENT_REVIEW` solo prueba dos escrituras Pi simultáneas y comprobadas en el **escenario de ejemplo**, no que ASEN complete por sí solo el supervisor ODD en producción.

La salida `PASS_TWO_REAL_WRITERS_AND_PI_REVIEWS_NEEDS_T10` añade dos revisores Pi con modelos separados, sin conceder aceptación T10. Para marcar T06 FULL aún son necesarias: prueba TUI de permisos individuales, revisión independiente de PR, evidencias de coste y modelos reales y aceptación del flujo integrado bajo el mismo SHA. Hasta entonces `globalFull:false`.

## Verificación posterior de archivos y recibos (T06/T10)

Después de ejecutar **manualmente** el ensayo con dos autorizaciones humanas y conservar ambos directorios de trabajo, se puede comprobar que el informe no se ha separado del código local:

```powershell
Set-Location D:\Asen
npx tsx scripts/t06-verificar-informe.ts "RUTA_AL_INFORME\t06-dual-native-evidence.json" "RUTA_AL_WORKTREE_A" "RUTA_AL_WORKTREE_B"
```

El comando solo lee Git y los dos archivos generados. Compara commit, rutas exactas, estados Git, huellas, sesiones y valores de seguridad del informe. No ejecuta código generado ni llama a modelos. Un resultado `local-files-consistent-claims-unverified` **no acredita** retrospectivamente que hubo consentimiento humano real, llamadas autenticadas, pruebas de comportamiento o dos procesos simultáneos. Es una comprobación de **consistencia local**, no una auditoría externa T10. Si hay discrepancias devuelve `blocked` y no debe repetirse la escritura sin inspección.
