# ASEN command guide

The command guide formats the existing live command discovery result. It does not create a command registry, search registrations again, or fall back to the static catalog when live discovery is unavailable.

## Behavior

- An empty query renders the inspected commands as a bounded, grouped manual guide.
- An exact command name, with or without one leading `/`, renders its public description and the manual `Type /name manually` invocation.
- A query without an exact registered match reports that no exact match was found.
- An empty reported inventory says that no commands were reported.
- An unavailable inventory stays unavailable; stale catalog entries are not substituted.
- Duplicate, malformed, or excess rows are withheld and disclosed as a limited view.

Names, groups, descriptions, and queries are sanitized and bounded for terminal display. The formatter reads only the public discovery fields needed for the guide. It does not inspect source metadata, handlers, paths, credentials, or other private registration details.

Rendering is read-only. It does not execute a command, reload the host, open an editor, change keybindings, access the network, or mutate command registration.

## Integration

The pure interface is:

```ts
formatCommandGuide(result: CommandDiscovery, query?: string, width?: number): string[]
```

`/asen-help` reads the live receiver-bound command inventory once per invocation, normalizes one leading `/` for discovery, and passes the original query plus the current host content width to the formatter. The existing command wrapper publishes the returned lines.

Known Jobs inspection safety guidance is shown only when the live inventory reports `asen-job-inspect`. It states that the command and headless metadata paths are read-only, logs are withheld, recovered execution is unknown and uncontrollable, and no Follow or log viewer exists. It also describes the optional explicit `s` action in the native Jobs view: Stop can be requested only for a currently owned live ASEN registry handle.

The guide itself never executes or inserts Stop, selects a job, reloads the host, or grants action authority. Missing or failed inventory remains unavailable and suppresses every static Jobs hint rather than falling back to the catalog. The integration does not read handlers or source metadata, open an editor, invoke a provider, or expose job output.
