# Development setup

Use a clean checkout and fresh local state. ASEN remains a development candidate; `asen setup` is preview-only, not a public installer.

## Continue work from another computer

Start with the [portable continuation guide](remote-continuation.md). It identifies the canonical ODD files, current blockers, publication prerequisites and exact-checkout instructions. GitHub can only deliver committed, published files—not the previous computer's working tree.

## Prerequisites

- Git and Node.js `>=22.19.0`; the earlier local Node `24.14.0` result does not certify every supported version.
- The tracked `package.json` and `package-lock.json`.
- A filesystem supporting the atomic hard-link operations required by locking. Do not weaken the lock implementation if the filesystem rejects them.
- A compatible native binary or build toolchain for dependencies such as `node-pty`.

No provider credentials, old SDK installation, private sessions, local RefMem database or audit cache are needed to read the ODD files. Install dependencies from the lockfile rather than copying another computer's `node_modules`.

## Clone and install

Follow [clean-clone prerequisites](remote-continuation.md#clean-clone-prerequisites) using the repository URL, branch and published SHA supplied by the owner. Prefer a clone: a ZIP lacks the Git history/index some checks require.

Then follow [portable isolated PowerShell setup](remote-continuation.md#portable-isolated-powershell-setup) in a fresh PowerShell session. That block creates a unique project-local `.cache` root and isolates HOME, USERPROFILE, configuration, cache, data, temporary files and Pi state before `npm ci`. It never deletes an existing development home. These are instructions for a future authorised setup, not commands executed while preparing this handoff.

## Check and build when authorised

From the isolated session, after successful lockfile installation:

```powershell
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed" }
npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }
node dist/cli.js --version
if ($LASTEXITCODE -ne 0) { throw "Version check failed" }
```

Typecheck/build do not close the ODDs or establish native approval. No installation, build or clean-clone verification was performed for the publication-documentation preparation.

## Inspect with the isolated development home

Keep using the same fresh session and `$HomeRoot` created by the portable setup:

```powershell
node dist/cli.js --home $HomeRoot doctor
if ($LASTEXITCODE -ne 0) { throw "Doctor collection failed; inspect its report" }
```

The doctor is metadata-only; even exit 0 does not prove healthy installation, runtime readiness, publisher authenticity or activation. Close the disposable session to discard its environment changes. Preserve older state and fixtures; do not sweep `.cache` or remove a fixed shared directory.

Full installation, upgrade and managed execution are described separately in [installation and managed execution](installation.md).

## Select tests from the active ODD

Do not start `npm test`, `npm run check:fast`, `npm run verify:pack` or release checks merely because this is a new computer. Read the selected task's scope first: the runner inherits the environment, some tests create temporary Git repositories/commits, and existing bounded no-retry stops remain binding. A new checkout does not reset them.

For a newly authorised functional unit, run only its specified focused checks under isolated state and retain the actual result. A missing prerequisite is not PASS. Full-suite/package checks still apply before release, but this handoff is not a release or permission to run them.

Known Windows limitations, including symlink privilege and busy-file behavior, remain evidence gaps; do not rewrite tests merely to force a passing result.

## Optional ECO-12 history shortcut

History selection is available through `/asen-history select`. To opt into a host shortcut, in the same isolated session:

```powershell
$env:ASEN_HISTORY_SHORTCUT = "ctrl+h"
node dist/cli.js --home $HomeRoot doctor
```

No default shortcut is registered unless explicitly configured. Native RDD remains a separate host-supplied executable/transport integration; absent configuration means unavailable, not OFF or approved.
