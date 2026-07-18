import type { Vec } from './geometry'
import { wallPoints } from './geometry'
import type { Plan, Wall } from './types'

// A wall's Faces: its two long sides, offset half the thickness from the axis.
// At a junction a face ends where it meets the face of the angularly adjacent
// wall (miter); at a free end it stops at the Point. Sides use the same
// convention as DimPlacement: +1 along the left normal of start→end (the axis
// rotated +90° in screen coordinates).

const rot90 = (v: Vec): Vec => ({ x: -v.y, y: v.x })

interface Frame {
  a: Vec
  b: Vec
  u: Vec // unit axis start→end
  n: Vec // left normal (u rotated +90°)
  length: number
  half: number // half thickness
}

function wallFrame(plan: Plan, wall: Wall): Frame | null {
  const [a, b] = wallPoints(plan, wall)
  if (!a || !b) return null
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (length < 1e-9) return null
  const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  return { a, b, u, n: rot90(u), length, half: wall.thickness / 2 }
}

// Intersection of two infinite lines given by point + direction; null when
// (nearly) parallel — collinear continuations and free ends fall back to the
// perpendicular face point at the wall's Point.
function lineIntersection(p1: Vec, d1: Vec, p2: Vec, d2: Vec): Vec | null {
  const denominator = d1.x * d2.y - d1.y * d2.x
  if (Math.abs(denominator) < 1e-9) return null
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denominator
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t }
}

// Miter of two offset face lines at a junction Point: their intersection,
// unless they are (nearly) parallel or the spike overshoots the limit —
// callers then fall back to the square cap at the Point.
function miter(p1: Vec, d1: Vec, p2: Vec, d2: Vec, corner: Vec, wallA: Wall, wallB: Wall): Vec | null {
  const hit = lineIntersection(p1, d1, p2, d2)
  if (!hit) return null
  const limit = 2 * (wallA.thickness + wallB.thickness)
  return Math.hypot(hit.x - corner.x, hit.y - corner.y) > limit ? null : hit
}

// The corner of `wall`'s side-`side` face at the given end: the miter with the
// angularly adjacent wall's facing face, or the square cap at the Point when
// the end is free (or the adjacent wall is collinear).
export function facePoint(plan: Plan, wall: Wall, end: 'start' | 'end', side: 1 | -1): Vec {
  const frame = wallFrame(plan, wall)
  if (!frame) {
    // zero-length wall (collapsed mid-drag): degrade to the Point itself
    const p = plan.points[end === 'start' ? wall.startPointId : wall.endPointId]
    return { x: p.x, y: p.y }
  }
  const { a, b, u, n, half } = frame
  const p = end === 'start' ? a : b
  const cap = { x: p.x + n.x * side * half, y: p.y + n.y * side * half }
  const pointId = end === 'start' ? wall.startPointId : wall.endPointId

  // outgoing direction from the shared Point into this wall
  const wDir = end === 'start' ? u : { x: -u.x, y: -u.y }
  // rotating from wDir by this sign sweeps toward the side-`side` face
  const rotSign = end === 'start' ? side : -side

  // angularly adjacent neighbour on the face side: smallest positive rotation
  let best: { wall: Wall; v: Vec; delta: number } | null = null
  const wAngle = Math.atan2(wDir.y, wDir.x)
  for (const other of Object.values(plan.walls)) {
    if (other.id === wall.id) continue
    let otherEnd: 'start' | 'end' | null = null
    if (other.startPointId === pointId) otherEnd = 'start'
    else if (other.endPointId === pointId) otherEnd = 'end'
    if (!otherEnd) continue
    const otherFrame = wallFrame(plan, other)
    if (!otherFrame) continue
    const v = otherEnd === 'start' ? otherFrame.u : { x: -otherFrame.u.x, y: -otherFrame.u.y }
    const raw = rotSign * (Math.atan2(v.y, v.x) - wAngle)
    const delta = ((raw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI
    if (!best || delta < best.delta) best = { wall: other, v, delta }
  }
  if (!best) return cap

  // the neighbour's face bounding the swept sector: offset toward the sector
  const m = rotSign > 0 ? { x: best.v.y, y: -best.v.x } : rot90(best.v)
  const neighbourHalf = best.wall.thickness / 2
  const facePointOnLine = { x: a.x + n.x * side * half, y: a.y + n.y * side * half }
  const neighbourPoint = { x: p.x + m.x * neighbourHalf, y: p.y + m.y * neighbourHalf }
  return miter(facePointOnLine, u, neighbourPoint, best.v, p, wall, best.wall) ?? cap
}

// Axis parameters (cm from the start Point) the side-`side` face runs between.
export function faceSpan(plan: Plan, wall: Wall, side: 1 | -1): { from: number; to: number } {
  const frame = wallFrame(plan, wall)
  if (!frame) return { from: 0, to: 0 }
  const { a, u } = frame
  const along = (p: Vec) => (p.x - a.x) * u.x + (p.y - a.y) * u.y
  return {
    from: along(facePoint(plan, wall, 'start', side)),
    to: along(facePoint(plan, wall, 'end', side)),
  }
}

export function faceLength(plan: Plan, wall: Wall, side: 1 | -1): number {
  const { from, to } = faceSpan(plan, wall, side)
  return Math.max(0, to - from)
}

// The drawn contour of a wall: its two faces joined at the corners facePoint
// resolves — mitered at junctions, square caps at free ends.
export function wallOutline(plan: Plan, wall: Wall): Vec[] {
  return [
    facePoint(plan, wall, 'start', 1),
    facePoint(plan, wall, 'end', 1),
    facePoint(plan, wall, 'end', -1),
    facePoint(plan, wall, 'start', -1),
  ]
}

// The floor polygon of a room loop: every edge offset inward by half its
// wall's thickness, consecutive edges mitered; near-parallel junctions (a
// dangling wall's tip, collinear splits) fall back to both offset endpoints —
// the square cap the floor wraps around. Expects a positively-oriented loop
// (screen coordinates), as detectRooms produces for interior faces.
export function interiorPolygon(plan: Plan, pointIds: string[]): Vec[] {
  const wallByEdge = new Map<string, Wall>()
  for (const wall of Object.values(plan.walls)) {
    wallByEdge.set(`${wall.startPointId}|${wall.endPointId}`, wall)
    wallByEdge.set(`${wall.endPointId}|${wall.startPointId}`, wall)
  }
  interface OffsetEdge {
    from: Vec
    to: Vec
    dir: Vec
    wall: Wall
    endPoint: Vec // the loop Point the edge arrives at
  }
  const edges: OffsetEdge[] = []
  for (let i = 0; i < pointIds.length; i++) {
    const a = plan.points[pointIds[i]]
    const b = plan.points[pointIds[(i + 1) % pointIds.length]]
    const wall = wallByEdge.get(`${a.id}|${b.id}`)
    if (!wall) continue
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length < 1e-9) continue
    const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
    // inward normal of a positively-oriented loop is the +90° rotation
    const inward = rot90(dir)
    const o = wall.thickness / 2
    edges.push({
      from: { x: a.x + inward.x * o, y: a.y + inward.y * o },
      to: { x: b.x + inward.x * o, y: b.y + inward.y * o },
      dir,
      wall,
      endPoint: b,
    })
  }
  const polygon: Vec[] = []
  for (let i = 0; i < edges.length; i++) {
    const e1 = edges[i]
    const e2 = edges[(i + 1) % edges.length]
    const hit = miter(e1.from, e1.dir, e2.from, e2.dir, e1.endPoint, e1.wall, e2.wall)
    if (hit) polygon.push(hit)
    else polygon.push(e1.to, e2.from)
  }
  return polygon
}
