# 07 — Visual feedback during realigning group moves

Type: prototype
Status: resolved
Blocked by: 05, 09

## Question

Today the grid-snap feedback is a small green dot at the snapped cursor
position, and group moves show no snap feedback at all. With realignment
([01](01-realign-reference-point.md)), the grabbed group visibly "corrects"
its position on the first move. Does the reference point need feedback (green
dot at its landing intersection, highlight of the reference point), or is the
motion self-explanatory? Prototype the drag feel once the reference rule
([05](05-reference-point-rule.md)) is fixed.

Second signal to design in the same pass, per
[09](09-realignment-merge-interaction.md): an impending merge is signalled live
during the drag, covering **every** colliding point of the selection (not just
the reference) and the case of a wall about to degenerate — ADR 0003 deletes a
wall whose two ends merge, along with its openings. The colliding point may be
far from the cursor or off-screen, which the prototype has to face.

Both signals share the same moment and the same screen space, so this ticket
designs them together rather than as two vocabularies.

## Answer

**No feedback ships with the rework — neither signal.** The realigning group
move is silent: no marker at the reference's landing intersection, no signal
for an impending merge, no signal for a wall about to degenerate. The safety
net is undo alone.

This overturns the live-merge-signal rule of
[09](09-realignment-merge-interaction.md) — see the revision recorded there.
The two decisions are deliberately kept consistent rather than left to
contradict each other in the spec.

Rationale: the rework's value is the grid guarantee itself, and shipping it
unadorned keeps the first implementation small. The collision that would
warrant a warning requires an exact landing within the 1 cm junction
tolerance — narrow enough to live with undo until real use shows otherwise.

Not decided against forever: this is a "not now", and the prototype below
means re-deciding starts from working code rather than a blank page.

### Prototype

Three variants were built and are captured on the throwaway branch
`prototype/07-realign-feedback` (`src/editor/realignFeedback.prototype.tsx`
plus its grafts in `Editor.tsx`):

- **A** — canvas markers: filled dot at the reference's landing, amber rings
  on merging points, dashed red outline on degenerating walls.
- **B** — A plus chevrons pinned to the viewport edge for off-screen
  collisions, plus a status line ("2 points fusionnent · 1 mur supprimé").
- **C** — live outcome preview: the plan renders already merged during the
  drag (degenerating walls simply vanish), with a ghost of the pre-realignment
  position. No warning vocabulary at all.

The branch also carries a throwaway implementation of the realignment
semantic ([01](01-realign-reference-point.md),
[05](05-reference-point-rule.md)), which is what makes it worth keeping: it is
a working reference for the real implementation, not just for the feedback
question.

Surfaced by variant C, and worth recording for whoever re-opens this: previewing
the merged outcome makes a selected wall disappear mid-drag, so the selection
empties under the user's hands. Any future "show the outcome" approach has to
answer that.

## Comments

Decided 2026-07-20. The variants were built but the call was made before
judging them: no feedback for now.
