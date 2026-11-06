# Public host UI capability admission
R01 documentary result for coding-agent 1.2.0; base `68fe5ca33cb885f8b687846273c2c9935f767919`.
This matrix is not actual-host R02 evidence, root-layout admission, source equivalence or FULL.

## Version and source boundary

- `package.json:43-53` and `package-lock.json:508-526` pin/floor the coding-agent host at 1.2.0; `scripts/pi-support-matrix.mjs:15-37` resolves both anchors to that version.
- A transitive TUI package at 1.5.0 is not a coding-agent 1.5 host-matrix claim.
- Public documentation was retrieved through the version-specific library `/earendil-works/pi/v1.2.0`, without installation, runtime mutation, private copies or provider execution. No undocumented method is admitted by a plausible name.
- Official sources: [TUI guide](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/tui.md), [RPC UI limits](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/docs/rpc-extension-ui.md), [TUI API](https://github.com/earendil-works/pi/blob/v1.2.0/packages/tui/README.md). Documentation is not a runtime observation.

## Capability matrix

| Requirement | Evidence and public surface | Result / limitation |
|---|---|---|
| Persistent content near editor | `setWidget`, placement aboveEditor/belowEditor; `extensions/asen.ts:352-387` | SUPPORTED additive widget; not reserved right-side layout. |
| Header/footer/editor replacement | Public component factories; `tests/pi-memory-skill-sdk-lifecycle.test.ts:7-13,48-58` | SUPPORTED replacement surface; not proof of additive layout. Existing footer ownership must remain unchanged. |
| Temporary interactive screen | `custom()`; `extensions/asen.ts:953-979` | SUPPORTED modal/screen and text fallback, not persistent shell admission. |
| Non-capturing positioned overlay | `showOverlay`, right anchors, nonCapturing, visible(width,height), handle hide/focus/unfocus/getBounds | PARTIAL candidate: editor focus may coexist, but overlay placement can occlude content. No root reflow/reserved-column proof. |
| Persistent root split / reserved rail / transcript reflow | No exact public root-partition interface established in the inspected versioned docs or tracked adapter | UNKNOWN; absence in inspected material is not proof of global API absence. R02-R06 persistent branch is not admitted. |
| Responsive dimensions | render(width), terminal rows, overlay visibility/bounds | SUPPORTED dimensions; durable root reflow/resize contract remains PARTIAL. |
| Editor/autocomplete preservation | Public editor/autocomplete APIs; existing type-backed lifecycle fixture | SUPPORTED APIs; simultaneous preservation under a side overlay is PARTIAL and needs actual-host evidence. |
| Native keybindings | Injected keybinding matcher and overlay focus handles; `src/runtime/native-work-panel.ts:6-14,46-67` | SUPPORTED composition; no second global keymap. |
| Disposal | Widget removal, custom done, overlay hide; `extensions/asen.ts:432,699` | SUPPORTED primitives; persistent-overlay cleanup still requires actual-host evidence. |
| Session/project ownership | `panelScope`; `extensions/asen.ts:310-317,960-964` | SUPPORTED extension-enforced composition, not automatic host authorization. |
| Non-TUI modes | Versioned RPC docs; `src/runtime/pi-host.ts:5-6,74-80` | SUPPORTED fallback. RPC may have hasUI=true while custom returns undefined; mode=tui is required for terminal-only surfaces. |

## Decision

1. R01 is complete as a documentary matrix. It does not admit the full persistent split rail.
2. R02 remains BLOCKED for that full contract: the overlay is only a PARTIAL alternative, not a supported root-partition candidate.
3. Do not patch private containers, modify the runtime, install a different SDK, invent setRail, or call an occluding overlay a reserved rail.
4. R07-R15 may use the already supported widget/status/modal branches after bounded gap analysis; reuse existing projections, commands and stores rather than add wrappers for already implemented behavior.
5. An actual overlay experiment would have to identify persistence across turns, input/autocomplete, resize, disposal and occlusion versus reflow explicitly. It cannot pass root-layout admission by measuring position alone.

## Checks and remaining proof

- Source/document inspection only; no model, shell-provider, terminal-probe, test-suite or lifecycle action executed for this result.
- Public examples and mode limits came from exact-tag documentation, not a mock exposing an invented method.
- R02 actual-host witness, root-partition capability and any changed-candidate CI remain unproven.
- Original unavailable refresh verification is neither retried nor satisfied by this matrix.
