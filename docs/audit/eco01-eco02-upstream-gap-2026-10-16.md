# ECO-01 / ECO-02 — comparison with current upstream source

Date: 2026-10-16. This is a **comparison and implementation backlog**, not a parity admission or an independent review.

## Immutable comparison inputs

- ASEN PR #32 source HEAD inspected: `a07f4bd043e6223da325a2b94a628f978e05e243`.
- upstream source `the pinned external reference repository` main HEAD inspected: `d5d692a6888da9e9844e7e443ee30991fa4b9d14`.
- ASEN frozen upstream source baseline: `08de420ca29be16b6f6bee725a30b599b061df16`.
- The frozen 167-object/988-reference manifest and its 164-row unresolved-reference adjudication must **not** be overwritten by a moving upstream HEAD.

## Verified comparison boundaries

1. **ECO-01 is ecosystem source semantics and mapped reference drift**, not merely automatic skill selection. Its current claim remains PARTIAL: the frozen overlay and mapped runtime-edge drift invalidation exist, but normative semantics and FULL evidence have not been admitted.
2. **ECO-02 is Pi host lifecycle and compatibility**. Existing evidence includes 24 Pi-version/mode/OS cells, package receipts and restart/cross-session receipts, but the admitted compatibility contract deliberately allows late foreign duplicate registrations to follow Pi-native precedence. Do not misrepresent this as an arbitrary late registration veto.
3. upstream source main README describes ODD small-task inline execution, scoped explorer/writer/verifier delegation, cross-session coordination, session-bound profiles, background jobs/monitors, and contextual permission modes. These are **upstream behavior candidates**, not proof of equivalent ASEN behavior or a license to expand ECO-01/02 claims silently.

## Reproducible source-candidate audit

Run in a clean local environment with Node >=22.19 and the ASEN dependencies installed. Set `ASEN_ECOSYSTEM_SOURCE_URL` to the vetted source repository URL before running.

```sh
git clone "$ASEN_ECOSYSTEM_SOURCE_URL" /tmp/asen-upstream-source
git -C /tmp/asen-upstream-source fetch origin d5d692a6888da9e9844e7e443ee30991fa4b9d14\ngit -C /tmp/asen-upstream-source fetch origin 08de420ca29be16b6f6bee725a30b599b061df16
git -C /tmp/asen-upstream-source checkout --detach d5d692a6888da9e9844e7e443ee30991fa4b9d14
git -C /tmp/asen-upstream-source cat-file -t 08de420ca29be16b6f6bee725a30b599b061df16
node scripts/audit-current-upstream.mjs d5d692a6888da9e9844e7e443ee30991fa4b9d14 /tmp/asen-upstream-source > /tmp/asen-upstream-source-report.json
npm run audit:ecosystem
```

The report is a separate, read-only candidate assessment. `npm run audit:ecosystem` validates the frozen source and current claims; it does not ingest the candidate report via environment variables. Review and independently re-derive the candidate report before any provenance or status update. The `cat-file` command must return `commit`. If the frozen object is missing, fetch it explicitly from its known upstream origin; never substitute a different baseline. The report is a review input only and must not auto-adopt new source contracts.

## Closure tasks, with explicit gates

### ECO-01
- Run the exact-candidate drift audit above; review each mapped and unmapped changed source edge and adjudicate normative behavior.
- Add focused positive, negative, failure, recovery, restart, cross-session and OS-runtime tests tied to a frozen ASEN candidate.
- Preserve immutable evidence receipts and have an independent reviewer attest to actual execution and source correspondence.

### ECO-02
- Compare current upstream Pi host registration and lifecycle behavior against ASEN's delayed activation and collision preflight.
- Test initial collisions, late sibling duplicates (Pi-native precedence), session isolation and restart on supported Pi versions and Linux/macOS/Windows.
- Keep the published `>=0.85.1 <2.0.0` compatibility range distinct from the finite tested version matrix; do not claim exhaustive range coverage.
- Obtain independent source/host review and a candidate-bound provenance approval before promotion.

## Admission rule

Both rows stay **PARTIAL** until the validator's FULL contract is satisfied: exact tested candidate, no outstanding obligations, exact source drift report, required positive/negative/failure/recovery/platform/host evidence, and a human independent provenance declaration. Do not invent receipts, reviewer identity or approval, and do not mark FULL merely because CI passes.
