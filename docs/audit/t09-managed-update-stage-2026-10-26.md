# T09-U9d: confirmed local update staging

Status: **PARTIAL, draft delivery; no task completion or full parity claim.**

Base: `4a4c7e71a876b83f76c0bbfc0d26163dfa2c1b0f`, verified against the remote base branch before modification. Work branch: `feat/t09-managed-update-stage`; PR target: `feat/strict-parity-prerequisites`. Canonical requirements and decisions: S2/S4/S9/S12/S14 and L474–L477 in [the capability plan](../../odd/tasks/pi-capability-completion.md).

## Result and boundaries

The checkpoint exposed update observation but no public staging operation. The additive command is:

```text
asen [--link|--isolated|--home PATH] managed update --manifest <absolute-json> --package-root <absolute-dir> --stage --yes
```

It composes the existing fresh-preview/expected-byte staging API in an existing owned installation. It protects the resolved data home and default ASEN/Pi data homes, preserves selected versions and personal data, and reports actual publication/catalog uncertainty. It performs no download, publisher authentication, package execution, selection or activation. The old preview parser remains observation-only. Backend formats, lock ownership, catalog publication and file-byte ownership rules are reused.

New Linux proof exposed a checkpoint defect: creating a nested directory increments its POSIX parent's link count. Both forward-copy validation and cleanup treated that mutable count as directory identity, rejecting normal nested staging/cleanup. The correction uses exact bigint device/inode, canonical path, directory kind and mode. File single-link/hash checks remain; cleanup still uses nonrecursive `rmdir` on claimed empty directories. Tests preserve replacements, unknown children, foreign bytes, partial unproven writes and large-ID distinctions.

An independent reviewer found a medium candidate defect: failure to emit stdout after committed staging was mislabeled preflight refusal. A causal test reproduces it; the corrected CLI emits successful output outside the operational catch. The original output error propagates without retry, compensation or changing selected/published state.

## Executed verification

Environment: clean clone, Node24.22.1, npm11.9.0, tracked lockfile (Pi1.2.0, tsx4.23.15, TypeScript5.9.3, node-pty1.1.0). No copied SDK or dependency cache. First `npm ci` failed on node-gyp header extraction (`fchown: EINVAL`). Fresh official Node headers were extracted into the disposable project environment with Python's data filter; `npm ci` with `npm_config_nodedir` then installed124packages successfully. Neither package manifest nor lockfile changed.

| Check | Actual result |
| --- | --- |
| Public staging tests against checkpoint | RED:28fail, route unavailable |
| Existing shared CLI baseline, five files | 129PASS,0skip |
| Existing backend tests before directory correction | 19PASS/12fail; unchanged checkpoint copier |
| Direct nested/sibling copy before correction | RED:1fail, destination ancestor changed |
| Initial composed candidate | 25PASS/3fail; POSIX staging blocker exposed |
| First directory correction plus CLI/backend tests | 60PASS,0skip |
| Expanded focused checks before review correction | 192PASS,0skip |
| Independent stdout reproduction / parent causal test | Misclassification reproduced; parent RED1fail |
| **Final focused checks, nine files** | **193PASS,0fail,0skip; exit0** |
| **Final `npm run typecheck` / `npm run build`** | **exit0 / exit0** |
| Exact checkpoint/candidate CLI differential | 15comparisonsPASS; only one exact added help line normalized |
| Compiled `node dist/cli.js --help` | exit0 |
| `npm pack --ignore-scripts --json` and archive inspection | exit0;327entries, seven compiled/source entries byte-matched; no installation/publication |
| `npm run audit:upstream-boundary` | **exit1; same11paths on clean checkpoint and candidate** |

The first differential harness used unsupported `--home PATH home`, so baseline/candidate resolved different bundled-runtime availability. A real bundled CLI in the isolated fixture refused missing credentials and exited without a model call. The failed receipt is preserved; the corrected harness uses setup preview with an explicit package root and fake Pi argument-recording fixtures. No provider credentials, credits or personal configuration were used. That harness failure is not presented as a product regression.

The [evidence folder](evidence/t09-u9d-2026-10-26/) includes [all command metadata and hashes](evidence/t09-u9d-2026-10-26/checks.json), raw RED streams, final focused output, the independent reproduction, the exact differential/harness and both audit failure streams. Empty/small compiler/build streams are embedded in the metadata; other intermediate streams have their byte lengths, SHA256 and actual outcomes recorded. Final source/test/dependency hashes bind the corrected candidate. Absolute paths in raw receipts identify disposable fixtures; they are not required installation paths. No prior-machine cache receipt is used as approval.

The staged-tree upstream audit was checked again after adding evidence and still reports the same11paths. `git diff --cached --check` flags whitespace in the verbatim Node RED output; source/documentation hygiene passes when the raw evidence directory is excluded. Raw executed output is intentionally preserved rather than rewritten to satisfy a whitespace check.

### Reproduce the focused proof

After `npm ci` in a clean checkout, create isolated roots and use the saved credential-free runner:

```bash
mkdir -p .cache/remote-t09/environment/{home,config,cache,data,tmp}
python docs/audit/evidence/t09-u9d-2026-10-26/run-check.py focused-reproduction \
  node --import tsx --test --test-concurrency=1 \
  tests/launcher.test.ts tests/managed-update-preview-cli.test.ts \
  tests/managed-catalog-selection-cli.test.ts tests/installation-doctor-cli.test.ts \
  tests/project-memory-backup-preview-cli.test.ts tests/managed-acquisition-copy.test.ts \
  tests/managed-update-stage-cli.test.ts tests/managed-acquisition-update.test.ts \
  tests/managed-additional-stage.test.ts
python docs/audit/evidence/t09-u9d-2026-10-26/run-check.py types-reproduction npm run typecheck
python docs/audit/evidence/t09-u9d-2026-10-26/run-check.py build-reproduction npm run build
```

The runner passes an explicit environment without provider keys and uses a180-second subprocess budget. Read-only baseline comparison can be reconstructed with a detached worktree at the recorded checkpoint in `.cache/remote-t09/audit-baseline`, then copy the saved differential harness to `.cache/remote-t09/cli-differential.ts`. Keep all receipts and do not silently reinterpret a timeout or failure as success. These reproduction commands are instructions, not extra claimed executions.

## Independent review and remaining blockers

Independent reviewer `t09_independent_review` returned bounded PASS after the stdout correction, with no severe candidate finding outstanding. It inspected real receipts and source/test/dependency hashes without repeating passed suites. This is code review, not native/human approval or permission to merge. Reviewed CLI SHA256: `793b9848446df9f61caf3da4925f3a9b86ee9276bf5b882a5685fa3e52163447`.

The inherited upstream audit conflicts with references already tracked in the checkpoint. Its allowlist and existing security code were not changed. This remains a repository acceptance blocker; U9d is unchecked and the PR is a draft. Full suite, other broad audits, remote CI, Windows/macOS, installed-host maintenance, remote acquisition/authenticity/activation and immutable reference comparison are unproved. Registry statuses and reference pins stay unchanged. Continue remaining T09 work before T05 → T10 → T11 → required T04/T07 proof → T12; the old quarantined-child incident is untouched.
