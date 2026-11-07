# Inspect registered integrations and configured profile routes

`inspectIntegrationProfiles` derives detached, read-only facts for the existing Integrations section. The existing `/asen-panel integrations` command and native panel now consume it through `getPanelSnapshot`. Inventory registration does not prove a working connection, and configured routing does not prove which provider executed a request.

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

The production `createPiExtension` facade forwards the actual public readers bound to Pi; the inner extension never substitutes an empty inventory for an unsupported reader. It validates session/project identity around asynchronous loading and before displaying the result. The synchronous component itself performs no loading or identity lookup. Optional-reader consumers retain their unavailable fallback; production host admission still requires the existing callable inventory APIs and is not weakened.

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

## Integrated display

`extensions/asen.ts` uses `readProfilesFile`, the existing session binding and the existing resolver through this projection. A metadata check distinguishes a missing project file from read/parse failure because the existing loader deliberately returns an empty file for absence. Malformed or unreadable project profiles render `Agent profile: unavailable`, not default routing. No raw MCP configuration is read.

Roles are derived from already-supported loaded profile facts, not a second role registry. Explicit session selection overrides a project route; a role absent from the explicit snapshot can still fall through to the project/global layers. Inherited snapshots retain their captured global routes. Loading failures remain unavailable and no model is selected by inspection.

The renderer shows bounded configured/registered entries, coarse provenance, configured role sources and `actual unknown` / `connection unknown`. Empty inventory is labeled `empty (no entries reported)`; missing or throwing readers are `unavailable`. Limits are labeled rather than presented as total server/extension counts. Integrations states what an elevated permission mode means (`permissions <meaning>` from `ASEN_PERMISSION_MODE_MEANINGS`) without repeating the mode banner: the composed `asen:host` status row owns the mode itself, and the meaning line is omitted for `normal`, mirroring the reference split between status bar and rail. `/asen-status` additionally projects one inventory line (`integrations: commands <state> · tools <state>`, bilingual, with `limited` markers and no counts or connectivity claims) only when the host exposes public inventory readers.

Session-manager replacement, session/project drift or shutdown during an asynchronous snapshot load rejects the stale panel before publication. The native overlay also closes on scope drift. Legacy renderer snapshots without explicit inspection data keep their previous output.

## Verification

Run the pure in-memory contract tests:

```sh
node --import tsx --test tests/integration-profile-inspection.test.ts
npm run typecheck
```

Tests cover empty/unavailable distinctions, namespace truthfulness, sanitization, independent generic failures, bounds, route precedence, frozen provenance, malformed project facts and input preservation. No provider, connection, session launch or filesystem fixture is used.

`tests/panel-observation-integration.test.ts` additionally exercises the public registered command and lifecycle callbacks with project-owned isolated roots. Its production-facade regression starts through `createPiExtension`, invokes the registered panel command, verifies the original reader receiver, and distinguishes reported, empty and throwing inventory through exact notification output. No profile edits, storage schema, fallback execution, cooldown, defaults, permissions or model selection are introduced by the inspection path. Fake-host tests are not connectivity, real native-session/visual acceptance, provider execution or restart-durability evidence.
