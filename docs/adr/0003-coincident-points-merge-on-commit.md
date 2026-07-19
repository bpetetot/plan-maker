# Coincident points merge on commit — two Points never coincide

ADR 0002 made "walls only meet at shared points" true for walls, but the model
could still hold two distinct Points at the same position: a drawing click
whose grid, 45°-axis or free rounding landed exactly on an existing point
minted a twin instead of reusing it, and a drag could drop a point onto
another. Walls attached to the twins touched on screen without sharing a
point, so a visually closed loop was never detected as a Room — and since
nothing ever merged coincident points, the plan was stuck that way (deleting a
wall and redrawing it snapped onto one twin or the other, never both).

We made the missing invariant explicit: **two Points never coincide** (within
the 1 cm junction tolerance). Any commit that would land a point on another
merges them into one — resolving a drawing click reuses the existing point
whatever the snap kind (including Alt/free placement: 1 cm is sub-perceptual),
the end of a point or group drag merges coincident pairs, and loading or
importing a plan normalizes it, healing plans produced before this decision.

## Considered Options

- Reject the gesture instead of merging (refuse to place or drop a point onto
  another) — rejected: the user is aiming at the junction on purpose; refusing
  the most natural way to connect walls would fight the drawing flow.
- Make `detectRooms` tolerant of coincident points — rejected for the same
  reason as in ADR 0002: the model would lie, and every future feature would
  have to re-decode the geometry.

## Consequences

- The stationary point survives a drag merge; the first-seen point survives a
  load normalization. Walls are rewired to the survivor.
- A wall whose two ends merge into one point degenerates and is deleted with
  its openings — visible and undoable, like ADR 0002's straddling openings.
- A merge that makes two walls span the same endpoint pair keeps the oldest;
  the removed twin's openings transpose onto the survivor (same geometry —
  when the twins ran in opposite directions the offset mirrors, and a door's
  wall-relative hinge side and swing flip with the frame so the door stays
  physically identical).
- The merge happens inside the gesture's history entry: undo restores the
  exact pre-gesture plan, including the merged-away point.
- Dragging a point onto a wall's *body* is ADR 0002's invariant, not this
  one: since issue 08, drag end also planarizes — coincident points merge
  first, then walls split at the remaining junctions.
