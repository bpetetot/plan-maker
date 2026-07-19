# 03 — How should wall dimensions be displayed (stable and intuitive)?

Type: prototype
Status: resolved
Blocked by: 02

## Question

Today a Dimension measures along the Face on the side it sits on, so the two
sides of a wall disagree and values jump as junctions form. Build a throwaway
UI prototype (per `/prototype`) showing variants to react to, e.g.:

- One value that follows the side (current behavior);
- Both values per wall (interior + exterior face);
- Axis length only (single canonical value);
- Face value with a visual indicator of which face is measured.

Include the behavior while chaining walls: what the live dimension shows
during drawing, and whether already-placed values may re-adjust when a new
junction forms. Resolve with the chosen variant and its rules.

## Answer

Resolved 2026-07-19, prototype session (variants A–D iterated live with the
user; asset: branch `prototype/dim-display-variants`). Axis-only (C) and a
chronology-based "traversing/abutting" model were explored and superseded.
The decided model:

1. **Wall body**: faces mitered at junctions (as `facePoint` does today), and
   the body **overhangs its anchor Point by half the thickness at free ends**
   (square cap). **Junction patches** — the polygon of all incident face
   corners, ordered angularly around the Point — fill the central gaps
   outlines leave at T and angled crossings. The drawing ghost gets square
   line caps (same overhang) so its silhouette is honest.
2. **Drawing is hors-tout**: the rubber-band label and the 10 cm step apply
   to the outer extent = axis + thickness. With the default 10 cm thickness,
   anchors stay on the 10 cm grid (axis = drawn − thickness). Snapping
   targets are unchanged (decision 02).
3. **Dimension value = the rendered silhouette on the side the dimension
   sits on**, exactly: the mitered face corners at junction ends (with
   `faces.ts`' miter-limit fallback to the Point for near-collinear
   continuations), the body overhang at free ends. Consequences: the
   exterior of a closed room reads hors-tout (a 4×4 m drawn room reads
   4.00 m outside, invariant once its junctions exist), the interior reads
   edge-to-edge between the neighbours' faces (3.80 m), and a standalone
   wall reads its drawn hors-tout on both sides. The dimension and the hover
   silhouette can never disagree — they derive from the same corners.
4. **Value changes when a junction forms are accepted** as a legitimate
   refinement, made legible by the visuals: a broken dimension line with
   perpendicular ticks at the measured extent (PlacementDims' language).
   Dragging the dimension stays purely positional (t along the wall, side
   across it); crossing sides switches between the interior and exterior
   readings.
5. **PNG export follows the same body rendering and dimension rules.** Room
   areas are untouched (still bounded by interior faces — consistent with
   the interior reading).
