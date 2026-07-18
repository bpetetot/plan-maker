import { distance, nearestWall, wallLength, wallPoints } from './geometry'
import type { Plan } from './types'
import { GRID } from './types'

export interface Snap {
  x: number
  y: number
  kind: 'point' | 'wall' | 'axis' | 'grid' | 'free'
  pointId?: string
  wallId?: string
  axisFrom?: { x: number; y: number }
}

export interface SnapOptions {
  tolerance: number
  anchor?: { x: number; y: number }
  exclude?: Set<string>
  walls?: boolean // wall bodies become snap targets (drawing mode)
  free?: boolean // Alt held: no snapping, just integer rounding
}

const AXIS_STEP = Math.PI / 4
const AXIS_TOLERANCE = (8 * Math.PI) / 180

// Snap priority (spec §4 + ADR 0002): existing point > wall body (when enabled)
// > 45° axis from the anchor > 10 cm grid.
export function snapPoint(plan: Plan, x: number, y: number, options: SnapOptions): Snap {
  if (options.free) return { x: Math.round(x), y: Math.round(y), kind: 'free' }

  let best: { id: string; x: number; y: number } | null = null
  let bestDistance = options.tolerance
  for (const point of Object.values(plan.points)) {
    if (options.exclude?.has(point.id)) continue
    const d = distance(point.x, point.y, x, y)
    if (d < bestDistance) {
      bestDistance = d
      best = point
    }
  }
  if (best) return { x: best.x, y: best.y, kind: 'point', pointId: best.id }

  if (options.walls) {
    const near = nearestWall(plan, x, y, options.tolerance)
    if (near) {
      const [a, b] = wallPoints(plan, near.wall)
      const length = wallLength(plan, near.wall)
      if (length >= 1) {
        // The rounding may drift a fraction of a cm off the wall's line; the
        // junction stays topological because the wall is split at this point.
        return {
          x: Math.round(a.x + ((b.x - a.x) / length) * near.t),
          y: Math.round(a.y + ((b.y - a.y) / length) * near.t),
          kind: 'wall',
          wallId: near.wall.id,
        }
      }
    }
  }

  if (options.anchor) {
    const dx = x - options.anchor.x
    const dy = y - options.anchor.y
    const length = Math.hypot(dx, dy)
    if (length > 1) {
      const angle = Math.atan2(dy, dx)
      const snapped = Math.round(angle / AXIS_STEP) * AXIS_STEP
      if (Math.abs(angle - snapped) < AXIS_TOLERANCE) {
        const stepped = Math.max(GRID, Math.round(length / GRID) * GRID)
        return {
          x: Math.round(options.anchor.x + stepped * Math.cos(snapped)),
          y: Math.round(options.anchor.y + stepped * Math.sin(snapped)),
          kind: 'axis',
          axisFrom: { x: options.anchor.x, y: options.anchor.y },
        }
      }
    }
  }

  return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID, kind: 'grid' }
}
