import { nanoid } from 'nanoid'
import type { Vec } from './geometry'
import { distance, nearestWall, segmentIntersection, wallLength, wallPoints } from './geometry'
import { clampCenter, openingPlacement, openingRail } from './openings'
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
  // Two passes: every opening is first rebased onto its half, so the second
  // pass reads the neighbours where they will actually be. Clamping against
  // half-migrated openings would have them bound each other from the offsets
  // they held on the wall that no longer exists.
  const rebased: Record<string, Opening> = {}
  const moved: string[] = []
  for (const opening of Object.values(plan.openings)) {
    if (opening.wallId !== wallId) {
      rebased[opening.id] = opening
      continue
    }
    if (opening.offset - opening.width / 2 < cut && opening.offset + opening.width / 2 > cut) continue
    const host = opening.offset < cut ? startHalf : endHalf
    const offset = Math.round(opening.offset < cut ? opening.offset : opening.offset - cut)
    rebased[opening.id] = { ...opening, wallId: host.id, offset }
    moved.push(opening.id)
  }
  const staged = { ...next, openings: rebased }
  const openings = { ...rebased }
  for (const id of moved) {
    const opening = rebased[id]
    // Kept only where it already sits: an opening the clamp would shift no
    // longer fits its half and is deleted, never silently moved.
    const host = staged.walls[opening.wallId]
    if (clampOpeningOffset(staged, host, opening.offset, opening.width, opening) !== opening.offset) {
      delete openings[id]
    }
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

// The shared Point at (x, y), reusing one within the junction tolerance
// before minting a new one.
function ensurePointAt(plan: Plan, x: number, y: number): [Plan, string] {
  const existing = findPointNear(plan, x, y)
  if (existing) return [plan, existing]
  const id = newId()
  return [{ ...plan, points: { ...plan.points, [id]: { id, x, y } } }, id]
}

// Distance along a→b of p's projection when p lies on the segment's open
// interior — within the junction tolerance of the axis, clear of both ends —
// null otherwise.
function interiorProjection(a: Vec, b: Vec, p: Vec): number | null {
  const length = distance(a.x, a.y, b.x, b.y)
  if (length < 1) return null
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length
  if (t < JUNCTION_TOLERANCE || t > length - JUNCTION_TOLERANCE) return null
  const off = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / length
  if (off > JUNCTION_TOLERANCE) return null
  return t
}

// Resolves a drawing click to a point id, splitting the host wall when the
// snap targets a wall body. The host is looked up at resolution time (not
// trusted from the snap) because an earlier split may have replaced it.
// Whatever the snap kind, a position landing on an existing point reuses it:
// two Points never coincide (ADR 0003).
export function commitPoint(plan: Plan, snap: Snap): [Plan, string] {
  if (snap.pointId) return [plan, snap.pointId]
  const x = Math.round(snap.x)
  const y = Math.round(snap.y)
  const existing = findPointNear(plan, x, y)
  if (snap.kind === 'wall') {
    const host = nearestWall(plan, x, y, JUNCTION_TOLERANCE + 1)
    // A reused point still splits the host (no-op when it is one of its
    // ends): the contact must be a junction, not a dangling overlap.
    if (existing) return [host ? splitWall(plan, host.wall.id, existing) : plan, existing]
    const [next, id] = ensurePoint(plan, snap)
    return [host ? splitWall(next, host.wall.id, id) : next, id]
  }
  if (existing) return [plan, existing]
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
    const t = interiorProjection(a, b, point)
    if (t !== null) cuts.set(point.id, t)
  }

  for (const wall of Object.values(next.walls)) {
    const [c, d] = wallPoints(next, wall)
    const crossing = segmentIntersection(a, b, c, d)
    if (!crossing) continue
    const x = Math.round(crossing.x)
    const y = Math.round(crossing.y)
    let pointId: string
    ;[next, pointId] = ensurePointAt(next, x, y)
    next = splitWall(next, wall.id, pointId)
    if (pointId !== startId && pointId !== endId) cuts.set(pointId, along(x, y))
  }

  const ordered = [...cuts.entries()].sort(([, t1], [, t2]) => t1 - t2).map(([id]) => id)
  const stops = [startId, ...ordered, endId]
  for (let i = 0; i < stops.length - 1; i++) next = addWall(next, stops[i], stops[i + 1], thickness)
  return [next, endId]
}

// Two walls spanning the same endpoint pair collapse into the first-seen one
// (ADR 0003); the removed twin's openings transpose onto the survivor — the
// geometry is the same; when the twins run in opposite directions the offset
// mirrors and a door's wall-relative hinge and swing flip with the frame,
// keeping the door physically identical.
function dedupeTwinWalls(plan: Plan): Plan {
  const walls: Record<string, Wall> = {}
  const twinOf = new Map<string, Wall>() // removed twin id → surviving wall
  const byEndpoints = new Map<string, Wall>() // unordered endpoint pair → wall
  for (const wall of Object.values(plan.walls)) {
    const pair = JSON.stringify([wall.startPointId, wall.endPointId].sort())
    const twin = byEndpoints.get(pair)
    if (twin) {
      twinOf.set(wall.id, twin)
      continue
    }
    byEndpoints.set(pair, wall)
    walls[wall.id] = wall
  }
  if (twinOf.size === 0) return plan

  const next = { ...plan, walls }
  const openings: Record<string, Opening> = {}
  for (const opening of Object.values(plan.openings)) {
    const host = twinOf.get(opening.wallId)
    if (!host) {
      openings[opening.id] = opening
      continue
    }
    const removed = plan.walls[opening.wallId]
    const reversed = removed.startPointId !== host.startPointId
    const offset = reversed ? Math.round(wallLength(next, host) - opening.offset) : opening.offset
    let moved: Opening = { ...opening, wallId: host.id, offset }
    if (reversed && moved.type === 'door') {
      moved = {
        ...moved,
        hingeSide: moved.hingeSide === 'start' ? 'end' : 'start',
        swing: moved.swing === 'in' ? 'out' : 'in',
      }
    }
    openings[opening.id] = moved
  }
  return { ...next, openings }
}

// Merges the absorbed point into the survivor: walls are rewired to the
// survivor; a wall whose two ends collapse onto it is deleted with its
// openings; a wall made identical to another dedupes per the twin rule above.
function mergePoints(plan: Plan, survivorId: string, absorbedId: string): Plan {
  const points = { ...plan.points }
  delete points[absorbedId]

  const walls: Record<string, Wall> = {}
  for (const wall of Object.values(plan.walls)) {
    const startPointId = wall.startPointId === absorbedId ? survivorId : wall.startPointId
    const endPointId = wall.endPointId === absorbedId ? survivorId : wall.endPointId
    if (startPointId === endPointId) continue // degenerate: both ends merged
    walls[wall.id] = { ...wall, startPointId, endPointId }
  }

  const openings: Record<string, Opening> = {}
  for (const opening of Object.values(plan.openings)) {
    // an opening whose wall degenerated goes with it
    if (walls[opening.wallId]) openings[opening.id] = opening
  }
  return dedupeTwinWalls({ ...plan, points, walls, openings })
}

// Enforces the invariant "two Points never coincide" (ADR 0003): every pair
// of points within the junction tolerance is merged into one. When `moving`
// lists the points a gesture displaced, a stationary point survives over a
// moved one; otherwise the first-seen point survives. Returns the same plan
// when nothing coincides.
export function mergeCoincidentPoints(plan: Plan, moving?: Set<string>): Plan {
  let next = plan
  for (let merged = true; merged;) {
    merged = false
    const points = Object.values(next.points)
    outer: for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i]
        const b = points[j]
        if (distance(a.x, a.y, b.x, b.y) > JUNCTION_TOLERANCE) continue
        const aMoved = moving ? moving.has(a.id) && !moving.has(b.id) : false
        const [survivor, absorbed] = aMoved ? [b, a] : [a, b]
        next = mergePoints(next, survivor.id, absorbed.id)
        merged = true
        break outer
      }
    }
  }
  return next
}

// Enforces the invariant "walls only meet at shared Points" (ADR 0002) on an
// already-built plan — the drag-end counterpart of commitWall's planar
// insertion: a point lying on a wall's body splits that wall (T junction),
// and two crossing walls are both split at their intersection (X junction).
// Runs to a fixpoint; returns the same plan when nothing violates the
// invariant.
export function planarize(plan: Plan): Plan {
  let next = plan
  for (let changed = true; changed;) {
    changed = false
    // splits along a collinear overlap leave two walls on the same pair
    next = dedupeTwinWalls(next)
    outer: for (const point of Object.values(next.points)) {
      for (const wall of Object.values(next.walls)) {
        if (wall.startPointId === point.id || wall.endPointId === point.id) continue
        const [a, b] = wallPoints(next, wall)
        if (interiorProjection(a, b, point) === null) continue
        next = splitWall(next, wall.id, point.id)
        changed = true
        break outer
      }
    }
    if (changed) continue
    // T junctions first: once no point sits on a wall body, remaining
    // contacts are proper crossings, cut like commitWall's X junctions.
    const walls = Object.values(next.walls)
    crossings: for (let i = 0; i < walls.length; i++) {
      for (let j = i + 1; j < walls.length; j++) {
        const [a, b] = wallPoints(next, walls[i])
        const [c, d] = wallPoints(next, walls[j])
        const crossing = segmentIntersection(a, b, c, d)
        if (!crossing) continue
        let pointId: string
        ;[next, pointId] = ensurePointAt(next, Math.round(crossing.x), Math.round(crossing.y))
        next = splitWall(next, walls[i].id, pointId)
        next = splitWall(next, walls[j].id, pointId)
        changed = true
        break crossings
      }
    }
  }
  return next
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

// The label's travel is bounded by the caller — the editor passes the Rail
// (the span the text's center may occupy, as ratios along the axis), derived
// from the rendered silhouette and the arrowheads so the text never rides a
// head. An empty travel (min > max) pins the text to the travel's middle.
// The bound applies on write only — a stored placement that falls outside it
// after the wall is shortened renders as stored. Ratio rounded to 3 decimals:
// sub-centimeter on any wall a dimension shows on, without dragging float
// noise into the persisted plan.
export function setDimPlacement(
  plan: Plan,
  wallId: string,
  t: number,
  side: 1 | -1,
  travel: { min: number; max: number } = { min: 0, max: 1 },
): Plan {
  const wall = plan.walls[wallId]
  if (!wall) return plan
  const clamped =
    travel.min > travel.max ? (travel.min + travel.max) / 2 : Math.max(travel.min, Math.min(travel.max, t))
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

// Clamps a desired center offset onto the opening's Rail, so it comes to rest
// against the first thing that stops it — a mitered corner, a free end, or a
// neighbouring opening — and never past it. Returns null when the rail is
// narrower than the opening, the one case a gesture is refused outright.
// `opening` is the one being moved or widened: it bounds nothing itself, and
// its drawn position is what sides its neighbours. Omit it when placing a new
// one, where the desired offset plays that part.
export function clampOpeningOffset(
  plan: Plan,
  wall: Wall | undefined,
  offset: number,
  width: number,
  opening?: Opening,
): number | null {
  if (!wall) return null
  const reference = (opening && openingPlacement(plan, opening)?.offset) ?? offset
  const rail = openingRail(plan, wall, reference, opening?.id)
  if (rail.to - rail.from < width) return null
  // Offsets are whole centimetres, but a mitered rail end is not: rounding
  // comes first and the rail has the last word, so an opening pushed flush
  // lands exactly on its bound and its measure reads exactly zero.
  return clampCenter(rail, width, Math.round(clampCenter(rail, width, offset)))
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
  const clamped = clampOpeningOffset(plan, plan.walls[opening.wallId], offset, opening.width, opening)
  if (clamped === null) return plan
  return { ...plan, openings: { ...plan.openings, [id]: { ...opening, offset: clamped } } }
}

export function setOpeningWidth(plan: Plan, id: string, width: number): Plan {
  const opening = plan.openings[id]
  if (!opening) return plan
  const clamped = clampOpeningOffset(plan, plan.walls[opening.wallId], opening.offset, width, opening)
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
