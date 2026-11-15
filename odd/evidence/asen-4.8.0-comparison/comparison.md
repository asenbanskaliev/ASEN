# ASEN vs Gentle Shell 4.8.0 — comparación de capturas

Generado por una herramienta temporal (`compare-frames.mjs` bajo el directorio temporal del
host) a partir de dos capturas ANSI reales. **Ninguna cifra de esta tabla está escrita a mano.**

## Método

| Condición | Valor (idéntico en ambos lados) |
|---|---|
| Terminal | ConPTY real (Windows) vía `node-pty@1.1.0` |
| Geometría | `120x40` |
| `TERM` | `xterm-256color` |
| Home | aislado por ejecución (sin credenciales del usuario) |
| Duración | 45 s por lado, salida por `Ctrl+C` |
| ASEN | `node dist/cli.js` tras `npm run build` |
| Referencia | `C:\gentle-shell` @ `3dc902975` (tag `v4.8.0`) |

## Comparación

| Métrica | ASEN | Gentle Shell 4.8.0 |
|---|---|---|
| Raw capture bytes | 6122 | 17958 |
| Visible lines | 50 | 148 |
| Pi version rendered | v1.2.0 | v1.5.2 |
| Panels/sections rendered | Context, Skills, Extensions | Panel, Skills, Prompts, Extensions |
| Skills listed | 27 | 17 |
| Extensions listed | 1 | 32 |
| Status fields unresolved ('?') | responding, ctx, cost/sub | none |

## Estado observado

**ASEN**
`ASEN │ feat/t12-integrated-acceptance-merge ±23 │ selected unknown/unknown · off │ responding ? │ ctx ? │ cost/sub ?     ASEN: Listo para empezar ASEN skill reg`
- ripgrep installed to C:\Users\asenb\AppData\Local\Temp\pty-home-HxWvee\.asen\agent\bin\rg.exe ASEN skill registry startu
- Warning: No models available. Use /login to log into a provider via OAuth or API key. See:
- Update Available

**Gentle Shell 4.8.0**
`✿ C:\gentle-shell  C:\gentle-shell │ detached             unknown · current │ ctx ▱▱▱▱▱▱▱▱ ?% │ $0.000 │ usage · alt+u`
- WARNING: installing with --scope=global (default). Agent config files (system prompts, skills/, agents/, etc.)
- gentle-ai: engram stop: WARNING: 1 engram process(es) could not be stopped (access denied or still running). The upgrade
- Verification checks: 3 passed, 0 failed, 0 warnings, 0 skipped
- Permissions: NORMAL
- Warning: No models available. Use /login to log into a provider via OAuth or API key. See:
- Warning: No models available. Use /login to log into a provider via OAuth or API key. See:
- Warning: No models available. Use /login to log into a provider via OAuth or API key. See:

## Lectura honesta

1. El arranque `CLI → Pi → TUI` de ASEN **funciona** en Windows: la TUI renderiza.
2. La equivalencia **NO** está demostrada: la referencia corre Pi v1.5.2 y ASEN Pi v1.2.0,
   y ASEN deja campos de estado sin resolver.
3. Las diferencias observadas pertenecen a **dos runtimes base distintos** (Pi 1.2.0 vs 1.5.2);
   atribuirlas a ASEN sin igualar la versión de Pi sería una medición inválida.
4. Ninguna de las dos capturas incluye una generación de modelo: no hay evidencia de
   comportamiento con proveedor.
