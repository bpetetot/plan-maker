# 10 — Axis snapping is relative to the anchor

**What to build:** when the user draws a wall and the direction locks to a 45°
axis, the endpoint lands at a whole number of grid steps *on each component*
from the anchor — `dx = i · GRID`, `dy = j · GRID`, with `|i| = |j| = k ≥ 1` on
a diagonal and one component zero on an orthogonal axis — instead of stepping
the segment's length.

From an on-grid anchor the endpoint therefore lands on a grid intersection and
the wall is exactly 45°; the perceived step along a diagonal becomes ~14.1 cm
rather than 10 cm. From an off-grid anchor (Alt-placed, or a junction projected
onto a wall body) no grid crossing exists on the diagonal, so the endpoint
inherits the anchor's offset: the wall is still exactly 45°, and a later
non-Alt group move is what brings it back onto the grid. This is deliberately
**one formulation with no fallback branch** — the on-grid case is a special
case of the relative rule, not a rule of its own.

Everything else about axis snapping is untouched: the snap priority ladder
(existing point > wall body > 45° axis > grid), the angular tolerance, axis
detection, the dashed guide, the minimum of one grid step so the endpoint never
collapses onto the anchor, and the axis ∩ wall-body intersection rule of
ADR 0002.

See `.scratch/grid-snap/spec.md` §3–§4.

**Blocked by:** None — can start immediately.

**Status:** done

> **Superseded by [ADR 0006](../../../docs/adr/0006-axis-snapping-targets-absolute-grid-crossings.md)**
> and ticket [14](14-axis-crossings-absolute-to-the-grid.md), which replaced the
> stepping-from-the-anchor rule with absolute grid crossings. The on-grid
> acceptance criteria below still hold; the off-grid one was reversed.

- [x] From an on-grid anchor, a diagonal axis-locked endpoint lands on a grid
      intersection and the two components of the segment are equal in absolute
      value.
- [x] From an off-grid anchor, the endpoint carries the same sub-grid offset as
      the anchor and the segment is still exactly 45° (or exactly orthogonal).
- [x] Orthogonal axis locks still step by whole grid multiples along the moving
      component and leave the other component equal to the anchor's.
- [x] The endpoint never coincides with the anchor: the minimum of one grid step
      is preserved.
- [x] Snap priority, angular tolerance, the returned `axisFrom` guide data, and
      the axis ∩ wall-body intersection behaviour are unchanged — covered by
      existing tests still passing.
- [x] Tests cover on-grid anchor, off-grid anchor, orthogonal lock, and the
      minimum-step case.
