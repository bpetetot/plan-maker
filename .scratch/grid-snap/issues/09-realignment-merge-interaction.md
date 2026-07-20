# 09 — Realignment landing on existing points: merge behavior and preview

Type: grilling
Status: resolved

## Question

With the reference-point rule settled ([05](05-reference-point-rule.md)), a
realigned group move can land wall points exactly on existing plan points.
ADR 0003 merges coincident points on commit. Two aspects to settle:

- Is that merge desirable when it happens as a *side effect* of realignment
  (the user was aligning to the grid, not aiming at the other point), or a
  surprise that needs guarding (e.g. only merge when the pointer was near the
  target, or require point-snap intent)?
- How is the impending merge previewed during the drag vs at release? Group
  moves currently show no snap feedback at all; realignment is computed live
  with a fixed reference ([05](05-reference-point-rule.md)), so a merge at
  commit could be invisible until it happens. Related: does the point > grid
  snap priority ([04](04-keep-snap-priority.md)) apply to group moves at all,
  or only to single-point drags?

## Answer

### Group moves snap to the grid only

The snap priority of [04](04-keep-snap-priority.md) — point > wall body > 45°
axis > grid — governs *placing a point*: drawing a point, or dragging one on
its own. It does **not** extend to group moves. A group's reference point
([05](05-reference-point-rule.md)) realigns to the nearest grid intersection
and nothing else.

Rationale: a group drag has no anchor and expresses no connection intent — the
user is moving a mass, not aiming at a junction. Running the full ladder would
make the whole group stick to a point nobody is looking at, and could pull the
group off-grid on a gesture whose entire purpose (non-Alt) is to return it to
the grid.

Consequence: landing on an existing point during a group move is always a
geometric side effect, never an intent.

### The merge is unconditional

Coincident points still merge at commit, exactly as today
(`Editor.tsx` drag-end: `planarize(mergeCoincidentPoints(...))`). No
intent guard, no collision avoidance.

Rejected — guard the merge (keep both points when the pointer was far from the
target): it would produce two Points at the same position, the state ADR 0003
declares impossible at the *model* level, not merely at the gesture level. That
state is the unrecoverable one the ADR describes (a visually closed loop never
detected as a `Room`), and it would not even survive a reload, since load and
import normalization merges coincident points anyway.

Rejected — avoid the collision by realigning to a different intersection: moves
the group a full grid step for reasons invisible to the user, and contradicts
[01](01-realign-reference-point.md)'s guarantee that the reference lands on the
grid.

The safety net stays undo: the merge happens inside the gesture's history group
(ADR 0003), so one undo restores the exact pre-drag plan. The exposure is also
narrow — the collision requires an exact landing (within the 1 cm junction
tolerance), not merely passing within snap tolerance.

### An impending merge is signalled live during the drag

Not signalling it (relying on undo alone) is rejected: the point that collides
need not be the reference. The group translates rigidly, so every group point
already aligned with the reference lands on the grid too, and the collision can
happen anywhere in the selection — potentially far from the cursor, entirely
off-screen.

A post-hoc signal is rejected too: it arrives once the damage is done and still
has to explain what merged, where a live signal lets the user correct with a
few more pixels of movement.

Scope of the rule:

- The signal covers **every** colliding point of the moving selection, not just
  the reference.
- It must also cover the case where a wall **degenerates** — ADR 0003 deletes a
  wall whose two ends merge, along with its openings. Showing only "these two
  points will become one" undersells a wall about to disappear.

Cost is negligible: the reference is fixed for the drag and the delta is already
recomputed on every `pointermove`, so detecting coincidence is a comparison over
the moving points.

**The visual form is deliberately not decided here.** It belongs to
[07](07-realignment-feedback.md), which prototypes it together with the
realignment feedback itself: both signals occupy the same moment and the same
screen space, and designing them separately would yield two competing visual
vocabularies.

### Revision (2026-07-20, via [07](07-realignment-feedback.md))

**The "signalled live during the drag" rule above is overturned.** No signal
ships: neither the impending merge nor the degenerating wall is surfaced during
the drag, and neither is the realignment itself. Undo is the whole safety net —
the option this ticket had rejected.

What stands unchanged: group moves snap to the grid only, and the merge is
unconditional. Only the signalling half is reversed.

The reasoning that argued for a live signal (the colliding point may be far
from the cursor or off-screen) was not refuted — it was outweighed by keeping
the first implementation small, against an exposure narrowed by the 1 cm
junction tolerance. It is the argument to re-read first if this is re-opened.

## Comments

Decided in a grilling session (2026-07-20); signalling half revised the same
day, see above.
