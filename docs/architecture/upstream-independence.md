# Upstream Independence

Reference A, Reference B and Reference C are upstream references used to learn observable engineering guarantees.

ASEN must continue operating if those repositories disappear.

Forbidden runtime dependency classes:
- external-pi / Reference A runtime imports
- reference-b runtime invocation as required authority
- Reference C as mandatory persistence engine

Permitted:
- documented attribution and provenance
- behavioral comparison tests
- optional adapters behind ASEN-owned interfaces
- Radar reading public upstream metadata
- independently implemented behavior

Upstream changes are never copied or adopted automatically. Radar detects; Registry maps; a human/engineering decision authorizes implementation.


## Enforced boundary

The tracked tree uses opaque reference labels and retains audited hashes. Repository names, URLs and identifiers of the source projects are excluded from tracked paths and content. The full-tree CI audit and package verification enforce this boundary. Automated source monitoring needs separate configuration outside this tree.

Detection never authorizes adoption. A detected delta must be normalized into an ASEN-owned capability, contract, test and, where appropriate, Pi-native skill before it can affect product behavior.
