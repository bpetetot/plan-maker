import { nanoid } from 'nanoid'
import { distance, nearestWall, segmentIntersection, wallLength, wallPoints } from './geometry'
import type { Snap } from './snap'
import type { Opening, Plan, Wall } from './types'
import { defaultOpeningWidth, WALL_THICKNESS } from './types'

// All operations are immutable: they return a new Plan (or the same one when a no-op).

const newId = () => nanoid(10)

export function ensurePoint(plan: Plan, snap: Snap): [Plan, string] {
  if (snap.pointId) return [plan, snap.pointId]
  const id = newId()
  const point = { id, x: Math.round(snap.x), y: Math.round(snap.y) }
  return [{ ...plan, points: { ...plan.points, [id]: point } }, id]
}

export function addWall(
  plan: Plan,
  startPointId: string,
  endPointId: string,
  thickness: number = WALL_THICKNESS,
): Plan {
  if (startPointId === endPointId) return plan
  for (const wall of Object.values(plan.walls)) {
    const same = wall.startPointId === startPointId && wall.endPointId === endPointId
    const reversed = wall.startPointId === endPointId && wall.endPointId === startPointId
    if (same || reversed) return plan
  }
  const id = newId()
  const wall: Wall = { id, startPointId, endPointId, thickness }
  return { ...plan, walls: { ...plan.walls, [id]: wall } }
}

export function movePoint(plan: Plan, id: string, x: number, y: number): Plan {
  return { ...plan, points: { ...plan.points, [id]: { id, x: Math.round(x), y: Math.round(y) } } }
}

export function setPoints(plan: Plan, updates: Record<string, { x: number; y: number }>): Plan {
  const points = { ...plan.points }
  for (const [id, p] of Object.entries(updates)) points[id] = { id, x: Math.round(p.x), y: Math.round(p.y) }
  return { ...plan, points }
}

// Splits a wall in two at an existing point (ADR 0002). The start-side half
// keeps the wall's id, so its openings keep their wallId and offset. Each
// opening goes to the half containing its center; one straddling the cut, or
// no longer fitting its half, is deleted. Both halves drop their dimPlacement.
export function splitWall(plan: Plan, wallId: string, pointId: string): Plan {
  const wall = plan.walls[wallId]
  const point = plan.points[pointId]
  if (!wall || !point) return plan
  if (pointId === wall.startPointId || pointId === wall.endPointId) return plan

  const startHalf: Wall = {
    id: wall.id,
    startPointId: wall.startPointId,
    endPointId: pointId,
    thickness: wall.thickness,
  }
  const endHalf: Wall = {
    id: newId(),
    startPointId: pointId,
    endPointId: wall.endPointId,
    thickness: wall.thickness,
  }
  const walls = { ...plan.walls, [startHalf.id]: startHalf, [endHalf.id]: endHalf }
  const next = { ...plan, walls }

  const start = plan.points[wall.startPointId]
  const cut = distance(start.x, start.y, point.x, point.y)
  const openings: Record<string, Opening> = {}
  for (const opening of Object.values(plan.openings)) {
    if (opening.wallId !== wallId) {
      openings[opening.id] = opening
      continue
    }
    if (opening.offset - opening.width / 2 < cut && opening.offset + opening.width / 2 > cut) continue
    const host = opening.offset < cut ? startHalf : endHalf
    const offset = Math.round(opening.offset < cut ? opening.offset : opening.offset - cut)
    // Kept only where it already sits: an opening the clamp would shift no
    // longer fits its half and is deleted, never silently moved.
    const clamped = clampOpeningOffset(next, host, offset, opening.width)
    if (clamped !== offset) continue
    openings[opening.id] = { ...opening, wallId: host.id, offset }
  }
  return { ...next, openings }
}

// Two model positions closer than this are treated as the same junction, and
// a point this close to a wall's line sits on it. Well under the 10 cm wall
// thickness, and above the ~0.7 cm drift that integer rounding can introduce.
const JUNCTION_TOLERANCE = 1 // cm

function findPointNear(plan: Plan, x: number, y: number): string | null {
  let best: string | null = null
  let bestDistance = JUNCTION_TOLERANCE
  for (const point of Object.values(plan.points)) {
    const d = distance(point.x, point.y, x, y)
    if (d <= bestDistance) {
      bestDistance = d
      best = point.id
    }
  }
  return best
}

// Resolves a drawing click to a point id, splitting the host wall when the
// snap targets a wall body. The host is looked up at resolution time (not
// trusted from the snap) because an earlier split may have replaced it.
export function commitPoint(plan: Plan, snap: Snap): [Plan, string] {
  if (snap.pointId) return [plan, snap.pointId]
  const x = Math.round(snap.x)
  const y = Math.round(snap.y)
  if (snap.kind === 'wall') {
    const host = nearestWall(plan, x, y, JUNCTION_TOLERANCE + 1)
    const existing = findPointNear(plan, x, y)
    // A reused point still splits the host (no-op when it is one of its
    // ends): the contact must be a junction, not a dangling overlap.
    if (existing) return [host ? splitWall(plan, host.wall.id, existing) : plan, existing]
    const [next, id] = ensurePoint(plan, snap)
    return [host ? splitWall(next, host.wall.id, id) : next, id]
  }
  return ensurePoint(plan, snap)
}

// Commits one drawn wall with planar insertion (ADR 0002): ends snapped onto
// a wall body split it (T junction), and a crossed wall is split at the
// intersection along with the new wall itself (X junction). Returns the
// resolved end point id so the drawing chain can continue from it.
export function commitWall(
  plan: Plan,
  start: Snap,
  end: Snap,
  thickness: number = WALL_THICKNESS,
): [Plan, string] {
  let next = plan
  let startId: string
  let endId: string
  ;[next, startId] = commitPoint(next, start)
  ;[next, endId] = commitPoint(next, end)
  if (startId === endId) return [plan, startId]

  const a = next.points[startId]
  const b = next.points[endId]
  const length = distance(a.x, a.y, b.x, b.y)
  const along = (x: number, y: number) => ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / length

  // Cut the new wall at every junction it creates. Walls are snapshotted
  // here: two straight walls cross at most once, so the halves a split
  // produces never need re-examination.
  const cuts = new Map<string, number>() // pointId → distance along a→b

  // existing points lying on the new wall's interior (reversed T junction)
  for (const point of Object.values(next.points)) {
    if (point.id === startId || point.id === endId) continue
    const t = along(point.x, point.y)
    if (t < JUNCTION_TOLERANCE || t > length - JUNCTION_TOLERANCE) continue
    const off = Math.abs((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / length
    if (off <= JUNCTION_TOLERANCE) cuts.set(point.id, t)
  }

  for (const wall of Object.values(next.walls)) {
    const [c, d] = wallPoints(next, wall)
    const crossing = segmentIntersection(a, b, c, d)
    if (!crossing) continue
    const x = Math.round(crossing.x)
    const y = Math.round(crossing.y)
    let pointId = findPointNear(next, x, y)
    if (!pointId) {
      pointId = newId()
      next = { ...next, points: { ...next.points, [pointId]: { id: pointId, x, y } } }
    }
    next = splitWall(next, wall.id, pointId)
    if (pointId !== startId && pointId !== endId) cuts.set(pointId, along(x, y))
  }

  const ordered = [...cuts.entries()].sort(([, t1], [, t2]) => t1 - t2).map(([id]) => id)
  const stops = [startId, ...ordered, endId]
  for (let i = 0; i < stops.length - 1; i++) next = addWall(next, stops[i], stops[i + 1], thickness)
  return [next, endId]
}

// Deleting a wall deletes its openings (spec §2) and any point no longer used by a wall.
export function deleteWall(plan: Plan, id: string): Plan {
  const wall = plan.walls[id]
  if (!wall) return plan
  const walls = { ...plan.walls }
  delete walls[id]

  const openings: Record<string, Opening> = {}
  for (const opening of Object.values(plan.openings)) {
    if (opening.wallId !== id) openings[opening.id] = opening
  }

  const usedPointIds = new Set<string>()
  for (const w of Object.values(walls)) {
    usedPointIds.add(w.startPointId)
    usedPointIds.add(w.endPointId)
  }
  const points: Plan['points'] = {}
  for (const point of Object.values(plan.points)) {
    if (usedPointIds.has(point.id)) points[point.id] = point
  }

  return { ...plan, points, walls, openings }
}

// The label's travel keeps one wall thickness of padding at each end, so the
// text never crowds a corner; a wall too short for that pins it to the middle.
// The bound applies on write only — a stored placement that falls outside it
// after the wall is shortened renders as stored. Ratio rounded to 3 decimals:
// sub-centimeter on any wall a dimension shows on, without dragging float
// noise into the persisted plan.
export function setDimPlacement(plan: Plan, wallId: string, t: number, side: 1 | -1): Plan {
  const wall = plan.walls[wallId]
  if (!wall) return plan
  const length = wallLength(plan, wall)
  const pad = length > 0 ? Math.min(0.5, wall.thickness / length) : 0.5
  const clamped = Math.max(pad, Math.min(1 - pad, t))
  const dimPlacement = { t: Math.round(clamped * 1000) / 1000, side }
  return { ...plan, walls: { ...plan.walls, [wallId]: { ...wall, dimPlacement } } }
}

export function setWallThickness(plan: Plan, id: string, thickness: number): Plan {
  const wall = plan.walls[id]
  if (!wall || wall.thickness === thickness) return plan
  return { ...plan, walls: { ...plan.walls, [id]: { ...wall, thickness } } }
}

export function deleteOpening(plan: Plan, id: string): Plan {
  if (!plan.openings[id]) return plan
  const openings = { ...plan.openings }
  delete openings[id]
  return { ...plan, openings }
}

// ---------- openings ----------

const OPENING_END_MARGIN = 5 // cm kept between an opening and the wall ends

// Clamps a desired center offset so the opening (plus margin) fits the wall.
// Returns null when the wall is too short to host it at all.
export function clampOpeningOffset(plan: Plan, wall: Wall, offset: number, width: number): number | null {
  const length = wallLength(plan, wall)
  if (length < width + 2 * OPENING_END_MARGIN) return null
  const margin = width / 2 + OPENING_END_MARGIN
  return Math.round(Math.max(margin, Math.min(length - margin, offset)))
}

// Returns the new plan and the placed opening's id (null when placement is
// refused), so callers can select the opening they just placed. `init` lets
// the caller apply its Tool defaults; anything omitted falls back to the
// built-in values.
export function placeOpening(
  plan: Plan,
  wallId: string,
  type: 'door' | 'window',
  offset: number,
  init?: { width?: number; hingeSide?: 'start' | 'end'; swing?: 'in' | 'out' },
): [Plan, string | null] {
  const wall = plan.walls[wallId]
  if (!wall) return [plan, null]
  const width = init?.width ?? defaultOpeningWidth(type)
  const clamped = clampOpeningOffset(plan, wall, offset, width)
  if (clamped === null) return [plan, null]
  const id = newId()
  const opening: Opening =
    type === 'door'
      ? {
          id,
          wallId,
          type,
          offset: clamped,
          width,
          hingeSide: init?.hingeSide ?? 'start',
          swing: init?.swing ?? 'in',
        }
      : { id, wallId, type, offset: clamped, width }
  return [{ ...plan, openings: { ...plan.openings, [id]: opening } }, id]
}

export function moveOpening(plan: Plan, id: string, offset: number): Plan {
  const opening = plan.openings[id]
  if (!opening) return plan
  const clamped = clampOpeningOffset(plan, plan.walls[opening.wallId], offset, opening.width)
  if (clamped === null) return plan
  return { ...plan, openings: { ...plan.openings, [id]: { ...opening, offset: clamped } } }
}

export function setOpeningWidth(plan: Plan, id: string, width: number): Plan {
  const opening = plan.openings[id]
  if (!opening) return plan
  const clamped = clampOpeningOffset(plan, plan.walls[opening.wallId], opening.offset, width)
  if (clamped === null) return plan
  return { ...plan, openings: { ...plan.openings, [id]: { ...opening, width, offset: clamped } } }
}

export function toggleHingeSide(plan: Plan, id: string): Plan {
  const opening = plan.openings[id]
  if (opening?.type !== 'door') return plan
  const hingeSide = opening.hingeSide === 'start' ? 'end' : 'start'
  return { ...plan, openings: { ...plan.openings, [id]: { ...opening, hingeSide } } }
}

export function toggleSwing(plan: Plan, id: string): Plan {
  const opening = plan.openings[id]
  if (opening?.type !== 'door') return plan
  const swing = opening.swing === 'in' ? 'out' : 'in'
  return { ...plan, openings: { ...plan.openings, [id]: { ...opening, swing } } }
}

// ---------- room labels ----------

export function addRoomLabel(plan: Plan, name: string, x: number, y: number): [Plan, string] {
  const id = newId()
  const label = { id, name, x: Math.round(x), y: Math.round(y) }
  return [{ ...plan, roomLabels: { ...plan.roomLabels, [id]: label } }, id]
}

export function renameRoomLabel(plan: Plan, id: string, name: string): Plan {
  const label = plan.roomLabels[id]
  if (!label) return plan
  return { ...plan, roomLabels: { ...plan.roomLabels, [id]: { ...label, name } } }
}

// Moving a label is the user's placement gesture: it gives the label its
// custom placement (CONTEXT.md: Room label).
export function moveRoomLabel(plan: Plan, id: string, x: number, y: number): Plan {
  const label = plan.roomLabels[id]
  if (!label) return plan
  return {
    ...plan,
    roomLabels: {
      ...plan.roomLabels,
      [id]: { ...label, x: Math.round(x), y: Math.round(y), placed: true },
    },
  }
}

// Rigid-move companion of moveRoomLabel: shifts the label without touching
// its placement state — the room is carrying its label along, this is not a
// user placement gesture.
export function translateRoomLabel(plan: Plan, id: string, dx: number, dy: number): Plan {
  const label = plan.roomLabels[id]
  if (!label) return plan
  return {
    ...plan,
    roomLabels: {
      ...plan.roomLabels,
      [id]: { ...label, x: Math.round(label.x + dx), y: Math.round(label.y + dy) },
    },
  }
}

export function deleteRoomLabel(plan: Plan, id: string): Plan {
  if (!plan.roomLabels[id]) return plan
  const roomLabels = { ...plan.roomLabels }
  delete roomLabels[id]
  return { ...plan, roomLabels }
}
