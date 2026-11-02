# Development setup

This page describes how to run ASEN from a clean development checkout. It does not enable public installation; `asen setup` remains preview-only.

## Prerequisites

- Git.
- Node.js `>=22.19.0`.
- TypeScript checks run with the installed compiler.
- No cloud provider credentials are required for the local development workflow.

## Clone and install

```powershell
git clone https://github.com/asenbanskaliev/ASEN.git
cd ASEN
npm ci
```

## Verify the checkout

```powershell
npm run typecheck
npm run check:fast
npm run build
node dist/cli.js --version
```

## Run ASEN with an isolated development home

```powershell
$devHome = "C:\Temp\asen-dev"
if (Test-Path $devHome) { Remove-Item $devHome -Recurse -Force }
New-Item $devHome -ItemType Directory -Force | Out-Null
$env:USERPROFILE = $devHome
node dist/cli.js --home $devHome doctor
```

The `doctor` report is metadata-only. It does not prove runtime readiness, publisher authenticity, or activation.

Full setup, upgrade, activation and unmanaged installation are documented separately in [installation and managed execution](installation.md).

## Run tests

Focused tests:

```powershell
npm run check:fast
```

Local validation used for the current candidate:

```powershell
npm run typecheck
npm run build
node --import tsx --test tests/extension-runtime-commands.test.ts
node --import tsx --test tests/docs-surfaces.test.ts
git diff --check
```

The full suite and package verification are available, but should only be used before a consolidated candidate:

```powershell
npm test
npm run verify:pack
```

Known local test environment caveat:

- two `tests/setup.test.ts` checks may fail on unprivileged Windows because POSIX symlinks cannot be created.
- Those are environment limitations, not ASEN defects. Do not alter those tests to force PASS.

## Optional ECO-12 history shortcut

History selection is available through `/asen-history select`. To register a host shortcut without changing ASEN defaults:

```powershell
$env:ASEN_HISTORY_SHORTCUT = "ctrl+h"
node dist/cli.js --home $devHome doctor
```

No default shortcut is registered unless this option is explicitly provided.
PY