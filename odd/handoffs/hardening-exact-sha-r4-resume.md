# ASEN — Handoff de reanudación hardening exact-SHA R4

## Estado inicial

**PREPARADO, SOLO DOCUMENTACIÓN.** No ejecutar F0-02 ni implementación hasta confirmación posterior del propietario. Fuente global: `AGENTS.md`, `docs/remote-continuation.md`, `odd/tasks/pi-capability-completion.md`; plan específico: `odd/tasks/hardening-exact-sha-r4.md`.

- Repo `asenbanskaliev/ASEN`, rama `feat/t12-integrated-acceptance-merge`.
- SHA antes del único commit de preparación: `dc47d8d9b2ead9423a0a613e5cad6ce6ca5233f1`; obtener **nuevo HEAD** tras publicar docs, no volver a suponer que el anterior es HEAD.
- CI anterior: CI/Release Gate/Phase 0/Pi runtime PASS; jobs especializados T07/T12 SKIPPED; no se han ejecutado tests nuevos ni proveedores en preparación.
- Working tree local y Node/npm/Pi en el host: NO VERIFICADOS, primer trabajo de F0-01.
- Ningún subagente independiente ejecutado en esta preparación; la revisión del código para la matriz fue estática.

## Algoritmo seguro del próximo ejecutor

1. Leer en este orden AGENTS, remote-continuation, ODD canónico, plan hardening y esta hoja.
2. Comprobar confirmación del owner y recoger HEAD remoto/local, árbol limpio, versiones y estado PR.
3. Primera tarea `F0-01` (pending), después primera `pending` con todas dependencias `done|noop`; usar microarchivo con frontmatter como allowlist.
4. Reconciliar SHA del microarchivo con nuevo HEAD documentado (SHA inicial es histórico), no continuar ante deriva de terceros.
5. Aplicar ODD+TDD: defecto → RED causal → mínimo GREEN → regresión; caracterización ya GREEN → NO-OP justificado.
6. A0 único integrador; A1/A2/A3 lectura, A4 escritor con allowlist, A5 revisor independiente separado. Si no disponible, self-audit documentado y gate independiente BLOCKED.
7. `git diff --check`, no archivos fuera de allowlist, no repin ni cambio de authority/Dispatcher/store sin tarea nueva.
8. Un commit por microtarea con cambios de estado, evidencia y handoff; consolidar CI por tandas y validar jobs sobre SHA exacto; no merges, release, proveedor ni cuotas.

## Decisiones congeladas

- F0-02: `tests/provider-scope.test.ts` añade `assert.doesNotMatch(workflow, /==\\s*"[^"]+"/)`; RED antes de corregir solo las comillas en GSP-06, GREEN y actionlint disponible. No cambiar trigger, expected_sha ni ramas permitidas.
- F0-03: test nuevo `tests/ci-specialized-gates.test.ts` caracteriza reglas vigentes y debe GREEN; F0-04 introduce expectativa nueva RED, modifica `ci.yml` y logra GREEN.
- F0-04: añadir rama exacta `feat/t12-integrated-acceptance-merge` en jobs T07 integrado y T12 security/TUI conservando `github.event_name == 'pull_request'` y same-repo; requiere PR real; jamás `startsWith` ni fork.
- F1: cinco regresiones históricas, GREEN esperado; NO-OP si ya cubierto.
- F2: DAG y grants/leases solo pruebas o NO-OP, sin refactor producción.
- F3: seis PARTIAL R4-06/08/10/11/18/20, con archivo test exacto, no duplicar.
- F4: T07 `workflow_dispatch` CLI 3 OS con head_sha y **también** T07 ASEN/Pi integrado; T12 security Ubuntu y TUI 3 OS, más CI general 3 OS.
- F5: typecheck/build/check/check:authority-pin/verify:pack, Phase 0/CI/Release/Pi evidence, auditor independiente y 14 criterios FULL; skipped/waived nunca PASS.

## Campos a actualizar por A0 (en el siguiente commit de microtarea)

| Elemento | Estado |
|---|---|
| Estado global | F0-01 DONE (baseline remoto), F0-02 pendiente de GREEN exacto |
| Próxima microtarea | F0-02, autorización del owner recibida en este turno; GREEN exacto obligatorio |
| SHA original fuente | `dc47d8d9b2ead9423a0a613e5cad6ce6ca5233f1` |
| SHA del commit documental | consultar HEAD remoto inmediatamente después de publicación |
| SHA último ejecutado | a2a4765d1c7a4b577d63b3794bfa2fe7abebcfdc (baseline remoto, sin test local) |
| Tests de implementación ejecutados esta sesión | ninguno |
| Trabajos de proveedor ejecutados | ninguno |
| Editor de `odd/tasks/pi-capability-completion.md` | no autorizado en este plan salvo ampliar allowlist futura |
| Bloqueo | Solo avanzar si tests focalizados GREEN con Node/tsx compatibles y sin archivos fuera de allowlist; aquí no hay checkout ni tsx |

**STOP/BLOCKED**: árbol sucio ajeno, SHA desconocido, RED inesperado, GREEN fallido, cambio de hashes/authority, necesidad de múltiples subsistemas, PR inexistente para gate, cuota/proveedor, merge/release o consentimiento pendiente. Conservar la causa; no convertirlo en PASS o WAIVED.
