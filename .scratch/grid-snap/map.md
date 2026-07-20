# Map: grid-aligned snapping rework

Labels: wayfinder:map
Status: complete — destination reached, see [spec.md](spec.md)

## Destination

A validated `spec.md` in this directory for the grid-aligned snapping rework —
wall add/move (including multi-selection) always lands on grid intersections
unless the user deliberately escapes with Alt — ready to be cut into
implementation issues. Implementation itself happens outside this map.

## Notes

- Domain code: `src/model/snap.ts` (snapPoint, snapDelta), `src/editor/Editor.tsx`
  (drag handling), `GRID = 10` cm in `src/model/types.ts`.
- Prior art: spec §Snapping in `.scratch/plan-maker/spec.md`, ADR 0002
  (planar insertion on wall commit), ADR 0003 (coincident points merge on commit).
- Skills: `/grilling` + `/domain-modeling` for decision tickets, `/prototype`
  for feel/feedback questions.
- Standing preference: grill one question at a time, each with a recommended
  answer; act only after a confirmed recap.

## Decisions so far

- [01 — Group moves realign a reference point to the grid](issues/01-realign-reference-point.md) —
  drag deltas are no longer grid-stepped; the delta is chosen so the reference
  point lands exactly on a grid intersection, group moves rigidly.
- [02 — Alt free mode stays as-is](issues/02-keep-alt-free-mode.md) — Alt remains
  the deliberate cm-precision escape; a later non-Alt move realigns.
- [03 — 45° diagonals step on grid crossings](issues/03-diagonal-grid-crossings.md) —
  axis snap targets points where dx and dy are both grid multiples, not
  length steps; a 45° wall from an on-grid anchor stays fully on-grid.
- [04 — Snap priority unchanged](issues/04-keep-snap-priority.md) — point > wall
  body > 45° axis > grid; connecting geometry beats grid alignment.
- [05 — Which point is the realignment reference?](issues/05-reference-point-rule.md) —
  the selection's wall point nearest the grab, fixed at pointer-down for the
  whole drag; no wall point in the selection means no realignment.
- [06 — 45° axis rule when the anchor is off-grid](issues/06-offgrid-anchor-axis-fallback.md) —
  axis snapping is uniformly relative to the anchor (dx, dy multiples of GRID,
  minimum one step); the on-grid grid-crossing rule becomes a special case, and
  an off-grid anchor yields an exact 45° wall that inherits its offset.
- [09 — Realignment landing on existing points](issues/09-realignment-merge-interaction.md) —
  group moves snap to the grid only (the snap ladder governs point placement,
  not group drags), so a landing on an existing point is always a side effect;
  it merges unconditionally (guarding it would break ADR 0003's model
  invariant). Its live-signal rule was overturned the same day by ticket 07.
- [07 — No drag feedback ships with the rework](issues/07-realignment-feedback.md) —
  the realigning group move is silent: no landing marker, no merge signal, no
  degenerating-wall signal; undo is the whole safety net. Three variants were
  built first and are kept on the `prototype/07-realign-feedback` branch, which
  also carries a working throwaway implementation of the realignment semantic.
- [08 — Write the spec](issues/08-write-spec.md) — [`spec.md`](spec.md) is
  written and the destination is reached: every decision assembled, the 07/09
  contradiction stated once in its resolved form, the axis rules collapsed into
  one anchor-relative formulation. The main-spec §Snapping edits and the
  realignment ADR are recorded as implementation work, not done here.

## Not yet specified

(empty — all known fog has graduated into tickets)

## Out of scope

- Cutting the spec into implementation issues and implementing the rework —
  starts where this map ends.
- Automatic healing/migration of existing off-grid plans — not in production,
  no migrations required; realign-on-move heals plans progressively.
