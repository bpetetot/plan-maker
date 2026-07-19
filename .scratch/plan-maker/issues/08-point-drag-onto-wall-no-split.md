# Dragging a point onto a wall body does not split the wall

Status: resolved

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

## Comments

Implemented as `planarize(plan)` in `src/model/operations.ts`: a fixpoint
that splits any wall under a point lying on its body (T junction) and both
walls at any crossing (X junction), reusing `splitWall` — so openings
reassign by center (straddling/orphaned deleted) and `dimPlacement` drops,
per ADR 0002. A wall dropped along another (collinear overlap) resolves too:
the T splits carve the host at the dropped wall's ends and the resulting
same-pair twin dedupes per ADR 0003's twin rule. Wired at drag end in
`Editor.tsx` after `mergeCoincidentPoints`, inside the gesture's history
group (one undo entry).
Drag snapping itself is unchanged: no wall-body snap target was added to the
point-drag gesture, so off-grid wall bodies are only hit when the drop lands
within the 1 cm junction tolerance (grid-aligned walls, the common case, work
naturally).
