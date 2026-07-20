# Snap is a state, and Alt inverts it

Snap was a permanent behavior that one key escaped: Alt held meant a Free move,
Alt released meant the full ladder, with no way to say "I am drawing this whole
plan from real measurements". Entering a surveyed home — where almost no wall
lands on a 10 cm multiple — meant holding Alt for the length of the session,
which is not a gesture, it is a posture.

Snap becomes a **state with two values**, on by default, and Alt becomes an
**inversion** of whatever state is current rather than a cause of its own:

```
free = !snapEnabled !== altHeld
```

The same key therefore reaches a Free move from Snap and a snapped placement
from Free, which is what makes the mode safe to leave on: the escape hatch works
in both directions, so a user drawing with Snap off is never stuck away from the
grid.

What "free" *means* is unchanged — the semantics of the existing Free move, not
a new one. The connection targets (existing Point, wall body) survive, the
alignment targets (45° axis, 10 cm grid) are suspended, integer-centimeter
rounding remains. Connecting is topology, aligning is geometry, and only the
second is what Free escapes. `snapPoint` keeps its single `free` flag and gains
no branch; the whole change lives in what the editor passes to it, at its four
call sites.

The state is a **per-device preference** (`localStorage`, the storage discipline
of the Grid and Theme), never part of the plan and never exported — Snap is
editor behavior, and a plan carries geometry, not the way it was drawn.

## Considered Options

- **Free means no snap at all**, connection targets included — rejected: it
  breaks the invariant of ADR 0002/0003 that a drawn wall joins the plan's
  topology. A user drawing off-grid still wants their walls to *meet*; they are
  escaping the grid, not the model.
- **Free suspends the grid but keeps the 45° axis lock** — rejected: a third
  rung in the ladder, hence a third case to document, test and explain, for a
  need the axis lock already serves badly off-grid (ADR 0006 graduates the axis
  on absolute grid crossings, which is precisely what Free is escaping).
- **Store the mode in the plan** — rejected: contradicts "Snap is pure editor
  behavior, never part of the plan" and would force the persistence schema to
  carry a UI preference between users.
- **Reset to Snap on every load** (session state, like Tool defaults) —
  rejected: it defeats the purpose for the surveyed-plan user, who would
  re-enable it every session. The toggle is permanently visible on screen, so
  the sticky state is never silent — which is the risk that argument guards
  against.
- **Free hides or dims the Grid** — rejected: the Grid is a reading rule as much
  as a snap target, and CONTEXT.md already fixes one direction of the
  independence ("showing or hiding it never affects Snap"). Keeping the converse
  true makes the rule symmetric and leaves two orthogonal toggles instead of two
  states writing over each other.

## Consequences

- The toggle shows the **effective** state, Alt included: it unpresses while Alt
  is held with Snap on and presses while Alt is held with Snap off, so it answers
  "will this snap, right now". A click always toggles the mode, never the
  inversion. This is why Alt moved from a `useRef` to `useState` in the editor —
  the key now has to re-render. Auto-repeat is absorbed by React's bail-out on an
  unchanged value.
- **This amends ADR 0004's first consequence.** That decision promised off-grid
  plans heal progressively, "an element realigns on its first non-Alt move". With
  a persisted mode, that move may never come: a whole plan can now live off-grid,
  deliberately and durably. Realignment is no longer a guarantee of the model,
  only of Snap being on.
- `S` toggles the mode, under the existing `isTypingTarget` guard so that naming
  a room never flips it.
