# ECO-02A FULL-5 non-promoting checkpoint

## Outcome

This checkpoint reconciles current evidence without admitting a claim. R16, R18, and R20 remain `PARTIAL`, and the ecosystem registry remains 16 `PARTIAL` / 0 `FULL`. No registry file changed.

This is passive evidence documentation. There is no meaningful behavioral RED because the unit changes no runtime, validator, workflow, test, package, or registry behavior. Structural readback, focused evidence tests, claims validation, and diff hygiene are the proportionate checks.

## Identities and evidence status

| Identity | Observed role | Current disposition |
| --- | --- | --- |
| `08de420ca29be16b6f6bee725a30b599b061df16` | Frozen Reference A source | Still the pinned source baseline. |
| `fb26e5ae0092cfbebeeec115614db0b401f15871` | Historical exact candidate | Its FULL-3/FULL-4 matrix and receipt results remain valid for this exact commit only. It is not current HEAD admission. |
| `cea70e3d2dcf7af416d8c9c58d83990a416f4475` | Newer exact evidence candidate | Bundle records 24 cells, 24 receipts, consistency `PASS`, and stateful evidence `CONSISTENT`. Closeout remains `PARTIAL`, native review is `UNAVAILABLE_NOT_APPROVED`, and `claimsPromotion` is false. |
| `be8a652c4e7c70392541592f5c5fff3132dc23d9` | HEAD observed during U1 reconciliation | Neither earlier candidate has an admissible evidence-only path to this HEAD. |
| Pending parent commit | U1 work-unit identity | No hash is predicted or invented; the parent owns the commit. |

The `cea70e3` closeout retains two gates:

1. Independent exact-candidate native review with authentic approval or acknowledgement.
2. Final authorized admission of only the supported compatibility contract, without extrapolation to every version or live-model recovery.

## Observed candidate-to-HEAD paths

The exact command `git diff --name-only fb26e5ae0092cfbebeeec115614db0b401f15871..be8a652c4e7c70392541592f5c5fff3132dc23d9` showed:

- audit evidence and audit documentation;
- `odd/tasks/ecosystem-strict-parity.md` task tracking;
- `tests/plan-dispatcher-role-boundaries.test.ts`; and
- additional runtime audit documentation.

Therefore `fb26e5a..be8a652` is not an evidence-only overlay. The exact-candidate FULL-3/FULL-4 results remain historical evidence for `fb26e5a`, but cannot admit `be8a652`.

The exact command `git diff --name-only cea70e3d2dcf7af416d8c9c58d83990a416f4475..be8a652c4e7c70392541592f5c5fff3132dc23d9` showed broad changes across:

- source under `src/` and `extensions/`;
- workflows under `.github/workflows/`;
- scripts and tests;
- task and audit documentation; and
- parity and evidence registry files.

Therefore `cea70e3..be8a652` is also not an evidence-only overlay. The presence of evidence files does not erase the source, workflow, or test changes in that range.

## Overlay and drift boundaries

`scripts/validate-ecosystem-claims.mjs` allows post-candidate changes only at these surfaces:

- `registry/parity/ecosystem-claims-v1.json`; and
- JSON files matching `registry/evidence/ecosystem/*.json`.

The validator requires a non-empty, unique path list and rejects every other post-candidate path. Both observed ranges contain rejected paths, so neither can admit a `FULL` claim at observed HEAD. This does not invalidate evidence that was valid for an exact historical commit.

`registry/evidence/ecosystem/cea70e3-pinned-source-drift.json` compares baseline commit `08de420c...` to candidate commit `08de420c...`: the pinned source is compared with itself. Its empty change set is internally consistent, but it does not fetch, compare, or otherwise inspect newer upstream source. It cannot establish that newer upstream has no drift.

## Scope boundaries

This work unit:

- records existing identities and observed path facts;
- reconciles the historical `fb26e5a` evidence with the newer `cea70e3` evidence;
- leaves R16, R18, R20, and all 16 claims `PARTIAL`; and
- changes documentation only.

It does not:

- mutate registry JSON;
- change source, tests, workflows, scripts, or packages;
- run a provider or model;
- perform native review or fabricate approval;
- create an evidence-only overlay;
- push, merge, release, or mutate a pull request; or
- promote any ecosystem claim.

## Remaining gates

1. Complete U2 by confirming fail-closed overlay admission against the stable candidate path set; mutate validator/tests only if a concrete bypass is reproduced.
2. Select a stable final source candidate and obtain fresh exact-SHA hosted evidence.
3. Obtain independent artifact provenance review and authentic native/human approval.
4. Reconcile actual newer-upstream drift rather than relying on pinned-source-to-itself comparison.
5. Admit U3 only when the candidate's descendants contain exclusively validator-allowed claim/evidence metadata.

U2 and U3 remain incomplete. Model-free package restart and cross-session receipts must remain scoped to that behavior; they do not prove live-model interruption recovery.

## Verification and rollback

Required verification for this passive unit is diff-name review, diff hygiene, the focused ecosystem claims/evidence/package-receipt tests, claims validation, and final structural readback. U1 may be marked complete only after those checks pass.

Rollback is documentation-only: revert this audit note and the matching checkpoint/handoff paragraphs in `odd/tasks/ecosystem-strict-parity.md` and `odd/tasks/ecosystem-final-parity-map.md`. Registry, source, workflow, test, and package state require no rollback because this unit does not change them.
