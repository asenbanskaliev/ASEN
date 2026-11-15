# UFC-M4-02b — Rail probe v2 executed results, capability matrix and recommendation

Status: EXECUTED EVIDENCE. Prepared in W5-A on branch `w5-research` at candidate
`4d3bbb8713287659d841ab6d03723d5a315080fc` (verified remote tip). This document does not decide
the rail architecture; it converts the two open W4 unknowns into defined verdicts and hands the
remaining real choice (B vs C) to the owner. No M4-03 implementation design is prepared because
Option A failed admission (W5 §2: "Si A no permite demostrarlo, registra el bloqueo y evita
crear una imitación mediante overlays").

## Why v2 exists (S6: no repeat without changes)

Probe v1 (`docs/audit/evidence/rail-feasibility-probe-ef4507f35a99.json`) derived persistence and
reflow from PTY output-line parsing and never captured a render-path width: its own receipt pins
`reflow.baselineMaxWidth: null`, `widgetPersistence.presentAfterActivity: null` and a non-VERIFIED
`resize-behavior` (permanent provenance test: `tests/rail-feasibility-probe-v2.test.ts`).

Probe v2 (`scripts/rail-feasibility-probe-v2.mjs`) measures INSIDE the effective host render. It
mounts instrumented components through public factory APIs and records the exact `width` argument
the host passes into `render(width)`:

- `setHeader(factory)` — the custom header lives inside `documentContainer` (the conversation
  document slot), so its render width is the conversation's allocated width.
- `setWidget(key, factory, {placement:"aboveEditor"})` — the candidate persistent rail mount.
- `custom(factory, {overlay:true, overlayOptions:{width:30, anchor:"top-left", nonCapturing, visible}, onHandle})`
  — overlay occlusion geometry via `OverlayHandle.getBounds()`.
- `ctx.ui.getEditorText()` for typed-text conservation, `TUI.getFocusedComponent()` for focus.

No private container was touched, no PTY line width is parsed anywhere in v2, and `before_agent_start`
throws so model/provider/network calls are structurally zero.

## Executed runs (reproducible)

| Run | Command | Role | Result |
|---|---|---|---|
| Windows primary | `node scripts/rail-feasibility-probe-v2.mjs --start-width 140 --resize-width 120 --role primary --out docs/audit/evidence/rail-feasibility-probe-v2-4d3bbb87-primary.json` (with `ASEN_EXPECTED_SHA` pinned) | admission-eligible (≥140, matrix rule) | exit 0; receipt written; class **ADDITIVE NO RESERVATION** |
| Windows supplementary | same with `--start-width 120 --resize-width 140 --role supplementary --out docs/audit/evidence/rail-feasibility-probe-v2-4d3bbb87-supplementary.json` | non-admission corroboration | exit 0; receipt written; class **ADDITIVE NO RESERVATION** |
| Linux | attempted in WSL Ubuntu: `node` is not installed; making the identical run reliable would require environment changes outside the authorized scope | — | **UNKNOWN** (S11) |
| macOS | no macOS runtime available in this environment | — | **UNKNOWN** (S11) |

## Capability matrix (executed, this candidate)

Legend: VERIFIED = public-API observation succeeded in the executed host render; GAP = demonstrable
absence measured; UNKNOWN = not measurable in this environment; INDETERMINATE = measurement parseable
but not decisive. v2 produced no INDETERMINATE row: every number came from render-path frames.

| Capability | win32 140→120 (primary) | win32 120→140 (supplementary) | Linux/macOS |
|---|---|---|---|
| Public mount surface present (`setWidget`, `setHeader`, `custom`, `getEditorText`, `getFocusedComponent`, `getBounds`) | VERIFIED | VERIFIED | UNKNOWN |
| Persistent widget across typing, updates, overlay, resize (render frames 4/4/6/2, 0 before mount, 0 after dispose) | VERIFIED | VERIFIED | UNKNOWN |
| Reserved transcript column (conversation render width shrinks while a rail is mounted) | **GAP — document slot measured at exactly 140 before AND after the rail mount; resize re-render at 120 confirmed** | **GAP — slot 120 before AND after mount; re-render at 140 confirmed** | UNKNOWN |
| Transcript reflow classification | NO_REFLOW_OBSERVED | NO_REFLOW_OBSERVED | UNKNOWN |
| Resize re-render inside the host render (v1's GAP) | VERIFIED | VERIFIED | UNKNOWN |
| Typed-text conservation via `getEditorText()` (type → overlay → resize → dispose) | VERIFIED | VERIFIED | UNKNOWN |
| Focus stability (focused component stays the editor: `CustomEditor` in every phase) | VERIFIED | VERIFIED | UNKNOWN |
| Overlay behavior | OCCLUSION_OBSERVED — `getBounds()` `{col:0,width:30}` composited over an unshrunk 140-column transcript | OCCLUSION_OBSERVED | UNKNOWN |
| Disposal cleanliness (rail frames stop, overlay bounds gone, editor text kept) | VERIFIED | VERIFIED | UNKNOWN |
| Rail candidate class (owner W5 §2 four-way) | **ADDITIVE NO RESERVATION** | **ADDITIVE NO RESERVATION** | INCONCLUSIVE (UNKNOWN environment) |

Structural corroboration from the pinned host source (facts, not assumptions): the root is a
vertical `Container` whose `render(width)` forwards the identical width to every child
(`@earendil-works/pi-tui` `dist/tui.js:138-150`), `TuiMainScreen.doRender` renders at
`this.terminal.columns` (`dist/tui-main-screen.js:214-233`), overlays are composited onto base
lines by `compositeTuiLine` (`tui.js:157-178`), and `setWidget` offers only
`placement:"aboveEditor"|"belowEditor"` (`pi-coding-agent` `core/extensions/types.d.ts:47,101-104`;
`interactive-mode.js:1853-1886`). The executed measurement now confirms the structural reading.

## Anti-laundering gates (enforced by tests, not prose)

`tests/rail-feasibility-probe-v2.test.ts` (10 tests, RED observed before the module existed, then
GREEN; non-vacuity proven by mutating the reflow threshold to `>=0` — suite failed — and reverting):

- position-only evidence can never produce RESERVED COLUMN (validator requires raw render-path
  width numbers and a sustained measured narrowing, recomputed from the observation bytes);
- an occlusion-over-unshrunk-transcript can never be relabeled a rail
  (`rail-candidate-class` RESERVED COLUMN demands `transcript-reflow` REFLOW_OBSERVED);
- missing measurements stay INCONCLUSIVE and cannot be upgraded by narrative;
- primary admission refuses `measuredWidth < 140` (matrix rule); sub-140 runs must self-declare
  `runRole:"supplementary"`;
- persistence requires a rendered frame in every mounted window, and windowing excludes
  mount-time and resize-time contamination (both defects observed live in the first v2 run and
  pinned by tests).

## Recommendation (no option approved by intuition)

- **Option A (public Pi APIs as an authentic persistent rail): DISPROVEN for the rail goal by
  executed evidence.** The public surface can mount persistent content (VERIFIED additive widget
  with full preservation/focus/resize/disposal), but it demonstrably reserves no transcript
  column; overlay paths occlude and per the owner's rule ("Una superposición no cuenta como barra
  lateral auténtica") are not rails. R02's persistent branch stays BLOCKED, now on measured
  absence rather than on inconclusive instrumentation.
- **Option C (keep the current additive interface): evidence-backed for what it is.** ASEN's
  existing `setWidget`-based status/todo rows are exactly the ADDITIVE NO RESERVATION shape the
  probe verified as safe (no editor invasion, no occlusion, clean disposal). If the goal stays
  "informative rows near the editor", C is sufficient — VERIFIED on win32, UNKNOWN elsewhere.
- **Option B (own presentation layer): the only path to an authentic reserved column, and it is
  an owner architecture decision, not a technical discovery.** It carries the costs the W4
  document lists (own renderer/compositor boundary or a host-level layout contribution, plus its
  own preservation/resize/disposal contract). Nothing in the executed evidence makes B cheap, and
  nothing in it forecloses B either.

Suggested posture for W5: classify the persistent-rail question as CLOSED-NEGATIVE for Option A
(this receipt set is the durable evidence), continue shipping under Option C, and put B vs C final
choice with the owner. Do NOT build an overlay imitation of a rail in the meantime.

## Limitations

- One executed session per run, win32 only; ConPTY quirks are not generalizable to Linux/macOS,
  which remain UNKNOWN until a reliably repeatable environment exists (S11).
- `railWidth` spans mounted windows, so it legitimately shows both 140 and 120 frames; the
  reservation question is decided by the document-slot comparison, not by rail width.
- The overlay bounds sample (`{col:0,width:30,height:1}`) reflects the probe's 30-column,
  single-line probe component; the classifier only ever treats overlay geometry as occlusion
  evidence, never as a rail candidate.
- This document admits no implementation, changes no queue state, and `globalFull:false` remains.
