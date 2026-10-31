# ASEN T12 — R4 adversarial assessment (self-review, not independent sign-off)

Reviewed source candidate: ASEN PR #43, previous full-green SHA `7656a5b49776cc81a4ec0eba326d8108ffc8202f`; subsequent source changes require revalidation. This document is a risk register, **not** a third-party independent R4 signature, and does not authorize merging to main.

| Finding | Risk | Grounded behavior | Disposition / acceptance gate |
| --- | --- | --- | --- |
| R4-01 | HIGH | `managed-lifecycle.ts` performs final checks then pathname-based `unlink`. A malicious process running as the same OS user can change a directory or file between final check and delete. | Remains open. Either use a supported OS-level confined deletion helper with a witnessed no-follow parent directory handle, or formally limit threat model to cooperative same-user processes. Deterministic substitutions before final check do not prove atomic safety. |
| R4-02 | MEDIUM | `shared-session-directory.ts` previously checked absence then unconditionally renamed a temporary record over the target, permitting simultaneous live owners of the same identity. | New-name publication replaced with atomic no-clobber hardlink plus injected race regression. Verify three platforms; existing stale ownership replacement still lacks a full malicious-same-user guarantee. |
| R4-03 | MEDIUM | `workspace-resolution.ts` previously threw if `lease.verify()` failed immediately after an already successful `renameSync`, making a completed write look unsuccessful and skipping attribution in the command layer. | Publication now returns an explicit post-write uncertainty warning and the command persists attribution. An injected changed neighboring tracked file must confirm that the exact write happened and is not silently retried. |
| R4-04 | MEDIUM | Previous Pi support matrix used native TUI startup/shutdown only; no actual keyboard dispatch, no ASEN command observation, and no editor selection/confirmation evidence. | New genuine PTY `/asen-changes` keyboard admission, zero model invocations. Editor/selector/confirmation with a real Pi terminal remains open and must not be claimed. |
| R4-05 | HIGH — claim integrity | The original reference ecosystem source was unavailable for 16 normative parity claims; GitHub CI does not establish full equivalence with la referencia externa. Provider-backed Pi interruption also remains opt-in/skipped. | Preserve PARTIAL overall; only exact-version, exact-SHA verified scoped subfeatures may be described as FULL. No green-check promotion of unsupported claims. |
| R4-06 | MEDIUM | Live cross-session metadata uses private local filesystem permissions and PID rather than cryptographic identity attestation. Same-user malicious code can forge metadata. | Disclose same-user isolation limit. Consent applies to metadata read, never to commands, transcripts or writing. |

## Required next evidence

The consolidated CI must pass the general and CodeGraph real-CLI suites on Linux, Windows and macOS, Release Gate, Pi runtime and model-free real keyboard TUI. Review the exact source for the above threat conditions, then validate actual Pi TUI editor and selector on a disposable Git repository. No automatic merge, production installation, or paid-provider request is authorized by this review.


## Native editor/approval witness extension

At source `fddecd76188c0f0fd4b3c2dd33a98090e700682f`, a real Pi TUI performed public conflict selection and editor cancellation on Ubuntu; it did not modify the tracked file or run an AI model. The expanded follow-up candidate introduces paired negative (Escape) and positive (explicit confirmation) native UI paths on Windows/macOS/Linux. The positive path is **a hypothesis under test**, not a claim: pass criteria require a changed tracked file, an unchanged Git HEAD, a visible authorized result, a bounded session receipt and no model invocations. Post-publication same-user races and the high T09 unlink-by-path risk remain open regardless of TUI results.
