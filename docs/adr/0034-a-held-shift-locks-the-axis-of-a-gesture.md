# A held Shift locks the axis of a gesture

ADR 0020 removed the automatic 45° axis rung and deferred — explicitly, in its
own "Considered Options" — the option this decision takes: *replace the
automatic lock with an explicit `Shift`-to-constrain modifier*. The need it
called "not yet felt" is felt: holding a wall straight from an off-grid Point,
or sliding a room label along one row, has no gesture.

While Shift is held, a gesture that aims at a 2D position is confined to a
**line running through where its aim began**. Five moves take it (a Point, a
group, a Room label placed or born, a Ruler endpoint) and two placements (a wall
chain from its second click, a Ruler's B). The lock is a pure function of
`(origin, aim, axes, shift)`: no state, no band, the nearest of the candidate
lines recomputed at every aim.

**Where the directions come from is the whole design.** The handle of an element
already posed borrows the directions of the elements that hold it — one per wall
meeting that Point, the A→B line for a Ruler endpoint. Everything else takes the
**two world axes**, horizontal and vertical, no octants: a wall being drawn, a
Ruler's B, a group, a Room label. That split is what the gesture means in each
case. Drawing invents a segment, and what a straight one means is orthogonal;
editing a posed element moves one end of something that already has a direction,
and holding it there is "make this wall longer", not "flatten it". Locking a
posed handle onto the horizontal would bend the very wall the user was steadying,
and at a junction it would offer neither of the two lines actually under the
pointer.

## It is a constraint the ladder respects, not a rung it runs

The lock is an **alignment constraint of the gesture's own, with the last word
over Snap's ladder**. A connection target off the axis is skipped rather than
honoured: the Point rung filters to Points the line runs through, the wall rung's
projection is vetoed if it leaves the line. What settles the precedence is the
asymmetry of the escapes — releasing Shift is one finger and already the design,
whereas under the opposite reading "no, really straight" is unreachable.

The grid composes with a world axis and not with a slant: on the first, it keeps
the free coordinate while the lock holds the other at the origin's value; the
second crosses no intersection, so no alignment rung is left to run and the line
is followed by the centimeter. That is the price of a borrowed direction, and it
is the honest one — a slant is not grid-commensurate, and rounding a projected
position back onto the grid would leave the line the lock exists to hold.

Above the lock sit the **model's invariants**, which do not propose a position
but define which ones exist: `clampToRoom` keeps a label in its Room even when
that costs the axis, and `mergeCoincidentPoints` absorbs two Points a centimetre
apart, making off the axis the very connection the lock refused. Neither is a
concession — the merge already overrides the grid in production.

So the lock is a value of its own, `src/model/axisLock.ts`, named for the
glossary noun (ADR 0032) — a point and a direction, the world axes being one pair
of candidates among others. Each noun lends the directions it knows: `walls.ts`
those of the walls meeting a Point, `rulers.ts` the Ruler's own. `snap.ts`
composes with the line rung by rung. Wrapping the ladder was tried on paper and
fails at both ends: a pre-projected aim cannot filter the Point rung and grids
the held coordinate, and a post-projected result slides the wall projection onto
the axis, which is displacement where the rule says veto.

## Considered Options

- **The world axes for every gesture, posed handles included** — the shape this
  decision first shipped with, and what a day of use rejected: a handle held on
  the horizontal bends the wall it was meant to steady, and the user reads that
  as the lock failing rather than as a rule. Keeping it would also have left the
  editing gesture at odds with the drawing one, where the axis already runs
  through the other end of the segment.
- **Both — the world axes *and* the borrowed slants as candidates.** Rejected: on
  a wall already horizontal the two coincide, and everywhere else the extra pair
  gives the pointer a way to bend the wall by accident, which is the behaviour
  being removed. What a posed handle needs is the lines it is on.
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
  aim (ADR 0030); the five locking drag specs carry their `origin` and their
  `axes`, `group`'s `start` renamed to what it always was.
- **A Point no wall holds has no lock**, as a chain's first click has none: an
  empty candidate list and a missing origin say the same thing, and the type
  carries both without a rule.
