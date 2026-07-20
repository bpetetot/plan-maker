# 12 — Document the realignment semantic

**What to build:** the project's living documentation states the grid guarantee
the rework now delivers, so a reader of the docs alone reaches the same
conclusions the implementation encodes.

An **ADR** alongside 0002 and 0003 records the realignment semantic — it is a
model-level rule, and it interacts with both (planar insertion, coincident
merge). It carries four decisions: a group move realigns rather than steps its
displacement; the reference is the selection's wall point nearest the grab,
fixed at pointer-down; a group move snaps to the grid only, never through the
placement ladder; and the coincident merge that follows stays unconditional,
with undo as the safety net. It should record the rejected alternatives too —
forcing every point of the group onto the grid, keeping delta stepping plus an
explicit "realign" command, guarding the merge — since those are the questions a
future reader will re-ask.

The **main spec** (`.scratch/plan-maker/spec.md`) is brought back in line: the
"45° axis lock" rule gains the relative-to-anchor stepping, and in
§Selection and editing "drag the body to move (grid-stepped)" becomes "drag the
body to move (realigns to the grid)".

**CONTEXT.md** is corrected: the **Snap** entry currently says a group move
snaps its displacement as a whole, which the rework makes false. It needs the
realignment wording, and the vocabulary the two other tickets introduced —
*reference point*, and *anchor* as the origin of axis snapping — should be
reachable from the glossary.

Deferred drag feedback (§7 of the spec) is not documented as a decision here
beyond what the ADR needs; it is a "not now", recorded in the spec already.

See `.scratch/grid-snap/spec.md` §9.

**Blocked by:** 10 (axis snapping is relative to the anchor), 11 (group moves
realign to the grid) — the docs describe shipped behaviour.

**Status:** done

- [x] A new ADR exists next to 0002 and 0003, following their format, covering
      realign-not-step, the fixed nearest-wall-point reference, grid-only
      snapping for group moves, and the unconditional merge.
- [x] The ADR records the rejected alternatives and why they were rejected.
- [x] `.scratch/plan-maker/spec.md` §Snapping describes the relative-to-anchor
      axis rule.
- [x] `.scratch/plan-maker/spec.md` §Selection and editing no longer says
      "grid-stepped" for a body drag.
- [x] The **Snap** entry in `CONTEXT.md` no longer claims a group move snaps its
      displacement as a whole, and the glossary covers the reference point.
- [x] No behaviour change: this ticket touches documentation only.
