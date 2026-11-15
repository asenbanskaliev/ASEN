# Inspect configured profile scopes without applying them

`/asen-profiles show` (also bare `/asen-profiles` without native UI selection) separates saved settings from the captured session and project-effective configuration. It reads configuration and an **existing** in-process binding; it never captures a missing binding, selects a profile, applies a model, dispatches work, retries, or probes connectivity.

## Native access

Bare `/asen-profiles` opens Pi's native selector when `hasUI` and `ui.select` are available (not restricted to TUI mode). Choose **Use this session**, **Make default**, **Restore captured inheritance**, **Create saved profile**, **Edit saved profile**, or **Edit fallback chain (ASEN parent)**. Profile selection lists only saved profiles; an empty inventory offers Back, not a phantom default. Back returns one level; Esc exits without selecting. Changing the saved default does not refresh the frozen session capture.

Bare `/asen-persona` similarly selects professional, neutral, or simple. `/asen-persona show` is an additive inspection alias; explicit style arguments keep their existing behavior. Headless or callback-absent access keeps inspection JSON/notification semantics. Native menus invoke inner actions once, not registered command wrappers.

Native selections reject forged choices and expired session/project/manager/epoch or aborted contexts before persistence/publication. Session select/reset also require synchronous freshness confirmation immediately before the binding commit, with ownership/revision rechecked after the callback and no intervening await. Persona persistence checks freshness across internal awaits and before initiating each file write; **pre-write checks cannot cancel an atomic write already started**. It still updates global plus an **already existing** project override, never creates a project override. These two writes are not a transaction: a completed global write can remain after expiry, while the later project write and notification are blocked; there is no rollback.

**Create saved profile** uses native scope/name/route/model/save prompts. Global writes the existing global profiles file; Project writes the captured canonical project's `.asen/profiles.json`. Same-scope duplicate names are rejected inside the existing exclusive locked read/change/write callback; other-scope names are independent. Active/default selections (including absent active), unrelated profiles and frozen session bindings stay unchanged. No model is activated.

Choose unspecified defaults for an empty route map, or a single explorer/worker/reviewer/verifier role route with a supplied catalog model. Parent/orchestrator routing is separate. Catalog entries are metadata, not authenticated availability; there is no registry refresh, provider lookup or network request. Missing catalogs still permit unspecified defaults; missing native input reports unavailable. Unknown capability keeps the existing Default-only flow (`thinking` omitted). Known catalog capability adds a native effort picker: **Default (unspecified)** still omits `thinking`; explicit **off** persists `off`. Known nonreasoning models declare only off. Reasoning models exclude null mappings; xhigh/max additionally require explicit mappings. The seven configuration levels are not universally supported.

This shared create/edit filter follows the pinned public `pi-ai` `getSupportedThinkingLevels` algorithm (`dist/models.js:693-705`, `dist/types.d.ts:660-665`); mapping values are strings or null (`dist/providers/model-schema.d.ts:11-18`). Missing reasoning is unknown, not false; absent/all-excluded capabilities add no effort dialog. The picker reports **declared catalog effort**, not authenticated availability or actual provider-used effort. It never applies thinking/model setters.

Esc or Back exits creation without saving. In the new effort dialog, cancellation rejects with a cancellation error and no result notification; earlier dialogs retain their existing cancellation responses. Invalid/forged inputs and stale contexts are rejected, including a synchronous freshness check inside the locked callback after waiting for the store. Once atomic persistence starts, expiry cannot cancel or roll back that write: saved bytes can remain, but stale later result publication is suppressed.

**Edit saved profile** lists names only from the selected Global/Project file, then only existing explorer/worker/reviewer/verifier routes. It reuses the catalog model/effort picker and requires explicit Save naming scope/profile/role/model/effort. The chosen route is replaced: Default removes its old thinking; all sibling routes (including unknown, empty, thinking-only or noncatalog routes) remain untouched. This saves configuration only, without activation or changing frozen inherited/explicit bindings.

Inside the existing lock, freshness is checked before finding the original name and comparing the whole selected record by name plus sorted own role/model/thinking values. Harmless key/role reordering succeeds; any selected-record change or disappearance rejects with `Saved profile changed or disappeared; nothing saved. Reopen Edit.` Current unrelated profiles, order and active/default (including absence or a concurrent default switch) survive. A missing/deleted/renamed record is never recreated. Value equality cannot detect delete-identical-recreate or change-revert ABA. Already-started persistence remains nontransactional: expiry blocks later result publication, not rollback.

### Saved global parent fallback chain

**Edit fallback chain (ASEN parent)** requires an explicitly selected saved **Global** profile and edits only its `orchestrator` chain in the existing global, profile-name-keyed fallback store. It does not offer project-isolated or child-role chains. The draft shows ordered entries and their optional effort. **Add model** and **Replace model** reuse the declared-catalog model/effort picker above; Default omits thinking and explicit off remains off. Entry actions **Move up**, **Move down**, and **Remove entry** stage changes. Existing validation permits at most eight unique models.

**Save chain** persists the staged override without changing the saved active/default profile, frozen session route, runtime counters or live model. **Discard**, editor **Back**, or cancellation abandons the draft without saving; reopen the action/profile to read saved entries again. Removing every entry clears only this role override: a profile's `*` chain may then be inherited, so this does **not** disable fallback.

The editor snapshots only the selected own chain, including absence. Inside the existing exclusive atomic updater it checks freshness and rejects a changed target with **Fallback chain changed; nothing saved. Reopen Edit fallback chain.** Unrelated concurrent chains survive. Malformed stores fail closed, with no success publication. Value comparison cannot detect change-revert ABA. The global profile inventory and fallback store are not a cross-file transaction; there is no atomicity or rollback promise across them. Once an atomic write starts, cancellation cannot undo it; later stale publication is suppressed by the existing guards.

This is bounded saved configuration, not live-model activation, admitted child routing, real-host proof, independent verification or visual/reference parity. Rename/delete and broader role controls remain later slices; no full CRUD, model switch or all-agent routing support is implied.

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

Profile and role names are the existing validated public identifiers. Inspection output withholds model strings, URLs, paths, extra configuration metadata and raw diagnostics; the creation picker separately labels supplied catalog models. The inspector caps role output and reports `limited`; an omitted role is not proof of absence. Project failure does not hide separately available saved/captured scope facts.

`actual: unknown` is deliberate. Parent model selection is unchanged. The inspection JSON still reports fallback/cooldown as unsupported; it does not inspect the separately saved global parent chain described above. The editor does not change runtime fallback execution or introduce automatic or paid requests. Captured inheritance is neither restart-durable nor a refresh of the current global default.

## Wiring and evidence boundary

- The registered command is tested through `createPiExtension` with an injected public host, including startup capture, UI publication and session/project/manager/cancellation/shutdown drift rejection. This is not real-host visual or provider evidence.
- The new `readSessionProfile` accessor returns detached existing snapshots, validates identity/ownership and never invokes a loader or creates a binding. Existing capture/select/reset/clear behavior remains covered by its original tests.
- The command and existing panel share the project loader. A failed load after a file was observed remains unavailable. The existing inspector owns bounded projection and route resolution; no new resolver, schema or store is added.
- Read-only tests retain fresh fixtures under `.cache`; they check unchanged profile bytes/bindings and no model/dispatch/consent effects. Existing filesystem mutation/dispatch suites remain subject to the known local hard-link limitation.
- Previously unavailable differential (0/10), native UI and restart/provider proof remain unavailable. This bounded enhancement does not complete S19/UI-09/EF-702 or establish overall equivalence.
