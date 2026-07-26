# A held Shift locks the axis of a gesture

ADR 0020 removed the automatic 45° axis rung and deferred — explicitly, in its
own "Considered Options" — the option this decision takes: *replace the
automatic lock with an explicit `Shift`-to-constrain modifier*. The need it
called "not yet felt" is felt: holding a wall straight from an off-grid Point,
or sliding a room label along one row, has no gesture.

While Shift is held, a gesture that aims at a 2D position is confined to one of
the **two world axes** — horizontal or vertical, no octants — running through
**where its aim began**. Five moves take it (a Point, a group, a Room label
placed or born, a Ruler endpoint) and two placements (a wall chain from its
second click, a Ruler's B). The lock is a pure function of `(origin, aim,
shift)`: no state, no band, the nearer axis recomputed at every aim, ties to the
horizontal.

## It is a constraint the ladder respects, not a rung it runs

The lock is an **alignment constraint of the gesture's own, with the last word
over Snap's ladder**. A connection target off the axis is skipped rather than
honoured: the Point rung filters to Points whose held coordinate is the
origin's, the wall rung's projection is vetoed if it leaves the axis, and the
grid keeps the free coordinate while the lock holds the other at the origin's
value. What settles the precedence is the asymmetry of the escapes — releasing
Shift is one finger and already the design, whereas under the opposite reading
"no, really straight" is unreachable.

Above the lock sit the **model's invariants**, which do not propose a position
but define which ones exist: `clampToRoom` keeps a label in its Room even when
that costs the axis, and `mergeCoincidentPoints` absorbs two Points a centimetre
apart, making off the axis the very connection the lock refused. Neither is a
concession — the merge already overrides the grid in production.

So the lock is a value of its own, `src/model/axisLock.ts`, named for the
glossary noun (ADR 0032), and `snap.ts` composes with it rung by rung. Wrapping
the ladder was tried on paper and fails at both ends: a pre-projected aim cannot
filter the Point rung and grids the held coordinate, and a post-projected result
slides the wall projection onto the axis, which is displacement where the rule
says veto.

## Considered Options

- **A third direction borrowed from the grabbed element** — the slant of the
  wall or Ruler under the gesture, beside the two world axes. Deferred, not
  rejected: it holds a *line* where this type holds a coordinate, gets no
  composition rule from "one constraint per coordinate", and turns the label
  clamp's near-coincidence into a divergence in the ordinary case. Nothing here
  forecloses it — the lock is momentary, so there is no stored shape to migrate.
- **The lock as a state or a preference**, symmetrical to Snap (ADR 0026) —
  rejected: a permanent "everything is locked" has no use case and would make
  half of all moves impossible without switching it off. Two-second bursts earn
  a finger, not a toggle.
- **Clamping a label *along* the axis** rather than letting the Room clamp win —
  rejected: line ∩ polygon-with-holes geometry, the class ADR 0020 buried,
  bought for the one element that carries no connection and no dimension.
- **Chrome for the lock** — a guide line, or a snap marker that says "on the
  axis". Rejected on a bench at 1:1: a bounded guide *is* the rubber band while
  drawing, a full one hides under the axis-aligned wall it constrains, and a
  marker change would lie in the one case where an invariant takes the result
  off the axis. ADR 0020's dashed guide stays dead — this reopens its modifier,
  not its chrome.

## Consequences

- **Shift + press on an element body is now an additive grab**, not a bare
  selection toggle: the gesture runs on `selection ∪ {ref}`, lit at the press,
  and a press that never moves toggles the ref at the levée. Under Shift an
  unselected element cannot move without joining the Selection; the escape is to
  press without Shift and press Shift after.
- **Amends ADR 0020.** Its removal of the automatic rung stands entirely and the
  ladder is still `point > wall body > grid` — the lock is not a rung. One
  sentence of it is retracted: `snapPoint` takes an origin-shaped argument
  again, but as an already-resolved constraint the three rungs respect, never as
  a rung that computes a band from an anchor.
- **Generalises ADR 0007** from Alt to any gesture modifier: read off the live
  event, never tracked, toggling mid-gesture both ways. That is what fixes the
  origin at the grab rather than at Shift-down — remembering *when* Shift went
  down would be tracked state, and would break the down → up → down round trip.
  It costs a visible jump when Shift joins mid-drag, which is what "this whole
  move was straight" means.
- **Shift held prevents closing a wall chain** whose start Point is off the
  axis: the Point rung cannot see it. Pressing or releasing Shift without moving
  the pointer changes nothing until the next `pointermove` — Alt's behaviour
  today, inherited unchanged.
- The pointer router carries `locked` beside `free` on the three intents that
  aim (ADR 0030); the five locking drag specs carry their `origin`, `group`'s
  `start` renamed to what it always was.
