# 03 — Display rules: selection, multi-selection, and the notion of side

Type: grilling
Status: resolved
Blocked by: 02 (resolved)

## Question

The register is fixed by [02 — The visual register of placement
dimensions](02-visual-register-prototype.md): an `--accent` chip on the wall
axis, no line. Pin down the rules the spec must state, now that placement dims
persist beyond the gesture. Two of the bullets below were **narrowed by 02's
verdict** — read its Answer before starting.

- **Selection trigger**: an opening is selected — its placement dims show. Two
  openings selected: both show theirs, or none? A whole wall selected: do its
  openings show theirs? A mixed selection of walls and openings?
- **Side survives as a *measurement* input only — what is its rule?** Narrowed
  by 02: the chip sits on the axis, so no side governs *placement* any more,
  and the "avoid the wall Dimension" problem is gone by construction. But the
  value still comes from `faceSpan(plan, wall, side)`, and the two sides give
  different silhouette bounds at mitered junctions. So: which side does the
  *number* come from — keep today's rule (interior when the wall borders
  exactly one room, else the wall Dimension's side), or does a sideless
  drawing deserve a sideless measure (say, the axis itself, or the shorter of
  the two)? The wall Dimension's side is now an odd thing to depend on, since
  the two registers no longer interact.
- **Gesture vs selection**: same rendering in both states, or does the gesture
  get a stronger treatment (the drag being the moment of highest attention)?
- **Interaction with the drag**: the values while dragging are live; on
  release, do they simply stay, or is there a transition?
- **When the chip does not fit its clearance.** Reshaped by 02: with no line,
  nothing can be "too short to draw" — only the chip can overflow its bounds,
  and it overflows into the opening glyph or the neighbouring chip. Does it
  still show, shrink, shift, or drop? Ticket 01's LayOut leader-line precedent
  mostly falls away with the line; Sweet Home 3D's "drop a feedback dimension
  under the threshold" is still live. Note that today's rule (a side rounding
  to 0 cm shows nothing) is about the *value*, which is a separate case worth
  restating on its own.

Zoom-driven legibility is **not** this ticket's — it is
[06 — The pixel floor](06-pixel-floor.md).

## Answer

Six rules, settled by grilling. The through-line: the chip's own properties —
it carries its own background, it sits where nothing else does, it has no line —
let almost every hard case be answered by *doing nothing special*.

### 1. Selection trigger — every selected opening

Placement dims show for **every opening in the selection**, with no cardinality
threshold. A selected wall does **not** show its openings' dims: the opening is
the measured element, and a wall with four openings would put eight chips on
screen from one click. A mixed selection follows the same rule — only the
openings in the set speak. Implementation is a filter over `sel`, not a new
concept.

The gesture triggers independently, as today: the `__ghost` opening while the
door/window tool hovers a wall, and `movingOpeningId` during a solo drag.

### 2. Measured side — unchanged

`interiorSide(rooms, wall) ?? frame.side` stays. The semantics decided by the
`measure-semantics` map (interior when the wall borders exactly one room, else
the wall Dimension's side) are **not** reopened by this map, whose scope is
visual. What changes is only the *scope* of the side: it now governs the
**number** alone, never the position. The chip sits on the wall axis either way.

Two alternatives were weighed and dropped: following the wall Dimension's side
unconditionally (buys verifiable additivity — chips + opening widths = the
displayed Dimension — but sacrifices the tape-measurable default inside a room),
and falling back to the shorter of the two spans (cuts the dependency but on a
criterion invisible to the user).

### 3. Gesture vs selection — identical rendering

One register, both states. The attention hierarchy is already carried by the
**movement of the values** during a drag; no style needs to restate it. Two
intensities would cost a second token set and a transition to define, for a
distinction the user never has to read — they know whether they are dragging.

### 4. Transition on release — none

There is nothing to cross. A solo drag selects the opening before it starts
(`Editor.tsx:337`) and placing one with the door/window tool selects it too
(`Editor.tsx:301`), so under rule 1 the chip simply **continues to exist** past
the release — only its value stops changing. Specifying an animation would mark
a state change the user does not perceive.

### 5. Overflow — it shows and overflows

A chip wider than the clearance it measures still renders, at constant size,
centred on that clearance, drawn above everything else. It never shrinks (which
would contradict ticket 06's screen-pixel pinning and produce tiny text exactly
where reading matters) and never shifts. It carries its own opaque fill, so it
stays legible over the opening glyph.

The accepted ugly case: two near-abutting openings whose chips overlap each
other. Rule 6 defuses the worst of it, and the case is rare enough not to earn a
solver.

### 6. Zero clearance — unchanged

A side rounding to 0 cm shows **no chip**; the other side shows normally, tested
independently as today (`render.tsx:490`). A "0" chip teaches nothing the
drawing does not already show — the opening touches the corner or its neighbour
— and, having no clearance to centre on, it would be guaranteed to sit on the
glyph.

### Derived consequence for the spec

An opening selected alongside a wall keeps its chips **during a group move**:
rule 1 knows only membership in the selection, not which gesture is running.
This is a consequence, not a separate decision — ticket 04 should state it so it
is not mistaken for an oversight.
