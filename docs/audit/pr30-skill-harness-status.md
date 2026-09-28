# PR 30: Skills and harness audit status

Candidate evidence must be evaluated against the exact PR HEAD. A green workflow alone does not close CAP-SKL-001, which remains `specified`.

| Requirement | Status | Evidence and remaining limit |
| --- | --- | --- |
| 27 native Skills: selection and exact loading | PROBADO (scope: route integrity) | Registry selection and ordering tests; real Pi get_commands checks native SKILL.md routes in four authenticated role turns; PiProcessRunner now checks exact loaded routes in its own process before prompting. Complete phase-specific model behavior remains open. |
| Role, task and tool authority | PARCIAL | Dispatcher binds issued contexts to task, role, repository and candidate; Pi extension denies unauthorized tool calls with adversarial tests. This is in-process control; OS isolation and reviewer independence remain unproven. |
| Lifecycle: nine phases | PARCIAL | Dispatcher and signed lifecycle enforce order, role, artifacts and pending recovery; fixture transcripts run all phases. A complete model-produced nine-phase flow and independent review before archive are not demonstrated. |
| TDD and executed evidence | PARCIAL | Adversarial RED CI proved lone GREEN bypass; executed RED/GREEN/REFACTOR now required in order on candidate Git HEAD; signed restore checks executed RED. Behavior-changing model patch and actual safety-net semantics remain unproven. |
| Signed recovery and authority reissue | PARCIAL | MAC, candidate and revision checks reject tampering; new process reissues context and continues real explorer Pi turn. Preparatory artifact is a fixture; production host key management and model-produced recovery across all phases remain open. |
| Model integration | PARCIAL | Pi + pi-free + LLM7 returned nonempty authenticated explorer, reviewer, verifier and worker turns after exact Skills loading, zero tools. No separately authenticated artifact authority or model-backed reviewer verdict yet. |
| Same-HEAD multiplatform gates | PARCIAL until final job completes | CI, Release Gate and Phase 0 now check out the exact PR HEAD and assert Git revision; verify each Ubuntu/Windows/macOS job and authenticated Pi on the final SHA. |
| Release / CAP-SKL-001 | NO PROBADO | Keep capability `specified` until full lifecycle, independent evidence, recovery, adversarial checks and all final gates pass with zero critical defects. |

The checkpoint is an untrusted recovery hint. `IssuedSkillContext` is branded by an in-memory WeakSet. JSON persistence preserves fields but not the brand; loading the checkpoint must never itself confer mutation or verification authority. An authenticated issuance and durable evidence design is required before claiming full recovery.

The new lifecycle snapshot has integrity protection only when its caller supplies the same secret across restarts. The test uses a random in-process key and a fixture agent. Production key management and validation of actual Pi output have not yet been wired into a host workflow. The phase completion method is private; advancement requires an agent result from the dispatcher and candidate-bound verification/release evidence. The fixture agent can still fabricate output, so this is not a completed release gate.

The Pi process runner now supplies selected paths as native `--skill` arguments with default skill and extension discovery disabled. Pi RPC independently reports that the exact paths are loaded. The authenticated explorer turn documented below proves the model read the two selected files. It does not prove that an untrusted agent cannot launch another process through its built-in tools. Process-level authority and the complete lifecycle remain open.

## Cross-cutting checkpoint — 2026-09-28

- **PROBADO (limited):** `EvidenceStore` has no public signed-restoration method. Recovery verifies snapshot MAC and exact repository, candidate and revision before reconstructing executable evidence; direct fabricated PASS and wrong-key recovery are rejected. Executed commands check Git root and exact HEAD both before and after running; failure cannot be labelled PASS, and success cannot be labelled expected RED. Tests use actual temporary Git repositories.
- **PARCIAL:** independent review PASS now requires an executed reviewer subprocess, a distinct reviewer identity, an issued reviewer context, exact candidate Git HEAD and signed persistence of its metadata. The caller still supplies the reviewer subprocess; a separately authenticated model reviewer and an independent trust root remain unproven.
- **PROBADO (limited):** dispatcher binds issued contexts to task, candidate, repository, phase and agent role, including read roles. Lifecycle signed snapshots can restore pending exact Skills and reissue authority in a second process; wrong key and forged in-memory snapshots fail. The authenticated Pi workflow resumes an explorer turn after this restart and checks native Skill loading, nonempty model response and zero tool calls. Its phase artifact before restart is fixture output, not authenticated model output.
- **PARCIAL:** the Pi process runner starts with `--no-extensions`, explicitly loads `extensions/authority.ts`, checks its registered extension command by exact path before sending a prompt, and passes a role/grant policy. A Pi `tool_call` handler denies process/delegation tools, out-of-repository paths, writes by read roles and writes outside worker surfaces; adversarial unit tests include symlink escape, and a real Pi RPC invocation confirms explicit extension loading. The control runs inside the Pi process; it is not an OS sandbox and does not authenticate the runner's caller as a separate security principal. The authenticated workflow currently uses `--no-tools`, so it does not prove a model-backed tool denial.
- **NO PROBADO:** authenticated worker, reviewer and verifier lifecycle artifacts; actual model-backed TDD RED/GREEN/refactor linked to one candidate; OS-level process isolation; full model-produced nine-phase recovery and archive. Do not mark `CAP-SKL-001` verified.

These findings are local until the final commit's CI, Architecture, Release Gate, and authenticated Pi workflow all finish on the same SHA and the three CI operating-system jobs are inspected.

## Authenticated Pi attempt — 2026-09-27

On PR #30 candidate `cee7db11d9108492e64f417b846ed110dfe8e0a9`, the GitHub Actions job `ASEN Authenticated Pi Audit` (run 36344614260, job 108691192883) received the repository secret, checked out the exact PR HEAD, and reached the real Pi model turn. OpenCode Zen rejected `opencode/mimo-v2.6-flash-free` with HTTP 403 `FreeTierError`: "OpenCode's free tier can only be used from within OpenCode". Pi could not produce a model response, so no authenticated behavior claim is supported. This is a provider restriction; do not reinterpret it as a code failure or make this gate PASS.

The subsequent free OpenRouter run and its outcome are recorded below. No paid fallback was selected.

## Authenticated Pi result — 2026-09-27

The OpenRouter retry at exact PR HEAD `f992803da6b2798b1c4968bea38968d611307f17` passed in GitHub Actions run 36345025881, attempt 2, job 108692883709. The secret `OPENROUTER_API_KEY` was present and masked. ASEN selected `skills/asen-phase-protocol/SKILL.md` and `skills/asen-explore/SKILL.md` for the explorer on that revision; the real Pi RPC session with `openrouter/cohere/north-mini-code:free` reported precisely those loaded native Skills, invoked the read tool on each exact file once, used no other observed tool, and returned the unique marker. The script checked the PR SHA, selected routes, loaded routes, read paths and response. This proves a limited, authenticated read-only turn, not process isolation or enforcement of agent behavior in a full task.

At the same HEAD, Phase 0 Architecture run 36345025884, CI run 36345025887 (Ubuntu, Windows and macOS jobs all succeeded), and Release Gate run 36345025885 passed. The original Zen attempt above remains a historical provider restriction; the OpenRouter attempt resolves that specific integration blocker. CAP-SKL-001 remains `specified`: the authenticated turn has not yet completed worker/reviewer/verifier phase transitions, durable model evidence, TDD, release and recovery. In-memory issuance and untrusted fixture output remain critical gaps.

## Role tool restriction — 2026-09-27

The authenticated explorer probe now launches Pi with `--tools read` in addition to the exact Skills. On candidate `4c512a1addce411e540439a377102da5d313a3ff`, run 36345285070 passed with a real OpenRouter model turn reading both files. The ASEN Pi process runner now supplies `--tools read` for issued explorer, reviewer and verifier turns, and rejects caller-provided skill/tool switches (including `--tools=bash`); `tests/pi-process-runner.test.ts` checks exact arguments and an adversarial override. Local typecheck and 137 tests passed for this change. The worker still has process command access, so this does not prevent subprocess redelegation or constitute OS-enforced write isolation. Full authenticated role lifecycle, recovery after restart and fabricated evidence prevention remain open. CAP-SKL-001 remains `specified`.

## Four-role Pi checkpoint — 2026-09-28

- **PROBADO (limited):** on commit `912207d187defe83a921f88b5cc1ab1553454687`, authenticated workflow run 36427035007 completed a model turn for explorer, reviewer, verifier and worker with Pi + explicitly loaded pi-free + LLM7. Each turn checked its ASEN-issued selection against Pi's exact native SKILL.md list, produced nonempty assistant text and executed zero tools. These are four independent read-only probes with `--no-tools`; they do not prove model-produced phase artifacts or worker writes.
- **PARCIAL:** `PiArtifactRunner` converts a completed, correlated Pi RPC transcript into JSON for the lifecycle. `SkillLifecycle` requires an in-memory provenance brand bound to task, role, repository, candidate revision and exact Skill paths. The existing lifecycle and recovery fixtures now simulate Pi RPC explicitly; the authenticated recovery initialization also uses a fixture, then starts a real explorer model turn in a second process. A caller that controls the PiProcessRunner implementation/command is still trusted; this brand alone is not an independent authentication root.
- **NO PROBADO:** model-produced worker/reviewer/verifier artifacts bound to lifecycle transitions; separately trusted reviewer; executed TDD RED/GREEN/refactor on one Git revision; full model-backed recovery and archive; OS sandbox. `CAP-SKL-001` stays `specified`.

CI and Release Gate results must be rechecked on the exact final HEAD after every subsequent edit, including Ubuntu, Windows and macOS. The four-role model probe above belongs to its stated SHA only.

## Executed TDD checkpoint — 2026-09-28

- **PROBADO (scoped):** the adversarial lone-GREEN case failed CI at `bd44728e2d64fb4c03869acdce9a4c16c48d3ff7` (run 36427381779). The generic executed-evidence API now rejects `kind: tdd`. `TddCycle` requires stage-specific ASEN-issued execution proofs and exact candidate identity; only an ordered failing RED, passing GREEN and passing REFACTOR satisfy the TDD gate. Signed reload reconstructs completion from those records and rejects recovered RED without failing execution metadata.
- **PARCIAL:** the stage commands run on the candidate Git revision. The fixtures do not demonstrate that a model authored the tested code or that the intended behavior was absent before RED. Model text alone cannot prove TDD.
- **NO PROBADO:** independently authenticated model reviewer, full real-Pi lifecycle and OS isolation. `CAP-SKL-001` remains `specified`.

## Exact checkout gate — 2026-09-28

- **PARCIAL pending final matrix:** CI, Release Gate and Phase 0 Architecture now explicitly check out `github.event.pull_request.head.sha` for PR runs, falling back to `github.sha` for push runs. Each verifies its actual Git HEAD before running gates. This avoids treating tests on GitHub's synthetic PR merge commit as tests on the candidate revision. The authenticated Pi workflow already checks out and asserts the exact PR SHA. These workflow changes require Ubuntu, Windows and macOS jobs to finish on the same final SHA before being marked proven.
- **NO PROBADO:** full lifecycle with model-produced task/review/verification artifacts and independently trusted reviewer. Four role model turns and the signed recovery preparation are separate limited proofs. `CAP-SKL-001` stays `specified`.

## Pi native Skill preflight — 2026-09-28

- **PARCIAL pending final SHA gates:** the production Pi RPC runner now checks both the explicit ASEN authority extension and the exact ordered native Skills returned by Pi's `get_commands` in the same process, before sending its task. Its adversarial fixtures replace, omit or add a Skill; each mismatch must stop the turn. The real four-role LLM7 workflow independently checks selected native Skills and zero tool use.
- **NO PROBADO:** this control is inside the Pi process, not an OS sandbox. Worker, reviewer and verifier have not yet produced independently trusted lifecycle artifacts in a complete real-model E2E. `CAP-SKL-001` stays `specified`.
