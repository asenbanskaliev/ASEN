# UFC-M4-02 — Rail architecture options A/B: research proposal (NOT approved)

Status: PROPOSAL ONLY. This document does not decide UFC-M4-02, does not admit any rail
implementation, and does not change queue R02. The owner's decision (W4 §5) remains the
only gate that can open UFC-M4-03. Prepared 2026-11-08 on branch `w4-comms` at the
verified remote lineage `5824911d`.

Evidence base (no new host execution was performed for this document):

- Executed probe receipt: `docs/audit/evidence/rail-feasibility-probe-ef4507f35a99.json`
  (real Pi 1.2.0 host, win32, measured at 140 columns, resized to 120; zero model,
  network and provider calls). Per the W4 authorization, UFC-M4-01 is not re-run — this
  receipt is the sole authorized evidence base.
- Documentary matrix: `odd/evidence/ui-host-public-capability-matrix.md` rows `:16-:26`,
  decision rules `:30-:34`.
- Queue rows: runbook `:127` (R01 DONE with executed probe) and `:128` (R02 BLOCKED —
  no supported public root-partition candidate emerged).

Terminology is fixed by the probe receipt's own capability keys. VERIFIED/GAP/UNKNOWN/
INDETERMINATE are used exactly as the receipt defines them in its `limitation` field:
VERIFIED only where a listed public-API observation succeeded; UNKNOWN = measurement not
parseable; GAP = demonstrable absence in this run; INDETERMINATE = observed but not
decidable from this evidence. Absence in one run is not proof of global API absence.
Analysis-type statements (cost, version risk) are labelled ANALYSIS — they are reasoning,
not executed evidence.

## What the two options are

- **Option A — public Pi integration.** Build the rail exclusively from the observed
  public extension surface: additive widgets (`setWidget`), temporary screens (`custom`),
  positioned non-capturing overlays (`showOverlay`), public component factories, and the
  shipped status/widget plumbing already used by `extensions/asen.ts`.
- **Option B — own compatible presentation layer.** ASEN renders and owns its presentation
  alongside or instead of Pi's, aiming for visual compatibility without relying on Pi
  layout APIs for the reserved column.

## Capability-by-capability comparison

| Capability | Option A verdict | Option B verdict | Evidence |
|---|---|---|---|
| Persistent reserved-width column (real root split) | UNKNOWN (after execution) | UNKNOWN (never executed; no public host surface reserves width for an extension, and private containers are forbidden by matrix rule `:32`) | receipt `persistent-root-split-rail: UNKNOWN`; matrix `:20`; decision rules `:30-:32` |
| Transcript reflow (content width shrinks when the rail is open) | INDETERMINATE (PTY line joins defeated the width measurement: `baselineMaxWidth: null`, `delta: null`) | UNKNOWN (no observation exists for B) | receipt `transcript-reflow: INDETERMINATE`; matrix `:20` |
| Editor/autocomplete preservation | VERIFIED **under the non-capturing overlay only** (typed token kept echoing; overlay never captured input). Persistence of an additive widget across activity remains UNKNOWN (`presentAfterActivity: null`) | UNKNOWN by construction (B does not touch the Pi editor, but "beside the editor" reintroduces the root-split UNKNOWN above) | receipt `input-preservation-under-overlay: VERIFIED`, `overlay-noncapturing: VERIFIED`, `additive-widget: UNKNOWN`; matrix `:22` |
| Resize | GAP (documented absence in this run: the widget did not re-render at 120 columns; the overlay did adapt) | UNKNOWN (a self-owned layer could in principle handle resize; no evidence exists) | receipt `resize-behavior: GAP` (`reRendered: false`, `overlayAdapted: true`) |
| Focus and keyboard | VERIFIED that a non-capturing overlay does not steal focus, and keybinding composition is supported with no second global keymap; UNKNOWN how a persistent rail would take and release focus (never admitted, so never probed) | UNKNOWN; a fully own layer would have to reimplement focus/keyboard routing, and the M4-03 no-go forbids any second keymap/R21 conflict | matrix `:23`; receipt disposal/focus observations; plan row UFC-M4-03 field 12 |
| Disposal cleanliness | VERIFIED (overlay and widget both disposed clean) | UNKNOWN (no run) | receipt `disposal-cleanliness: VERIFIED` |
| Cross-platform | UNKNOWN beyond win32: the probe executed one platform only. The per-platform PTY witness pattern exists (t10 receipts) but was not run for the rail probe | UNKNOWN (no run on any platform) | receipt `platform: "win32"` and its `limitation`; matrix `:40` |
| Maintenance cost | ANALYSIS — medium: the surface is public and version-pinned, but the observed resize GAP and widget-persistence UNKNOWN mean A needs per-release workarounds and re-probing | ANALYSIS — high: every Pi rendering change can silently break visual compatibility; Pi offers no stability contract for a foreign layer laid beside it | pinned host `package.json:43-53`; matrix decision `:33` |
| Pi-version risk | ANALYSIS — real but bounded: upgrades re-run the shipped probe (`scripts/rail-feasibility-probe.mjs`) whose schema already rejects position-only and missing-reflow claims (self-test booleans in the receipt) | ANALYSIS — higher: B's contract is with undocumented behavior of each Pi build; RPC-mode UI quirks (hasUI true while `custom()` unavailable, matrix `:26`) already show the surface is not uniform across modes | receipt `selfTest` fields; matrix `:26`, `:9` |

## What neither option can claim today

No VERIFIED evidence supports a persistent reserved-width rail on either option. Option
A's only VERIFIED persistent-adjacent capability is the overlay coexistence trio
(non-capturing, input preservation, disposal) — and the matrix states explicitly that
overlay coexistence "is not root reflow/reserved-column proof" (`:19`, decision 2). An
occluding overlay must never be presented as a rail (mission §16 / matrix `:32`).
Position bounds alone never pass admission (matrix `:34`).

## Proposal to the owner (not a decision)

1. **Neither option is ready for admission today.** R02 stays BLOCKED and UFC-M4-03 stays
   closed; this is the honest reading of the executed evidence, not a tactic.
2. If the owner wants to keep M4 alive, the cheapest next step is a second probe revision
   under option A that closes exactly the two decisive unknowns — it is a small,
   evidence-producing change, not an implementation:
   - make widget persistence observable (the current run could not parse
     `presentAfterActivity`; a deterministic render-marker would convert UNKNOWN to
     VERIFIED or GAP);
   - measure reflow inside the host render path instead of via PTY line joins (the
     INDETERMINATE today comes from the measurement method, not from the host).
   Only the outcome of such a run could turn the root-split cell green for A.
3. Option B should not be chosen to escape the two unknowns: every B cell above is
   UNKNOWN, and its maintenance/version analysis is strictly worse. B stays on record as
   the fallback if a future host release makes Pi's public layout contract unsuitable —
   not as today's admission.
4. In the meantime shipped UI keeps using only already-supported branches (additive
   widget, status, modal screen) per matrix decision 4 — the current state of R07-R17 —
   with no rail implication.
5. The W3 navigator budget fix (`eb3b3300`) is a reminder of the class of regression a
   rail would widen: row budgets and detail/list modes already interact with any added
   column; the differential check used there should be part of any future rail admission
   evidence.

## Checks for this document

- Documentation-only unit: no production format, workflow, registry or gate changes;
  `globalFull:false` untouched; no rail code written.
- Regression: `node scripts/audit-upstream-boundary.mjs` exit 0 on the edited/added
  documents.
