# Axis snapping targets absolute grid crossings — the offset dies where it was born

ADR 0004 made group moves *fix* alignment instead of inheriting it. Point
placement kept inheriting it: an axis-locked endpoint stepped a whole number of
grid multiples **relative to the anchor**, so from an off-grid anchor it carried
the anchor's sub-grid offset forever. The offset was hereditary — every wall
drawn from an off-grid point produced another off-grid point — and only a later
group move could rescue the result. Off-grid anchors are not exotic: any point
projected onto a wall body is one.

The endpoint of an axis-locked segment now lands where the axis **crosses the
grid lines**, taken absolutely:

```
P(t) = anchor + t · step,   t > 0
candidates:  step.x ≠ 0  →  anchor.x + t · step.x ≡ 0  (mod GRID)
             step.y ≠ 0  →  anchor.y + t · step.y ≡ 0  (mod GRID)
chosen:      the candidate whose t is nearest the cursor's projection
```

At least one coordinate of the endpoint is therefore exactly on the grid, and
the segment stays exactly on its axis. A diagonal offers two interleaved
families of crossings — one aligning x, the other y — and the nearest to the
cursor wins; an orthogonal axis offers only the family it is not parallel to.

This is deliberately **one formulation with no fallback branch**. From an
on-grid anchor both families collapse onto the whole grid multiples, which
reproduces the previous behaviour exactly: 10 cm steps on an orthogonal axis,
14.1 cm on a diagonal, landing on true intersections. The old `k ≥ 1` minimum
likewise stops being a rule and becomes a consequence — "the first crossing
beyond the anchor" is what prevents the endpoint from collapsing onto the
anchor, and from an on-grid anchor that first crossing is one grid step away.

The rule governs the pure `axis` rung only. Where the locked axis meets a wall
body, the axis ∩ wall intersection still wins (ADR 0002): the wall body is a
higher rung and a connection target, and connecting outranks aligning.

## Considered Options

- **Keep stepping relative to the anchor** — rejected: it is what makes the
  offset hereditary. It buys round lengths from an off-grid anchor at the price
  of never returning to the grid.
- **Send the endpoint to the nearest grid intersection in the locked
  direction** — rejected: from an off-grid anchor no intersection lies on the
  axis at all (only a diagonal whose two offsets are equal crosses any), so the
  endpoint would leave the axis and the wall would no longer be exactly 45° or
  exactly orthogonal. That is precisely the defect the grid-snap rework closed:
  off-grid *and* no longer exactly 45°.
- **Pick one crossing family by convention on a diagonal** (always x) —
  rejected: no simpler to write, and asymmetric — the same diagonal would behave
  differently depending on its orientation.

## Consequences

- From an off-grid anchor, wall lengths are no longer grid multiples: the
  length absorbs the offset (anchor at x = 3 → endpoint at x = 210, length
  207). Accepted deliberately — a round length from an off-grid anchor
  *guarantees* an off-grid endpoint; the two cannot both hold, and containing
  the offset is worth more than a round number the Dimension displays anyway.
- Plans heal on drawing, not only on moving. The offset stops at the wall that
  introduced it instead of propagating through every wall drawn from it.
- On a diagonal whose anchor offsets are close but unequal (3 and 4), crossings
  arrive in pairs 1 cm apart and the perceived step becomes irregular. The
  endpoint is still on the grid by one coordinate; only the regularity of the
  step suffers, in an already pathological case.
- Alt free mode is untouched: it suspends the alignment rungs wholesale, this
  one included.
- Supersedes the earlier grid-snap rule, under which axis snapping stepped
  relative to the anchor rather than targeting absolute grid crossings.
