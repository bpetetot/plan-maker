# Map: placement dimensions UX/UI

Labels: wayfinder:map

## Destination

Placement dimensions have their own visual language, distinct from wall
Dimensions, so both can coexist on screen — specified in `CONTEXT.md` and the
plan-maker spec, **then implemented**, with the wall-Dimension hiding
workaround removed.

## Notes

- **This map carries implementation** (overriding wayfinder's plan-don't-do
  default): the last ticket is the code change, not a hand-off.
- Skills: `/grilling` + `/domain-modeling` for decision tickets, `/prototype`
  for the UI ticket, `/research` for the research ticket. Grilling style: one
  question at a time, with a recommendation.
- The problem: `PlacementDims` (`src/editor/render.tsx`) reuses the wall
  Dimension's whole visual vocabulary — same `dimLineFrame`, same offset, same
  `ExtentLine`, same `.dim` class, same side. They occupy the same slot on
  screen, which is why the wall Dimension is hidden during the gesture: a
  collision fix, not a design choice.
- Framing decisions from the charting session:
  - Scope is **visual only** — placement dims stay passive feedback, not a
    numeric input control.
  - **They coexist**: the wall Dimension no longer disappears. Placement dims
    leave the dimension line and change register.
  - **Trigger**: during the place/move gesture **and** while the opening is
    selected.
- Current semantics to preserve or consciously revise, decided by the
  `measure-semantics` map: interior side when the wall borders exactly one
  room (else the wall Dimension's side); each side chaining from the nearest
  neighbouring opening's edge; tape-measurable values; never exported.
  See `CONTEXT.md` → **Placement dimension**.
- Coupling: the `selection-panel` effort is in flight (floating card on the
  left, live values during drags, display-only measures). Canvas dims on
  selection complement it; adding a placement row *inside the panel* belongs
  to that effort, not this one.
- Project motto: simplicity beats precision (audience: private individuals).

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [01 — How do drawing tools distinguish contextual dimensions from permanent ones?](issues/01-research-contextual-dim-conventions.md)
  — color is the universal carrier (interaction accent vs drawing foreground),
  and the contextual measure either abandons the dimension-line frame entirely
  (Archicad, AutoCAD, SketchUp, Figma) or recolors and boxes the value (Revit);
  **no tool surveyed hides or dims its permanent dimension**, confirming this
  map's coexistence decision. Sweet Home 3D ships this exact feature in open
  source — accent color, screen-pixel-pinned text, zero-length feedback
  dropped. Findings in
  `.scratch/placement-dims-ux/research/contextual-dim-conventions.md` on branch
  `research/placement-dim-conventions` (`d774bd8`, second pass `0f8ad56`).
  Second pass, after the blocked domains were allowed: Chief Architect
  documents a **pixel floor** for temporary dimensions (screen-only, explicitly
  not affecting print/export) — a shipped answer to the small-zoom fog; LayOut
  moves a cramped label off its dimension onto a **leader line** — a precedent
  for the zero-clearance fog. Two first-pass claims corrected: Figma is *not*
  selection-persistent (Revit and Chief Architect are our real trigger
  matches), and one tool did once suppress a register — the **contextual** one,
  opposite to our workaround.

- [02 — The visual register of placement dimensions](issues/02-visual-register-prototype.md)
  — **a filled `--accent` chip with `--accent-contrast` text, centred on each
  clearance, on the wall axis inside the wall body. No line, no ticks, no
  witness lines**, text pinned to screen pixels. It takes the one position no
  other register occupies, so the collision that forced the hiding workaround
  is gone *by construction* rather than by arbitration. Five variants judged in
  the real editor with the wall Dimension left visible, on branch
  `prototype/placement-dim-register` (`8224bab`): a dashed line added inside
  the wall (A2) lost for reintroducing the dimension-line vocabulary the chip
  had shed; a bracket on the opposite side (B) lost for keeping a line at all;
  a band on the wall face (C/C2) was the runner-up. C also produced a lever
  worth keeping: **a graphic drawn on the wall has the wall as its background**,
  so `--accent` — picked to contrast the sheet — is nearly invisible on it, and
  `--wall-hover` is the token that reads there. The verdict leaves the register
  **sideless for drawing but not for measuring** (ticket 03) and leaves
  pin-vs-floor open (ticket 06).

- [03 — Display rules: selection, multi-selection, and the notion of side](issues/03-display-rules.md)
  — six rules, and the through-line is that **the chip's own properties answer
  almost every hard case by doing nothing special**. Trigger: **every opening in
  the selection**, no cardinality threshold; a selected wall stays silent for its
  openings. Side: **unchanged** (`interiorSide ?? frame.side`) — this map's scope
  is visual, so `measure-semantics` is not reopened; the side now governs the
  *number* alone, never the position. Gesture and selection render **identically**
  — the moving values carry the attention hierarchy. **No transition**: a drag
  and a placement both select the opening, so the chip merely continues to exist
  past the release. Overflow: it **shows and overflows**, never shrinks (which
  would contradict ticket 06) and never shifts; two near-abutting openings
  overlapping is the accepted ugly case. Zero clearance: **unchanged** — that
  side shows no chip, the other shows normally. Derived for ticket 04: an opening
  selected alongside a wall keeps its chips during a group move.

- [06 — The pixel floor: how the chip behaves as the plan zooms out](issues/06-pixel-floor.md)
  — **a lock, not a floor**: the chip keeps the same physical size at every zoom
  (`scale(1/pxPerCm)`, as the ticket 02 prototype already rendered it). The floor
  was the more precise answer and lost to the simpler one — it needs an underivable
  threshold, gives the chip two regimes, and leaves it obeying drawing scale over
  most of the range, the very property this map denies it. The whole chip obeys,
  padding included, and **only its size**: the centre stays in plan coordinates
  (ticket 03 forbids shifting). Size is the prototype's — 9px text, `.dim`'s own
  value — and there is **no threshold left to pick**. The chip **never disappears**:
  zooming out is the short clearance in disguise, so ticket 03's show-and-overflow
  rule covers both, and the feedback never blinks out mid-gesture. The **wall
  Dimension is unchanged** — it keeps scaling, and ticket 04 must write that down
  as the *reason* the registers differ: the wall Dimension is drawing (it belongs
  to the sheet, it leaves through PNG export) so it obeys drawing scale, while the
  chip is interaction chrome that is never exported, which is what entitles it to
  disobey.

- [04 — Write CONTEXT.md and the spec](issues/04-write-spec-and-context.md)
  — the decisions are now in the project's own words. Two judgement calls:
  the name **survives** (the glossary names what a thing means, not how it is
  drawn — the vocabulary bleed is blocked instead by an explicit "deliberately
  not drawn as a Dimension" and by `_Avoid_: Chip — the graphic is a chip, the
  concept is not`); and an **ADR is warranted, but not about placement
  dimensions** —
  [ADR 0005 — Interaction chrome is pinned to the screen](../../docs/adr/0005-interaction-chrome-is-pinned-to-the-screen.md)
  records the principle ticket 06 exposed in passing: a graphic obeys the
  drawing scale **iff it is exported**, size pinned but position left in plan
  coordinates. The chip is a consequence there, not the subject, and the Grab
  zone turns out to have been the same rule stated for one case. Written:
  `CONTEXT.md` → **Placement dimension** (the "they replace the wall's
  Dimension" sentence is gone), spec §4 openings and §4 pan/zoom/dimensions,
  ADR 0005. No neighbouring entry contradicted the change.

- [05 — Implement the new placement dimensions](issues/05-implement.md)
  — shipped: `PlacementDims` now draws one `--accent` pill per clearance on the
  wall axis, wrapped in a `scale(1/pxPerCm)` group, with the side reduced to
  picking the value; `ExtentLine`, the dimension-line offset and the `.dim`
  class left it, and a new `text.placement-chip` rule carries the chip's own
  text. `Editor.tsx` renders a deduped set of the gesture opening plus every
  opening in the selection, and the wall-Dimension hiding filter is **gone** —
  every `DimLabel` now renders unconditionally, which is this map's destination
  reached. Typecheck, 353 tests, lint and build green. Two notes: the old
  "selecting is not moving" test became its exact opposite (the restriction only
  ever existed because the registers shared a slot), and PNG export needed no
  work — `PlanScene` never referenced `PlacementDims`, exactly as ADR 0005
  predicted.

## Not yet specified

<!-- both patches graduated once ticket 02 fixed the register: small-zoom
     legibility became ticket 06, and the zero/overflow case folded into
     ticket 03, reshaped by the loss of the line. Nothing dim remains in
     view — the route to the destination is now fully ticketed. -->

_(empty)_

## Out of scope

- Numeric entry of an opening's placement (typing a clearance to position the
  opening) — the scope was ruled visual-only; typed entry is its own effort.
- PNG export — placement dims are editor feedback and are never exported
  (decided by the `measure-semantics` map); the new register does not change
  that.
- A placement row in the selection panel — belongs to the `selection-panel`
  effort.
