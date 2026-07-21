import { fullThicknessSpan } from './faces'
import { distance, wallPoints } from './geometry'
import type { Opening, Plan, Wall } from './types'

export interface Span {
  from: number
  to: number
}

// Centres a width inside a span, or as close to `offset` as it fits. A span
// narrower than the width has no room for either bound, so the width straddles
// its middle — visibly overflowing rather than silently vanishing.
export function clampCenter(span: Span, width: number, offset: number): number {
  if (span.to - span.from <= width) return (span.from + span.to) / 2
  const half = width / 2
  return Math.max(span.from + half, Math.min(span.to - half, offset))
}

export interface OpeningPlacement {
  cx: number
  cy: number
  angleDeg: number
  offset: number // effective center offset after clamping to the current wall
}

// Where an opening sits on its wall right now. The stored offset is absolute
// from the wall start; it is clamped for display when the wall shrank under it,
// and the stored value is left alone so a regrown wall gives the place back.
export function openingPlacement(plan: Plan, opening: Opening): OpeningPlacement | null {
  const wall = plan.walls[opening.wallId]
  if (!wall) return null
  const [a, b] = wallPoints(plan, wall)
  const length = distance(a.x, a.y, b.x, b.y)
  if (length < 1) return null
  // The face bounds only, never the neighbours: a neighbour's own drawn
  // position would have to be known first, and each would bound the other.
  // Gestures are what keep openings off each other; a wall shrunk under two
  // stored offsets can draw them overlapping, as it already draws one
  // overflowing a wall too narrow to hold it.
  const span = fullThicknessSpan(plan, wall)
  const offset = clampCenter(span, opening.width, opening.offset)
  const ux = (b.x - a.x) / length
  const uy = (b.y - a.y) / length
  return {
    cx: a.x + ux * offset,
    cy: a.y + uy * offset,
    angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
    offset,
  }
}

// The stretch of the wall an opening may slide along (CONTEXT.md: Rail): the
// wall at full thickness, each end cut back to the near edge of the closest
// neighbouring opening. `referenceOffset` is the position the rail is taken
// from — the opening's own drawn position when it is being moved, the desired
// one when it is being placed — so which end a neighbour bounds never depends
// on how far a gesture overshoots, and a rail never spans a neighbour.
export function openingRail(plan: Plan, wall: Wall, referenceOffset: number, excludeId?: string): Span {
  const { from: spanFrom, to: spanTo } = fullThicknessSpan(plan, wall)
  let from = spanFrom
  let to = spanTo
  for (const other of Object.values(plan.openings)) {
    if (other.wallId !== wall.id || other.id === excludeId) continue
    const placement = openingPlacement(plan, other)
    if (!placement) continue
    const half = other.width / 2
    if (placement.offset <= referenceOffset) from = Math.max(from, placement.offset + half)
    else to = Math.min(to, placement.offset - half)
  }
  return { from, to }
}
