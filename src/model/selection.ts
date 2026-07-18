import type { Vec } from './geometry'
import { wallPoints } from './geometry'
import { openingPlacement } from './openings'
import { deleteOpening, deleteWall, setPoints } from './operations'
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

// Group delete. Walls cascade their openings and orphan points (deleteWall);
// refs to elements already gone are no-ops.
export function deleteElements(plan: Plan, refs: ElementRef[]): Plan {
  let next = plan
  for (const ref of refs) {
    if (ref.type === 'wall') next = deleteWall(next, ref.id)
    else next = deleteOpening(next, ref.id)
  }
  return next
}

export interface SelectionBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

// Bounding box of the selection's own positions — wall endpoints, opening
// centers. Null when no ref resolves to a live element.
export function selectionBounds(plan: Plan, refs: ElementRef[]): SelectionBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const extend = (x: number, y: number) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const ref of refs) {
    if (ref.type === 'wall') {
      const wall = plan.walls[ref.id]
      if (wall) for (const p of wallPoints(plan, wall)) extend(p.x, p.y)
    } else {
      const opening = plan.openings[ref.id]
      const placement = opening ? openingPlacement(plan, opening) : null
      if (placement) extend(placement.cx, placement.cy)
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY }
}

// Group move: translate the union of the selected walls' points. Openings
// follow their wall (their offset is wall-relative) and stay put when their
// wall is not selected — only elements with a position of their own translate.
// Unselected walls attached to a moved point stretch.
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
  return Object.keys(updates).length > 0 ? setPoints(plan, updates) : plan
}
