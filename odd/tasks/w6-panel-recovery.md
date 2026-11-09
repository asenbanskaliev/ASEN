# W6 panel recovery

## Scope

Recover only ordinary, demonstrable panel behavior from W6. Resume activation and P3/M5 are excluded. This work does not change `globalFull:false` or claim UI acceptance.

## Delivered

- REVIEW derives a read-only count from the observed Todo snapshot: `succeeded` results and only `blocked` results whose reason is exactly `Linked review result requires explicit user acceptance` count as awaiting review. Missing Todo observation stays `unverified`. It creates no request, candidate, acknowledgement, consent, or human-read assertion.
- Overview limits remain 12 Todos and 8 Jobs/Agents. A selected native-panel section exposes a bounded detail view of up to 100 items and reports overflow.
- Existing command-catalog coverage already proves advertised implemented commands are registered; no duplicate registry was created.

## Evidence

- `npm run typecheck`: PASS.
- `node --import tsx --test tests/native-work-panel.test.ts tests/extension-runtime-commands.test.ts tests/ide-panel.test.ts`: 39 pass, 0 fail, 0 skipped.
- Exact-SHA CI after restoring the session handlers: pending; the earlier failing run is invalidated because the source file was accidentally truncated in a GitHub contents update and has since been restored.
