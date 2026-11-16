# T06 + T07 — ciclo de vida y visibilidad de Workers hijos
Fecha: 16/11/2026. Base PR #61: `56274aa20203acb106da2106fde36a2c1184a63e`.

## Incidencias concretas
- El supervisor no consultaba si un lote ya había consumido el registro de intento único
  antes de mostrar otra confirmación. La escritura atómica seguía bloqueando el reintento,
  pero la interfaz podía pedir un consentimiento inútil.
- La vista de flujo mostraba un lote reclamado sin Worker observable como
  `handoff-unverified`, sin diferenciar el riesgo de lanzamiento incierto.
- La vista agrupaba `queued` con `running`, dando apariencia de ejecución
  aunque el agente solo estuviera en cola.

## Solución acotada
- Consulta de intentos ya registrados en la vista previa del supervisor:
  bloqueo antes de solicitar autorizaciones nuevas. La reserva atómica
  permanece como barrera definitiva frente a carreras.
- Nueva fase informativa `launch-unverified` para un lote consumido y sin
  Worker asociado, con paso `inspect-launch` y ningún permiso de reejecución.
- Nueva fase `queued-observed`, separada de `running-observed`;
  TODOS y AGENTS enseñan los dos estados sin afirmar ejecución.
- La barra inferior muestra las tareas hijas en cola y los lanzamientos inciertos
  aunque no existan agentes locales, sin darles estado de ejecución confirmada.
- Pruebas negativas de proyección, paneles y registros privados reales.

## Alcance y límites
Código de interfaz y comprobación previa del supervisor. No se cambian
Dispatcher, permisos Writer, modelo, claves, costes, ni integración de Git.
Sin llamadas NVIDIA, sin fusión ni reintentos automáticos.
Los tests son deterministas y **no** acreditan dos Writers Pi reales o TUI live.
T06/T07 permanecen PARCIALES y `globalFull:false`.
CI y Release Gate deben cerrar el nuevo SHA; SKIP no equivale a PASS.