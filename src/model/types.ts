// Domain model per spec §2 — shared-point planar graph, integer centimeters.

export type Cm = number // integer centimeters

export interface Point {
  id: string
  x: Cm
  y: Cm
}

// Placement of a wall's dimension label. Absent = default rendering (midpoint,
// upper side). `t` is a ratio of the wall's length — not cm — so the label
// keeps its relative position when the wall is stretched (see ADR 0001).
export interface DimPlacement {
  t: number // 0..1 along the wall from its start point
  side: 1 | -1 // sign along the wall's left normal (start→end rotated +90°)
}

export interface Wall {
  id: string
  startPointId: string
  endPointId: string
  thickness: Cm // default 10
  dimPlacement?: DimPlacement
}

export interface BaseOpening {
  id: string
  wallId: string
  // absolute distance in cm from the wall's start point to the opening's center
  offset: Cm
  width: Cm
}

export interface Door extends BaseOpening {
  type: 'door'
  hingeSide: 'start' | 'end'
  swing: 'in' | 'out'
}

export interface Window extends BaseOpening {
  type: 'window'
}

export type Opening = Door | Window

// A room's name and area render as one text block (CONTEXT.md: Room label).
// `placed` absent = default placement: the block sits at the room's live
// centroid and (x, y) is only the association anchor, maintained inside the
// room. `placed: true` = custom placement (the user dragged the block):
// (x, y) is where the block renders.
export interface RoomLabel {
  id: string
  name: string
  x: Cm
  y: Cm
  placed?: true
}

export interface Plan {
  points: Record<string, Point>
  walls: Record<string, Wall>
  openings: Record<string, Opening>
  roomLabels: Record<string, RoomLabel>
}

export const WALL_THICKNESS: Cm = 10
export const GRID: Cm = 10
export const DOOR_WIDTH: Cm = 90
export const WINDOW_WIDTH: Cm = 120
export const OPENING_WIDTHS: Cm[] = [60, 70, 80, 90, 100, 120, 140, 160]
// partition wall → thick exterior wall
export const WALL_THICKNESSES: Cm[] = [5, 10, 15, 20, 25, 30, 40]

export const defaultOpeningWidth = (type: Opening['type']): Cm =>
  type === 'door' ? DOOR_WIDTH : WINDOW_WIDTH

export function emptyPlan(): Plan {
  return { points: {}, walls: {}, openings: {}, roomLabels: {} }
}

export function isPlanEmpty(plan: Plan): boolean {
  return (
    Object.keys(plan.points).length === 0 &&
    Object.keys(plan.walls).length === 0 &&
    Object.keys(plan.openings).length === 0 &&
    Object.keys(plan.roomLabels).length === 0
  )
}
