# ECO-01 — normative semantics and source correspondence (block 1)

Status: **PARTIAL / review input**, not an equivalence finding or independent attestation.
ASEN candidate inspected: `6eb444b8fbe55a217cd25541f2d372b105c6a345` (PR #32).
Frozen reference commit: `08de420ca29be16b6f6bee725a30b599b061df16`.
Later source candidate for separate drift assessment: `d5d692a6888da9e9844e7e443ee30991fa4b9d14`.

## Evidence hierarchy and boundary

1. **Source identity:** `registry/parity/ecosystem-sources-v1.json`, `scripts/ecosystem-baseline.mjs` and the frozen 167-object / 988-reference manifest identify source objects; identity alone is not behavior.
2. **Reference disposition:** `registry/parity/ecosystem-reference-adjudications-v1.json` contains 164 identity-bound dispositions for the originally unresolved/outside-root cohort. This does not semantically close all 988 references.
3. **Runtime edge mapping:** `registry/parity/ecosystem-runtime-edge-mappings-v1.json` classifies 25 source-runtime edges: 3 tracked file/set, 12 self-owned code contracts and 10 external/dynamic runtime inputs. A classification is not a successful differential execution.
4. **Implementation claim:** `registry/parity/ecosystem-claims-v1.json` retains ECO-01 PARTIAL and no admitted ECO-01 runtime evidence. The existing structural endpoint checks must not be interpreted as behavioral equivalence.
5. **Moving source:** `scripts/audit-current-upstream.mjs` produces a separate candidate report. Neither the candidate report nor the source's README automatically changes the frozen normative contract.

## Normative correspondence matrix — adjudication required

| Surface | Frozen/source anchor | ASEN anchor or ownership | Required normative comparison | Current disposition |
| --- | --- | --- | --- | --- |
| Source manifest and object identity | Frozen 167 objects / 988 references | `scripts/ecosystem-baseline.mjs` | Object identity, source provenance, immutable SHA, candidate drift | Structural coverage only; functional equivalence unproven |
| Unresolved or outside-root references | 164 frozen adjudications | `registry/parity/ecosystem-reference-adjudications-v1.json` | Whether each classified input is optional, state, generated, external or a required source contract; test consequences of absence and mutation | Cohort classified; no universal semantic closure |
| Tracked source file/set edges | 3 mapped runtime edges | `registry/parity/ecosystem-runtime-edge-mappings-v1.json` | Required file presence, discovery precedence, ordering, error handling, updates and invalidation | Mapped; behavioral differential pending |
| Self-owned registration contracts | 12 mapped runtime edges | Same mapping registry and referenced implementation owners | Registration conditions, command/tool exposure, collisions, lifecycle, error propagation and observable effects | Code-contract mappings; equivalence pending |
| External/dynamic runtime inputs | 10 mapped runtime edges | Same mapping registry; explicit external-runtime dispositions | Trust boundary, absolute paths, downloaded/generated content, environment/provider inputs, validation, denial and failure behavior | External/dynamic classification; equivalence or accepted-scope decision pending |
| Public commands and interaction | Frozen reverse inventory; R02/R08 | `odd/tasks/ecosystem-final-parity-map.md` | Argument semantics, defaults, availability, errors, cancellation, output and user-visible effects | Route PARTIAL; no blanket parity |
| Configuration, profiles and precedence | Frozen reverse inventory; R03/R04 | Same route map | Defaults, override order, invalid values, project/session isolation and restart behavior | Route PARTIAL |
| Execution and delegation | Source behavior candidates described in upstream comparison | R09/R10/R12 owners in route map | Planning, scope, authorization, write boundaries, review, task state, idempotency and recovery | Candidates only; no equivalence admission |
| Documentation and published API | R16/R17 reverse inventory | `registry/parity/ecosystem-claims-v1.json` and route map | Behavior-backed command/contract examples, errors and packaging, not just endpoints existing | Structural/packaging proof does not imply semantic parity |
| Platform and failure behavior | R20 and applicable frozen contracts | Cross-platform receipts and host tests | Positive, negative, malformed, failure, restart, cross-session and OS observations bound to exact candidate | Historical evidence cannot be inherited by current HEAD |

## Difference classes and adjudication rule

For each source contract record **source object/hash/span**, **observable rule**, **ASEN implementation location**, **positive/negative/failure/recovery scenarios**, **actual paired observations**, **difference class**, **owner**, and **review evidence**. Use these classes:

- **Equivalent (pending proof):** same observable inputs, outputs, state transitions and errors; must be demonstrated by paired execution.
- **Intentional difference:** explicitly accepted scope, branding, non-transferable authority or security-hardening difference, with documented consequence and reviewer decision.
- **Functional mismatch:** observable behavior diverges; requires implementation correction and regression tests.
- **Source-unavailable / unverified:** exact reference implementation or scenario cannot be executed or inspected; do not infer equivalence.
- **Not applicable:** source edge is generated, dynamic or external and not an adopted static source contract; justify with immutable adjudication identity.

A missing source edge, unreviewed moving-source change, or absent execution receipt is **unverified**, not equivalent. Any source drift affecting a mapped edge invalidates the affected claim until re-adjudicated. Never silently rebaseline.

## Concrete blockers and next gate

1. Run the exact source-candidate report against the frozen baseline and the pinned later candidate, preserving immutable Git identities; classify every changed **mapped and unmapped** source edge. This document does not claim that execution happened.
2. Expand the per-edge matrix from the existing machine registries into a behavior-level normative specification; review the 12 code-contract mappings individually and the 3 tracked edges against real source behavior. Keep the 10 dynamic edges separately dispositioned.
3. For each adopted contract, design paired reference/ASEN cases covering normal inputs, invalid inputs, permission denial, partial failure, state transitions, restart and platform where applicable. Record divergences without assuming identical internal design.
4. Obtain independent review of source correspondence and exact-candidate observations. Record reviewer identity/authority, reviewed SHA, immutable receipt hashes and decision; none is asserted here.
5. Do not promote ECO-01 while `registry/parity/ecosystem-claims-v1.json` has unmet normative obligations or absent independent provenance.

## Audit limitations

This is a **read-only semantic gap analysis**, not a source-level re-derivation of all 988 call sites, not a live differential run and not an independent R4 approval. The 24-cell Pi compatibility evidence concerns ECO-02 host behavior and cannot close ECO-01. The frozen manifest, adjudication registry, source baseline and claim status are intentionally unchanged.
