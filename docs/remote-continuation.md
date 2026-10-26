# Remote continuation plan

## Checkpoint status

This publication is a **WIP checkpoint, not FULL parity**. Start from base `f2ed915d475408481aeec648cba248a13957e09f` on `feat/strict-parity-prerequisites`, then inspect the exact pushed candidate rather than assuming every local historical receipt is portable.

The remote continuation began from published checkpoint `4a4c7e71a876b83f76c0bbfc0d26163dfa2c1b0f`. The owner now authorizes clean-clone setup, work branches and reviewable PRs against `feat/strict-parity-prerequisites`, without merge/releases, provider credits or installed Gentle/Pi changes. Keep the old quarantined-child incident separate. L474 onward records the new scoped checks; older local-only restrictions describe their historical runs.

The canonical source of truth is the latest log in [`odd/tasks/pi-capability-completion.md`](../odd/tasks/pi-capability-completion.md). The earlier [`resume handoff`](../odd/handoffs/pi-capability-completion-resume.md) is historical context. Keep the tracked [`parity map`](../odd/tasks/ecosystem-final-parity-map.md) and registry/claim files aligned, but do not let an older summary override the canonical log. Cached receipts unavailable in a clean clone are historical claims, not remote approval.

Static local metadata that reported Gentle Shell 4.3.0 and Pi Coding Agent 1.4.0 is neither a complete immutable reference binding nor proof of the versions loaded by a live runtime.

## Clean-clone setup and verification

1. Read `package.json` before setup. It currently requires Node `>=22.19.0`.
2. In a disposable remote environment, use `npm ci` to install the lockfile's supported versions. Do not copy `node_modules`, cached SDKs, local profiles, `.cache`, or `.codegraph` from another machine.
3. Before executing tests, inspect `scripts/run-tests.mjs` and the selected tests for timeouts, child-process cleanup, filesystem effects, and state locations. Give stateful checks isolated project-owned home/config/cache/data/temp roots.
4. Run focused tests for the bounded change first, then `npm run typecheck` and `npm run build`. Before T12, run the broader audits plus applicable package and platform checks defined in `package.json` and the workflow.
5. These commands are instructions only; this document does **not** claim they passed.

GitHub Actions runs on `pull_request` and on pushes to `main`; a push only to this feature branch does not by itself produce a green CI run. The workflow currently uses `npm install` in its main test job and `npm ci` in the Pi support matrix, so review the exact remote results rather than assuming local setup and CI are identical.

## Ordered continuation

### A. Reconcile the remote baseline

Compare the clean clone, pushed diff, canonical latest log, parity map/registry, and available tracked evidence. Preserve historical failures and admissions. Do not promote a capability from file presence, broad tests, or unavailable cache receipts.

### B. Finish T09 maintenance

Advance real update/restore/managed removal/browser/bootstrap/distribution work. Reuse admitted selection, launch, doctor, finite backup, reader, isolated restore-stage, preview, and expected-byte staging pieces. Version rollback is not data restore; a preview is not an executed installation. Keep acquisition, authenticity, activation, live restore, uninstall preservation, clean-machine behavior, and platform proof explicit.

T09-U9d adds explicit local `managed update ... --stage --yes` composition plus a reproduced POSIX directory-link-count correction. Follow its PR evidence and admission state in the canonical Log. This operation stages only already-local declared bytes in an existing owned prefix; it does not download, select or run a version. Remaining T09 lifecycle work precedes T05 → T10 → T11 → T04/T07 required proof → T12 acceptance. The full immutable Gentle4.3.0 reference binding is still missing; no new reference equivalence is inferred from this public operation.

### C. Finish T05 review composition

Complete owned materialization and lifetime, then public candidate/controller/correction/acceptance integration. Preserve admitted A1/A2a1/A2a2 units. Do not treat a writable copy, stale result, model output, or cached verdict as authority. The retained Windows ACL fixture and restoration uncertainty require an ownership-safe disposition before claiming a ready review view.

### D. Finish T10 workspace behavior

Implement bounded units for observed background-job exits, agents, cross-session boundaries, workspace actions/conflicts, notifications, and accessibility. Preserve admitted A3 history projection. A4 agent-status sanitization remains unadmitted because the verifier lifecycle failed/quarantined even though scoped functional evidence and PASS text exist.

### E. Start T11 only from a real mapping

Add client adapters only after mapping an actual reference client and its capabilities. Keep Pi guarantees shared where valid, but do not fabricate identical tools, delegation, permissions, or host behavior across clients.

### F. Resolve T04 and T07 honestly

T04 needs real interrupted-child recovery, restart, retained-edit, and fresh-authority evidence. T07 needs a real disposable-project CodeGraph/offline lifecycle. Mocks, an ancestor/existing index, or launcher presence are insufficient. Preserve prior stopped jobs and failed envelopes; do not retry blindly.

### G. Run T12 last

Bind one exact candidate and run its focused tests, broader audits, package checks, and applicable Windows/platform proof. No parity claim is valid while required implementation or evidence is missing.

## Delivery shape

Use PR-sized units with their tests, docs, and old/new differentials for shared contracts. Mark unavailable capabilities blocked rather than documenting them as complete. No merge, release, destructive maintenance, provider action, or native approval is implied by this checkpoint.

Initial GitHub coding-agent assignment: first reconcile the clean remote baseline and canonical task state; then take the next coherent T09 gap through bounded PRs, beginning with the smallest dependency-ready part of executable managed update/restore/bootstrap work. Do not launch another agent from this document; no remote agent is launched here.
