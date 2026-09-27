# PR 30: Skills and harness audit status

Candidate evidence must be evaluated against the exact PR HEAD. A green workflow alone does not close CAP-SKL-001, which remains `specified`.

| Requirement | Current evidence | Remaining proof |
| --- | --- | --- |
| Skill selection and exact routes | `tests/skill-registry.test.ts`, `tests/orchestrator.test.ts`, `tests/dispatcher.test.ts`; dispatcher compares the full ordered path list | Show Pi actually loads each selected document in an authenticated turn and reject omission at the Pi boundary |
| Agent authority | `tests/orchestrator-dispatcher-integration.test.ts` exercises worker evidence and a swapped read role; only workers receive write grants | Enforce task identity for read roles and process-level isolation; verify worker cannot redelegate |
| Lifecycle | `tests/state-machine.test.ts` guards coarse states; `tests/skill-lifecycle.test.ts` executes all nine Skills phases through the dispatcher, checks ordered mandatory artifacts, interrupts after tasks, resumes and archives | Connect phase completion to authenticated Pi output and independently verified evidence, including TDD and review before verify/archive |
| TDD and evidence | `tests/evidence-tdd.test.ts`, `tests/repository-bound-evidence.test.ts`, `tests/skill-evidence-gate.test.ts` | Prove RED/GREEN/refactor with executed commands on the same candidate; prevent fabricated pass records from serving as execution evidence |
| Recovery | `tests/pi-session-recovery-e2e.test.ts` uses native Pi session file and RPC identity across processes; lifecycle snapshot is signed with a caller-supplied 32-byte secret and rejects tampering, task, repository and revision drift | Provision and retain the signing key securely, persist verified evidence separately, reissue authority after recovery and continue an actual model turn after restart. A deserialized issued context loses its in-memory issuance mark |
| Pi integration | `tests/pi-process-runner.test.ts` checks prompt text using a fixture RPC process; release smoke installs the package in Pi | Authenticated Pi execution that loads the selected SKILL.md files and returns checked evidence |
| Platforms | CI and Release Gate have Ubuntu, Windows and macOS matrices | Each job must finish successfully at the exact final candidate |
| Release | `registry/capabilities/CAP-SKL-001-pi-native-skills.yaml` is `specified` | Final requirement matrix, full adversarial and lifecycle E2E, zero critical defects, all gates on one HEAD |

The checkpoint is an untrusted recovery hint. `IssuedSkillContext` is branded by an in-memory WeakSet. JSON persistence preserves fields but not the brand; loading the checkpoint must never itself confer mutation or verification authority. An authenticated issuance and durable evidence design is required before claiming full recovery.

The new lifecycle snapshot has integrity protection only when its caller supplies the same secret across restarts. The test uses a random in-process key and a fixture agent. Production key management and validation of actual Pi output have not yet been wired into a host workflow. The phase completion method is private; advancement requires an agent result from the dispatcher and candidate-bound verification/release evidence. The fixture agent can still fabricate output, so this is not a completed release gate.

The Pi process runner supplies paths in a prompt. Its fixture test proves prompt construction, not that Pi loaded those documents or obeyed them. Until that is observed and checked against the candidate, phase and agent, CAP-SKL-001 must remain open.
