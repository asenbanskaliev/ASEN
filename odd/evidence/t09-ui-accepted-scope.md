# Accepted maintenance UI scope
R16 documentary reconciliation for UI-12 only; base `68fe5ca33cb885f8b687846273c2c9935f767919`.
This evidence does not execute maintenance, close aggregate T09 or authorize actions.

## Normative disposition

| State | Scope | Source |
|---|---|---|
| Accepted | Managed install/upgrade/rollback/uninstall, doctor, backup/verify/restore, signed local or HTTPS acquisition, integrity rejection, SQLite recovery, data preservation, browser-consent callback and platform diagnostics | `docs/t09-autopilot-closure-plan.md:15-39` |
| Accepted | HTTPS acquisition remains in scope; it is not a transport exclusion | `src/runtime/managed-lifecycle.ts:29-31,94-110` |
| Excluded from bounded closure | Actual OS browser opening; retain consent/cancel/callback truth only | `docs/t09-autopilot-closure-plan.md:15-21`; `src/runtime/lifecycle-cli.ts:131-140` |
| Excluded from bounded closure | Inherited host advisory and global pinned-reference parity | Canonical coordinator scope and `docs/t09-autopilot-closure-plan.md` |
| Not granted by UI projection | Release keys/signing/publication, live installation, dependency updates, provider/global configuration changes | `src/runtime/lifecycle-cli.ts:70-90` |
| Residual limitation | Continuous hostile same-user path replacement is not an atomic confinement guarantee | Canonical capability log; no stronger claim may be displayed |
| Unresolved reference mapping | Legacy Windows manifest and reference launcher semantics lack an evidenced ASEN owner API | Canonical UI-12 requirement linked by `odd/tasks/shell-rea-megabatch.md` |

## Reuse inventory

| Purpose | Existing owner | Boundary |
|---|---|---|
| Installation diagnostics | `src/runtime/installation-doctor.ts:144-166`, composeInstallationDoctor | Read reports; do not infer install consent. |
| Owned/absent/foreign install metadata | `src/runtime/managed-install.ts:599-610`, inspectManagedInstall | Existing ownership boundary remains authoritative. |
| Update preview | `src/runtime/managed-update-preview.ts:20-39,100-118` | executable=false, authorized=false; no staging, selection or activation. |
| Component pin truth | `scripts/pi-support-matrix.mjs:22-38` | Host anchors are 1.2.0, not inferred from transitive packages. |
| Backup verification | `src/runtime/home-backup.ts:215-260`, verifyHomeBackup | Verification is separate from restore/install authority. |
| Public lifecycle dispatcher | `src/runtime/lifecycle-cli.ts:51-149`, runLifecycleCommand | Existing command/consent contract, not a new action API. |

## R20 gates

- R16 is complete as accepted-scope reconciliation; Profiles is unrelated and depends only on Agents and Status.
- Full UI-12 admission remains blocked on canonical FREF/paired source evidence, legacy behavior mapping and accepted T09 reconciliation; readiness currently has no paired C01-C20 executions (40 slots, not the historical 60).
- T09-WIN-04 is still textually open in the canonical log despite later general receipts; reconcile candidate-bound evidence rather than silently checking it off.
- Maintenance actions require their own exact live authorization. Status rendering cannot grant authority, run an installer or mutate stored data.
- A bounded status-only ASEN slice can reuse existing reports when independently admitted, but cannot be promoted to canonical UI-12 FULL.
- Focused existing test families include tests/installation-doctor-cli.test.ts, tests/installation-doctor-root-change.test.ts, tests/managed-update-preview-cli.test.ts, tests/managed-acquisition-update.test.ts, tests/t09-lifecycle.test.ts and tests/pi-support-matrix.test.ts. Any new maintenance-panel test belongs to a future scoped assignment.

## Evidence limits

No maintenance command, test, network acquisition, provider action, configuration change or installation executed in this reconciliation. Green base-SHA CI/Release Gate receipts are historical and do not certify a future UI/action change. Aggregate T09, source parity and FULL counters are unchanged.
