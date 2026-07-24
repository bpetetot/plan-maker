# Axis snapping is removed — the grid is the only alignment target

The snap ladder locked a drawn segment to the nearest 45° / horizontal /
vertical axis whenever the direction from the drawing anchor fell within a
fixed **angular** tolerance (±8°) of an octant. An angular band projects a dead
zone that *grows with distance* — ~1.5 grid rows swallowed at 1 m from the
anchor, ~4 rows at 3 m — so the farther a wall was drawn, the more grid
intersections near the axis became unreachable: the axis flattened every
near-axis grid point onto the axis. That is the concrete complaint that opened
this decision.

The axis rung is **removed entirely**, both the pure `axis` rung (between wall
body and grid) and the axis ∩ wall refinement of ADR 0002. The snap ladder is
now **`point > wall body > grid`**. `snapPoint` loses its `anchor` option, the
`axis` snap kind, the `axisFrom` field and its dashed guide, and all of
`lockedAxis` / `nearestCrossing`.

The trigger for keeping the axis — drawing an exactly straight wall from an
**off-grid** anchor — turned out not to hold: an off-grid drawing session runs
with Snap off (ADR 0007), which already suspends the axis lock. So the only
place the axis fired was from an on-grid anchor, where the grid already yields
axis-aligned walls by its 10 cm step; the axis added only robustness against a
trembling hand, at the price of the growing dead zone. Net negative.

## Considered Options

- **Reshape the band from angular to a constant perpendicular distance** —
  rejected: it caps the dead zone but keeps a rung whose only surviving value
  (holding a long line straight) is thin, and adds a second tolerance to tune.
- **Replace the automatic lock with an explicit `Shift`-to-constrain modifier**
  — deferred, not rejected: a clean opt-in with no dead zone, but it is a new
  feature for a need not yet felt. Add it later if straight-line drawing is
  missed.

## Consequences

- Ending a wall exactly on another wall's body no longer keeps the drawn wall
  rigorously straight — the junction is the plain orthogonal projection of the
  cursor. Accepted.
- From an off-grid anchor (a T-junction start), the following segment is no
  longer straightened onto an axis. Narrow case, accepted.
- **Supersedes ADR 0006** entirely — absolute grid-crossing graduation of the
  axis no longer exists. **Amends ADR 0002** (the axis ∩ wall consequence is
  dropped) and **ADR 0007** (its "keep the 45° axis lock" reasoning is moot; a
  Free move now suspends only the grid).
