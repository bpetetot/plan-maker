# An alignment is a line the plan already offers

Drawing a wall level with a corner across the room, or a partition on the column
of a doorway two rooms away, had no gesture. The Axis lock (ADR 0034) does not
serve it: it runs its line through the gesture's **own** origin, so it can hold
a segment straight but knows nothing of the rest of the plan — and the gestures
with no origin at all, a chain's first click and a Ruler's A, it cannot serve
whatever the user holds.

So a second noun: the **Alignment guide**. *The line an existing Point offers a
gesture — its own row or its own column, discovered by the aim rather than asked
for.* It exists only during the gesture, its tolerance is in screen pixels, and
it **draws itself**.

## Two nouns, and the asymmetry is why

The lock is **asked for**; the guide is **discovered**. Everything else follows
from that one difference. The lock is anchored on the gesture's own origin, held
under Shift, and may veto — it is a constraint. The guide is anchored on another
element's position, has no modifier of its own, and only proposes — it is a rung.
And a lock you asked for can stay invisible — you know where you pointed it, and the
result on the axis is its own feedback. An alignment you *discovered* cannot:
you do not know the other Point is there until something says so. That is the
whole justification for the chrome, and ADR 0034's refusal of a guide line for
the lock was reopened once against it, on a bench at 1:1, and stands.

## The two world axes only

A guide is a Point's own row or its own column, never a direction borrowed from
a wall through it. A slant is not grid-commensurate — the argument ADR 0034
already makes about the rung below — and the lock's justification for borrowing
does not transfer: it borrows because the gesture holds an element that *has* a
direction, and lengthening it along its own line is the drawing act. A **foreign**
Point's wall is not something this gesture holds. The extension of a wall's line
as a guide direction is a separate feature, with its own justification to make.

## A rung, above the grid

The lock is a constraint because it was asked for, so it may refuse; a guide has
no mandate to refuse anything, only to offer, and "a proposal that wins if it
applies" is exactly a rung. The ladder becomes:

```
point > wall body > alignment > grid
```

Above the grid, and the decisive argument is not taste: **the grid rung is
total**. It applies at every aim, so anything below it is unreachable code — a
guide sits above it or does not exist. Below the connection rungs, because
connecting is topology and aligning is geometry: within snapping distance of a
wall the gesture is trying to *join* it, and joining is what it gets. The
guide's territory is open space, which is exactly where nothing helped before.

The free coordinate comes from the rung below — the grid when the Grid is shown,
the integer centimetre when it is not. That is not a new rule but verbatim how
the lock already composes.

## One rule, three cases

> **A guide applies when the position it yields is within the guide tolerance of
> the aim.**

- **A free aim**: the rung runs twice, once per coordinate, independently. Two
  winners at once *are* the crossing — it needs no concept, no glyph and no
  widened envelope, because two per-coordinate tests already accept the whole
  tolerance square.
- **A world-axis lock**: a guide holding the lock's own coordinate is skipped —
  the lock has the last word and the guide has nothing left to hold; one holding
  the free coordinate competes for it, above the grid. *Straight from here, and
  level with that*, obtained from two decisions already taken.
- **A borrowed slant**: the position a guide yields is line ∩ guide, and that is
  a real drawing act — lengthen this wall along its own direction until it is
  level with that corner. The tolerance test is itself the near-parallel guard:
  as the angle closes the crossing races away from the aim and falls out on its
  own. No angle threshold, no second constant.

The tolerance is the guide's **own**, tighter than the ladder's — **4 screen px
against 14**, tuned on the bench. A guide's catchment is not a disc around a
Point but a band across the whole sheet, and every aim is near *some* row; at
the ladder's reach it would be sticky everywhere. Inkscape says the same from
experience, 5 px against 20.

## The gesture's own origin is never a candidate

The Drawing anchor, a Ruler's posed A, the dragged Point's own start: **excluded**.

This is the load-bearing rule. Include them and the feature *is* automatic axis
snapping on a constant perpendicular band — the option ADR 0020 considered and
rejected in as many words, and which ADR 0034 then answered with an explicit
modifier on the grounds that a two-second burst earns a finger. Handing it back
automatically would overrule both decisions by accident. Excluding it also makes
the two nouns disjoint by construction, which is worth more than any rule could
be:

> The Axis lock owns the gesture's own origin. The Alignment guide owns every
> other Point.

A chain's earlier Points stay eligible — they are foreign Points like any other.
Only the anchor of *this* segment is out.

**Candidates are the Points the viewport shows.** The user-facing reason is
stronger than the performance one: a guide whose source Point is off screen
cannot be explained, and the chrome's whole job is to draw a segment with both
ends on screen. `snapPoint` knows nothing of the viewport, so the rect arrives in
`SnapOptions` exactly as the tolerance already does — the editor supplies what
only it knows, the model stays a pure function of its arguments.

Ties, per coordinate: the nearest line, then the nearest source Point, then the
lowest Point id. The last step is not pedantry — it is what keeps the winner
stable across consecutive aims, and an unstable winner makes the chrome flicker
between two identical lines.

## Targets, and what it draws

**Wall Points only.** They are the only objects of the model that *are* a
position, in integer centimetres. Wall Faces, Opening centres and Ruler
endpoints are derived positions, each dragging its own "which of its positions
counts" question; they graduate on a later effort, if ever.

The chrome, settled on a 32-panel bench at 1:1: a **bounded segment from the
source Point to the aim**, plus a small sheet-filled square marking the source —
the two ends *are* the statement, and a line that stops on the Point it came
from can be traced back. The crossing draws nothing of its own; the snap marker
keeps ADR 0019's two forms, an aligned position taking the free dot since it
attaches to nothing. The ink is `--snap`: a guide is a rung of the ladder, and
the marker it lands under is already green — one ink for the whole snap family.
The collision that creates is resolved on the other side: the Axis lock's Debug
hairline (ADR 0036) takes an ink of its own, being read by whoever builds the
editor and movable at no cost to anyone else.

Like every gesture value, the guides are stored **unconditionally** and the view
draws what the aim computed — a chrome that re-derived them would disagree in
exactly the cases where the value is right (ADR 0036).

## The Grid's switch does not reach it

**This amends [ADR 0035](0035-showing-the-grid-is-asking-to-snap-to-it.md).**
That decision sorted Snap's rungs into two natures — connection targets, always
live, and the alignment target, which the Grid switches — and a guide aligns, so
the cut as drawn would put it under the switch. The cut is one line off. The
real boundary is **what the plan says against what the ruling says**: the grid is
a ruling laid over the sheet, and asking for it is asking to be held to it; a
Point's row *is* the plan, and a wall level with an existing corner is a fact
about the drawing, not about a lattice. So a guide is always live.

The practical argument seconds it: the Grid is hidden by default, so tying them
would ship the feature dark, and a Free move — drawing at real measurements — is
where a guide is worth the most.

## Considered Options

- **The extension of a wall's line as a guide direction.** Rejected here, on the
  grounds above; a separate effort with its own case to make, on the same
  footing as the other target families.
- **The crossing as a first-class target, Inkscape-style** — its own type, its
  own colour and a `sqrt(2)×` envelope that pre-empts arbitration. Rejected: a
  second tolerance to tune is precisely what ADR 0020 rejected, and two
  independent winners already *are* the crossing. Alignment ∩ wall body stays
  buried with ADR 0002's refinement.
- **The guide as a constraint rather than a rung**, symmetrical to the lock.
  Rejected: a constraint may veto, and nothing the user did not ask for has the
  standing to refuse a position. The two coexist without arbitration precisely
  because one filters what the rungs may propose and the other is one of the
  things they propose.
- **The Grid's switch governing it.** Rejected above. It also has a cost the
  amended reading does not: the guides would appear and disappear with a
  preference that says nothing about them.
- **A Preference, or an escape modifier** to suspend the guides for one gesture.
  Rejected for now on the evidence available, not on principle: the guide is
  momentary and its tolerance tight, and reaching for Alt would undo the merge
  ADR 0035 has just made. If a week of use says they get in the way, the
  modifier is the first thing to add.

## Consequences

- **ADR 0020's removal stands, and ADR 0034 keeps its mandate.** The automatic
  angular rung is not coming back — a guide's band is a constant perpendicular
  distance in screen pixels, and it never runs through the gesture's own origin,
  which is what kept the two apart. Shift is still the only way to say "straight
  from here".
- `Snap` gains the kind `'alignment'` and a `guides` field, plural because the
  crossing is two guides at once. The kind names the strongest thing that
  decided the position: a position whose x rode a guide and whose y fell on the
  grid is `'alignment'`, because the guide is what needs explaining.
- `src/model/alignment.ts` joins the model, named for the glossary noun
  (ADR 0032). `SnapOptions` grows three optional fields — the guide tolerance,
  the origin exclusion and the viewport — and the rung does not run without the
  first, which is what keeps the model free of screen units.
- The editor feeds both call sites of `snapPoint`: a wall chain and a Ruler's two
  clicks through `placement.ts`, the `point` and `rulerEnd` drags through
  `planDrag.ts`. The viewport travels in `SessionEnv` exactly as `pxPerCm` does.
- **The `group` and `label` drags are out.** Neither runs the ladder — a group
  carries a delta and its own realignment rule, a label applies the lock and no
  rung at all — so both would need a second rule on a separate path. They align
  to nothing for now, which is what they already did.
- The Debug mode's hairline changes ink, and gains a chrome-only `--debug`
  token. Nothing else moves: it never reaches the export.
- A wall's own far end now offers its row while the near one is dragged, since
  it is a foreign Point like any other. That is the intended reading — it is the
  same statement as any other alignment — and two `planDrag` tests moved their
  aim off it to keep testing the rung below.
