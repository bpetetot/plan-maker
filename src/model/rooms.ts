import { faceLength, faceSpan, interiorPolygon } from './faces'
import type { Vec } from './geometry'
import { pointInPolygon, polygonArea, polygonCentroid } from './geometry'
import type { Plan, Wall } from './types'

// Rooms are derived, never stored (spec §2): the closed faces of the wall
// graph, found by walking every directed edge with a "most clockwise turn"
// rule. Interior faces come out with positive shoelace area in screen
// coordinates; the outer face of each component is negative and dropped.

export interface Room {
  pointIds: string[]
  polygon: Vec[]
  areaCm2: number
  centroid: Vec
}

const MIN_ROOM_AREA_CM2 = 100 // drop degenerate slivers

export function detectRooms(plan: Plan): Room[] {
  const neighbors = new Map<string, string[]>()
  for (const wall of Object.values(plan.walls)) {
    const a = wall.startPointId
    const b = wall.endPointId
    if (!plan.points[a] || !plan.points[b]) continue
    if (!neighbors.has(a)) neighbors.set(a, [])
    if (!neighbors.has(b)) neighbors.set(b, [])
    neighbors.get(a)!.push(b)
    neighbors.get(b)!.push(a)
  }

  const angleFrom = (fromId: string, toId: string) => {
    const from = plan.points[fromId]
    const to = plan.points[toId]
    return Math.atan2(to.y - from.y, to.x - from.x)
  }

  // neighbors sorted by ascending angle, for rotational "next edge" lookup
  const sorted = new Map<string, { id: string; angle: number }[]>()
  for (const [id, list] of neighbors) {
    sorted.set(
      id,
      list.map((n) => ({ id: n, angle: angleFrom(id, n) })).sort((a, b) => a.angle - b.angle),
    )
  }

  // Next face edge after arriving at `v` from `u`: the neighbor whose angle is
  // the next one clockwise from the back edge (v→u) — i.e. the largest angle
  // strictly below the back-edge angle, wrapping to the overall largest.
  // The back edge itself is only taken at a dead end.
  const nextInFace = (u: string, v: string): string => {
    const around = sorted.get(v)!
    const backAngle = angleFrom(v, u)
    const epsilon = 1e-12
    let below: { id: string; angle: number } | null = null
    let wrap: { id: string; angle: number } | null = null
    for (const n of around) {
      const isBackEdge = n.id === u && Math.abs(n.angle - backAngle) < epsilon
      if (isBackEdge) continue
      if (n.angle < backAngle - epsilon && (!below || n.angle > below.angle)) below = n
      if (!wrap || n.angle > wrap.angle) wrap = n
    }
    return (below ?? wrap)?.id ?? u
  }

  const visited = new Set<string>()
  const edgeKey = (u: string, v: string) => `${u}→${v}`
  const rooms: Room[] = []

  for (const [start, list] of neighbors) {
    for (const first of list) {
      if (visited.has(edgeKey(start, first))) continue
      const facePointIds: string[] = []
      let u = start
      let v = first
      // walk the face; every directed edge belongs to exactly one face
      while (!visited.has(edgeKey(u, v))) {
        visited.add(edgeKey(u, v))
        facePointIds.push(u)
        const w = nextInFace(u, v)
        u = v
        v = w
      }
      const polygon = facePointIds.map((id) => ({ x: plan.points[id].x, y: plan.points[id].y }))
      if (polygonArea(polygon) > MIN_ROOM_AREA_CM2) {
        // the room's area is its floor surface, bounded by the walls' interior
        // faces — detection and containment stay on the axis polygon
        const area = Math.max(0, polygonArea(interiorPolygon(plan, facePointIds)))
        rooms.push({ pointIds: facePointIds, polygon, areaCm2: area, centroid: polygonCentroid(polygon) })
      }
    }
  }

  return rooms
}

export function roomAt(rooms: Room[], x: number, y: number): Room | null {
  return rooms.find((room) => pointInPolygon({ x, y }, room.polygon)) ?? null
}

// The side of the wall facing a detected room, when exactly one of its two
// sides does — the wall then "borders exactly one room" and that side is its
// interior. Null otherwise: standalone wall (no side faces a room), party
// wall between two rooms, or dangling wall inside a room (both sides face
// the same room). Sides follow the faces convention: room loops are
// positively oriented in screen coordinates, so a loop traversing the wall
// start→end has its interior on side +1 (the start→end left normal).
export function interiorSide(rooms: Room[], wall: Wall): 1 | -1 | null {
  const sides = new Set<1 | -1>()
  for (const room of rooms) {
    const ids = room.pointIds
    for (let i = 0; i < ids.length; i++) {
      const u = ids[i]
      const v = ids[(i + 1) % ids.length]
      if (u === wall.startPointId && v === wall.endPointId) sides.add(1)
      else if (u === wall.endPointId && v === wall.startPointId) sides.add(-1)
    }
  }
  if (sides.size !== 1) return null
  return sides.has(1) ? 1 : -1
}

// Display measures of a wall, derived (never stored) from the same silhouette
// readings the canvas Dimensions use, so the two can never disagree. Oriented
// when the wall borders exactly one room: the interior side's tape-measurable
// span, the exterior side's (the hors-tout extent), and the thickness.
export type WallMeasures =
  | { kind: 'oriented'; interior: number; exterior: number; thickness: number }
  | { kind: 'plain'; length: number; thickness: number }

export function wallMeasures(plan: Plan, rooms: Room[], wall: Wall): WallMeasures {
  const side = interiorSide(rooms, wall)
  if (side !== null) {
    return {
      kind: 'oriented',
      interior: faceLength(plan, wall, side),
      exterior: faceLength(plan, wall, -side as 1 | -1),
      thickness: wall.thickness,
    }
  }
  // no claimed orientation: the hors-tout extent — the union of the two faces'
  // axis spans, i.e. the full drawn body between mitered corners and overhangs
  const s1 = faceSpan(plan, wall, 1)
  const s2 = faceSpan(plan, wall, -1)
  const length = Math.max(0, Math.max(s1.to, s2.to) - Math.min(s1.from, s2.from))
  return { kind: 'plain', length, thickness: wall.thickness }
}
