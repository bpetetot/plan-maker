# 02 — The visual register of placement dimensions

Type: prototype
Status: resolved
Blocked by: 01 (resolved)

Ticket 01's findings:
`.scratch/placement-dims-ux/research/contextual-dim-conventions.md` on branch
`research/placement-dim-conventions` — read with
`git show research/placement-dim-conventions:.scratch/placement-dims-ux/research/contextual-dim-conventions.md`.
Read it before building: it names the levers, the shipped Sweet Home 3D
implementation of this exact feature, and four registers to avoid (editable-
looking styling, cursor-following tooltips, a fixed HUD, red).

## Question

The central decision of this map. Placement dimensions must leave the wall
Dimension's line and read as a different kind of measure, so both can be on
screen at once without confusion. What do they look like, and where do they
sit?

Build a throwaway prototype wired to the real editor (drag a door along a
wall, with the wall Dimension left visible) so the human can react to
something concrete. Variants should span genuinely different registers, not
restyles of the same one — informed by ticket 01's findings. Axes to explore:

- **Position**: inside the wall body; on the wall axis; offset on the opposite
  side from the wall Dimension; hugging the opening; following the cursor.
- **Line treatment**: the current broken dimension line with ticks; arrows
  between bounds; a plain bracket; a bare value with no line.
- **Color and contrast**: accent color vs the neutral `.dim` grey; a filled
  chip/pill behind the text vs bare text on the sheet.
- **Text treatment**: size and weight relative to the wall Dimension, so the
  hierarchy reads as permanent-vs-transient at a glance.

Judge each variant on the case that motivated this map: a wall with its
Dimension visible while an opening is dragged, both readable without a moment
of "which number is which?". Also check the hard cases: a short clearance, an
opening near a junction, two openings on the same wall, and the dark theme.

The retained variant feeds the display rules (ticket 03) and the spec
(ticket 04). Note which axes the verdict leaves open — they become fog or
ticket 03's material.

## Answer

**Variant A wins: a filled `--accent` chip with `--accent-contrast` text,
centred on each clearance, sitting on the wall axis inside the wall body. No
line, no ticks, no witness lines.** Text pinned to screen pixels while the wall
Dimension keeps scaling with the plan.

Prototype on the throwaway branch **`prototype/placement-dim-register`**
(`8224bab`) — five variants behind `?variant=`, mounted on the real editor with
the wall Dimension left visible and a selection trigger added, so the collision
case was judged in situ rather than in a vacuum. Read with
`git show prototype/placement-dim-register:src/editor/placementDimsPrototype.tsx`.

### Why A

It abandons the dimension-line vocabulary entirely and takes **the one position
no other register occupies** — the wall's own centreline. The collision that
forced the hiding workaround is removed *by construction*, not by arbitration:
there is no longer a shared slot to contend for. Combined with the accent fill
(colour being the universal carrier per ticket 01), "which number is which?" is
answered twice over — by position and by colour — before the reader has to
think about it.

### The variants that lost, and what each one taught

- **A2** (A plus a broken sheet-coloured dashed line in the wall body) — tried
  at the human's request. Rejected: the line **reintroduces the very
  dimension-line vocabulary A had shed**, which is what made A immune to the
  confusion in the first place. The chip alone carries the measure; the line
  only re-opens the question.
- **B** (accent bracket, side opposite the wall Dimension) — keeps a linear
  frame, so the two registers still argue about sides; and it spends the
  opposite side, which is not ours to spend.
- **C / C2** (opaque band on the wall face, `--wall-hover` then `--sheet`) —
  liked, but beaten by A. Its first draft was illegible, which produced a
  finding worth keeping: **a graphic drawn on the wall has the wall as its
  background, not the sheet**, so `--accent` — a blue picked to contrast the
  white sheet — nearly vanishes on `#2f2f2f`. C only worked once repainted in
  `--wall-hover`, the token already trusted on top of a wall. This does not
  affect A: the chip is a filled shape carrying its own background.

### Axes the verdict settles

- **Position**: the wall axis, inside the body. **Line treatment**: none.
  **Colour**: `--accent` fill, `--accent-contrast` text. **Text**: 9 px
  semi-bold, pinned to screen pixels.

### Axes the verdict leaves open — successor tickets

1. **The register is sideless for *drawing*, but not for *measuring*.** The chip
   sits on the axis, so no side governs where it goes. But the measured value
   still comes from `faceSpan(plan, wall, side)`, and the two sides give
   different silhouette bounds at mitered junctions — so a side is still an
   input to the *number*, just no longer to its *placement*. Ticket 03 must
   decide the rule for that surviving use, which is a strictly smaller question
   than the one it was written to ask.
2. **The zero-clearance question changes shape.** With no line, nothing can be
   "too short to draw" — only the chip can fail to fit between its bounds. The
   LayOut leader-line precedent from ticket 01 loses most of its relevance; the
   live question is whether an overflowing chip still shows. Stays ticket 03's
   material, reshaped.
3. **Screen-pixel pinning is a lock, not a floor.** The prototype pins
   outright; Chief Architect ships a *floor*. Now sharp enough to ticket — see
   ticket 06.
