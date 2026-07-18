import type { Plan, Point, Wall } from './types'

export interface Vec {
  x: number
  y: number
}

export const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay)

export const wallPoints = (plan: Plan, wall: Wall): [Point, Point] => [
  plan.points[wall.startPointId],
  plan.points[wall.endPointId],
]

export const wallLength = (plan: Plan, wall: Wall): number => {
  const [a, b] = wallPoints(plan, wall)
  return distance(a.x, a.y, b.x, b.y)
}

// Projects (x, y) onto the wall axis: t is the distance from the wall start
// along the axis (clamped to [0, length]), d the distance to that projection.
export function projectOnWall(plan: Plan, wall: Wall, x: number, y: number): { t: number; d: number } {
  const [a, b] = wallPoints(plan, wall)
  const length = distance(a.x, a.y, b.x, b.y)
  if (length < 1) return { t: 0, d: distance(a.x, a.y, x, y) }
  const ux = (b.x - a.x) / length
  const uy = (b.y - a.y) / length
  const t = Math.max(0, Math.min(length, (x - a.x) * ux + (y - a.y) * uy))
  return { t, d: distance(a.x + ux * t, a.y + uy * t, x, y) }
}

export function nearestWall(
  plan: Plan,
  x: number,
  y: number,
  tolerance: number,
): { wall: Wall; t: number } | null {
  let best: { wall: Wall; t: number } | null = null
  let bestDistance = tolerance
  for (const wall of Object.values(plan.walls)) {
    const { t, d } = projectOnWall(plan, wall, x, y)
    if (d < bestDistance) {
      bestDistance = d
      best = { wall, t }
    }
  }
  return best
}

// Signed area (shoelace); sign depends on winding order.
export function polygonArea(polygon: Vec[]): number {
  let sum = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export function polygonCentroid(polygon: Vec[]): Vec {
  const area = polygonArea(polygon)
  if (Math.abs(area) < 1e-9) {
    const n = Math.max(1, polygon.length)
    return {
      x: polygon.reduce((s, p) => s + p.x, 0) / n,
      y: polygon.reduce((s, p) => s + p.y, 0) / n,
    }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const cross = a.x * b.y - b.x * a.y
    cx += (a.x + b.x) * cross
    cy += (a.y + b.y) * cross
  }
  return { x: cx / (6 * area), y: cy / (6 * area) }
}

export function pointInPolygon(point: Vec, polygon: Vec[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

export function planBBox(plan: Plan): { x: number; y: number; width: number; height: number } | null {
  const points = Object.values(plan.points)
  if (points.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
