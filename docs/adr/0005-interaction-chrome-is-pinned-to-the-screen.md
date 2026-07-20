# Interaction chrome is pinned to the screen — only drawing obeys the drawing scale

Two populations of graphics share the sheet, and they had never been told
apart. **Drawing** is what the user is making: walls, openings, room labels,
dimensions. **Interaction chrome** is what the editor adds so the drawing can
be manipulated: grab zones, the Rail, snap feedback, placement dimensions.
Everything was drawn in plan coordinates by default, so everything shrank
together on zoom-out — which is correct for drawing and wrong for chrome, whose
whole job is to stay usable at the size the user's eyes and pointer actually
have.

The rule: **a graphic obeys the drawing scale if and only if it is exported.**
PNG export is not a coincidental test here, it is the definition — export
renders the document, and the document is precisely what has a real-world size.
Anything that exists only to serve the gesture has no real-world size to
respect, and is sized in screen pixels instead.

Position and size separate. Chrome is pinned in **size** only: its anchor stays
in plan coordinates, because it points at something in the drawing and must not
drift away from it. A placement dimension chip therefore keeps its centre on the
clearance it measures and scales its own body by `1/pxPerCm`; the grab zone
keeps the element's body and adds a constant on-screen margin around it.

This settles two questions that had been argued case by case:

- **Placement dimensions vs the wall Dimension.** They differ in register
  because they differ in nature, not by arbitration: the wall Dimension is
  drawing and keeps scaling, the chip is chrome and does not. This is what
  entitles the chip to disobey a scale everything around it obeys.
- **What happens when the plan zooms out far.** Chrome does not need a
  legibility threshold, because it never becomes illegible. The question only
  arose while chrome was being scaled like drawing.

## Considered Options

- **A pixel floor** — clamp chrome to a minimum on-screen size, letting it scale
  with the drawing above that. Rejected: it needs an underivable threshold, it
  gives one graphic two regimes, and over most of the zoom range it leaves
  chrome obeying the drawing scale, which is the very property this decision
  denies it. It was the more precise answer and lost to the simpler one.
- **Hide chrome below some zoom** — rejected: feedback that blinks out
  mid-gesture is worse than feedback that overlaps. A short clearance and a
  zoomed-out plan are the same situation, and both are answered by letting the
  graphic overflow.
- **Keep scaling chrome, and shrink or shift it to fit** — rejected: shifting
  breaks the anchor's meaning (a measure that moved is a measure that lies about
  what it measures), and shrinking reintroduces the drawing scale by the back
  door.

## Consequences

- PNG export needs no filter for chrome beyond the one it already has: chrome is
  identified by the same rule that excludes it.
- New editor feedback inherits a default instead of a debate — pin the size,
  anchor in plan coordinates, and do not add a threshold.
- Chrome can overlap the drawing and itself at extreme zoom-out: two
  near-abutting openings can have their chips overlap. Accepted, and preferred
  to any of the alternatives above.
- The Grab zone entry in `CONTEXT.md` already stated this rule for one case; it
  is now the general one. Full rationale for the placement dimension case in
  `.scratch/placement-dims-ux/issues/06-pixel-floor.md`.
