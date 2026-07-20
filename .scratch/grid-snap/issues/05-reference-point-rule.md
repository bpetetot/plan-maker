# 05 — Which point is the realignment reference?

Type: grilling
Status: resolved

## Question

Decision [01](01-realign-reference-point.md) realigns a group move so that its
reference point lands on a grid intersection. Which point exactly?

Cases to settle:

- Dragging a single wall body: which of its two endpoints (nearest to the
  grab position? always `a`?)
- Multi-selection drag: the grabbed element's point (`clickRef` exists in
  `startPlanDrag`), or the point of the selection nearest the grab?
- Selection containing no wall points (openings and/or room labels only):
  is there a reference at all, or does the move stay delta-stepped / free?
- Should the reference be stable for the whole drag (chosen at pointer-down),
  so the preview doesn't jump between candidates mid-drag?

## Answer

The reference is **the selection's wall point nearest the grab position**,
chosen once at pointer-down (in plan coordinates) and **fixed for the whole
drag**:

- Single wall body drag: the wall endpoint nearest the click — not always `a`,
  not the bbox corner (which may not be a real plan point).
- Multi-selection drag: the nearest wall point across all selected walls,
  regardless of which element was clicked (`clickRef` may be an opening, which
  has no point of its own). Distance ties break deterministically
  (implementation detail, e.g. endpoint `a` / lowest id).
- The delta each move is `gridRound(ref + rawDelta) − ref` with `ref`
  constant; pressing/releasing Alt mid-drag switches only the delta
  computation (ticket 02), never the reference.
- Selection with no wall point: no realignment — an openings-only group drag
  already translates nothing (`translateElements` only moves wall points), and
  solo opening/label drags are separate gestures, unaffected.

Rejected: re-evaluating the nearest point mid-drag (preview jumps of a few cm
at each switch); canonical references like always-`a` or the group bbox corner
(realigns a point far from the cursor, or a phantom point that leaves no real
point on-grid).

## Comments

Decided in a grilling session (2026-07-20).
