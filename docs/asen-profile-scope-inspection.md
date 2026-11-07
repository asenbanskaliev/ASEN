# Inspect configured profile scopes without applying them

`/asen-profiles show` (or `/asen-profiles` with no arguments) now separates saved settings from the captured session and project-effective configuration. It reads configuration and an **existing** in-process binding; it never captures a missing binding, selects a profile, applies a model, dispatches work, retries, or probes connectivity.

## Read the scopes separately

| Output | Meaning |
|---|---|
| `active`, `profiles`, `available` | Saved global inventory; unavailable is not a default selection. |
| `savedGlobalProfile`, `globalRoles` | Saved global default and bounded configured role facts, not necessarily the current session's routes. |
| `sessionProfile` | Existing captured profile, origin, frozen in-process lifetime and unproven restart durability. Absence distinguishes no active session from a session not yet captured. |
| `projectConfiguration` | `loaded`, `absent`, or `unavailable`. Malformed/unreadable files are unavailable, not empty defaults. |
| `effectiveProfile` | Existing inspector/resolver facts: source, model presence, optional thinking, and actual execution unknown. No binding or a failed required load means unavailable. |

For inherited sessions, project roles override the captured inherited-global roles. Explicit-session roles win over project roles; missing explicit roles fall back to project, then default—not the current saved-global file. Each role is a complete choice; missing model/thinking fields are not filled from another layer.

`session --inherit` restores captured inheritance, **not** the current saved global default. Project configuration can still win per role. The mutation command itself is unchanged.

## Intentional read-output change

The saved inventory fields remain, but `globalRoles` and `sessionProfile.roles` now contain bounded inspector facts rather than raw `requested`/`resolved` model strings. Session/project identifiers and paths are withheld. Consumers requiring the former exact object shape must adapt; this is an intentional inspection privacy change, not a profile-schema migration.

Profile and role names are the existing validated public identifiers. Model strings, URLs, paths, extra configuration metadata and raw diagnostics are not displayed. The inspector caps role output and reports `limited`; an omitted role is not proof of absence. Project failure does not hide separately available saved/captured scope facts.

`actual: unknown` is deliberate. Parent model selection is unchanged. Fallback chains and cooldown are unsupported by this configuration contract; no automatic or paid fallback is introduced. Captured inheritance is neither restart-durable nor a refresh of the current global default.

## Wiring and evidence boundary

- The registered command is tested through `createPiExtension` with an injected public host, including startup capture, UI publication and session/project/manager/cancellation/shutdown drift rejection. This is not real-host visual or provider evidence.
- The new `readSessionProfile` accessor returns detached existing snapshots, validates identity/ownership and never invokes a loader or creates a binding. Existing capture/select/reset/clear behavior remains covered by its original tests.
- The command and existing panel share the project loader. A failed load after a file was observed remains unavailable. The existing inspector owns bounded projection and route resolution; no new resolver, schema or store is added.
- Read-only tests retain fresh fixtures under `.cache`; they check unchanged profile bytes/bindings and no model/dispatch/consent effects. Existing filesystem mutation/dispatch suites remain subject to the known local hard-link limitation.
- Previously unavailable differential (0/10), native UI and restart/provider proof remain unavailable. This bounded enhancement does not complete S19/UI-09/EF-702 or establish overall equivalence.
