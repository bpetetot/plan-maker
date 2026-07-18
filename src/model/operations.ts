import { nanoid } from 'nanoid'
import { wallLength } from './geometry'
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

export function addWall(plan: Plan, startPointId: string, endPointId: string): Plan {
  if (startPointId === endPointId) return plan
  for (const wall of Object.values(plan.walls)) {
    const same = wall.startPointId === startPointId && wall.endPointId === endPointId
    const reversed = wall.startPointId === endPointId && wall.endPointId === startPointId
    if (same || reversed) return plan
  }
  const id = newId()
  const wall: Wall = { id, startPointId, endPointId, thickness: WALL_THICKNESS }
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
// refused), so callers can select the opening they just placed.
export function placeOpening(
  plan: Plan,
  wallId: string,
  type: 'door' | 'window',
  offset: number,
): [Plan, string | null] {
  const wall = plan.walls[wallId]
  if (!wall) return [plan, null]
  const width = defaultOpeningWidth(type)
  const clamped = clampOpeningOffset(plan, wall, offset, width)
  if (clamped === null) return [plan, null]
  const id = newId()
  const opening: Opening =
    type === 'door'
      ? { id, wallId, type, offset: clamped, width, hingeSide: 'start', swing: 'in' }
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

export function addRoomLabel(plan: Plan, name: string, x: number, y: number): Plan {
  const id = newId()
  const label = { id, name, x: Math.round(x), y: Math.round(y) }
  return { ...plan, roomLabels: { ...plan.roomLabels, [id]: label } }
}

export function renameRoomLabel(plan: Plan, id: string, name: string): Plan {
  const label = plan.roomLabels[id]
  if (!label) return plan
  return { ...plan, roomLabels: { ...plan.roomLabels, [id]: { ...label, name } } }
}

export function moveRoomLabel(plan: Plan, id: string, x: number, y: number): Plan {
  const label = plan.roomLabels[id]
  if (!label) return plan
  return {
    ...plan,
    roomLabels: { ...plan.roomLabels, [id]: { ...label, x: Math.round(x), y: Math.round(y) } },
  }
}

export function deleteRoomLabel(plan: Plan, id: string): Plan {
  if (!plan.roomLabels[id]) return plan
  const roomLabels = { ...plan.roomLabels }
  delete roomLabels[id]
  return { ...plan, roomLabels }
}
