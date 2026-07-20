import type { Vec } from './geometry'
import { distance, nearestWall, wallLength, wallPoints } from './geometry'
import type { Plan } from './types'
import { GRID } from './types'

export interface Snap {
  x: number
  y: number
  kind: 'point' | 'wall' | 'axis' | 'grid' | 'free'
  pointId?: string
  wallId?: string
  axisFrom?: Vec
}

export interface SnapOptions {
  tolerance: number
  anchor?: Vec
  exclude?: Set<string>
  walls?: boolean // wall bodies become snap targets (Wall tool)
  free?: boolean // Alt held: no snapping, just integer rounding
}

const AXIS_STEP = Math.PI / 4
const AXIS_TOLERANCE = (8 * Math.PI) / 180
// An axis ∩ wall intersection farther than this many tolerances from the
// cursor (grazing angle) is not what the eye is aiming at (ADR 0002).
const AXIS_INTERSECTION_REACH = 2

// The eight axes, as integer lattice steps ordered by octant from +x.
const AXIS_LATTICE: Vec[] = [
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
]

// The 45° axis the anchor→cursor direction locks to — as a unit `direction`
// and as the integer `step` one grid multiple along it — or null when the
// cursor is not within the angular tolerance of any axis.
function lockedAxis(anchor: Vec, x: number, y: number): { direction: Vec; step: Vec } | null {
  const length = Math.hypot(x - anchor.x, y - anchor.y)
  if (length <= 1) return null
  const angle = Math.atan2(y - anchor.y, x - anchor.x)
  const octant = Math.round(angle / AXIS_STEP)
  if (Math.abs(angle - octant * AXIS_STEP) >= AXIS_TOLERANCE) return null
  const step = AXIS_LATTICE[((octant % 8) + 8) % 8]
  const norm = Math.hypot(step.x, step.y)
  return { direction: { x: step.x / norm, y: step.y / norm }, step }
}

// A group move translates rigidly — the displacement applies to the group as a
// whole, never to each element separately — and realigns it on the grid: the
// delta is the one that lands the reference point (`referencePoint`, fixed at
// pointer-down) exactly on a grid intersection, so an off-grid group heals on
// its first ordinary move instead of carrying its offset forever. The grid is
// the only target: a group move runs no part of the placement snap ladder.
// Free mode (Alt) and a selection with no wall point to reference both fall
// back to whole-centimeter rounding.
export function realignDelta(
  ref: Vec | null,
  dx: number,
  dy: number,
  free?: boolean,
): { dx: number; dy: number } {
  if (free || !ref) return { dx: Math.round(dx), dy: Math.round(dy) }
  const grid = (v: number) => Math.round(v / GRID) * GRID
  return { dx: grid(ref.x + dx) - ref.x, dy: grid(ref.y + dy) - ref.y }
}

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
        // Default position: the cursor's orthogonal projection on the wall.
        // When the anchor direction locks to a 45° axis, prefer the locked
        // axis ∩ wall intersection so the junction keeps the drawn wall
        // straight (ADR 0002). The rounding may drift a fraction of a cm;
        // the junction stays topological because the wall is split there.
        let px = a.x + ((b.x - a.x) / length) * near.t
        let py = a.y + ((b.y - a.y) / length) * near.t
        let axisFrom: Vec | undefined
        const axis = options.anchor && lockedAxis(options.anchor, x, y)
        if (options.anchor && axis) {
          const direction = axis.direction
          const wx = b.x - a.x
          const wy = b.y - a.y
          const denominator = direction.x * wy - direction.y * wx
          if (Math.abs(denominator) > 1e-9) {
            const t = ((a.x - options.anchor.x) * wy - (a.y - options.anchor.y) * wx) / denominator
            const ix = options.anchor.x + t * direction.x
            const iy = options.anchor.y + t * direction.y
            const s = ((ix - a.x) * wx + (iy - a.y) * wy) / (length * length)
            const within =
              t > 0 && // the axis is a ray: never jump behind the anchor
              s >= 0 &&
              s <= 1 &&
              distance(ix, iy, x, y) <= options.tolerance * AXIS_INTERSECTION_REACH
            if (within) {
              px = ix
              py = iy
              axisFrom = { x: options.anchor.x, y: options.anchor.y }
            }
          }
        }
        return { x: Math.round(px), y: Math.round(py), kind: 'wall', wallId: near.wall.id, axisFrom }
      }
    }
  }

  if (options.anchor) {
    const axis = lockedAxis(options.anchor, x, y)
    if (axis) {
      // The endpoint steps each component from the anchor, not the segment's
      // length: k whole grid multiples of the integer axis step, k ≥ 1 so the
      // endpoint never collapses onto the anchor. From an on-grid anchor that
      // lands on a grid intersection; from an off-grid one it inherits the
      // anchor's offset. Same formulation either way, no fallback branch.
      const { step } = axis
      const projection =
        ((x - options.anchor.x) * step.x + (y - options.anchor.y) * step.y) /
        (step.x * step.x + step.y * step.y)
      const k = Math.max(1, Math.round(projection / GRID))
      return {
        x: Math.round(options.anchor.x + k * GRID * step.x),
        y: Math.round(options.anchor.y + k * GRID * step.y),
        kind: 'axis',
        axisFrom: { x: options.anchor.x, y: options.anchor.y },
      }
    }
  }

  return { x: Math.round(x / GRID) * GRID, y: Math.round(y / GRID) * GRID, kind: 'grid' }
}
