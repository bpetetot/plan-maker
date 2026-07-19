# 02 — What is a wall's drawing and storage anchor?

Type: grilling
Status: resolved
Blocked by: 01

## Question

Today a wall is drawn and stored on its axis (the line between its two
Points), thickness spreading half on each side. Decide the anchor model:

- Keep the centered axis as-is?
- Per-wall justification (left/center/right reference line, Revit-style)?
- Draw on a face but store the axis (or the reverse)?
- User's idea to study: keep the anchor centered but start the wall on the
  side it is framed against.

The decision must say what snapping references and how the choice affects
measure stability as junctions form. Free hand on the stored model — no
migration constraint (not in production).

## Answer

Resolved 2026-07-19, grilling session.

1. **The centered axis stays the only anchor**, stored and drawn — no per-wall
   justification, no offset. Thickness keeps spreading half on each side of
   the axis. This is the consumer-tool pattern (Sweet Home 3D, Floorplanner)
   and matches the current model; the professional insight retained from the
   research is that the anchored line — not the faces — is where drawn and
   typed lengths must live, because it is junction-invariant.
2. **Snap references the axis only**, unchanged: existing Points, wall axes,
   45° axes, the 10 cm grid. Faces are never snap targets — face snapping
   would mix two reference systems and create ambiguous near-junctions,
   against "walls only meet at Points".
3. **Stability consequence**: the axis length is the only junction-invariant
   measure of a wall. It is the canonical reference that tickets
   [03](03-dimension-display-prototype.md) (dimension display) and
   [04](04-opening-placement-dims.md) (opening placement dims) must position
   the room-side ("tape-measurable") values against. The "measure the room
   side" need is addressed by display/entry semantics, not by moving the
   anchor — the RoomSketcher/Floorplanner pattern.

## Comments

- Amended by [03](03-dimension-display-prototype.md): drawn/typed lengths are
  hors-tout — axis + thickness, still junction-invariant. Anchors, snapping
  targets, and the stored model are unchanged; with the default 10 cm
  thickness, anchors stay on the 10 cm grid.
