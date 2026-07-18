# Plan Maker

A web app for private individuals to draw simple 2D floor plans of a house or
apartment. Simplicity beats precision.

## Language

**Plan**:
The single floor plan the user is editing — the whole document. Holds points,
walls, openings, and room labels.
_Avoid_: Document, project, drawing

**Point**:
A shared corner in the plan, at integer-centimeter coordinates. Walls reference
points; moving a point moves every wall attached to it.
_Avoid_: Vertex, node, corner

**Wall**:
A straight edge between two points, with a thickness. The only thing the user
draws to shape the plan. Walls only meet at Points: drawing a wall onto or
across another wall splits the existing wall at the junction — no wall ever
crosses or overlaps another away from a shared Point.
_Avoid_: Segment, edge, line

**Opening**:
Something set into a wall — a door or a window. Belongs to exactly one wall,
positioned by the distance from the wall's start to the opening's center.
_Avoid_: Fixture, insert

**Door**:
An opening with a hinge side and a swing direction.

**Window**:
An opening with only a width — no swing.

**Room**:
An enclosed area bounded by a closed loop of walls. Rooms are detected from the
walls, never drawn or stored; they appear as soon as walls close a loop.
_Avoid_: Zone, area, space

**Room label**:
A named marker placed inside a room. It names whichever detected room contains
its position.
_Avoid_: Room name, tag

**Dimension**:
The displayed length of a wall, measured along its axis between its two points.
The value is computed from the plan, never stored. Its placement — where along
the wall it sits and on which side — belongs to the plan, like any edit. Its
text always reads from the bottom or the right of the sheet (ISO convention) —
the reading direction never depends on which side of the wall it sits.
_Avoid_: Measurement, cote

**Room area**:
The surface of a detected room in square meters, computed from its wall loop.
_Avoid_: Surface, square footage

**Selection**:
The set of elements — walls, openings, room labels — the user is currently
acting on in the editor. Group actions (delete, move) apply to every element in
it. Openings have no position of their own: they follow their wall and never
move on their own in a group move. Never part of the plan.
_Avoid_: Highlight, marked elements

**Rail**:
The pair of guide lines a Dimension slides along while it is being dragged —
one on each side of its wall. Pure editor feedback: never part of the plan,
never exported.
_Avoid_: Guide, track
