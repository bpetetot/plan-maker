import { distance, wallPoints } from './geometry'
import type { Opening, Plan } from './types'

export interface OpeningPlacement {
  cx: number
  cy: number
  angleDeg: number
  offset: number // effective center offset after clamping to the current wall length
}

// Where an opening sits on its wall right now. The stored offset is absolute
// from the wall start (spec §2); it is clamped for display when the wall shrank.
export function openingPlacement(plan: Plan, opening: Opening): OpeningPlacement | null {
  const wall = plan.walls[opening.wallId]
  if (!wall) return null
  const [a, b] = wallPoints(plan, wall)
  const length = distance(a.x, a.y, b.x, b.y)
  if (length < 1) return null
  const halfWidth = opening.width / 2
  const offset =
    length <= opening.width ? length / 2 : Math.max(halfWidth, Math.min(length - halfWidth, opening.offset))
  const ux = (b.x - a.x) / length
  const uy = (b.y - a.y) / length
  return {
    cx: a.x + ux * offset,
    cy: a.y + uy * offset,
    angleDeg: (Math.atan2(uy, ux) * 180) / Math.PI,
    offset,
  }
}
