---
id: "F5-ENV-CLEANUP"
fase: "F5"
prioridad: "P1"
estado: "done"
depends_on: ["F5-01","F5-02"]
sha_base: "3243b6df80c25d9ae868c322683fd5447d113867"
archivos_editables: ["scripts/verify-pack.mjs","tests/review-view.test.ts","odd/tasks/hardening-exact-sha-r4/F5-ENV-CLEANUP.md"]
archivos_prohibidos: ["extensions/authority.ts","src/agents/*","package.json","package-lock.json"]
red_command: "node --import tsx --test tests/review-view.test.ts"
green_command: "npm run verify:pack && node --import tsx --test tests/review-view.test.ts && npm run typecheck"
regression_commands: ["node --import tsx --test tests/review-view.test.ts","npm run verify:pack"]
go_criteria: "Bloqueos ambientales reproducibles resueltos o documentados sin debilitar assertions de propiedad o permisos de autoridad."
horas_estimadas: 0.50
commit_message: "test(tooling): resolve local Windows cleanup and npm 12 pack metadata compatibility"
resultado: "DONE local: review-view EPERM resuelto temporalmente vía icacls durante tampering; verify:pack PASS con 392 archivos. La suite completa quedó fallida solo por otro EPERM ambiental de symlink en tests/setup.test.ts, sin defecto de producción demostrado."
---

# F5-ENV-CLEANUP — Resolver bloqueos locales de F5 (higiene de entorno Windows)

## Resultado
- `npm run typecheck`: PASS.
- `node --import tsx --test tests/review-view.test.ts`: PASS (11 tests, 4 SKIP por fixture POSIX no aplicable en Windows).
- `npm run verify:pack`: PASS (`asen-0.1.0.tgz`, 392 archivos, `packedInstallVerified:true`).
- `npm test`: FAIL por un único fallo ambiental de `tests/setup.test.ts` (creación de symlink con `EPERM` en Windows, sin privilegio disponible). Los cambios locales no afectan ese path ni la protección de archivos sensibles.