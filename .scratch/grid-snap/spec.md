# Spec: grid-aligned snapping rework

Status: ready for implementation issues
Map: [map.md](map.md) — every rule below links the ticket that decided it.

## 1. Problem

The editor promises "everything lands on the 10 cm grid", and today it breaks
that promise in two places:

- **Group moves step the displacement, not the position.** `snapDelta` rounds
  `(dx, dy)` to grid multiples, so an element that is off-grid by 3 cm stays
  off-grid by 3 cm forever, however many times it is moved.
- **45° axis snapping steps the length.** A diagonal of stepped length 70 cm
  lands at `(49.5, 49.5)`, rounded to `(49, 50)` — off-grid *and* no longer
  exactly 45°. Realignment can never fully heal such a wall, because its two
  endpoints carry different offsets.

Off-grid points are legitimate — Alt free mode exists to enter real measurements
of an existing home — but they must be a **deliberate** choice, and any ordinary
non-Alt move must bring the geometry back onto the grid.

## 2. Vocabulary

- **GRID** — 10 cm, `src/model/types.ts`. Unchanged.
- **Point placement** — creating a point (Wall tool) or dragging a single point
  handle. Governed by the snap ladder (§3).
- **Group move** — dragging a wall body or a multi-selection: a rigid
  translation of several points at once. Governed by realignment (§5).
- **Anchor** — the point a new segment is being drawn *from*; the origin of
  axis snapping.
- **Reference point** — the one point of a moving group whose landing position
  the realignment is computed for (§5.2).
- **Free mode** — Alt held: no snapping, whole-centimetre rounding only.

## 3. Point placement: the snap ladder

Priority is **unchanged** — existing point > wall body > 45° axis > grid
([04](issues/04-keep-snap-priority.md)).

Connecting geometry outranks grid alignment on purpose: snapping onto an
existing point or a wall junction keeps the plan topologically clean even when
the target is off-grid. Making the grid win would make it nearly impossible to
connect a wall to an off-grid junction. The grid stays the fallback — what
guarantees alignment when nothing else attracts.

The axis ∩ wall-body intersection rule (ADR 0002) is unchanged.

## 4. Axis snapping is relative to the anchor

**Replaces length-stepping.** The endpoint of an axis-locked segment sits at

```
dx = i · GRID,  dy = j · GRID   from the anchor
```

with `|i| = |j| = k ≥ 1` on a diagonal, and one component zero on an orthogonal
axis. The existing minimum of one GRID step is kept, so the endpoint never
collapses onto the anchor.

Angular tolerance, axis detection, and the dashed guide are unchanged; only the
position along the axis changes.

Two consequences ([03](issues/03-diagonal-grid-crossings.md),
[06](issues/06-offgrid-anchor-axis-fallback.md)):

- **On-grid anchor** — the endpoint lands on a grid intersection, and the wall
  is exactly 45°. The perceived step along a diagonal becomes ~14.1 cm instead
  of 10 cm. This is the "step on grid crossings" behaviour, now expressed as a
  special case of the relative rule rather than a rule of its own.
- **Off-grid anchor** (Alt-placed, or a junction projected onto a wall body) —
  no grid crossing exists on the diagonal, and the endpoint **inherits the
  anchor's offset**: the wall is exactly 45° (or orthogonal) and stays off-grid.
  Consistent with §6 — off-grid is deliberate, and a later non-Alt move
  realigns it.

There is deliberately **one formulation, no fallback branch**.

## 5. Group moves realign to the grid

### 5.1 The semantic

A group move still translates **rigidly** — internal shape preserved, the
invariant `snapDelta`'s comment already states — but the delta is chosen so the
**reference point lands exactly on a grid intersection**
([01](issues/01-realign-reference-point.md)):

```
delta = gridRound(ref + rawDelta) − ref      with ref constant for the drag
```

An off-grid element therefore realigns on its first non-Alt move. Plans heal
progressively through ordinary use.

Rejected: forcing *every* point of the group onto the grid (distorts 45°
diagonals and internal non-multiple geometry); keeping delta stepping and adding
an explicit "realign" command (leaves the default experience broken).

### 5.2 The reference point

The reference is **the selection's wall point nearest the grab position**,
chosen once at pointer-down in plan coordinates and **fixed for the whole drag**
([05](issues/05-reference-point-rule.md)):

- **Single wall body drag** — the wall endpoint nearest the click. Not always
  `a`, and not a bbox corner (which may not be a real plan point).
- **Multi-selection drag** — the nearest wall point across *all* selected walls,
  regardless of which element was clicked: `clickRef` may be an opening, which
  has no point of its own. Distance ties break deterministically (e.g. endpoint
  `a`, then lowest id) — an implementation detail, not a user-visible rule.
- **Alt pressed or released mid-drag** switches only the delta computation
  (§6), never the reference.
- **Selection with no wall point** (openings and/or room labels only) — no
  realignment. `translateElements` only moves wall points, so such a group drag
  already translates nothing; solo opening and label drags are separate
  gestures and are unaffected.

Fixing the reference at pointer-down is what keeps the preview from jumping a
few centimetres each time a different candidate becomes nearest.

### 5.3 Group moves snap to the grid only

The snap ladder of §3 governs **placing a point**. It does **not** extend to
group moves ([09](issues/09-realignment-merge-interaction.md)): a group's
reference point realigns to the nearest grid intersection and to nothing else —
no point snapping, no wall-body snapping, no axis lock.

A group drag has no anchor and expresses no connection intent: the user is
moving a mass, not aiming at a junction. Running the full ladder would stick the
whole group to a point nobody is looking at, and could pull the group *off* the
grid on a gesture whose entire purpose is to return it there.

Consequence: a group landing on an existing point is always a geometric side
effect, never an intent.

### 5.4 Coincident points still merge

Unchanged from today: on drag-end, `planarize(mergeCoincidentPoints(...))`. No
intent guard, no collision avoidance
([09](issues/09-realignment-merge-interaction.md)).

Guarding the merge was rejected because it would produce two Points at the same
position — the state ADR 0003 declares impossible at the *model* level, not
merely at the gesture level. It would not even survive a reload, since load and
import normalization merges coincident points anyway.

The safety net is undo: the merge happens inside the gesture's history group
(ADR 0003), so one undo restores the exact pre-drag plan. The exposure is narrow
— the collision requires an exact landing within the 1 cm junction tolerance,
not merely passing within snap tolerance.

## 6. Alt free mode is unchanged

Alt remains the deliberate escape hatch for centimetre-precision input, needed
for real measurements of an existing home
([02](issues/02-keep-alt-free-mode.md)). It rounds to whole centimetres and
performs no snapping, for point placement and for group moves alike.

Removing free mode was rejected (loses non-multiple real-world measurements);
so was making Alt placement "sticky off-grid" so later moves preserve the offset
(contradicts §5.1).

## 7. No drag feedback ships with this rework

The realigning group move is **silent**
([07](issues/07-realignment-feedback.md)):

- no marker at the reference's landing intersection,
- no signal for an impending merge,
- no signal for a wall about to degenerate (ADR 0003 deletes a wall whose two
  ends merge, along with its openings).

Undo is the whole safety net. Existing point-placement feedback — green ring on
point snap, dashed guide on axis lock, green dot on grid snap — is untouched;
this section is only about group moves.

Rationale: the rework's value is the grid guarantee itself, and shipping it
unadorned keeps the first implementation small. This is a **"not now"**, not a
permanent no. Ticket 09 had argued for a live signal — the colliding point may
be far from the cursor or entirely off-screen — and that argument was never
refuted, only outweighed. It is the first thing to re-read if this is re-opened.

Three feedback variants were built before the call and are kept on the
throwaway branch `prototype/07-realign-feedback`
(`src/editor/realignFeedback.prototype.tsx` plus its grafts in `Editor.tsx`):
canvas markers (A), markers plus off-screen chevrons and a status line (B), and
a live merged-outcome preview (C). The branch also carries a **working
throwaway implementation of the realignment semantic** (§5.1, §5.2) — a
reference for the real implementation, not just for the feedback question.

Recorded from variant C for whoever re-opens this: previewing the merged
outcome makes a selected wall disappear mid-drag, so the selection empties under
the user's hands. Any future "show the outcome" approach has to answer that.

## 8. Code impact

- `src/model/snap.ts`
  - `snapDelta` — replaced by (or reshaped into) a realignment helper taking the
    reference point: `realignDelta(ref, rawDelta, free)`. The free branch keeps
    whole-cm rounding.
  - `snapPoint` — the `kind: 'axis'` branch stops stepping `length` and steps
    `dx`/`dy` relative to the anchor instead (§4).
- `src/editor/Editor.tsx`
  - `startPlanDrag` / the `group` drag — computes and stores the reference point
    at pointer-down (§5.2); the `pointermove` handler at the `snapDelta` call
    site uses the realignment delta.
  - Drag-end `planarize(mergeCoincidentPoints(...))` is unchanged (§5.4).
- `src/model/selection.ts` — `translateElements` unchanged; it stays a pure
  rigid translation.
- No persistence change: the model is untouched, and off-grid plans stay
  loadable and heal on move.

## 9. ADR to write

The realignment semantic deserves an ADR alongside 0002 and 0003 — it is a
model-level rule with consequences those two ADRs interact with (planar
insertion, coincident merge). It should carry §5.1–§5.4: realign rather than
step, the fixed nearest-wall-point reference, group moves snapping to the grid
only, and the unconditional merge that follows.

The main spec's §Snapping (`.scratch/plan-maker/spec.md`) should also be
updated once this ships:

- "45° axis lock" gains the relative-to-anchor stepping rule (§4).
- §Selection and editing — "drag the body to move (grid-stepped)" becomes
  "drag the body to move (realigns to the grid)".

Both updates are part of the implementation work, not of this spec.

## 10. Out of scope

- Cutting this spec into implementation issues, and the implementation itself —
  starts where this document ends.
- Automatic healing or migration of existing off-grid plans. Not in production,
  no migrations required; realign-on-move heals plans progressively.
- Any drag feedback (§7) — deferred, not cancelled.
