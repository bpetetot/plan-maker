# Dragging a point onto a wall body does not split the wall

Status: ready-for-agent

## Context

ADR 0002 established the invariant "walls only meet at shared Points" and
enforces it at wall-draw commit (planar insertion: T and X junctions). The
drag gestures were deliberately left out of that scope: dragging a point (or a
selection) so that it lands on another wall's body still produces a
geometric-but-not-topological contact, so a visually closed loop formed this
way is not detected as a Room.

## Expected

On drag *end* (not during the drag), if a moved point lies on another wall's
body, that wall is split at the point — same rules as ADR 0002: openings
reassigned by center (straddling/orphaned ones deleted), `dimPlacement`
dropped on both halves, the whole gesture one history entry.

Also consider: a dragged wall crossing another wall (X junction on drag end).

## Notes

Drag has its own machinery to respect: snap exclusion set, history drag
grouping (zundo helpers), multi-selection moves.
