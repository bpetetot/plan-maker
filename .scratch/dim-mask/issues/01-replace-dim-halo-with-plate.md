# Replace the dimension-text halo with a rounded plate

Status: resolved
Type: prototype

The 4px sheet-coloured glyph-outline halo (`paint-order: stroke`) under
Dimension texts merged adjacent glyph contours into a wavy cloud, sometimes
much wider than the text. The thickness had been chosen to mask the Rails
through the spaces of the text — and the Rails were dropped in `a249d27`,
leaving the constraint stale.

## Decision

Full-box masking stays (grid, walls and neighbouring dimension lines must
never show through a measure, spaces included), but the mechanism becomes a
**rounded sheet-coloured plate** under the text (candidate B), drawn by the
shared `DimText` component in `src/editor/render.tsx`. The extent line now
breaks exactly at the plate's edges. The PNG export reuses the same component
and passes its own font size (10px vs the editor's 8px), which also retires
the old 4px-editor / 3px-export halo inconsistency.

## Answer

Candidate B — rounded plate (rx 3) — chosen on the bench over A (sharp
plate), C (feMorphology-smoothed halo) and the status quo, across four
scenarios (on the grid, over a crossing wall, short dimension with outside
heads, neighbouring dimension line through the text) in both themes.

Primary sources:

- Prototype bench: branch `proto/dim-mask`, file
  `.scratch/dim-mask/prototype.html` (self-contained, open in a browser)
- Published artifact: https://claude.ai/code/artifact/a91208f8-4e8c-4c05-ad9d-71b455d4f493

## Comments

- The `Rail` entry in `CONTEXT.md` still describes the dropped guide lines —
  left pending: remove the entry, or bring the Rails back?
- Follow-up (same day): plate padding halved (2px/1px, rx 2), and the drag
  travel is now bounded by the arrowheads — `dimTravelBounds` in
  `src/editor/render.tsx` computes the Rail, `setDimPlacement` clamps to it
  (write-only, as before). `CONTEXT.md` resolved the pending point by
  redefining Rail as the invisible travel line, bounded by the heads.
