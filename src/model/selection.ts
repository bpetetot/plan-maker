import type { Vec } from './geometry'
import { wallPoints } from './geometry'
import { openingPlacement } from './openings'
import { deleteOpening, deleteWall, setPoints, translateRoomLabel } from './operations'
import type { Room } from './rooms'
import { detectRooms, reconcileRoomLabels, roomAt, roomWallIds } from './rooms'
import type { Plan } from './types'

// Multi-selection over plan elements: a selection is a list of refs to walls
// and openings. Room labels are never selected — they are manipulated directly
// in the editor (CONTEXT.md: Selection). It lives in the editor (never in the
// plan) and supports exactly two group operations — delete and translate.

export interface ElementRef {
  type: 'wall' | 'opening'
  id: string
}

export const sameRef = (a: ElementRef, b: ElementRef) => a.type === b.type && a.id === b.id

// Single string encoding of a ref's identity, for Set/Map membership.
export const refKey = (ref: ElementRef) => `${ref.type}:${ref.id}`

export const isSelected = (selection: ElementRef[], ref: ElementRef) => selection.some((r) => sameRef(r, ref))

// Shift+click semantics: add the ref when absent, remove it when present.
export function toggleRef(selection: ElementRef[], ref: ElementRef): ElementRef[] {
  return isSelected(selection, ref) ? selection.filter((r) => !sameRef(r, ref)) : [...selection, ref]
}

// Marquee capture rule: containment. An element is selected only when it
// is entirely inside the rectangle (walls by both endpoints, openings by their
// span on the wall). Wall thickness is ignored.
export function elementsInRect(plan: Plan, a: Vec, b: Vec): ElementRef[] {
  const minX = Math.min(a.x, b.x)
  const maxX = Math.max(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxY = Math.max(a.y, b.y)
  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY

  const refs: ElementRef[] = []
  for (const wall of Object.values(plan.walls)) {
    const [s, e] = wallPoints(plan, wall)
    if (inside(s.x, s.y) && inside(e.x, e.y)) refs.push({ type: 'wall', id: wall.id })
  }
  for (const opening of Object.values(plan.openings)) {
    const wall = plan.walls[opening.wallId]
    const placement = openingPlacement(plan, opening)
    if (!wall || !placement) continue
    const angle = (placement.angleDeg * Math.PI) / 180
    const hx = (Math.cos(angle) * opening.width) / 2
    const hy = (Math.sin(angle) * opening.width) / 2
    if (inside(placement.cx - hx, placement.cy - hy) && inside(placement.cx + hx, placement.cy + hy)) {
      refs.push({ type: 'opening', id: opening.id })
    }
  }
  return refs
}

// Group delete. Walls cascade their openings and orphan points (deleteWall)
// and room labels left without a room (reconcileRoomLabels); refs to
// elements already gone are no-ops.
export function deleteElements(plan: Plan, refs: ElementRef[]): Plan {
  let next = plan
  for (const ref of refs) {
    if (ref.type === 'wall') next = deleteWall(next, ref.id)
    else next = deleteOpening(next, ref.id)
  }
  return reconcileRoomLabels(plan, next)
}

// Group move: translate the union of the selected walls' points. Openings
// follow their wall (their offset is wall-relative) and stay put when their
// wall is not selected — only elements with a position of their own translate.
// Unselected walls attached to a moved point stretch. A room whose boundary
// walls are all selected translates rigidly: its label moves with it,
// keeping its position relative to the room (CONTEXT.md: Room label).
export function translateElements(plan: Plan, refs: ElementRef[], dx: number, dy: number): Plan {
  if (dx === 0 && dy === 0) return plan
  const updates: Record<string, Vec> = {}
  for (const ref of refs) {
    if (ref.type !== 'wall') continue
    const wall = plan.walls[ref.id]
    if (!wall) continue
    for (const point of wallPoints(plan, wall)) {
      updates[point.id] = { x: point.x + dx, y: point.y + dy }
    }
  }
  if (Object.keys(updates).length === 0) return plan
  let next = setPoints(plan, updates)

  const labels = Object.values(plan.roomLabels)
  if (labels.length > 0) {
    const selected = new Set(refs.filter((r) => r.type === 'wall').map((r) => r.id))
    const rigid = (room: Room) => {
      const wallIds = roomWallIds(plan, room)
      return wallIds !== null && wallIds.every((id) => selected.has(id))
    }
    const rooms = detectRooms(plan)
    for (const label of labels) {
      const room = roomAt(rooms, label.x, label.y)
      if (room && rigid(room)) next = translateRoomLabel(next, label.id, dx, dy)
    }
  }
  return next
}
