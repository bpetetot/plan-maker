# Group moves realign to the grid — a move fixes alignment, never inherits it

> Amended by [ADR 0007](0007-snap-is-a-state-alt-inverts-it.md) (2026-07-20):
> Snap became a persisted state rather than a permanent behavior, so the
> progressive healing promised below only holds while Snap is on. Alt is now an
> inversion of that state, not the sole cause of a Free move — read "non-Alt
> move" throughout as "snapped move".

The editor promises that everything lands on the 10 cm grid, and group moves
broke that promise: the delta of a wall-body or multi-selection drag was rounded
to grid multiples, so an element off-grid by 3 cm stayed off-grid by 3 cm
however many times it was moved. Off-grid geometry is legitimate — Alt free mode
exists to enter the real measurements of an existing home — but it must stay a
deliberate choice, not something an ordinary move perpetuates forever.

A group move now translates rigidly, as before, but the delta is chosen so that
a **reference point lands exactly on a grid intersection**:

```
delta = gridRound(ref + rawDelta) − ref      with ref constant for the drag
```

The reference is **the selection's wall point nearest the grab position**, fixed
at pointer-down: the nearest endpoint across all selected walls, whatever
element was actually clicked (the grab may be an opening, which owns no point).
Fixing it at pointer-down is what keeps the preview from jumping a few
centimetres each time a different candidate becomes nearest. A selection holding
no wall point realigns nothing — such a group already translates nothing.

A group move snaps to the **grid only**: no point snapping, no wall-body
snapping, no axis lock. The snap ladder of ADR 0002 (existing point > wall body
> 45° axis > grid) governs *placing a point*, where the user aims at a
connection; a group drag has no anchor and expresses no connection intent — the
user is moving a mass. A group landing on an existing point is therefore always
a geometric side effect, never an intent.

What follows that landing is unchanged: drag-end still runs
`planarize(mergeCoincidentPoints(...))` **unconditionally** (ADR 0003), with no
intent guard and no collision avoidance.

Alt free mode is untouched: it suspends snapping and rounds to whole
centimetres, for group moves as for point placement.

## Considered Options

- **Force every point of the group onto the grid** — rejected: it is not a
  translation. It would distort exact 45° diagonals and any internal geometry
  whose spacing is not a grid multiple, silently rewriting the shape the user
  drew.
- **Keep delta stepping and add an explicit "realign" command** — rejected: it
  leaves the default experience broken and makes the grid guarantee a chore the
  user has to remember, on a plan where they cannot see which points are off by
  3 cm.
- **Guard the merge** (skip it when the landing was not aimed at) — rejected: it
  would leave two Points at the same position, the state ADR 0003 declares
  impossible at the *model* level, not merely at the gesture level. It would not
  even survive a reload, since load and import normalization merges coincident
  points anyway. The safety net is undo, and the exposure is narrow — the
  collision requires an exact landing within the 1 cm junction tolerance, not
  merely passing within snap tolerance.

## Consequences

- Off-grid plans heal progressively through ordinary use: an element realigns on
  its first non-Alt move. No migration is needed, and none is provided.
- A group move can shift the selection by a non-grid-multiple amount — that is
  the point. The internal shape is preserved exactly; only the group's absolute
  position changes.
- The merge and the planar insertion that follow happen inside the gesture's
  history entry, so one undo restores the exact pre-drag plan, including a wall
  that degenerated and was deleted with its openings.
- The realigning move ships silent — no drag feedback of any kind: no marker at
  the reference's landing intersection, no signal for an impending merge, no
  signal for a wall about to degenerate. Undo is the whole safety net. Existing
  point-placement feedback is untouched; this covers group moves only.
- The silence is a deliberate **"not now"**, not a permanent no. The rework's
  value is the grid guarantee itself, and shipping it unadorned keeps the first
  implementation small. The counter-argument — that the colliding point may be
  far from the cursor or entirely off-screen — was never refuted, only
  outweighed, and is the first thing to re-read if this is re-opened.
- Recorded for whoever re-opens it: previewing the merged outcome makes a
  selected wall disappear mid-drag, so the selection empties under the user's
  hands. Any future "show the outcome" approach has to answer that.
