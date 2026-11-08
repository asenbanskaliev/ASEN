# W6 panel recovery

## Scope

Recover only ordinary, demonstrable panel behavior from W6. Resume activation and P3/M5 are excluded. This work does not change `globalFull:false` or claim UI acceptance.

## Delivered

- REVIEW derives a read-only count from the existing Todo snapshot: only `succeeded` and `blocked` states appear as stored results awaiting review. It creates no request, candidate, acknowledgement, consent, or human-read assertion.
- Overview limits remain 12 Todos and 8 Jobs/Agents. A selected native-panel section exposes a bounded detail view of up to 100 items and reports overflow.
- Existing command-catalog coverage already proves advertised implemented commands are registered; no duplicate registry was created.

## Evidence

- `node --import tsx --test tests/native-work-panel.test.ts tests/extension-runtime-commands.test.ts tests/command-catalog.test.ts`: 26 pass, 0 fail.
- `npm run typecheck`: exit 0.
- Boundary audit: pass.

The standard dependency installation could not compile `node-pty` on this Linux host because its Node-header extraction failed on `fchown`; tests used `npm ci --ignore-scripts`. CI remains the validation target for native dependencies.
