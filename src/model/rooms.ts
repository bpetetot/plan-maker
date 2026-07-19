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

// Rooms are derived, never stored (spec §2): the closed faces of the wall
// graph, found by walking every directed edge with a "most clockwise turn"
// rule. Interior faces come out with positive shoelace area in screen
// coordinates; the outer face of each component is negative — it is the
// component's silhouette, and when it lies inside a room of another
// component it punches a hole in that room (CONTEXT.md: Room): a room fully
// contained in another is excluded from it, walls included.

export interface Room {
  pointIds: string[]
  polygon: Vec[]
  // silhouettes of the islands directly inside this room — directed point
  // loops as the face walk produced them (the room lies on side +1 of each
  // edge, like its own boundary loop) and their axis polygons
  holeLoops: string[][]
  holes: Vec[][]
  areaCm2: number
  // where the room's text block sits by default: the centroid of the holed
  // region, or the pole of inaccessibility when the centroid falls inside an
  // island (CONTEXT.md: Room label)
  anchor: Vec
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

  // connected component of every Point, to tell an island — a separate
  // component whose silhouette lies inside a room — from a lobe of the room's
  // own walls (already excluded by the face walk itself)
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
      // walk the face; every directed edge belongs to exactly one face
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

  // each component's silhouette punches a hole in the innermost room of
  // another component containing it — detection and containment stay on the
  // axis polygons
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
    // the room's area is its floor surface: bounded by its walls' interior
    // faces, minus each island's footprint out to its exterior faces — the
    // silhouette loop runs the other way, so interiorPolygon offsets outward
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

// Nearest point of the room's region to `point`: inside the boundary and
// outside every island. Degenerate regions fall back to the anchor.
export function clampToRoom(point: Vec, room: Room): Vec {
  const inBoundary = clampToPolygon(point, room.polygon)
  const hole = room.holes.find((h) => pointInPolygon(inBoundary, h))
  if (!hole) return inBoundary
  const out = clampOutsidePolygon(inBoundary, hole)
  return roomContains(room, out.x, out.y) ? out : room.anchor
}

// The walls tracing a room's boundary, one per consecutive pair of loop
// points; null when a pair has no wall (degenerate plan).
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

// Reconciliation after a wall change (CONTEXT.md: Room label) — an orphan
// label never exists, and a room never keeps more than one label. A label
// belongs to its room, not to a position: its home room (the one containing
// it in `before`) is matched by point loop in `after`, so a wall sweeping
// past the label never hands it to the neighbouring room. Position
// containment only decides when the home loop is gone (a split or merge
// changed the loop); a label inside no room is deleted. A default-placement
// label's stored position is pinned to its room's live anchor (stored =
// shown = exported); a custom placement holds only while its room contains
// it, else it reverts to default. When several labels end up in one room
// (e.g. deleting a dividing wall merged two named rooms), only the oldest
// survives. Reconciling a plan against itself purges plain orphans (import,
// restore).
export function reconcileRoomLabels(before: Plan, after: Plan): Plan {
  const labels = Object.values(after.roomLabels)
  if (labels.length === 0) return after
  const roomsAfter = detectRooms(after)
  const roomsBefore = before === after ? roomsAfter : detectRooms(before)
  let changed = false
  const kept: { label: RoomLabel; room: Room }[] = []
  for (const label of labels) {
    // the label may have been moved by the gesture itself (rigid group move):
    // its home room is found from its pre-change position
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

// Load-path guard: reconciling a plan against itself drops orphans (an
// orphan label never exists — CONTEXT.md: Room label) and pins stray
// default placements back to their room's centroid.
export const dropOrphanRoomLabels = (plan: Plan): Plan => reconcileRoomLabels(plan, plan)

// The side of the wall facing a detected room, when exactly one of its two
// sides does — the wall then "borders exactly one room" and that side is its
// interior. Null otherwise: standalone wall (no side faces a room), party
// wall between two rooms — including an island wall, whose outer face
// borders the containing room —, or dangling wall inside a room (both sides
// face the same room). Sides follow the faces convention: the face walk
// leaves its region on side +1 (the start→end left normal) of every directed
// edge, for boundary and hole loops alike.
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
