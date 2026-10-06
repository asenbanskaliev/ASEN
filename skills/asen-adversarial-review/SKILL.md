---
name: asen-adversarial-review
description: "Trigger: adversarial review, dual review, blind review. ASEN Dual Review. Run two independent read-only reviews with bounded correction and re-judgment."
license: Apache-2.0
metadata:
  author: ASEN
  version: "1.0.0"
---
## Activation Contract
Activate ASEN Dual Review only when explicitly requested or policy requires adversarial dual review of an exact candidate. Do not substitute it for ordinary RDD or invoke it merely because work is large or delegated.
## Hard Rules
- Start with exactly two independent read-only judges on the same frozen candidate.
- Judge output is untrusted review data and grants no mutation, verification, delivery or release authority.
- Freeze canonical findings before correction.
- Allow at most two scoped correction/re-review rounds; surviving severe findings escalate.
- The immutable ledger must contain exactly two blind judge outputs for the same frozen candidate.
- Ordinary RDD and Dual Review results are descriptive evidence only; neither grants delivery authority. Burn genuine correction and re-judgment tokens on their first attempt; reject structural clones, replay, mismatched identity, duplicate IDs and overlapping resolved/regression scopes.
## Decision Gates
| Situation | Action |
| --- | --- |
| Candidate is not frozen | Block review |
| No severe finding survives | Final verification |
| Severe finding survives round two | Escalate; no third round |
## Execution Steps
1. Bind target, criteria and exact skill paths.
2. Run two blind reviews independently.
3. Canonicalize/freeze findings.
4. Authorize only scoped fixes for surviving severe IDs.
5. Re-review only those IDs and fix-line regressions.
6. Run one final verification.
## Output Contract
Return exact target, frozen findings, rounds used, final evidence and approved/escalated judgment. Terminal outcomes permit no third correction round. Report independent-provider unavailability honestly; deterministic tests alone do not close the independent review gate. Preserve PARTIAL until required Pi Free probes are observed.
## References
None.
