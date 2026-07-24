# The snap marker is constant on-screen size

While drawing a wall or a ruler, Snap draws a marker at the aimed position (CONTEXT.md:
Snap). It was sized in world units — a ring of radius 10 for a point snap, 6.5 for a wall
snap, a filled dot of 3.5 otherwise — so it scaled with the view: a small dot when zoomed
out, an over-large ring when zoomed in, the exact complaint that opened this change. The
Point **handle** already solved the same problem the other way (CONTEXT.md: Grab zone): a
ring of `HANDLE_RING_PX / pxPerCm`, its strokes pinned with `vectorEffect="non-scaling-stroke"`,
so it holds one on-screen size at every zoom.

The decision is to make the snap marker **constant on-screen size**, built the Handle's way,
and to collapse it from three forms to **two**.

- **Two levels, not three** — the `point` and `wall` snaps merge into one *attached* marker:
  both mean "your click lands on existing geometry", and the ladder already treats them as
  the connection targets together (CONTEXT.md: Snap). The `axis`, `grid` and `free` snaps
  keep a single *free* marker. The distinction that survives is the one a user acts on —
  attaching to something versus not — not the internal kind.
- **The attached marker is the Handle, in green** — the same double-stroke ring (a
  sheet-colored band outlined on both sides), edged in `--snap` instead of `--wall`. It reads
  as a sibling of the move handle: same shape and size, a different ink for a different job.
- **The free marker is a small dot** — a filled `--snap` disc of constant screen size, given
  a thin sheet-colored halo so it stays legible over a dark wall.
- **The axis guide is unchanged** — the dashed `--snap` line for a locked axis or a wall
  intersection stays exactly as it was.

## Considered Options

- **Keep three markers, only fix the scaling.** Rejected: once every marker is a calm,
  constant size, the `point`-vs-`wall` size gap stopped carrying its weight. Losing the
  "this click will split a wall" signal is the accepted trade — in both cases you are
  deliberately attaching to existing geometry.
- **Invent a fresh glyph for the attached marker** (crosshair, diamond, target). Rejected on
  a prototype bench: a new shape competes with the handle for the same "there is a point
  here" meaning. Reusing the handle's form and recoloring it makes the two read as one family
  — grab is grey, snap is green.
- **Drop the free marker, rely on the cursor.** Rejected: the grid can pull the placed Point
  several centimetres off the cursor, and without a dot you place beside where you aimed.

## Consequences

- `SnapMarker` now takes `pxPerCm` (passed `zoomScale`, like `Handle`) and divides its radii
  by it; the ring's strokes use `non-scaling-stroke`. The marker no longer balloons or
  vanishes across the zoom range.
- The wall snap no longer looks different from the point snap. Code that wanted to signal an
  imminent split through the marker no longer can — the split still happens, it is just not
  foreshadowed by a distinct glyph.
- The marker vocabulary matches the handle vocabulary: constant on-screen size, the same ring
  construction, so the two are learned once.
