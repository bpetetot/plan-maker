import { interiorPolygon } from './faces'
import type { Vec } from './geometry'
import { pointInPolygon, polygonArea, polygonCentroid } from './geometry'
import type { Plan } from './types'

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
