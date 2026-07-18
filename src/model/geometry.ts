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

// Which side of the wall's axis (x, y) is on: +1 along the left normal of
// start→end (the axis rotated +90°), -1 opposite. Points on the axis get +1.
export function wallSide(plan: Plan, wall: Wall, x: number, y: number): 1 | -1 {
  const [a, b] = wallPoints(plan, wall)
  const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)
  return cross >= 0 ? 1 : -1
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

// Proper crossing of two segments: the intersection point when it lies
// strictly inside both, null otherwise (parallel, collinear, or touching at
// an endpoint). Endpoint contacts are junction matters, not crossings.
export function segmentIntersection(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const rx = b.x - a.x
  const ry = b.y - a.y
  const sx = d.x - c.x
  const sy = d.y - c.y
  const denominator = rx * sy - ry * sx
  if (Math.abs(denominator) < 1e-9) return null
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator
  const epsilon = 1e-9
  if (t <= epsilon || t >= 1 - epsilon || u <= epsilon || u >= 1 - epsilon) return null
  return { x: a.x + t * rx, y: a.y + t * ry }
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

function nearestOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

// Nearest interior point of `polygon` to `point`: the point itself when it
// already lies inside, else its projection on the boundary nudged one unit
// inward — so the result still tests as inside even after integer rounding.
export function clampToPolygon(point: Vec, polygon: Vec[]): Vec {
  if (pointInPolygon(point, polygon)) return point
  let best: { p: Vec; d: number; a: Vec; b: Vec } | null = null
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    const p = nearestOnSegment(point, a, b)
    const d = Math.hypot(p.x - point.x, p.y - point.y)
    if (!best || d < best.d) best = { p, d, a, b }
  }
  if (!best) return point
  const dx = best.b.x - best.a.x
  const dy = best.b.y - best.a.y
  const len = Math.hypot(dx, dy) || 1
  for (const sign of [1, -1]) {
    const candidate = { x: best.p.x + (sign * -dy) / len, y: best.p.y + (sign * dx) / len }
    if (pointInPolygon(candidate, polygon)) return candidate
  }
  // vertex case: both edge normals fall outside — step toward the centroid
  const centroid = polygonCentroid(polygon)
  const cd = Math.hypot(centroid.x - best.p.x, centroid.y - best.p.y) || 1
  const inward = { x: best.p.x + (centroid.x - best.p.x) / cd, y: best.p.y + (centroid.y - best.p.y) / cd }
  return pointInPolygon(inward, polygon) ? inward : best.p
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
