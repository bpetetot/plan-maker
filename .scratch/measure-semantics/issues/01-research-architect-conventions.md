# 01 — How do architecture tools handle wall reference lines and dimensioning?

Type: research
Status: resolved

## Question

With walls that have thickness, how do established floor-plan tools handle
drawing anchors and dimension display? Cover both professional CAD/BIM tools
(Revit "location line" / wall justification, ArchiCAD reference line,
AutoCAD Architecture) and consumer tools closer to Plan Maker's audience
(Sweet Home 3D, magicplan, RoomSketcher, Floorplanner). Specifically:

1. **Drawing anchor**: where is the wall anchored while drawing — centerline,
   a face, or a configurable justification/reference line? What do snapping
   and junctions reference?
2. **Dimension value**: which length does a wall dimension show — axis length,
   interior face, exterior face, or both? Is the value side-dependent?
3. **Stability while chaining**: how do live dimensions behave while chaining
   walls — do already-placed values re-adjust as junctions/miters form, and
   how do tools avoid (or accept) that?
4. **Opening dimensions**: what reference do opening placement dimensions use
   — interior face, wall end, nearest opening edge? Standard drafting
   conventions (e.g., NF/DIN/ISO dimensioning practice for doors/windows) are
   relevant too.

Deliverable: findings markdown at
`.scratch/measure-semantics/research/architect-wall-conventions.md`, then
resolve this ticket per `docs/agents/issue-tracker.md`.

## Answer

Findings: [research/architect-wall-conventions.md](../research/architect-wall-conventions.md)
(claims sourced from official-domain search excerpts; direct page fetches were
blocked by the sandbox network policy — caveats marked inline).

1. **Drawing anchor**: every professional tool anchors walls on a configurable
   reference line — Revit "Location Line" (default Wall Centerline; persists
   across type changes; the flip axis), ArchiCAD "Reference Line" (default
   outside face; center/inside/core variants + offset; junctions form where
   reference lines intersect), AutoCAD Architecture justification
   (Left/Center/Right/Baseline; baseline drives cleanup). Consumer tools that
   document it use a fixed centerline/axis: Sweet Home 3D (endpoints "always in
   the middle of the wall"), Floorplanner (axis + "move wall across axis"
   offset); magicplan has no per-wall thickness at all.
2. **Dimension value**: never implicitly side-dependent in pro tools — the
   reference (centerline / faces / core) is an explicit setting or pick
   (Revit temporary/permanent dimension references, ArchiCAD dimension-detail
   checkboxes); ACA's canonical Length is the baseline endpoint distance.
   Consumer tools show labeled room-meaningful values instead: RoomSketcher
   distinguishes "inside wall length" vs "outside measurement", Floorplanner
   edits the interior dimension.
3. **Chaining stability**: solved by construction — the drawn/typed length
   lives on the junction-invariant reference line; faces are derived cleanup
   geometry. ACA states it outright: face length can differ from true
   (baseline) length by up to twice the cleanup-circle radius.
4. **Opening dimensions**: Revit configures the opening reference
   (Centerlines vs Openings/edges) independently of the wall reference.
   Drafting practice: US wood frame dimensions to opening centers, masonry to
   opening edges / rough opening; DIN 1356 annotates openings as
   width-over-height plus sill height (BRH); French NF P02 practice chains
   baie widths edge-to-edge with allège/baie heights. ISO 129-1 is generic
   (delegates to ISO 6284, not accessible).

The findings file ends with options (not decisions) for Plan Maker's four
questions — e.g. keep the centerline anchor with face-referenced numeric entry,
measure the axis for live/chaining feedback, and edge-referenced,
tape-measurable opening dimensions.
