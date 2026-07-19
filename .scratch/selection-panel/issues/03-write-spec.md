# 03 — Write the spec and cut implementation issues

Type: grilling
Status: resolved
Blocked by: 01, 02, 04

## Question

Assemble `.scratch/selection-panel/spec.md` from the map's decisions and the
resolved tickets (panel prototype, wall measure semantics, panel interaction
details), then cut the
implementation issues under `.scratch/selection-panel/issues/`. Reaching this
ticket's resolution is the map's destination.

## Answer

Spec and issue cut confirmed with the human (2026-07-19):

- **[`spec.md`](../spec.md)** assembled from the three resolved decision
  tickets — placement/anatomy from
  [01 — Panel prototype](01-panel-prototype.md), wall measure semantics from
  [02 — Wall in/out measure semantics in the panel](02-wall-measure-semantics.md),
  interactions from
  [04 — Panel interaction details](04-panel-interaction-details.md) — plus
  the framing decisions and out-of-scope list from the map.
- **Implementation issues cut**, both `ready-for-agent`:
  - [05 — Selection panel replacing the popover](05-selection-panel.md) —
    the panel component, popover removal, test updates; temporary single
    Length row for walls.
  - [06 — Wall measure rows](06-wall-measure-rows.md) — the
    `interiorSide`-driven rows + hard-case unit tests. Blocked by 05.

This resolution is the map's destination: no decision tickets remain open.
