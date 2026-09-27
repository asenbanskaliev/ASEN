# PR 30: Skills and harness audit status

Candidate evidence must be evaluated against the exact PR HEAD. A green workflow alone does not close CAP-SKL-001, which remains `specified`.

| Requirement | Current evidence | Remaining proof |
| --- | --- | --- |
| Skill selection and exact routes | `tests/skill-registry.test.ts`, `tests/orchestrator.test.ts`, `tests/dispatcher.test.ts` compare the ordered routes; `tests/pi-native-skill-load.test.ts` invokes the real Pi CLI with exact `--skill` routes and verifies `get_commands` reports precisely those SKILL.md paths without a model | Bind an authenticated Pi turn across all agent roles and lifecycle phases to persisted candidate/role/phase/result |
| Agent authority | `tests/orchestrator-dispatcher-integration.test.ts` exercises worker evidence and a swapped read role; only workers receive write grants | Enforce task identity for read roles and process-level isolation; verify worker cannot redelegate |
| Lifecycle | `tests/state-machine.test.ts` guards coarse states; `tests/skill-lifecycle.test.ts` executes all nine Skills phases through the dispatcher, checks ordered mandatory artifacts, interrupts after tasks, resumes and archives | Connect phase completion to authenticated Pi output and independently verified evidence, including TDD and review before verify/archive |
| TDD and evidence | `tests/evidence-tdd.test.ts`, `tests/repository-bound-evidence.test.ts`, `tests/skill-evidence-gate.test.ts` | Prove RED/GREEN/refactor with executed commands on the same candidate; prevent fabricated pass records from serving as execution evidence |
| Recovery | `tests/pi-session-recovery-e2e.test.ts` uses native Pi session file and RPC identity across processes; lifecycle and evidence snapshots are signed with a caller-supplied 32-byte secret and reject tampering, task, repository and revision drift. E2E reloads evidence before verify/archive; `tests/recovery-key.test.ts` starts a second process that restores both snapshots with the host key and rejects wrong key/revision | Configure the host secret `ASEN_RECOVERY_KEY` consistently in production, reissue authority after recovery and continue an actual model turn after restart. A deserialized issued context loses its in-memory issuance mark |
| Pi integration | `tests/pi-native-skill-load.test.ts` observes exact native skill loading in Pi RPC; `tests/pi-process-runner.test.ts` verifies the same flags in ASEN's invocation and rejects extra routes; release smoke installs the package in Pi | Authenticated lifecycle output/evidence across all roles and process-level tool isolation |
| Platforms | CI and Release Gate have Ubuntu, Windows and macOS matrices | Each job must finish successfully at the exact final candidate |
| Release | `registry/capabilities/CAP-SKL-001-pi-native-skills.yaml` is `specified` | Final requirement matrix, full adversarial and lifecycle E2E, zero critical defects, all gates on one HEAD |

The checkpoint is an untrusted recovery hint. `IssuedSkillContext` is branded by an in-memory WeakSet. JSON persistence preserves fields but not the brand; loading the checkpoint must never itself confer mutation or verification authority. An authenticated issuance and durable evidence design is required before claiming full recovery.

The new lifecycle snapshot has integrity protection only when its caller supplies the same secret across restarts. The test uses a random in-process key and a fixture agent. Production key management and validation of actual Pi output have not yet been wired into a host workflow. The phase completion method is private; advancement requires an agent result from the dispatcher and candidate-bound verification/release evidence. The fixture agent can still fabricate output, so this is not a completed release gate.

The Pi process runner now supplies selected paths as native `--skill` arguments with default skill and extension discovery disabled. Pi RPC independently reports that the exact paths are loaded. The authenticated explorer turn documented below proves the model read the two selected files. It does not prove that an untrusted agent cannot launch another process through its built-in tools. Process-level authority and the complete lifecycle remain open.

## Authenticated Pi attempt — 2026-09-27

On PR #30 candidate `cee7db11d9108492e64f417b846ed110dfe8e0a9`, the GitHub Actions job `ASEN Authenticated Pi Audit` (run 36344614260, job 108691192883) received the repository secret, checked out the exact PR HEAD, and reached the real Pi model turn. OpenCode Zen rejected `opencode/mimo-v2.6-flash-free` with HTTP 403 `FreeTierError`: "OpenCode's free tier can only be used from within OpenCode". Pi could not produce a model response, so no authenticated behavior claim is supported. This is a provider restriction; do not reinterpret it as a code failure or make this gate PASS.

The subsequent free OpenRouter run and its outcome are recorded below. No paid fallback was selected.

## Authenticated Pi result — 2026-09-27

The OpenRouter retry at exact PR HEAD `f992803da6b2798b1c4968bea38968d611307f17` passed in GitHub Actions run 36345025881, attempt 2, job 108692883709. The secret `OPENROUTER_API_KEY` was present and masked. ASEN selected `skills/asen-phase-protocol/SKILL.md` and `skills/asen-explore/SKILL.md` for the explorer on that revision; the real Pi RPC session with `openrouter/cohere/north-mini-code:free` reported precisely those loaded native Skills, invoked the read tool on each exact file once, used no other observed tool, and returned the unique marker. The script checked the PR SHA, selected routes, loaded routes, read paths and response. This proves a limited, authenticated read-only turn, not process isolation or enforcement of agent behavior in a full task.

At the same HEAD, Phase 0 Architecture run 36345025884, CI run 36345025887 (Ubuntu, Windows and macOS jobs all succeeded), and Release Gate run 36345025885 passed. The original Zen attempt above remains a historical provider restriction; the OpenRouter attempt resolves that specific integration blocker. CAP-SKL-001 remains `specified`: the authenticated turn has not yet completed worker/reviewer/verifier phase transitions, durable model evidence, TDD, release and recovery. In-memory issuance and untrusted fixture output remain critical gaps.
