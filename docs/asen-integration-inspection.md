# Inspect registered integrations and configured profile routes

`inspectIntegrationProfiles` derives detached, read-only facts for the existing Integrations section. It is not wired into that section yet. Inventory registration does not prove a working connection, and configured routing does not prove which provider executed a request.

## Caller contract

Import from `src/runtime/integration-profile-inspection.ts`. Supply actual public `getCommands()` and `getAllTools()` readers, bound to their host if necessary. Omit unavailable readers; do not replace them with functions returning empty arrays.

```ts
const inspection = inspectIntegrationProfiles({
  getCommands: host.getCommands?.bind(host),
  getAllTools: host.getAllTools?.bind(host),
  profiles: {
    layers: alreadyLoadedLayers,
    projectState: "loaded",
    roles: inspectedRoles,
    snapshot: alreadyCapturedSnapshot,
  },
});
```

The example is a proposed integration contract, not delivered host wiring. Callers retain session/project identity validation around asynchronous loading and before displaying the result. This synchronous component performs no loading or identity lookup.

| Input | Meaning |
|---|---|
| `layers` | Existing `ProfileLayer` facts, never paths or raw configuration. |
| `projectState: "loaded"` | Valid project-layer facts are present. |
| `projectState: "absent"` | Caller established absence; no project layer is supplied. An already-loaded empty file can instead be `loaded`. |
| `projectState: "unavailable"` | Project read/parse failed. Inspection is unavailable, not an effective default. |
| `roles` | Explicit roles to inspect; no new role registry is created. |
| `snapshot` | Optional existing `SessionProfileSnapshot`, not a session identity or storage receipt. |

A caller must preserve load errors rather than catching them and supplying an empty layer. Missing profile input, malformed loaded facts and inconsistent project state fail closed with a generic diagnostic.

## Output

The result has exactly three top-level fields: `commands`, `tools`, `profiles`.

- Each inventory has `state`, `entries`, `limited`, and an optional generic `diagnostic`.
- `state: "unavailable"` means the reader was absent, threw, or returned invalid inventory.
- `state: "empty"` means **no entries reported**, not no configured servers or extensions.
- `state: "reported"` means rows were returned, even if all names were withheld.
- Entries expose only a validated public `name`, optional validated `namespace`, `status`, `connection: "unknown"`, and coarse `provenance`.
- Commands are `configured`; tools are `registered`. A namespace such as `mcp__docs` is registration evidence only, never readiness evidence.

Canonical command `source` and allowlisted `sourceInfo.scope/origin` provide coarse provenance. Tool source is preserved only for the public `builtin`/`sdk` categories; other values become `unknown`. Paths are never parsed to infer ownership. Descriptions, schemas, aliases, instructions, URLs, paths, environment/auth values and raw errors are not copied. Names containing slashes, backslashes, whitespace, control characters, interpolation or assignment syntax are withheld rather than partially redacted. A safe-looking public identifier is still caller-provided data, not verified ownership.

Each reader is called once. At most 256 input rows and 32 distinct output entries are inspected per inventory or role list. `limited` signals withheld rows or cap overflow; these are not complete server/extension inventories or counts. Duplicate public identities are collapsed. Reader runtime itself is host-owned; this synchronous adapter cannot impose a deadline on a blocking host function.

## Profile semantics

Profile facts use the existing parser and `resolveRuntimeRoute`, preserving session → project → global → default precedence, including fallback when the session lacks a role. An explicit snapshot occupies the session layer; inherited snapshots occupy the global layer, matching existing extension composition. A snapshot never causes the current global file to replace its captured routes.

`profiles` exposes `state`, bounded `routes`, `limited`, optional generic `diagnostic`, and optional `snapshot` provenance. Each route contains:

```ts
{ role, source, configured, model: "configured" | "unspecified", thinking?, actual: "unknown" }
```

Raw configured model strings are intentionally withheld because the existing profile contract permits URL/path-like strings. Presence and configured thinking remain inspectable; this does not change a model or route. A missing role returns the resolver's `default` source without inventing a default model.

Snapshot output retains `active`, the original `source`, `frozen: true`, `lifetime: "in-process"`, and `restartDurability: "unproven"`. The existing binding returns detached copies from an in-process registry. Neither that copy nor this projection proves restart-durable freezing. Outputs share no mutable route/provenance data with the inputs; inputs and binding registry remain unchanged.

## Verification and next step

Run the pure in-memory contract tests:

```sh
node --import tsx --test tests/integration-profile-inspection.test.ts
npm run typecheck
```

Tests cover empty/unavailable distinctions, namespace truthfulness, sanitization, independent generic failures, bounds, route precedence, frozen provenance, malformed project facts and input preservation. No provider, connection, session launch or filesystem fixture is used.

Shared renderer composition belongs to the later integration unit. It must render unavailable and empty states distinctly, preserve unknown connectivity/actual execution, avoid presenting entry lengths as complete server/extension counts, and avoid duplicating the existing permission row. No profile edits, storage schema, fallback execution, cooldown, defaults, permissions or model selection are changed here.
