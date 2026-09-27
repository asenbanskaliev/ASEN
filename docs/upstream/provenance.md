# Upstream Provenance

ASEN uses external projects as architectural and behavioral references. Phase 0 records exact audited commits so future comparisons are reproducible.

| Upstream | Audited commit | Role |
| --- | --- | --- |
| Gentleman-Programming/gentle-shell | fe61793e7cb3e75462ba53c7631e87d78e989354 | Pi-native harness/workflow reference |
| Gentleman-Programming/gentle-ai | a9e36e9b8a4d7885244466cd9ea6cc3ad330a69b | lifecycle/provisioning/review reference |
| Gentleman-Programming/engram | 618e30f68f0f2e3b736df91fcfbaaad279ccd3d2 | persistent memory reference |

No upstream source file is copied by default. If code is ever reused, that change must record source path, source commit, applicable license, retained notices, modifications, and dependency implications.

Radar observations are informational. They cannot mutate ASEN or authorize adoption automatically.
