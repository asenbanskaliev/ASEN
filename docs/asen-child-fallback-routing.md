# Direct explorer fallback routing

A direct `asen_agent_start` without `todoId` now carries the saved explorer fallback chain into the existing read-only child admission. It does not configure chains or activate models itself.

## Configuration and selection

Chains remain in the existing global `~/.asen/profile-fallbacks.json` store (`asen.profile-fallbacks/v1`), separate from runtime profiles. Each profile maps roles to ordered model steps, with optional `thinking`; `explorer` takes precedence over `*`. Existing validation allows at most eight unique steps. The existing profiles access edits the global parent/orchestrator chain; this change adds no child editor. Do not confuse an orchestrator chain with an explorer or wildcard chain.

The child uses the existing captured session selection and project/global routing layers, not a fresh global active-name lookup. Primary route and fallback profile come from one captured layer set: the layer supplying the route, or the first existing session/project/global layer when the route is default. A later global active-profile change does not replace a session's captured selection.

The strict existing fallback reader rejects malformed stored bytes before child admission, preserving the existing error. Missing configuration or an empty resolved chain omits fallback metadata and retains legacy model, effort and public routing output. Existing runtime/dispatcher admission validates, copies, freezes and persists the optional `{profile, chain}`; later file edits do not alter an admitted run.

## Boundaries

- Only direct, unplanned read-only explorers receive this metadata. Planned and legacy Todo launches, workers, reviewers, verifiers, continuation and retry keep their existing paths; their common resolver does not newly read fallback files.
- No public tool option, CLI/schema change, provider lookup, payment gate, model activation, parent fallback or notice behavior is added.
- Existing identity, ownership, cancellation and execution guards remain authoritative. A stored chain is routing data, never execution permission.

This is source wiring, not proof of real Pi/host/provider behavior, notice delivery, same-conversation recovery or cancellation parity. Parent functional GREEN and independent verification are separate gates; historical stopped proofs remain unchanged.
