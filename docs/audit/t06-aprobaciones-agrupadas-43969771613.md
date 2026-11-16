# T06 — aprobaciones agrupadas (ejecución 43969771613)

SHA probado: `a3d209e4a6c6afa2dbd426e8131401ca54c5f5f6`. Fecha: 2026-11-16.
Registro: https://github.com/asenbanskaliev/ASEN/actions/runs/43969771613

## Causa confirmada
- Preparación y jobs de entornos A/B: `success`.
- GitHub devolvió **un único registro** de aprobación humana con
  `environments=[asen-t06-writer-a, asen-t06-writer-b]`.
- El control `validateT06GithubApprovals` rechazó correctamente ese acto
  agrupado porque exige dos aprobaciones humanas separadas.
- Los Writers no llegaron a ejecutarse; tampoco existe el recibo T06/T07.

## Reparación
- El job `aprobar-b` depende ahora de `aprobar-a`.
- El entorno B no estará pendiente hasta finalizar A: la interfaz de GitHub
  ya no ofrecerá aprobar ambos trabajos de manera conjunta.
- Se añade una prueba negativa que impide volver a paralelizar ambos jobs.

No se cambia el validador, el consentimiento de coste, los permisos, los
requisitos del modelo, ni se realizan llamadas a proveedores ni fusiones.

## Pendiente de acreditar
Un nuevo `workflow_dispatch` manual sobre el SHA nuevo, con dos clics de
autorización separados. No reutilizar este run porque exige `run_attempt=1`.
Solo un recibo Pi real con pruebas T07 permite aceptar el ensayo parcial,
y no equivale a haber validado la TUI Pi interactiva. `globalFull:false`.
