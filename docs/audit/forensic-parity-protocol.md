# Forensic parity audit protocol

Phase 10 is not complete when a feature list looks similar. It is complete only when the observable behavior of the audited upstream baselines has been decomposed, classified and evidenced.

## Audit units

For each upstream repository inspect, at minimum:

1. production/runtime source files;
2. public commands, extension hooks and APIs;
3. configuration and precedence rules;
4. schemas and protocol contracts;
5. tests and fixtures, including negative/error cases;
6. CI and release gates;
7. migrations and compatibility behavior;
8. Windows/Linux/macOS-specific behavior where present;
9. persistence, crash recovery and idempotency;
10. authorization, consent and destructive-operation boundaries;
11. concurrency, locking and writer ownership;
12. packaging/install/update/uninstall lifecycle;
13. documentation only when it describes an externally observable contract.

## Evidence standard

Every parity record must contain:
- upstream repository and exact SHA;
- upstream source/test paths supporting the behavior;
- observable contract in implementation-independent language;
- ASEN implementation path, if any;
- ASEN automated test/evidence path, if any;
- status: PARITY, PARTIAL, MISSING, or N/A;
- priority and risk;
- reason for any N/A classification.

A production file without tests is not automatically a capability. A test may reveal a capability or edge case absent from documentation. Both directions must be inspected.

## No false parity

PARITY is forbidden when:
- only documentation exists;
- only a similarly named module exists;
- happy-path behavior is tested but upstream has material failure/recovery semantics not covered by ASEN;
- evidence belongs to a different candidate SHA;
- an ASEN test mocks away the behavior being claimed;
- the upstream contract has not been reduced to observable behavior.

## Closure

Phase 10 closes only when:
- all in-scope upstream runtime/test surfaces have been inventoried;
- every discovered observable behavior maps to a parity record;
- duplicate records are normalized;
- all P0 gaps are explicitly queued for implementation;
- an independent second pass finds no unclassified P0 behavior;
- the audit report is bound to exact upstream and ASEN SHAs.
