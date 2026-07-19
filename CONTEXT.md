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
points; moving a point moves every wall attached to it. Two Points never
coincide: any gesture that would land one Point on another merges them into a
single shared Point.
_Avoid_: Vertex, node, corner

**Wall**:
A straight edge between two points, with a thickness. The only thing the user
draws to shape the plan. Walls only meet at Points: any gesture — drawing or
dragging — that lands a wall onto or across another wall splits the existing
wall at the junction — no wall ever crosses or overlaps another away from a
shared Point. Drawing and snapping
happen on the axis — the line between the two Points; the thickness spreads
half on each side of it. The length drawn or typed is the overall (hors-tout)
extent — axis length plus the thickness — and the ghost previews the body
honestly, square caps included.
_Avoid_: Segment, edge, line

**Face**:
One of the two long sides of a wall, offset half its thickness from the axis.
At a junction, the faces of adjacent walls miter into each other — a junction
patch fills the central gap that outlines leave at T and angled crossings; at
a free wall end, the face overhangs the Point by half the wall's thickness
(square cap). Faces are what Dimensions measure along and what bounds a
Room's area.
_Avoid_: Side, edge

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
walls, never drawn or stored; they appear as soon as walls close a loop. A room
fully contained in another is excluded from it: the island's whole footprint —
floor and walls — punches a hole in the containing room, so a position inside
the island belongs to the island's room only, and an island wall separates two
rooms exactly like any party wall.
_Avoid_: Zone, area, space

**Room label**:
The name given to a room, shown with the room's area as one text block —
label and area always share one position and one behavior. A label belongs
to its room, not to a position: it follows the room through every wall
change — resizing the room, or a wall sweeping past the block, never hands
the label to a neighbouring room. Its placement has two states, like a
Dimension's: by default the block sits at the room's anchor — the centroid
of the room's surface, or, when a contained island pushes that centroid out
of the room, the point of the room deepest inside it — continuously
recomputed; a default placement's position is the anchor, nothing else;
dragging the block gives the label a custom placement, which holds exactly
as long as the room contains it — a change that leaves the block outside
its room reverts it to default placement. It is always inside a detected
room — an orphan label never exists: it cannot be created or dragged
outside a room, and labels that would arrive orphaned (e.g. from an
imported plan) are dropped. After every wall change, each label reconciles:
its room still detected — the label stays with it; its room no longer
recognizable (its loop of Points changed — a split added a corner, a merge
removed one) — the label falls back to whichever detected room contains its
position; no room contains it — the label is deleted. When a move
translates every wall of its room, a custom placement translates with the
room, keeping its position relative to the room — a default placement
simply follows the anchor. A room without a label shows its area at its
anchor. A room never keeps more than one label: when a wall change leaves
several labels in one room (e.g. deleting a dividing wall merges two named
rooms), only the oldest survives — the others are deleted.
_Avoid_: Room name, tag

**Dimension**:
The displayed length of a wall, measuring exactly the wall's rendered
silhouette on the side the dimension sits on: between the mitered Face
corners at junction ends, out to the body overhang at free ends. On a closed
room, the exterior side thus reads the overall (hors-tout) extent — invariant
once the junctions exist — and the interior side the tape-measurable room
span; a value may refine when a new junction forms, made legible by the
broken dimension line and perpendicular ticks marking the measured extent.
The value is computed from the plan, never stored. Its placement — where along
the wall it sits and on which side — belongs to the plan, like any edit;
dragging it is purely positional, and crossing sides switches between the
interior and exterior readings. It sits at a constant distance from the Face
it measures, whatever the wall's thickness. Its text always reads from the
bottom or the right of the sheet (ISO convention) — the reading direction
never depends on which side of the wall it sits.
_Avoid_: Measurement, cote

**Room area**:
The surface of a detected room in square meters, bounded by the interior
Faces of its walls — the real floor surface, not the wall-axis loop. The
footprint of a contained island, out to its walls' exterior Faces, is not
floor: it is excluded.
_Avoid_: Surface, square footage

**Tool**:
The editor's active instrument, which determines what clicking the sheet does.
Exactly one tool is active at a time: Select — the default —, Wall, Door, or
Window. Pure editor state: never part of the plan.
_Avoid_: Mode

**Selection**:
The set of elements — walls, openings — the user is currently
acting on in the editor. Room labels are never selected: they are manipulated
directly (dragged, edited in place). Group actions (delete, move) apply to every element in
it. Openings have no position of their own: they follow their wall and never
move on their own in a group move. A junction reads as selected — never
selectable itself, never in the set — as soon as it sits between selected
walls: at least two of the walls meeting at its Point are in the Selection.
Never part of the plan.
_Avoid_: Highlight, marked elements

**Tool panel**:
The fixed floating card on the editor's left. When the Selection is non-empty
it shows the Selection's parameters and actions — per-element measures,
opening options, delete; otherwise it shows the active Tool's Tool defaults,
so the next element is configured before it is placed. Hidden only when the
Selection is empty and the Select tool is active. Selection values are
derived on render from the same silhouette readings as the Dimensions, never
stored.
_Avoid_: Selection panel, popover, inspector, properties dialog

**Tool defaults**:
The per-tool parameters every newly placed element inherits — wall
thickness, opening width, door hinge side and swing. Editing a placed
element's measure (width, thickness) updates the matching tool default (last
used wins); hinge and swing corrections stay local to their door. Pure
per-session editor state: never part of the plan, reset to the built-in
values on load.
_Avoid_: Tool options, tool settings, presets

**Grab zone**:
The invisible area around an element that reacts to the pointer — hover,
click, drag. It covers the element's body plus a constant on-screen margin,
whatever the element's thickness and the zoom: a thick wall never grabs the
pointer far from its visible body, and a thin wall stays grabbable when
zoomed out. Pure editor behavior: never part of the plan, never exported.
_Avoid_: Hit zone, hit target, hover area

**Snap**:
The default magnetic guidance of any placement or move in the editor:
positions are drawn to existing points, walls, 45° axes, or the 10 cm grid. A
group move snaps its displacement as a whole, never each element separately —
the group's shape stays intact. Pure editor behavior: never part of the plan.
_Avoid_: Magnetism, snapping grid, attach

**Free move**:
Any placement or move with Alt held: snapping is suspended and only the
integer-centimeter rounding remains (Points have integer coordinates).
Toggles immediately, both ways, including mid-gesture.
_Avoid_: Free mode, no-grid mode

**Grid**:
The sheet's visible ruling, materializing what Snap aligns to: minor grid
lines — dashed — every 10 cm, the snap step, and major grid lines — solid —
every 50 cm. Purely
visual: showing or hiding it never affects Snap. Always legible, never noise:
minor lines fade out when their cells get too small on screen, major lines
follow at extreme zoom-out. Shown by default; the show/hide choice is a
per-device preference, like the Theme — never part of the plan, never
exported.
_Avoid_: Sur-grille, sous-grille, overlay, mesh

**Placement dimension**:
The pair of temporary dimensions flanking an Opening while it is being placed
or moved. They sit on the interior side whenever exactly one side of the wall
faces a Room; else — dangling wall, party wall, or a wall jutting into its
own Room, none of which has a single interior side — on the side the wall's
Dimension sits on. Each runs to the near
edge of the opening from the silhouette end on that side — the mitered Face
corner at a junction, the body overhang at a free end — or from the near edge
of the closest neighbouring opening when one intervenes, so every value is
tape-measurable. They replace the wall's Dimension on that side's line for
the duration of the gesture; a side reduced to nothing shows no dimension.
Pure editor feedback, like the Rail: never part of the plan, never exported.
_Avoid_: Side measure, clearance, flanking dimension

**Rail**:
The pair of guide lines a Dimension slides along while it is being dragged —
one on each side of its wall. Pure editor feedback: never part of the plan,
never exported.
_Avoid_: Guide, track

**Theme**:
The editor's light or dark appearance, covering both the UI chrome and the
sheet. Chosen per device — follows the system by default, with a manual
override — and never part of the plan: exports always render light, as a
document.
_Avoid_: Dark mode, appearance, color scheme

**Fit**:
Framing the view so the whole plan is visible with a margin; on an empty plan
it returns the view to its default framing. Always reframes, regardless of
where the view was. Applied after any replacement of the plan — opening a
file, restoring at startup, resetting — and on demand. Pure editor behavior:
never part of the plan.
_Avoid_: Fit zoom, zoom to fit, center

**Zoom**:
How far the view is zoomed in or out, expressed relative to the default
framing: 100% is the scale the default framing had in the window as of the
last load or Fit. Resizing the window never pans or zooms the view — it only
reveals or hides plan, the top-left corner staying put — so neither the plan
on screen nor the Zoom changes. Never a paper scale or a physical size. Pure
editor state: never part of the plan, never exported.
_Avoid_: Zoom level, scale, magnification
