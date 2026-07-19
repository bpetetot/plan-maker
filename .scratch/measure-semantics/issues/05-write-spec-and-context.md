# 05 — Write the amended spec and CONTEXT.md

Type: task
Status: resolved
Blocked by: 03, 04

## Question

Fold the decisions of tickets 02–04 into the canonical docs — this is the
map's destination:

- Amend the ubiquitous language in `CONTEXT.md` (Wall, Face, Dimension,
  Placement dimension, Snap — and any ricochet entries the decisions touched).
- Amend the spec (`.scratch/plan-maker/spec.md`) sections covering wall
  drawing, dimensions, and opening placement dimensions so implementation can
  start from it.
- Record an ADR in `docs/adr/` if the anchor decision changed the stored
  model.

## Answer

Resolved 2026-07-19.

- **CONTEXT.md** amended: Wall (drawn length is the overall hors-tout extent,
  honest ghost), Face (mitered junctions + junction patches, half-thickness
  overhang at free ends), Dimension (measures the rendered silhouette on its
  side, extent ticks, positional drag, interior/exterior readings), Placement
  dimension (interior side when the wall borders exactly one Room, chains
  from neighbouring openings, silhouette bounds). Snap and Room area entries
  needed no change.
- **Spec** (`.scratch/plan-maker/spec.md`) amended: §2 dimension/area bullet
  updated (silhouette measure, interior-face room area); §4 drawing-walls
  bullet (hors-tout ghost label and step); new §4 "Wall bodies and dimension
  semantics" subsection; §4 doors-and-windows placement-dimensions bullet; an
  amendment note under the status line links this map.
- **No ADR**: the stored model did not change (the axis anchor stayed), so
  the ticket's ADR condition does not apply.
