# Deleting a room keeps other rooms' walls

Deleting a Room removes its own walls and openings but keeps every wall that is
the outer-loop (`pointIds`) outline of another detected room. The promise is
narrow and exact: no *other* room is ever broken by deleting one. A room read
from the Selection (ADR 0014) is the trigger — any other Selection deletes
exactly what it holds, so a party wall selected on its own is still deletable.

The kept wall is the one whose removal would *destroy* another room, not merely
change it. A wall destroys room R only if it lies on R's outer loop, because R's
area is bounded by that loop and its holes only subtract from it. This single
test settles the two shapes of a shared wall that look alike but must be treated
apart:

- A **party wall** between two side-by-side rooms is on the outer loop of both.
  Removing it merges them, destroying both — so it is kept.
- An **island wall** is the island room's outer loop but only the container's
  *hole* loop. Deleting the **island** removes it: the container's outer loop is
  untouched, so the container survives and reclaims the floor. Deleting the
  **container** keeps it: it is the island's outline, and the island survives
  standing alone.

Openings need no rule of their own: an opening dies with its wall and lives with
it, so a door on a kept party wall stays (it belonged to both rooms anyway), and
a door on a removed wall goes.

## Considered options

- **Keep a wall whenever its far side faces another room.** Rejected: it reads
  the geometry, not the topology, and gets the island backwards. The far side of
  an island wall faces the container's floor, so this rule would keep it on an
  island delete — leaving the island's walls standing inside a room that should
  have reclaimed the space.
- **Delete the whole boundary, as before.** Rejected: it is the behaviour this
  decision exists to replace — deleting one room shreds every neighbour that
  shares a wall with it, which on any real multi-room plan is most of them.
- **Delete the room's own walls even when it is fully enclosed.** Rejected for
  the one room whose every wall is a neighbour's outline (a grid's centre cell):
  there is nothing that belongs only to it, and removing its walls would merge
  and destroy every neighbour at once. Deleting it does nothing instead — the
  only outcome that keeps the promise.

## Consequences

- The Tool panel's room counts describe the room's whole boundary, read from the
  room and never from the neighbours (ADR 0014). They are no longer a preview of
  what Delete removes: on a room that touches other rooms, Delete takes fewer
  walls than the count states. The count stays a property of the room so the same
  room never reports different numbers depending on what surrounds it.
- Deleting a fully-enclosed room is a silent no-op. It is rare, and the
  alternative broke the surrounding rooms.
