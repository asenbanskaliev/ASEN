# Upstream Independence

Gentle Shell, Gentle AI and Engram are upstream references used to learn observable engineering guarantees.

ASEN must continue operating if those repositories disappear.

Forbidden runtime dependency classes:
- gentle-pi / Gentle Shell runtime imports
- gentle-ai runtime invocation as required authority
- Engram as mandatory persistence engine

Permitted:
- documented attribution and provenance
- behavioral comparison tests
- optional adapters behind ASEN-owned interfaces
- Radar reading public upstream metadata
- independently implemented behavior

Upstream changes are never copied or adopted automatically. Radar detects; Registry maps; a human/engineering decision authorizes implementation.


## Enforced boundary

External names and provenance are permitted only on research/control-plane surfaces such as `registry/upstream/`, `registry/parity/`, audit records and provenance documentation. They exist so Radar can detect future upstream changes and the Registry can compare them with ASEN capabilities.

They are forbidden from ASEN product surfaces: `src/`, `skills/`, `extensions/`, `package.json`, and the corresponding runtime/package contents. CI and package verification fail closed when a forbidden external reference crosses that boundary.

Detection never authorizes adoption. A detected delta must be normalized into an ASEN-owned capability, contract, test and, where appropriate, Pi-native skill before it can affect product behavior.
