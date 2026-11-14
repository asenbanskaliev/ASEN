# Navigate the work panel with your active host keys

Open `/asen-panel` in an interactive terminal. The read-only panel uses the keybinding manager supplied to that interaction; it does not load or save a separate keymap.

## Controls

| Panel action | Host action | Default key |
| --- | --- | --- |
| Scroll down / up | `tui.select.down` / `tui.select.up` | Down / Up |
| Next section | `tui.input.tab` | Tab |
| Show selected section | `tui.select.confirm` | Enter |
| Return to all sections | `tui.editor.deleteCharBackward` | Backspace |
| Close | `tui.select.cancel` | Esc / Ctrl+C |

The panel-local aliases **j/k** (scroll), **Space** (fold selected section), and **q** (close) remain available. They are not separately remappable; avoid assigning host actions to those keys.

## Compatibility

- Host assignments replace the corresponding defaults, including empty assignments that disable an action. Configure and reload them through the host's existing keybinding workflow.
- Without a supplied manager exposing `matches`, the existing literal arrows, Tab, Enter, Backspace, Esc and Ctrl+C remain supported, along with the panel-local aliases.
- Text and selector fallbacks, explicit `/asen-panel` section arguments, width limits and read-only projections are unchanged.
- Changing the active session or project hides the snapshot and closes the panel on subsequent input. Navigation never dispatches work, accepts results or grants permission.

## Limits

This is a modal keyboard-navigation improvement, not a persistent rail or fullscreen replacement. Mouse interaction, visual equivalence and real-terminal acceptance remain unverified.
