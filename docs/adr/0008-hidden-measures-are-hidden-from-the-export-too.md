# Hidden measures are hidden from the export too

Measures — every wall's Dimension, every Room area — were unconditional: drawn
on every wall of every plan, printed on every export. A plan dense enough to be
useful is therefore a plan too noisy to show anyone, and the only escape was to
not draw the walls whose numbers were in the way.

Measures become a **state with two values**, shown by default, toggled from a
button beside the Grid's. And the toggle reaches the **PNG export**: what is
hidden on screen is absent from the exported image.

That second half is the decision. The first half is a convenience; alone it
would be a worse one, because the situation that makes someone hide measures is
almost always the situation where they are about to share the plan. A toggle
that cleans the screen and leaves the export unchanged would fail precisely at
the moment it was reached for.

The cost is stated plainly: the preference is **per-device** (`localStorage`,
the storage discipline of the Grid and the Snap state), so the same plan exports
differently from two devices. We accept it — the Theme already has exactly this
property, and an export has always rendered the document *as this editor is
showing it*, not as some canonical form the plan does not carry.

## What counts as a measure

The toggle needs a membership rule, or every number added to the sheet later
becomes an argument. The rule: **a measure is permanent and exported.**

That puts the wall Dimension and the Room area inside, and leaves out the live
length of the wall being drawn and the Placement dimension — both exist only for
the duration of a gesture. It also leaves out the Room name, which is not a
number the plan states about itself, and the Tool panel's Dimensions rows, which
are not on the sheet at all.

The rule is deliberately the one from ADR 0005, read on its other axis. There,
*exported* separated drawing from interaction chrome to decide what obeys the
drawing scale. Here it separates measures from chrome to decide what the toggle
governs. One boundary, used twice — and the two agree, since a hidden measure is
a graphic that exists on neither side rather than one that changed sides.

**ADR 0005 stays true, unamended.** Its rule quantifies over graphics that are
drawn: a measure remains drawing, obeys the drawing scale, and is exported —
when it is shown at all. Hiding removes it from screen and export together, so
no graphic is ever exported without obeying the drawing scale, nor scaled
without being exported. Had the toggle cleaned only the screen, that biconditional
would have broken.

## Considered Options

- **Toggle the screen only, always print measures** — rejected above: it fails at
  the moment the toggle is reached for.
- **Ask at export time**, a checkbox in the export flow — rejected: it re-asks a
  question the toggle has already answered, on every export, and spec §7 fixes
  PNG export as WYSIWYG with no options. The toggle *is* the option, moved to
  where the user can see its effect before committing to it.
- **Store the choice in the plan** rather than per device — rejected: it
  contradicts the rule that the plan carries geometry, not the way it is being
  looked at, and it would put a UI preference in the persistence schema and in
  every exported JSON. The per-device inconsistency is the smaller price.
- **Let the selection override the hiding** — show the selected wall's Dimension
  even when measures are hidden, so its placement stays adjustable. Rejected:
  measures would reappear on the click before an export, exactly when the plan is
  meant to be clean, and "hidden" would stop meaning hidden. Adjusting a
  Dimension's placement is formatting work, done with measures shown; the Tool
  panel keeps the numbers readable meanwhile.
- **Hide room areas with the Room name** rather than with the measures —
  rejected: it splits a text block by graphic proximity instead of by nature. The
  area is a number the plan computes; the name is something the user wrote.

## Consequences

- `PlanScene` takes the preference, so the editor and the export share one
  definition of the scene instead of drifting. `buildExportSvg` and
  `renderPlanPng` take it as an explicit argument and never read storage
  themselves — the export stays a pure function of its inputs, and a test can
  render both variants without touching `localStorage`.
- The preference has **two readers** — the editor draws with it, the export
  prints with it — which is what makes it unlike the Grid's. Storage cannot be
  their shared memory: it fails silently when unavailable, and a silent failure
  here means the screen hiding measures the export still prints. So the session
  holds the value and storage only makes it outlive a reload.
- Hiding is **global and unconditional**: no selection, hover, or gesture brings
  a measure back. The Dimension drag and its Rails are unreachable while measures
  are hidden, which is intended and not a special case in the code — the drag
  handle is the label, so it goes away with it.
- An **unlabeled** room shows nothing at all when measures are hidden: its text
  block held only the area, and a block that renders nothing must not linger as
  an invisible drag target.
- The three boolean per-device preferences — Grid, Snap, Measure — now share one
  `booleanPreference` helper holding the storage discipline (the default stores
  nothing; unavailable storage degrades silently) that had been restated at each
  site.
- No keyboard shortcut, matching the Grid toggle beside it. Shortcuts for the
  display toggles are a separate question, and it comes with the question of
  where a user would discover them.
