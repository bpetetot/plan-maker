# 14 — Axis snapping targets absolute grid crossings

**What to build:** an axis-locked endpoint lands where the axis **crosses the
grid lines**, taken absolutely, instead of stepping whole grid multiples from
the anchor. Reverses the off-grid half of [06](06-offgrid-anchor-axis-fallback.md)
and [10](10-axis-snapping-relative-to-anchor.md):

```
P(t) = anchor + t · step,   t > 0
candidates:  step.x ≠ 0  →  anchor.x + t · step.x ≡ 0  (mod GRID)
             step.y ≠ 0  →  anchor.y + t · step.y ≡ 0  (mod GRID)
chosen:      the candidate whose t is nearest the cursor's projection
```

At least one coordinate of the endpoint is therefore exactly on the grid, and
the segment stays exactly on its axis. A diagonal offers two interleaved
families of crossings, the nearest to the cursor winning; an orthogonal axis
offers only the family it is not parallel to. From an on-grid anchor the two
families collapse onto the whole grid multiples and the previous behaviour is
reproduced exactly — one formulation, no fallback branch, and the old `k ≥ 1`
minimum becomes the consequence of taking the first crossing beyond the anchor.

The price, accepted: from an off-grid anchor the length is no longer a grid
multiple — it absorbs the offset. The two cannot both hold.

Untouched: the snap priority ladder, the angular tolerance, axis detection, the
dashed guide and `axisFrom`, the axis ∩ wall-body intersection (ADR 0002), and
Alt free mode.

See [ADR 0006](../../../docs/adr/0006-axis-snapping-targets-absolute-grid-crossings.md).

**Blocked by:** None.

**Status:** done

- [x] From an off-grid anchor, an orthogonal lock aligns the moving component to
      the absolute grid and leaves the other equal to the anchor's.
- [x] From an off-grid anchor, a diagonal lands on the nearer of the two crossing
      families and stays exactly 45°.
- [x] Equal anchor offsets make both families coincide — the diagonal lands on a
      true grid intersection.
- [x] From an on-grid anchor, nothing changes: 10 cm / ~14.1 cm steps on
      intersections, negative axes included.
- [x] The endpoint never collapses onto the anchor, on-grid anchor (10 cm
      minimum) and off-grid anchor alike.
- [x] Docs: ADR 0006, `CONTEXT.md` (Snap, Drawing anchor), the main spec
      §Snapping and §Drawing walls, amendment notes on grid-snap §4 and tickets
      06 and 10.
