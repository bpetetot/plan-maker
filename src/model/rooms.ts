import { faceLength, faceSpan, interiorPolygon } from './faces'
import type { Vec } from './geometry'
import {
  clampOutsidePolygon,
  clampToPolygon,
  pointInPolygon,
  poleOfInaccessibility,
  polygonArea,
  polygonCentroid,
  regionCentroid,
} from './geometry'
import type { Plan, RoomLabel, Wall } from './types'

// Rooms are derived, never stored (spec §2; CONTEXT.md: Room): faces of the
// wall graph. Positive area = interior, negative = silhouette, punches holes.

export interface Room {
  pointIds: string[]
  polygon: Vec[]
  // island silhouettes, directed as the face walk left them: room on side +1
  holeLoops: string[][]
  holes: Vec[][]
  areaCm2: number
  // default text-block position (CONTEXT.md: Room label)
  anchor: Vec
}

const MIN_ROOM_AREA_CM2 = 100

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

  const sorted = new Map<string, { id: string; angle: number }[]>()
  for (const [id, list] of neighbors) {
    sorted.set(
      id,
      list.map((n) => ({ id: n, angle: angleFrom(id, n) })).sort((a, b) => a.angle - b.angle),
    )
  }

  // Next edge clockwise from the back edge (v→u), wrapping to the largest.
  // Back edge itself only at a dead end.
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

  // an island is a *separate* component inside a room, not a lobe of the
  // room's own walls
  const componentOf = new Map<string, number>()
  let componentCount = 0
  for (const id of neighbors.keys()) {
    if (componentOf.has(id)) continue
    const queue = [id]
    componentOf.set(id, componentCount)
    while (queue.length > 0) {
      for (const n of neighbors.get(queue.pop()!) ?? []) {
        if (!componentOf.has(n)) {
          componentOf.set(n, componentCount)
          queue.push(n)
        }
      }
    }
    componentCount++
  }

  const visited = new Set<string>()
  const edgeKey = (u: string, v: string) => `${u}→${v}`
  interface Face {
    pointIds: string[]
    polygon: Vec[]
    area: number
  }
  const interiors: Face[] = []
  const silhouettes: Face[] = []

  for (const [start, list] of neighbors) {
    for (const first of list) {
      if (visited.has(edgeKey(start, first))) continue
      const facePointIds: string[] = []
      let u = start
      let v = first
      while (!visited.has(edgeKey(u, v))) {
        visited.add(edgeKey(u, v))
        facePointIds.push(u)
        const w = nextInFace(u, v)
        u = v
        v = w
      }
      const polygon = facePointIds.map((id) => ({ x: plan.points[id].x, y: plan.points[id].y }))
      const area = polygonArea(polygon)
      if (area > MIN_ROOM_AREA_CM2) interiors.push({ pointIds: facePointIds, polygon, area })
      else if (area < -MIN_ROOM_AREA_CM2) silhouettes.push({ pointIds: facePointIds, polygon, area })
    }
  }

  const rooms: Room[] = interiors.map((face) => ({
    pointIds: face.pointIds,
    polygon: face.polygon,
    holeLoops: [],
    holes: [],
    areaCm2: 0,
    anchor: { x: 0, y: 0 },
  }))

  for (const silhouette of silhouettes) {
    const rep = plan.points[silhouette.pointIds[0]]
    let container: number | null = null
    for (let i = 0; i < interiors.length; i++) {
      if (componentOf.get(interiors[i].pointIds[0]) === componentOf.get(silhouette.pointIds[0])) continue
      if (!pointInPolygon(rep, interiors[i].polygon)) continue
      if (container === null || interiors[i].area < interiors[container].area) container = i
    }
    if (container !== null) {
      rooms[container].holeLoops.push(silhouette.pointIds)
      rooms[container].holes.push(silhouette.polygon)
    }
  }

  for (const room of rooms) {
    // islands count out to their exterior faces: the silhouette loop runs the
    // other way, so interiorPolygon offsets outward
    const floor = polygonArea(interiorPolygon(plan, room.pointIds))
    const islands = room.holeLoops.reduce(
      (sum, loop) => sum + Math.abs(polygonArea(interiorPolygon(plan, loop))),
      0,
    )
    room.areaCm2 = Math.max(0, floor - islands)
    room.anchor = roomAnchor(room)
  }

  return rooms
}

function roomAnchor(room: Room): Vec {
  if (room.holes.length === 0) return polygonCentroid(room.polygon)
  const centroid = regionCentroid(room.polygon, room.holes)
  if (roomContains(room, centroid.x, centroid.y)) return centroid
  return poleOfInaccessibility(room.polygon, room.holes)
}

export const roomContains = (room: Room, x: number, y: number): boolean =>
  pointInPolygon({ x, y }, room.polygon) && !room.holes.some((hole) => pointInPolygon({ x, y }, hole))

export function roomAt(rooms: Room[], x: number, y: number): Room | null {
  return rooms.find((room) => roomContains(room, x, y)) ?? null
}

export function clampToRoom(point: Vec, room: Room): Vec {
  const inBoundary = clampToPolygon(point, room.polygon)
  const hole = room.holes.find((h) => pointInPolygon(inBoundary, h))
  if (!hole) return inBoundary
  const out = clampOutsidePolygon(inBoundary, hole)
  return roomContains(room, out.x, out.y) ? out : room.anchor
}

export function roomWallIds(plan: Plan, room: Room): string[] | null {
  const byPair = new Map<string, string>()
  for (const wall of Object.values(plan.walls)) {
    byPair.set(`${wall.startPointId}|${wall.endPointId}`, wall.id)
    byPair.set(`${wall.endPointId}|${wall.startPointId}`, wall.id)
  }
  const ids: string[] = []
  for (let i = 0; i < room.pointIds.length; i++) {
    const id = byPair.get(`${room.pointIds[i]}|${room.pointIds[(i + 1) % room.pointIds.length]}`)
    if (!id) return null
    ids.push(id)
  }
  return ids
}

const sameLoop = (a: Room, b: Room) => {
  if (a.pointIds.length !== b.pointIds.length) return false
  const ids = new Set(b.pointIds)
  return a.pointIds.every((id) => ids.has(id))
}

// A label belongs to its room, not a position (CONTEXT.md: Room label): home
// room matched by loop, not containment, so a passing wall cannot steal it.
export function reconcileRoomLabels(before: Plan, after: Plan): Plan {
  const labels = Object.values(after.roomLabels)
  if (labels.length === 0) return after
  const roomsAfter = detectRooms(after)
  const roomsBefore = before === after ? roomsAfter : detectRooms(before)
  let changed = false
  const kept: { label: RoomLabel; room: Room }[] = []
  for (const label of labels) {
    // a rigid group move may already have moved the label: home room comes
    // from its pre-change position
    const pos = before.roomLabels[label.id] ?? label
    const homeBefore = roomAt(roomsBefore, pos.x, pos.y)
    const home = homeBefore ? (roomsAfter.find((room) => sameLoop(room, homeBefore)) ?? null) : null
    const room = home ?? roomAt(roomsAfter, label.x, label.y)
    if (!room) {
      changed = true
      continue
    }
    if (label.placed && roomContains(room, label.x, label.y)) {
      kept.push({ label, room })
      continue
    }
    const x = Math.round(room.anchor.x)
    const y = Math.round(room.anchor.y)
    if (label.placed || label.x !== x || label.y !== y) {
      changed = true
      const pinned = { ...label, x, y }
      delete pinned.placed
      kept.push({ label: pinned, room })
    } else {
      kept.push({ label, room })
    }
  }
  // one label per room: labels iterate in creation order, the first claim wins
  const next: Plan['roomLabels'] = {}
  const claimed = new Set<Room>()
  for (const { label, room } of kept) {
    if (claimed.has(room)) {
      changed = true
      continue
    }
    claimed.add(room)
    next[label.id] = label
  }
  return changed ? { ...after, roomLabels: next } : after
}

// Self-reconcile on load: drops orphans, re-pins stray default placements
// (CONTEXT.md: Room label).
export const dropOrphanRoomLabels = (plan: Plan): Plan => reconcileRoomLabels(plan, plan)

// Null unless exactly one side faces a room (standalone, party, dangling).
// Faces convention: a region lies on side +1 of its directed edges.
export function interiorSide(rooms: Room[], wall: Wall): 1 | -1 | null {
  const sides = new Set<1 | -1>()
  for (const room of rooms) {
    for (const ids of [room.pointIds, ...room.holeLoops]) {
      for (let i = 0; i < ids.length; i++) {
        const u = ids[i]
        const v = ids[(i + 1) % ids.length]
        if (u === wall.startPointId && v === wall.endPointId) sides.add(1)
        else if (u === wall.endPointId && v === wall.startPointId) sides.add(-1)
      }
    }
  }
  if (sides.size !== 1) return null
  return sides.has(1) ? 1 : -1
}

// Derived from the same silhouette readings as the canvas Dimensions, so the
// two cannot disagree.
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
  // unoriented: hors-tout extent — union of both faces' axis spans
  const s1 = faceSpan(plan, wall, 1)
  const s2 = faceSpan(plan, wall, -1)
  const length = Math.max(0, Math.max(s1.to, s2.to) - Math.min(s1.from, s2.from))
  return { kind: 'plain', length, thickness: wall.thickness }
}
