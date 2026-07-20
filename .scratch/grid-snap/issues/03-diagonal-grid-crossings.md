# 03 — 45° diagonals step on grid crossings

Type: grilling
Status: resolved

## Question

Axis snap steps the *length* by 10 cm then rounds to whole cm, so a 45°
diagonal endpoint lands off-grid (length 70 → (49.5, 49.5) → rounded (49, 50):
off-grid and no longer exactly 45°). What rule for diagonals?

## Answer

Step on grid crossings: on a diagonal, snap to the points where the axis
crosses grid intersections — dx and dy both multiples of GRID. A 45° wall
drawn from an on-grid anchor has both endpoints exactly on-grid and stays
exactly 45°. The perceived step along the diagonal becomes ~14.1 cm instead
of 10. Orthogonal axes are unaffected (already on-grid from an on-grid
anchor).

Rejected alternatives: status quo (off-grid diagonal endpoints that
realignment can never fully heal); direction-only lock with free position
along the axis (even more off-grid points).

Open follow-up: what happens when the anchor itself is off-grid (Alt-placed) —
no grid crossings exist on the diagonal ([06](06-offgrid-anchor-axis-fallback.md)).

## Comments

Decided in the charting grilling session (2026-07-20).
