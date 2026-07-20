# 01 — Measures are a state, and the export follows it

Type: grilling
Status: resolved

**The question:** every wall carried its dimension and every room its area,
unconditionally, on screen and in the export — so a plan dense enough to be
useful was too noisy to show anyone. Should measures become a toggle, what
exactly does it cover, and does the export follow it?

## Answer

Measures become a **state with two values**, shown by default, toggled from a
button beside the Grid's — and the toggle **reaches the PNG export**: what is
hidden on screen is absent from the exported image.

Decided, one question at a time:

- **Scope — wall dimensions and room areas.** Not the placement dimensions of an
  opening, not the live length of the wall being drawn (both are feedback for a
  gesture in progress; hiding them would make the gesture blind), not the room
  name (not a measure), not the Tool panel's Dimensions rows (not on the sheet).
- **Export — follows the screen.** The situation that makes someone hide
  measures is almost always the situation where they are about to share the
  plan; a toggle that cleaned only the screen would fail exactly there. Accepted
  cost: a per-device preference means the same plan exports differently from two
  devices, as the Theme already does.
- **Selection — no override.** Hiding is global; selecting a wall does not bring
  its dimension back, so a hidden plan stays clean whatever is selected.
  Adjusting a dimension's placement means showing measures again — formatting
  work — and the Tool panel keeps the numbers readable meanwhile.
- **Icon — `RulerDimensionLine`**, which draws a cote rather than an instrument:
  the button is a display toggle, not a tool, and the tools live in another zone.
- **Shortcut — none**, matching the Grid toggle beside it. Giving one to this
  toggle and not to its twin would be arbitrary, and the shortcuts have no
  discovery surface today.
- **Vocabulary — a new term, `Measure`**, with the membership rule *a measure is
  permanent and exported*. It derives the scope above instead of listing it, and
  answers in advance for any number added to the sheet later. `Dimension` and
  `Room area` become its two kinds; `Placement dimension` is explicitly outside.
- **Persistence — per-device**, `localStorage`, key `plan-maker:measures`. The
  third literal copy of the grid/snap storage code triggered the rule of three: a
  `booleanPreference` helper now holds the discipline once.

Rejected alternatives are recorded in
[ADR 0008](../../../docs/adr/0008-hidden-measures-are-hidden-from-the-export-too.md):
toggling the screen only, asking at export time, storing the choice in the plan,
letting the selection override the hiding, and hiding room areas with the room
name.

**Consequence to assume:** an unlabeled room shows nothing at all when measures
are hidden — its text block held only the area, and a block that renders nothing
must not linger as an invisible drag target.

## Comments

Decided and implemented in a grilling session (2026-07-20).

Plumbing note: the recap had the preference living in `App.tsx` behind a
`useMeasurePreference` hook, prop-drilled into `Editor`. Implementation kept the
state in `Editor` exactly like the Grid's, and has `App` read the preference at
export time instead — avoiding required props on `Editor`, which 15 test files
render as `<Editor />` across 42 call sites. `png.tsx` still takes an explicit
argument and never reads storage.

Two readers of one preference is the cost of that shape, and the first draft got
it wrong: `App` re-derived the value from `localStorage`, where `save` fails
silently when storage is unavailable and `load` then answers `true`. In private
mode the screen would hide measures and the export would print them — the exact
promise of ADR 0008, broken. Caught in review. `measurePref.ts` now holds the
value for the session and uses storage only to outlive a reload, so the two
readers cannot disagree; a test pins it by making `setItem` throw.
