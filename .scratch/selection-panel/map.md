# Map: selection panel

Labels: wayfinder:map

## Destination

An implementation-ready spec at `.scratch/selection-panel/spec.md` (plus its
implementation issues): the selection popover replaced by a fixed vertical
panel on the left, Excalidraw-style, showing per-element parameters and
actions.

## Notes

- Skills: `/grilling` + `/domain-modeling` for decision tickets, `/prototype`
  for UI tickets. Grilling style: one question at a time, with a
  recommendation.
- The current popover lives in `src/editor/Editor.tsx` (anchored to the
  selection in wrapper coordinates); measure vocabulary is in `CONTEXT.md`
  (Dimension, Face, silhouette readings).
- Framing decisions from the charting session:
  - Panel floats on the **left**, over the canvas (Excalidraw reference).
  - **Hidden when the selection is empty** — tools have no options to show
    yet.
  - Wall: in/out measures **display-only** + delete. Door: existing
    **preset-width select** + hinge/swing + delete. Window: select + delete.
  - Multi-selection: current minimum carried over (count + delete).
  - Desktop only (mobile is already out of scope globally, plan-maker spec
    §10).

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- [01 — Panel prototype](issues/01-panel-prototype.md) — Variant A "floating
  card" retained: 232px rounded card below the burger menu (left 16, top 72,
  Excalidraw-style), sectioned with uppercase labels, full-width Delete at
  the bottom; bottom-left controls untouched. Primary source: branch
  `prototype/selection-panel`.
- [02 — Wall in/out measure semantics in the panel](issues/02-wall-measure-semantics.md)
  — Nominal (wall borders exactly one room): Interior / Exterior / Thickness
  rows, same silhouette readings as the canvas Dimensions. Hard cases
  (`interiorSide` null): single Length (hors-tout) row + Thickness. No
  Overall row; display-only.
- [04 — Panel interaction details](issues/04-panel-interaction-details.md)
  — No focus steal on selection (Tab in DOM order, `isTypingTarget` rule
  kept); visible + live values during canvas drags; instant show/hide, no
  animation; height capped above the bottom-left controls with internal
  scroll.

- [03 — Write the spec and cut implementation issues](issues/03-write-spec.md)
  — [`spec.md`](spec.md) assembled from the resolved tickets; implementation
  cut into
  [05 — Selection panel replacing the popover](issues/05-selection-panel.md)
  and [06 — Wall measure rows](issues/06-wall-measure-rows.md) (blocked by
  05), both `ready-for-agent`. **Destination reached — no decision tickets
  remain open.**

## Not yet specified

<!-- (empty — the prototype's fog graduated into
  issues/04-panel-interaction-details.md) -->

## Out of scope

- Editable wall measures (resizing a wall by typing a length) — display-only
  was decided; typed resize is its own effort (anchoring, junctions, closed
  chains).
- Free numeric input for opening widths — the preset select stays; free input
  drags in a validation chain (min/max, wall overflow, opening overlap).
- Richer multi-selection (per-type counts, group actions) — orthogonal to the
  popover replacement.
- Panel visible with an empty selection showing tool options — relevant only
  once tools have configurable settings.
- Mobile/touch — already out of scope for the whole app (plan-maker spec §10).
