# 11 — Group moves realign to the grid

**What to build:** dragging a wall body or a multi-selection brings the geometry
back onto the 10 cm grid instead of preserving whatever off-grid offset it had.
The group still translates **rigidly** — internal shape preserved — but the
displacement is chosen so that a single **reference point lands exactly on a
grid intersection**:

```
delta = gridRound(ref + rawDelta) − ref     with ref constant for the drag
```

An off-grid element therefore realigns on its first ordinary move, and plans
heal progressively through normal use.

The reference is **the selection's wall point nearest the grab position**,
chosen once at pointer-down in plan coordinates and fixed for the whole drag —
fixing it is what keeps the preview from jumping a few centimetres whenever a
different candidate becomes nearest:

- **single wall body drag** — the wall endpoint nearest the click, not always
  `a` and not a bounding-box corner (which need not be a real plan point);
- **multi-selection drag** — the nearest wall point across *all* selected walls,
  regardless of which element was clicked, since the clicked element may be an
  opening, which has no point of its own. Distance ties break deterministically
  (endpoint `a` first, then lowest id) — an implementation detail, not a
  user-visible rule;
- **a selection with no wall point at all** (openings and/or room labels only) —
  no realignment; such a group drag already translates nothing.

Alt keeps its current meaning for group moves: no snapping, whole-centimetre
rounding only. Pressing or releasing Alt mid-drag switches only the delta
computation, never the reference.

A group move snaps to the **grid only** — no point snapping, no wall-body
snapping, no axis lock. A group drag has no anchor and expresses no connection
intent; running the full ladder would stick the group to a point nobody is
aiming at, and could pull it *off* the grid on a gesture whose whole purpose is
to return it there. A group landing on an existing point is a geometric side
effect, never an intent.

Coincident-point merging on drag-end stays exactly as it is today
(`planarize(mergeCoincidentPoints(...))`) — no intent guard, no collision
avoidance. Two Points at the same position is a state ADR 0003 declares
impossible at the model level, and it would not survive a reload anyway. The
safety net is undo: the merge happens inside the gesture's history group, so one
undo restores the exact pre-drag plan.

This ticket ships **no drag feedback**: no marker at the reference's landing
intersection, no signal for an impending merge or for a wall about to
degenerate. Existing point-placement feedback (green ring, dashed guide, green
dot) is untouched.

A throwaway implementation of this semantic exists on the branch
`prototype/07-realign-feedback` and can be used as a reference.

See `.scratch/grid-snap/spec.md` §5–§7.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Dragging an off-grid wall body without Alt lands its reference endpoint
      exactly on a grid intersection, and the wall's length and angle are
      unchanged.
- [ ] The reference is the wall point nearest the grab position, and stays the
      same point for the whole drag even as the pointer moves closer to another
      one.
- [ ] In a multi-selection the reference is the nearest wall point across all
      selected walls, including when the pointer went down on an opening.
- [ ] With Alt held the group move rounds to whole centimetres and performs no
      snapping; pressing or releasing Alt mid-drag does not change the
      reference.
- [ ] A selection containing no wall point drags without error and changes
      nothing.
- [ ] A group move never snaps onto an existing point, a wall body, or an axis.
- [ ] Coincident points still merge on drag-end, and a single undo restores the
      pre-drag plan.
- [ ] Tests cover the realigned delta, the reference choice (single wall,
      multi-selection, tie-break), Alt free mode, and the empty-of-wall-points
      selection.
