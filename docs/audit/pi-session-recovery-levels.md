# Pi session recovery evidence levels

ASEN uses Pi's session manager and RPC/CLI. Pi remains responsible for models, credentials, native sessions and chat.

## A. RPC contract

The session recovery test parses a correlated `get_state` response from Pi RPC and compares its session ID and file with an ASEN checkpoint. It rejects project, repository, revision, session ID and session file drift. Checkpoint recovery returns task and candidate only; it does not restore passing evidence.

## B. Real Pi session smoke without a provider

`tests/pi-session-recovery-e2e.test.ts` starts two separate processes. The first creates a native Pi JSONL session through Pi's `SessionManager` and writes an ASEN checkpoint. A fixture assistant entry forces Pi to flush the file without a model. The second runs the real Pi CLI in RPC mode, loads that file, reads `get_state`, and reconciles it with the checkpoint. The test also rejects a copied session file with the same session ID.

The assistant entry is fixture data. This test proves Pi can load and report session identity across processes; it does not prove a model response, tool execution, or actual compaction.

## C. Authenticated model continuity

Continuing a real model turn after restart, replaying tool state and resuming after actual compaction require an authenticated provider and are not covered by this test. They remain an explicit release risk until exercised in an authorized environment. No fixture or RPC state query counts as evidence for C.
