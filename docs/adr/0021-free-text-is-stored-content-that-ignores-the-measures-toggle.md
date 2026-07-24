# Free text is stored content that ignores the measures toggle

ADR 0017 settled that **persistence** and **visibility** are two independent
axes, and read the Ruler onto the unusual corner: stored in the plan like a
wall, yet hidden and inert exactly as a Dimension is, because a Ruler is a
number the user adds to the sheet — the very noise the Measures toggle exists
to clear. It also warned that ADR 0008 never claimed the converse: not
everything the toggle hides is computed, and storage says nothing about whether
a drawing is a measure.

**Text** is the element that walks to the opposite corner and makes the two
axes visibly independent:

- **Persistence** — always. A Text is part of the plan, round-tripped through
  save, JSON export, and reload unconditionally, exactly like a Ruler. Same
  axis, same answer.
- **Visibility** — always too. A Text is **content**, not a measure: the words
  the user wrote onto the sheet, not a number the plan states about itself. It
  ignores the Measures toggle — shown on screen whether measures are hidden or
  not, and present in the PNG export the same way — and it stays interactive
  (clickable, marquee-able, draggable) at all times.

So the four corners of (persist × hide-with-measures) are now all real, and
that is the point of recording this: the Ruler and the Text share one axis and
split the other. A Ruler is *stored data whose drawing the toggle governs*; a
Text is *stored data whose drawing the toggle never touches*. What separates
them is not whether they persist — both do — but what their graphic **is**: a
Ruler draws a Dimension, a Text draws prose. ADR 0008's membership rule ("a
measure is permanent and exported") already excludes the Room name on exactly
this ground — a name is not a number the plan states about itself — and a Text
is Room-name-like on that axis, not Ruler-like.

**ADR 0017 and ADR 0008 both stay true, unamended.** ADR 0017's two-axes
framing is what lets a second stored element answer the visibility axis
differently without contradiction; the Text confirms the framing rather than
straining it. ADR 0008's rule quantifies over the graphics the toggle governs,
and a Text's graphic is simply not one of them — the same way the Room name
isn't.

## Considered Options

- **Follow the Measures toggle, like the Ruler** — hide Text on a clean sheet,
  drop it from the export then. Rejected: it mistakes content for a measure. The
  user writes a Text *to keep it on the sheet* — a label on a zone, a note to a
  builder — and the situation that hides measures (sharing the plan) is exactly
  when those notes must stay. Hiding them would gut the feature at the moment it
  is reached for, the mirror of ADR 0008's own argument for reaching the export.
- **Give Text its own visibility toggle**, a second "show annotations" switch.
  Rejected: it asks the user to manage a display axis for a thing that has no
  reason to hide. Content that is always wanted is content with no toggle; a
  Text that is unwanted is deleted, not hidden.
- **Store Text but always export it while hiding it on a measures-off screen** —
  rejected for the same reason ADR 0008 rejected the export-only Ruler: it
  re-splits the WYSIWYG guarantee, printing something the screen does not show.
  Text is WYSIWYG by being always shown, not by being conditionally printed.

## Consequences

- The scene renders Text **outside** the `measuresVisible` gate. In `PlanScene`
  (`src/editor/render.tsx`) the `plan.texts` loop sits above the guarded
  `RulerLabel` and `DimLabel` loops, so the editor and the PNG export (which
  share `PlanScene`) both draw Text unconditionally — the one loop in the scene
  that never consults the preference.
- Selection, marquee, Select-all, hover, and drag for Text carry **no**
  `measuresVisible` predicate — every such gate the Ruler code has was dropped
  for Text (ticket 08). "Always visible" therefore means always interactive, the
  exact inverse of the Ruler's "hidden means inert."
- The Measure definition in CONTEXT.md keeps naming the Ruler as its one
  toggle-following exception; Text needs no mention there, because a Text never
  approaches the toggle. It is documented on the content side — the Text term —
  not as a second dissent in the measure rule.
- Entering the Text tool does **not** force measures on, unlike the Ruler tool
  (which must, or it would draw an inert object into a hidden layer). A Text is
  never inert, so the tool has nothing to reveal.
