# ASEN

ASEN is a Pi-native engineering harness focused on deterministic workflows, delegated agents, persistent project memory, evidence-bound review, and verification.

> Status: development candidate, not a complete ecosystem-parity release. No stable release is published.

## Setup preview

`asen setup --dry-run` prints a deterministic, read-only JSON plan for the intended setup stages: stage, verify, then activate. The plan identifies the selected package root, the `.asen` product prefix under the launcher home, and the agent home selected by the existing flag → config → environment → isolated-default precedence. Every plan and step is marked `executable: false`; previewing it grants no consent or execution authority.

Setup execution is not shipped yet. `asen setup` and `asen setup --yes` exit with code `2` and direct users to the preview, while unsupported setup arguments are rejected before launcher home/config/runtime access. `--yes` combined with `--dry-run` still only previews. The preview performs no installation, update, activation, download, version probe, backup, restore, or removal.

Signed install, upgrade, rollback, backup/restore and managed-only uninstall are available as `asen managed …`, `asen backup home` and `asen restore home` (see docs/installation.md); this preview itself is not an installer or proof of host/platform support.

## Retained-version selection

`asen [--link|--isolated|--home PATH] managed select <exact-target-version> --expected-current <exact-current-version>` changes only the ordinary stored selector for an already inventoried managed version. Both versions are mandatory and the expected current value is compare-and-set intent: stale or absent metadata is refused, while selecting the matching current version is unchanged and lock-free.

The software prefix remains `<launcher-home>/.asen`; data-home flags, environment, and configuration do not redirect it. The command does not resolve Pi, execute package code, acquire or stage software, restore data, activate a version, or establish runtime readiness. Successful reports are emitted as JSON. An uncertain backend result retains its real report, exits nonzero, and is not retried or rolled back automatically. This is explicit metadata selection, not full update/rollback, native approval, or publisher trust. See [installation and managed execution](docs/installation.md).

## Observation-only managed update preview

`asen [--link|--isolated|--home PATH] managed update --manifest <absolute-json> --package-root <absolute-dir> --dry-run` verifies one exact local acquisition manifest and its declared package bytes, then observes the fixed software prefix `<OS-home>/.asen`. Home selectors are still grammar-checked but affect neither that prefix nor the package root; this route does not read launcher configuration or data-home environment selectors.

Success prints exact two-space `asen.managed-update-preview/v1` JSON plus LF. It reports acquisition verification, `absent | foreign | owned` managed state, the observed selector, and whether the target is `not-retained`, `matching-retained`, `conflicting-retained`, or `not-observable`. Matching requires an owned target version with the same ordered destination path/size/hash inventory. Every report remains `executable: false`, `authorized: false`, `runtimeReady: false`, with staging, selection, and activation `not-run`; matching bytes do not establish publisher authenticity, provenance, activation, or readiness.

The manifest reader accepts only an ordinary single-link file, reads at most 1 MiB plus one growth-detection byte, uses fatal UTF-8/JSON decoding, pre/descriptor/post metadata checks, and a 30-second cooperative monotonic deadline. Package observation keeps its separate 64 MiB-per-file and 256 MiB-total budgets. Existing managed inspection may also read receipts, catalogs, and retained content; those reads are **not** covered by the new budgets, and the combined report is not an atomic snapshot. Invalid grammar exits `2` before home lookup or I/O; operational refusal exits `1` with a single scrubbed bounded message. The command performs no network access, installation, staging, lease, selector write, activation, execution, adoption, or repair.

## Read-only installation doctor

`asen [--link|--isolated|--home PATH] [--package-root PATH] doctor` prints bounded installation metadata without executing Pi or managed package code. Exit `0` means collection completed, **not** that the installation is healthy or ready; exit `1` preserves JSON when required observations are incomplete, and exit `2` rejects invalid doctor grammar.

The report keeps the launcher software prefix, resolved data home, executing package root, and diagnostic package-root override separate. It reports managed inventory and metadata verification, configuration state, configured Pi candidate kind, and maintenance-marker presence only. Runtime probing remains `not-run`, runtime readiness remains false, and publisher authenticity, native authority, and process health remain unknown. The doctor does not repair, reclaim locks, activate versions, initialize stores, or scan/execute opaque Pi command values. See [installation and managed execution](docs/installation.md).

## Explicit selected-version run

`asen [--link|--isolated|--home PATH] managed run <exact-version> -- <Pi arguments>` executes one explicitly named version only when it matches the freshly validated ordinary managed selector and owned inventory. The child receives the resolved data home and selected package root before a protected `--`, while original Pi arguments, caller cwd, stdio, environment, and existing explicit runtime-resolution precedence are preserved.

This is current-user execution intent, not verified human consent, publisher authenticity, native approval, runtime readiness, default activation, or an OS sandbox. Drift and malformed requests launch nothing; an uncertain result after one launch is not retried. The command does not install, acquire, update, roll back, restart, alter host configuration, or create a persistent trust grant. See [installation and managed execution](docs/installation.md).

Implemented and tested foundations include 27 Pi-native Skills, ODD routing and writer-admission primitives, evidence/review controls, registry discovery/refresh and startup/watch lifecycle, bounded choice/question interaction, a read-only code-intelligence adapter, signed recovery, and admitted local memory R01–R09. These primitives and the injectable extension facade are not proof of a production ODD workflow. The public extension export resolves to the shipped entry; packed-install verification checks the real Pi host boundary and visible commands, not TUI journeys.

The remaining ecosystem scope includes full interaction presentation and mutation-consumer integration, real CodeGraph CLI/index lifecycle, complete public agent lifecycle, cross-platform registry startup/watch evidence, workspace and production profile providers, history selector/import/migration and broader host evidence, metrics, and presentation. Status, doctor, agents, changes, and profiles commands still lack configured production providers where applicable; facade fixtures are not production integration. The shipped interfaces and limits are described in [runtime tools](docs/runtime-tools.md). See [the current reconciliation](odd/tasks/ecosystem-reconciliation.md) and [canonical roadmap](odd/tasks/ecosystem-strict-parity.md). `npm run audit:ecosystem` validates honest claims; a passing validator or general CI does not establish complete runtime parity. Provider-limited Skill evidence stays PARTIAL under the accepted GSP-06 closure.
