# An opening's stop and its measure are one geometry

An opening's travel was bounded by one rule and measured by another. The clamp
stopped it `width/2 + 5 cm` from the raw axis Points, blind to the faces and
blind to the other openings on the wall; the placement dimension measured from
the mitered Face corner on the interior side, or from a neighbour's near edge.
The two agreed only by coincidence — a right-angle corner in a wall 10 cm
thick, where the 5 cm margin happens to equal the half-thickness. Everywhere
else the user pushed an opening as far as it would go and the chip still read
10 cm, or read nothing at all because the neighbour it had just overlapped
drove it negative.

The rule: **an opening's Rail is a single geometry, and a placement dimension
is the distance remaining to its end.** The Rail is the stretch of wall at full
thickness — bounded at each end by the *shorter* of the two Faces, because a
hole through the whole thickness is stopped by the first material it meets —
cut back to the near edge of the closest neighbouring opening. The clamp and
the chip consume the same bounds, so the measure reads zero when, and only
when, the opening is against its stop. A measure that cannot reach zero at the
stop is one the user has to second-guess, which defeats the point of showing it
during the gesture.

## Considered Options

- **Keep the 5 cm margin.** Rejected: it forces a choice between a chip that
  reads 0 with 5 cm of wall left (a lie) and one that plateaus at 5 and never
  reaches the stop (the original complaint, relocated). An opening flush in a
  corner is an ordinary plan, not a degenerate one.
- **Bound the Rail by the interior Face, as the chip already read.** Rejected:
  at a reflex corner the interior Face is the *longer* one, so this forfeits
  10 cm of genuinely usable wall to protect a reading rule.
- **Bound by the shorter Face but keep reading the interior one.** Rejected:
  physically correct and still off by the half-thickness at reflex corners —
  the same inconsistency, moved somewhere rarer and harder to explain.
- **Measure from the axis Points, where the clamp already stood.** Rejected: it
  is the cheapest alignment and it costs the property the whole feature exists
  for — the value would start from an invisible point 5 cm inside the wall,
  and stop being tape-measurable.

## Consequences

- `OPENING_END_MARGIN` disappears. A placement is refused only when the Rail is
  narrower than the opening.
- Two openings on a wall can no longer overlap. A neighbour is a stop, and
  placing, moving or widening slides the opening to the nearest position its
  Rail allows — refusing only when none exists.
- The interior/exterior side stops entering the placement dimension entirely:
  there is one bound per end, not one per side. `interiorSide` keeps its other
  caller, the wall's Measures.
- A stored offset is still never rewritten when the geometry moves under it —
  a shrunk then regrown wall gives an opening its place back. The placement
  dimensions measure the rendered position of the opening and of its
  neighbours, never the stored offset.
- Render applies the Face bounds only, not the neighbours: a neighbour's drawn
  position would have to be known before its own rail could be taken, and each
  would bound the other. No overlap can be *made*, but a wall shrunk under two
  stored offsets can draw one — the same degraded state that already draws an
  opening overflowing a wall too narrow to hold it.
- Offsets stay whole centimetres except where a mitered rail end is not one:
  there the bound wins over the rounding, so flush stays exactly flush and the
  measure reading it stays exactly zero.
- A clearance of zero shows no chip, which now carries meaning: flush.
