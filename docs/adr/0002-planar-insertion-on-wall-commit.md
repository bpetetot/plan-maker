# Planar insertion on wall commit — walls split at junctions

Room detection walks the shared-point wall graph, so a wall started or ended on
another wall's body used to create a free point with no topological link: the
loop looked closed on screen but stayed open in the model, and the room was
never detected. We fixed the model, not the detection: committing a drawn wall
performs full planar insertion — an endpoint snapped onto a wall's body splits
that wall in two (T junction), and a crossing splits both walls at the
intersection, including the new wall itself (X junction). The invariant "walls
only meet at shared points" is thus always true, and `detectRooms` stays purely
topological.

## Considered Options

- Keep the model as-is and make `detectRooms` geometry-tolerant (treat a point
  lying on a segment as connected) — rejected: the model would lie ("not
  connected" in data, "connected" on screen), and every future feature
  (dimensions, deletion, export) would have to re-decode that geometry.

## Consequences

- Snap priority gains a "wall body" target: existing point > wall body > 45°
  axis > grid. The snapped position is the orthogonal projection onto the
  segment, rounded to integer cm; rounding may drift off the line by a
  fraction of a cm, which is harmless because the connection is topological.
- Splitting a wall reassigns each opening to the half containing its center;
  the start-side half keeps the original wall id so its openings keep their
  `wallId` and `offset`. An opening straddling the cut, or no longer fitting
  its half, is deleted (visible, undoable).
- Both halves drop their `dimPlacement` and revert to default rendering — a
  ratio chosen on the full wall means nothing on a half.
- The whole commit (splits + reassignments + new wall) is a single history
  entry: undo restores the exact pre-gesture plan.
- Dragging a point onto a wall body still bypasses the invariant — known
  limitation, tracked as issue 08.
