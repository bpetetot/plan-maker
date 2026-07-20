# 06 — 45° axis rule when the anchor is off-grid

Type: grilling
Status: resolved

> **Superseded by [ADR 0006](../../../docs/adr/0006-axis-snapping-targets-absolute-grid-crossings.md).**
> The answer below stands for the on-grid anchor. For the off-grid anchor it was
> reversed: the endpoint no longer inherits the offset — it lands on the grid
> crossings the axis meets, and the length absorbs the offset. The inherited
> offset turned out to be hereditary, propagating to every wall drawn from an
> off-grid point, which no later group move was reliably going to catch.

## Question

Decision [03](03-diagonal-grid-crossings.md) makes diagonals snap to grid
crossings (dx and dy both grid multiples) — which presumes the anchor is
on-grid. When the anchor is off-grid (Alt-placed, or a junction on a wall
body), the diagonal crosses no grid intersection at all. What is the fallback?

Candidates:

- Step dx = dy = k·GRID relative to the anchor (keeps exact 45°, endpoint
  inherits the anchor's offset — consistent with "off-grid is a deliberate
  choice").
- Fall back to the current length-stepping behaviour.
- Snap to the grid intersection nearest the axis (abandons exact 45°).

## Answer

Axis snapping becomes uniformly **relative to the anchor**: the endpoint sits at
`dx = i·GRID`, `dy = j·GRID` from the anchor — on a diagonal `|i| = |j| = k ≥ 1`,
on an orthogonal axis one component is zero. The existing minimum step of one
GRID is kept, so the endpoint never collapses onto the anchor.

From an on-grid anchor this reproduces exactly the grid crossings of decision
[03](03-diagonal-grid-crossings.md) — the on-grid case becomes a special case of
the relative rule, so the spec carries a single formulation instead of a rule
plus a fallback.

From an off-grid anchor the endpoint inherits the anchor's offset: the wall is
exactly 45° (or orthogonal) and stays off-grid, consistent with decision
[02](02-keep-alt-free-mode.md) — off-grid is a deliberate choice, and a later
non-Alt move realigns it.

Rejected: the current length-stepping (reintroduces the defect 03 fixes — an
endpoint neither exactly 45° nor on a clean step); snapping to the grid
intersection nearest the axis (abandons exact 45°, already rejected in 03, and
mixes two regimes within one segment).

Snap priority ([04](04-keep-snap-priority.md)) and the axis ∩ wall-body
intersection (ADR 0002) are unchanged.

## Comments

Decided in a grilling session (2026-07-20).
