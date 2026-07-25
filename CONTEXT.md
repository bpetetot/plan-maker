# Plan Maker

A web app for private individuals to draw simple 2D floor plans of a house or
apartment. Simplicity beats precision.

## Language

**Plan**:
The single floor plan the user is editing — the whole document. Holds points,
walls, openings, room labels, rulers, and texts.
_Avoid_: Document, project, drawing

**Sheet**:
The drawing itself — every graphic that states something about the Plan: walls,
junctions, openings, room names and areas, texts, dimensions, rulers. Defined by
what leaves the app: the Sheet is exactly what the PNG export prints, which is
why the screen and the export draw it from one place and cannot drift apart. The
editor renders the same Sheet and dresses it — selection accents, hover tints,
handlers — without adding to it. The one component both adapters call is named
`PlanScene`, from before the term was settled (ADR 0021, ADR 0024).
_Avoid_: Canvas, page, drawing surface

**Interaction chrome**:
Everything the editor draws that the Sheet does not contain: the Grid, room
tints, Grab zones, point handles, the snap marker, the rubber-band wall,
Placement dimensions, the live length of a wall being drawn, and the box opened
on the sheet to type a Room label or a Text. It exists to serve
the gesture, so it has no real-world size and obeys no drawing scale (ADR 0005),
and it is absent from the export by the same rule. Chrome sits above the Sheet,
save for the Grid and the room tints, which lie under it, and the Grab zones,
which slip between the content and the measures so a Dimension keeps its
hit-test.
_Avoid_: Overlay, decoration, UI layer

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
positioned by the distance from the wall's start to the opening's center, and
free to slide along its Rail. Its width is what it takes of the wall, jambs
included: no gesture lets it overlap a corner or a neighbouring opening,
though it may come flush against either.
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
rooms exactly like any party wall. A room's boundary is every wall of its
outline *and* of the islands it holes: the footprint that shapes the room
belongs to it, so a room moves whole or it breaks its own geometry. Because a
room is derived, its loop of Points is the only identity it has — it lasts
exactly as long as that loop does, and a split or a merge ends it, which is why
a room is read from a Selection rather than held in one (ADR 0014).
Deleting a room removes its own walls and openings but keeps every wall that is
the outline of another room — a party wall, or the wall of an island it
contains — so no neighbouring room is broken: the kept wall is exactly the one
whose removal would destroy another room, never merely shrink it. Deleting an
island therefore removes its walls and lets the containing room reclaim the
floor, while deleting the container keeps the island's walls and leaves it
standing. A room whose every wall is another room's outline has nothing of its
own to delete, so deleting it does nothing (ADR 0015).
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

**Settle**:
What the plan does the moment an edit that moved a Point or a Wall lands:
coincident Points merge into one, walls that touch or cross away from a shared
Point split at the junction, and every Room label reconciles against the plan
the edit started from. An edit is never observable half-settled — the whole
settling belongs to the gesture that caused it, and one undo takes it back.
_Avoid_: Normalize, cleanup, heal

**Measure**:
A number the plan states about itself: the Dimension of each wall, the Room
area of each detected room. Computed from the plan, never stored. Measures
show by default and hide together, from a single toggle sitting beside the
Grid's — a per-device preference, like the Grid and the Theme, never part of
the plan. Hiding is global and unconditional: selecting a wall does not bring
its Dimension back, so a hidden plan stays clean whatever is selected, and
adjusting a Dimension's placement means showing measures again. What hides on
screen is absent from the export too (ADR 0008) — hiding measures is how a
clean sheet is produced to share.
The rule that decides what counts: a measure is permanent and exported. A
number shown only for the duration of a gesture — the live length of the wall
being drawn, a Placement dimension — is interaction chrome, not a measure, and
never hides. A Room name is not a number the plan states about itself: it
never hides either.
The one thing that follows this toggle without being a Measure is the Ruler: it
is stored in the plan, not computed from it, yet it hides on screen and drops
from the export exactly as a Dimension does — a deliberate exception the rule
tolerates rather than a hole in it (ADR 0017). A Text is the opposite corner and
no exception at all: also stored, but content the user wrote rather than a number
the plan states about itself, so it never follows the toggle — always visible,
always exported (ADR 0021), as the Room name is.
_Avoid_: Measurement, cote, annotation

**Dimension**:
A Measure: the displayed length of a wall, measuring exactly the wall's
rendered silhouette on the side the dimension sits on: between the mitered Face
corners at junction ends, out to the body overhang at free ends. On a closed
room, the exterior side thus reads the overall (hors-tout) extent — invariant
once the junctions exist — and the interior side the tape-measurable room
span; a value may refine when a new junction forms, made legible by the
broken dimension line and the arrowheads marking the measured extent.
The value is computed from the plan, never stored. Its placement — where along
the wall it sits and on which side — belongs to the plan, like any edit;
dragging it is purely positional, and crossing sides switches between the
interior and exterior readings; the drag travels along the Rail, so the text
stops flush with the arrowheads and never covers them. It sits at a constant distance from the Face
it measures, whatever the wall's thickness. Its text always reads from the
bottom or the right of the sheet (ISO convention) — the reading direction
never depends on which side of the wall it sits.
_Avoid_: Measurement, cote

**Room area**:
A Measure: the surface of a detected room in square meters, bounded by the
interior Faces of its walls — the real floor surface, not the wall-axis loop. The
footprint of a contained island, out to its walls' exterior Faces, is not
floor: it is excluded.
_Avoid_: Surface, square footage

**Ruler**:
A measurement the user hand-places between two points, rendered like a wall
Dimension — ISO arrowheads at both ends, a line, a plated value reading its
length — but laid directly on the segment from A to B, with no Face to offset
from. Unlike a Measure it is part of the plan: its two endpoints, and the
value's position along the segment, are stored and persist. Its endpoints are
free integer-centimeter coordinates that reference no shared Point, so a Ruler
never merges, splits, or couples to a wall — it measures the space it is drawn
across, not any element. It follows the Measures toggle all the same: hidden
when measures are hidden, absent from the export then too, and inert to the
pointer while hidden — a stored object that still obeys a display preference
(ADR 0017). Placed by two clicks — A, a live ghost, then B — snapping through
the full ladder like any placement, the aimed position copied and never
attached; drawing one with measures hidden turns them back on. After B the tool
returns to Select with the new Ruler selected. Selectable like a wall and
draggable by either endpoint; a marquee takes it only with both endpoints
enclosed, and Delete removes it. The Tool panel states its Length, read-only —
a Ruler is not resized by retyping. A single straight segment: no polyline, no
angle, no free text.
_Avoid_: Measure, Dimension, tape measure, guide

**Text**:
A free-text annotation the user places on the sheet — one or more lines of prose
laid at a point, drawn as itself and not as any Dimension. Like a Ruler it is
part of the plan: its position, its content, and its size are stored and persist.
Its position is a free integer-centimeter top-left anchor that references no
shared Point, so a Text never merges, splits, or couples to a wall — it sits
where it is placed and moves only when dragged, as a whole block. Unlike a Ruler
it is content, not a measure: it never follows the Measures toggle, staying
always visible and always exported, and inert to nothing — clickable, marquee-
able, and draggable whether measures show or not (ADR 0021). Placed by a single
click that drops the anchor and opens an inline editor on the canvas — a textarea
in plan coordinates that grows down and to the right, Enter making a newline,
commit on blur or Mod+Enter, Escape cancelling; an empty commit places nothing.
After the commit the tool returns to Select with the new Text selected, and a
double-click on a placed Text re-opens the editor. Its size is one of an S/M/L
preset — a real size on the sheet that zooms with the plan, like a room label,
chosen in the Tool panel with the last used becoming the tool default. Horizontal
only, one style for all: no rotation, no rich runs, no per-text color or font.
_Avoid_: Label, note, caption, annotation, callout

**Tool**:
The editor's active instrument, which determines what clicking the sheet does.
Exactly one tool is active at a time: Select — the default —, Wall, Door,
Window, Ruler, or Text. Activating the Ruler forces Measures on, since a tool
that draws something the toggle can hide must not draw it into the void; the
Text tool forces nothing, since a Text is always visible and can never be drawn
into a hidden layer (ADR 0021). A drawing tool is one-shot: completing a
placement hands the tool back to Select and leaves the result as the Selection —
the walls a chain drew (which read as a Room when they close one), the Opening
just set, the Ruler just measured, the Text just written.
Completion is a positive finish only — a chain closed onto its start or ended
by a double-click, an Opening placed, a Ruler's second click — never an abort:
Escape or right-click ends the pending chain or Ruler point but keeps the tool,
and a finish that placed nothing keeps it too (ADR 0018).
The Text tool is the exception, and spends its one shot on opening the editing
box rather than on what the box returns: it hands back to Select as soon as that
box closes, whether the content was committed, left empty, or cancelled by
Escape. Only whether a Text is born varies (ADR 0021). Pure editor state:
never part of the plan.
_Avoid_: Mode

**Placement**:
What a drawing tool has under way: the element it is posing, aimed and advanced
click by click until it completes or is abandoned. Five of them exist, one per
drawing tool — a wall chain, a Door, a Window, a Ruler, a Text — and exactly
one can be under way at a time, since exactly one Tool is active. Select has
none: it poses nothing.
A placement spans several clicks and therefore several undo entries, which is
what tells it apart from a Plan drag: a chain writes one entry per wall it
draws, and between two of them the plan can move under it — an undo, a
thickness retyped, a plan reopened. What it holds pending is therefore never
the plan itself, only what the next click needs: the chain's anchor Points, the
Ruler's first end, the wall an Opening would pierce (ADR 0025).
It ends three ways. It **completes** — the chain closes on its start or stops
on a double-click, the Opening lands, the Ruler takes its second click — and the
Tool hands back to Select with the result selected. It is **abandoned** — Escape
or right-click drops what it holds pending — and the Tool stays, holding
nothing. Or the click is a **no-op**: a finish that drew no wall, an offset the
Rail refuses, a Ruler's second click landing on its own first. A no-op is not a
completion, so the Tool stays there too (ADR 0018).
A Text placement follows none of that past its click: it ends by handing an
editing box its spot, and the Tool hands back when the box closes — committed,
empty or cancelled alike (CONTEXT.md: Tool).
Pure editor state: never part of the plan.
_Avoid_: Draw, drawing gesture, mode — and not to be confused with Placement
dimension or a Dimension's stored placement, which are about where a measure
sits, not about posing an element

**Selection**:
The set of elements — walls, openings, rulers, texts — the user is currently
acting on in the editor. Room labels are never selected: they are manipulated
directly (dragged, edited in place). Group actions (delete, move) apply to every element in
it. Openings have no position of their own: they follow their wall and never
move on their own in a group move. A junction reads as selected — never
selectable itself, never in the set — as soon as it sits between selected
walls: at least two of the walls meeting at its Point are in the Selection.
A Room is never in the Selection either — it is *read from* it: a Selection
that is exactly the boundary walls of a detected Room is that Room, and the
editor names and tints it accordingly (ADR 0014). Selecting a Room takes its
boundary walls *and* every Opening those walls carry — the set a marquee over
the room already produced, so clicking a room's interior, clicking its text
block, and marqueeing its walls all land on one and the same Selection. Taking
everything is one more of them: it holds every Wall and every Opening the plan
has, so on a plan that is one closed Room it reads as that Room. The
reading is a state, not a memory of the gesture that produced it, and the
Openings do not vote: the room still reads as itself when a Shift-click puts
one of them out. A door in a party wall belongs to both rooms it separates —
it has no side. Shift adds a room, following the marquee's rule — a room
joins the set, never leaves it. A Ruler joins the Selection like a wall, but
only while measures are shown: hidden, it is inert to click, marquee, and
Select-all, so a clean sheet stays clean. A marquee takes a Ruler only with
both its endpoints enclosed — the wall rule, not the opening's — a group move
carries it rigidly, and it never reads as part of a Room nor counts among a
Selection's contents. A Text joins like a Ruler but is never measures-gated —
always live to click, marquee, and Select-all, since it is always visible
content (ADR 0021). Having one anchor rather than two endpoints, a marquee takes
it when that anchor is enclosed, and it has no endpoint handles — the whole
block drags as one. Like a Ruler it moves rigidly in a group, is never a
realignment reference, and never reads as part of a Room nor counts among a
Selection's contents. Never part of the plan.
_Avoid_: Highlight, marked elements

**Tool panel**:
The fixed floating card on the editor's left. When the Selection is non-empty
it shows the Selection's parameters and actions — per-element measures,
opening options, delete; otherwise it shows the active Tool's Tool defaults,
so the next element is configured before it is placed. Hidden only when the
Selection is empty and the Select tool is active. Selection values are
derived on render from the same silhouette readings as the Dimensions, never
stored. Any Selection of more than one element states what it holds — how many
Walls, Doors and Windows — where a Selection of one has its title to name what
it is. A Selection read as a Room takes that room's name as its title — or
"Room" while it has none — and states its Room area beside those counts;
nothing else: retyping every boundary wall is a wall action, not something a
room states about itself. A room inventories its boundary: its counts are read
from the room, never from the set of refs — a boundary tally of what the room
is, island walls included, where a party wall's door counts for both rooms, not
a dwelling inventory. They describe the room, not what the Delete beneath them
takes: Delete keeps the walls shared with other rooms (ADR 0015), so on a room
that touches its neighbours it removes fewer than it counts. A nil count reads
zero rather than vanishing, a room having no window being a fact about the room. Every other Selection counts what is lit and nothing more — its own
refs, so a Shift-click that puts an opening out lowers the count — and lists
only what it holds: a row with nothing to count does not appear. Thickness is
offered on a single selected wall and nowhere else: no Selection retypes
several walls at once.
_Avoid_: Selection panel, popover, inspector, properties dialog

**Tool defaults**:
The per-tool parameters every newly placed element inherits — wall
thickness, opening width, door hinge side and swing. Editing a placed
element's measure (width, thickness) updates the matching tool default (last
used wins); hinge and swing corrections stay local to their door. Pure
per-session editor state: never part of the plan, reset to the built-in
values on load.
_Avoid_: Tool options, tool settings, presets

**Plan drag**:
A drag that edits the Plan: moving a Point, a group, an Opening along its Rail,
a Ruler endpoint, a Room label, or a Dimension's placement. It is grabbed, then
aimed for as long as the pointer is down, then lands — Settling if it moved a
Point or a Wall, and taking at most one undo entry whole. Below the click
threshold it was a click, not a drag: it leaves the plan alone and selects
instead — the element clicked, the wall a Dimension label belongs to, the Room a
text block names. The Pan and the Marquee are drags but not Plan drags: one
moves the view, the other the Selection, and neither can touch the plan, which
is why neither Settles and neither takes an undo entry (ADR 0023). Pure editor
state: never part of the plan.
_Avoid_: Gesture, drag operation, manipulation

**Grab zone**:
The invisible area around an element that reacts to the pointer — hover,
click, drag. It covers the element's body plus a constant on-screen margin,
whatever the element's thickness and the zoom: a thick wall never grabs the
pointer far from its visible body, and a thin wall stays grabbable when
zoomed out. Grabbing an element by its grab zone fixes the grab point: for
the whole drag that point stays under the cursor — the element never
recenters on the pointer, and a clamp never re-bases the grab point. A Point
handle fixes the grab point too — it never recenters on the cursor — and from
that aimed position Snap decides where the Point lands; its visible marker is a
small ring of constant on-screen size, sat inside a wider invisible grab disc.
Pure editor behavior: never part of the plan, never exported.
_Avoid_: Hit zone, hit target, hover area

**Snap**:
The magnetic guidance of any placement or move in the editor:
positions are drawn to existing points, walls, or the 10 cm grid —
that ladder governs placing a point. Snap is a state, not a permanent
behavior: it is on by default and can be turned off for the whole editor —
a per-device preference like the Grid or the Theme, never part of the plan,
never exported — and Alt inverts whichever state is current for the duration
of the gesture, so the same key reaches a Free move from Snap and a snapped
one from Free. Its rungs are of two natures: the
connection targets — existing Point, wall body — which decide what the placed
Point is attached to, and the alignment target — the grid — which only
decides where it sits; a Free move keeps the first and drops the second. A
group
move follows its own rule: it translates rigidly — the group's shape stays
intact — and the translation is
chosen so the group's Reference point lands on a grid intersection, to the grid
only and to nothing else. An off-grid element therefore realigns on its first
non-Free move. Snap shows the aimed position with a marker of constant on-screen
size (ADR 0019): an *attached* ring — the Point handle's shape in the snap ink
(Grab zone) — when the click lands on an existing Point or wall, a small dot
otherwise. Pure editor behavior: never part of the plan.
_Avoid_: Magnetism, snapping grid, attach

**Drawing anchor**:
The Point a new wall segment is being drawn from — the fixed end of the segment
being rubber-banded, and the Point the closing segment of a chain loops back to.
It constrains nothing about where the moving end lands: the placement ladder
alone decides that. A group move has no Drawing anchor: it aims at no connection.
Pure editor state: never part of the plan.
_Avoid_: Origin, start point, pivot

**Reference point**:
The one Point of a moving group whose landing position a group move's
realignment is computed for: the selection's wall Point nearest the grab,
across every selected wall whatever element was actually grabbed, chosen at
the start of the drag and fixed for its whole duration. A selection holding no
wall Point has none, and realigns nothing. Pure editor state: never part of the
plan.
_Avoid_: Pivot, handle

**Free move**:
Any placement or move made while Snap is inactive — because Snap is off, or
because Alt inverts it while Snap is on; the two causes are indistinguishable
in their effect. Snap's alignment targets are suspended, its connection
targets are not — a Free move filters the ladder, it never switches it
off. A free placement is therefore drawn to an existing Point or to a wall's
body exactly as an ordinary one is, but never to the grid;
away from every connection target only the integer-centimeter rounding remains
(Points have integer coordinates). Connecting is topology, aligning is
geometry, and only the second is what a Free move escapes: a wall drawn freely
still joins the plan instead of landing beside it. A group move, which runs no
ladder, keeps its own rule: a Free move suspends its realignment — so an
off-grid group heals on its first snapped move, and never while Snap is off.
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
The pair of temporary measures flanking an Opening, shown while it is being
placed or moved and, past the release, for as long as it stays in the
Selection — every Opening of the Selection shows its own, with no cardinality
threshold, while a selected Wall stays silent for the Openings it carries. A
selected Room is no exception: it holds its Openings, so all of them flank
themselves at once.
Each is the clearance left to one end of the opening's Rail: from the near
edge of the opening to the mitered Face corner at a junction, the body
overhang at a free end, or the near edge of the neighbouring opening that
intervenes — so every value is tape-measurable. Because it is read against the
very bound that stops the opening, it reaches zero exactly when the opening
can travel no further.
It is deliberately not drawn as a Dimension: no dimension line, no ticks, no
witness lines, no offset from a Face. Each value is a filled accent chip
centred on the clearance it measures, on the wall's axis, inside the wall
body — the one position no other register occupies, so it coexists with the
wall's Dimension instead of displacing it. The chip holds the same size on
screen at every Zoom, padding included; only its size escapes the drawing
scale, its centre stays in plan coordinates. It never shrinks, never shifts
and never disappears: a chip wider than the clearance it measures simply
overflows it. A clearance reduced to nothing shows no chip at all, and the
other side shows its own normally.
Pure editor feedback, like a Dimension's Rail: never part of the plan, never
exported.
Not a Measure, despite the name — it belongs to a gesture, so it never follows
the Measure toggle and shows even when measures are hidden.
_Avoid_: Side measure, clearance, flanking dimension, Chip — the graphic is a
chip, the concept is not

**Rail**:
An invisible bounded travel line. Nothing is drawn: a Rail is a constraint,
not a graphic. Two things have one.
A Dimension's text slides along the dimension line of the side the pointer is
on, bounded by the arrowheads: the text can at most touch a head, never cover
it, and a span too narrow for the text pins it to the middle. The Rail is never
drawn and never stored, and it binds at every drawing, not only at the gesture:
the placement kept in the plan is a wish, and a plate too wide for the Rail of
the size it is being drawn at slides back onto it. That is what keeps the
export honest, its measure font being larger than the editor's.
An Opening slides along the stretch of its wall that is at full thickness —
bounded at each end by the shorter of the two Faces, since the opening pierces
the whole thickness, and cut back to the near edge of the closest neighbouring
opening when one intervenes. That Rail binds the plan and not merely the
gesture: it is what every placement, move and widening lands on, and a wall
whose Rail is narrower than the opening refuses it outright.
_Avoid_: Guide, track

**Preference**:
A per-device choice about how the editor looks or behaves, as opposed to
anything the plan says: the visibility of the Grid and of Measures, Snap, the
Theme. Never part of the plan — never saved with it, never exported, never
carried to another device. Held for the session and remembered in local
storage, which only makes it outlive a reload: the value the editor reads is
the session's, so a device whose storage refuses the write still honors the
choice until the tab closes. A preference left at its default stores nothing,
so a device that never touched a toggle keeps following the default rather
than freezing today's value.
_Avoid_: Setting, option, config, parameter

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

**Pan**:
Moving the view without changing the Zoom. Three gestures do it, equally: a
bare scroll — two fingers on a trackpad, a mouse wheel — Space + drag, and
middle-click + drag; Shift + scroll pans sideways. Scrolling stays available
while a wall chain or a drag is under way, so a point off screen can be reached
without breaking the gesture; only a Pan drag already in progress silences it.
Pure editor behavior: never part of the plan.
_Avoid_: Scroll, drag the canvas, move the camera

**Zoom**:
How far the view is zoomed in or out, expressed relative to the default
framing: 100% is the scale the default framing had in the window as of the
last load or Fit. Changed by Ctrl/Cmd + scroll — which is how a trackpad pinch
arrives — by the +/− buttons and by their shortcuts; a bare scroll pans
instead (ADR 0016). Resizing the window never pans or zooms the view — it only
reveals or hides plan, the top-left corner staying put — so neither the plan
on screen nor the Zoom changes. Bounded to 10%–3000%: a step that would
overshoot stops on the bound instead, and the control that would cross it is
greyed out. Fit is exempt — it may frame a plan outside the range (ADR 0013).
Never a paper scale or a physical size. Pure editor state: never part of the
plan, never exported.
_Avoid_: Zoom level, scale, magnification
