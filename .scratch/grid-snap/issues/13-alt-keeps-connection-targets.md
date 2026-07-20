# 13 — Alt filters alignment, never connection

**What to build:** a free move (Alt) currently short-circuits the whole snap ladder: `snapPoint`
returns the rounded cursor before any target is considered. Drawing a wall in
free mode therefore cannot connect to anything — the endpoint lands *near* an
existing wall without ever splitting it, which is exactly the disconnected
"looks closed, isn't closed" geometry ADR 0002 removed from the model.

Alt becomes a filter on the ladder rather than a short-circuit:

| Rung | Without Alt | Under Alt |
| --- | --- | --- |
| Existing point | yes | yes |
| Wall body (when `walls`) | yes | yes |
| 45° axis from the anchor | yes | no |
| 10 cm grid | yes | no → `kind: 'free'`, integer rounding |

The rule, in one sentence: **Alt suspends the alignment targets (45° axes,
grid); it never suspends the connection targets (existing Point, wall body).**

Two derived consequences:

- Inside the wall-body rung, the axis ∩ wall refinement (ADR 0002) is skipped
  under Alt — no axis locks, so the position is always the plain orthogonal
  projection and `axisFrom` stays undefined. Coherent: hooking onto the wall is
  connection, keeping the drawn wall straight is alignment.
- A point drag keeps its point rung under Alt, so **two Points can now merge
  during a free move**. It gains no wall-body rung: it never had one, with or
  without Alt.

The tolerance is identical in both modes — placing a point 3 cm from a wall
becomes impossible, and that is accepted (`CONTEXT.md`: simplicity beats
precision; a near-junction that does not connect is the failure mode this
prevents). Group moves (`realignDelta`, ADR 0004) are untouched. The snap
indicator already renders per `kind` (`render.tsx`), so the wall marker appears
under Alt for free.

This overturns part of [02](02-keep-alt-free-mode.md): Alt survives as the
cm-precision escape hatch, but it is no longer "no snapping at all".

**Status:** done

## Acceptance

- [x] Under Alt with `walls`, a cursor within tolerance of a wall body returns
      `kind: 'wall'` with the wall id, at the orthogonal projection and with no
      `axisFrom`.
- [x] Under Alt, a cursor within tolerance of an existing point returns
      `kind: 'point'`, and the point rung still beats the wall rung.
- [x] Under Alt, no `axis` and no `grid` result is ever produced; away from any
      target the result is `kind: 'free'` at integer centimeters.
- [x] Drawing a wall with Alt held onto another wall's body splits that wall.
- [x] Dragging a Point onto another one with Alt held still merges them.
- [x] `realignDelta` and group moves are unchanged.
- [x] The **Free move** and **Snap** entries in `CONTEXT.md` state the rule, and
      ADR 0002's axis ∩ wall consequence records the Alt carve-out.

## Comments

Decided in a grilling session (2026-07-20). No ADR: the change is a one-branch
UX rule in the editor, cheaply reversible, and the glossary entry states it
where a reader will look — unlike ADR 0002/0004, which carry model invariants.
